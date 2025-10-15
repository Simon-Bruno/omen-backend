/**
 * Base Template System for Hypothesis Generation
 * Provides a modular, extensible framework for page-specific hypothesis templates
 */

import { PageType } from '@shared/page-types';

/**
 * Base hypothesis template structure
 */
export interface HypothesisTemplate {
  id: string;
  category: HypothesisCategory;
  pageTypes: PageType[];
  title: string;
  description: string;
  problem: string;
  solution: string;
  metric: ConversionMetric;
  expectedLift: LiftRange;
  confidence: number; // 0-1 confidence score based on industry data
  applicabilityCheck?: (context: PageContext) => boolean;
  variations?: TemplateVariation[];
}

/**
 * Categories for organizing hypotheses
 */
export enum HypothesisCategory {
  URGENCY = 'urgency',
  SOCIAL_PROOF = 'social_proof',
  TRUST = 'trust',
  CLARITY = 'clarity',
  VALUE = 'value',
  FRICTION = 'friction',
  NAVIGATION = 'navigation',
  VISUAL = 'visual',
  PERSONALIZATION = 'personalization',
  MOBILE = 'mobile'
}

/**
 * Primary conversion metrics
 */
export enum ConversionMetric {
  CONVERSION_RATE = 'Conversion rate',
  ADD_TO_CART_RATE = 'Add-to-cart rate',
  CLICK_THROUGH_RATE = 'Click-through rate',
  BOUNCE_RATE = 'Bounce rate',
  TIME_ON_PAGE = 'Time on page',
  FORM_COMPLETION = 'Form completion rate',
  ENGAGEMENT_RATE = 'Engagement rate',
  REVENUE_PER_VISITOR = 'Revenue per visitor'
}

/**
 * Expected lift range for hypothesis
 */
export interface LiftRange {
  min: number; // Decimal (e.g., 0.05 = 5%)
  max: number; // Decimal (e.g., 0.15 = 15%)
}

/**
 * Context about the current page for applicability checks
 */
export interface PageContext {
  pageType: PageType;
  url: string;
  hasReviews?: boolean;
  hasVideo?: boolean;
  hasPricing?: boolean;
  hasImages?: boolean;
  isMobile?: boolean;
  elements?: DetectedElements;
}

/**
 * Elements detected on the page
 */
export interface DetectedElements {
  addToCart?: boolean;
  reviews?: boolean;
  price?: boolean;
  images?: boolean;
  video?: boolean;
  trustBadges?: boolean;
  shipping?: boolean;
  returns?: boolean;
  stock?: boolean;
  variants?: boolean;
}

/**
 * Variation of a template with different parameters
 */
export interface TemplateVariation {
  id: string;
  name: string;
  adjustments: {
    title?: string;
    solution?: string;
    expectedLift?: LiftRange;
  };
}

/**
 * Base class for hypothesis template providers
 */
export abstract class HypothesisTemplateProvider {
  protected templates: HypothesisTemplate[] = [];

  /**
   * Get all templates for a specific page type
   */
  getTemplatesForPageType(pageType: PageType): HypothesisTemplate[] {
    return this.templates.filter(template =>
      template.pageTypes.includes(pageType)
    );
  }

  /**
   * Get templates by category
   */
  getTemplatesByCategory(category: HypothesisCategory): HypothesisTemplate[] {
    return this.templates.filter(template =>
      template.category === category
    );
  }

  /**
   * Get applicable templates based on context
   */
  getApplicableTemplates(context: PageContext): HypothesisTemplate[] {
    return this.templates.filter(template => {
      // Check page type compatibility
      if (!template.pageTypes.includes(context.pageType)) {
        return false;
      }

      // Check custom applicability if defined
      if (template.applicabilityCheck) {
        return template.applicabilityCheck(context);
      }

      return true;
    });
  }

  /**
   * Get top templates by confidence score
   */
  getTopTemplates(
    pageType: PageType,
    limit: number = 5
  ): HypothesisTemplate[] {
    return this.getTemplatesForPageType(pageType)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, limit);
  }

  /**
   * Abstract method to be implemented by specific providers
   */
  abstract loadTemplates(): void;
}

/**
 * Template registry for managing multiple providers
 */
export class HypothesisTemplateRegistry {
  private providers: Map<string, HypothesisTemplateProvider> = new Map();

  /**
   * Register a template provider
   */
  register(name: string, provider: HypothesisTemplateProvider): void {
    provider.loadTemplates();
    this.providers.set(name, provider);
  }

  /**
   * Get all templates for a page type from all providers
   */
  getAllTemplatesForPageType(pageType: PageType): HypothesisTemplate[] {
    const allTemplates: HypothesisTemplate[] = [];

    for (const provider of this.providers.values()) {
      allTemplates.push(...provider.getTemplatesForPageType(pageType));
    }

    return allTemplates;
  }

  /**
   * Get applicable templates from all providers
   */
  getApplicableTemplates(context: PageContext): HypothesisTemplate[] {
    const allTemplates: HypothesisTemplate[] = [];

    for (const provider of this.providers.values()) {
      allTemplates.push(...provider.getApplicableTemplates(context));
    }

    return allTemplates;
  }

  /**
   * Get templates by category from all providers
   */
  getTemplatesByCategory(category: HypothesisCategory): HypothesisTemplate[] {
    const allTemplates: HypothesisTemplate[] = [];

    for (const provider of this.providers.values()) {
      allTemplates.push(...provider.getTemplatesByCategory(category));
    }

    return allTemplates;
  }

  /**
   * Get a specific provider
   */
  getProvider(name: string): HypothesisTemplateProvider | undefined {
    return this.providers.get(name);
  }
}