import { PageType, detectPageType } from '@shared/page-types';
import { SignalDAL } from '@infra/dal/signal';
import { SignalGenerationService, createSignalGenerationService } from './generator';
import { SignalValidator, createSignalValidator } from './validator';
import { checkSelectorExists } from '@shared/utils/dom';
import {
  SignalGenerationInput,
  SignalProposalValidationResult,
  Signal,
  PersistedGoal,
} from './types';

export interface SignalGenerationResult {
  success: boolean;
  signals: PersistedGoal[];
  validationResult?: SignalProposalValidationResult;
  error?: string;
}

// Simplified context for agent flow
export interface AutoSignalContext {
  experimentId: string;
  pageType?: PageType;
  url: string;
  intent?: string;
  dom?: string;
  variant: {
    selector: string;
    html: string;
    css?: string;
    js?: string;
    position: string;
  };
  purchaseTrackingActive?: boolean;
}

/**
 * Signal Generation Service
 * Main entry point for all signal generation functionality
 */
export class SignalGenerationOrchestrator {
  private generationService: SignalGenerationService;
  private validator: SignalValidator;

  constructor() {
    this.generationService = createSignalGenerationService();
    this.validator = createSignalValidator();
  }

  /**
   * Generate, validate, and persist signals for an experiment
   */
  async generateAndValidateSignals(
    experimentId: string,
    input: SignalGenerationInput,
    purchaseTrackingActive: boolean = true
  ): Promise<SignalGenerationResult> {
    try {
      console.log('[SIGNAL_ORCHESTRATOR] Starting signal generation process...');
      
      // Step 1: Generate signals using LLM
      console.log('[SIGNAL_ORCHESTRATOR] Step 1: Generating signals with LLM...');
      const proposal = await this.generationService.generateSignals(input);

      // Step 2: Validate signals against control DOM only
      // Note: We can't validate variant DOM since variants are JS code that runs on client
      console.log('[SIGNAL_ORCHESTRATOR] Step 2: Validating signals against control DOM...');
      const validationResult = await this.validator.validateProposal(proposal, {
        pageType: input.pageType,
        controlDOM: input.dom,
        purchaseTrackingActive,
      });

      // Step 4: Check if we have a valid primary signal
      if (!validationResult.valid || !validationResult.primary?.valid) {
        console.error('[SIGNAL_ORCHESTRATOR] Validation failed:', {
          valid: validationResult.valid,
          primaryValid: validationResult.primary?.valid,
          errors: validationResult.overallErrors,
        });

        return {
          success: false,
          signals: [],
          validationResult,
          error: 'No valid primary signal found. ' + validationResult.overallErrors.join('; '),
        };
      }

      // Step 5: Collect valid signals
      const validSignals = this.collectValidSignals(validationResult);

      console.log('[SIGNAL_ORCHESTRATOR] Valid signals:', {
        count: validSignals.length,
        primary: validSignals.find(s => s.role === 'primary')?.name,
        mechanisms: validSignals.filter(s => s.role === 'mechanism').map(s => s.name),
        guardrails: validSignals.filter(s => s.role === 'guardrail').map(s => s.name),
      });

      // Step 6: Persist signals to database
      console.log('[SIGNAL_ORCHESTRATOR] Step 6: Persisting signals to database...');
      const persistedSignals = await SignalDAL.createSignals(
        validSignals.map(signal => SignalDAL.fromSignal(signal, experimentId))
      );

      console.log('[SIGNAL_ORCHESTRATOR] Successfully generated and persisted signals');

      return {
        success: true,
        signals: persistedSignals,
        validationResult,
      };
    } catch (error) {
      console.error('[SIGNAL_ORCHESTRATOR] Signal generation failed:', error);
      return {
        success: false,
        signals: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Regenerate signals for an existing experiment
   * This deletes old signals and creates new ones
   */
  async regenerateSignals(
    experimentId: string,
    input: SignalGenerationInput,
    purchaseTrackingActive: boolean = true
  ): Promise<SignalGenerationResult> {
    console.log('[SIGNAL_ORCHESTRATOR] Regenerating signals for experiment:', experimentId);

    // Delete existing signals
    await SignalDAL.deleteSignalsByExperiment(experimentId);

    // Generate new signals
    return this.generateAndValidateSignals(experimentId, input, purchaseTrackingActive);
  }

  /**
   * Validate existing signals (for pre-launch checks)
   */
  async validateExistingSignals(
    experimentId: string,
    controlDOM: string,
    pageType: PageType,
    purchaseTrackingActive: boolean = true
  ): Promise<SignalProposalValidationResult> {
    console.log('[SIGNAL_ORCHESTRATOR] Validating existing signals for experiment:', experimentId);

    // Get existing signals
    const existingSignals = await SignalDAL.getSignalsByExperiment(experimentId);

    if (existingSignals.length === 0) {
      return {
        valid: false,
        primary: null,
        mechanisms: [],
        guardrails: [],
        overallErrors: ['No signals found for experiment'],
      };
    }

    // Convert to LLM proposal format
    const proposal = {
      primary: this.findSignalByRole(existingSignals, 'primary'),
      mechanisms: this.findSignalsByRole(existingSignals, 'mechanism'),
      guardrails: this.findSignalsByRole(existingSignals, 'guardrail'),
      rationale: 'Existing signals',
    };

    // Validate
    return this.validator.validateProposal(proposal, {
      pageType,
      controlDOM,
      purchaseTrackingActive,
    });
  }

  /**
   * Convert PersistedGoal to LLM format (shared mapper)
   */
  private toProposalFormat(signal: PersistedGoal): any {
    return {
      type: signal.type,
      name: signal.name,
      selector: signal.selector,
      eventType: signal.eventType,
      targetUrls: signal.targetUrls,
      dataLayerEvent: signal.dataLayerEvent,
      customJs: signal.customJs,
      valueSelector: signal.valueSelector,
      currency: signal.currency,
      existsInControl: signal.existsInControl,
      existsInVariant: signal.existsInVariant,
    };
  }

  private findSignalByRole(signals: PersistedGoal[], role: string): any {
    const signal = signals.find(s => s.role === role);
    return signal ? this.toProposalFormat(signal) : null;
  }

  private findSignalsByRole(signals: PersistedGoal[], role: string): any[] {
    return signals.filter(s => s.role === role).map(s => this.toProposalFormat(s));
  }

  /**
   * Collect all valid signals from validation result
   */
  private collectValidSignals(validationResult: SignalProposalValidationResult): Signal[] {
    const validSignals: Signal[] = [];

    if (validationResult.primary?.valid) {
      validSignals.push(validationResult.primary.signal);
    }

    validationResult.mechanisms.forEach(m => {
      if (m.valid) validSignals.push(m.signal);
    });

    validationResult.guardrails.forEach(g => {
      if (g.valid) validSignals.push(g.signal);
    });

    return validSignals;
  }

  // ===== AGENT FLOW HELPERS =====

  /**
   * Try auto-generate signals with validation against ALL variants
   * This ensures signals work for the entire experiment, not just one variant
   */
  async tryAutoGenerateForAllVariants(
    experimentId: string,
    url: string,
    intent: string,
    dom: string,
    variants: Array<{
      selector: string;
      html: string;
      css?: string;
      js?: string;
      position: string;
    }>,
    _purchaseTrackingActive: boolean = true
  ): Promise<SignalGenerationResult> {
    console.log('[SIGNAL_SERVICE] Auto-generating signals for ALL variants...');

    if (!dom || variants.length === 0) {
      return {
        success: false,
        signals: [],
        error: 'Insufficient context: need DOM and at least one variant',
      };
    }

    // Step 1: Generate signals using first variant as representative
    const pageType = detectPageType(url);
    const firstVariant = variants[0];
    
    console.log('[SIGNAL_SERVICE] Generating proposal using first variant...');
    const proposal = await this.generationService.generateSignals({
      pageType,
      url,
      intent,
      dom,
      variant: this.toVariantDefinition(firstVariant),
    });

    // Step 2: Validate signals against control DOM only
    // Note: We can't validate variant DOM since variants are JS code that runs on client
    console.log('[SIGNAL_SERVICE] Validating signals against control DOM...');
    const validationErrors: string[] = [];
    const validSignals: Signal[] = [];

    // Validate primary exists in control
    if (proposal.primary) {
      const primarySignal: Signal = { ...proposal.primary, role: 'primary' };
      
      const existsInControl = primarySignal.selector
        ? checkSelectorExists(dom, primarySignal.selector)
        : true;

      if (!existsInControl) {
        validationErrors.push(`Primary signal "${primarySignal.name}" selector not found in control DOM`);
      } else {
        validSignals.push(primarySignal);
        console.log(`[SIGNAL_SERVICE] ✅ Primary signal "${primarySignal.name}" validated in control`);
      }
    } else {
      validationErrors.push('No primary signal proposed');
    }

    // Validate mechanisms (can be variant-specific, just check they exist where claimed)
    if (proposal.mechanisms) {
      for (const mechanism of proposal.mechanisms) {
        const mechanismSignal: Signal = { ...mechanism, role: 'mechanism' };
        validSignals.push(mechanismSignal);
      }
    }

    // Add guardrails
    if (proposal.guardrails) {
      for (const guardrail of proposal.guardrails) {
        const guardrailSignal: Signal = { ...guardrail, role: 'guardrail' };
        validSignals.push(guardrailSignal);
      }
    }

    // Check if we have valid primary
    if (validationErrors.length > 0 || !validSignals.some(s => s.role === 'primary')) {
      return {
        success: false,
        signals: [],
        error: `Validation failed: ${validationErrors.join('; ')}`,
      };
    }

    // Persist signals
    console.log('[SIGNAL_SERVICE] Persisting validated signals...');
    const persistedSignals = await SignalDAL.createSignals(
      validSignals.map(signal => SignalDAL.fromSignal(signal, experimentId))
    );

    return {
      success: true,
      signals: persistedSignals,
    };
  }

  /**
   * Add default guardrails when manual signals are provided
   */
  async addDefaultGuardrails(
    experimentId: string,
    pageType: PageType,
    purchaseTrackingActive: boolean = true
  ): Promise<PersistedGoal[]> {
    const guardrails: PersistedGoal[] = [];
    const isCommerce = [PageType.PDP, PageType.COLLECTION, PageType.CART, PageType.CHECKOUT].includes(pageType);

    if (isCommerce && purchaseTrackingActive) {
      const guard = await SignalDAL.createSignal({
        experimentId,
        name: 'purchase_completed',
        type: 'purchase',
        role: 'guardrail',
        existsInControl: true,
        existsInVariant: true,
      });
      guardrails.push(guard);
    }

    return guardrails;
  }

  /**
   * Validate experiment has required signals before publishing
   */
  async validateForPublish(experimentId: string): Promise<{
    valid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    const signals = await SignalDAL.getSignalsByExperiment(experimentId);
    const errors: string[] = [];
    const warnings: string[] = [];

    const primaries = signals.filter(s => s.role === 'primary');
    if (primaries.length === 0) errors.push('No primary signal');
    if (primaries.length > 1) errors.push('Multiple primary signals');
    
    const primary = primaries[0];
    if (primary && (!primary.existsInControl || !primary.existsInVariant)) {
      errors.push('Primary signal must exist in both control and variant');
    }

    const mechanisms = signals.filter(s => s.role === 'mechanism');
    if (mechanisms.length > 2) warnings.push('More than 2 mechanisms may complicate analysis');

    return { valid: errors.length === 0, errors, warnings };
  }

  /**
   * Map position to change type
   */
  private mapPositionToChangeType(position: string): 'addElement' | 'replaceElement' | 'modifyElement' | 'removeElement' {
    switch (position.toUpperCase()) {
      case 'INNER': return 'modifyElement';
      case 'OUTER': return 'replaceElement';
      default: return 'addElement';
    }
  }

  /**
   * Convert variant context to internal variant definition (DRY)
   */
  private toVariantDefinition(variant: {
    selector: string;
    html: string;
    css?: string;
    js?: string;
    position: string;
  }) {
    return {
      changeType: this.mapPositionToChangeType(variant.position),
      selector: variant.selector,
      html: variant.html,
      css: variant.css,
      javascript_code: variant.js,
    };
  }
}

/**
 * Factory function
 */
export function createSignalGenerationOrchestrator(): SignalGenerationOrchestrator {
  return new SignalGenerationOrchestrator();
}

