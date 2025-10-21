import fetch, { type RequestInit, type Response } from 'node-fetch';

export type ClarityAggregateMetric =
  | 'rage_clicks'
  | 'dead_clicks'
  | 'excessive_scrolling'
  | 'scroll_depth'
  | 'quick_backs'
  | 'clickbacks'
  | 'exits';

export interface ClarityClientConfig {
  projectId: string;
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: ClarityFetchImplementation;
}

export type ClarityFetchImplementation = (
  url: string,
  init?: RequestInit
) => Promise<Response>;

export interface ClarityAggregateFilter {
  field: string;
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains';
  value: string | number | boolean;
}

export interface ClarityAggregateParams {
  from: string;
  to: string;
  dimensions?: string[];
  filters?: ClarityAggregateFilter[];
  limit?: number;
}

export interface ClarityAggregateSeriesPoint {
  timestamp: string;
  value: number;
}

export interface ClarityAggregateBreakdownEntry {
  dimension: string;
  value: string;
  metricValue: number;
}

export interface ClarityAggregateResponse {
  metric: ClarityAggregateMetric;
  total: number;
  series: ClarityAggregateSeriesPoint[];
  breakdown: ClarityAggregateBreakdownEntry[];
}

interface ClarityAggregateResponseRaw {
  metric: string;
  value: number;
  series?: Array<{
    date: string;
    value: number;
  }>;
  breakdown?: Array<{
    dimension: string;
    value: string;
    metricValue: number;
  }>;
}

export class ClarityClient {
  private readonly projectId: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: ClarityFetchImplementation;

  constructor(config: ClarityClientConfig) {
    if (!config.projectId) {
      throw new Error('Clarity project ID is required');
    }

    if (!config.apiKey) {
      throw new Error('Clarity API key is required');
    }

    this.projectId = config.projectId;
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? 'https://api.clarity.microsoft.com';
    this.timeoutMs = config.timeoutMs ?? 15000;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async getRageClicks(params: ClarityAggregateParams): Promise<ClarityAggregateResponse> {
    return this.getAggregate('rage_clicks', params);
  }

  async getScrollDepth(params: ClarityAggregateParams): Promise<ClarityAggregateResponse> {
    return this.getAggregate('scroll_depth', params);
  }

  async getExits(params: ClarityAggregateParams): Promise<ClarityAggregateResponse> {
    return this.getAggregate('exits', params);
  }

  async getDeadClicks(params: ClarityAggregateParams): Promise<ClarityAggregateResponse> {
    return this.getAggregate('dead_clicks', params);
  }

  async getExcessiveScrolling(
    params: ClarityAggregateParams
  ): Promise<ClarityAggregateResponse> {
    return this.getAggregate('excessive_scrolling', params);
  }

  async getQuickBacks(params: ClarityAggregateParams): Promise<ClarityAggregateResponse> {
    return this.getAggregate('quick_backs', params);
  }

  async getClickbacks(params: ClarityAggregateParams): Promise<ClarityAggregateResponse> {
    return this.getAggregate('clickbacks', params);
  }

  async getAggregate(
    metric: ClarityAggregateMetric,
    params: ClarityAggregateParams
  ): Promise<ClarityAggregateResponse> {
    const response = await this.post<ClarityAggregateResponseRaw>(
      `/projects/${this.projectId}/analysis/aggregate`,
      {
        metric,
        from: params.from,
        to: params.to,
        filters: params.filters ?? [],
        dimensions: params.dimensions ?? [],
        limit: params.limit,
      }
    );

    return {
      metric,
      total: response.value ?? 0,
      series: (response.series ?? []).map((point) => ({
        timestamp: point.date,
        value: point.value,
      })),
      breakdown: response.breakdown ?? [],
    };
  }

  private async post<T>(path: string, payload: Record<string, unknown>): Promise<T> {
    return this.request<T>(path, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timeout = global.setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          ...(init.headers ?? {}),
          authorization: `Bearer ${this.apiKey}`,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Clarity request failed with status ${response.status}: ${errorText}`
        );
      }

      const data = (await response.json()) as T;
      return data;
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        throw new Error('Clarity request timed out');
      }
      throw error;
    } finally {
      global.clearTimeout(timeout);
    }
  }
}
