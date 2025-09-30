// URL Utilities
import * as cheerio from 'cheerio';

export function extractUrlsFromHtml(html: string, baseUrl: string): string[] {
  const candidates = [baseUrl];
  
  try {
    // Parse HTML with cheerio for better URL extraction
    const $ = cheerio.load(html);
    const baseUrlObj = new URL(baseUrl);
    
    // Extract all href attributes from anchor tags
    $('a[href]').each((_, element) => {
      const href = $(element).attr('href');
      if (!href) return;
      
      try {
        // Handle relative URLs
        if (href.startsWith('/')) {
          const fullUrl = `${baseUrlObj.origin}${href}`;
          if (!candidates.includes(fullUrl)) {
            candidates.push(fullUrl);
          }
        }
        // Handle absolute URLs on the same domain
        else if (href.startsWith('http')) {
          const hrefUrl = new URL(href);
          if (hrefUrl.hostname === baseUrlObj.hostname) {
            if (!candidates.includes(href)) {
              candidates.push(href);
            }
          }
        }
        // Handle protocol-relative URLs
        else if (href.startsWith('//')) {
          const fullUrl = `${baseUrlObj.protocol}${href}`;
          const hrefUrl = new URL(fullUrl);
          if (hrefUrl.hostname === baseUrlObj.hostname) {
            if (!candidates.includes(fullUrl)) {
              candidates.push(fullUrl);
            }
          }
        }
      } catch (urlError) {
        // Skip invalid URLs
        console.warn(`[URL_UTILS] Skipping invalid URL: ${href}`, urlError);
      }
    });
    
    console.log(`[URL_UTILS] Found ${candidates.length} candidate URLs from HTML parsing`);
    
    // Log some examples for debugging
    if (candidates.length > 1) {
      console.log(`[URL_UTILS] Sample URLs found:`, candidates.slice(0, 10));
    }
    
  } catch (error) {
    console.warn(`[URL_UTILS] Error extracting URLs from HTML:`, error);
    
    // Fallback to regex-based extraction
    try {
      const regex = /href="([^"]+)"/g;
      let m: RegExpExecArray | null;
      while ((m = regex.exec(html)) !== null) {
        const href = m[1];
        if (href.startsWith('/') && !candidates.includes(`${baseUrl}${href}`)) {
          candidates.push(`${baseUrl}${href}`);
        }
      }
      console.log(`[URL_UTILS] Fallback regex found ${candidates.length} candidate URLs`);
    } catch (regexError) {
      console.warn(`[URL_UTILS] Fallback regex extraction also failed:`, regexError);
    }
  }
  
  return candidates;
}
