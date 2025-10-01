// Prompts for variant generation service
import { Hypothesis } from '@features/hypotheses_generation/types';

export function buildButtonVariantGenerationPrompt(hypothesis: Hypothesis): string {
    return `
You are a CRO-focused UX/UI design assistant specializing in button optimization. Your task is to take a structured hypothesis and generate 1 practical, testable button variant for A/B testing.

HYPOTHESIS TO TEST:
- Hypothesis: ${hypothesis.description}
- Primary Outcome: ${hypothesis.primary_outcome}
- Current Problem: ${hypothesis.current_problem}
- Why It Works: ${hypothesis.why_it_works.map(w => w.reason).join(', ')}
- Predicted Lift: ${hypothesis.predicted_lift_range.min}-${hypothesis.predicted_lift_range.max}%

TARGET ELEMENT: Button/Link (specifically targeting "Shop all" button)

YOUR TASK:
Generate 1 button variant that focuses on improving conversion through better button design, states, and UX.

BUTTON DESIGN PRINCIPLES TO CONSIDER:
- Visual hierarchy and prominence
- Color psychology and contrast
- Size and touch targets (minimum 44px)
- Typography and readability
- Hover, focus, and active states
- Loading states and feedback
- Accessibility (WCAG 2.1 AA compliance)
- Mobile responsiveness

VARIANT REQUIREMENTS:
Each variant must include:

1. VISUAL DESIGN:
   - Color scheme (background, text, border)
   - Size and dimensions
   - Typography (font weight, size, letter spacing)
   - Border radius and shadows
   - Icon or visual elements

2. INTERACTIVE STATES:
   - Default state
   - Hover state (color, scale, shadow changes)
   - Active/pressed state
   - Focus state (for keyboard navigation)
   - Disabled state (if applicable)

3. ACCESSIBILITY:
   - Color contrast ratios (minimum 4.5:1 for normal text)
   - Touch target size (minimum 44x44px)
   - ARIA labels and roles
   - Keyboard navigation support

4. MOBILE OPTIMIZATION:
   - Touch-friendly sizing
   - Readable text at mobile sizes
   - Proper spacing and padding

VARIANT IDEAS TO CONSIDER:
- Color variations (primary, secondary, accent colors)
- Size variations (small, medium, large)
- Style variations (solid, outline, ghost, gradient)
- Typography variations (bold, regular, all-caps)
- Visual enhancements (icons, badges, animations)
- Layout variations (full-width, centered, right-aligned)

CONSTRAINTS:
- Keep changes measurable in an experiment
- Ensure variants are visually distinct but cohesive
- Focus on conversion optimization principles
- Consider the brand analysis context
- Make variants implementable with CSS/HTML

VARIANT NAMING RULES:
- Use a UNIQUE, descriptive name that clearly differentiates this variant
- Include specific visual characteristics (color, style, size, shape)
- Examples: "Solid Turquoise Button", "Outlined White Button", "Large Bold CTA", "Rounded Green Button"

IMPORTANT: Return your response as a JSON object with a "variants" array containing exactly 1 variant object. The variant must have the fields: variant_label, description, rationale, accessibility_consideration, and implementation_notes.

Note: The system will automatically generate the actual CSS and HTML code for this variant, so focus on clear, specific descriptions that can be easily translated into code.`;
}

export function buildVariantGenerationPrompt(hypothesis: Hypothesis): string {
    return `
You are a CRO-focused UX/UI design assistant. Your task is to take a structured hypothesis and generate 3 practical, testable variants for A/B testing.

HYPOTHESIS TO TEST:
- Hypothesis: ${hypothesis.description}
- Primary Outcome: ${hypothesis.primary_outcome}
- Current Problem: ${hypothesis.current_problem}
- Why It Works: ${hypothesis.why_it_works.map(w => w.reason).join(', ')}
- Predicted Lift: ${hypothesis.predicted_lift_range.min}-${hypothesis.predicted_lift_range.max}%

YOUR TASK:
Based on the hypothesis above, identify the most likely DOM element(s) or site objects that this hypothesis refers to and generate 3 practical, testable variants.

Step 1 - Translate Hypothesis to DOM Target:
- Infer the relevant DOM element(s) (class names, IDs, attributes, role, or common HTML tags)
- If multiple candidates exist (e.g., several CTAs), identify the primary one based on hierarchy or context
- Output both a human-readable description (e.g., "Main Add to Cart button below price") and a technical guess (e.g., .product-form button[type=submit])
- If no reliable target can be inferred, output a fallback: "Unable to map hypothesis to a specific DOM object"

Step 2 - Generate Variants:
For the identified element(s), create 3 variant ideas with:
- Variant Label - UNIQUE, descriptive name that clearly differentiates this variant (e.g., "Solid Turquoise Button", "Outlined White Button", "Large Bold CTA")
- Description - what visually or structurally changes
- Rationale - why this might improve performance (CRO/UX principle)
- Accessibility Consideration - check for WCAG compliance (contrast, tap size, ARIA roles, etc.)
- Implementation Notes - specific technical details for implementation

VARIANT NAMING RULES:
- Each variant must have a UNIQUE, descriptive name
- Include specific visual characteristics (color, style, size, shape)
- Avoid generic terms like "Primary Action Button" for multiple variants
- Examples: "Solid Turquoise Button", "Outlined White Button", "Large Bold CTA", "Rounded Green Button"

CONSTRAINTS:
- Keep all suggestions UI-focused (no backend, pricing, or copywriting strategy beyond short CTA tweaks)
- Ensure changes are measurable in an experiment
- Stay general enough to apply to ~80% of Shopify stores
- Build upon the existing hypothesis rationale and success metrics
- Consider the accessibility issues already identified in the hypothesis

IMPORTANT: Return your response as a JSON object with a "variants" array containing exactly 3 variant objects. Each variant must have the fields: variant_label, description, rationale, accessibility_consideration, and implementation_notes. 

Note: After generating these variants, the system will automatically generate the actual CSS and HTML code for each variant, so focus on clear, specific descriptions that can be easily translated into code. Do NOT return a schema definition - return actual data.`;
}
