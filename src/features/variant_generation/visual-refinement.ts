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

LAYOUT CONTEXT ANALYSIS:
Before refining the code, analyze the screenshot for layout context:
1. **Background Analysis**: Identify the background colors and patterns in the target section
2. **Contrast Assessment**: Check for any existing contrast issues (white-on-white, light-on-light)
3. **Visual Integration**: Ensure the variant integrates seamlessly with existing design patterns
4. **Section Context**: Understand the visual context of where the variant will be placed
5. **CRITICAL**: Look for white text on white/light backgrounds - this is a major accessibility issue
6. **TEXT RENDERING ANALYSIS**: Examine how text currently wraps and flows on the page
7. **RESPONSIVE CONCERNS**: Identify potential text overflow or wrapping issues on different screen sizes

CONTEXT-AWARE REFINEMENT:
- Ensure text colors provide sufficient contrast against the actual background shown in the screenshot
- Match the existing visual style and spacing of the target section
- Avoid creating new contrast issues (e.g., white text on white backgrounds)
- Consider the visual hierarchy and how the variant fits with surrounding content
- Use colors that work harmoniously with the existing design
- If the screenshot shows white text on white backgrounds, this must be fixed with proper contrast
- NEVER modify existing text content - only add new elements or modify styling
- CRITICAL: Fix any text that appears to be cut off, overflowing, or wrapping awkwardly
- Ensure text is readable and properly sized across all device viewports

DESIGN SYSTEM:
Typography:
- Font Family: ${designSystem.typography.font_family}
- Base Size: ${designSystem.typography.font_size_base}
- Large Size: ${designSystem.typography.font_size_large}
- Normal Weight: ${designSystem.typography.font_weight_normal}
- Bold Weight: ${designSystem.typography.font_weight_bold}
- Line Height: ${designSystem.typography.line_height}

Colors:
- Primary: ${designSystem.colors.primary}
- Primary Hover: ${designSystem.colors.primary_hover}
- Secondary: ${designSystem.colors.secondary}
- Text: ${designSystem.colors.text}
- Text Light: ${designSystem.colors.text_light}
- Background: ${designSystem.colors.background}
- Border: ${designSystem.colors.border}

Spacing:
- Small Padding: ${designSystem.spacing.padding_small}
- Medium Padding: ${designSystem.spacing.padding_medium}
- Large Padding: ${designSystem.spacing.padding_large}
- Small Margin: ${designSystem.spacing.margin_small}
- Medium Margin: ${designSystem.spacing.margin_medium}
- Large Margin: ${designSystem.spacing.margin_large}

Borders:
- Small Radius: ${designSystem.borders.radius_small}
- Medium Radius: ${designSystem.borders.radius_medium}
- Large Radius: ${designSystem.borders.radius_large}
- Border Width: ${designSystem.borders.width}

Shadows:
- Small: ${designSystem.shadows.small}
- Medium: ${designSystem.shadows.medium}
- Large: ${designSystem.shadows.large}

Effects:
- Transition: ${designSystem.effects.transition}
- Hover Transform: ${designSystem.effects.hover_transform}
- Hover Opacity: ${designSystem.effects.opacity_hover}

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
   - CRITICAL: Fix text wrapping and overflow issues
   - Use clamp() for responsive font sizes: clamp(1rem, 2.5vw, 2rem)
   - Add word-wrap: break-word and overflow-wrap: break-word for long text
   - Ensure text doesn't get cut off on smaller screens
   - Include @media queries for mobile (375px) and tablet (768px) breakpoints
   - Test how text will render on different screen orientations

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
- TEXT RENDERING: Fix any text that appears cut off, overflowing, or wrapping awkwardly
- RESPONSIVE TEXT: Ensure all text is readable and properly sized across all viewports
- OVERFLOW PREVENTION: Use max-width: 100% and proper text wrapping to prevent overflow
- MOBILE TEXT: Ensure text is touch-friendly and readable on mobile devices

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