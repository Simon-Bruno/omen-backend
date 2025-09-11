/**
 * CSS Sanitizer
 * 
 * CSS validation and sanitization with regex-based approach
 * Lightweight and secure validation for experiment variants
 */

export interface CSSSanitizationResult {
  isValid: boolean;
  sanitizedCSS: string;
  errors: string[];
}

// Allowed CSS properties (subset for safety)
const ALLOWED_CSS_PROPERTIES = new Set([
  // Layout
  'display', 'position', 'top', 'right', 'bottom', 'left', 'z-index',
  'float', 'clear', 'overflow', 'overflow-x', 'overflow-y',
  'width', 'height', 'max-width', 'max-height', 'min-width', 'min-height',
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'border', 'border-width', 'border-style', 'border-color',
  'border-top', 'border-right', 'border-bottom', 'border-left',
  'border-radius', 'box-shadow', 'box-sizing',
  
  // Typography
  'font-family', 'font-size', 'font-weight', 'font-style', 'font-variant',
  'line-height', 'text-align', 'text-decoration', 'text-transform',
  'text-shadow', 'letter-spacing', 'word-spacing', 'white-space',
  'text-overflow', 'word-wrap', 'word-break',
  
  // Colors and backgrounds
  'color', 'background-color', 'background-image', 'background-position',
  'background-repeat', 'background-size', 'background-attachment',
  'opacity', 'visibility',
  
  // Flexbox
  'flex', 'flex-direction', 'flex-wrap', 'flex-flow', 'justify-content',
  'align-items', 'align-content', 'align-self', 'flex-grow', 'flex-shrink',
  'flex-basis', 'order',
  
  // Grid (basic)
  'grid', 'grid-template-columns', 'grid-template-rows', 'grid-template-areas',
  'grid-gap', 'grid-column-gap', 'grid-row-gap', 'justify-items', 'align-items',
  'grid-column', 'grid-row', 'grid-area',
  
  // Transitions and animations (basic)
  'transition', 'transition-property', 'transition-duration', 'transition-timing-function',
  'animation', 'animation-name', 'animation-duration', 'animation-timing-function',
  'animation-delay', 'animation-iteration-count', 'animation-direction',
  
  // Transform (basic)
  'transform', 'transform-origin',
  
  // Other safe properties
  'cursor', 'user-select', 'pointer-events', 'resize', 'outline', 'outline-width',
  'outline-style', 'outline-color', 'outline-offset'
]);

// Forbidden CSS properties
const FORBIDDEN_CSS_PROPERTIES = new Set([
  'behavior', 'expression', 'javascript:', 'vbscript:', 'mso-', '-moz-binding',
  'content', 'counter-reset', 'counter-increment', 'quotes'
]);

/**
 * Sanitizes CSS content for experiment variants
 */
export async function sanitizeCSS(css: string): Promise<CSSSanitizationResult> {
  const errors: string[] = [];

  try {
    // Check size limit first
    const sizeKB = Buffer.byteLength(css, 'utf8') / 1024;
    if (sizeKB > 10) {
      errors.push(`CSS content exceeds 10KB limit. Current size: ${sizeKB.toFixed(2)}KB`);
      return { isValid: false, sanitizedCSS: '', errors };
    }

    // Check for @import statements
    if (css.includes('@import')) {
      errors.push('@import statements are not allowed');
      return { isValid: false, sanitizedCSS: '', errors };
    }

    // Check for @font-face
    if (css.includes('@font-face')) {
      errors.push('@font-face is not allowed in MVP');
      return { isValid: false, sanitizedCSS: '', errors };
    }

    // Check for dangerous functions
    const dangerousFunctions = ['javascript:', 'vbscript:', 'expression(', 'url(javascript:', 'url(vbscript:'];
    for (const func of dangerousFunctions) {
      if (css.toLowerCase().includes(func.toLowerCase())) {
        errors.push(`Dangerous CSS function found: ${func}`);
        return { isValid: false, sanitizedCSS: '', errors };
      }
    }

    // Check for forbidden properties
    for (const prop of FORBIDDEN_CSS_PROPERTIES) {
      const regex = new RegExp(`\\b${prop.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:`, 'gi');
      if (regex.test(css)) {
        errors.push(`Forbidden CSS property found: ${prop}`);
        return { isValid: false, sanitizedCSS: '', errors };
      }
    }

    // Validate that all selectors start with .omen-
    const selectorRegex = /([^{}]+)\s*{/g;
    let match;
    while ((match = selectorRegex.exec(css)) !== null) {
      const selector = match[1].trim();
      if (selector && !selector.includes('.omen-')) {
        errors.push(`CSS selector must include .omen- prefix: ${selector}`);
        return { isValid: false, sanitizedCSS: '', errors };
      }
    }

    // Basic property validation
    const propertyRegex = /([a-zA-Z-]+)\s*:/g;
    while ((match = propertyRegex.exec(css)) !== null) {
      const property = match[1].toLowerCase();
      if (!ALLOWED_CSS_PROPERTIES.has(property) && !property.startsWith('--')) {
        errors.push(`Unallowed CSS property: ${property}`);
        return { isValid: false, sanitizedCSS: '', errors };
      }
    }

    return {
      isValid: errors.length === 0,
      sanitizedCSS: css,
      errors: []
    };

  } catch (error) {
    errors.push(`CSS sanitization error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return { isValid: false, sanitizedCSS: '', errors };
  }
}

/**
 * Validates CSS content size
 */
export function validateCSSSize(css: string, maxSizeKB: number = 10): boolean {
  const sizeKB = Buffer.byteLength(css, 'utf8') / 1024;
  return sizeKB <= maxSizeKB;
}

/**
 * Gets CSS content size in KB
 */
export function getCSSSizeKB(css: string): number {
  return Buffer.byteLength(css, 'utf8') / 1024;
}

/**
 * Validates that all CSS selectors are properly namespaced with .omen-
 */
export async function validateCSSNamespace(css: string): Promise<boolean> {
  try {
    const selectorRegex = /([^{}]+)\s*{/g;
    let match;
    while ((match = selectorRegex.exec(css)) !== null) {
      const selector = match[1].trim();
      if (selector && !selector.includes('.omen-')) {
        return false; // Found non-namespaced selector
      }
    }
    return true;
  } catch {
    return false;
  }
}
