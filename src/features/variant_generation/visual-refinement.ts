// Visual Refinement Service - Second stage for polishing generated code
import { z } from 'zod';
import { generateObject } from 'ai';
import { google } from '@ai-sdk/google';
import { getVariantGenerationAIConfig } from '@shared/ai-config';
import { DesignSystem } from './design-system-extractor';

// Schema for refined code output
const refinedCodeSchema = z.object({
  javascript_code: z.string().describe('Refined JavaScript with professional CSS'),
  css_improvements: z.array(z.string()).describe('List of visual improvements made'),
  accessibility_fixes: z.array(z.string()).describe('Accessibility improvements applied')
});

export class VisualRefinementService {
  async refineVariantCode(
    originalCode: string,
    variantDescription: string,
    designSystem: DesignSystem,
    screenshot: string
  ): Promise<{ javascript_code: string; improvements: string[] }> {
    const prompt = `You are a SENIOR UI/UX ENGINEER specializing in creating pixel-perfect, high-converting web interfaces.

CURRENT VARIANT CODE:
${originalCode}

VARIANT DESCRIPTION:
${variantDescription}

DESIGN SYSTEM:
Typography:
- Primary Font: ${designSystem.typography.primary_font}
- Button Font Size: ${designSystem.typography.heading_sizes.button}
- Font Weight Bold: ${designSystem.typography.font_weights.bold}
- Text Transform: ${designSystem.typography.text_transform_buttons}

Colors:
- Primary Button: ${designSystem.colors.primary_button_bg}
- Button Text: ${designSystem.colors.primary_button_text}
- Hover BG: ${designSystem.colors.primary_button_hover_bg}
- Accent: ${designSystem.colors.accent_color}

Spacing:
- Button Padding: ${designSystem.spacing.button_padding}
- Button Margin: ${designSystem.spacing.button_margin}

Effects:
- Border Radius: ${designSystem.borders.button_radius}
- Shadow: ${designSystem.shadows.button_shadow}
- Hover Shadow: ${designSystem.shadows.button_hover_shadow}
- Transition: ${designSystem.animations.transition_duration} ${designSystem.animations.transition_timing}
- Hover Transform: ${designSystem.animations.button_hover_transform}

YOUR TASK:
Refine the provided JavaScript code to create a VISUALLY STUNNING implementation that:

1. VISUAL POLISH:
   - Add smooth transitions for ALL state changes (hover, focus, active)
   - Include professional box-shadows with proper layering
   - Implement subtle but effective micro-animations
   - Use the exact design system values provided
   - Add gradient effects if the brand uses them
   - Include proper :active and :focus states

2. MODERN CSS TECHNIQUES:
   - Use CSS custom properties for maintainable values
   - Add backdrop-filter effects where appropriate
   - Include transform3d for hardware acceleration
   - Use will-change for performance optimization
   - Add proper cubic-bezier easing functions

3. ACCESSIBILITY:
   - Ensure minimum 4.5:1 color contrast ratio
   - Add focus-visible styles for keyboard navigation
   - Include proper ARIA attributes
   - Respect prefers-reduced-motion
   - Maintain 44px minimum touch targets

4. RESPONSIVE DESIGN:
   - Add mobile-specific adjustments
   - Include proper touch states for mobile
   - Scale fonts and padding appropriately

5. CROSS-BROWSER:
   - Include vendor prefixes where needed
   - Add fallbacks for older browsers
   - Test for Safari-specific issues

CRITICAL REQUIREMENTS:
- The code must be a self-contained IIFE
- Use inline styles or inject a <style> tag - do NOT rely on existing CSS classes
- Include error handling with try-catch
- Make it work on both desktop and mobile
- The visual quality must be EXCEPTIONAL - like it was designed by a top agency

Return the refined JavaScript code with all visual improvements integrated.`;

    const aiConfig = getVariantGenerationAIConfig();

    try {
      const result = await generateObject({
        model: google(aiConfig.model),
        schema: refinedCodeSchema,
        messages: [
          {
            role: 'user',
            content: [
              { type: "text", text: prompt },
              { type: "image", image: this.toDataUrl(screenshot) }
            ]
          }
        ]
      });

      console.log('[VISUAL_REFINEMENT] Successfully refined variant code');
      console.log('[VISUAL_REFINEMENT] Improvements:', result.object.css_improvements.join(', '));
      console.log('[VISUAL_REFINEMENT] Accessibility fixes:', result.object.accessibility_fixes.join(', '));

      return {
        javascript_code: result.object.javascript_code,
        improvements: [
          ...result.object.css_improvements,
          ...result.object.accessibility_fixes
        ]
      };
    } catch (error) {
      console.error('[VISUAL_REFINEMENT] Failed to refine code:', error);
      // Return original code if refinement fails
      return {
        javascript_code: originalCode,
        improvements: ['Refinement failed - using original code']
      };
    }
  }

  private toDataUrl(b64: string): string {
    if (!b64) return '';
    if (b64.startsWith('data:')) return b64;
    return `data:image/png;base64,${b64}`;
  }
}