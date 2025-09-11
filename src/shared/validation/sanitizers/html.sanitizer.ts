/**
 * HTML Sanitizer using DOMPurify
 * 
 * Professional HTML sanitization with configurable rules
 */

import DOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';

// Create a JSDOM instance for server-side DOMPurify
const window = new JSDOM('').window;
const purify = DOMPurify(window as any);

export interface HTMLSanitizationResult {
  isValid: boolean;
  sanitizedHTML: string;
  errors: string[];
}

// DOMPurify configuration for experiment variants
const SANITIZE_CONFIG = {
  ALLOWED_TAGS: [
    'div', 'span', 'p', 'strong', 'em', 'b', 'i', 'u', 'small',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li',
    'a', 'button', 'img',
    'br', 'hr',
    'section', 'article', 'header', 'footer', 'main', 'aside',
    'nav', 'figure', 'figcaption',
    'blockquote', 'cite', 'q',
    'code', 'pre', 'kbd', 'samp',
    'mark', 'del', 'ins', 'sub', 'sup',
    'time', 'address'
  ],
  ALLOWED_ATTR: [
    'class', 'id', 'style', 'title', 'lang', 'dir',
    'href', 'target', 'rel', 'type', 'role', 'aria-label', 'aria-labelledby',
    'src', 'alt', 'width', 'height', 'loading',
    'data-*' // Allow data attributes
  ],
  FORBID_ATTR: [
    'onload', 'onunload', 'onclick', 'ondblclick', 'onmousedown', 'onmouseup',
    'onmouseover', 'onmousemove', 'onmouseout', 'onfocus', 'onblur', 'onkeypress',
    'onkeydown', 'onkeyup', 'onsubmit', 'onreset', 'onselect', 'onchange',
    'onabort', 'onerror', 'onresize', 'onscroll', 'onbeforeunload', 'onunload',
    'srcdoc'
  ],
  FORBID_TAGS: [
    'script', 'iframe', 'object', 'embed', 'style', 'link', 'meta',
    'form', 'input', 'textarea', 'select', 'option',
    'canvas', 'svg', 'video', 'audio', 'source', 'track',
    'applet', 'base', 'frame', 'frameset', 'noframes'
  ],
  ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|cid|xmpp):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
  ALLOW_DATA_ATTR: true,
  SANITIZE_DOM: true,
  KEEP_CONTENT: true,
  RETURN_DOM: false,
  RETURN_DOM_FRAGMENT: false,
  RETURN_DOM_IMPORT: false
};

/**
 * Sanitizes HTML content for experiment variants
 */
export function sanitizeHTML(html: string): HTMLSanitizationResult {
  const errors: string[] = [];

  try {
    // Check size limit first
    const sizeKB = Buffer.byteLength(html, 'utf8') / 1024;
    if (sizeKB > 5) {
      errors.push(`HTML content exceeds 5KB limit. Current size: ${sizeKB.toFixed(2)}KB`);
      return { isValid: false, sanitizedHTML: '', errors };
    }

    // Sanitize with DOMPurify
    const sanitized = purify.sanitize(html, SANITIZE_CONFIG);

    // Check if anything was removed (indicates unsafe content)
    if (sanitized !== html) {
      // This is actually fine - DOMPurify removed unsafe content
      // We'll log it but not treat it as an error
      console.log('DOMPurify sanitized HTML content');
    }

    // Additional checks for specific dangerous patterns
    if (html.includes('javascript:') || html.includes('vbscript:') || html.includes('data:')) {
      errors.push('Dangerous protocols found in HTML content');
      return { isValid: false, sanitizedHTML: '', errors };
    }

    return {
      isValid: errors.length === 0,
      sanitizedHTML: sanitized,
      errors
    };

  } catch (error) {
    errors.push(`HTML sanitization error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return { isValid: false, sanitizedHTML: '', errors };
  }
}

/**
 * Validates HTML content size
 */
export function validateHTMLSize(html: string, maxSizeKB: number = 5): boolean {
  const sizeKB = Buffer.byteLength(html, 'utf8') / 1024;
  return sizeKB <= maxSizeKB;
}

/**
 * Gets HTML content size in KB
 */
export function getHTMLSizeKB(html: string): number {
  return Buffer.byteLength(html, 'utf8') / 1024;
}
