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
  };
}
