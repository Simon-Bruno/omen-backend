// Service Container for Dependency Injection
import { createPlaywrightCrawler, type CrawlerService } from '@features/crawler';
import { createAgentService, type AgentService } from '@domain/agent';
import { ECOMMERCE_AGENT_SYSTEM_PROMPT } from '@domain/agent/prompts';
// Brand analysis is now function-based, no service needed
import { createHypothesesGenerationService, HypothesesGenerationService } from '@features/hypotheses_generation/hypotheses-generation';
import { createScreenshotStorageService, type ScreenshotStorageService } from '@services/screenshot-storage';
import { createScreenshotAnalyticsService, type ScreenshotAnalyticsService } from '@services/screenshot-analytics';
import { createJobCleanupService, type JobCleanupService } from '@services/job-cleanup';
import { createAnalyticsService, createSQSConsumerService, type AnalyticsService, type SQSConsumerService } from '@services/analytics';
import { PrismaAnalyticsRepository } from '@infra/dal/analytics';
import { SupabaseAnalyticsRepository } from '@infra/dal/supabase-analytics';
import { getServiceConfig } from '@infra/config/services';
import { prisma } from '@infra/prisma';
import { createSignalGenerationOrchestrator, type SignalGenerationOrchestrator } from '@features/signal_generation';

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

  // Brand analysis is now function-based, no service needed


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
      const hypothesesGenerator = createHypothesesGenerationService(crawler, prisma);
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

  getJobCleanupService(): JobCleanupService {
    if (!this.services.has('jobCleanup')) {
      const jobCleanupService = createJobCleanupService();
      this.services.set('jobCleanup', jobCleanupService);
    }
    return this.services.get('jobCleanup') as JobCleanupService;
  }

  getScreenshotAnalyticsService(): ScreenshotAnalyticsService {
    if (!this.services.has('screenshotAnalytics')) {
      const screenshotAnalyticsService = createScreenshotAnalyticsService();
      this.services.set('screenshotAnalytics', screenshotAnalyticsService);
    }
    return this.services.get('screenshotAnalytics') as ScreenshotAnalyticsService;
  }

  getAnalyticsService(): AnalyticsService {
    if (!this.services.has('analytics')) {
      const useSupabase = process.env.USE_SUPABASE_ANALYTICS?.replace(/['"]/g, '') === 'true';
      
      console.log(`[CONTAINER] USE_SUPABASE_ANALYTICS env var: "${process.env.USE_SUPABASE_ANALYTICS}"`);
      console.log(`[CONTAINER] useSupabase boolean: ${useSupabase}`);
      
      if (useSupabase) {
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        
        console.log(`[CONTAINER] Raw SUPABASE_URL: "${supabaseUrl}"`);
        console.log(`[CONTAINER] Raw SUPABASE_SERVICE_ROLE_KEY: "${supabaseKey ? '[PRESENT]' : '[MISSING]'}"`);
        console.log(`[CONTAINER] Supabase config - URL: ${supabaseUrl ? '[PRESENT]' : '[MISSING]'}, Key: ${supabaseKey ? '[PRESENT]' : '[MISSING]'}`);
        
        if (!supabaseUrl || !supabaseKey) {
          console.error('[CONTAINER] Missing Supabase configuration. Falling back to Prisma.');
          const repository = new PrismaAnalyticsRepository(prisma);
          const analyticsService = createAnalyticsService(repository);
          this.services.set('analytics', analyticsService);
          return analyticsService;
        }
      }
      
      const repository = useSupabase
        ? new SupabaseAnalyticsRepository(
            process.env.SUPABASE_URL || '',
            process.env.SUPABASE_SERVICE_ROLE_KEY || ''
          )
        : new PrismaAnalyticsRepository(prisma);
      
      console.log(`[CONTAINER] Using ${useSupabase ? 'Supabase' : 'Prisma'} analytics repository`);
      
      const analyticsService = createAnalyticsService(repository);
      this.services.set('analytics', analyticsService);
    }
    return this.services.get('analytics') as AnalyticsService;
  }

  getSQSConsumerService(): SQSConsumerService {
    if (!this.services.has('sqsConsumer')) {
      const analyticsService = this.getAnalyticsService();
      const sqsConsumerService = createSQSConsumerService(this.config.sqs, analyticsService);
      this.services.set('sqsConsumer', sqsConsumerService);
    }
    return this.services.get('sqsConsumer') as SQSConsumerService;
  }

  getSignalGenerationOrchestrator(): SignalGenerationOrchestrator {
    if (!this.services.has('signalGeneration')) {
      // Get the analytics repository from the analytics service
      const analyticsService = this.getAnalyticsService();
      const repository = (analyticsService as any).repository; // Access the repository from the service
      
      const signalOrchestrator = createSignalGenerationOrchestrator(repository);
      this.services.set('signalGeneration', signalOrchestrator);
    }
    return this.services.get('signalGeneration') as SignalGenerationOrchestrator;
  }

  async cleanup(): Promise<void> {
    // Cleanup any services that need it
    const crawler = this.services.get('crawler') as any;
    if (crawler && typeof crawler.close === 'function') {
      await crawler.close();
    }

    // Close Prisma client singleton
    await prisma.$disconnect();

    this.services.clear();
  }
}

// Singleton instance
export const serviceContainer = new ServiceContainer();

// Convenience function to get the container
export function getContainer(): ServiceContainer {
  return serviceContainer;
}
