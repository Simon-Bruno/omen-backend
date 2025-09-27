// Service Container for Dependency Injection
import { createPlaywrightCrawler, type CrawlerService } from '@features/crawler';
import { createAgentService, type AgentService, ECOMMERCE_AGENT_SYSTEM_PROMPT } from '@domain/agent';
import { createBrandAnalysisService, type BrandAnalysisService } from '@features/brand_analysis';
import { createHypothesesGenerationService, HypothesesGenerationService } from '@features/hypotheses_generation/hypotheses-generation';
import { createScreenshotStorageService, type ScreenshotStorageService } from '@services/screenshot-storage';
import { getServiceConfig } from '@infra/config/services';

class ServiceContainer {
  private services: Map<string, unknown> = new Map();
  private config = getServiceConfig();


  getCrawlerService(): CrawlerService {
    if (!this.services.has('crawler')) {
      const crawlerService = createPlaywrightCrawler(this.config.crawler);
      this.services.set('crawler', crawlerService);
    }
    return this.services.get('crawler') as CrawlerService;
  }

  getBrandAnalysisService(): BrandAnalysisService {
    if (!this.services.has('brandAnalysis')) {
      const crawler = this.getCrawlerService();
      const brandAnalysisService = createBrandAnalysisService(crawler);
      this.services.set('brandAnalysis', brandAnalysisService);
    }
    return this.services.get('brandAnalysis') as BrandAnalysisService;
  }


  getAgentService(): AgentService {
    if (!this.services.has('agent')) {
      const agentService = createAgentService({
        systemPrompt: ECOMMERCE_AGENT_SYSTEM_PROMPT,
        maxContextMessages: 20,
        enableToolCalls: true,
        enableWelcomeFlow: true,
      });
      this.services.set('agent', agentService);
    }
    return this.services.get('agent') as AgentService;
  }

  getHypothesisGenerator(): HypothesesGenerationService {
    if (!this.services.has('hypothesesGeneration')) {
      const crawler = this.getCrawlerService();
      const hypothesesGenerator = createHypothesesGenerationService(crawler);
      this.services.set('hypothesesGeneration', hypothesesGenerator);
    }
    return this.services.get('hypothesesGeneration') as HypothesesGenerationService;
  }

  getScreenshotStorageService(): ScreenshotStorageService {
    if (!this.services.has('screenshotStorage')) {
      const screenshotStorageService = createScreenshotStorageService();
      this.services.set('screenshotStorage', screenshotStorageService);
    }
    return this.services.get('screenshotStorage') as ScreenshotStorageService;
  }


  async cleanup(): Promise<void> {
    // Cleanup any services that need it
    const crawler = this.services.get('crawler') as any;
    if (crawler && typeof crawler.close === 'function') {
      await crawler.close();
    }
    this.services.clear();
  }
}

// Singleton instance
export const serviceContainer = new ServiceContainer();
