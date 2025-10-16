/**
 * Enhanced Variant Generation Prompts
 * Functions to build prompts following the existing working patterns
 */

import { Hypothesis } from '@features/hypotheses_generation/types';
import { InjectionPoint } from './dom-analyzer';
import { PageType } from '@shared/page-types';

/**
 * Enhanced variant generation prompt that includes injection points and page context
 */
export function buildEnhancedVariantPrompt(
  hypothesis: Hypothesis,
  injectionPoints: InjectionPoint[],
  pageType: PageType
): string {
  const basePrompt = `Generate 3 A/B test variants for this hypothesis:

HYPOTHESIS: ${hypothesis.description}
PROBLEM: ${hypothesis.current_problem}
EXPECTED LIFT: ${hypothesis.predicted_lift_range.min}-${hypothesis.predicted_lift_range.max}%

INJECTION POINTS AVAILABLE:
${injectionPoints.map((point, idx) =>
  `${idx + 1}. ${point.selector} (${point.type})
   Operation: ${point.operation}
   Purpose: ${point.description}
   ${point.pdpContext ? `   Context: ${JSON.stringify(point.pdpContext)}` : ''}`
).join('\n')}

PAGE TYPE: ${pageType}
${getPageSpecificGuidance(pageType)}

Generate 3 creative variants that address the hypothesis. Focus on meaningful differences that could impact user behavior:

Consider these approaches when creating variants:
- Visual prominence and attention-grabbing elements (CSS-only)
- Layout and information architecture improvements
- Interactive and engagement enhancements (CSS animations/transitions)
- Content and messaging optimizations
- User flow and conversion path improvements
- Styling and color scheme modifications
- Typography and spacing adjustments
- Button and form element enhancements

IMPORTANT CONSTRAINTS:
- NO external videos, images, or media files
- NO references to non-existent URLs or file paths
- ONLY use CSS for visual effects and animations
- ONLY modify existing content and styling
- Focus on CSS-based solutions for visual impact

SDK-COMPATIBLE SELECTOR REQUIREMENTS:
- Use SIMPLE selectors that work with document.querySelector()
- Prefer single class names like ".text-block" or ".hero__content-wrapper"
- AVOID complex combinations like ".hero__content-wrapper .rte-formatter.text-block"
- AVOID multi-class selectors like ".text-block.text-block--ASG5LandCMk13OFhJQ__text_4bfhJq"
- Target elements will be identified by simple, stable class names

<visual_context>
You will receive a screenshot of the current page and brand analysis data to understand the existing design and brand context.
</visual_context>

For each variant, provide:
1. **Variant Label**: Clear, descriptive name (e.g., "Hero Section Redesign", "CTA Button Enhancement")
2. **Description**: Detailed explanation of what changes and why
3. **Rationale**: Why this variant should work based on the hypothesis
4. **Target Element**: CSS selector or description of what gets modified
5. **Expected Impact**: How this addresses the problem and drives the expected lift

Focus on variants that:
- Directly address the hypothesis problem
- Are technically feasible to implement
- Have clear, measurable differences
- Respect the existing brand and design context
- Follow web accessibility best practices
- Use only CSS and existing content (no external videos, images, or files)
- Modify existing elements rather than adding new media resources

Return variants as a JSON array with the structure defined in the schema.`;

  return basePrompt;
}

/**
 * Get page-specific guidance based on page type
 */
function getPageSpecificGuidance(pageType: PageType): string {
  switch (pageType) {
    case PageType.PDP:
      return `
PDP-SPECIFIC CONSIDERATIONS:
- Focus on elements near the add-to-cart button for maximum impact
- Consider urgency and scarcity messaging near price/stock indicators
- Enhance product information presentation (features, benefits, specs)
- Improve trust signals near purchase decision points
- Optimize product image gallery interactions
- Ensure variants work with product variant selectors (size, color)`;

    case PageType.COLLECTION:
    case PageType.CATEGORY:
      return `
COLLECTION-SPECIFIC CONSIDERATIONS:
- Apply changes consistently across all product cards
- Consider adding badges or labels to highlight special products
- Improve product comparison capabilities
- Enhance filtering and sorting visibility
- Add quick-view or quick-add functionality hints
- Ensure variants work with pagination and lazy loading`;

    case PageType.HOME:
      return `
HOMEPAGE-SPECIFIC CONSIDERATIONS:
- Focus on hero section for first impressions
- Enhance value proposition clarity
- Improve navigation to key product categories
- Add social proof and trust indicators
- Optimize for different user intents (browse, search, buy)
- Consider seasonal or promotional messaging placement`;

    case PageType.CART:
      return `
CART-SPECIFIC CONSIDERATIONS:
- Reduce abandonment with trust and security signals
- Highlight free shipping thresholds
- Add urgency for items with limited stock
- Improve cross-sell and upsell presentation
- Simplify the checkout process visualization
- Add payment method trust badges`;

    default:
      return '';
  }
}

/**
 * Build code generation prompt with injection point context
 */
export function buildEnhancedCodePrompt(
  variant: any,
  injectionPoints: InjectionPoint[]
): string {
  return `You are a JavaScript expert specializing in A/B test variant implementation.

VARIANT TO IMPLEMENT:
Label: ${variant.label}
Description: ${variant.description}
Target: ${variant.targetElement}

AVAILABLE INJECTION POINTS:
${injectionPoints.map(point =>
  `- ${point.selector}: ${point.operation} operation for ${point.type}`
).join('\n')}

<code_requirements>
1. Use modern JavaScript (ES6+) with proper error handling
2. Target specific DOM elements with precise selectors
3. Apply CSS changes programmatically
4. Include fallback mechanisms for missing elements
5. Ensure cross-browser compatibility
6. Follow accessibility best practices
7. Use semantic HTML and ARIA attributes when creating elements
8. Implement proper event handling and cleanup
</code_requirements>

<implementation_guidelines>
- Use document.querySelector() or document.querySelectorAll() for element selection
- Apply styles via element.style or CSS classes
- Create new elements with document.createElement()
- Use addEventListener() for event handling
- Include try-catch blocks for error handling
- Add console.log() for debugging (remove in production)
- Use requestAnimationFrame() for smooth animations
- Implement proper cleanup on page unload
- Use textContent for simple text changes (more reliable than innerHTML)
</implementation_guidelines>

<code_structure>
(function() {
  'use strict';

  // 1. Wait for DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyVariant);
  } else {
    applyVariant();
  }

  function applyVariant() {
    // 2. Element Selection
    const targetElement = document.querySelector('${variant.targetElement || injectionPoints[0]?.selector}');
    if (!targetElement) {
      console.warn('Target element not found');
      return;
    }

    // 3. Apply modifications
    // [Your implementation here]

    // 4. Handle dynamic content if needed
    // [MutationObserver if required]
  }
})();
</code_structure>

Generate clean, well-commented JavaScript code that:
- Modifies the specified target elements
- Implements the variant changes described
- Includes proper error handling and fallbacks
- Follows modern JavaScript best practices
- Is ready for production deployment

Return only the JavaScript code without any markdown formatting or explanations.`;
}