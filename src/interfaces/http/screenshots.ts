// Screenshot serving routes
import type { FastifyInstance } from 'fastify/types/instance.js';
import { serviceContainer } from '@app/container';
import { promises as fs } from 'fs';

export async function screenshotRoutes(fastify: FastifyInstance) {
  // Serve screenshot files
  fastify.get('/screenshots/:filename', async (request, reply) => {
    try {
      const { filename } = request.params as { filename: string };
      
      // Validate filename to prevent directory traversal
      if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        return reply.code(400).send({ error: 'Invalid filename' });
      }

      const screenshotStorage = serviceContainer.getScreenshotStorageService();
      const filePath = await screenshotStorage.getScreenshotPath(filename);
      
      // Read the file
      const fileBuffer = await fs.readFile(filePath);
      
      // Set appropriate headers
      reply.type('image/png');
      reply.header('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
      
      // Send the file buffer
      return reply.send(fileBuffer);
    } catch (error) {
      console.error(`[SCREENSHOT_ROUTES] Error serving screenshot:`, error);
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
