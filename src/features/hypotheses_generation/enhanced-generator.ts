/**
 * Enhanced Hypothesis Generator
 * Combines template-based and AI-powered hypothesis generation
 */

import { detectPageType, PageType } from '@shared/page-types';
import {
  getHypothesisStrategyFactory,
  PageContext,
  GeneratedHypothesis
} from './templates';

export interface EnhancedHypothesisOptions {
  url: string;
  projectId: string;
  userInput?: string;
  useTemplates?: boolean;
  fallbackToAI?: boolean;
  htmlContent?: string;
  elements?: DetectedPageElements;
}

export interface DetectedPageElements {
  hasAddToCart?: boolean;
  hasReviews?: boolean;
  hasPrice?: boolean;
  hasImages?: boolean;
  hasVideo?: boolean;
  hasTrustBadges?: boolean;
  hasShipping?: boolean;
  hasStock?: boolean;
}

/**
 * Enhanced hypothesis generator that combines templates and AI
 */
export class EnhancedHypothesisGenerator {
  private strategyFactory = getHypothesisStrategyFactory();

  /**
   * Generate hypotheses using templates and/or AI
   */
  async generateHypotheses(options: EnhancedHypothesisOptions): Promise<GeneratedHypothesis[]> {
    const {
      url,
      projectId,
      userInput,
      useTemplates = true,
      fallbackToAI = true,
      htmlContent,
      elements
    } = options;

    // Detect page type
    const pageType = detectPageType(url);
    console.log(`[ENHANCED_GENERATOR] Detected page type: ${pageType} for URL: ${url}`);

    // Try template-based generation first
    if (useTemplates) {
      try {
        const templateHypotheses = this.generateFromTemplates(
          pageType,
          url,
          userInput,
          elements
        );

        if (templateHypotheses.length > 0) {
          console.log(`[ENHANCED_GENERATOR] Generated ${templateHypotheses.length} hypotheses from templates`);
          return templateHypotheses;
        }
      } catch (error) {
        console.warn(`[ENHANCED_GENERATOR] Template generation failed:`, error);
      }
    }

    // Fallback to AI generation if needed
    if (fallbackToAI) {
      console.log(`[ENHANCED_GENERATOR] Falling back to AI generation`);
      // This would call the existing AI-based generation
      // For now, return empty array as placeholder
      return [];
    }

    return [];
  }

  /**
   * Generate hypotheses from templates
   */
  private generateFromTemplates(
    pageType: PageType,
    url: string,
    userInput?: string,
    elements?: DetectedPageElements
  ): GeneratedHypothesis[] {
    // Build page context
    const context: PageContext = {
      pageType,
      url,
      hasReviews: elements?.hasReviews,
      hasVideo: elements?.hasVideo,
      hasPricing: elements?.hasPrice,
      hasImages: elements?.hasImages,
      elements: elements ? {
        addToCart: elements.hasAddToCart,
        reviews: elements.hasReviews,
        price: elements.hasPrice,
        images: elements.hasImages,
        video: elements.hasVideo,
        trustBadges: elements.hasTrustBadges,
        shipping: elements.hasShipping,
        stock: elements.hasStock
      } : undefined
    };

    // Generate using strategy factory
    return this.strategyFactory.generateHypotheses(context, userInput);
  }

  /**
   * Get available templates for a page type
   */
  getAvailableTemplates(pageType: PageType) {
    return this.strategyFactory.getAllTemplates(pageType);
  }

  /**
   * Detect elements from HTML content
   */
  detectPageElements(htmlContent: string): DetectedPageElements {
    const elements: DetectedPageElements = {};

    // Simple pattern-based detection
    const htmlLower = htmlContent.toLowerCase();

    // Check for add to cart button
    elements.hasAddToCart =
      htmlLower.includes('add to cart') ||
      htmlLower.includes('add-to-cart') ||
      htmlLower.includes('addtocart') ||
      htmlLower.includes('add to bag');

    // Check for reviews
    elements.hasReviews =
      htmlLower.includes('review') ||
      htmlLower.includes('rating') ||
      htmlLower.includes('stars') ||
      htmlLower.includes('testimonial');

    // Check for pricing
    elements.hasPrice =
      htmlLower.includes('price') ||
      htmlLower.includes('cost') ||
      htmlLower.includes('$') ||
      htmlLower.includes('€') ||
      htmlLower.includes('£');

    // Check for images
    elements.hasImages =
      htmlLower.includes('<img') ||
      htmlLower.includes('image') ||
      htmlLower.includes('photo') ||
      htmlLower.includes('picture');

    // Check for video
    elements.hasVideo =
      htmlLower.includes('<video') ||
      htmlLower.includes('youtube') ||
      htmlLower.includes('vimeo') ||
      htmlLower.includes('player');

    // Check for trust badges
    elements.hasTrustBadges =
      htmlLower.includes('secure') ||
      htmlLower.includes('guarantee') ||
      htmlLower.includes('certified') ||
      htmlLower.includes('verified') ||
      htmlLower.includes('ssl');

    // Check for shipping info
    elements.hasShipping =
      htmlLower.includes('shipping') ||
      htmlLower.includes('delivery') ||
      htmlLower.includes('free ship');

    // Check for stock indicators
    elements.hasStock =
      htmlLower.includes('in stock') ||
      htmlLower.includes('out of stock') ||
      htmlLower.includes('available') ||
      htmlLower.includes('left in stock') ||
      htmlLower.includes('remaining');

    return elements;
  }

  /**
   * Score a hypothesis based on various factors
   */
  scoreHypothesis(hypothesis: GeneratedHypothesis): number {
    let score = 0;

    // Base score from confidence
    if (hypothesis.confidence_score) {
      score += hypothesis.confidence_score * 50;
    }

    // Score from expected lift
    const avgLift = (hypothesis.predicted_lift_range.min + hypothesis.predicted_lift_range.max) / 2;
    score += avgLift * 100;

    // Score from baseline (lower baseline = more room for improvement)
    if (hypothesis.baseline_performance < 5) {
      score += 10;
    } else if (hypothesis.baseline_performance < 10) {
      score += 5;
    }

    // Bonus for specific metrics
    if (hypothesis.primary_outcome === 'Add-to-cart rate') {
      score += 5; // Priority metric for e-commerce
    }

    return Math.round(score);
  }

  /**
   * Filter hypotheses based on criteria
   */
  filterHypotheses(
    hypotheses: GeneratedHypothesis[],
    criteria: {
      minConfidence?: number;
      minLift?: number;
      metrics?: string[];
      excludeTemplates?: string[];
    }
  ): GeneratedHypothesis[] {
    return hypotheses.filter(h => {
      // Check confidence threshold
      if (criteria.minConfidence && h.confidence_score) {
        if (h.confidence_score < criteria.minConfidence) return false;
      }

      // Check minimum lift
      if (criteria.minLift) {
        if (h.predicted_lift_range.max < criteria.minLift) return false;
      }

      // Check metrics filter
      if (criteria.metrics && criteria.metrics.length > 0) {
        if (!criteria.metrics.includes(h.primary_outcome)) return false;
      }

      // Check template exclusions
      if (criteria.excludeTemplates && h.template_id) {
        if (criteria.excludeTemplates.includes(h.template_id)) return false;
      }

      return true;
    });
  }
}