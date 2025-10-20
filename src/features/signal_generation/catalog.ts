import { PageType } from '@shared/page-types';
import { SignalType, SignalRole } from './types';

/**
 * Signal definition in the canonical catalog
 */
export interface CatalogSignal {
  name: string;
  type: SignalType;
  description: string;
  defaultRole: SignalRole;
  allowedRoles: SignalRole[];
  requiresSelector: boolean;
  requiresTargetUrls: boolean;
  requiresPurchaseTracking: boolean;
}

/**
 * Page-type specific signal catalog
 */
export interface PageTypeCatalog {
  primaryCandidates: CatalogSignal[];
  mechanisms: CatalogSignal[];
  guardrails: CatalogSignal[];
}

/**
 * Common guardrail signals across all page types
 */
const COMMON_GUARDRAILS: CatalogSignal[] = [
  {
    name: 'purchase_completed',
    type: 'purchase',
    description: 'User completed a purchase',
    defaultRole: 'guardrail',
    allowedRoles: ['primary', 'guardrail'],
    requiresSelector: false,
    requiresTargetUrls: false,
    requiresPurchaseTracking: true,
  },
  {
    name: 'add_to_cart_click',
    type: 'conversion',
    description: 'User clicked add to cart',
    defaultRole: 'guardrail',
    allowedRoles: ['primary', 'mechanism', 'guardrail'],
    requiresSelector: true,
    requiresTargetUrls: false,
    requiresPurchaseTracking: false,
  },
  {
    name: 'begin_checkout_click',
    type: 'conversion',
    description: 'User initiated checkout',
    defaultRole: 'guardrail',
    allowedRoles: ['primary', 'guardrail'],
    requiresSelector: true,
    requiresTargetUrls: false,
    requiresPurchaseTracking: false,
  },
];

/**
 * Canonical catalog of signals by page type
 */
export const SIGNAL_CATALOG: Record<PageType, PageTypeCatalog> = {
  [PageType.COLLECTION]: {
    primaryCandidates: [
      {
        name: 'collection_to_pdp_click',
        type: 'conversion',
        description: 'User clicked from collection page to product detail page',
        defaultRole: 'primary',
        allowedRoles: ['primary'],
        requiresSelector: true,
        requiresTargetUrls: false,
        requiresPurchaseTracking: false,
      },
      {
        name: 'collection_filter_apply',
        type: 'conversion',
        description: 'User applied a filter on collection page',
        defaultRole: 'primary',
        allowedRoles: ['primary', 'mechanism'],
        requiresSelector: true,
        requiresTargetUrls: false,
        requiresPurchaseTracking: false,
      },
    ],
    mechanisms: [
      {
        name: 'hero_cta_click',
        type: 'conversion',
        description: 'User clicked hero CTA on collection page',
        defaultRole: 'mechanism',
        allowedRoles: ['mechanism'],
        requiresSelector: true,
        requiresTargetUrls: false,
        requiresPurchaseTracking: false,
      },
      {
        name: 'filter_apply_click',
        type: 'conversion',
        description: 'User clicked to apply filters',
        defaultRole: 'mechanism',
        allowedRoles: ['mechanism'],
        requiresSelector: true,
        requiresTargetUrls: false,
        requiresPurchaseTracking: false,
      },
      {
        name: 'sort_change',
        type: 'conversion',
        description: 'User changed sort order',
        defaultRole: 'mechanism',
        allowedRoles: ['mechanism'],
        requiresSelector: true,
        requiresTargetUrls: false,
        requiresPurchaseTracking: false,
      },
    ],
    guardrails: COMMON_GUARDRAILS,
  },
  
  [PageType.PDP]: {
    primaryCandidates: [
      {
        name: 'add_to_cart_click',
        type: 'conversion',
        description: 'User clicked add to cart on PDP',
        defaultRole: 'primary',
        allowedRoles: ['primary'],
        requiresSelector: true,
        requiresTargetUrls: false,
        requiresPurchaseTracking: false,
      },
      {
        name: 'pdp_to_cart_navigation',
        type: 'conversion',
        description: 'User navigated from PDP to cart',
        defaultRole: 'primary',
        allowedRoles: ['primary'],
        requiresSelector: false,
        requiresTargetUrls: true,
        requiresPurchaseTracking: false,
      },
      {
        name: 'product_title_click',
        type: 'conversion',
        description: 'User clicked on product title/link',
        defaultRole: 'primary',
        allowedRoles: ['primary'],
        requiresSelector: true,
        requiresTargetUrls: false,
        requiresPurchaseTracking: false,
      },
    ],
    mechanisms: [
      {
        name: 'variant_selection_click',
        type: 'conversion',
        description: 'User selected a product variant (size, color, etc.)',
        defaultRole: 'mechanism',
        allowedRoles: ['mechanism'],
        requiresSelector: true,
        requiresTargetUrls: false,
        requiresPurchaseTracking: false,
      },
      {
        name: 'image_gallery_click',
        type: 'conversion',
        description: 'User clicked on product image gallery',
        defaultRole: 'mechanism',
        allowedRoles: ['mechanism'],
        requiresSelector: true,
        requiresTargetUrls: false,
        requiresPurchaseTracking: false,
      },
      {
        name: 'trust_bar_view',
        type: 'conversion',
        description: 'User viewed trust/credibility elements',
        defaultRole: 'mechanism',
        allowedRoles: ['primary', 'mechanism'],
        requiresSelector: true,
        requiresTargetUrls: false,
        requiresPurchaseTracking: false,
      },
      {
        name: 'trust_bar_interaction',
        type: 'conversion',
        description: 'User interacted with trust elements (hover, click)',
        defaultRole: 'mechanism',
        allowedRoles: ['primary', 'mechanism'],
        requiresSelector: true,
        requiresTargetUrls: false,
        requiresPurchaseTracking: false,
      },
      {
        name: 'quantity_change',
        type: 'conversion',
        description: 'User changed product quantity',
        defaultRole: 'mechanism',
        allowedRoles: ['mechanism'],
        requiresSelector: true,
        requiresTargetUrls: false,
        requiresPurchaseTracking: false,
      },
      {
        name: 'reviews_section_click',
        type: 'conversion',
        description: 'User clicked on reviews section',
        defaultRole: 'mechanism',
        allowedRoles: ['mechanism'],
        requiresSelector: true,
        requiresTargetUrls: false,
        requiresPurchaseTracking: false,
      },
    ],
    guardrails: COMMON_GUARDRAILS,
  },
  
  [PageType.CART]: {
    primaryCandidates: [
      {
        name: 'begin_checkout_click',
        type: 'conversion',
        description: 'User clicked checkout button in cart',
        defaultRole: 'primary',
        allowedRoles: ['primary'],
        requiresSelector: true,
        requiresTargetUrls: false,
        requiresPurchaseTracking: false,
      },
      {
        name: 'cart_to_checkout_navigation',
        type: 'conversion',
        description: 'User navigated from cart to checkout',
        defaultRole: 'primary',
        allowedRoles: ['primary'],
        requiresSelector: false,
        requiresTargetUrls: true,
        requiresPurchaseTracking: false,
      },
    ],
    mechanisms: [
      {
        name: 'promo_code_click',
        type: 'conversion',
        description: 'User clicked promo code field or button',
        defaultRole: 'mechanism',
        allowedRoles: ['mechanism'],
        requiresSelector: true,
        requiresTargetUrls: false,
        requiresPurchaseTracking: false,
      },
      {
        name: 'cart_item_remove',
        type: 'conversion',
        description: 'User removed item from cart',
        defaultRole: 'mechanism',
        allowedRoles: ['mechanism'],
        requiresSelector: true,
        requiresTargetUrls: false,
        requiresPurchaseTracking: false,
      },
      {
        name: 'cart_quantity_change',
        type: 'conversion',
        description: 'User changed quantity in cart',
        defaultRole: 'mechanism',
        allowedRoles: ['mechanism'],
        requiresSelector: true,
        requiresTargetUrls: false,
        requiresPurchaseTracking: false,
      },
    ],
    guardrails: [
      {
        name: 'purchase_completed',
        type: 'purchase',
        description: 'User completed a purchase',
        defaultRole: 'guardrail',
        allowedRoles: ['primary', 'guardrail'],
        requiresSelector: false,
        requiresTargetUrls: false,
        requiresPurchaseTracking: true,
      },
    ],
  },
  
  [PageType.CHECKOUT]: {
    primaryCandidates: [
      {
        name: 'purchase_completed',
        type: 'purchase',
        description: 'User completed a purchase',
        defaultRole: 'primary',
        allowedRoles: ['primary'],
        requiresSelector: false,
        requiresTargetUrls: false,
        requiresPurchaseTracking: true,
      },
      {
        name: 'payment_method_submit',
        type: 'conversion',
        description: 'User submitted payment method',
        defaultRole: 'primary',
        allowedRoles: ['primary'],
        requiresSelector: true,
        requiresTargetUrls: false,
        requiresPurchaseTracking: false,
      },
    ],
    mechanisms: [
      {
        name: 'payment_option_select',
        type: 'conversion',
        description: 'User selected a payment option',
        defaultRole: 'mechanism',
        allowedRoles: ['mechanism'],
        requiresSelector: true,
        requiresTargetUrls: false,
        requiresPurchaseTracking: false,
      },
      {
        name: 'shipping_method_select',
        type: 'conversion',
        description: 'User selected shipping method',
        defaultRole: 'mechanism',
        allowedRoles: ['mechanism'],
        requiresSelector: true,
        requiresTargetUrls: false,
        requiresPurchaseTracking: false,
      },
    ],
    guardrails: [],
  },
  
  [PageType.HOME]: {
    primaryCandidates: [
      {
        name: 'home_to_collection_click',
        type: 'conversion',
        description: 'User clicked from home to collection page',
        defaultRole: 'primary',
        allowedRoles: ['primary'],
        requiresSelector: true,
        requiresTargetUrls: false,
        requiresPurchaseTracking: false,
      },
      {
        name: 'home_to_pdp_click',
        type: 'conversion',
        description: 'User clicked from home to product detail page',
        defaultRole: 'primary',
        allowedRoles: ['primary'],
        requiresSelector: true,
        requiresTargetUrls: false,
        requiresPurchaseTracking: false,
      },
      {
        name: 'hero_cta_click',
        type: 'conversion',
        description: 'User clicked hero CTA on homepage',
        defaultRole: 'primary',
        allowedRoles: ['primary', 'mechanism'],
        requiresSelector: true,
        requiresTargetUrls: false,
        requiresPurchaseTracking: false,
      },
    ],
    mechanisms: [
      {
        name: 'newsletter_signup_click',
        type: 'conversion',
        description: 'User clicked newsletter signup',
        defaultRole: 'mechanism',
        allowedRoles: ['mechanism'],
        requiresSelector: true,
        requiresTargetUrls: false,
        requiresPurchaseTracking: false,
      },
      {
        name: 'featured_product_click',
        type: 'conversion',
        description: 'User clicked featured product',
        defaultRole: 'mechanism',
        allowedRoles: ['mechanism'],
        requiresSelector: true,
        requiresTargetUrls: false,
        requiresPurchaseTracking: false,
      },
    ],
    guardrails: COMMON_GUARDRAILS,
  },
  
  [PageType.SEARCH]: {
    primaryCandidates: [
      {
        name: 'search_result_click',
        type: 'conversion',
        description: 'User clicked on search result',
        defaultRole: 'primary',
        allowedRoles: ['primary'],
        requiresSelector: true,
        requiresTargetUrls: false,
        requiresPurchaseTracking: false,
      },
    ],
    mechanisms: [
      {
        name: 'search_filter_apply',
        type: 'conversion',
        description: 'User applied search filter',
        defaultRole: 'mechanism',
        allowedRoles: ['mechanism'],
        requiresSelector: true,
        requiresTargetUrls: false,
        requiresPurchaseTracking: false,
      },
    ],
    guardrails: COMMON_GUARDRAILS,
  },
  
  // Default catalogs for less common page types
  [PageType.ABOUT]: {
    primaryCandidates: [
      {
        name: 'about_cta_click',
        type: 'conversion',
        description: 'User clicked CTA on about page',
        defaultRole: 'primary',
        allowedRoles: ['primary'],
        requiresSelector: true,
        requiresTargetUrls: false,
        requiresPurchaseTracking: false,
      },
    ],
    mechanisms: [],
    guardrails: COMMON_GUARDRAILS,
  },
  
  [PageType.CONTACT]: {
    primaryCandidates: [
      {
        name: 'contact_form_submit',
        type: 'conversion',
        description: 'User submitted contact form',
        defaultRole: 'primary',
        allowedRoles: ['primary'],
        requiresSelector: true,
        requiresTargetUrls: false,
        requiresPurchaseTracking: false,
      },
    ],
    mechanisms: [],
    guardrails: COMMON_GUARDRAILS,
  },
  
  [PageType.ACCOUNT]: {
    primaryCandidates: [
      {
        name: 'account_action_click',
        type: 'conversion',
        description: 'User clicked account action',
        defaultRole: 'primary',
        allowedRoles: ['primary'],
        requiresSelector: true,
        requiresTargetUrls: false,
        requiresPurchaseTracking: false,
      },
    ],
    mechanisms: [],
    guardrails: COMMON_GUARDRAILS,
  },
  
  [PageType.OTHER]: {
    primaryCandidates: [
      {
        name: 'page_cta_click',
        type: 'conversion',
        description: 'User clicked primary CTA',
        defaultRole: 'primary',
        allowedRoles: ['primary'],
        requiresSelector: true,
        requiresTargetUrls: false,
        requiresPurchaseTracking: false,
      },
    ],
    mechanisms: [],
    guardrails: COMMON_GUARDRAILS,
  },
};

/**
 * Get signals for a specific page type
 */
export function getSignalsForPageType(pageType: PageType): PageTypeCatalog {
  return SIGNAL_CATALOG[pageType];
}

/**
 * Check if a signal name is valid for a given page type
 */
export function isValidSignalForPageType(
  signalName: string,
  pageType: PageType,
  role: SignalRole
): boolean {
  const catalog = SIGNAL_CATALOG[pageType];
  
  const allSignals = [
    ...catalog.primaryCandidates,
    ...catalog.mechanisms,
    ...catalog.guardrails,
  ];
  
  const signal = allSignals.find(s => s.name === signalName);
  if (!signal) return false;
  
  return signal.allowedRoles.includes(role);
}

/**
 * Get signal definition from catalog
 */
export function getSignalDefinition(
  signalName: string,
  pageType: PageType
): CatalogSignal | null {
  const catalog = SIGNAL_CATALOG[pageType];
  
  const allSignals = [
    ...catalog.primaryCandidates,
    ...catalog.mechanisms,
    ...catalog.guardrails,
  ];
  
  return allSignals.find(s => s.name === signalName) || null;
}

