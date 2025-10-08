// Design System Extraction Service
import { z } from 'zod';
import { generateObject } from 'ai';
import { google } from '@ai-sdk/google';
import { getVariantGenerationAIConfig } from '@shared/ai-config';

// Simplified design system schema focused on practical CSS values
export const designSystemSchema = z.object({
  typography: z.object({
    primary_font: z.string().describe('Primary font family'),
    body_font: z.string().describe('Body text font family'),
    heading_sizes: z.object({
      h1: z.string().describe('H1 font size in px'),
      h2: z.string().describe('H2 font size in px'),
      button: z.string().describe('Button font size in px')
    }),
    font_weights: z.object({
      regular: z.string().describe('Regular weight (e.g., 400)'),
      bold: z.string().describe('Bold weight (e.g., 700)')
    }),
    text_transform_buttons: z.enum(['none', 'uppercase', 'capitalize']).describe('Button text transform')
  }),

  colors: z.object({
    primary_button_bg: z.string().describe('Primary button background color (hex)'),
    primary_button_text: z.string().describe('Primary button text color (hex)'),
    primary_button_hover_bg: z.string().describe('Primary button hover background (hex)'),
    accent_color: z.string().describe('Accent/highlight color (hex)'),
    text_primary: z.string().describe('Primary text color (hex)'),
    background: z.string().describe('Main background color (hex)')
  }),

  spacing: z.object({
    button_padding: z.string().describe('Button padding (e.g., "12px 24px")'),
    button_margin: z.string().describe('Button margin (e.g., "16px 0")'),
    section_spacing: z.string().describe('Space between sections (e.g., "48px")')
  }),

  borders: z.object({
    button_radius: z.string().describe('Button border radius (e.g., "4px", "9999px")'),
    card_radius: z.string().describe('Card border radius (e.g., "8px")'),
    button_border: z.string().describe('Button border style (e.g., "none", "1px solid #000")')
  }),

  shadows: z.object({
    button_shadow: z.string().describe('Button box shadow'),
    button_hover_shadow: z.string().describe('Button hover box shadow'),
    card_shadow: z.string().describe('Card box shadow')
  }),

  animations: z.object({
    transition_duration: z.string().describe('Default transition duration (e.g., "0.2s")'),
    transition_timing: z.string().describe('Default timing function (e.g., "ease-in-out")'),
    button_hover_transform: z.string().describe('Button hover transform (e.g., "scale(1.05)", "translateY(-2px)")')
  }),

  ui_patterns: z.object({
    uses_uppercase_buttons: z.boolean(),
    uses_rounded_corners: z.boolean(),
    uses_shadows: z.boolean(),
    uses_gradients: z.boolean(),
    uses_animations: z.boolean(),
    button_style: z.enum(['solid', 'outline', 'ghost', 'gradient']).describe('Primary button style')
  })
});

export type DesignSystem = z.infer<typeof designSystemSchema>;

export class DesignSystemExtractor {
  async extractDesignSystem(
    screenshot: string,
    htmlContent: string | null
  ): Promise<DesignSystem> {
    const prompt = `Analyze this website screenshot and HTML to extract the design system and visual patterns.

Focus on extracting EXACT CSS values that are currently being used in the site, particularly for:
- Buttons (primary CTA buttons, add to cart, shop now, etc.)
- Typography (font families, sizes, weights)
- Colors (exact hex codes from buttons and key elements)
- Spacing and padding patterns
- Border radius and shadows
- Animations and transitions

IMPORTANT: Extract the ACTUAL values from the site, not generic defaults. Look at:
1. The primary call-to-action buttons (Add to Cart, Shop Now, etc.)
2. The actual font families being used (inspect the CSS)
3. The exact colors in hex format
4. The specific padding, margins, and spacing
5. Any hover effects or animations present

Return a JSON object with the exact CSS values found in the site.`;

    const aiConfig = getVariantGenerationAIConfig();

    try {
      const messages: any[] = [
        {
          role: 'user',
          content: [
            { type: "text", text: prompt },
            { type: "image", image: this.toDataUrl(screenshot) }
          ]
        }
      ];

      // Add HTML content if available
      if (htmlContent) {
        messages[0].content.push({
          type: "text",
          text: `HTML Content (first 10000 chars): ${htmlContent.substring(0, 10000)}`
        });
      }

      const result = await generateObject({
        model: google(aiConfig.model),
        schema: designSystemSchema,
        messages
      });

      console.log('[DESIGN_SYSTEM] Extracted design system successfully');
      return result.object;
    } catch (error) {
      console.error('[DESIGN_SYSTEM] Failed to extract design system:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to extract design system: ${errorMessage}`);
    }
  }

  private toDataUrl(b64: string): string {
    if (!b64) return '';
    if (b64.startsWith('data:')) return b64;
    return `data:image/png;base64,${b64}`;
  }
}