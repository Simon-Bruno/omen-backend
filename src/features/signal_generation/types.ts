import { z } from 'zod';
import { PageType } from '@shared/page-types';

// Signal role types
export type SignalRole = 'primary' | 'mechanism' | 'guardrail';

// Signal type enumeration
export type SignalType = 'conversion' | 'purchase' | 'custom';

// Base signal definition
export interface BaseSignal {
  type: SignalType;
  name: string;
  selector?: string;
  eventType?: string;
  targetUrls?: string[]; // Regex patterns for URL transitions
  dataLayerEvent?: string;
  customJs?: string;
  valueSelector?: string;
  currency?: string;
  existsInControl: boolean;
  existsInVariant: boolean;
}

// Signal with role
export interface Signal extends BaseSignal {
  role: SignalRole;
}

// LLM generation input
export interface SignalGenerationInput {
  projectId: string;
  pageType: PageType;
  url: string;
  intent: string;
  dom: string;
  variant: VariantDefinition;
}

// Variant definition (simplified from variant_generation)
export interface VariantDefinition {
  changeType: 'addElement' | 'replaceElement' | 'modifyElement' | 'removeElement';
  selector: string;
  html?: string;
  css?: string;
  javascript_code?: string;
  description?: string;
  rationale?: string;
}

// LLM output schema
export const llmSignalSchema = z.object({
  type: z.enum(['conversion', 'purchase', 'custom']),
  name: z.string().describe('Stable snake_case identifier'),
  selector: z.string().optional().describe('CSS selector for DOM listener'),
  eventType: z.string().optional().describe('Event type (e.g. click, submit)'),
  targetUrls: z.array(z.string()).optional().describe('Regex patterns for URL transitions'),
  dataLayerEvent: z.string().optional().describe('Analytics event name if applicable'),
  customJs: z.string().optional().describe('Boolean expression (mechanisms only)'),
  valueSelector: z.string().optional().describe('Selector for purchase value'),
  currency: z.string().optional().describe('Currency code for purchase'),
  existsInControl: z.boolean().describe('Whether signal exists in control'),
  existsInVariant: z.boolean().describe('Whether signal exists in variant'),
});

export const llmSignalProposalSchema = z.object({
  primary: llmSignalSchema.describe('The shared, validated primary signal'),
  mechanisms: z.array(llmSignalSchema)
    .max(2)
    .optional()
    .describe('Up to 2 variant-only mechanism signals'),
  guardrails: z.array(llmSignalSchema)
    .optional()
    .describe('Optional guardrail signals (e.g., purchase_completed)'),
  rationale: z.string().describe('Explanation of why these signals were chosen'),
});

export type LLMSignal = z.infer<typeof llmSignalSchema>;
export type LLMSignalProposal = z.infer<typeof llmSignalProposalSchema>;

// Validation result
export interface SignalValidationResult {
  valid: boolean;
  signal: Signal;
  errors: string[];
  warnings: string[];
}

export interface SignalProposalValidationResult {
  valid: boolean;
  primary: SignalValidationResult | null;
  mechanisms: SignalValidationResult[];
  guardrails: SignalValidationResult[];
  overallErrors: string[];
}

// Persisted goal (database format)
export interface PersistedGoal {
  id: string;
  experimentId: string;
  name: string;
  type: SignalType;
  role: SignalRole;
  selector?: string;
  eventType?: string;
  targetUrls?: string[];
  dataLayerEvent?: string;
  customJs?: string;
  valueSelector?: string;
  currency?: string;
  existsInControl: boolean;
  existsInVariant: boolean;
  createdAt: Date;
}

// Published goal format (for Cloudflare)
export interface PublishedGoal {
  name: string;
  type: SignalType;
  role: SignalRole;
  selector?: string;
  eventType?: string;
  targetUrls?: string[];
  dataLayerEvent?: string;
  customJs?: string;
  valueSelector?: string;
  currency?: string;
}

