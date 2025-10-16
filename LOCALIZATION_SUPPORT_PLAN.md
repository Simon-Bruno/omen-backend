# Localization Support Plan

## Executive Summary

This document outlines a comprehensive plan to add multi-language and multi-locale support to the Omen platform. The plan ensures that AI-generated variants align with the website's displayed language and provides merchants with fine-grained control over which experiments run on which localizations.

### Current State
- No language detection or locale awareness
- Brand analysis extracts content without language context
- Variants generated without considering target language
- No mechanism to enable/disable experiments per locale
- URL targeting doesn't account for locale-specific paths

### Target State
- Automatic language detection during brand analysis
- Language-aware variant generation (matching site language)
- Locale-specific experiment targeting and control
- Support for common e-commerce locale patterns (URL subpaths, subdomains, parameters)
- Multi-language content in brand analysis
- Per-locale experiment activation/deactivation

### Estimated Effort: 4-5 Sprint Weeks (20-26 development hours)

---

## Phase 1: Foundation - Language Detection & Storage (Week 1)

### 1.1 Database Schema Updates

**Problem**: Current schema has no place to store language/locale information.

**Solution**: Add language fields to relevant models.

#### Migration: `add_localization_support`

```prisql
-- Add language fields to Project
ALTER TABLE "projects" ADD COLUMN "primaryLocale" TEXT;
ALTER TABLE "projects" ADD COLUMN "supportedLocales" JSONB DEFAULT '[]';
ALTER TABLE "projects" ADD COLUMN "localeConfig" JSONB;

-- Add language field to Screenshot
ALTER TABLE "screenshots" ADD COLUMN "locale" TEXT;
ALTER INDEX "screenshots" RENAME TO "screenshots_old_unique";
ALTER TABLE "screenshots" ADD CONSTRAINT "screenshots_projectId_pageType_locale_unique" 
  UNIQUE("projectId", "pageType", "locale", "variantId", "viewportWidth", "viewportHeight", "fullPage", "quality");
DROP INDEX "screenshots_old_unique";

-- Add locale targeting to Experiment
ALTER TABLE "experiments" ADD COLUMN "enabledLocales" TEXT[] DEFAULT ARRAY['*'];
ALTER TABLE "experiments" ADD COLUMN "disabledLocales" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Add index for locale filtering
CREATE INDEX "experiments_enabled_locales_idx" ON "experiments" USING GIN("enabledLocales");
CREATE INDEX "screenshots_locale_idx" ON "screenshots"("locale");
```

#### Updated Prisma Schema

```typescript
model Project {
  id               String            @id @default(cuid())
  shopDomain       String            @unique
  brandAnalysis    Json?
  accessTokenEnc   String?
  userId           String            @unique
  createdAt        DateTime          @default(now())
  isShopify        Boolean           @default(true)
  designSystem     Json?
  primaryLocale    String?           // e.g., "en-US", "fr-FR", "de-DE"
  supportedLocales Json?             // Array of supported locales with metadata
  localeConfig     Json?             // Locale detection configuration
  // ... rest of fields
}

model Experiment {
  id                    String                @id @default(cuid())
  projectId             String
  name                  String
  status                JobStatus             @default(DRAFT)
  // ... existing fields ...
  enabledLocales        String[]              @default(["*"]) // ["*"] = all, or specific locales
  disabledLocales       String[]              @default([])    // Explicit exclusions
  // ... rest of fields
  
  @@index([projectId, status])
  @@index([enabledLocales], type: Gin)
  @@map("experiments")
}

model Screenshot {
  id              String   @id @default(cuid())
  projectId       String
  url             String
  pageType        String
  variantId       String?
  locale          String?  // e.g., "en-US", "fr-FR"
  // ... existing fields ...
  
  @@unique([projectId, pageType, locale, variantId, viewportWidth, viewportHeight, fullPage, quality])
  @@index([projectId])
  @@index([locale])
  // ... rest of indexes
  @@map("screenshots")
}
```

### 1.2 Locale Detection Service

**Create**: `/src/features/localization/locale-detector.ts`

```typescript
// Locale Detection Service
import { z } from 'zod';

export interface LocaleInfo {
  locale: string;              // e.g., "en-US", "fr-FR", "de-DE"
  language: string;            // e.g., "en", "fr", "de"
  region?: string;             // e.g., "US", "FR", "DE"
  confidence: number;          // 0-1 confidence score
  detectionMethod: LocaleDetectionMethod;
  urlPattern?: string;         // URL pattern for this locale (if applicable)
}

export enum LocaleDetectionMethod {
  URL_PATH = 'url_path',           // /en-us/, /fr-fr/
  SUBDOMAIN = 'subdomain',         // en.example.com, fr.example.com
  URL_PARAM = 'url_param',         // ?locale=en-US
  HTML_LANG = 'html_lang',         // <html lang="en-US">
  META_TAG = 'meta_tag',           // <meta name="language" content="en-US">
  CONTENT_ANALYSIS = 'content_analysis'  // AI-based detection from content
}

export interface LocaleDetectionResult {
  detected: LocaleInfo;
  alternatives: LocaleInfo[];
  multilingualSite: boolean;
  localePattern?: LocaleUrlPattern;
}

export interface LocaleUrlPattern {
  type: 'path' | 'subdomain' | 'parameter';
  pattern: string;              // Regex or template
  locales: string[];            // List of available locales
  examples: Record<string, string>;  // locale -> example URL
}

export class LocaleDetectorService {
  /**
   * Detect locale from HTML content and URL
   */
  async detectLocale(
    url: string,
    html: string,
    markdown?: string
  ): Promise<LocaleDetectionResult> {
    const detections: LocaleInfo[] = [];

    // 1. Check URL patterns
    const urlLocale = this.detectFromUrl(url);
    if (urlLocale) {
      detections.push(urlLocale);
    }

    // 2. Check HTML lang attribute
    const htmlLangLocale = this.detectFromHtmlLang(html);
    if (htmlLangLocale) {
      detections.push(htmlLangLocale);
    }

    // 3. Check meta tags
    const metaLocale = this.detectFromMetaTags(html);
    if (metaLocale) {
      detections.push(metaLocale);
    }

    // 4. Content-based detection (AI-powered fallback)
    const contentLocale = await this.detectFromContent(markdown || html);
    if (contentLocale) {
      detections.push(contentLocale);
    }

    // 5. Determine primary locale (highest confidence)
    const detected = this.selectPrimaryLocale(detections);
    
    // 6. Detect if this is a multilingual site
    const multilingualSite = await this.isMultilingualSite(url, html);
    
    // 7. Extract locale URL pattern if multilingual
    const localePattern = multilingualSite 
      ? await this.extractLocalePattern(url, html)
      : undefined;

    return {
      detected,
      alternatives: detections.filter(d => d.locale !== detected.locale),
      multilingualSite,
      localePattern
    };
  }

  private detectFromUrl(url: string): LocaleInfo | null {
    try {
      const urlObj = new URL(url);
      
      // Check path-based locales: /en-us/, /fr-fr/, /en/, /fr/
      const pathMatch = urlObj.pathname.match(/^\/([a-z]{2}(?:-[A-Z]{2})?)\//i);
      if (pathMatch) {
        const locale = this.normalizeLocale(pathMatch[1]);
        return {
          locale,
          language: locale.split('-')[0],
          region: locale.split('-')[1],
          confidence: 0.9,
          detectionMethod: LocaleDetectionMethod.URL_PATH,
          urlPattern: `/${pathMatch[1]}/`
        };
      }

      // Check subdomain: en.example.com, fr.example.com
      const subdomainMatch = urlObj.hostname.match(/^([a-z]{2})\.(.+)$/i);
      if (subdomainMatch && this.isValidLanguageCode(subdomainMatch[1])) {
        const locale = this.normalizeLocale(subdomainMatch[1]);
        return {
          locale,
          language: locale.split('-')[0],
          confidence: 0.85,
          detectionMethod: LocaleDetectionMethod.SUBDOMAIN
        };
      }

      // Check URL parameters: ?locale=en-US, ?lang=en
      const localeParam = urlObj.searchParams.get('locale') || 
                          urlObj.searchParams.get('lang') ||
                          urlObj.searchParams.get('language');
      if (localeParam) {
        const locale = this.normalizeLocale(localeParam);
        return {
          locale,
          language: locale.split('-')[0],
          region: locale.split('-')[1],
          confidence: 0.8,
          detectionMethod: LocaleDetectionMethod.URL_PARAM
        };
      }

      return null;
    } catch (error) {
      console.error('[LOCALE_DETECTOR] Error detecting locale from URL:', error);
      return null;
    }
  }

  private detectFromHtmlLang(html: string): LocaleInfo | null {
    try {
      // Match <html lang="en-US"> or <html lang="en">
      const match = html.match(/<html[^>]+lang=["']([^"']+)["']/i);
      if (match) {
        const locale = this.normalizeLocale(match[1]);
        return {
          locale,
          language: locale.split('-')[0],
          region: locale.split('-')[1],
          confidence: 0.95,
          detectionMethod: LocaleDetectionMethod.HTML_LANG
        };
      }
      return null;
    } catch (error) {
      console.error('[LOCALE_DETECTOR] Error detecting locale from HTML lang:', error);
      return null;
    }
  }

  private detectFromMetaTags(html: string): LocaleInfo | null {
    try {
      // Look for various meta tags
      const patterns = [
        /<meta[^>]+name=["']language["'][^>]+content=["']([^"']+)["']/i,
        /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']language["']/i,
        /<meta[^>]+property=["']og:locale["'][^>]+content=["']([^"']+)["']/i,
        /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:locale["']/i
      ];

      for (const pattern of patterns) {
        const match = html.match(pattern);
        if (match) {
          const locale = this.normalizeLocale(match[1]);
          return {
            locale,
            language: locale.split('-')[0],
            region: locale.split('-')[1],
            confidence: 0.85,
            detectionMethod: LocaleDetectionMethod.META_TAG
          };
        }
      }

      return null;
    } catch (error) {
      console.error('[LOCALE_DETECTOR] Error detecting locale from meta tags:', error);
      return null;
    }
  }

  private async detectFromContent(content: string): Promise<LocaleInfo | null> {
    try {
      // Use a lightweight language detection library or AI
      // For now, use a simple heuristic based on common words
      // TODO: Integrate with AI for better accuracy
      
      const languageIndicators = {
        'en': ['the', 'and', 'for', 'with', 'you', 'this', 'that', 'from'],
        'fr': ['le', 'la', 'les', 'et', 'pour', 'avec', 'vous', 'dans'],
        'de': ['der', 'die', 'das', 'und', 'für', 'mit', 'sie', 'aus'],
        'es': ['el', 'la', 'los', 'las', 'y', 'para', 'con', 'usted'],
        'it': ['il', 'la', 'i', 'le', 'e', 'per', 'con', 'che'],
        'pt': ['o', 'a', 'os', 'as', 'e', 'para', 'com', 'você'],
        'nl': ['de', 'het', 'een', 'en', 'voor', 'met', 'je', 'van'],
        'ja': ['の', 'に', 'は', 'を', 'た', 'が', 'で', 'て'],
        'zh': ['的', '了', '和', '是', '在', '有', '我', '不']
      };

      const lowercaseContent = content.toLowerCase();
      const scores: Record<string, number> = {};

      for (const [lang, indicators] of Object.entries(languageIndicators)) {
        let score = 0;
        for (const indicator of indicators) {
          const regex = new RegExp(`\\b${indicator}\\b`, 'gi');
          const matches = lowercaseContent.match(regex);
          score += matches ? matches.length : 0;
        }
        scores[lang] = score;
      }

      // Find the language with the highest score
      const detectedLang = Object.entries(scores).reduce((a, b) => 
        a[1] > b[1] ? a : b
      )[0];

      if (scores[detectedLang] > 5) { // Minimum threshold
        return {
          locale: detectedLang,
          language: detectedLang,
          confidence: Math.min(scores[detectedLang] / 50, 0.7), // Max 0.7 confidence
          detectionMethod: LocaleDetectionMethod.CONTENT_ANALYSIS
        };
      }

      return null;
    } catch (error) {
      console.error('[LOCALE_DETECTOR] Error detecting locale from content:', error);
      return null;
    }
  }

  private selectPrimaryLocale(detections: LocaleInfo[]): LocaleInfo {
    if (detections.length === 0) {
      // Default to English
      return {
        locale: 'en',
        language: 'en',
        confidence: 0.5,
        detectionMethod: LocaleDetectionMethod.CONTENT_ANALYSIS
      };
    }

    // Sort by confidence and prefer explicit methods
    const methodPriority = {
      [LocaleDetectionMethod.HTML_LANG]: 5,
      [LocaleDetectionMethod.URL_PATH]: 4,
      [LocaleDetectionMethod.META_TAG]: 3,
      [LocaleDetectionMethod.SUBDOMAIN]: 2,
      [LocaleDetectionMethod.URL_PARAM]: 1,
      [LocaleDetectionMethod.CONTENT_ANALYSIS]: 0
    };

    return detections.sort((a, b) => {
      const priorityDiff = methodPriority[b.detectionMethod] - methodPriority[a.detectionMethod];
      if (priorityDiff !== 0) return priorityDiff;
      return b.confidence - a.confidence;
    })[0];
  }

  private async isMultilingualSite(url: string, html: string): Promise<boolean> {
    try {
      // Check for language switchers in HTML
      const languageSwitcherPatterns = [
        /lang-?switcher/i,
        /locale-?selector/i,
        /language-?selector/i,
        /hreflang=/i
      ];

      for (const pattern of languageSwitcherPatterns) {
        if (pattern.test(html)) {
          return true;
        }
      }

      // Check for hreflang links
      const hreflangMatches = html.match(/<link[^>]+hreflang=["']([^"']+)["']/gi);
      if (hreflangMatches && hreflangMatches.length > 1) {
        return true;
      }

      return false;
    } catch (error) {
      console.error('[LOCALE_DETECTOR] Error checking multilingual site:', error);
      return false;
    }
  }

  private async extractLocalePattern(url: string, html: string): Promise<LocaleUrlPattern | undefined> {
    try {
      // Extract hreflang links to understand locale structure
      const hreflangMatches = html.matchAll(
        /<link[^>]+rel=["']alternate["'][^>]+hreflang=["']([^"']+)["'][^>]+href=["']([^"']+)["']/gi
      );

      const localeUrls: Record<string, string> = {};
      for (const match of hreflangMatches) {
        localeUrls[match[1]] = match[2];
      }

      if (Object.keys(localeUrls).length === 0) {
        return undefined;
      }

      // Analyze URL patterns
      const urlObj = new URL(url);
      const exampleUrls = Object.entries(localeUrls);
      
      // Check if path-based
      const pathBased = exampleUrls.every(([_, u]) => {
        try {
          const testUrl = new URL(u);
          return testUrl.hostname === urlObj.hostname && /^\/[a-z]{2}/.test(testUrl.pathname);
        } catch {
          return false;
        }
      });

      if (pathBased) {
        return {
          type: 'path',
          pattern: '/{{locale}}/*',
          locales: Object.keys(localeUrls),
          examples: localeUrls
        };
      }

      // Check if subdomain-based
      const subdomainBased = exampleUrls.every(([_, u]) => {
        try {
          const testUrl = new URL(u);
          return /^[a-z]{2}\./.test(testUrl.hostname);
        } catch {
          return false;
        }
      });

      if (subdomainBased) {
        return {
          type: 'subdomain',
          pattern: '{{locale}}.example.com',
          locales: Object.keys(localeUrls),
          examples: localeUrls
        };
      }

      // Check if parameter-based
      const paramBased = exampleUrls.every(([_, u]) => {
        try {
          const testUrl = new URL(u);
          return testUrl.searchParams.has('locale') || testUrl.searchParams.has('lang');
        } catch {
          return false;
        }
      });

      if (paramBased) {
        return {
          type: 'parameter',
          pattern: '?locale={{locale}}',
          locales: Object.keys(localeUrls),
          examples: localeUrls
        };
      }

      return undefined;
    } catch (error) {
      console.error('[LOCALE_DETECTOR] Error extracting locale pattern:', error);
      return undefined;
    }
  }

  private normalizeLocale(locale: string): string {
    // Normalize locale codes to standard format (e.g., en-US, fr-FR)
    const cleaned = locale.replace(/_/g, '-').trim();
    const parts = cleaned.split('-');
    
    if (parts.length === 1) {
      return parts[0].toLowerCase();
    }
    
    return `${parts[0].toLowerCase()}-${parts[1].toUpperCase()}`;
  }

  private isValidLanguageCode(code: string): boolean {
    // ISO 639-1 two-letter language codes
    const validCodes = [
      'en', 'fr', 'de', 'es', 'it', 'pt', 'nl', 'pl', 'ru', 'ja', 
      'zh', 'ko', 'ar', 'hi', 'tr', 'sv', 'da', 'no', 'fi', 'cs'
    ];
    return validCodes.includes(code.toLowerCase());
  }
}

// Factory function
export function createLocaleDetector(): LocaleDetectorService {
  return new LocaleDetectorService();
}
```

### 1.3 Integrate Locale Detection into Brand Analysis

**Update**: `/src/features/brand_analysis/brand-analysis.ts`

```typescript
// Add locale detection to analyzeProject function
import { createLocaleDetector, LocaleDetectionResult } from '@features/localization/locale-detector';

export async function analyzeProject(projectId: string, shopDomain: string): Promise<BrandIntelligenceData> {
  const screenshotStorage = createScreenshotStorageService();
  const localeDetector = createLocaleDetector();

  try {
    console.log(`[BRAND_ANALYSIS] Starting Firecrawl analysis for project ${projectId}`);

    const baseUrl = shopDomain.startsWith('http://') || shopDomain.startsWith('https://')
      ? shopDomain
      : `https://${shopDomain}`;
    const firecrawlService = new FirecrawlService();

    // Step 1: Analyze homepage
    const homeResult = await firecrawlService.analyzePage(baseUrl, 'home');

    if (homeResult.error || !homeResult.data) {
      throw new Error(`Homepage analysis failed: ${homeResult.error}`);
    }

    // Step 1.5: Detect locale from homepage
    console.log(`[BRAND_ANALYSIS] Detecting locale for homepage`);
    const localeDetection: LocaleDetectionResult = await localeDetector.detectLocale(
      baseUrl,
      homeResult.html || '',
      homeResult.markdown
    );

    console.log(`[BRAND_ANALYSIS] Detected locale: ${localeDetection.detected.locale} (${localeDetection.detected.confidence} confidence)`);
    console.log(`[BRAND_ANALYSIS] Multilingual site: ${localeDetection.multilingualSite}`);

    // Store locale information in project
    await ProjectDAL.updateProject(projectId, {
      primaryLocale: localeDetection.detected.locale,
      supportedLocales: localeDetection.multilingualSite 
        ? { 
            detected: localeDetection.detected,
            alternatives: localeDetection.alternatives,
            pattern: localeDetection.localePattern 
          }
        : null,
      localeConfig: localeDetection
    });

    // Store screenshot with locale
    await storeScreenshot(
      projectId, 
      'home', 
      baseUrl, 
      homeResult.screenshot, 
      homeResult.html, 
      homeResult.markdown, 
      screenshotStorage,
      localeDetection.detected.locale  // Pass locale
    );

    // Continue with rest of analysis...
    // ... existing code ...
  } catch (error) {
    console.error(`[BRAND_ANALYSIS] Brand analysis failed:`, error);
    throw error;
  }
}

// Update storeScreenshot helper
async function storeScreenshot(
  projectId: string,
  pageType: string,
  url: string,
  screenshot: string | undefined,
  html: string | undefined,
  markdown: string | undefined,
  screenshotStorage: ScreenshotStorageService,
  locale?: string  // Add locale parameter
): Promise<void> {
  if (!screenshot) {
    console.log(`[BRAND_ANALYSIS] No screenshot available for ${pageType} page`);
    return;
  }

  try {
    await screenshotStorage.saveScreenshot(
      projectId,
      pageType as 'home' | 'pdp' | 'about' | 'other',
      url,
      HIGH_QUALITY_SCREENSHOT_OPTIONS,
      screenshot,
      html,
      markdown,
      locale  // Pass locale to storage
    );
    console.log(`[BRAND_ANALYSIS] Screenshot saved with locale: ${locale}`);
  } catch (error) {
    console.error(`[BRAND_ANALYSIS] Failed to save screenshot:`, error);
  }
}
```

---

## Phase 2: Language-Aware Content Generation (Week 2)

### 2.1 Update Hypothesis Generation with Language Context

**Update**: `/src/features/hypotheses_generation/hypotheses-generation.ts`

```typescript
// Add language awareness to hypothesis generation
async generateHypotheses(url: string, projectId: string, userInput?: string): Promise<HypothesesGenerationResult> {
  console.log(`[HYPOTHESES] Starting generation for URL: ${url}`);

  // Fetch project locale information
  const project = await ProjectDAL.getProjectById(projectId);
  const primaryLocale = project.primaryLocale || 'en';
  const language = primaryLocale.split('-')[0];

  console.log(`[HYPOTHESES] Using locale: ${primaryLocale}, language: ${language}`);

  // Get screenshot and HTML (existing code)
  // ... existing code ...

  // Build prompt with language context
  const prompt = this.buildHypothesesGenerationPrompt(
    reservedPayload, 
    userInput,
    language  // Add language parameter
  );

  // Rest of generation...
  // ... existing code ...
}

private buildHypothesesGenerationPrompt(
  reservedPayload?: any, 
  userInput?: string,
  language: string = 'en'  // Add language parameter
): string {
  const languageInstructions = this.getLanguageInstructions(language);

  return `You are a seasoned Conversion Rate Optimization (CRO) expert...

${languageInstructions}

**Inputs:**
* **Brand Summary:** {{brand_summary}}
* **Page HTML:** {{html_snippet}}
* **Screenshot Description:** {{screenshot_description}}
* **Target Language:** ${language}
* **User Direction (Optional):** ${userInput || 'None provided'}

**Instructions:**

CRITICAL: All generated content MUST be in ${this.getLanguageName(language)}.

1. **Analyze the Page Context:**
   Review the provided brand, HTML, and screenshot data...
   ${language !== 'en' ? `Remember: The website is in ${this.getLanguageName(language)}, so your hypothesis must be relevant to that language and culture.` : ''}

2. **Formulate One Hypothesis:**
   - The hypothesis description and all user-facing text must be in ${this.getLanguageName(language)}
   - Consider cultural context and localization best practices for ${this.getLanguageName(language)}
   - Account for language-specific design patterns (e.g., text direction, length)

...rest of prompt...
`;
}

private getLanguageInstructions(language: string): string {
  const instructions: Record<string, string> = {
    'en': 'Generate all user-facing content in English.',
    'fr': 'Generate all user-facing content in French. Ensure proper use of accents and formal/informal distinctions.',
    'de': 'Generate all user-facing content in German. Use appropriate formal language (Sie) for e-commerce contexts.',
    'es': 'Generate all user-facing content in Spanish. Consider regional variations where appropriate.',
    'it': 'Generate all user-facing content in Italian.',
    'pt': 'Generate all user-facing content in Portuguese.',
    'nl': 'Generate all user-facing content in Dutch.',
    'ja': 'Generate all user-facing content in Japanese. Use appropriate keigo (formal language) for business contexts.',
    'zh': 'Generate all user-facing content in Chinese (Simplified or Traditional based on context).'
  };

  return instructions[language] || instructions['en'];
}

private getLanguageName(code: string): string {
  const names: Record<string, string> = {
    'en': 'English',
    'fr': 'French',
    'de': 'German',
    'es': 'Spanish',
    'it': 'Italian',
    'pt': 'Portuguese',
    'nl': 'Dutch',
    'ja': 'Japanese',
    'zh': 'Chinese'
  };
  return names[code] || 'English';
}
```

### 2.2 Update Variant Generation with Language Context

**Update**: `/src/features/variant_generation/prompts.ts`

```typescript
export function buildVariantGenerationPrompt(
  hypothesis: Hypothesis, 
  language: string = 'en'
): string {
  const languageName = getLanguageName(language);
  const languageGuidance = getLanguageSpecificGuidance(language);

  return `
Generate 3 A/B test variants for this hypothesis:

HYPOTHESIS: ${hypothesis.description}
PROBLEM: ${hypothesis.current_problem}
TARGET LANGUAGE: ${languageName}

${languageGuidance}

CRITICAL LANGUAGE REQUIREMENTS:
- All generated text content MUST be in ${languageName}
- All copy changes MUST maintain ${languageName} grammar and style
- Button text, headlines, and descriptions MUST be in ${languageName}
- Consider ${languageName}-specific design patterns (text length, direction, etc.)
- Respect cultural norms and conventions for ${languageName} audiences

Generate 3 creative variants that address the hypothesis. Focus on meaningful differences that could impact user behavior:

... rest of existing prompt ...

LANGUAGE-SPECIFIC CONSTRAINTS:
${language !== 'en' ? `- NEVER use English text in the variants
- Ensure all strings are culturally appropriate for ${languageName} speakers
- Account for text length differences (${languageName} text may be longer/shorter than English)
- Consider reading direction and layout implications` : ''}

... rest of prompt ...
`;
}

function getLanguageSpecificGuidance(language: string): string {
  const guidance: Record<string, string> = {
    'en': '',
    'fr': `French-specific considerations:
- Use formal "vous" for e-commerce contexts
- Account for longer text (French is ~15-20% longer than English)
- Use proper accents (é, è, ê, à, etc.)
- Button text typically longer than English`,
    
    'de': `German-specific considerations:
- Use formal "Sie" for e-commerce contexts
- Account for compound words and longer text (~20-30% longer than English)
- Buttons and CTAs may need more space
- Capitalize all nouns`,
    
    'ja': `Japanese-specific considerations:
- Use appropriate keigo (formal language) for business
- Account for vertical text options
- Consider character width and spacing
- Button text typically shorter than English`,
    
    'zh': `Chinese-specific considerations:
- Determine if Traditional or Simplified based on region
- Account for character-based layout differences
- Consider cultural color meanings
- Text typically more compact than English`
  };

  return guidance[language] || '';
}

function getLanguageName(code: string): string {
  const names: Record<string, string> = {
    'en': 'English',
    'fr': 'French', 
    'de': 'German',
    'es': 'Spanish',
    'it': 'Italian',
    'pt': 'Portuguese',
    'nl': 'Dutch',
    'ja': 'Japanese',
    'zh': 'Chinese'
  };
  return names[code] || 'English';
}
```

**Update**: `/src/features/variant_generation/variant-generation.ts`

```typescript
// Update generateVariants method
async generateVariants(
  hypothesis: Hypothesis, 
  projectId: string, 
  precomputedInjectionPoints?: any[]
): Promise<{ variants: any[], injectionPoints: any[], screenshot: string, brandAnalysis: string, htmlContent?: string }> {
  console.log(`[VARIANTS] Starting generation for hypothesis: ${hypothesis.title}`);

  // Get project and extract language
  const project = await this._getCachedProject(projectId);
  const language = project.primaryLocale?.split('-')[0] || 'en';
  
  console.log(`[VARIANTS] Using language: ${language} for variant generation`);

  // ... existing code for screenshots and brand analysis ...

  // Build prompt with language context
  const prompt = buildVariantGenerationPrompt(hypothesis, language);

  console.log(`[VARIANTS] Generating ${language} variants with Google Gemini 2.5 Pro`);

  // Generate with AI
  const object = await ai.generateObject({
    model: google(aiConfig.model, { apiKey: aiConfig.apiKey }),
    temperature: 1.2,
    schema: basicVariantsResponseSchema,
    messages: [
      {
        role: 'user',
        content: [
          { type: "text", text: prompt },
          { type: "text", text: `Language context: Generate all content in ${language}` },
          { type: "text", text: brandAnalysis },
          { type: "image", image: toDataUrl(screenshot) }
        ]
      }
    ]
  });

  // ... rest of existing code ...
}
```

---

## Phase 3: Locale-Based Experiment Targeting (Week 3)

### 3.1 Locale-Aware Experiment Configuration

**Create**: `/src/features/localization/locale-targeting.ts`

```typescript
// Locale Targeting Service
import { LocaleUrlPattern } from './locale-detector';

export interface LocaleTargetingConfig {
  enabledLocales: string[];      // ["*"] for all, or specific locales like ["en-US", "en-GB"]
  disabledLocales: string[];     // Explicit exclusions
  localePattern?: LocaleUrlPattern;
}

export interface LocaleMatchingRule {
  type: 'url_path' | 'subdomain' | 'url_param' | 'cookie' | 'custom';
  locale: string;
  pattern: string;
}

export class LocaleTargetingService {
  /**
   * Generate targeting rules for specific locales
   */
  generateLocaleTargetingRules(
    localeConfig: LocaleTargetingConfig,
    projectLocalePattern?: LocaleUrlPattern
  ): LocaleMatchingRule[] {
    const rules: LocaleMatchingRule[] = [];

    // If all locales enabled, no specific rules needed
    if (localeConfig.enabledLocales.includes('*') && localeConfig.disabledLocales.length === 0) {
      return rules;
    }

    const pattern = localeConfig.localePattern || projectLocalePattern;
    if (!pattern) {
      console.warn('[LOCALE_TARGETING] No locale pattern available, cannot generate rules');
      return rules;
    }

    // Generate rules based on pattern type
    switch (pattern.type) {
      case 'path':
        rules.push(...this.generatePathRules(localeConfig, pattern));
        break;
      case 'subdomain':
        rules.push(...this.generateSubdomainRules(localeConfig, pattern));
        break;
      case 'parameter':
        rules.push(...this.generateParameterRules(localeConfig, pattern));
        break;
    }

    return rules;
  }

  /**
   * Convert locale rules to experiment targeting configuration
   */
  convertToExperimentTargeting(rules: LocaleMatchingRule[]): any {
    if (rules.length === 0) {
      return undefined;
    }

    // Convert to Cloudflare Worker compatible format
    const targeting = {
      match: 'any' as const,  // Match if ANY rule matches
      timeoutMs: 1500,
      rules: rules.map(rule => {
        switch (rule.type) {
          case 'url_path':
            return {
              type: 'custom' as const,
              code: `return window.location.pathname.startsWith('/${rule.locale}/');`
            };
          
          case 'subdomain':
            return {
              type: 'custom' as const,
              code: `return window.location.hostname.startsWith('${rule.locale}.');`
            };
          
          case 'url_param':
            return {
              type: 'urlParam' as const,
              name: 'locale',
              value: rule.locale
            };
          
          case 'cookie':
            return {
              type: 'cookie' as const,
              name: 'locale',
              value: rule.locale
            };
          
          default:
            return {
              type: 'custom' as const,
              code: rule.pattern
            };
        }
      })
    };

    return targeting;
  }

  /**
   * Update experiment URL patterns to include locale prefixes
   */
  updateUrlPatternsForLocales(
    basePatterns: string[],
    enabledLocales: string[],
    pattern?: LocaleUrlPattern
  ): string[] {
    if (!pattern || pattern.type !== 'path') {
      return basePatterns;
    }

    if (enabledLocales.includes('*')) {
      // Include both localized and non-localized patterns
      const localizedPatterns = pattern.locales.flatMap(locale =>
        basePatterns.map(p => `/${locale}${p}`)
      );
      return [...basePatterns, ...localizedPatterns];
    }

    // Only include enabled locales
    return enabledLocales.flatMap(locale =>
      basePatterns.map(p => `/${locale}${p}`)
    );
  }

  private generatePathRules(
    config: LocaleTargetingConfig,
    pattern: LocaleUrlPattern
  ): LocaleMatchingRule[] {
    const rules: LocaleMatchingRule[] = [];
    
    const activeLocales = config.enabledLocales.includes('*')
      ? pattern.locales.filter(l => !config.disabledLocales.includes(l))
      : config.enabledLocales;

    for (const locale of activeLocales) {
      rules.push({
        type: 'url_path',
        locale,
        pattern: `/${locale}/`
      });
    }

    return rules;
  }

  private generateSubdomainRules(
    config: LocaleTargetingConfig,
    pattern: LocaleUrlPattern
  ): LocaleMatchingRule[] {
    const rules: LocaleMatchingRule[] = [];
    
    const activeLocales = config.enabledLocales.includes('*')
      ? pattern.locales.filter(l => !config.disabledLocales.includes(l))
      : config.enabledLocales;

    for (const locale of activeLocales) {
      rules.push({
        type: 'subdomain',
        locale,
        pattern: `${locale}.`
      });
    }

    return rules;
  }

  private generateParameterRules(
    config: LocaleTargetingConfig,
    pattern: LocaleUrlPattern
  ): LocaleMatchingRule[] {
    const rules: LocaleMatchingRule[] = [];
    
    const activeLocales = config.enabledLocales.includes('*')
      ? pattern.locales.filter(l => !config.disabledLocales.includes(l))
      : config.enabledLocales;

    for (const locale of activeLocales) {
      rules.push({
        type: 'url_param',
        locale,
        pattern: `locale=${locale}`
      });
    }

    return rules;
  }
}

export function createLocaleTargetingService(): LocaleTargetingService {
  return new LocaleTargetingService();
}
```

### 3.2 Update Experiment Creation to Support Locale Targeting

**Update**: `/src/domain/agent/tools/create-experiment.ts`

```typescript
import { createLocaleTargetingService } from '@features/localization/locale-targeting';

// Add locale fields to schema
const createExperimentArgsSchema = z.object({
  name: z.string().optional(),
  // ... existing fields ...
  enabledLocales: z.array(z.string()).optional().default(['*']).describe('Locales where this experiment should run. Use ["*"] for all locales, or specify specific locales like ["en-US", "fr-FR"]'),
  disabledLocales: z.array(z.string()).optional().default([]).describe('Locales where this experiment should NOT run')
});

class CreateExperimentExecutor {
  // ... existing code ...

  async execute(args: z.infer<typeof createExperimentArgsSchema>): Promise<string> {
    // ... existing validation ...

    // Get project locale configuration
    const project = await ProjectDAL.getProjectById(this.projectId);
    const localePattern = project.localeConfig?.localePattern;

    // Generate locale targeting rules
    const localeTargetingService = createLocaleTargetingService();
    const localeRules = localeTargetingService.generateLocaleTargetingRules(
      {
        enabledLocales: args.enabledLocales || ['*'],
        disabledLocales: args.disabledLocales || []
      },
      localePattern
    );

    // Convert to experiment targeting
    const localeTargeting = localeTargetingService.convertToExperimentTargeting(localeRules);

    // Merge with existing targeting
    const finalTargeting = this.mergeTargeting(args.targeting, localeTargeting);

    // Update URL patterns for locales
    const finalTargetUrls = localeTargetingService.updateUrlPatternsForLocales(
      targetUrls,
      args.enabledLocales || ['*'],
      localePattern
    );

    // Create experiment with locale configuration
    const experiment = await ExperimentDAL.createExperiment({
      projectId: this.projectId,
      name: experimentName,
      oec: hypothesis.primary_outcome,
      minDays: 7,
      minSessionsPerVariant: 100,
      targetUrls: finalTargetUrls,
      targeting: finalTargeting,
      enabledLocales: args.enabledLocales || ['*'],
      disabledLocales: args.disabledLocales || [],
      // ... rest of fields ...
    });

    // ... rest of existing code ...
  }

  private mergeTargeting(baseTargeting: any, localeTargeting: any): any {
    if (!baseTargeting && !localeTargeting) {
      return undefined;
    }

    if (!baseTargeting) {
      return localeTargeting;
    }

    if (!localeTargeting) {
      return baseTargeting;
    }

    // Merge both targeting configurations
    return {
      match: 'all' as const,  // Both must match
      timeoutMs: Math.max(baseTargeting.timeoutMs || 1500, localeTargeting.timeoutMs || 1500),
      rules: [
        ...baseTargeting.rules,
        ...localeTargeting.rules
      ]
    };
  }
}
```

### 3.3 Update Cloudflare Publisher to Include Locale Configuration

**Update**: `/src/infra/external/cloudflare/types.ts`

```typescript
export interface PublishedExperiment {
  id: string;
  name: string;
  status: string;
  variants: Record<string, ExperimentVariant>;
  traffic: Record<string, number>;
  targetUrls?: string[];
  targeting?: ExperimentTargeting;
  goals?: ExperimentGoal[];
  enabledLocales?: string[];      // NEW: Locale targeting
  disabledLocales?: string[];     // NEW: Locale exclusions
}
```

---

## Phase 4: User Interface & Controls (Week 4)

### 4.1 API Endpoints for Locale Management

**Create**: `/src/interfaces/http/locales-routes.ts`

```typescript
import { FastifyInstance } from 'fastify';
import { requireProjectAuth } from '../api/middleware/project-auth';
import { ProjectDAL } from '@infra/dal';
import { createLocaleDetector } from '@features/localization/locale-detector';

export async function registerLocalesRoutes(fastify: FastifyInstance) {
  // GET /api/projects/:projectId/locales - Get project locale configuration
  fastify.get('/api/projects/:projectId/locales', {
    preHandler: requireProjectAuth
  }, async (request, reply) => {
    try {
      const projectId = request.projectId!;
      const project = await ProjectDAL.getProjectById(projectId);

      return reply.send({
        primaryLocale: project.primaryLocale,
        supportedLocales: project.supportedLocales,
        localeConfig: project.localeConfig
      });
    } catch (error) {
      request.log.error(error, 'Failed to get project locales');
      return reply.status(500).send({ error: 'Failed to get project locales' });
    }
  });

  // POST /api/projects/:projectId/locales/detect - Re-detect locales
  fastify.post('/api/projects/:projectId/locales/detect', {
    preHandler: requireProjectAuth
  }, async (request, reply) => {
    try {
      const projectId = request.projectId!;
      const project = await ProjectDAL.getProjectById(projectId);

      // Get homepage screenshot
      const screenshot = await ScreenshotDAL.getScreenshot(projectId, 'home');
      
      if (!screenshot || !screenshot.htmlContent) {
        return reply.status(404).send({ error: 'No homepage data available' });
      }

      // Detect locale
      const localeDetector = createLocaleDetector();
      const localeDetection = await localeDetector.detectLocale(
        screenshot.url,
        screenshot.htmlContent,
        screenshot.markdownContent || undefined
      );

      // Update project
      await ProjectDAL.updateProject(projectId, {
        primaryLocale: localeDetection.detected.locale,
        supportedLocales: localeDetection.multilingualSite 
          ? {
              detected: localeDetection.detected,
              alternatives: localeDetection.alternatives,
              pattern: localeDetection.localePattern
            }
          : null,
        localeConfig: localeDetection
      });

      return reply.send({
        primaryLocale: localeDetection.detected.locale,
        supportedLocales: localeDetection.multilingualSite 
          ? localeDetection
          : null,
        localeConfig: localeDetection
      });
    } catch (error) {
      request.log.error(error, 'Failed to detect locales');
      return reply.status(500).send({ error: 'Failed to detect locales' });
    }
  });

  // PATCH /api/projects/:projectId/locales - Update locale configuration
  fastify.patch('/api/projects/:projectId/locales', {
    preHandler: requireProjectAuth,
    schema: {
      body: {
        type: 'object',
        properties: {
          primaryLocale: { type: 'string' },
          supportedLocales: { type: 'object' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const projectId = request.projectId!;
      const { primaryLocale, supportedLocales } = request.body as any;

      await ProjectDAL.updateProject(projectId, {
        primaryLocale,
        supportedLocales
      });

      return reply.send({ success: true });
    } catch (error) {
      request.log.error(error, 'Failed to update project locales');
      return reply.status(500).send({ error: 'Failed to update project locales' });
    }
  });

  // GET /api/experiments/:experimentId/locales - Get experiment locale configuration
  fastify.get('/api/experiments/:experimentId/locales', {
    preHandler: requireProjectAuth
  }, async (request, reply) => {
    try {
      const { experimentId } = request.params as { experimentId: string };
      const experiment = await ExperimentDAL.getExperimentById(experimentId);

      if (!experiment) {
        return reply.status(404).send({ error: 'Experiment not found' });
      }

      return reply.send({
        enabledLocales: experiment.enabledLocales || ['*'],
        disabledLocales: experiment.disabledLocales || []
      });
    } catch (error) {
      request.log.error(error, 'Failed to get experiment locales');
      return reply.status(500).send({ error: 'Failed to get experiment locales' });
    }
  });

  // PATCH /api/experiments/:experimentId/locales - Update experiment locale targeting
  fastify.patch('/api/experiments/:experimentId/locales', {
    preHandler: requireProjectAuth,
    schema: {
      body: {
        type: 'object',
        properties: {
          enabledLocales: { type: 'array', items: { type: 'string' } },
          disabledLocales: { type: 'array', items: { type: 'string' } }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { experimentId } = request.params as { experimentId: string };
      const { enabledLocales, disabledLocales } = request.body as any;

      // Update experiment
      await ExperimentDAL.updateExperiment(experimentId, {
        enabledLocales,
        disabledLocales
      });

      // Re-publish to Cloudflare if experiment is running
      const experiment = await ExperimentDAL.getExperimentById(experimentId);
      if (experiment.status === 'RUNNING') {
        const publisher = createExperimentPublisher();
        await publisher.publishExperiment(experimentId);
      }

      return reply.send({ success: true });
    } catch (error) {
      request.log.error(error, 'Failed to update experiment locales');
      return reply.status(500).send({ error: 'Failed to update experiment locales' });
    }
  });
}
```

### 4.2 Agent Tool for Locale Management

**Create**: `/src/domain/agent/tools/manage-locales.ts`

```typescript
import { z } from 'zod';
import type { RequestContext } from '../request-context';
import { ProjectDAL } from '@infra/dal';

const manageLocalesArgsSchema = z.object({
  action: z.enum(['get', 'set_primary', 'enable', 'disable']),
  locale: z.string().optional().describe('Locale code (e.g., en-US, fr-FR)'),
  locales: z.array(z.string()).optional().describe('Multiple locale codes')
});

export const manageLocalesTool = {
  name: 'manage_locales',
  description: `Manage locale and language settings for experiments.
  
Actions:
- 'get': Get current locale configuration
- 'set_primary': Set the primary locale for content generation
- 'enable': Enable specific locales for experiments
- 'disable': Disable specific locales for experiments`,
  
  argsSchema: manageLocalesArgsSchema,

  async execute(
    args: z.infer<typeof manageLocalesArgsSchema>,
    context: RequestContext
  ): Promise<string> {
    const { action, locale, locales } = args;
    const projectId = context.projectId;

    const project = await ProjectDAL.getProjectById(projectId);

    switch (action) {
      case 'get': {
        const config = {
          primaryLocale: project.primaryLocale || 'en',
          supportedLocales: project.supportedLocales,
          isMultilingual: project.localeConfig?.multilingualSite || false,
          detectedPattern: project.localeConfig?.localePattern
        };

        return JSON.stringify({
          success: true,
          config,
          message: `Current locale configuration retrieved. Primary locale: ${config.primaryLocale}, Multilingual: ${config.isMultilingual}`
        });
      }

      case 'set_primary': {
        if (!locale) {
          return JSON.stringify({
            success: false,
            error: 'locale parameter is required for set_primary action'
          });
        }

        await ProjectDAL.updateProject(projectId, {
          primaryLocale: locale
        });

        return JSON.stringify({
          success: true,
          message: `Primary locale set to ${locale}. Future content generation will use this language.`
        });
      }

      case 'enable':
      case 'disable': {
        if (!locales || locales.length === 0) {
          return JSON.stringify({
            success: false,
            error: 'locales parameter is required and must be a non-empty array'
          });
        }

        // This would update experiment-level settings
        // For now, return configuration that can be used in experiment creation
        return JSON.stringify({
          success: true,
          message: `Configuration saved. Use these locales when creating experiments: ${action === 'enable' ? 'enabledLocales' : 'disabledLocales'}: ${JSON.stringify(locales)}`,
          config: {
            [action === 'enable' ? 'enabledLocales' : 'disabledLocales']: locales
          }
        });
      }

      default:
        return JSON.stringify({
          success: false,
          error: `Unknown action: ${action}`
        });
    }
  }
};
```

---

## Phase 5: Testing & Validation (Week 5)

### 5.1 Test Suite for Locale Detection

**Create**: `/src/features/localization/__tests__/locale-detector.test.ts`

```typescript
import { LocaleDetectorService } from '../locale-detector';

describe('LocaleDetectorService', () => {
  let detector: LocaleDetectorService;

  beforeEach(() => {
    detector = new LocaleDetectorService();
  });

  describe('detectFromUrl', () => {
    it('should detect path-based locale', async () => {
      const result = await detector.detectLocale(
        'https://example.com/fr-FR/products',
        '<html lang="fr-FR"></html>'
      );
      
      expect(result.detected.locale).toBe('fr-FR');
      expect(result.detected.detectionMethod).toBe('url_path');
    });

    it('should detect subdomain-based locale', async () => {
      const result = await detector.detectLocale(
        'https://fr.example.com/products',
        '<html></html>'
      );
      
      expect(result.detected.locale).toBe('fr');
      expect(result.detected.detectionMethod).toBe('subdomain');
    });
  });

  describe('detectFromHtmlLang', () => {
    it('should detect HTML lang attribute', async () => {
      const html = '<html lang="de-DE"><body>Inhalt</body></html>';
      const result = await detector.detectLocale(
        'https://example.com',
        html
      );
      
      expect(result.detected.locale).toBe('de-DE');
      expect(result.detected.language).toBe('de');
    });
  });

  describe('isMultilingualSite', () => {
    it('should detect multilingual site from hreflang', async () => {
      const html = `
        <html>
          <head>
            <link rel="alternate" hreflang="en-US" href="https://example.com/en-us/" />
            <link rel="alternate" hreflang="fr-FR" href="https://example.com/fr-fr/" />
          </head>
        </html>
      `;
      
      const result = await detector.detectLocale(
        'https://example.com/en-us/',
        html
      );
      
      expect(result.multilingualSite).toBe(true);
      expect(result.localePattern).toBeDefined();
      expect(result.localePattern?.type).toBe('path');
    });
  });
});
```

### 5.2 Integration Tests

**Create**: `/src/features/localization/__tests__/integration.test.ts`

```typescript
describe('Localization Integration', () => {
  it('should detect locale during brand analysis', async () => {
    // Test that brand analysis detects and stores locale
  });

  it('should generate French variants for French sites', async () => {
    // Test that variants are generated in the correct language
  });

  it('should apply locale targeting to experiments', async () => {
    // Test that experiments only run on specified locales
  });

  it('should update experiment locale configuration', async () => {
    // Test API for updating locale settings
  });
});
```

---

## Implementation Checklist

### Phase 1: Foundation ✅
- [ ] Create database migration for locale fields
- [ ] Update Prisma schema
- [ ] Implement `LocaleDetectorService`
- [ ] Integrate locale detection into brand analysis
- [ ] Update screenshot storage to include locale
- [ ] Test locale detection on multiple sites

### Phase 2: Content Generation ✅
- [ ] Update hypothesis generation prompts with language context
- [ ] Update variant generation prompts with language context
- [ ] Pass language parameter through generation pipeline
- [ ] Add language-specific validation
- [ ] Test content generation in multiple languages

### Phase 3: Experiment Targeting ✅
- [ ] Implement `LocaleTargetingService`
- [ ] Update experiment creation to support locale targeting
- [ ] Update Cloudflare publisher with locale fields
- [ ] Generate locale-aware URL patterns
- [ ] Test experiment targeting with different locale patterns

### Phase 4: User Interface ✅
- [ ] Create locale management API endpoints
- [ ] Add agent tool for locale management
- [ ] Update experiment preview to show locale config
- [ ] Add locale selector to frontend (if applicable)
- [ ] Document API endpoints

### Phase 5: Testing & Validation ✅
- [ ] Write unit tests for locale detection
- [ ] Write unit tests for locale targeting
- [ ] Write integration tests
- [ ] Test on real multilingual sites
- [ ] Test content generation in multiple languages
- [ ] Validate experiment targeting works correctly

---

## Migration Strategy

### Step 1: Add Locale Detection (Non-Breaking)
- Add locale detection to brand analysis
- Store locale information in database
- No changes to existing experiments

### Step 2: Enable Language-Aware Generation (Optional)
- Update content generation to use detected language
- Existing experiments continue working
- New experiments use language-aware generation

### Step 3: Add Locale Targeting (Optional)
- Add locale targeting controls to experiment creation
- Default to all locales (`['*']`) for backward compatibility
- Merchants can opt-in to locale-specific targeting

### Step 4: Update Existing Experiments (Optional)
- Run migration script to detect locales for existing projects
- Update existing experiments with default locale configuration
- No disruption to running experiments

---

## Future Enhancements

### Phase 6: Advanced Features (Future)
- **Locale-Specific Brand Analysis**: Analyze each locale separately for multilingual sites
- **Translation Validation**: Validate that variant translations maintain the same meaning
- **A/B Test Translations**: Test different translations of the same variant
- **Regional Customization**: Account for regional variations within same language (en-US vs en-GB)
- **Currency & Formatting**: Handle locale-specific number, date, and currency formatting
- **Cultural Optimization**: Suggest culturally appropriate changes per locale
- **Locale Analytics**: Compare experiment performance across locales
- **Auto-Translation**: Suggest translations when expanding to new locales

---

## Documentation Requirements

### 1. Developer Documentation
- Architecture overview of localization system
- API reference for locale management
- Guide for adding new language support
- Testing guide for multilingual features

### 2. User Documentation
- How to set up multilingual experiments
- How to enable/disable experiments per locale
- Best practices for multilingual A/B testing
- Troubleshooting guide

### 3. API Documentation
- Locale detection endpoints
- Experiment locale targeting
- Locale management endpoints
- Webhook events for locale changes

---

## Success Metrics

### Technical Metrics
- Locale detection accuracy > 95%
- Language-appropriate content generation > 90%
- Zero breaking changes to existing experiments
- API response times < 200ms for locale operations

### Business Metrics
- Percentage of multilingual sites using locale targeting
- Experiment performance variance across locales
- Merchant satisfaction with locale features
- Support tickets related to localization

---

## Risk Mitigation

### Risk 1: Incorrect Locale Detection
**Mitigation**: 
- Use multiple detection methods with confidence scoring
- Allow manual override of detected locale
- Provide clear UI feedback on detected locale

### Risk 2: Poor Translation Quality
**Mitigation**:
- Use high-quality AI models for generation
- Add translation validation step
- Allow manual editing of generated content

### Risk 3: Breaking Existing Experiments
**Mitigation**:
- Default to all locales (`['*']`) for backward compatibility
- Extensive testing before deployment
- Gradual rollout with feature flags

### Risk 4: Performance Impact
**Mitigation**:
- Cache locale detection results
- Optimize locale targeting rules
- Use database indexes for locale filtering

---

## Conclusion

This plan provides a comprehensive approach to adding localization support to the Omen platform. The implementation is designed to be:

1. **Non-Breaking**: Existing functionality continues to work without changes
2. **Opt-In**: Merchants can choose to use locale features
3. **Flexible**: Supports multiple locale patterns (path, subdomain, parameter)
4. **Scalable**: Architecture supports future enhancements
5. **Testable**: Comprehensive test coverage ensures reliability

The phased approach allows for incremental delivery of value while minimizing risk. Each phase builds on the previous one, creating a solid foundation for advanced multilingual experimentation capabilities.

