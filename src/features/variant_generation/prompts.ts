// Prompts for variant generation service
import { Hypothesis } from '@features/hypotheses_generation/types';

export function buildButtonVariantGenerationPrompt(hypothesis: Hypothesis, variantIndex?: number): string {
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

VARIANT FOCUS (based on variant index):
${variantIndex === 0 ? 'Variant 1: Focus on COLOR and CONTRAST - Use bold, high-contrast colors to make the button stand out' : 
  variantIndex === 1 ? 'Variant 2: Focus on SIZE and TYPOGRAPHY - Use larger sizes and bold typography to increase prominence' : 
  'Variant 3: Focus on ANIMATION and INTERACTION - Use subtle animations, micro-interactions, and engaging effects to make the button more compelling'}

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
- MEDIA/LINK GUARDRAILS (critical): Do NOT introduce new images/videos or external assets, and do NOT change link destinations (href). Limit suggestions to text, classes, styles, layout, and states using existing DOM and assets. If a concept requires new media or URL changes, explicitly state to skip that aspect.

VARIANT NAMING RULES:
- Use a UNIQUE, descriptive name that clearly differentiates this variant
- Include specific visual characteristics (color, style, size, shape)
- Each variant must have a COMPLETELY DIFFERENT name - no similar words
- Examples: "Solid Turquoise Button", "Outlined White Button", "Large Bold CTA", "Rounded Green Button"
- AVOID: "Primary Action Button", "High-Contrast Button", "CTA Button" - these are too generic
- REQUIRE: Specific colors, sizes, styles, or shapes in every name

SPECIFIC NAMING FOR THIS VARIANT:
${variantIndex === 0 ? 'Variant 1 (COLOR focus): Include specific color names and contrast terms (e.g., "Solid Turquoise Button", "Dark Navy CTA", "Bright Orange Button")' : 
  variantIndex === 1 ? 'Variant 2 (SIZE focus): Include specific size and typography terms (e.g., "Large Bold CTA", "Compact Uppercase Button", "Jumbo Text Button")' : 
  'Variant 3 (ANIMATION focus): Include specific animation and interaction terms (e.g., "Pulse Animation Button", "Hover Glow CTA", "Bounce Effect Button")'}

IMPORTANT: Return your response as a JSON object with a "variants" array containing exactly 1 variant object. The variant must have the fields: variant_label, description, rationale, accessibility_consideration, and implementation_notes.

Note: The system will automatically generate the actual CSS and HTML code for this variant, so focus on clear, specific descriptions that can be easily translated into code.`;
}

export function buildVariantGenerationPrompt(hypothesis: Hypothesis, designSystem?: any): string {
    const designContext = designSystem ? `

DESIGN SYSTEM & VISUAL GUIDELINES:
Typography:
- Primary Font: ${designSystem.typography?.primary_font || 'Not specified'}
- Button Font Size: ${designSystem.typography?.heading_sizes?.button || '16px'}
- Font Weight (Bold): ${designSystem.typography?.font_weights?.bold || '700'}
- Text Transform: ${designSystem.typography?.text_transform_buttons || 'none'}

Colors:
- Primary Button BG: ${designSystem.colors?.primary_button_bg || '#000'}
- Button Text Color: ${designSystem.colors?.primary_button_text || '#fff'}
- Hover Background: ${designSystem.colors?.primary_button_hover_bg || '#333'}
- Accent Color: ${designSystem.colors?.accent_color || '#0066cc'}

Spacing & Layout:
- Button Padding: ${designSystem.spacing?.button_padding || '12px 24px'}
- Button Margin: ${designSystem.spacing?.button_margin || '16px 0'}

Visual Effects:
- Border Radius: ${designSystem.borders?.button_radius || '4px'}
- Button Shadow: ${designSystem.shadows?.button_shadow || 'none'}
- Hover Shadow: ${designSystem.shadows?.button_hover_shadow || '0 4px 8px rgba(0,0,0,0.15)'}

Animations:
- Transition: ${designSystem.animations?.transition_duration || '0.2s'} ${designSystem.animations?.transition_timing || 'ease-in-out'}
- Hover Transform: ${designSystem.animations?.button_hover_transform || 'scale(1.05)'}

UI Patterns:
- Button Style Type: ${designSystem.ui_patterns?.button_style || 'solid'}
- Uses Gradients: ${designSystem.ui_patterns?.uses_gradients || false}
- Uses Animations: ${designSystem.ui_patterns?.uses_animations || true}
` : '';

    return `
You are a SENIOR UI/UX DESIGNER with expertise in conversion optimization and modern web design. Your task is to create VISUALLY STUNNING, HIGH-CONVERTING variants that look professional and polished.
${designContext}
HYPOTHESIS TO TEST:
- Hypothesis: ${hypothesis.description}
- Primary Outcome: ${hypothesis.primary_outcome}
- Current Problem: ${hypothesis.current_problem}
- Why It Works: ${hypothesis.why_it_works.map(w => w.reason).join(', ')}
- Predicted Lift: ${hypothesis.predicted_lift_range.min}-${hypothesis.predicted_lift_range.max}%

YOUR TASK:
Create 1 VISUALLY EXCEPTIONAL variant that is:
1. BEAUTIFUL - Modern, polished, professional design
2. ON-BRAND - Consistent with the extracted design system
3. HIGH-CONVERTING - Using proven UX patterns
4. ACCESSIBLE - WCAG 2.1 AA compliant
5. SMOOTH - With elegant animations and micro-interactions

Based on the hypothesis above, identify the most likely DOM element(s) or site objects that this hypothesis refers to and generate 1 practical, testable variant.

Step 1 - Translate Hypothesis to DOM Target:
- Infer the relevant DOM element(s) (class names, IDs, attributes, role, or common HTML tags)
- If multiple candidates exist (e.g., several CTAs), identify the primary one based on hierarchy or context
- Output both a human-readable description (e.g., "Main Add to Cart button below price") and a technical guess (e.g., .product-form button[type=submit])
- If no reliable target can be inferred, output a fallback: "Unable to map hypothesis to a specific DOM object"

Step 2 - Generate a Variant:
For the identified element(s), create 1 variant idea that takes a clear approach (e.g., COLOR/CONTRAST, SIZE/TYPOGRAPHY, or ANIMATION/INTERACTION) and provide:

- Variant Label - Include specific visual characteristics (e.g., "Solid Turquoise Button", "Large Bold CTA", "Hover Glow CTA")
- Description - what visually or structurally changes
- Rationale - why this might improve performance (CRO/UX principle)
- Accessibility Consideration - check for WCAG compliance (contrast, tap size, ARIA roles, etc.)
- Implementation Notes - specific technical details for implementation

VARIANT NAMING RULES:
- Each variant must have a COMPLETELY UNIQUE, descriptive name
- Include specific visual characteristics (color, style, size, shape) in EVERY name
- Avoid generic terms like "Primary Action Button", "High-Contrast Button", "CTA Button"
- Each name must be visually distinct and memorable
- Examples: "Solid Turquoise Button", "Outlined White Button", "Large Bold CTA", "Rounded Green Button"
- REQUIRE: Different colors, sizes, styles, or shapes for each variant
- NO REPEATING: If one variant is "Solid Turquoise", the next can't be "Solid Blue" - use completely different approaches

CONSTRAINTS:
- Keep all suggestions UI-focused (no backend, pricing, or copywriting strategy beyond short CTA tweaks)
- Ensure changes are measurable in an experiment
- Stay general enough to apply to ~80% of Shopify stores
- Build upon the existing hypothesis rationale and success metrics
- Consider the accessibility issues already identified in the hypothesis
 - MEDIA/LINK GUARDRAILS (critical): Do NOT introduce new images/videos or external assets, and do NOT change link destinations (href). Limit suggestions to text, classes, styles, layout, microcopy variations of existing CTAs, and states using existing DOM and assets. If a concept would require new media or URL changes, explicitly state to skip that part.

CRITICAL NAMING REQUIREMENT:
- The variant should clearly signal its primary focus (e.g., COLOR, SIZE/TYPOGRAPHY, or ANIMATION/INTERACTION)
- The name must be visually distinct and memorable

IMPORTANT: Return your response as a JSON object with a "variants" array containing exactly 1 variant object. The variant must have the fields: variant_label, description, rationale, accessibility_consideration, and implementation_notes. 

Note: After generating these variants, the system will automatically generate the actual CSS and HTML code for each variant, so focus on clear, specific descriptions that can be easily translated into code. Do NOT return a schema definition - return actual data.`;
}
