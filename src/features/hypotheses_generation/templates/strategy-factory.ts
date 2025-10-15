/**
 * Hypothesis Strategy Factory
 * Intelligently selects and generates hypotheses based on context and page analysis
 */

import {
  HypothesisTemplate,
  HypothesisTemplateRegistry,
  PageContext,
  HypothesisCategory,
  ConversionMetric
} from './base';
import { PDPTemplateProvider } from './pdp-templates';
import { CollectionTemplateProvider } from './collection-templates';
import { HomeTemplateProvider } from './home-templates';
import { PageType } from '@shared/page-types';

/**
 * Strategy for generating hypotheses
 */
export interface HypothesisStrategy {
  pageType: PageType;
  focusAreas: HypothesisCategory[];
  primaryMetric: ConversionMetric;
  confidenceThreshold: number;
  maxHypotheses: number;
}

/**
 * Generated hypothesis from template
 */
export interface GeneratedHypothesis {
  title: string;
  description: string;
  primary_outcome: string;
  current_problem: string;
  why_it_works: { reason: string }[];
  baseline_performance: number;
  predicted_lift_range: { min: number; max: number };
  template_id?: string;
  confidence_score?: number;
}

/**
 * Factory for creating hypothesis generation strategies
 */
export class HypothesisStrategyFactory {
  private registry: HypothesisTemplateRegistry;
  private strategies: Map<PageType, HypothesisStrategy>;

  constructor() {
    this.registry = new HypothesisTemplateRegistry();
    this.strategies = new Map();
    this.initializeProviders();
    this.initializeStrategies();
  }

  /**
   * Initialize template providers
   */
  private initializeProviders(): void {
    this.registry.register('pdp', new PDPTemplateProvider());
    this.registry.register('collection', new CollectionTemplateProvider());
    this.registry.register('home', new HomeTemplateProvider());
  }

  /**
   * Initialize default strategies for each page type
   */
  private initializeStrategies(): void {
    // PDP Strategy - Focus on conversion
    this.strategies.set(PageType.PDP, {
      pageType: PageType.PDP,
      focusAreas: [
        HypothesisCategory.URGENCY,
        HypothesisCategory.SOCIAL_PROOF,
        HypothesisCategory.TRUST,
        HypothesisCategory.FRICTION
      ],
      primaryMetric: ConversionMetric.ADD_TO_CART_RATE,
      confidenceThreshold: 0.70,
      maxHypotheses: 5
    });

    // Collection Strategy - Focus on discovery
    this.strategies.set(PageType.COLLECTION, {
      pageType: PageType.COLLECTION,
      focusAreas: [
        HypothesisCategory.NAVIGATION,
        HypothesisCategory.VISUAL,
        HypothesisCategory.FRICTION,
        HypothesisCategory.VALUE
      ],
      primaryMetric: ConversionMetric.CLICK_THROUGH_RATE,
      confidenceThreshold: 0.65,
      maxHypotheses: 4
    });

    // Homepage Strategy - Focus on engagement
    this.strategies.set(PageType.HOME, {
      pageType: PageType.HOME,
      focusAreas: [
        HypothesisCategory.CLARITY,
        HypothesisCategory.VISUAL,
        HypothesisCategory.NAVIGATION,
        HypothesisCategory.VALUE
      ],
      primaryMetric: ConversionMetric.ENGAGEMENT_RATE,
      confidenceThreshold: 0.70,
      maxHypotheses: 4
    });

    // Cart Strategy - Focus on checkout
    this.strategies.set(PageType.CART, {
      pageType: PageType.CART,
      focusAreas: [
        HypothesisCategory.FRICTION,
        HypothesisCategory.TRUST,
        HypothesisCategory.URGENCY,
        HypothesisCategory.VALUE
      ],
      primaryMetric: ConversionMetric.CONVERSION_RATE,
      confidenceThreshold: 0.75,
      maxHypotheses: 3
    });

    // Checkout Strategy - Focus on completion
    this.strategies.set(PageType.CHECKOUT, {
      pageType: PageType.CHECKOUT,
      focusAreas: [
        HypothesisCategory.FRICTION,
        HypothesisCategory.TRUST,
        HypothesisCategory.CLARITY
      ],
      primaryMetric: ConversionMetric.FORM_COMPLETION,
      confidenceThreshold: 0.80,
      maxHypotheses: 3
    });
  }

  /**
   * Generate hypotheses based on page context
   */
  generateHypotheses(
    context: PageContext,
    userDirection?: string,
    customStrategy?: Partial<HypothesisStrategy>
  ): GeneratedHypothesis[] {
    // Get strategy for page type
    const baseStrategy = this.strategies.get(context.pageType) || this.getDefaultStrategy(context.pageType);
    const strategy = { ...baseStrategy, ...customStrategy };

    // Get applicable templates
    let templates = this.registry.getApplicableTemplates(context);

    // Filter by confidence threshold
    templates = templates.filter(t => t.confidence >= strategy.confidenceThreshold);

    // Filter by focus areas if specified
    if (strategy.focusAreas.length > 0) {
      templates = templates.filter(t =>
        strategy.focusAreas.includes(t.category)
      );
    }

    // Score and rank templates
    const scoredTemplates = this.scoreTemplates(templates, context, userDirection);

    // Sort by score
    scoredTemplates.sort((a, b) => b.score - a.score);

    // Take top N templates
    const selectedTemplates = scoredTemplates.slice(0, strategy.maxHypotheses);

    // Generate hypotheses from templates
    return selectedTemplates.map(st =>
      this.generateHypothesisFromTemplate(st.template, context, strategy)
    );
  }

  /**
   * Score templates based on relevance and context
   */
  private scoreTemplates(
    templates: HypothesisTemplate[],
    context: PageContext,
    userDirection?: string
  ): Array<{ template: HypothesisTemplate; score: number }> {
    return templates.map(template => {
      let score = template.confidence * 100; // Base score from confidence

      // Boost score if user direction matches
      if (userDirection) {
        const directionLower = userDirection.toLowerCase();
        if (
          template.title.toLowerCase().includes(directionLower) ||
          template.description.toLowerCase().includes(directionLower) ||
          template.solution.toLowerCase().includes(directionLower)
        ) {
          score += 20;
        }
      }

      // Boost score based on expected lift
      score += (template.expectedLift.min + template.expectedLift.max) * 50;

      // Boost score for missing elements that template addresses
      if (template.applicabilityCheck) {
        // Templates that address missing elements get priority
        score += 10;
      }

      // Category-specific boosts based on page type
      score += this.getCategoryBoost(template.category, context.pageType);

      return { template, score };
    });
  }

  /**
   * Get category boost based on page type
   */
  private getCategoryBoost(category: HypothesisCategory, pageType: PageType): number {
    const boostMap: Record<PageType, Partial<Record<HypothesisCategory, number>>> = {
      [PageType.PDP]: {
        [HypothesisCategory.URGENCY]: 15,
        [HypothesisCategory.SOCIAL_PROOF]: 12,
        [HypothesisCategory.TRUST]: 10,
        [HypothesisCategory.FRICTION]: 8
      },
      [PageType.COLLECTION]: {
        [HypothesisCategory.NAVIGATION]: 15,
        [HypothesisCategory.VISUAL]: 10,
        [HypothesisCategory.FRICTION]: 8
      },
      [PageType.HOME]: {
        [HypothesisCategory.CLARITY]: 15,
        [HypothesisCategory.VISUAL]: 12,
        [HypothesisCategory.NAVIGATION]: 10
      },
      [PageType.CART]: {
        [HypothesisCategory.FRICTION]: 20,
        [HypothesisCategory.TRUST]: 15,
        [HypothesisCategory.URGENCY]: 10
      },
      [PageType.CHECKOUT]: {
        [HypothesisCategory.FRICTION]: 25,
        [HypothesisCategory.TRUST]: 20,
        [HypothesisCategory.CLARITY]: 15
      },
      [PageType.ABOUT]: {},
      [PageType.CONTACT]: {},
      [PageType.SEARCH]: {},
      [PageType.ACCOUNT]: {},
      [PageType.OTHER]: {}
    };

    return boostMap[pageType]?.[category] || 0;
  }

  /**
   * Generate hypothesis from template
   */
  private generateHypothesisFromTemplate(
    template: HypothesisTemplate,
    context: PageContext,
    strategy: HypothesisStrategy
  ): GeneratedHypothesis {
    // Calculate baseline based on metric
    const baseline = this.getBaselineForMetric(template.metric);

    // Build why it works reasons
    const reasons = this.generateReasons(template, context);

    return {
      title: template.title,
      description: template.solution,
      primary_outcome: template.metric,
      current_problem: template.problem,
      why_it_works: reasons,
      baseline_performance: baseline,
      predicted_lift_range: {
        min: template.expectedLift.min,
        max: template.expectedLift.max
      },
      template_id: template.id,
      confidence_score: template.confidence
    };
  }

  /**
   * Get realistic baseline for metric
   */
  private getBaselineForMetric(metric: ConversionMetric): number {
    const baselines: Record<ConversionMetric, number> = {
      [ConversionMetric.CONVERSION_RATE]: 2.5,
      [ConversionMetric.ADD_TO_CART_RATE]: 8.0,
      [ConversionMetric.CLICK_THROUGH_RATE]: 15.0,
      [ConversionMetric.BOUNCE_RATE]: 45.0,
      [ConversionMetric.TIME_ON_PAGE]: 120, // seconds
      [ConversionMetric.FORM_COMPLETION]: 65.0,
      [ConversionMetric.ENGAGEMENT_RATE]: 55.0,
      [ConversionMetric.REVENUE_PER_VISITOR]: 45.0 // dollars
    };

    // Add some variation
    const variation = (Math.random() - 0.5) * 0.2; // ±10% variation
    return baselines[metric] * (1 + variation);
  }

  /**
   * Generate reasons why hypothesis will work
   */
  private generateReasons(
    template: HypothesisTemplate,
    context: PageContext
  ): { reason: string }[] {
    const reasons: { reason: string }[] = [];

    // Category-specific reasons
    const categoryReasons: Record<HypothesisCategory, string[]> = {
      [HypothesisCategory.URGENCY]: [
        'Creates fear of missing out',
        'Motivates immediate action',
        'Reduces decision paralysis'
      ],
      [HypothesisCategory.SOCIAL_PROOF]: [
        'Builds trust through validation',
        'Reduces purchase anxiety',
        'Demonstrates product popularity'
      ],
      [HypothesisCategory.TRUST]: [
        'Increases buyer confidence',
        'Reduces perceived risk',
        'Improves credibility signals'
      ],
      [HypothesisCategory.CLARITY]: [
        'Simplifies decision making',
        'Reduces cognitive load',
        'Improves information hierarchy'
      ],
      [HypothesisCategory.VALUE]: [
        'Highlights product benefits',
        'Justifies price point',
        'Increases perceived value'
      ],
      [HypothesisCategory.FRICTION]: [
        'Removes conversion barriers',
        'Simplifies user journey',
        'Reduces effort required'
      ],
      [HypothesisCategory.NAVIGATION]: [
        'Improves content discovery',
        'Reduces user frustration',
        'Enhances browsing experience'
      ],
      [HypothesisCategory.VISUAL]: [
        'Captures user attention',
        'Improves visual hierarchy',
        'Enhances brand perception'
      ],
      [HypothesisCategory.PERSONALIZATION]: [
        'Increases relevance',
        'Improves user experience',
        'Shows customer understanding'
      ],
      [HypothesisCategory.MOBILE]: [
        'Optimizes mobile experience',
        'Reduces mobile friction',
        'Improves touch interactions'
      ]
    };

    // Get reasons for category
    const availableReasons = categoryReasons[template.category] || [];

    // Select 2-3 reasons
    const numReasons = Math.min(3, availableReasons.length);
    for (let i = 0; i < numReasons; i++) {
      reasons.push({ reason: availableReasons[i] });
    }

    // Add template-specific reason if needed
    if (reasons.length < 2) {
      reasons.push({ reason: 'Addresses identified user pain point' });
    }

    return reasons;
  }

  /**
   * Get default strategy for page type
   */
  private getDefaultStrategy(pageType: PageType): HypothesisStrategy {
    return {
      pageType,
      focusAreas: [],
      primaryMetric: ConversionMetric.CONVERSION_RATE,
      confidenceThreshold: 0.60,
      maxHypotheses: 3
    };
  }

  /**
   * Get strategy for page type
   */
  getStrategy(pageType: PageType): HypothesisStrategy | undefined {
    return this.strategies.get(pageType);
  }

  /**
   * Update strategy for page type
   */
  updateStrategy(pageType: PageType, strategy: Partial<HypothesisStrategy>): void {
    const current = this.strategies.get(pageType) || this.getDefaultStrategy(pageType);
    this.strategies.set(pageType, { ...current, ...strategy });
  }

  /**
   * Get all available templates
   */
  getAllTemplates(pageType?: PageType): HypothesisTemplate[] {
    if (pageType) {
      return this.registry.getAllTemplatesForPageType(pageType);
    }

    // Return all templates from all page types
    const allTemplates: HypothesisTemplate[] = [];
    for (const type of Object.values(PageType)) {
      allTemplates.push(...this.registry.getAllTemplatesForPageType(type as PageType));
    }
    return allTemplates;
  }
}