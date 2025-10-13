// Prompts for variant generation service
import { Hypothesis } from '@features/hypotheses_generation/types';

export function buildVariantGenerationPrompt(hypothesis: Hypothesis): string {
    return `
Generate 3 A/B test variants for this hypothesis:

HYPOTHESIS: ${hypothesis.description}
PROBLEM: ${hypothesis.current_problem}
EXPECTED LIFT: ${hypothesis.predicted_lift_range.min}-${hypothesis.predicted_lift_range.max}%

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

Return variants as a JSON array with the structure defined in the schema.
`;
}

export function buildCodeGenerationPrompt(): string {
  return `You are a JavaScript expert specializing in A/B test variant implementation.

CONTEXT: Generate clean, production-ready JavaScript code that modifies website elements for A/B testing.

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
1. **Element Selection**: Find target elements with robust selectors
2. **Validation**: Check if elements exist before modification
3. **Styling**: Apply CSS changes programmatically
4. **Event Handling**: Add interactive behaviors
5. **Cleanup**: Remove event listeners and restore original state
6. **Error Handling**: Graceful fallbacks for missing elements
</code_structure>

Generate clean, well-commented JavaScript code that:
- Modifies the specified target elements
- Implements the variant changes described
- Includes proper error handling and fallbacks
- Follows modern JavaScript best practices
- Is ready for production deployment

Return only the JavaScript code without any markdown formatting or explanations.`;
}