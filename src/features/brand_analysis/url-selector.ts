/**
 * URL Selector Service
 * Intelligently selects representative URLs from a website for brand analysis
 */

import { detectPageType, PageType } from '@shared/page-types';

export interface SelectedUrls {
  pdp?: string;
  collection?: string;
  about?: string;
  cart?: string;
  [key: string]: string | undefined;
}

export interface UrlWithType {
  url: string;
  pageType: PageType;
  priority: number;
}

export class UrlSelector {
  /**
   * Select the best representative URLs for brand analysis
   * @param candidateUrls Array of URLs extracted from the homepage
   * @returns Object with selected URLs by page type
   */
  async selectUrls(candidateUrls: string[]): Promise<SelectedUrls> {
    const categorizedUrls = this.categorizeUrls(candidateUrls);
    const selectedUrls: SelectedUrls = {};

    // Prioritize PDP over collection due to Firecrawl concurrency limits
    // Select best PDP (product detail page) - highest priority
    if (categorizedUrls.pdp.length > 0) {
      selectedUrls.pdp = this.selectBestPDP(categorizedUrls.pdp);
    }

    // Only select collection page if no PDP is available
    if (categorizedUrls.collection.length > 0 && !selectedUrls.pdp) {
      selectedUrls.collection = this.selectBestCollection(categorizedUrls.collection);
    }

    // Select about page
    if (categorizedUrls.about.length > 0) {
      selectedUrls.about = categorizedUrls.about[0]; // Usually only one about page
    }

    // Select cart page if available
    if (categorizedUrls.cart.length > 0) {
      selectedUrls.cart = categorizedUrls.cart[0];
    }

    return selectedUrls;
  }

  /**
   * Get URLs with their page types and priorities
   * @param selectedUrls The selected URLs object
   * @returns Array of URLs with type information
   */
  getUrlsWithTypes(selectedUrls: SelectedUrls): UrlWithType[] {
    const results: UrlWithType[] = [];

    for (const [, url] of Object.entries(selectedUrls)) {
      if (url) {
        const pageType = detectPageType(url);
        results.push({
          url,
          pageType,
          priority: this.getPageTypePriority(pageType)
        });
      }
    }

    return results.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Categorize URLs by their detected page type
   */
  private categorizeUrls(urls: string[]): Record<string, string[]> {
    const categorized: Record<string, string[]> = {
      home: [],
      pdp: [],
      collection: [],
      cart: [],
      checkout: [],
      about: [],
      contact: [],
      search: [],
      account: [],
      other: []
    };

    for (const url of urls) {
      try {
        const pageType = detectPageType(url);
        const key = pageType.toString();
        if (!categorized[key]) {
          categorized[key] = [];
        }
        categorized[key].push(url);
      } catch (error) {
        // Invalid URL, skip it
        console.warn(`[URL_SELECTOR] Skipping invalid URL: ${url}`);
      }
    }

    return categorized;
  }

  /**
   * Select the best PDP URL from candidates
   * Prioritizes:
   * 1. Featured products
   * 2. Best sellers
   * 3. Products with clear names (not IDs)
   * 4. First available product
   */
  private selectBestPDP(pdpUrls: string[]): string | undefined {
    if (pdpUrls.length === 0) return undefined;

    // Look for featured products
    const featured = pdpUrls.find(url =>
      url.toLowerCase().includes('featured') ||
      url.toLowerCase().includes('best-seller') ||
      url.toLowerCase().includes('popular')
    );
    if (featured) return featured;

    // Prefer base product URLs without variant parameters (better for authentication)
    const baseProduct = pdpUrls.find(url => {
      const urlObj = new URL(url);
      return !urlObj.searchParams.has('variant') && !urlObj.searchParams.has('v');
    });
    if (baseProduct) return baseProduct;

    // Prefer URLs with readable product names over IDs
    const namedProduct = pdpUrls.find(url => {
      const parts = url.split('/');
      const lastPart = parts[parts.length - 1];
      // Check if it's a readable name (contains letters and hyphens) vs just an ID
      return /[a-z-]{5,}/i.test(lastPart) && !/^\d+$/.test(lastPart);
    });
    if (namedProduct) return namedProduct;

    // Return first available
    return pdpUrls[0];
  }

  /**
   * Select the best collection page from candidates
   * Prioritizes:
   * 1. Main shop/all products page
   * 2. Featured collections
   * 3. Collections with clear category names
   */
  private selectBestCollection(collectionUrls: string[]): string | undefined {
    if (collectionUrls.length === 0) return undefined;

    // Look for main shop page
    const mainShop = collectionUrls.find(url =>
      url.toLowerCase().includes('/shop') ||
      url.toLowerCase().includes('/all') ||
      url.toLowerCase().includes('/products')
    );
    if (mainShop) return mainShop;

    // Look for featured collections
    const featured = collectionUrls.find(url =>
      url.toLowerCase().includes('featured') ||
      url.toLowerCase().includes('new') ||
      url.toLowerCase().includes('best')
    );
    if (featured) return featured;

    // Return first available
    return collectionUrls[0];
  }

  /**
   * Get priority for page type (lower = higher priority)
   */
  private getPageTypePriority(pageType: PageType): number {
    const priorities: Record<string, number> = {
      [PageType.HOME]: 1,
      [PageType.PDP]: 2,
      [PageType.COLLECTION]: 3,
      [PageType.ABOUT]: 4,
      [PageType.CART]: 5,
      [PageType.CHECKOUT]: 6,
      [PageType.CONTACT]: 7,
      [PageType.SEARCH]: 8,
      [PageType.ACCOUNT]: 9,
      [PageType.OTHER]: 10
    };

    return priorities[pageType] || 99;
  }
}

/**
 * Extract URLs from HTML content
 * @param html The HTML content to extract URLs from
 * @param baseUrl The base URL to resolve relative URLs
 * @returns Array of absolute URLs
 */
export async function extractUrlsFromHtml(html: string, baseUrl: string): Promise<string[]> {
  const cheerio = await import('cheerio');
  const $ = cheerio.load(html);
  const urls: Set<string> = new Set();

  // Extract all links
  $('a[href]').each((_, element) => {
    const href = $(element).attr('href');
    if (href) {
      try {
        // Resolve relative URLs
        const absoluteUrl = new URL(href, baseUrl).toString();

        // Only include URLs from the same domain
        const baseDomain = new URL(baseUrl).hostname;
        const urlDomain = new URL(absoluteUrl).hostname;

        if (urlDomain === baseDomain) {
          // Skip certain URLs
          if (!shouldSkipUrl(absoluteUrl)) {
            urls.add(absoluteUrl);
            
            // Also add base product URL without variant parameters for better authentication
            if (absoluteUrl.includes('/products/') && (absoluteUrl.includes('?variant=') || absoluteUrl.includes('&variant='))) {
              try {
                const urlObj = new URL(absoluteUrl);
                urlObj.search = ''; // Remove all query parameters
                const baseProductUrl = urlObj.toString();
                if (!shouldSkipUrl(baseProductUrl)) {
                  urls.add(baseProductUrl);
                }
              } catch (error) {
                // Ignore URL parsing errors
              }
            }
          }
        }
      } catch (error) {
        // Invalid URL, skip it
      }
    }
  });

  return Array.from(urls);
}

/**
 * Determine if a URL should be skipped
 */
function shouldSkipUrl(url: string): boolean {
  const skipPatterns = [
    /\#/,                    // Anchor links
    /\.pdf$/i,               // PDF files
    /\.(jpg|jpeg|png|gif|svg|webp)$/i,  // Image files
    /\.(css|js)$/i,          // Asset files
    /\/cdn-cgi\//,           // Cloudflare URLs
    /\/admin/i,              // Admin pages
    /\/api\//,               // API endpoints
  ];

  // Skip URLs with query parameters, but allow product variant URLs
  if (url.includes('?')) {
    // Allow product URLs with variant parameters
    if (url.includes('/products/') && url.includes('variant=')) {
      return false;
    }
    // Skip other URLs with query parameters (filters, sorts, etc.)
    return true;
  }

  return skipPatterns.some(pattern => pattern.test(url));
}