import fetch from 'node-fetch';
import { ProjectDAL } from '@infra/dal';
import { decrypt } from '@infra/encryption';

const SHOPIFY_GRAPHQL_VERSION = process.env.SHOPIFY_ADMIN_API_VERSION || '2024-07';
const SHOPIFYQL_RUN_QUERY = `query RunShopifyQl($query: String!) {
  shopifyqlQuery(query: $query) {
    tableData {
      columnDefinitions {
        name
      }
      rowData {
        rowId
        data {
          columnId
          columnIndex
          value
          unformattedValue
          valueType
          column {
            name
          }
        }
      }
    }
    userErrors {
      field
      message
    }
  }
}`;

export interface ShopifyAnalyticsMetrics {
  visitorsLast30Days: number;
  purchaseRate: number;
  revenuePerSession: number;
  totals: {
    sessions: number;
    orders: number;
    sales: number;
  };
  raw: {
    sessions: Record<string, number>;
    sales: Record<string, number>;
  };
}

type ShopifyFlagAwareProject = {
  isShopify: boolean;
  useShopify?: boolean | null;
};

function usesShopifyIntegration(project: ShopifyFlagAwareProject): boolean {
  if (typeof project.useShopify === 'boolean') {
    return project.useShopify;
  }

  return project.isShopify;
}

function createMockShopifyMetrics(): ShopifyAnalyticsMetrics {
  const emptySessions: Record<string, number> = {};
  const emptySales: Record<string, number> = {};

  return {
    visitorsLast30Days: 0,
    purchaseRate: 0,
    revenuePerSession: 0,
    totals: {
      sessions: 0,
      orders: 0,
      sales: 0,
    },
    raw: {
      sessions: emptySessions,
      sales: emptySales,
    },
  };
}

interface ShopifyQlTableData {
  columnDefinitions?: Array<{ name?: string | null } | null> | null;
  rowData?: Array<{
    data?: Array<{
      columnId?: string | null;
      columnIndex?: number | null;
      value?: unknown;
      unformattedValue?: unknown;
      column?: { name?: string | null } | null;
    } | null> | null;
  } | null> | null;
}

interface ShopifyQlResponse {
  data?: {
    shopifyqlQuery?: {
      tableData?: ShopifyQlTableData | null;
      userErrors?: Array<{ field?: string[] | null; message: string }> | null;
    } | null;
  };
  errors?: Array<{ message: string }>;
}

function parseNumeric(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string') {
    const numeric = parseFloat(value.replace(/,/g, ''));
    return Number.isFinite(numeric) ? numeric : null;
  }

  if (typeof value === 'object') {
    const amount = (value as { amount?: unknown }).amount;
    return parseNumeric(amount ?? null);
  }

  return null;
}

function extractMetricsFromTable(table?: ShopifyQlTableData | null): Record<string, number> {
  if (!table) {
    return {};
  }

  const columns = table.columnDefinitions?.map(column => column?.name ?? undefined) ?? [];
  const row = table.rowData?.[0];

  if (!row || !row.data) {
    return {};
  }

  const metrics: Record<string, number> = {};

  for (const cell of row.data) {
    if (!cell) {
      continue;
    }

    const columnName =
      cell.columnId ??
      cell.column?.name ??
      (cell.columnIndex !== null && cell.columnIndex !== undefined
        ? columns[cell.columnIndex] ?? undefined
        : undefined);

    if (!columnName) {
      continue;
    }

    const numericValue = parseNumeric(cell.unformattedValue ?? cell.value);

    if (numericValue === null) {
      continue;
    }

    metrics[columnName] = numericValue;
  }

  return metrics;
}

async function executeShopifyQlQuery({
  shopDomain,
  accessToken,
  query,
}: {
  shopDomain: string;
  accessToken: string;
  query: string;
}): Promise<Record<string, number>> {
  const response = await fetch(`https://${shopDomain}/admin/api/${SHOPIFY_GRAPHQL_VERSION}/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': accessToken,
    },
    body: JSON.stringify({
      query: SHOPIFYQL_RUN_QUERY,
      variables: { query },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Shopify GraphQL request failed: ${response.status} ${body}`);
  }

  const json = (await response.json()) as ShopifyQlResponse;

  if (json.errors?.length) {
    throw new Error(`Shopify GraphQL error: ${json.errors.map(error => error.message).join('; ')}`);
  }

  const result = json.data?.shopifyqlQuery;

  if (!result) {
    throw new Error('Shopify GraphQL response missing shopifyqlQuery data');
  }

  if (result.userErrors?.length) {
    throw new Error(`ShopifyQL query error: ${result.userErrors.map(error => error.message).join('; ')}`);
  }

  return extractMetricsFromTable(result.tableData);
}

function normalizeRate(value: number | undefined): number {
  if (value === undefined || Number.isNaN(value)) {
    return 0;
  }

  if (value > 1) {
    return value / 100;
  }

  return value;
}

export async function getShopifyAnalyticsMetrics(projectId: string): Promise<ShopifyAnalyticsMetrics> {
  const project = await ProjectDAL.getProjectById(projectId);

  if (!project) {
    throw new Error('Project not found');
  }

  if (!usesShopifyIntegration(project)) {
    return createMockShopifyMetrics();
  }

  if (!project.accessTokenEnc) {
    throw new Error('Project is missing Shopify access token');
  }

  if (!project.shopDomain) {
    throw new Error('Project is missing Shopify shop domain');
  }

  const accessToken = decrypt(project.accessTokenEnc);

  const sessionsQuery = `FROM sessions OVER LAST 30 DAYS SHOW total_sessions`;
  const salesQuery = `FROM sales OVER LAST 30 DAYS SHOW total_orders, total_sales, conversion_rate, sales_per_session`;

  const [sessionsMetrics, salesMetrics] = await Promise.all([
    executeShopifyQlQuery({ shopDomain: project.shopDomain, accessToken, query: sessionsQuery }),
    executeShopifyQlQuery({ shopDomain: project.shopDomain, accessToken, query: salesQuery }),
  ]);

  const sessions =
    sessionsMetrics.total_sessions ??
    sessionsMetrics.sessions ??
    sessionsMetrics.total_visits ??
    sessionsMetrics.visits ??
    0;

  const orders =
    salesMetrics.total_orders ??
    salesMetrics.orders ??
    salesMetrics.purchases ??
    0;

  const totalSales =
    salesMetrics.total_sales ??
    salesMetrics.sales ??
    salesMetrics.revenue ??
    0;

  const purchaseRate = normalizeRate(salesMetrics.conversion_rate ?? (sessions > 0 ? orders / sessions : 0));
  const revenuePerSession =
    salesMetrics.sales_per_session !== undefined
      ? salesMetrics.sales_per_session
      : sessions > 0
        ? totalSales / sessions
        : 0;

  return {
    visitorsLast30Days: sessions,
    purchaseRate,
    revenuePerSession,
    totals: {
      sessions,
      orders,
      sales: totalSales,
    },
    raw: {
      sessions: sessionsMetrics,
      sales: salesMetrics,
    },
  };
}
