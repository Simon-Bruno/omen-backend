// Screenshot Configuration - Single Source of Truth
import { ScreenshotOptions } from '@services/screenshot-storage';

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

// Default page type mapping
export const getPageType = (url: string): 'home' | 'pdp' | 'about' | 'other' => {
  const urlLower = url.toLowerCase();
  
  if (urlLower.includes('/product/') || urlLower.includes('/products/')) {
    return 'pdp';
  }
  
  if (urlLower.includes('/about') || urlLower.includes('/about-us')) {
    return 'about';
  }
  
  if (urlLower === url.toLowerCase() || urlLower.endsWith('/') || urlLower.split('/').length <= 3) {
    return 'home';
  }
  
  return 'other';
};


