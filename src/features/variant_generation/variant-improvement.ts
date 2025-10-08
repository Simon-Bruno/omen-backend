import { generateObject } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';
import { getVariantGenerationAIConfig } from '@shared/ai-config';

const improvedVariantSchema = z.object({
    javascript_code: z.string().describe("The improved JavaScript code based on the feedback"),
    improvements_made: z.array(z.string()).describe("List of specific improvements made based on the feedback"),
    confidence: z.number().min(0).max(1).describe("Confidence that the improvements address the feedback (0-1)")
});

export interface VariantImprovementRequest {
    originalCode: string;
    targetSelector: string;
    variantDescription: string;
    userFeedback: string;
    screenshot?: string;
}

export class VariantImprovementService {
    async improveVariant(request: VariantImprovementRequest): Promise<{
        javascript_code: string;
        improvements_made: string[];
        confidence: number;
    }> {
        const aiConfig = getVariantGenerationAIConfig();

        const prompt = this.buildImprovementPrompt(request);

        const messages: any[] = [
            {
                role: 'user',
                content: request.screenshot ? [
                    { type: "text", text: prompt },
                    { type: "image", image: request.screenshot }
                ] : [
                    { type: "text", text: prompt }
                ]
            }
        ];

        const result = await generateObject({
            model: google(aiConfig.model),
            schema: improvedVariantSchema,
            messages
        });

        return result.object;
    }

    private buildImprovementPrompt(request: VariantImprovementRequest): string {
        return `You are a UX/UI design and frontend development expert specializing in A/B testing optimization.

## Current Variant
Description: ${request.variantDescription}
Target Selector: ${request.targetSelector}

## Current JavaScript Code
\`\`\`javascript
${request.originalCode}
\`\`\`

## User Feedback
"${request.userFeedback}"

## Your Task
Improve the variant's JavaScript code to address the user's feedback, focusing on both visual design and user experience.

## Design & UX Analysis Framework
1. **Visual Hierarchy**: Assess if the feedback relates to visual prominence, spacing, or layout issues
2. **Alignment & Positioning**: Check for centering, alignment, or positioning problems
3. **Typography**: Consider font sizes, weights, line-height, and readability
4. **Color & Contrast**: Evaluate if colors need adjustment for better visibility or brand consistency
5. **Spacing & Padding**: Analyze margin, padding, and whitespace issues
6. **Responsive Design**: Ensure the solution works across different screen sizes
7. **Interaction & Animation**: Consider hover states, transitions, and micro-interactions
8. **Accessibility**: Maintain WCAG compliance and keyboard navigation

## Common UX/Design Issues to Check
- **"Not centered"**: Use flexbox/grid, check parent containers, consider transform: translate
- **"Too small/large"**: Adjust font-size, padding, min-height/width
- **"Hard to see"**: Increase contrast, adjust colors, add shadows or borders
- **"Doesn't stand out"**: Enhance visual weight with color, size, or positioning
- **"Looks out of place"**: Match existing design patterns, check border-radius, shadows
- **"Not clickable looking"**: Add cursor:pointer, hover states, button-like appearance
- **"Moves other content"**: Use position:absolute/fixed, adjust margins carefully

## CSS Properties Commonly Needed
- Positioning: position, top, left, transform, z-index
- Layout: display, flex properties, grid properties, width, height
- Spacing: margin, padding, gap
- Typography: font-size, font-weight, line-height, text-transform, letter-spacing
- Visual: background, color, border, border-radius, box-shadow
- Animation: transition, animation, transform
- Responsive: media queries, viewport units (vw, vh), clamp()

## Implementation Requirements
1. PRESERVE the variant's core functionality
2. USE CSS best practices for the specific issue
3. INCLUDE smooth transitions (0.3s ease) for any state changes
4. ENSURE cross-browser compatibility (use prefixes if needed)
5. ADD comments explaining design decisions
6. TEST for common viewport sizes (mobile: 375px, tablet: 768px, desktop: 1920px)
7. MAINTAIN existing brand colors and fonts where possible

## Code Structure
\`\`\`javascript
(function() {
    'use strict';

    // Clear documentation of what the improvement addresses
    // E.g., "Fix: Center button horizontally and vertically within container"

    // Your improved code here
    // Include inline comments for complex CSS calculations

})();
\`\`\`

${request.screenshot ? '## Visual Context\nThe screenshot shows the current appearance. Focus on the specific visual/UX issue mentioned in the feedback and provide a precise CSS solution.' : ''}

Provide improved JavaScript that specifically addresses the design/UX feedback with appropriate CSS modifications.`;
    }
}

export function createVariantImprovementService(): VariantImprovementService {
    return new VariantImprovementService();
}