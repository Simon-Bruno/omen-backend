/**
 * Collection/Category Page Hypothesis Templates
 * Focused on product discovery and browsing optimization
 */

import {
  HypothesisTemplate,
  HypothesisTemplateProvider,
  HypothesisCategory,
  ConversionMetric
} from './base';
import { PageType } from '@shared/page-types';

export class CollectionTemplateProvider extends HypothesisTemplateProvider {
  loadTemplates(): void {
    this.templates = [
      // ============= NAVIGATION & DISCOVERY =============
      {
        id: 'collection-nav-filters',
        category: HypothesisCategory.NAVIGATION,
        pageTypes: [PageType.COLLECTION],
        title: 'Enhance Filter Visibility',
        description: 'Make product filters more prominent and accessible',
        problem: 'Users struggle to find relevant products in large collections',
        solution: 'Add sticky filter bar or prominent filter button on mobile',
        metric: ConversionMetric.ENGAGEMENT_RATE,
        expectedLift: { min: 0.08, max: 0.18 },
        confidence: 0.85
      },
      {
        id: 'collection-nav-sort',
        category: HypothesisCategory.NAVIGATION,
        pageTypes: [PageType.COLLECTION],
        title: 'Optimize Sort Options',
        description: 'Improve default sort order and options',
        problem: 'Default sort doesn\'t match user intent',
        solution: 'Default to "Best Selling" and add "New Arrivals" option',
        metric: ConversionMetric.CLICK_THROUGH_RATE,
        expectedLift: { min: 0.05, max: 0.12 },
        confidence: 0.75
      },
      {
        id: 'collection-nav-breadcrumbs',
        category: HypothesisCategory.NAVIGATION,
        pageTypes: [PageType.COLLECTION],
        title: 'Add Clear Breadcrumbs',
        description: 'Implement hierarchical navigation breadcrumbs',
        problem: 'Users lose context while browsing categories',
        solution: 'Add breadcrumb navigation showing category hierarchy',
        metric: ConversionMetric.BOUNCE_RATE,
        expectedLift: { min: -0.05, max: -0.12 },
        confidence: 0.70
      },

      // ============= PRODUCT CARDS =============
      {
        id: 'collection-card-quickview',
        category: HypothesisCategory.FRICTION,
        pageTypes: [PageType.COLLECTION],
        title: 'Add Quick View Feature',
        description: 'Allow product preview without leaving collection page',
        problem: 'Users must leave collection page to see product details',
        solution: 'Add "Quick View" button showing key details in modal',
        metric: ConversionMetric.ENGAGEMENT_RATE,
        expectedLift: { min: 0.10, max: 0.22 },
        confidence: 0.80
      },
      {
        id: 'collection-card-badges',
        category: HypothesisCategory.VISUAL,
        pageTypes: [PageType.COLLECTION],
        title: 'Add Product Badges',
        description: 'Highlight special attributes with visual badges',
        problem: 'Special offers and features not immediately visible',
        solution: 'Add "Sale", "New", "Best Seller" badges to product cards',
        metric: ConversionMetric.CLICK_THROUGH_RATE,
        expectedLift: { min: 0.06, max: 0.14 },
        confidence: 0.85
      },
      {
        id: 'collection-card-reviews',
        category: HypothesisCategory.SOCIAL_PROOF,
        pageTypes: [PageType.COLLECTION],
        title: 'Show Review Stars on Cards',
        description: 'Display product ratings on collection grid',
        problem: 'Product quality signals missing from browsing experience',
        solution: 'Add star ratings and review count to each product card',
        metric: ConversionMetric.CLICK_THROUGH_RATE,
        expectedLift: { min: 0.07, max: 0.15 },
        confidence: 0.90
      },
      {
        id: 'collection-card-hover',
        category: HypothesisCategory.VISUAL,
        pageTypes: [PageType.COLLECTION],
        title: 'Enhance Hover Interactions',
        description: 'Show additional product images on hover',
        problem: 'Single image limits product understanding',
        solution: 'Display alternate product view on card hover',
        metric: ConversionMetric.ENGAGEMENT_RATE,
        expectedLift: { min: 0.04, max: 0.10 },
        confidence: 0.70
      },

      // ============= LAYOUT & PRESENTATION =============
      {
        id: 'collection-layout-density',
        category: HypothesisCategory.VISUAL,
        pageTypes: [PageType.COLLECTION],
        title: 'Optimize Grid Density',
        description: 'Test optimal number of products per row',
        problem: 'Grid too dense or sparse affects browsing',
        solution: 'Test 3 vs 4 products per row on desktop, 2 vs 1 on mobile',
        metric: ConversionMetric.ENGAGEMENT_RATE,
        expectedLift: { min: 0.05, max: 0.12 },
        confidence: 0.65
      },
      {
        id: 'collection-layout-infinite',
        category: HypothesisCategory.FRICTION,
        pageTypes: [PageType.COLLECTION],
        title: 'Implement Infinite Scroll',
        description: 'Replace pagination with infinite scroll',
        problem: 'Pagination creates friction in browsing flow',
        solution: 'Auto-load more products as user scrolls down',
        metric: ConversionMetric.TIME_ON_PAGE,
        expectedLift: { min: 0.15, max: 0.30 },
        confidence: 0.75
      },
      {
        id: 'collection-layout-comparison',
        category: HypothesisCategory.VALUE,
        pageTypes: [PageType.COLLECTION],
        title: 'Add Compare Feature',
        description: 'Allow side-by-side product comparison',
        problem: 'Difficult to compare similar products',
        solution: 'Add checkbox to compare up to 3 products side-by-side',
        metric: ConversionMetric.CONVERSION_RATE,
        expectedLift: { min: 0.06, max: 0.14 },
        confidence: 0.70
      },

      // ============= COLLECTION HEADER =============
      {
        id: 'collection-header-description',
        category: HypothesisCategory.CLARITY,
        pageTypes: [PageType.COLLECTION],
        title: 'Add Collection Description',
        description: 'Provide context about the collection',
        problem: 'Users lack context about collection purpose',
        solution: 'Add 2-3 sentence description explaining collection',
        metric: ConversionMetric.BOUNCE_RATE,
        expectedLift: { min: -0.04, max: -0.10 },
        confidence: 0.65
      },
      {
        id: 'collection-header-count',
        category: HypothesisCategory.CLARITY,
        pageTypes: [PageType.COLLECTION],
        title: 'Show Product Count',
        description: 'Display total number of products in collection',
        problem: 'Users uncertain about collection size',
        solution: 'Add "Showing X of Y products" indicator',
        metric: ConversionMetric.ENGAGEMENT_RATE,
        expectedLift: { min: 0.03, max: 0.08 },
        confidence: 0.60
      },

      // ============= URGENCY & SCARCITY =============
      {
        id: 'collection-urgency-stock',
        category: HypothesisCategory.URGENCY,
        pageTypes: [PageType.COLLECTION],
        title: 'Show Low Stock Indicators',
        description: 'Display stock levels on product cards',
        problem: 'No urgency created during browsing',
        solution: 'Add "Only X left" badge for low-stock items',
        metric: ConversionMetric.CLICK_THROUGH_RATE,
        expectedLift: { min: 0.08, max: 0.16 },
        confidence: 0.75
      },
      {
        id: 'collection-urgency-trending',
        category: HypothesisCategory.SOCIAL_PROOF,
        pageTypes: [PageType.COLLECTION],
        title: 'Highlight Trending Products',
        description: 'Mark fast-selling or popular products',
        problem: 'Popular items not differentiated',
        solution: 'Add "Trending" or "Hot" badge to popular products',
        metric: ConversionMetric.CLICK_THROUGH_RATE,
        expectedLift: { min: 0.06, max: 0.14 },
        confidence: 0.70
      },

      // ============= PRICING & OFFERS =============
      {
        id: 'collection-price-range',
        category: HypothesisCategory.VALUE,
        pageTypes: [PageType.COLLECTION],
        title: 'Add Price Range Filter',
        description: 'Enable filtering by price ranges',
        problem: 'Users can\'t filter by budget',
        solution: 'Add price range slider or preset price filters',
        metric: ConversionMetric.ENGAGEMENT_RATE,
        expectedLift: { min: 0.07, max: 0.15 },
        confidence: 0.80
      },
      {
        id: 'collection-price-savings',
        category: HypothesisCategory.VALUE,
        pageTypes: [PageType.COLLECTION],
        title: 'Highlight Discount Percentages',
        description: 'Show savings prominently on sale items',
        problem: 'Discounts not immediately visible',
        solution: 'Add "Save X%" badge with strike-through pricing',
        metric: ConversionMetric.CLICK_THROUGH_RATE,
        expectedLift: { min: 0.08, max: 0.18 },
        confidence: 0.85
      }
    ];
  }

  /**
   * Get templates for improving product discovery
   */
  getDiscoveryTemplates(): HypothesisTemplate[] {
    return this.templates.filter(template =>
      template.category === HypothesisCategory.NAVIGATION ||
      template.id.includes('filter') ||
      template.id.includes('sort')
    );
  }

  /**
   * Get templates for mobile collection pages
   */
  getMobileTemplates(): HypothesisTemplate[] {
    return this.templates.filter(template =>
      template.id.includes('filter') ||
      template.id.includes('infinite') ||
      template.id.includes('density')
    );
  }
}