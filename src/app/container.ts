// Service Container for Dependency Injection
import { createPlaywrightCrawler, type CrawlerService } from '@features/crawler';
import { createDiagnosticsService, type DiagnosticsService } from '@domain/analytics/diagnostics';
import { createAgentService, type AgentService, type LLMProvider, ECOMMERCE_AGENT_SYSTEM_PROMPT } from '@domain/agent';
import { createOpenAIService, createOpenAIProvider, type LLMService } from '@features/llm';
import { createBrandAnalysisService, type BrandAnalysisService } from '@features/brand_analysis';
import { getServiceConfig } from '@infra/config/services';

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
      const crawler = this.getCrawlerService();
      const llm = this.getLLMService();
      const brandAnalysisService = createBrandAnalysisService(crawler, llm);
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

  getLLMProvider(): LLMProvider {
    if (!this.services.has('llmProvider')) {
      const llmProvider = createOpenAIProvider(this.config.openai);
      this.services.set('llmProvider', llmProvider);
    }
    return this.services.get('llmProvider');
  }

  getLLMConfig() {
    return this.config.openai;
  }

  getAgentService(): AgentService {
    if (!this.services.has('agent')) {
      const llmProvider = this.getLLMProvider();
      const agentService = createAgentService(llmProvider, {
        systemPrompt: ECOMMERCE_AGENT_SYSTEM_PROMPT,
        maxContextMessages: 20,
        enableToolCalls: true,
        enableWelcomeFlow: true,
      });
      this.services.set('agent', agentService);
    }
    return this.services.get('agent');
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
