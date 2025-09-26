// Shared AI Configuration
import { getServiceConfig } from '@infra/config/services';

export interface AIConfig {
  model: string;
  temperature: number;
  maxTokens: number;
  apiKey: string;
}

export function getAIConfig(): AIConfig {
  const config = getServiceConfig();
  return {
    model: config.google?.model || 'gemini-2.5-flash',
    temperature: config.google?.temperature || 0.7,
    maxTokens: config.google?.maxTokens || 1000,
    apiKey: config.google?.apiKey || '',
  };
}

// Common AI SDK configurations
export const AI_CONFIGS = {
  STREAMING: {
    temperature: 0.7,
    maxTokens: 1000,
  },
  STRUCTURED_OUTPUT: {
    temperature: 0.3,
    maxTokens: 2000,
  },
  ANALYSIS: {
    temperature: 0.5,
    maxTokens: 1500,
  },
} as const;
