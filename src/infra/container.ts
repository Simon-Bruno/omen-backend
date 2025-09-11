// Service Container for Dependency Injection
import { createOpenAIService, type LLMService } from '@features/llm';
import { createPlaywrightCrawler, type CrawlerService } from '@features/crawler';
import { createBrandAnalysisService, type BrandAnalysisService } from '@infra/services/brand-analysis';
import { createDiagnosticsService, type DiagnosticsService } from '@infra/services/diagnostics';
import { getServiceConfig } from './config/services';

class ServiceContainer {
  private services: Map<string, any> = new Map();
  private config = getServiceConfig();

  getLLMService(): LLMService {
    if (!this.services.has('llm')) {
      const llmService = createOpenAIService(this.config.openai);
      this.services.set('llm', llmService);
    }
    return this.services.get('llm');
  }

  getCrawlerService(): CrawlerService {
    if (!this.services.has('crawler')) {
      const crawlerService = createPlaywrightCrawler(this.config.crawler);
      this.services.set('crawler', crawlerService);
    }
    return this.services.get('crawler');
  }

  getBrandAnalysisService(): BrandAnalysisService {
    if (!this.services.has('brandAnalysis')) {
      const llm = this.getLLMService();
      const crawler = this.getCrawlerService();
      const brandAnalysisService = createBrandAnalysisService(crawler, llm);
      this.services.set('brandAnalysis', brandAnalysisService);
    }
    return this.services.get('brandAnalysis');
  }

  getDiagnosticsService(): DiagnosticsService {
    if (!this.services.has('diagnostics')) {
      const brandAnalysis = this.getBrandAnalysisService();
      const diagnosticsService = createDiagnosticsService(brandAnalysis);
      this.services.set('diagnostics', diagnosticsService);
    }
    return this.services.get('diagnostics');
  }

  async cleanup(): Promise<void> {
    // Cleanup any services that need it
    const crawler = this.services.get('crawler');
    if (crawler && typeof crawler.close === 'function') {
      await crawler.close();
    }
    this.services.clear();
  }
}

// Singleton instance
export const serviceContainer = new ServiceContainer();
