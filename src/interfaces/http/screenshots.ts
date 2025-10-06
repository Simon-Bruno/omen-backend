// Screenshot serving routes
import type { FastifyInstance } from 'fastify/types/instance.js';
import { serviceContainer } from '@app/container';
import { prisma } from '@infra/prisma';

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

  // List screenshots for a project
  fastify.get('/screenshots/project/:projectId', async (request, reply) => {
    try {
      const { projectId } = request.params as { projectId: string };

      const screenshots = await prisma.screenshot.findMany({
        where: { 
          projectId,
          expiresAt: { gt: new Date() } // Only non-expired screenshots
        },
        select: {
          id: true,
          pageType: true,
          url: true,
          createdAt: true,
          fileSize: true,
          viewportWidth: true,
          viewportHeight: true,
          fullPage: true,
          quality: true
        },
        orderBy: { createdAt: 'desc' }
      });

      return reply.send({
        projectId,
        screenshots: screenshots.map(s => ({
          ...s,
          viewUrl: `/screenshots/db/${s.id}`
        }))
      });
    } catch (error) {
      console.error(`[SCREENSHOT_ROUTES] Error listing project screenshots:`, error);
      return reply.code(500).send({ error: 'Failed to list screenshots' });
    }
  });

  // Serve the latest screenshot for a project and page type
  fastify.get('/screenshots/project/:projectId/:pageType', async (request, reply) => {
    try {
      const { projectId, pageType } = request.params as {
        projectId: string;
        pageType: 'home' | 'pdp' | 'about' | 'other'
      };

      const screenshot = await prisma.screenshot.findFirst({
        where: { 
          projectId,
          pageType,
          expiresAt: { gt: new Date() }
        },
        orderBy: { createdAt: 'desc' }
      });

      if (!screenshot) {
        return reply.code(404).send({ error: 'Screenshot not found' });
      }
      
      // Redirect to the screenshot ID endpoint
      return reply.redirect(`/screenshots/db/${screenshot.id}`);
    } catch (error) {
      console.error(`[SCREENSHOT_ROUTES] Error serving latest screenshot:`, error);
      return reply.code(500).send({ error: 'Failed to serve screenshot' });
    }
  });

  // Debug endpoint to inspect screenshot data
  fastify.get('/screenshots/debug/:screenshotId', async (request, reply) => {
    try {
      const { screenshotId } = request.params as { screenshotId: string };

      const screenshot = await prisma.screenshot.findUnique({
        where: { id: screenshotId },
        select: {
          id: true,
          pageType: true,
          url: true,
          createdAt: true,
          fileSize: true,
          data: true,
          htmlContent: true
        }
      });

      if (!screenshot) {
        return reply.code(404).send({ error: 'Screenshot not found' });
      }
      
      // Decode the first part of the screenshot to see what it contains
      const dataBuffer = Buffer.from(screenshot.data);
      const firstBytes = dataBuffer.slice(0, 50);
      const isBase64 = screenshot.data.length > 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(screenshot.data.toString());
      
      return reply.send({
        id: screenshot.id,
        pageType: screenshot.pageType,
        url: screenshot.url,
        createdAt: screenshot.createdAt,
        fileSize: screenshot.fileSize,
        dataSize: screenshot.data.length,
        isBase64: isBase64,
        firstBytes: Array.from(firstBytes).map(b => b.toString(16).padStart(2, '0')).join(' '),
        firstBytesAsText: firstBytes.toString('utf8', 0, Math.min(50, firstBytes.length)),
        htmlLength: screenshot.htmlContent?.length || 0,
        htmlPreview: screenshot.htmlContent?.substring(0, 200) || 'No HTML content'
      });
    } catch (error) {
      console.error(`[SCREENSHOT_ROUTES] Error debugging screenshot:`, error);
      return reply.code(500).send({ error: 'Failed to debug screenshot' });
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
