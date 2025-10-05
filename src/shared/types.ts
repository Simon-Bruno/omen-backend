/**
 * Shared Type Definitions
 * 
 * This file contains all shared types used across the application.
 * Following Clean Architecture, these are framework-agnostic types.
 */

// Request parameter types
export interface ProjectParams {
  projectId: string;
}

// Request body types
export interface ProjectBody {
  projectId?: string;
}

// User context types
export interface UserContext {
  userId: string;
  projectId?: string;
}

// Auth0 user types
export interface Auth0User {
  id: string;
  email: string;
  project?: {
    id: string;
    shopDomain: string;
  };
}

// API response types
export interface ApiResponse<T = unknown> {
  data?: T;
  error?: string;
  message?: string;
}

export interface ApiError {
  error: string;
  message: string;
  details?: unknown;
}

// DSL Types for Experiments
export type ExperimentStatusType = 'draft' | 'running' | 'paused' | 'finished';

export type VariantId = 'A' | 'B' | 'C';

export type RenderPosition = 'inner' | 'outer' | 'before' | 'after' | 'append' | 'prepend';

export type ApplyMode = 'first' | 'all';

export interface ExperimentMatch {
  host?: string;
  path: string;
}

export interface ExperimentTraffic {
  A: number;
  B: number;
  C: number;
}

export interface ExperimentAssignment {
  cookieName: string;
  ttlDays: number;
}

export interface ExperimentRuntime {
  minDays: number;
  minSessionsPerVariant: number;
  endAt?: string; // ISO date string
}

export interface ExperimentAnalytics {
  posthog: {
    enabled: boolean;
    host: string;
  };
  eventProps: string[];
}

export interface ExperimentGuardrails {
  watch: ('lcp' | 'js_errors' | 'cls')[];
}

export interface VariantRender {
  position: RenderPosition;
  html: string;
  css?: string;
  oncePerResponse?: boolean;
}

export interface Variant {
  mode: 'render';
  render: VariantRender;
}

export interface ExperimentTarget {
  selector: string;
  apply: ApplyMode;
  variants: Record<VariantId, Variant>;
}

export interface ExperimentKPI {
  primary: string;
  secondary?: string[];
}

export interface ExperimentDSL {
  experimentId: string;
  projectId: string;
  name: string;
  status: ExperimentStatusType;
  match: ExperimentMatch;
  traffic: ExperimentTraffic;
  assignment: ExperimentAssignment;
  targets: ExperimentTarget[];
  kpi: ExperimentKPI;
  runtime: ExperimentRuntime;
  analytics: ExperimentAnalytics;
  guardrails?: ExperimentGuardrails;
}

// Validation Error Types
export type ValidationErrorCode =
  | 'INVALID_DSL_STRUCTURE'
  | 'INVALID_TRAFFIC'
  | 'INVALID_SELECTOR'
  | 'UNSAFE_HTML'
  | 'UNSCOPED_CSS'
  | 'LIMIT_EXCEEDED'
  | 'UNSAFE_OUTER_TARGET'
  | 'INVALID_VARIANT_COUNT'
  | 'INVALID_TARGET_COUNT'
  | 'INVALID_HTML_SIZE'
  | 'INVALID_CSS_SIZE'
  | 'INVALID_DSL_SIZE'
  | 'INVALID_ANALYTICS_HOST';

export interface ValidationError {
  code: ValidationErrorCode;
  message: string;
  field?: string;
  details?: unknown;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

// PostHog Analytics Types
export interface VariantMetrics {
  variantId: string;
  sessions: number;
  primaryKPI: {
    name: string;
    count: number;
    rate: number;
  };
  guardrails?: {
    lcp?: 'normal' | 'elevated';
    jsErrors?: 'normal' | 'elevated';
    cls?: 'normal' | 'elevated';
  };
}

export interface ExperimentStatus {
  state: 'draft' | 'running' | 'paused' | 'finished';
  traffic: Record<string, number>;
  variants: VariantMetrics[];
  leader?: string;
  liftVsA?: number;
  meta: {
    timeframe: {
      start: string;
      end: string;
    };
    denominator: 'pageviews';
    totalSessions: number;
  };
}
