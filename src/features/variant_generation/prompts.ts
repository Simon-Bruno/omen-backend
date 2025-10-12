// Prompts for variant generation service
import { Hypothesis } from '@features/hypotheses_generation/types';


export function buildButtonVariantGenerationPrompt(hypothesis: Hypothesis, variantIndex?: number): string {
    const focus = variantIndex === 0 ? 'COLOR' : variantIndex === 1 ? 'SIZE' : 'STYLE';
    
    return `
Generate 1 simple button variant for this hypothesis:

HYPOTHESIS: ${hypothesis.description}
PROBLEM: ${hypothesis.current_problem}

FOCUS: ${focus} - ${variantIndex === 0 ? 'Change colors/contrast to make button stand out' : 
  variantIndex === 1 ? 'Change size/typography to increase prominence' : 
  'Change visual style (border, shadow, etc.) to improve appeal'}

RESPONSIVE DESIGN REQUIREMENTS:
- Button must work perfectly on mobile (375px), tablet (768px), and desktop (1920px)
- Text must be readable and properly sized at all screen sizes
- Touch targets must be at least 44px on mobile devices
- Button should not break layout or overflow containers
- Consider how button text will wrap on smaller screens
- MOBILE-FIRST APPROACH: Design button for mobile first, then enhance for larger screens
- Prioritize mobile user experience and touch interaction

TEXT RENDERING CONSIDERATIONS:
- Button text should wrap naturally without breaking awkwardly
- Ensure sufficient padding for touch interaction
- Consider font size scaling for different viewports
- Avoid text that gets cut off or overflows button boundaries
- Use responsive typography techniques for scalable button text
- Prevent text overflow with proper CSS properties

Create a simple button variant that:
- Makes one clear visual change
- Looks professional and clean
- Is easy to implement with CSS
- Focuses on the ${focus.toLowerCase()} approach
- Works responsively across all devices
- Maintains accessibility standards

VARIANT NAMING:
- Use simple, descriptive name
- Include the main change (e.g., "Blue Button", "Larger Text", "Rounded Style")
- Avoid generic terms

Return JSON with "variants" array containing 1 object with: variant_label, description, rationale`;
}

export function buildVariantGenerationPrompt(hypothesis: Hypothesis): string {
    return `
Generate 3 A/B test variants for this hypothesis:

HYPOTHESIS: ${hypothesis.description}
PROBLEM: ${hypothesis.current_problem}
EXPECTED LIFT: ${hypothesis.predicted_lift_range.min}-${hypothesis.predicted_lift_range.max}%

Create 3 variants that test the same hypothesis with different approaches:
1. COLOR: Change colors/contrast to make elements stand out
2. SIZE: Change size/typography to increase prominence  
3. STYLE: Change visual style (border, shadow, etc.) to improve appeal

If the hypothesis mentions "redesign" or "completely change", create MAJOR visual transformations that users will notice.

RESPONSIVE DESIGN REQUIREMENTS:
- All variants MUST work across mobile (375px), tablet (768px), and desktop (1920px) viewports
- Text must be readable and properly wrapped at all screen sizes
- Avoid text that breaks awkwardly or gets cut off on smaller screens
- Consider how large text will wrap and flow on different devices
- Use relative units (rem, em, %) instead of fixed pixels where appropriate
- Ensure touch targets are at least 44px on mobile devices
- MOBILE-FIRST APPROACH: Design for mobile first, then enhance for larger screens
- Consider the mobile user experience as the primary concern

TEXT RENDERING CONSIDERATIONS:
- Large text should wrap naturally without breaking mid-word
- Consider line-height and letter-spacing for readability
- Avoid text that extends beyond container boundaries
- Test how text will appear on different screen orientations
- Ensure sufficient contrast ratios across all backgrounds
- Use responsive typography techniques (clamp, vw units) for scalable text
- Prevent text overflow with proper CSS properties (word-wrap, overflow-wrap)

Each variant should be:
- Simple and focused on one clear change
- Easy to implement with CSS
- Visually distinct and professional
- Based on the hypothesis above
- Responsive and mobile-friendly
- Accessible across all device types

VARIANT NAMING:
- Use simple, descriptive names
- Include the main visual change (e.g., "Blue Button", "Larger Text", "Rounded Style")
- Avoid generic terms like "Primary Button" or "High-Contrast"

Return JSON with "variants" array containing exactly 3 objects with: variant_label, description, rationale`;
}
