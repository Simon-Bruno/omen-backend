// Service Configuration
export interface ServiceConfig {
  // openai: {
  //   apiKey: string;
  //   model?: string;
  //   temperature?: number;
  //   maxTokens?: number;
  // };
  google: {
    apiKey: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
  };
  crawler: {
    headless?: boolean;
    defaultViewport?: {
      width: number;
      height: number;
    };
    defaultTimeout?: number;
    defaultWaitFor?: number;
  };
  posthog: {
    apiKey: string;
    host: string;
    projectId: string;
    timeout?: number;
    retryAttempts?: number;
  };
  cloudflare: {
    accountId: string;
    apiToken: string;
    namespaceId: string;
  };
  sqs: {
    accessKeyId: string;
    secretAccessKey: string;
    region: string;
    queueUrl: string;
    batchSize?: number;
    pollInterval?: number;
    visibilityTimeout?: number;
  };
}

export function getServiceConfig(): ServiceConfig {
  return {
    // openai: {
    //   apiKey: process.env.OPENAI_API_KEY || '',
    //   model: process.env.OPENAI_MODEL || 'gpt-4o',
    //   temperature: parseFloat(process.env.OPENAI_TEMPERATURE || '0.3'),
    //   maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS || '2000'),
    // },
    google: {
      apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY || '',
      model: process.env.GOOGLE_MODEL || 'gemini-2.5-pro',
      temperature: parseFloat(process.env.GOOGLE_TEMPERATURE || '0.7'),
      maxTokens: parseInt(process.env.GOOGLE_MAX_TOKENS || '1000'),
    },
    crawler: {
      headless: process.env.CRAWLER_HEADLESS !== 'false',
      defaultViewport: {
        width: parseInt(process.env.CRAWLER_VIEWPORT_WIDTH || '1280'),
        height: parseInt(process.env.CRAWLER_VIEWPORT_HEIGHT || '720'),
      },
      defaultTimeout: parseInt(process.env.CRAWLER_TIMEOUT || '30000'),
      defaultWaitFor: parseInt(process.env.CRAWLER_WAIT_FOR || '2000'),
    },
    posthog: {
      apiKey: process.env.POSTHOG_API_KEY || '',
      host: process.env.POSTHOG_HOST || 'https://eu.posthog.com',
      projectId: process.env.POSTHOG_PROJECT_ID || '',
      timeout: parseInt(process.env.POSTHOG_TIMEOUT || '10000'),
      retryAttempts: parseInt(process.env.POSTHOG_RETRY_ATTEMPTS || '3'),
    },
    cloudflare: {
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID || '',
      apiToken: process.env.CLOUDFLARE_API_TOKEN || '',
      namespaceId: process.env.CLOUDFLARE_NAMESPACE_ID || '',
    },
    sqs: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
      region: process.env.AWS_REGION || 'eu-central-1',
      queueUrl: process.env.SQS_QUEUE_URL || '',
      batchSize: parseInt(process.env.SQS_BATCH_SIZE || '10'),
      pollInterval: parseInt(process.env.SQS_POLL_INTERVAL || '5000'),
      visibilityTimeout: parseInt(process.env.SQS_VISIBILITY_TIMEOUT || '300'),
    },
  };
}
