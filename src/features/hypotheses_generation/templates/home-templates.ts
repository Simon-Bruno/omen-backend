/**
 * Homepage Hypothesis Templates
 * Focused on first impressions, navigation, and value proposition
 */

import {
  HypothesisTemplate,
  HypothesisTemplateProvider,
  HypothesisCategory,
  ConversionMetric
} from './base';
import { PageType } from '@shared/page-types';

export class HomeTemplateProvider extends HypothesisTemplateProvider {
  loadTemplates(): void {
    this.templates = [
      // ============= VALUE PROPOSITION =============
      {
        id: 'home-value-headline',
        category: HypothesisCategory.CLARITY,
        pageTypes: [PageType.HOME],
        title: 'Clarify Value Proposition',
        description: 'Make primary value proposition more prominent',
        problem: 'Visitors don\'t immediately understand what you offer',
        solution: 'Rewrite hero headline to clearly state core value',
        metric: ConversionMetric.BOUNCE_RATE,
        expectedLift: { min: -0.08, max: -0.15 },
        confidence: 0.85
      },
      {
        id: 'home-value-benefits',
        category: HypothesisCategory.VALUE,
        pageTypes: [PageType.HOME],
        title: 'Highlight Key Benefits',
        description: 'Add benefit blocks above the fold',
        problem: 'Key benefits buried below fold',
        solution: 'Add 3-4 icon blocks showing primary benefits',
        metric: ConversionMetric.ENGAGEMENT_RATE,
        expectedLift: { min: 0.06, max: 0.14 },
        confidence: 0.80
      },

      // ============= HERO SECTION =============
      {
        id: 'home-hero-cta',
        category: HypothesisCategory.FRICTION,
        pageTypes: [PageType.HOME],
        title: 'Strengthen Hero CTA',
        description: 'Make primary call-to-action more compelling',
        problem: 'Weak or generic CTA button',
        solution: 'Use action-oriented CTA copy with contrasting button',
        metric: ConversionMetric.CLICK_THROUGH_RATE,
        expectedLift: { min: 0.08, max: 0.18 },
        confidence: 0.85
      },
      {
        id: 'home-hero-image',
        category: HypothesisCategory.VISUAL,
        pageTypes: [PageType.HOME],
        title: 'Optimize Hero Image',
        description: 'Use lifestyle imagery showing product in use',
        problem: 'Generic or irrelevant hero imagery',
        solution: 'Replace with customer-focused lifestyle image',
        metric: ConversionMetric.ENGAGEMENT_RATE,
        expectedLift: { min: 0.05, max: 0.12 },
        confidence: 0.70
      },

      // ============= NAVIGATION =============
      {
        id: 'home-nav-categories',
        category: HypothesisCategory.NAVIGATION,
        pageTypes: [PageType.HOME],
        title: 'Feature Category Navigation',
        description: 'Make product categories more prominent',
        problem: 'Users struggle to find relevant products',
        solution: 'Add visual category blocks below hero',
        metric: ConversionMetric.CLICK_THROUGH_RATE,
        expectedLift: { min: 0.10, max: 0.20 },
        confidence: 0.80
      },
      {
        id: 'home-nav-search',
        category: HypothesisCategory.NAVIGATION,
        pageTypes: [PageType.HOME],
        title: 'Enhance Search Visibility',
        description: 'Make search bar more prominent',
        problem: 'Search functionality not easily found',
        solution: 'Enlarge search bar and add placeholder text',
        metric: ConversionMetric.ENGAGEMENT_RATE,
        expectedLift: { min: 0.04, max: 0.10 },
        confidence: 0.70
      },

      // ============= SOCIAL PROOF =============
      {
        id: 'home-social-testimonials',
        category: HypothesisCategory.SOCIAL_PROOF,
        pageTypes: [PageType.HOME],
        title: 'Add Customer Testimonials',
        description: 'Display customer reviews prominently',
        problem: 'No social proof on homepage',
        solution: 'Add testimonial carousel with photos and ratings',
        metric: ConversionMetric.CONVERSION_RATE,
        expectedLift: { min: 0.06, max: 0.14 },
        confidence: 0.75
      },
      {
        id: 'home-social-logos',
        category: HypothesisCategory.TRUST,
        pageTypes: [PageType.HOME],
        title: 'Display Trust Logos',
        description: 'Show media mentions or certifications',
        problem: 'Lack of credibility indicators',
        solution: 'Add "As seen in" or certification logo bar',
        metric: ConversionMetric.BOUNCE_RATE,
        expectedLift: { min: -0.05, max: -0.12 },
        confidence: 0.70
      },

      // ============= FEATURED PRODUCTS =============
      {
        id: 'home-products-bestsellers',
        category: HypothesisCategory.VALUE,
        pageTypes: [PageType.HOME],
        title: 'Feature Best Sellers',
        description: 'Showcase most popular products',
        problem: 'No clear product recommendations',
        solution: 'Add "Best Sellers" section with top 4-6 products',
        metric: ConversionMetric.CLICK_THROUGH_RATE,
        expectedLift: { min: 0.08, max: 0.16 },
        confidence: 0.85
      },
      {
        id: 'home-products-new',
        category: HypothesisCategory.VALUE,
        pageTypes: [PageType.HOME],
        title: 'Highlight New Arrivals',
        description: 'Feature newest products prominently',
        problem: 'New products not discoverable',
        solution: 'Add "New Arrivals" section with recent additions',
        metric: ConversionMetric.ENGAGEMENT_RATE,
        expectedLift: { min: 0.05, max: 0.12 },
        confidence: 0.70
      },

      // ============= OFFERS & PROMOTIONS =============
      {
        id: 'home-offer-banner',
        category: HypothesisCategory.URGENCY,
        pageTypes: [PageType.HOME],
        title: 'Add Promotion Banner',
        description: 'Display current offers prominently',
        problem: 'Promotions not visible to visitors',
        solution: 'Add dismissible banner with current offer',
        metric: ConversionMetric.CONVERSION_RATE,
        expectedLift: { min: 0.07, max: 0.15 },
        confidence: 0.75
      },
      {
        id: 'home-offer-popup',
        category: HypothesisCategory.VALUE,
        pageTypes: [PageType.HOME],
        title: 'Email Capture Popup',
        description: 'Offer discount for email signup',
        problem: 'Not capturing visitor emails',
        solution: 'Add exit-intent popup with 10% off for signup',
        metric: ConversionMetric.ENGAGEMENT_RATE,
        expectedLift: { min: 0.10, max: 0.25 },
        confidence: 0.70
      }
    ];
  }

  /**
   * Get templates for improving first impressions
   */
  getFirstImpressionTemplates(): HypothesisTemplate[] {
    return this.templates.filter(template =>
      template.id.includes('hero') ||
      template.id.includes('value') ||
      template.category === HypothesisCategory.CLARITY
    );
  }

  /**
   * Get templates for improving navigation
   */
  getNavigationTemplates(): HypothesisTemplate[] {
    return this.templates.filter(template =>
      template.category === HypothesisCategory.NAVIGATION
    );
  }
}