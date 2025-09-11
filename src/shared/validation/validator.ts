/**
 * Main DSL Validator
 * 
 * Orchestrates validation using Zod schemas and sanitizers
 */

import { ExperimentDSLSchema, type ExperimentDSL } from './schemas/experiment.schema.js';
import { sanitizeHTML } from './sanitizers/html.sanitizer.js';
import { sanitizeCSS } from './sanitizers/css.sanitizer.js';

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

export interface ValidationError {
  code: string;
  message: string;
  field?: string;
  details?: unknown;
}

// Unsafe selectors for outer position
const UNSAFE_OUTER_SELECTORS = [
  'form', 'input', 'textarea', 'select', 'button[type="submit"]',
  '[id*="checkout"]', '[id*="payment"]', '[id*="billing"]',
  '[id*="shipping"]', '[id*="address"]', '[id*="credit"]',
  '[id*="card"]', '[id*="cvv"]', '[id*="cvc"]'
];

/**
 * Validates an experiment DSL
 */
export async function validateExperimentDSL(dsl: unknown): Promise<ValidationResult> {
  const errors: ValidationError[] = [];

  try {
    // 1. Schema validation with Zod
    const schemaResult = ExperimentDSLSchema.safeParse(dsl);
    if (!schemaResult.success) {
      const zodErrors = schemaResult.error.issues.map((err) => ({
        code: 'INVALID_DSL_STRUCTURE',
        message: err.message,
        field: err.path.join('.'),
        details: err
      }));
      return { isValid: false, errors: zodErrors };
    }

    const experiment = schemaResult.data;

    // 2. Additional safety checks
    await validateSafetyRules(experiment, errors);
    if (errors.length > 0) return { isValid: false, errors };

    // 3. HTML sanitization
    await validateHTMLContent(experiment, errors);
    if (errors.length > 0) return { isValid: false, errors };

    // 4. CSS sanitization
    await validateCSSContent(experiment, errors);
    if (errors.length > 0) return { isValid: false, errors };

  } catch (error) {
    errors.push({
      code: 'VALIDATION_ERROR',
      message: `Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      details: error
    });
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Validates safety rules
 */
async function validateSafetyRules(experiment: ExperimentDSL, errors: ValidationError[]): Promise<void> {
  for (const target of experiment.targets) {
    for (const [variantId, variant] of Object.entries(target.variants)) {
      // Check for unsafe outer targets
      if (variant.render.position === 'outer' && isUnsafeOuterTarget(target.selector)) {
        errors.push({
          code: 'UNSAFE_OUTER_TARGET',
          message: `Outer position not allowed for critical elements: ${target.selector}`,
          field: `targets.${experiment.targets.indexOf(target)}.variants.${variantId}.render.position`
        });
      }
    }
  }
}

/**
 * Validates HTML content
 */
async function validateHTMLContent(experiment: ExperimentDSL, errors: ValidationError[]): Promise<void> {
  for (const target of experiment.targets) {
    for (const [variantId, variant] of Object.entries(target.variants)) {
      const htmlResult = sanitizeHTML(variant.render.html);
      if (!htmlResult.isValid) {
        errors.push({
          code: 'UNSAFE_HTML',
          message: `Unsafe HTML content: ${htmlResult.errors.join(', ')}`,
          field: `targets.${experiment.targets.indexOf(target)}.variants.${variantId}.render.html`,
          details: htmlResult.errors
        });
      }
    }
  }
}

/**
 * Validates CSS content
 */
async function validateCSSContent(experiment: ExperimentDSL, errors: ValidationError[]): Promise<void> {
  for (const target of experiment.targets) {
    for (const [variantId, variant] of Object.entries(target.variants)) {
      if (variant.render.css) {
        const cssResult = await sanitizeCSS(variant.render.css);
        if (!cssResult.isValid) {
          errors.push({
            code: 'UNSCOPED_CSS',
            message: `Unsafe CSS content: ${cssResult.errors.join(', ')}`,
            field: `targets.${experiment.targets.indexOf(target)}.variants.${variantId}.render.css`,
            details: cssResult.errors
          });
        }
      }
    }
  }
}

/**
 * Checks if a selector targets unsafe elements for outer position
 */
function isUnsafeOuterTarget(selector: string): boolean {
  const lowerSelector = selector.toLowerCase();
  return UNSAFE_OUTER_SELECTORS.some(unsafe => 
    lowerSelector.includes(unsafe) || 
    lowerSelector.match(new RegExp(unsafe.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  );
}
