/**
 * Shared DOM utilities using Cheerio
 * Consolidates selector checking across the codebase
 */
import * as cheerio from 'cheerio';

/**
 * Check if a selector exists in HTML
 * Used for signal validation against control DOM
 */
export function checkSelectorExists(html: string, selector: string): boolean {
  try {
    const $ = cheerio.load(html);
    return $(selector).length > 0;
  } catch (error) {
    console.warn(`[DOM_UTILS] Invalid selector "${selector}":`, error);
    return false;
  }
}

