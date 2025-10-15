/**
 * Centralized page type detection and configuration
 * Provides a single source of truth for page classification across the platform
 */

export enum PageType {
  HOME = 'home',
  PDP = 'pdp',
  COLLECTION = 'collection',
  CART = 'cart',
  CHECKOUT = 'checkout',
  ABOUT = 'about',
  CONTACT = 'contact',
  SEARCH = 'search',
  ACCOUNT = 'account',
  OTHER = 'other'
}

/**
 * Page type detection rules
 * Order matters - first match wins
 */
interface DetectionRule {
  type: PageType;
  patterns: RegExp[];
  priority?: number; // Lower number = higher priority
}

/**
 * Flexible detection rules that can be easily extended
 */
const DETECTION_RULES: DetectionRule[] = [
  {
    type: PageType.CHECKOUT,
    priority: 1,
    patterns: [
      /\/checkout\b/i,
      /\/payment\b/i,
      /\/billing\b/i,
      /\/order\/confirm/i
    ]
  },
  {
    type: PageType.CART,
    priority: 2,
    patterns: [
      /\/cart\b/i,
      /\/basket\b/i,
      /\/bag\b/i,
      /\/shopping-cart/i
    ]
  },
  {
    type: PageType.PDP,
    priority: 3,
    patterns: [
      /\/products?\//i,
      /\/item\//i,
      /\/p\//i,
      /\/merchandise\//i,
      /\/goods\//i,
      // Shopify specific
      /\/products\/[^\/]+$/i,
      // WooCommerce specific
      /\/product\/[^\/]+$/i
    ]
  },
  {
    type: PageType.COLLECTION,
    priority: 4,
    patterns: [
      /\/collections?\//i,
      /\/category\//i,
      /\/categories\//i,
      /\/shop\//i,
      /\/catalog\//i,
      /\/browse\//i,
      /\/store\//i,
      /\/all-products/i
    ]
  },
  {
    type: PageType.SEARCH,
    priority: 5,
    patterns: [
      /\/search/i,
      /[?&]q=/i,
      /[?&]query=/i,
      /[?&]search=/i,
      /\/find\//i
    ]
  },
  {
    type: PageType.ACCOUNT,
    priority: 6,
    patterns: [
      /\/account/i,
      /\/profile/i,
      /\/dashboard/i,
      /\/my-account/i,
      /\/customer\//i,
      /\/user\//i,
      /\/login/i,
      /\/register/i,
      /\/signup/i
    ]
  },
  {
    type: PageType.ABOUT,
    priority: 7,
    patterns: [
      /\/about/i,
      /\/our-story/i,
      /\/who-we-are/i,
      /\/mission/i,
      /\/company/i,
      /\/team/i
    ]
  },
  {
    type: PageType.CONTACT,
    priority: 8,
    patterns: [
      /\/contact/i,
      /\/get-in-touch/i,
      /\/reach-us/i,
      /\/support/i,
      /\/help/i,
      /\/customer-service/i
    ]
  }
];

/**
 * Detect page type from URL
 * @param url - The URL to analyze
 * @returns The detected page type
 */
export function detectPageType(url: string): PageType {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const search = urlObj.search;
    const fullPath = pathname + search;

    // Check for homepage
    if (!pathname || pathname === '/' || pathname === '/index' || pathname === '/home') {
      return PageType.HOME;
    }

    // Sort rules by priority
    const sortedRules = [...DETECTION_RULES].sort((a, b) =>
      (a.priority || 999) - (b.priority || 999)
    );

    // Check against detection rules
    for (const rule of sortedRules) {
      for (const pattern of rule.patterns) {
        if (pattern.test(fullPath)) {
          return rule.type;
        }
      }
    }

    // Default to OTHER if no match
    return PageType.OTHER;

  } catch (error) {
    console.warn(`[PAGE_TYPES] Invalid URL for page type detection: ${url}`, error);
    return PageType.OTHER;
  }
}

/**
 * Get human-readable label for page type
 */
export function getPageTypeLabel(pageType: PageType): string {
  const labels: Record<PageType, string> = {
    [PageType.HOME]: 'Homepage',
    [PageType.PDP]: 'Product Detail Page',
    [PageType.COLLECTION]: 'Collection/Category Page',
    [PageType.CART]: 'Shopping Cart',
    [PageType.CHECKOUT]: 'Checkout',
    [PageType.ABOUT]: 'About Page',
    [PageType.CONTACT]: 'Contact Page',
    [PageType.SEARCH]: 'Search Results',
    [PageType.ACCOUNT]: 'Account/Profile',
    [PageType.OTHER]: 'Other Page'
  };
  return labels[pageType] || 'Unknown';
}

/**
 * Check if a page type is commerce-related
 */
export function isCommercePageType(pageType: PageType): boolean {
  return [
    PageType.PDP,
    PageType.COLLECTION,
    PageType.CART,
    PageType.CHECKOUT
  ].includes(pageType);
}

/**
 * Validate if URL matches expected page type
 * Useful for double-checking classifications
 */
export function validatePageType(url: string, expectedType: PageType): boolean {
  const detectedType = detectPageType(url);
  return detectedType === expectedType;
}