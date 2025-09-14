// Service Configuration
export interface ServiceConfig {
  openai: {
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
}

export function getServiceConfig(): ServiceConfig {
  return {
    openai: {
      apiKey: process.env.OPENAI_API_KEY || '',
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      temperature: parseFloat(process.env.OPENAI_TEMPERATURE || '0.3'),
      maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS || '2000'),
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
  };
}
