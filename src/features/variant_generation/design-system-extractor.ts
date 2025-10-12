// Design System Extraction Service
import { z } from 'zod';
import { FirecrawlService } from '@features/brand_analysis/firecrawl-service';

// Essential design system schema for code generation
export const designSystemSchema = z.object({
  colors: z.object({
    primary: z.string().describe('Primary brand color (hex)'),
    primary_hover: z.string().describe('Primary hover color (hex)'),
    secondary: z.string().describe('Secondary/accent color (hex)'),
    text: z.string().describe('Main text color (hex)'),
    text_light: z.string().describe('Light text color (hex)'),
    background: z.string().describe('Background color (hex)'),
    border: z.string().describe('Border color (hex)')
  }),

  typography: z.object({
    font_family: z.string().describe('Main font family'),
    font_size_base: z.string().describe('Base font size (e.g., "16px")'),
    font_size_large: z.string().describe('Large font size (e.g., "18px")'),
    font_weight_normal: z.string().describe('Normal font weight (e.g., "400")'),
    font_weight_bold: z.string().describe('Bold font weight (e.g., "600")'),
    line_height: z.string().describe('Line height (e.g., "1.5")')
  }),

  spacing: z.object({
    padding_small: z.string().describe('Small padding (e.g., "8px")'),
    padding_medium: z.string().describe('Medium padding (e.g., "16px")'),
    padding_large: z.string().describe('Large padding (e.g., "24px")'),
    margin_small: z.string().describe('Small margin (e.g., "8px")'),
    margin_medium: z.string().describe('Medium margin (e.g., "16px")'),
    margin_large: z.string().describe('Large margin (e.g., "24px")')
  }),

  borders: z.object({
    radius_small: z.string().describe('Small border radius (e.g., "4px")'),
    radius_medium: z.string().describe('Medium border radius (e.g., "8px")'),
    radius_large: z.string().describe('Large border radius (e.g., "12px")'),
    width: z.string().describe('Border width (e.g., "1px")')
  }),

  shadows: z.object({
    small: z.string().describe('Small shadow (e.g., "0 1px 3px rgba(0,0,0,0.1)")'),
    medium: z.string().describe('Medium shadow (e.g., "0 4px 6px rgba(0,0,0,0.1)")'),
    large: z.string().describe('Large shadow (e.g., "0 10px 15px rgba(0,0,0,0.1)")')
  }),

  effects: z.object({
    transition: z.string().describe('Default transition (e.g., "all 0.2s ease")'),
    hover_transform: z.string().describe('Hover transform (e.g., "translateY(-2px)")'),
    opacity_hover: z.string().describe('Hover opacity (e.g., "0.8")')
  })
});

export type DesignSystem = z.infer<typeof designSystemSchema>;

export class DesignSystemExtractor {
  private firecrawlService: FirecrawlService;

  constructor() {
    this.firecrawlService = new FirecrawlService();
  }

  async extractDesignSystemWithFirecrawl(url: string): Promise<DesignSystem> {
    console.log(`[DESIGN_SYSTEM] Extracting design system using Firecrawl for: ${url}`);

    const designSystemPrompt = `Extract the essential design system from this website for code generation.

Focus on these key elements:
- Colors: primary, primary hover, secondary, text, text light, background, border
- Typography: font family, base size, large size, normal weight, bold weight, line height
- Spacing: small/medium/large padding and margin values
- Borders: small/medium/large radius values, border width
- Shadows: small/medium/large shadow values
- Effects: default transition, hover transform, hover opacity

IMPORTANT: Extract ACTUAL values from the site, not generic defaults. Look at:
1. Primary call-to-action buttons (Add to Cart, Shop Now, etc.)
2. Main font family and sizing used throughout the site
3. Exact hex colors from buttons, text, and backgrounds
4. Spacing patterns (padding, margins) used consistently
5. Border radius and shadow values from cards/buttons
6. Transition and hover effects present

Return a comprehensive JSON object with the exact values found.`;

    try {
      // Use Firecrawl's structured extraction directly - no need to parse HTML with AI!
      const result = await this.firecrawlService.scrapeForDesignSystem(url, designSystemPrompt);

      if (!result.success || !result.data) {
        throw new Error(`Firecrawl design system extraction failed: ${result.error}`);
      }

      console.log(`[DESIGN_SYSTEM] Design system extracted directly via Firecrawl structured extraction with authentication`);

      // Return the design system data directly - no casting needed!
      return result.data;
    } catch (error) {
      console.error('[DESIGN_SYSTEM] Firecrawl structured extraction failed:', error);
      throw new Error(`Design system extraction failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}