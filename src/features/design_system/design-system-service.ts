// Design System Extraction Service
import { FirecrawlService } from '@features/brand_analysis/firecrawl-service';
import { ProjectDAL } from '@infra/dal';
import { designSystemSchema, type DesignSystem } from '@features/variant_generation/design-system-extractor';

export interface DesignSystemExtractionResult {
  success: boolean;
  data?: DesignSystem;
  error?: string;
}

export class DesignSystemService {
  private firecrawlService: FirecrawlService;

  constructor() {
    this.firecrawlService = new FirecrawlService();
  }

  /**
   * Extract design system from a website URL using Firecrawl
   */
  async extractDesignSystem(url: string): Promise<DesignSystemExtractionResult> {
    try {
      console.log(`[DESIGN_SYSTEM] Starting design system extraction for: ${url}`);

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

      const result = await this.firecrawlService.scrapeForDesignSystem(url, designSystemPrompt);

      if (!result.success || !result.data) {
        throw new Error(`Design system extraction failed: ${result.error}`);
      }

      // Validate the extracted data against our schema to ensure consistency
      try {
        const validatedData = designSystemSchema.parse(result.data);
        console.log(`[DESIGN_SYSTEM] Design system extracted and validated successfully for: ${url}`);

        return {
          success: true,
          data: validatedData
        };
      } catch (validationError) {
        console.error(`[DESIGN_SYSTEM] Design system validation failed for ${url}:`, validationError);
        throw new Error(`Design system validation failed: ${validationError instanceof Error ? validationError.message : 'Unknown validation error'}`);
      }
    } catch (error) {
      console.error(`[DESIGN_SYSTEM] Error extracting design system from ${url}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Extract and save design system for a project
   */
  async extractAndSaveDesignSystem(projectId: string, url: string): Promise<DesignSystemExtractionResult> {
    try {
      console.log(`[DESIGN_SYSTEM] Extracting design system for project: ${projectId}`);

      // Extract design system
      const extractionResult = await this.extractDesignSystem(url);

      if (!extractionResult.success || !extractionResult.data) {
        return extractionResult;
      }

      // Save to database
      await ProjectDAL.updateProjectDesignSystem(projectId, extractionResult.data);

      console.log(`[DESIGN_SYSTEM] Design system saved for project: ${projectId}`);

      return extractionResult;
    } catch (error) {
      console.error(`[DESIGN_SYSTEM] Error extracting and saving design system for project ${projectId}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Get cached design system for a project
   */
  async getCachedDesignSystem(projectId: string): Promise<DesignSystem | null> {
    try {
      console.log(`[DESIGN_SYSTEM] Getting cached design system for project: ${projectId}`);
      return await ProjectDAL.getProjectDesignSystem(projectId);
    } catch (error) {
      console.error(`[DESIGN_SYSTEM] Error getting cached design system for project ${projectId}:`, error);
      return null;
    }
  }
}
