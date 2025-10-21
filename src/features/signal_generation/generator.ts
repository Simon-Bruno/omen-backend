import { google } from '@ai-sdk/google';
import { ai } from '@infra/config/langsmith';
import * as cheerio from 'cheerio';
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
    // Clean HTML for better LLM analysis (same approach as DOM analyzer)
    const cleanedDOM = this.cleanHtmlForAnalysis(input.dom);
    const cleanedInput = { ...input, dom: cleanedDOM };
    
    const prompt = this.buildPrompt(cleanedInput);

    try {
      console.log('[SIGNAL_GENERATION] Generating signals with LLM...');
      
      const result = await ai.generateObject({
        model: google('gemini-2.5-pro'),
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
    const variantSummary: string[] = [];

    if (variant.description) {
      variantSummary.push(`- Description: ${variant.description}`);
    }
    if (variant.rationale) {
      variantSummary.push(`- Rationale: ${variant.rationale}`);
    }
    variantSummary.push(`- Change Type: ${variant.changeType} targeting "${variant.selector}"`);

    const variantSummaryText = variantSummary.join('\n');
    const jsSnippet = variant.javascript_code
      ? `\`\`\`js
${this.truncateCode(variant.javascript_code)}
\`\`\``
      : 'No JavaScript provided.';

    const primaryCandidatesText = catalog.primaryCandidates
      .map(s => `- ${s.name}: ${s.description}`)
      .join('\n');
    
    const mechanismsText = catalog.mechanisms
      .map(s => `- ${s.name}: ${s.description}`)
      .join('\n');
    
    const guardrailsText = catalog.guardrails
      .map(s => `- ${s.name}: ${s.description}`)
      .join('\n');

    return `You are a signal generation system for A/B testing. Your job is to propose concrete, measurable user actions (signals/goals) for an experiment.

HYPOTHESIS: ${intent}

PAGE CONTEXT:
- **Page Type**: ${pageType}
- **URL**: ${url}

VARIANT DETAILS:
${variantSummaryText}

VARIANT IMPLEMENTATION (JavaScript):
${jsSnippet}

HTML CONTENT:
${dom}

VARIANT CHANGES:
${variant.html ? `HTML to ${variant.changeType}: ${variant.html}` : ''}
${variant.css ? `CSS: ${variant.css}` : ''}

TASK: Propose at most 3 signals for this experiment:
1. **Exactly ONE primary signal** - MUST exist in both control and variant (shared action)
2. **Up to 2 mechanism signals** - Explain WHY the variant works (can be variant-only)
3. **Optional guardrail signals** - Prevent false wins (e.g., purchase_completed)

## Available Signals Catalog for ${pageType}
*Note: These are suggested signals. Choose what makes sense for your variant, or propose custom ones.*

### Primary Candidates (Must be shared between control and variant):
${primaryCandidatesText}

### Mechanisms (Can be variant-only):
${mechanismsText}

### Guardrails (Safety checks):
${guardrailsText}

## Signal Requirements

1. **Primary Signal Requirements**:
   - MUST align with the primary goal mentioned in the hypothesis
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

${this.getSelectorGenerationRules()}

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

  private truncateCode(code: string, maxLength: number = 800): string {
    if (code.length <= maxLength) {
      return code;
    }
    return `${code.slice(0, maxLength)}\n// … truncated …`;
  }

  /**
   * Get selector generation rules (shared with DOM analyzer)
   */
  private getSelectorGenerationRules(): string {
    return `SELECTOR GENERATION RULES:
- ONLY use CSS selectors that actually exist in the HTML above
- NEVER invent or guess selectors
- Use simple, stable selectors (prefer classes over IDs)
- Avoid dynamic IDs like #shopify-section-template-*

EXAMPLES:
- If HTML has: <a href="/collections/all" class="button"> → use: a.button[href="/collections/all"]
- If HTML has: <button class="btn-primary"> → use: .btn-primary
- If HTML has: <div class="hero-section"> → use: .hero-section

CRITICAL: Test your selector by checking if it exists in the HTML above. If unsure, use a simpler selector.`;
  }

  /**
   * Clean HTML for analysis (same approach as DOM analyzer)
   * Removes noise that confuses the LLM
   */
  private cleanHtmlForAnalysis(html: string): string {
    const $ = cheerio.load(html);
    
    // Remove script tags, style tags, and other non-content elements
    $('script, style, noscript, meta, link[rel="stylesheet"]').remove();
    
    // Remove comments
    $.root().contents().filter(function() {
      return this.nodeType === 8; // Comment node
    }).remove();
    
    // Normalize href attributes to use relative paths only
    $('a[href]').each((_, element) => {
      const href = $(element).attr('href');
      if (href && href.startsWith('http')) {
        // Convert absolute URLs to relative paths
        try {
          const url = new URL(href);
          $(element).attr('href', url.pathname + url.search + url.hash);
        } catch (e) {
          // If URL parsing fails, keep original href
        }
      }
    });
    
    // Clean up whitespace
    return $.html().replace(/\s+/g, ' ').trim();
  }
}

/**
 * Factory function
 */
export function createSignalGenerationService(): SignalGenerationService {
  return new SignalGenerationService();
}
