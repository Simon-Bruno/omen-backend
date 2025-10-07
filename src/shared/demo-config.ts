/**
 * Demo Configuration
 *
 * This file contains configuration for demo mode features.
 * Set DEMO_CONDITION to true to enable hardcoded demo behavior.
 */

/**
 * Main demo condition flag
 * When true, enables hardcoded demo features like:
 * - Specific element targeting (buttons/selectors)
 * - Predefined hypotheses focus
 * - Demo-specific variant generation
 */
export const DEMO_CONDITION = false;

/**
 * Demo target element configuration
 * Used when DEMO_CONDITION is true to focus on specific elements
 */
export const DEMO_TARGET_ELEMENT = {
    selector: 'a[href="/collections/all"]',
    description: 'Shop all button/link',
    html: '<a href="/collections/all">Shop all</a>',
    // Alternative selector for hypotheses generation (with more specific classes)
    hypothesesSelector: 'a[href="/collections/all"].size-style.link',
    hypothesesHtml: '<a href="/collections/all" class="size-style link link--ARGpDamJzVW9Gd2JMa__button_nazDaa" style="--size-style-width: fit-content;--size-style-height: ;--size-style-width-mobile: fit-content; --size-style-width-mobile-min: fit-content;">Shop all →</a>'
};

/**
 * Helper function to check if demo mode is enabled
 */
export function isDemoMode(): boolean {
    return DEMO_CONDITION;
}

/**
 * Get the appropriate selector based on context
 */
export function getDemoSelector(context: 'variants' | 'hypotheses' = 'variants'): string {
    if (!DEMO_CONDITION) {
        return '';
    }
    return context === 'hypotheses'
        ? DEMO_TARGET_ELEMENT.hypothesesSelector
        : DEMO_TARGET_ELEMENT.selector;
}

/**
 * Get the appropriate HTML based on context
 */
export function getDemoHtml(context: 'variants' | 'hypotheses' = 'variants'): string {
    if (!DEMO_CONDITION) {
        return '';
    }
    return context === 'hypotheses'
        ? DEMO_TARGET_ELEMENT.hypothesesHtml
        : DEMO_TARGET_ELEMENT.html;
}