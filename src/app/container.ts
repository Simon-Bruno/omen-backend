// Service Container for Dependency Injection
import { createPlaywrightCrawler, type CrawlerService } from '@features/crawler';
import { createDiagnosticsService, type DiagnosticsService } from '@domain/analytics/diagnostics';
import { createAgentService, type AgentService, ECOMMERCE_AGENT_SYSTEM_PROMPT } from '@domain/agent';
import { createBrandAnalysisService, type BrandAnalysisService } from '@features/brand_analysis';
import { createHypothesisGeneratorService, type HypothesisGeneratorService } from '@features/hypothesis_generation';
import { getServiceConfig } from '@infra/config/services';

class ServiceContainer {
  private services: Map<string, unknown> = new Map();
  private config = getServiceConfig();


  getCrawlerService(): CrawlerService {
    if (!this.services.has('crawler')) {
      const crawlerService = createPlaywrightCrawler(this.config.crawler);
      this.services.set('crawler', crawlerService);
    }
    return this.services.get('crawler');
  }

  getBrandAnalysisService(): BrandAnalysisService {
    if (!this.services.has('brandAnalysis')) {
      const crawler = this.getCrawlerService();
      const brandAnalysisService = createBrandAnalysisService(crawler);
      this.services.set('brandAnalysis', brandAnalysisService);
    }
    return this.services.get('brandAnalysis');
  }

  getDiagnosticsService(): DiagnosticsService {
    if (!this.services.has('diagnostics')) {
      const brandAnalysis = this.getBrandAnalysisService();
      const crawler = this.getCrawlerService();
      const diagnosticsService = createDiagnosticsService(brandAnalysis, crawler);
      this.services.set('diagnostics', diagnosticsService);
    }
    return this.services.get('diagnostics');
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
    return this.services.get('agent');
  }

  getHypothesisGenerator(): HypothesisGeneratorService {
    if (!this.services.has('hypothesisGenerator')) {
      const hypothesisGenerator = createHypothesisGeneratorService();
      this.services.set('hypothesisGenerator', hypothesisGenerator);
    }
    return this.services.get('hypothesisGenerator');
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
