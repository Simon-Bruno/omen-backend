import { PageType } from '@shared/page-types';
import { AnalyticsRepository } from '@domain/analytics/analytics-service';
import { google } from '@ai-sdk/google';
import { ai } from '@infra/config/langsmith';
import {
    SignalGenerationInput,
    LLMSignalProposal,
    LLMSignal
} from './types';
import { z } from 'zod';

// Schema for LLM to choose from available Shopify events
const shopifyEventSelectionSchema = z.object({
    primaryEvent: z.enum(['page_viewed', 'product_added_to_cart', 'checkout_completed']).describe('Primary Shopify event to track'),
    measurementStrategy: z.string().describe('How to measure this event (e.g., "click rate", "conversion rate", "time on page")'),
    mechanismEvents: z.array(z.enum(['page_viewed', 'product_added_to_cart', 'checkout_completed'])).optional().describe('Additional events to track as mechanisms'),
    guardrailEvents: z.array(z.enum(['page_viewed', 'product_added_to_cart', 'checkout_completed'])).optional().describe('Events to track as guardrails'),
    rationale: z.string().describe('Why these events were chosen for this experiment')
});

type ShopifyEventSelection = z.infer<typeof shopifyEventSelectionSchema>;

/**
 * Shopify Signal Generator
 * Uses real user behavior data from Shopify web pixel events to generate deterministic signals
 */
export class ShopifySignalGenerator {
    constructor(private analyticsRepo: AnalyticsRepository) { }

    /**
     * Generate signals using LLM to intelligently choose from Shopify events
     */
    async generateSignals(input: SignalGenerationInput): Promise<LLMSignalProposal> {
        console.log('[SHOPIFY_SIGNAL_GENERATOR] Generating intelligent signals for:', {
            pageType: input.pageType,
            url: input.url,
            projectId: input.projectId,
            variantSelector: input.variant.selector
        });

        // Use LLM to intelligently choose which Shopify events to track
        const eventSelection = await this.selectEventsWithLLM(input);

        // Generate signals based on LLM's intelligent selection
        return this.generateSignalsFromSelection(eventSelection, input);
    }

    /**
     * Use LLM to intelligently select which Shopify events to track
     */
    private async selectEventsWithLLM(input: SignalGenerationInput): Promise<ShopifyEventSelection> {
        const prompt = this.buildShopifyEventSelectionPrompt(input);

        try {
            console.log('[SHOPIFY_SIGNAL_GENERATOR] Using LLM to select Shopify events...');

            const result = await ai.generateObject({
                model: google('gemini-2.5-pro'),
                schema: shopifyEventSelectionSchema,
                prompt,
                temperature: 0.3,
            });

            console.log('[SHOPIFY_SIGNAL_GENERATOR] LLM selected events:', {
                primary: result.object.primaryEvent,
                measurementStrategy: result.object.measurementStrategy,
                mechanisms: result.object.mechanismEvents?.length || 0,
                guardrails: result.object.guardrailEvents?.length || 0
            });

            return result.object;
        } catch (error) {
            console.error('[SHOPIFY_SIGNAL_GENERATOR] LLM event selection failed:', error);
            // Fallback to rule-based selection
            return this.getFallbackEventSelection(input);
        }
    }

    /**
     * Build prompt for LLM to select Shopify events
     */
    private buildShopifyEventSelectionPrompt(input: SignalGenerationInput): string {
        const { intent, pageType, url, variant } = input;

        const availableEvents = [
            'page_viewed - Tracks every page view on the storefront',
            'product_added_to_cart - Tracks when customers add products to cart',
            'checkout_completed - Tracks when customers complete a purchase'
        ];

        return `You are a Shopify analytics expert. Your job is to select the most relevant Shopify events to track for an A/B test.

EXPERIMENT CONTEXT:
- **Intent**: ${intent}
- **Page Type**: ${pageType}
- **URL**: ${url}
- **Variant Change**: ${variant.changeType} targeting "${variant.selector}"
- **Variant Description**: ${variant.description || 'No description provided'}

AVAILABLE SHOPIFY EVENTS (choose from these only):
${availableEvents.map(e => `- ${e}`).join('\n')}

TASK: Select the most relevant Shopify events for this experiment:

1. **Primary Event**: The main metric that directly measures the experiment's success
2. **Measurement Strategy**: How to measure this event (e.g., "conversion rate", "click rate", "time on page")
3. **Mechanism Events**: Additional events that explain WHY the variant works
4. **Guardrail Events**: Events that prevent false wins (e.g., ensure purchases still happen)

GUIDELINES:
- Choose events that align with the experiment intent
- Consider the page type and variant changes
- Use available conversion data to inform your choices
- For conversion-focused experiments, prioritize product_added_to_cart or checkout_completed
- For engagement experiments, consider page_viewed
- For clickthrough rate experiments, page_viewed should target the destination page (e.g., collections page)
- Always include checkout_completed as a guardrail for commerce experiments

IMPORTANT FOR CLICKTHROUGH EXPERIMENTS:
- If the experiment involves driving traffic to a specific page (like collections), page_viewed should be targeted to that destination page
- The system will automatically add URL targeting (e.g., "url:/collections*") for page_viewed events in clickthrough experiments
- This ensures you're measuring the right page views, not just any page views

Select events that will give the most meaningful insights for this specific experiment.`;

    }

    /**
     * Generate signals from LLM's event selection
     */
    private generateSignalsFromSelection(selection: ShopifyEventSelection, input: SignalGenerationInput): LLMSignalProposal {
        const signals: LLMSignal[] = [];

        // Primary signal from LLM selection
        const primarySignal = this.createSignalFromEvent(selection.primaryEvent, 'primary', input);
        if (primarySignal) {
            signals.push(primarySignal);
        }

        // Mechanism signals from LLM selection
        const mechanismSignals = (selection.mechanismEvents || [])
            .map(event => this.createSignalFromEvent(event, 'mechanism', input))
            .filter((signal): signal is LLMSignal => signal !== null);
        signals.push(...mechanismSignals);

        // Guardrail signals from LLM selection
        const guardrailSignals = (selection.guardrailEvents || [])
            .map(event => this.createSignalFromEvent(event, 'guardrail', input))
            .filter((signal): signal is LLMSignal => signal !== null);
        signals.push(...guardrailSignals);

        // Add variant DOM element signals if applicable
        const variantSignals = this.getMechanismSignalsFromVariant(input);
        signals.push(...variantSignals);

        // Separate signals by role
        const primary = signals.find(s => s.name === selection.primaryEvent) || this.getFallbackPrimarySignal(input.pageType);
        const mechanisms = signals.filter(s => s.name !== primary?.name && s.name !== 'checkout_completed');
        const guardrails = signals.filter(s => s.name === 'checkout_completed');

        return {
            primary,
            mechanisms: mechanisms.length > 0 ? mechanisms : undefined,
            guardrails: guardrails.length > 0 ? guardrails : undefined,
            rationale: selection.rationale
        };
    }

    /**
     * Create a signal from a Shopify event
     */
    private createSignalFromEvent(eventName: string, _role: 'primary' | 'mechanism' | 'guardrail', input: SignalGenerationInput): LLMSignal | null {
        const eventType = eventName === 'checkout_completed' ? 'purchase' : 'conversion';

        // For page_viewed events, we need to add URL targeting for clickthrough rate experiments
        let selector = undefined;
        let eventTypeValue = undefined;

        if (eventName === 'page_viewed') {
            // Check if this is a clickthrough rate experiment by looking at the intent
            const isClickthroughExperiment = input.intent.toLowerCase().includes('clickthrough') ||
                input.intent.toLowerCase().includes('click through') ||
                input.intent.toLowerCase().includes('collections page') ||
                input.intent.toLowerCase().includes('drive traffic') ||
                input.intent.toLowerCase().includes('increase clicks');

            if (isClickthroughExperiment) {
                // For clickthrough experiments, target the destination page
                const targetPage = this.extractTargetPageFromIntent(input);
                if (targetPage) {
                    selector = `url:${targetPage}`;
                    eventTypeValue = 'page_viewed';
                }
            }
        }

        return {
            name: eventName,
            type: eventType,
            existsInControl: true,
            existsInVariant: true,
            selector,
            eventType: eventTypeValue
        };
    }

    /**
     * Extract target page URL from experiment intent for clickthrough rate experiments
     * This is completely adaptive - it detects ANY URL mentioned in the intent or variant description
     */
    private extractTargetPageFromIntent(input: SignalGenerationInput): string | null {
        const { intent, variant } = input;

        // Look for any URL pattern in the text (completely adaptive)
        const urlPatterns = [
            // Full URLs: https://example.com/path or http://example.com/path
            /https?:\/\/[^\s]+/gi,
            // Paths starting with /: /path, /path/subpath, /path*
            /\/[^\s]*/gi
        ];

        // Search in both intent and variant description
        const searchText = `${intent} ${variant.description || ''}`;

        for (const pattern of urlPatterns) {
            const matches = searchText.match(pattern);
            if (matches && matches.length > 0) {
                // Take the first URL found
                let url = matches[0];

                // If it's a full URL, extract just the path
                if (url.startsWith('http')) {
                    try {
                        const urlObj = new URL(url);
                        url = urlObj.pathname;
                    } catch {
                        // If URL parsing fails, try to extract path manually
                        const pathMatch = url.match(/https?:\/\/[^\/]+(.*)/);
                        if (pathMatch) {
                            url = pathMatch[1];
                        }
                    }
                }

                // Ensure it starts with /
                if (!url.startsWith('/')) {
                    url = '/' + url;
                }

                // Add wildcard if it doesn't have one and doesn't end with /
                if (!url.endsWith('*') && !url.endsWith('/')) {
                    url = url + '*';
                }

                return url;
            }
        }

        return null;
    }

    /**
     * Fallback event selection when LLM fails
     */
    private getFallbackEventSelection(input: SignalGenerationInput): ShopifyEventSelection {
        const { pageType } = input;

        // Simple rule-based fallback
        const primaryEvent = pageType === PageType.PDP ? 'product_added_to_cart' :
            pageType === PageType.CART ? 'checkout_completed' :
                'page_viewed';

        return {
            primaryEvent: primaryEvent as any,
            measurementStrategy: 'conversion rate',
            mechanismEvents: [],
            guardrailEvents: ['checkout_completed'],
            rationale: 'Fallback selection based on page type'
        };
    }


    /**
     * Get mechanism signals from variant DOM elements we're adding/modifying
     */
    private getMechanismSignalsFromVariant(input: SignalGenerationInput): LLMSignal[] {
        const { variant } = input;
        const signals: LLMSignal[] = [];

        // If we're adding a button, create a click signal for it
        if (variant.changeType === 'addElement' && variant.selector) {
            const buttonSignal = this.createVariantElementSignal(variant.selector, input);
            if (buttonSignal) {
                signals.push(buttonSignal);
            }
        }

        // If we're modifying an existing element, create a signal for it
        if (variant.changeType === 'modifyElement' && variant.selector) {
            const modifiedSignal = this.createVariantElementSignal(variant.selector, input);
            if (modifiedSignal) {
                signals.push(modifiedSignal);
            }
        }

        return signals;
    }

    /**
     * Create a signal for a variant DOM element we're adding/modifying
     */
    private createVariantElementSignal(selector: string, input: SignalGenerationInput): LLMSignal | null {
        // Only create signals for interactive elements
        if (!this.isInteractiveElement(selector)) {
            return null;
        }

        const signalName = this.generateSignalNameFromSelector(selector);

        return {
            name: signalName,
            type: 'conversion',
            selector: selector,
            eventType: 'click',
            existsInControl: input.variant.changeType === 'addElement' ? false : true,
            existsInVariant: true
        };
    }

    /**
     * Check if a selector represents an interactive element
     */
    private isInteractiveElement(selector: string): boolean {
        const interactiveSelectors = [
            'button', 'a', 'input[type="submit"]', 'input[type="button"]',
            '[onclick]', '[role="button"]', '.btn', '.button', '.cta'
        ];

        return interactiveSelectors.some(pattern =>
            selector.includes(pattern) || selector.match(new RegExp(pattern.replace('*', '.*')))
        );
    }

    /**
     * Generate a signal name from a CSS selector
     */
    private generateSignalNameFromSelector(selector: string): string {
        // Convert selector to snake_case signal name
        return selector
            .replace(/[^a-zA-Z0-9\s-]/g, '') // Remove special chars
            .replace(/\s+/g, '_') // Replace spaces with underscores
            .replace(/-/g, '_') // Replace hyphens with underscores
            .toLowerCase()
            .replace(/^_+|_+$/g, '') // Remove leading/trailing underscores
            + '_click';
    }


    /**
     * Detect page type from URL (simplified version)
     */
    private detectPageTypeFromUrl(url: string): PageType {
        try {
            const urlObj = new URL(url);
            const pathname = urlObj.pathname;

            if (!pathname || pathname === '/') return PageType.HOME;
            if (pathname.includes('/products/')) return PageType.PDP;
            if (pathname.includes('/collections/')) return PageType.COLLECTION;
            if (pathname.includes('/cart')) return PageType.CART;
            if (pathname.includes('/checkout')) return PageType.CHECKOUT;

            return PageType.OTHER;
        } catch {
            return PageType.OTHER;
        }
    }

    /**
     * Get a fallback primary signal for a page type
     */
    private getFallbackPrimarySignal(pageType: PageType): LLMSignal {
        const fallbackSignals: Record<PageType, { name: string; type: 'conversion' | 'purchase' }> = {
            [PageType.HOME]: { name: 'home_to_collection_click', type: 'conversion' },
            [PageType.COLLECTION]: { name: 'collection_to_pdp_click', type: 'conversion' },
            [PageType.PDP]: { name: 'add_to_cart_click', type: 'conversion' },
            [PageType.CART]: { name: 'begin_checkout_click', type: 'conversion' },
            [PageType.CHECKOUT]: { name: 'purchase_completed', type: 'purchase' },
            [PageType.ABOUT]: { name: 'page_cta_click', type: 'conversion' },
            [PageType.CONTACT]: { name: 'contact_form_submit', type: 'conversion' },
            [PageType.SEARCH]: { name: 'search_result_click', type: 'conversion' },
            [PageType.ACCOUNT]: { name: 'account_action_click', type: 'conversion' },
            [PageType.OTHER]: { name: 'page_cta_click', type: 'conversion' }
        };

        const signal = fallbackSignals[pageType] || { name: 'page_cta_click', type: 'conversion' as const };

        return {
            name: signal.name,
            type: signal.type,
            selector: undefined, // Shopify events don't need selectors
            eventType: signal.type === 'purchase' ? undefined : 'click',
            existsInControl: true,
            existsInVariant: true
        };
    }

}

/**
 * Factory function
 */
export function createShopifySignalGenerator(analyticsRepo: AnalyticsRepository): ShopifySignalGenerator {
    return new ShopifySignalGenerator(analyticsRepo);
}
