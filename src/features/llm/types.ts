// LLM Service Types
export interface LLMService {
  analyzeBrand(request: BrandAnalysisRequest): Promise<BrandAnalysisResponse>;
  generateText(prompt: string, options?: LLMOptions): Promise<string>;
  extractNavLinks(request: ExtractNavLinksRequest): Promise<ExtractNavLinksResponse>;
}

export interface LLMResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

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

export interface LLMOptions {
  temperature?: number;
  maxTokens?: number;
  model?: string;
}

export interface LLMConfig {
  apiKey: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ExtractNavLinksRequest {
  foundUrls: string[];
}

export interface ExtractNavLinksResponse {
  home?: string;
  products?: string;
  about?: string;
}

