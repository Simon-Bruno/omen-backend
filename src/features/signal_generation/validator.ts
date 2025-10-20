import { PageType } from '@shared/page-types';
import {
  Signal,
  SignalValidationResult,
  SignalProposalValidationResult,
  LLMSignalProposal,
} from './types';
import { checkSelectorExists } from '@shared/utils/dom';
import { isValidSignalForPageType, getSignalDefinition } from './catalog';

export interface ValidationContext {
  pageType: PageType;
  controlDOM: string;
  purchaseTrackingActive: boolean;
}

/**
 * Signal Validation Engine
 * Validates signals to ensure they exist in both control and variant as expected
 */
export class SignalValidator {

  /**
   * Validate a complete signal proposal from LLM
   */
  async validateProposal(
    proposal: LLMSignalProposal,
    context: ValidationContext
  ): Promise<SignalProposalValidationResult> {
    console.log('[SIGNAL_VALIDATOR] Validating signal proposal...');

    const result: SignalProposalValidationResult = {
      valid: false,
      primary: null,
      mechanisms: [],
      guardrails: [],
      overallErrors: [],
    };

    // Validate primary signal
    if (proposal.primary) {
      const primarySignal: Signal = { ...proposal.primary, role: 'primary' };
      result.primary = await this.validateSignal(primarySignal, context);

      if (!result.primary.valid) {
        result.overallErrors.push('Primary signal validation failed');
      }

      // Primary MUST be shared (exist in both control and variant)
      if (primarySignal.existsInControl && !primarySignal.existsInVariant) {
        result.overallErrors.push('Primary signal must exist in both control and variant');
        result.primary.errors.push('Primary signal does not exist in variant');
      }

      if (!primarySignal.existsInControl && primarySignal.existsInVariant) {
        result.overallErrors.push('Primary signal must exist in both control and variant');
        result.primary.errors.push('Primary signal does not exist in control');
      }
    } else {
      result.overallErrors.push('No primary signal provided');
    }

    // Validate mechanisms
    if (proposal.mechanisms && proposal.mechanisms.length > 0) {
      for (const mechanism of proposal.mechanisms) {
        const mechanismSignal: Signal = { ...mechanism, role: 'mechanism' };
        const mechanismResult = await this.validateSignal(mechanismSignal, context);
        result.mechanisms.push(mechanismResult);
      }

      // Check limit
      if (proposal.mechanisms.length > 2) {
        result.overallErrors.push('Too many mechanism signals (max 2)');
      }
    }

    // Validate guardrails
    if (proposal.guardrails && proposal.guardrails.length > 0) {
      for (const guardrail of proposal.guardrails) {
        const guardrailSignal: Signal = { ...guardrail, role: 'guardrail' };
        const guardrailResult = await this.validateSignal(guardrailSignal, context);
        result.guardrails.push(guardrailResult);
      }
    }

    // Overall validation: must have at least one valid primary
    result.valid = result.primary !== null && result.primary.valid && result.overallErrors.length === 0;

    console.log('[SIGNAL_VALIDATOR] Validation result:', {
      valid: result.valid,
      primaryValid: result.primary?.valid,
      mechanismCount: result.mechanisms.length,
      guardrailCount: result.guardrails.length,
      errorCount: result.overallErrors.length,
    });

    return result;
  }

  /**
   * Validate a single signal
   */
  async validateSignal(
    signal: Signal,
    context: ValidationContext
  ): Promise<SignalValidationResult> {
    const result: SignalValidationResult = {
      valid: true,
      signal,
      errors: [],
      warnings: [],
    };

    // Check if signal is valid for page type
    if (!isValidSignalForPageType(signal.name, context.pageType, signal.role)) {
      result.errors.push(`Signal ${signal.name} is not valid for page type ${context.pageType} with role ${signal.role}`);
      result.valid = false;
    }

    // Get signal definition from catalog
    const catalogSignal = getSignalDefinition(signal.name, context.pageType);
    
    // Validate based on signal type
    if (signal.type === 'purchase') {
      await this.validatePurchaseSignal(signal, context, result);
    } else if (signal.type === 'conversion') {
      await this.validateConversionSignal(signal, context, result);
    } else if (signal.type === 'custom') {
      await this.validateCustomSignal(signal, context, result);
    }

    // Check catalog requirements
    if (catalogSignal) {
      if (catalogSignal.requiresSelector && !signal.selector) {
        result.errors.push(`Signal ${signal.name} requires a selector`);
        result.valid = false;
      }

      if (catalogSignal.requiresTargetUrls && (!signal.targetUrls || signal.targetUrls.length === 0)) {
        result.errors.push(`Signal ${signal.name} requires target URLs`);
        result.valid = false;
      }

      if (catalogSignal.requiresPurchaseTracking && !context.purchaseTrackingActive) {
        result.errors.push(`Signal ${signal.name} requires purchase tracking to be active`);
        result.valid = false;
      }
    }

    // Validate existence flags
    if (signal.selector) {
      this.validateSelectorExistence(signal, context, result);
    }

    return result;
  }

  /**
   * Validate purchase signal
   */
  private async validatePurchaseSignal(
    signal: Signal,
    _context: ValidationContext,
    result: SignalValidationResult
  ): Promise<void> {
    // Purchase signals should be valid if purchase tracking is active
    if (!_context.purchaseTrackingActive) {
      result.warnings.push('Purchase tracking is not active for this project');
    }

    // purchase_completed doesn't need a selector
    if (signal.name === 'purchase_completed' && signal.selector) {
      result.warnings.push('purchase_completed signal does not need a selector');
    }
  }

  /**
   * Validate conversion signal
   */
  private async validateConversionSignal(
    signal: Signal,
    _context: ValidationContext,
    result: SignalValidationResult
  ): Promise<void> {
    // Conversion signals should have either selector or targetUrls
    if (!signal.selector && (!signal.targetUrls || signal.targetUrls.length === 0)) {
      result.errors.push('Conversion signal must have either selector or targetUrls');
      result.valid = false;
    }

    // Validate targetUrls if present
    if (signal.targetUrls && signal.targetUrls.length > 0) {
      for (const pattern of signal.targetUrls) {
        try {
          new RegExp(pattern);
        } catch (error) {
          result.errors.push(`Invalid regex pattern in targetUrls: ${pattern}`);
          result.valid = false;
        }
      }
    }

    // Validate eventType
    if (signal.selector && !signal.eventType) {
      result.warnings.push('Conversion signal with selector should have eventType (e.g., "click")');
    }

    // Check for brittle selectors
    if (signal.selector) {
      this.checkSelectorQuality(signal.selector, result);
    }
  }

  /**
   * Validate custom signal
   */
  private async validateCustomSignal(
    signal: Signal,
    _context: ValidationContext,
    result: SignalValidationResult
  ): Promise<void> {
    // Custom signals should have customJs
    if (!signal.customJs) {
      result.errors.push('Custom signal must have customJs');
      result.valid = false;
    }

    // Validate customJs is not empty
    if (signal.customJs && signal.customJs.trim().length === 0) {
      result.errors.push('Custom signal customJs cannot be empty');
      result.valid = false;
    }
  }

  /**
   * Validate selector existence in control DOM only
   * Note: We can't validate variant DOM since variants are JS code that runs on client
   */
  private validateSelectorExistence(
    signal: Signal,
    context: ValidationContext,
    result: SignalValidationResult
  ): void {
    const existsInControl = checkSelectorExists(context.controlDOM, signal.selector!);

    // Only validate control DOM - we can't predict what variant JS will do
    if (signal.existsInControl && !existsInControl) {
      result.errors.push(`Selector "${signal.selector}" not found in control DOM`);
      result.valid = false;
    }
    
    if (!signal.existsInControl && existsInControl) {
      result.warnings.push(`Selector exists in control but signal claims it doesn't`);
    }
  }

  /**
   * Check selector quality and provide warnings for brittle selectors
   */
  private checkSelectorQuality(selector: string, result: SignalValidationResult): void {
    // Warn about nth-child selectors (brittle)
    if (selector.includes(':nth-child') || selector.includes(':nth-of-type')) {
      result.warnings.push('Selector uses :nth-child which may be brittle. Consider using attributes or classes.');
    }

    // Warn about overly specific selectors
    const selectorParts = selector.split(' ').filter(p => p.length > 0);
    if (selectorParts.length > 5) {
      result.warnings.push('Selector is very specific and may be brittle. Consider simplifying.');
    }

    // Encourage attribute-based selectors
    if (!selector.includes('[') && !selector.includes('#') && !selector.includes('.')) {
      result.warnings.push('Consider using more specific selectors with classes, IDs, or attributes.');
    }
  }
}

/**
 * Factory function
 */
export function createSignalValidator(): SignalValidator {
  return new SignalValidator();
}

