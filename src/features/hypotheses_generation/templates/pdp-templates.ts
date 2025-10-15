/**
 * PDP-Specific Hypothesis Templates
 * Based on industry best practices and proven conversion patterns
 */

import {
  HypothesisTemplate,
  HypothesisTemplateProvider,
  HypothesisCategory,
  ConversionMetric,
  PageContext
} from './base';
import { PageType } from '@shared/page-types';

export class PDPTemplateProvider extends HypothesisTemplateProvider {
  loadTemplates(): void {
    this.templates = [
      // ============= URGENCY TEMPLATES =============
      {
        id: 'pdp-urgency-stock',
        category: HypothesisCategory.URGENCY,
        pageTypes: [PageType.PDP],
        title: 'Add Stock Scarcity Indicator',
        description: 'Display remaining inventory levels to create purchase urgency',
        problem: 'Users lack urgency to make immediate purchase decisions',
        solution: 'Show "Only X left in stock" message near add-to-cart button',
        metric: ConversionMetric.ADD_TO_CART_RATE,
        expectedLift: { min: 0.08, max: 0.15 },
        confidence: 0.85,
        applicabilityCheck: (context: PageContext) => {
          return !context.elements?.stock; // Only if stock indicator doesn't exist
        }
      },
      {
        id: 'pdp-urgency-timer',
        category: HypothesisCategory.URGENCY,
        pageTypes: [PageType.PDP],
        title: 'Implement Sale Countdown Timer',
        description: 'Add countdown timer for limited-time offers',
        problem: 'Sale urgency is not effectively communicated',
        solution: 'Display countdown timer showing time remaining for current offer',
        metric: ConversionMetric.CONVERSION_RATE,
        expectedLift: { min: 0.10, max: 0.20 },
        confidence: 0.75,
        variations: [
          {
            id: 'flash-sale',
            name: 'Flash Sale Timer',
            adjustments: {
              title: 'Add Flash Sale Countdown',
              solution: 'Show "Flash Sale Ends In: HH:MM:SS" with red styling',
              expectedLift: { min: 0.12, max: 0.25 }
            }
          }
        ]
      },
      {
        id: 'pdp-urgency-visitors',
        category: HypothesisCategory.URGENCY,
        pageTypes: [PageType.PDP],
        title: 'Show Active Visitor Count',
        description: 'Display number of people currently viewing the product',
        problem: 'No indication of product demand or competition',
        solution: 'Add "X people are viewing this product" notification',
        metric: ConversionMetric.ADD_TO_CART_RATE,
        expectedLift: { min: 0.06, max: 0.12 },
        confidence: 0.70
      },

      // ============= SOCIAL PROOF TEMPLATES =============
      {
        id: 'pdp-social-reviews',
        category: HypothesisCategory.SOCIAL_PROOF,
        pageTypes: [PageType.PDP],
        title: 'Enhance Review Visibility',
        description: 'Make product reviews more prominent above the fold',
        problem: 'Review ratings and count are not immediately visible',
        solution: 'Move star rating and review count next to product title',
        metric: ConversionMetric.ADD_TO_CART_RATE,
        expectedLift: { min: 0.05, max: 0.12 },
        confidence: 0.90,
        applicabilityCheck: (context: PageContext) => {
          return context.hasReviews === true;
        }
      },
      {
        id: 'pdp-social-purchases',
        category: HypothesisCategory.SOCIAL_PROOF,
        pageTypes: [PageType.PDP],
        title: 'Add Recent Purchase Notifications',
        description: 'Show recent customer purchase activity',
        problem: 'No social validation of purchase decisions',
        solution: 'Display "X customers bought this today" or recent buyer locations',
        metric: ConversionMetric.CONVERSION_RATE,
        expectedLift: { min: 0.06, max: 0.14 },
        confidence: 0.80
      },
      {
        id: 'pdp-social-testimonials',
        category: HypothesisCategory.SOCIAL_PROOF,
        pageTypes: [PageType.PDP],
        title: 'Highlight Best Reviews',
        description: 'Feature most helpful positive reviews prominently',
        problem: 'Quality reviews are buried in review section',
        solution: 'Show 2-3 best reviews with photos above product description',
        metric: ConversionMetric.CONVERSION_RATE,
        expectedLift: { min: 0.07, max: 0.15 },
        confidence: 0.75
      },

      // ============= ADD TO CART OPTIMIZATION =============
      {
        id: 'pdp-atc-sticky',
        category: HypothesisCategory.FRICTION,
        pageTypes: [PageType.PDP],
        title: 'Implement Sticky Add-to-Cart',
        description: 'Make add-to-cart button persistent on scroll',
        problem: 'Add-to-cart button not always visible during browsing',
        solution: 'Create sticky bar with product info and ATC button on scroll',
        metric: ConversionMetric.ADD_TO_CART_RATE,
        expectedLift: { min: 0.12, max: 0.25 },
        confidence: 0.85,
        applicabilityCheck: (context: PageContext) => {
          return context.isMobile === true; // Especially effective on mobile
        }
      },
      {
        id: 'pdp-atc-design',
        category: HypothesisCategory.VISUAL,
        pageTypes: [PageType.PDP],
        title: 'Enhance ATC Button Design',
        description: 'Improve add-to-cart button visibility and appeal',
        problem: 'Add-to-cart button lacks visual prominence',
        solution: 'Increase button size, add contrasting color, include cart icon',
        metric: ConversionMetric.ADD_TO_CART_RATE,
        expectedLift: { min: 0.07, max: 0.15 },
        confidence: 0.80
      },
      {
        id: 'pdp-atc-microcopy',
        category: HypothesisCategory.CLARITY,
        pageTypes: [PageType.PDP],
        title: 'Optimize ATC Button Copy',
        description: 'Test action-oriented button text',
        problem: 'Generic "Add to Cart" text lacks motivation',
        solution: 'Test "Add to Bag", "Buy Now", or "Get Yours Today"',
        metric: ConversionMetric.ADD_TO_CART_RATE,
        expectedLift: { min: 0.03, max: 0.08 },
        confidence: 0.65
      },

      // ============= TRUST & SECURITY =============
      {
        id: 'pdp-trust-badges',
        category: HypothesisCategory.TRUST,
        pageTypes: [PageType.PDP],
        title: 'Add Trust Badge Section',
        description: 'Display security and trust indicators near price',
        problem: 'Lack of visible trust signals causes purchase hesitation',
        solution: 'Add payment security, guarantee, and certification badges',
        metric: ConversionMetric.CONVERSION_RATE,
        expectedLift: { min: 0.05, max: 0.12 },
        confidence: 0.75
      },
      {
        id: 'pdp-trust-guarantee',
        category: HypothesisCategory.TRUST,
        pageTypes: [PageType.PDP],
        title: 'Highlight Money-Back Guarantee',
        description: 'Prominently display return/refund policy',
        problem: 'Return policy hidden reduces purchase confidence',
        solution: 'Add "30-Day Money-Back Guarantee" badge near ATC button',
        metric: ConversionMetric.CONVERSION_RATE,
        expectedLift: { min: 0.06, max: 0.14 },
        confidence: 0.80
      },
      {
        id: 'pdp-trust-shipping',
        category: HypothesisCategory.TRUST,
        pageTypes: [PageType.PDP],
        title: 'Clarify Shipping Information',
        description: 'Show shipping costs and delivery times upfront',
        problem: 'Shipping uncertainty causes cart abandonment',
        solution: 'Display "Free shipping" or estimated delivery date prominently',
        metric: ConversionMetric.ADD_TO_CART_RATE,
        expectedLift: { min: 0.08, max: 0.18 },
        confidence: 0.85
      },

      // ============= VALUE COMMUNICATION =============
      {
        id: 'pdp-value-savings',
        category: HypothesisCategory.VALUE,
        pageTypes: [PageType.PDP],
        title: 'Highlight Savings Amount',
        description: 'Emphasize discount value and percentage saved',
        problem: 'Savings not clearly communicated',
        solution: 'Show "You Save: $X (Y%)" with original price struck through',
        metric: ConversionMetric.CONVERSION_RATE,
        expectedLift: { min: 0.05, max: 0.12 },
        confidence: 0.70
      },
      {
        id: 'pdp-value-bundle',
        category: HypothesisCategory.VALUE,
        pageTypes: [PageType.PDP],
        title: 'Promote Bundle Offers',
        description: 'Suggest product bundles for better value',
        problem: 'Single item purchases miss upsell opportunities',
        solution: 'Display "Save X% when you buy 2 or more" bundle option',
        metric: ConversionMetric.REVENUE_PER_VISITOR,
        expectedLift: { min: 0.10, max: 0.25 },
        confidence: 0.75
      },
      {
        id: 'pdp-value-comparison',
        category: HypothesisCategory.VALUE,
        pageTypes: [PageType.PDP],
        title: 'Add Comparison Table',
        description: 'Show value vs competitors or alternative products',
        problem: 'Value proposition unclear without context',
        solution: 'Add comparison table highlighting unique features',
        metric: ConversionMetric.CONVERSION_RATE,
        expectedLift: { min: 0.06, max: 0.15 },
        confidence: 0.65
      },

      // ============= PRODUCT INFORMATION =============
      {
        id: 'pdp-info-highlights',
        category: HypothesisCategory.CLARITY,
        pageTypes: [PageType.PDP],
        title: 'Add Key Benefits Section',
        description: 'Highlight top 3-5 product benefits with icons',
        problem: 'Key benefits buried in long descriptions',
        solution: 'Create visual benefit blocks with icons above description',
        metric: ConversionMetric.ADD_TO_CART_RATE,
        expectedLift: { min: 0.04, max: 0.10 },
        confidence: 0.70
      },
      {
        id: 'pdp-info-size-guide',
        category: HypothesisCategory.CLARITY,
        pageTypes: [PageType.PDP],
        title: 'Improve Size Guide Access',
        description: 'Make size/fit information more accessible',
        problem: 'Size uncertainty causes purchase hesitation',
        solution: 'Add prominent "Size Guide" link next to size selector',
        metric: ConversionMetric.CONVERSION_RATE,
        expectedLift: { min: 0.05, max: 0.12 },
        confidence: 0.75,
        applicabilityCheck: (context: PageContext) => {
          return context.elements?.variants === true; // Only for products with variants
        }
      },
      {
        id: 'pdp-info-specs',
        category: HypothesisCategory.CLARITY,
        pageTypes: [PageType.PDP],
        title: 'Organize Product Specifications',
        description: 'Structure specs in scannable table format',
        problem: 'Specifications difficult to scan and compare',
        solution: 'Convert specs to organized table with clear labels',
        metric: ConversionMetric.TIME_ON_PAGE,
        expectedLift: { min: 0.10, max: 0.20 },
        confidence: 0.60
      },

      // ============= VISUAL ENHANCEMENTS =============
      {
        id: 'pdp-visual-gallery',
        category: HypothesisCategory.VISUAL,
        pageTypes: [PageType.PDP],
        title: 'Enhance Image Gallery',
        description: 'Improve product image viewing experience',
        problem: 'Product images too small or lack detail',
        solution: 'Add zoom on hover and fullscreen gallery option',
        metric: ConversionMetric.ENGAGEMENT_RATE,
        expectedLift: { min: 0.05, max: 0.12 },
        confidence: 0.70
      },
      {
        id: 'pdp-visual-video',
        category: HypothesisCategory.VISUAL,
        pageTypes: [PageType.PDP],
        title: 'Add Product Video',
        description: 'Include video demonstration of product',
        problem: 'Static images don\'t show product in use',
        solution: 'Add 30-60 second product video in image gallery',
        metric: ConversionMetric.CONVERSION_RATE,
        expectedLift: { min: 0.08, max: 0.20 },
        confidence: 0.75,
        applicabilityCheck: (context: PageContext) => {
          return !context.hasVideo; // Only if no video exists
        }
      }
    ];
  }

  /**
   * Get templates optimized for mobile PDPs
   */
  getMobileOptimizedTemplates(): HypothesisTemplate[] {
    return this.templates.filter(template =>
      template.applicabilityCheck
        ? template.applicabilityCheck({
            pageType: PageType.PDP,
            url: '',
            isMobile: true
          })
        : true
    );
  }

  /**
   * Get high-confidence templates (>= 80% confidence)
   */
  getHighConfidenceTemplates(): HypothesisTemplate[] {
    return this.templates.filter(template => template.confidence >= 0.80);
  }

  /**
   * Get quick-win templates (high confidence, low effort)
   */
  getQuickWins(): HypothesisTemplate[] {
    return this.templates.filter(template =>
      template.confidence >= 0.75 &&
      template.category !== HypothesisCategory.VISUAL && // Visual changes often require more effort
      template.expectedLift.min >= 0.05
    );
  }
}