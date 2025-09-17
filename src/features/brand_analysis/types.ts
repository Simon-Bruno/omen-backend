// Brand Analysis Types
export interface BrandAnalysisRequest {
  pages: {
    html: string[];
    screenshot: string[];
    urls: string[];
  };
  shopDomain: string;
}

// Legacy response type for backward compatibility
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

// New detailed response type - simple combination of analyzer results
export interface DetailedBrandAnalysisResponse {
  screenshot: {
    visualStyle: {
      overallAesthetic: string;
      colorPalette: string[];
      typography: string;
      imagery: string;
    };
    brandElements: {
      logo: string;
      keyComponents: string[];
      layout: string;
    };
    brandPersonality: {
      adjectives: string[];
      targetAudience: string;
    };
  };
  language: {
    voice: {
      tones: string[];
      keyPhrases: string[];
    };
    brandPersonality: {
      adjectives: string[];
      values: string[];
      targetAudience: string;
    };
    valueProposition: {
      primaryMessage: string;
      supportingBenefits: string[];
      differentiators: string[];
      proofElements: string[];
    };
    messaging: {
      headlines: string[];
      ctas: string[];
      contentThemes: string[];
      trustSignals: string[];
    };
  };
  // code: {
  //   websiteStructure: {
  //     informationArchitecture: string;
  //     contentDepth: string;
  //     navigationPattern: string;
  //   };
  //   designTokens: {
  //     colors: string[];
  //     fonts: string[];
  //     margins: string[];
  //   };
  // };
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
