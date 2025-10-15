// Screenshot Configuration - Single Source of Truth
import { ScreenshotOptions } from '@services/screenshot-storage';
import { detectPageType } from '@shared/page-types';

// Standard screenshot configuration used across all services
export const STANDARD_SCREENSHOT_OPTIONS: ScreenshotOptions = {
  viewport: { width: 1920, height: 1080 },
  fullPage: true,
  quality: 80
};

// High quality screenshot configuration for brand analysis
export const HIGH_QUALITY_SCREENSHOT_OPTIONS: ScreenshotOptions = {
  viewport: { width: 1920, height: 1080 },
  fullPage: true,
  quality: 100
};

// Re-export page type detection from centralized module
export const getPageType = (url: string): 'home' | 'pdp' | 'about' | 'other' => {
  const pageType = detectPageType(url);
  // Map enum values to string literals for backward compatibility
  return pageType as 'home' | 'pdp' | 'about' | 'other';
};

// Smart URL pattern matching for experiment targeting
export interface URLPattern {
  type: 'exact' | 'startsWith' | 'endsWith' | 'contains' | 'regex';
  pattern: string;
  caseSensitive?: boolean;
}

export function matchesURLPattern(url: string, patterns: URLPattern[]): boolean {
  if (!patterns || patterns.length === 0) return true; // No patterns = match all
  
  return patterns.some(pattern => {
    const targetUrl = pattern.caseSensitive ? url : url.toLowerCase();
    const targetPattern = pattern.caseSensitive ? pattern.pattern : pattern.pattern.toLowerCase();
    
    switch (pattern.type) {
      case 'exact':
        return targetUrl === targetPattern;
      case 'startsWith':
        return targetUrl.startsWith(targetPattern);
      case 'endsWith':
        return targetUrl.endsWith(targetPattern);
      case 'contains':
        return targetUrl.includes(targetPattern);
      case 'regex':
        try {
          const regex = new RegExp(targetPattern, pattern.caseSensitive ? 'g' : 'gi');
          return regex.test(targetUrl);
        } catch (error) {
          console.warn(`Invalid regex pattern: ${targetPattern}`, error);
          return false;
        }
      default:
        return false;
    }
  });
}

// Helper function to create common URL patterns
export function createURLPatterns(patterns: string[]): URLPattern[] {
  return patterns.map(pattern => {
    // Detect pattern type based on syntax
    if (pattern.startsWith('^') && pattern.endsWith('$')) {
      // Exact match
      return { type: 'exact', pattern: pattern.slice(1, -1) };
    } else if (pattern.startsWith('^')) {
      // Starts with
      return { type: 'startsWith', pattern: pattern.slice(1) };
    } else if (pattern.endsWith('$')) {
      // Ends with
      return { type: 'endsWith', pattern: pattern.slice(0, -1) };
    } else if (pattern.includes('*')) {
      // Wildcard - convert to regex
      const regexPattern = pattern.replace(/\*/g, '.*');
      return { type: 'regex', pattern: `^${regexPattern}$` };
    } else if (pattern.startsWith('/') && pattern.endsWith('/')) {
      // Regex pattern
      return { type: 'regex', pattern: pattern.slice(1, -1) };
    } else {
      // Contains
      return { type: 'contains', pattern };
    }
  });
}


