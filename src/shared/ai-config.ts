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
  VARIANT_GENERATION: {
    temperature: 0.7,
    maxTokens: 3000,
  },
} as const;

// Get AI config for variant generation (uses Gemini 2.5 Pro)
export function getVariantGenerationAIConfig(): AIConfig {
  const config = getServiceConfig();
  return {
    model: 'gemini-2.5-pro', // Use Gemini 2.5 Pro for variant generation
    temperature: config.google?.temperature || 0.3,
    maxTokens: config.google?.maxTokens || 3000,
    apiKey: config.google?.apiKey || '',
  };
}
