// Brand Analysis Types
export interface BrandAnalysisRequest {
  pages: {
    html: string[];
    screenshot: string[];
    urls: string[];
  };
  shopDomain: string;
}

export interface BrandAnalysisResponse {
  colors: string[]; // ≤6 colors
  fonts: string[]; // ≤2 fonts
  components: string[]; // presence tags like Hero/CTA/Trust/Reviews
  voice?: {
    tone: string;
    personality: string;
    keyPhrases: string[];
  };
  designSystem: {
    layout: string;
    spacing: string;
    typography: string;
    colorScheme: string;
  };
  brandPersonality: {
    adjectives: string[];
    values: string[];
    targetAudience: string;
  };
  recommendations: {
    strengths: string[];
    opportunities: string[];
  };
}

export interface BrandAnalysisResult {
  success: boolean;
  brandSummary?: BrandAnalysisResponse;
  pages?: Array<{
    url: string;
    screenshotUrl: string;
    title?: string;
    description?: string;
  }>;
  error?: string;
}
