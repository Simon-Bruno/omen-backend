import assert from 'node:assert/strict';
import { Response, type RequestInit } from 'node-fetch';

import { ClarityClient } from '@infra/external/clarity/client';

async function main(): Promise<void> {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const sampleResponse = {
    metric: 'rage_clicks',
    value: 42,
    series: [
      { date: '2024-01-01', value: 10 },
      { date: '2024-01-02', value: 32 },
    ],
    breakdown: [
      { dimension: 'page', value: '/collections', metricValue: 20 },
      { dimension: 'page', value: '/products/alpha', metricValue: 22 },
    ],
  };

  const client = new ClarityClient({
    projectId: 'demo-project',
    apiKey: 'demo-key',
    timeoutMs: 1000,
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return new Response(JSON.stringify(sampleResponse), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  const response = await client.getRageClicks({
    from: '2024-01-01',
    to: '2024-01-31',
    dimensions: ['page'],
    filters: [
      {
        field: 'url',
        operator: 'contains',
        value: 'products',
      },
    ],
    limit: 5,
  });

  assert.equal(calls.length, 1, 'should issue a single HTTP call');
  const [call] = calls;
  assert.equal(
    call.url,
    'https://api.clarity.microsoft.com/projects/demo-project/analysis/aggregate'
  );

  const requestBody = JSON.parse((call.init?.body as string) ?? '{}');
  assert.deepStrictEqual(requestBody, {
    metric: 'rage_clicks',
    from: '2024-01-01',
    to: '2024-01-31',
    filters: [
      {
        field: 'url',
        operator: 'contains',
        value: 'products',
      },
    ],
    dimensions: ['page'],
    limit: 5,
  });

  const headers = call.init?.headers as Record<string, string> | undefined;
  assert.ok(headers, 'request should include headers');
  assert.equal(headers?.authorization, 'Bearer demo-key');
  assert.equal(headers?.['content-type'], 'application/json');

  assert.deepStrictEqual(response, {
    metric: 'rage_clicks',
    total: 42,
    series: [
      { timestamp: '2024-01-01', value: 10 },
      { timestamp: '2024-01-02', value: 32 },
    ],
    breakdown: [
      { dimension: 'page', value: '/collections', metricValue: 20 },
      { dimension: 'page', value: '/products/alpha', metricValue: 22 },
    ],
  });

  console.log('✅ ClarityClient mock integration behaved as expected');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
