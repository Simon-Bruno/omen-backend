// Visual Refinement Service
import { z } from 'zod';
import { generateObject } from 'ai';
import { google } from '@ai-sdk/google';
import { getVariantGenerationAIConfig } from '@shared/ai-config';

// Schema for refinement output
const refinedCodeSchema = z.object({
  javascript_code: z.string().describe('Refined JavaScript that improves the variant'),
  improvements: z.array(z.string()).describe('List of improvements made to the code')
});

export class VisualRefinementService {
  private aiConfig = getVariantGenerationAIConfig();

  async refineVariantCode(
    originalCode: string,
    variantDescription: string,
    screenshot: string
  ): Promise<{ javascript_code: string; improvements: string[] }> {
    try {
      console.log(`[VISUAL_REFINEMENT] Refining variant code: ${variantDescription}`);

      const refinementPrompt = `
You are a JavaScript expert specializing in A/B test variant refinement.

ORIGINAL CODE:
\`\`\`javascript
${originalCode}
\`\`\`

VARIANT DESCRIPTION: ${variantDescription}

TASK: Refine the JavaScript code to improve:
1. **Code Quality**: Better error handling, cleaner syntax, modern JavaScript practices
2. **Performance**: Optimize DOM queries, reduce reflows, efficient event handling
3. **Accessibility**: Add ARIA attributes, keyboard navigation, screen reader support
4. **Cross-browser Compatibility**: Use standard APIs, add fallbacks
5. **Maintainability**: Clear variable names, comments, modular structure

REFINEMENT GUIDELINES:
- Keep the core functionality intact
- Improve error handling with try-catch blocks
- Use modern JavaScript (ES6+) features
- Add proper event cleanup
- Ensure accessibility compliance
- Optimize for performance
- Add helpful comments

Return the refined JavaScript code and list the specific improvements made.
`;

      const result = await generateObject({
        model: google(this.aiConfig.model),
        schema: refinedCodeSchema,
        messages: [
          {
            role: 'user',
            content: [
              { type: "text", text: refinementPrompt },
              { type: "image", image: screenshot }
            ]
          }
        ]
      });

      console.log(`[VISUAL_REFINEMENT] Refinement completed with ${result.object.improvements.length} improvements`);
      return result.object;

    } catch (error) {
      console.error('[VISUAL_REFINEMENT] Refinement failed:', error);
      // Return original code if refinement fails
      return {
        javascript_code: originalCode,
        improvements: ['Refinement failed - using original code']
      };
    }
  }
}