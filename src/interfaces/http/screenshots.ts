// Screenshot serving routes
import type { FastifyInstance } from 'fastify/types/instance.js';
import { serviceContainer } from '@app/container';

export async function screenshotRoutes(fastify: FastifyInstance) {
  // Serve database screenshots by ID
  fastify.get('/screenshots/db/:screenshotId', async (request, reply) => {
    try {
      const { screenshotId } = request.params as { screenshotId: string };
      
      // Validate screenshotId format (should be a cuid)
      if (!screenshotId || screenshotId.length < 20) {
        return reply.code(400).send({ error: 'Invalid screenshot ID' });
      }

      const screenshotStorage = serviceContainer.getScreenshotStorageService();
      const screenshot = await screenshotStorage.getScreenshotById(screenshotId);
      
      if (!screenshot) {
        return reply.code(404).send({ error: 'Screenshot not found' });
      }
      
      // Set appropriate headers
      reply.type(screenshot.contentType);
      reply.header('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
      
      // Send the screenshot data
      return reply.send(screenshot.data);
    } catch (error) {
      console.error(`[SCREENSHOT_ROUTES] Error serving database screenshot:`, error);
      return reply.code(404).send({ error: 'Screenshot not found' });
    }
  });

  // Health check for screenshots
  fastify.get('/screenshots/health', async (_request, reply) => {
    return reply.send({ 
      status: 'ok', 
      message: 'Screenshot service is running',
      timestamp: new Date().toISOString()
    });
  });
}
