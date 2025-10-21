import { serviceContainer } from '@app/container';

export class BackgroundServicesManager {
  private services: Map<string, any> = new Map();
  private isRunning = false;

  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('Background services are already running');
      return;
    }

    console.log('Starting background services...');

    try {
      // Only start SQS Consumer if using Prisma (not Supabase)
      const useSupabase = process.env.USE_SUPABASE_ANALYTICS?.replace(/['"]/g, '') === 'true';
      
      if (!useSupabase) {
        console.log('Starting SQS Consumer (Prisma mode)...');
        const sqsConsumer = serviceContainer.getSQSConsumerService();
        await sqsConsumer.start();
        this.services.set('sqsConsumer', sqsConsumer);
      } else {
        console.log('Skipping SQS Consumer (Supabase mode - events written directly from client)');
      }

      this.isRunning = true;
      console.log('Background services started successfully');
    } catch (error) {
      console.error('Failed to start background services:', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      console.log('Background services are not running');
      return;
    }

    console.log('Stopping background services...');

    try {
      // Stop all services
      for (const [name, service] of this.services.entries()) {
        if (service && typeof service.stop === 'function') {
          await service.stop();
          console.log(`Stopped ${name}`);
        }
      }

      this.services.clear();
      this.isRunning = false;
      console.log('Background services stopped successfully');
    } catch (error) {
      console.error('Failed to stop background services:', error);
      throw error;
    }
  }

  isServicesRunning(): boolean {
    return this.isRunning;
  }

  getService(name: string): any {
    return this.services.get(name);
  }
}

// Singleton instance
export const backgroundServicesManager = new BackgroundServicesManager();
