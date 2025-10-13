// Visual Refinement Service
import { z } from 'zod';
import { ai } from '@infra/config/langsmith';
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
6. **Element Modification Reliability**: Ensure text/content changes work universally
7. **Robust Selectors**: Use fallback selectors and element validation
8. **Universal Patterns**: Apply patterns that work for any element type

UNIVERSAL IMPROVEMENTS TO APPLY:
- Add try-catch blocks around all DOM operations
- Use textContent for simple text changes (more reliable than innerHTML)
- Validate elements exist before modification
- Add fallback selectors for better reliability
- Use modern JavaScript features (const/let, arrow functions, template literals)
- Add proper error logging for debugging
- Ensure all modifications work across different browsers
- Use semantic DOM methods (textContent, classList, style)
- Add element type validation when needed
- Include cleanup logic for event listeners
- NEVER use octal escape sequences (\\0, \\1, etc.) in template literals - use unicode escapes (\\u0000) or string literals instead

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

      console.log(`[LANGSMITH] Starting AI call: Visual Refinement for variant: ${variantDescription.substring(0, 50)}...`);
      const result = await ai.generateObject({
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
      console.log(`[LANGSMITH] Completed AI call: Visual Refinement - Applied ${result.object.improvements.length} improvements`);

      console.log(`[VISUAL_REFINEMENT] Refinement completed with ${result.object.improvements.length} improvements`);

      // Validate and fix any JavaScript syntax issues in the refined code
      const validatedResult = this.validateAndFixRefinedCode(result.object);

      return validatedResult;

    } catch (error) {
      console.error('[VISUAL_REFINEMENT] Refinement failed:', error);
      // Return original code if refinement fails
      return {
        javascript_code: originalCode,
        improvements: ['Refinement failed - using original code']
      };
    }
  }

  // Validate and fix JavaScript syntax issues in refined code
  private validateAndFixRefinedCode(result: { javascript_code: string; improvements: string[] }): { javascript_code: string; improvements: string[] } {
    if (!result.javascript_code) {
      return result;
    }

    console.log(`[VISUAL_REFINEMENT] Validating refined JavaScript code`);

    // Fix common issues that cause "Invalid escape in identifier" errors
    let fixedCode = result.javascript_code;

    // Fix invalid escape sequences in template literals and strings
    fixedCode = this.fixInvalidEscapeSequences(fixedCode);

    // Fix common quote/backtick escaping issues
    fixedCode = this.fixQuoteEscapingIssues(fixedCode);

    // Validate that the code is syntactically correct
    if (fixedCode !== result.javascript_code) {
      try {
        // Basic syntax check
        new Function(fixedCode);
        console.log(`[VISUAL_REFINEMENT] Fixed JavaScript syntax issues in refined code`);
        return {
          javascript_code: fixedCode,
          improvements: [...result.improvements, 'Fixed JavaScript syntax issues']
        };
      } catch (error: any) {
        console.warn(`[VISUAL_REFINEMENT] Could not fix JavaScript syntax in refined code:`, error.message);
      }
    }

    return result;
  }

  // Fix invalid escape sequences that cause "Invalid escape in identifier" errors
  private fixInvalidEscapeSequences(code: string): string {
    let fixed = code;

    // Fix octal escape sequences in template literals (e.g., \0, \1, \7)
    // These are not allowed in template strings, so we convert them to their unicode equivalents
    fixed = fixed.replace(/`([^`]*)`/g, (_match, content) => {
      // Replace octal escapes with unicode escapes in template literal content
      const fixedContent = content.replace(/\\([0-7]{1,3})/g, (_escapeMatch: string, octal: string) => {
        const charCode = parseInt(octal, 8);
        return `\\u${charCode.toString(16).padStart(4, '0')}`;
      });
      return `\`${fixedContent}\``;
    });

    // Fix cases where backslashes are incorrectly escaped in template literals
    // Example: \` .button { color: \\'red\\' } \` -> \` .button { color: 'red' } \`
    fixed = fixed.replace(/\\(['"`])(\w+)\1/g, "$1$2$1");

    // Fix double backslashes in template literals that shouldn't be there
    // Example: \` .button { content: "test\\" } \` -> \` .button { content: "test" } \`
    fixed = fixed.replace(/\\\\"/g, '"');
    fixed = fixed.replace(/\\\\'/g, "'");

    // Fix invalid escape sequences at the end of lines in template literals
    fixed = fixed.replace(/\\\s*$/gm, '');

    return fixed;
  }

  // Fix quote escaping issues that can cause syntax errors
  private fixQuoteEscapingIssues(code: string): string {
    let fixed = code;

    // Fix mismatched quotes in template literals
    // This is a simple fix - more complex cases might need manual review
    fixed = fixed.replace(/`([^`]*)`([^`]*``)/g, (match, content, extra) => {
      // If we have extra backticks, it suggests malformed template literal
      if (extra.includes('`')) {
        return `\`${content.replace(/`/g, "'")}\``;
      }
      return match;
    });

    return fixed;
  }
}