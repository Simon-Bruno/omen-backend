import { google } from '@ai-sdk/google';
import { ai } from '@infra/config/langsmith';
import {
  SignalGenerationInput,
  LLMSignalProposal,
  llmSignalProposalSchema,
} from './types';
import { SIGNAL_CATALOG } from './catalog';

/**
 * Signal Generation Service
 * Uses LLM to propose experiment signals (goals) based on page context and variant
 */
export class SignalGenerationService {
  /**
   * Generate signal proposals using LLM
   */
  async generateSignals(input: SignalGenerationInput): Promise<LLMSignalProposal> {
    const prompt = this.buildPrompt(input);

    try {
      console.log('[SIGNAL_GENERATION] Generating signals with LLM...');
      
      const result = await ai.generateObject({
        model: google('gemini-2.5-flash'),
        schema: llmSignalProposalSchema,
        prompt,
        temperature: 0.3,
      });

      console.log('[SIGNAL_GENERATION] LLM returned signal proposal:', {
        primary: result.object.primary?.name,
        mechanismCount: result.object.mechanisms?.length || 0,
        guardrailCount: result.object.guardrails?.length || 0,
      });

      return result.object;
    } catch (error) {
      console.error('[SIGNAL_GENERATION] Failed to generate signals:', error);
      throw new Error(`Signal generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Build the LLM prompt for signal generation
   */
  private buildPrompt(input: SignalGenerationInput): string {
    const { pageType, url, intent, dom, variant } = input;
    const catalog = SIGNAL_CATALOG[pageType];

    const primaryCandidatesText = catalog.primaryCandidates
      .map(s => `- ${s.name}: ${s.description}`)
      .join('\n');
    
    const mechanismsText = catalog.mechanisms
      .map(s => `- ${s.name}: ${s.description}`)
      .join('\n');
    
    const guardrailsText = catalog.guardrails
      .map(s => `- ${s.name}: ${s.description}`)
      .join('\n');

    return `You are an experiment signal generation system. Your job is to propose concrete, measurable user actions (signals/goals) for an A/B test.

## Context
- **Page Type**: ${pageType}
- **URL**: ${url}
- **Intent**: ${intent}
- **Variant Change**: ${variant.changeType} at selector "${variant.selector}"

Note: The intent includes the PRIMARY GOAL, but choose signals that make sense for the actual variant changes.

## Available Signals Catalog for ${pageType}
*Note: These are suggested signals. Choose what makes sense for your variant, or propose custom ones.*

### Primary Candidates (Must be shared between control and variant):
${primaryCandidatesText}

### Mechanisms (Can be variant-only):
${mechanismsText}

### Guardrails (Safety checks):
${guardrailsText}

## Current Page DOM (Control):
\`\`\`html
${dom}
\`\`\`

## Variant Changes:
${variant.html ? `HTML to ${variant.changeType}: ${variant.html}` : ''}
${variant.css ? `CSS: ${variant.css}` : ''}
${variant.javascript_code ? `JavaScript: Present` : ''}

## Your Task

Propose at most 3 signals:
1. **Exactly ONE primary signal** - MUST exist in both control and variant (shared action)
2. **Up to 2 mechanism signals** - Explain WHY the variant works (can be variant-only)
3. **Optional guardrail signals** - Prevent false wins (e.g., purchase_completed)

## Rules

1. **Primary Signal Requirements**:
   - MUST align with the primary goal mentioned in the intent
   - MUST exist in both control and variant DOM
   - MUST use a selector that exists in the current page
   - Choose from the "Primary Candidates" catalog above
   - Set existsInControl=true and existsInVariant=true

2. **Mechanism Signals**:
   - Can be variant-only (new elements added by variant)
   - Should explain user interaction with the variant
   - Set existsInControl=false if only in variant

3. **Guardrails**:
   - Always include "purchase_completed" if commerce-related
   - Should monitor downstream business metrics

4. **Signal Validation**:
   - For selector-based signals: provide a valid CSS selector that EXISTS in the DOM above
   - For URL-based signals: provide regex patterns in targetUrls
   - Use snake_case for signal names
   - Stay within the catalog unless absolutely necessary
   - CRITICAL: Only use selectors you can see in the "Current Page DOM" section above
   - IMPORTANT: If buttons are inside web components (like <product-form-component>), target the container instead

SELECTOR GENERATION RULES (CRITICAL):
- You MUST analyze the HTML content and generate selectors that are GUARANTEED to work
- Prioritize selectors that uniquely identify the target element
- Use the most specific selector that still works reliably across environments
- These selectors will be used directly by document.querySelector() in the SDK

STABILITY PRIORITIZATION (CRITICAL):
- Rank candidates by stability FIRST, then confidence
- STRONGLY PREFER stable class or [data-*] selectors over IDs
- DO NOT choose Shopify dynamic section IDs that match "#shopify-section-template-*" unless no alternative exists
- When both stable and dynamic options exist, always choose the stable one

CRITICAL RULES:
- ONLY return CSS selectors that actually exist in the HTML above
- NEVER generate or invent selectors that don't exist
- Be specific with selectors (avoid generic ones like 'div')
- AVOID dynamic IDs like #shopify-section-template-* (these change between environments)
- PREFER stable selectors like .class-name or [data-*] attributes
- Use class-based selectors over ID-based selectors when possible

✅ FUNCTIONAL SELECTORS (guaranteed to work):
- ".buy-buttons-block" (if this uniquely identifies the element)
- ".product-title" (if this uniquely identifies the element)
- ".hero-section .cta-button" (if both exist and this combination is unique)
- "button[type='submit']" (if no class conflicts)

❌ UNRELIABLE SELECTORS (avoid these):
- ".some-made-up-class" (you invented this)
- "#shopify-section-template-123" (dynamic, changes between environments)
- "div" (too generic, matches everything)
- "button" (too generic, matches all buttons)

EXAMPLES:
- If HTML contains: <div class="buy-buttons-block">
- Return selector: .buy-buttons-block
- NOT: .buy-button-container (this doesn't exist)

- If HTML contains: <button class="btn-primary">
- Return selector: .btn-primary
- NOT: .btn-primary-large (this doesn't exist)

5. **Constraints**:
   - Maximum 3 signals total (excluding guardrails)
   - Keep it simple and interpretable
   - Focus on HIGH-VOLUME actions (avoid low-traffic edge cases)

## Example Output Format

{
  "primary": {
    "type": "conversion",
    "name": "collection_to_pdp_click",
    "selector": ".product-grid a[href*='/products/']",
    "eventType": "click",
    "existsInControl": true,
    "existsInVariant": true
  },
  "mechanisms": [
    {
      "type": "conversion",
      "name": "hero_cta_click",
      "selector": ".collection-hero .new-cta",
      "eventType": "click",
      "existsInControl": false,
      "existsInVariant": true
    }
  ],
  "guardrails": [
    {
      "type": "purchase",
      "name": "purchase_completed",
      "existsInControl": true,
      "existsInVariant": true
    }
  ],
  "rationale": "Primary: existing product grid links (shared). Mechanism: new hero CTA explains engagement. Guardrail: purchase ensures revenue not harmed."
}

Now generate the signal proposal for this experiment.`;
  }
}

/**
 * Factory function
 */
export function createSignalGenerationService(): SignalGenerationService {
  return new SignalGenerationService();
}

