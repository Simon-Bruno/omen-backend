/**
 * URL normalization and overlap detection utilities
 */

/**
 * Normalize a URL to a pattern for matching
 * This function intelligently converts URLs to patterns based on their structure
 *
 * Examples:
 * - https://example.com/ -> "/"
 * - https://example.com/products/shoe-123 -> "/products/[wildcard]"
 * - https://example.com/blog/2024/03/post -> "/blog/[wildcard]/[wildcard]/[wildcard]"
 * - /products/item -> "/products/[wildcard]"
 */
export function normalizeUrlToPattern(url: string): string {
  try {
    let pathname: string;

    // Handle full URLs
    if (url.startsWith('http://') || url.startsWith('https://')) {
      const u = new URL(url);
      pathname = u.pathname;
    } else {
      // Handle path-only strings
      pathname = url;
    }

    // Clean up the pathname
    pathname = pathname.replace(/\/+/g, '/'); // Replace multiple slashes with single
    pathname = pathname.replace(/\/$/, ''); // Remove trailing slash

    // Root path
    if (pathname === '' || pathname === '/') {
      return '/';
    }

    // Split path into segments
    const segments = pathname.split('/').filter(s => s.length > 0);

    if (segments.length === 0) {
      return '/';
    }

    // If URL already contains wildcards, return as-is
    if (pathname.includes('*')) {
      return pathname;
    }

    // For dynamic segments (containing IDs, slugs, etc), replace with wildcards
    // We keep the first segment as-is (usually the resource type)
    // and replace subsequent segments with wildcards if they look dynamic
    const pattern = segments.map((segment, index) => {
      // Keep the first segment (resource type) as-is
      if (index === 0) {
        return segment;
      }

      // Check if segment looks like a dynamic value
      // - Contains numbers mixed with letters (like IDs)
      // - Contains dashes or underscores (like slugs)
      // - Is a date-like pattern
      // - Is a UUID pattern
      const isDynamic =
        /\d/.test(segment) || // Contains numbers
        /[-_]/.test(segment) || // Contains dashes or underscores
        /^\d{4}$/.test(segment) || // Year-like
        /^[a-f0-9]{8}-?[a-f0-9]{4}-?[a-f0-9]{4}-?[a-f0-9]{4}-?[a-f0-9]{12}$/i.test(segment); // UUID-like

      return isDynamic ? '*' : segment;
    });

    return '/' + pattern.join('/');
  } catch (error) {
    // If parsing fails, return the original string
    return url;
  }
}

/**
 * Check if two URL patterns overlap
 * Handles both exact paths and wildcard patterns
 *
 * Examples:
 * - "/" and "/products" -> false
 * - "/products/[wildcard]" and "/products/shoe" -> true
 * - "/products/[wildcard]" and "/products/[wildcard]" -> true
 * - "/products/[wildcard]/reviews" and "/products/123/reviews" -> true
 */
export function urlOverlap(a: string, b: string): boolean {
  // Normalize both patterns
  const normalizedA = a.replace(/\/+$/, '') || '/';
  const normalizedB = b.replace(/\/+$/, '') || '/';

  // Exact match
  if (normalizedA === normalizedB) {
    return true;
  }

  // Convert patterns to regex for matching
  const patternToRegex = (pattern: string): RegExp => {
    // Escape special regex characters except *
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    // Replace * with regex equivalent
    const regexStr = '^' + escaped.replace(/\*/g, '[^/]+') + '(?:/|$)';
    return new RegExp(regexStr);
  };

  // Check if patterns have wildcards
  const aHasWildcard = normalizedA.includes('*');
  const bHasWildcard = normalizedB.includes('*');

  if (aHasWildcard && bHasWildcard) {
    // Both have wildcards - check if they could match the same URL
    // For simplicity, if they have the same prefix before first *, they overlap
    const aPrefix = normalizedA.split('*')[0];
    const bPrefix = normalizedB.split('*')[0];
    return aPrefix === bPrefix || aPrefix.startsWith(bPrefix) || bPrefix.startsWith(aPrefix);
  }

  if (aHasWildcard) {
    // Check if b matches pattern a
    const aRegex = patternToRegex(normalizedA);
    return aRegex.test(normalizedB + '/');
  }

  if (bHasWildcard) {
    // Check if a matches pattern b
    const bRegex = patternToRegex(normalizedB);
    return bRegex.test(normalizedA + '/');
  }

  // No wildcards, check if one is a prefix of the other
  return normalizedA.startsWith(normalizedB + '/') || normalizedB.startsWith(normalizedA + '/');
}

/**
 * Check if a specific URL matches a pattern
 */
export function urlMatchesPattern(url: string, pattern: string): boolean {
  const normalizedUrl = normalizeUrlToPattern(url);
  return urlOverlap(normalizedUrl, pattern);
}

/**
 * Extract URL pattern from experiment configuration
 * Handles various URL formats that might be stored in the database
 */
export function extractUrlPattern(urlConfig: string | { url?: string; pattern?: string } | undefined): string {
  if (!urlConfig) {
    return '/*'; // Default to all pages
  }

  if (typeof urlConfig === 'string') {
    return normalizeUrlToPattern(urlConfig);
  }

  if (typeof urlConfig === 'object') {
    return normalizeUrlToPattern(urlConfig.pattern || urlConfig.url || '/*');
  }

  return '/*';
}