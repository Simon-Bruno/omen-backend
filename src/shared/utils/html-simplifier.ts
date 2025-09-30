/**
 * HTML Simplification Utility
 * Reduces HTML size by removing unnecessary elements and normalizing content
 */

export function simplifyHTML(html: string): string {
  if (!html || html.length === 0) {
    return '';
  }

  // Process with single-pass operations to minimize memory usage
  return html
    // Remove comments (single pass)
    .replace(/<!--[\s\S]*?-->/g, '')
    // Remove script tags (single pass)
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    // Remove style tags (single pass)
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    // Remove tracking scripts (single pass)
    .replace(/<script[^>]*src="[^"]*(?:google-analytics|gtag|facebook|twitter|linkedin|pinterest)[^"]*"[^>]*>[\s\S]*?<\/script>/gi, '')
    // Remove meta tags (single pass)
    .replace(/<meta[^>]*(?:property|name)="(?:og:|twitter:|article:|product:)[^"]*"[^>]*>/gi, '')
    // Remove non-essential data attributes but keep important ones for element selection
    .replace(/\sdata-(?!(?:testid|omen-id|id|role|label|name|value|type|state|selected|checked|disabled|hidden|aria-))[^=]*="[^"]*"/gi, '')
    // Remove only style attributes and event handlers, but KEEP class attributes for element selection
    .replace(/\sstyle="[^"]*"/gi, '')
    .replace(/\s(?:onclick|onload|onmouseover|onmouseout|onfocus|onblur|onchange|onsubmit)="[^"]*"/gi, '')
    // Normalize whitespace (single pass)
    .replace(/\s+/g, ' ')
    // Remove empty lines (single pass)
    .replace(/\n\s*\n/g, '\n')
    // Trim final result
    .trim();
}

export function splitIntoChunks(str: string, chunkSize: number): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < str.length; i += chunkSize) {
    chunks.push(str.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * HTML Simplification for DOM Forensics
 * Preserves all attributes needed for element selection while removing unnecessary content
 */
export function simplifyHTMLForForensics(html: string): string {
  if (!html || html.length === 0) {
    return '';
  }

  // Process with single-pass operations to minimize memory usage
  return html
    // Remove comments (single pass)
    .replace(/<!--[\s\S]*?-->/g, '')
    // Remove script tags (single pass)
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    // Remove style tags (single pass)
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    // Remove tracking scripts (single pass)
    .replace(/<script[^>]*src="[^"]*(?:google-analytics|gtag|facebook|twitter|linkedin|pinterest)[^"]*"[^>]*>[\s\S]*?<\/script>/gi, '')
    // Remove meta tags (single pass)
    .replace(/<meta[^>]*(?:property|name)="(?:og:|twitter:|article:|product:)[^"]*"[^>]*>/gi, '')
    // Remove only non-essential data attributes, keep all important ones for element selection
    .replace(/\sdata-(?!(?:testid|omen-id|id|role|label|name|value|type|state|selected|checked|disabled|hidden|aria-|cypress|qa|qa-id|test|automation|e2e))[^=]*="[^"]*"/gi, '')
    // Remove only style attributes (keep all other attributes for element selection)
    .replace(/\sstyle="[^"]*"/gi, '')
    // Remove event handlers (keep all other attributes)
    .replace(/\s(?:onclick|onload|onmouseover|onmouseout|onfocus|onblur|onchange|onsubmit|onkeydown|onkeyup|onkeypress)="[^"]*"/gi, '')
    // Normalize whitespace (single pass)
    .replace(/\s+/g, ' ')
    // Remove empty lines (single pass)
    .replace(/\n\s*\n/g, '\n')
    // Trim final result
    .trim();
}

export function getHtmlInfo(html: string | null | undefined): string {
  if (!html) return 'no HTML';
  const size = html.length;
  const preview = html.substring(0, 50).replace(/\s+/g, ' ').trim();
  return `${size} chars (${preview}${size > 50 ? '...' : ''})`;
}
