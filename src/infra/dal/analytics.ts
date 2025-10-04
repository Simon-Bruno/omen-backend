import { PrismaClient } from '@prisma/client';
import { 
  AnalyticsEventData, 
  AnalyticsQuery, 
  ExposureStats
} from '@domain/analytics/types';
import { AnalyticsRepository } from '@domain/analytics/analytics-service';

export class PrismaAnalyticsRepository implements AnalyticsRepository {
  constructor(private prisma: PrismaClient) {}

  async create(eventData: Omit<AnalyticsEventData, 'id' | 'createdAt'>): Promise<AnalyticsEventData> {
    const event = await this.prisma.analyticsEvent.create({
      data: {
        projectId: eventData.projectId,
        experimentId: eventData.experimentId,
        eventType: eventData.eventType,
        sessionId: eventData.sessionId,
        viewId: eventData.viewId,
        properties: eventData.properties as any,
        timestamp: BigInt(eventData.timestamp || Date.now()),
      },
    });

    return this.mapToAnalyticsEventData(event);
  }

  async createMany(events: Omit<AnalyticsEventData, 'id' | 'createdAt'>[]): Promise<AnalyticsEventData[]> {
    const createdEvents = await this.prisma.analyticsEvent.createMany({
      data: events.map(event => ({
        projectId: event.projectId,
        experimentId: event.experimentId,
        eventType: event.eventType,
        sessionId: event.sessionId,
        viewId: event.viewId,
        properties: event.properties as any,
        timestamp: BigInt(event.timestamp || Date.now()),
      })),
    });

    // Fetch the created events to return them
    const eventIds = await this.prisma.analyticsEvent.findMany({
      where: {
        projectId: events[0]?.projectId,
        sessionId: events[0]?.sessionId,
        timestamp: {
          gte: BigInt(Math.min(...events.map(e => e.timestamp || Date.now()))),
          lte: BigInt(Math.max(...events.map(e => e.timestamp || Date.now()))),
        },
      },
      orderBy: { createdAt: 'desc' },
      take: createdEvents.count,
    });

    return eventIds.map(event => this.mapToAnalyticsEventData(event));
  }

  async findMany(query: AnalyticsQuery): Promise<AnalyticsEventData[]> {
    const where: any = {
      projectId: query.projectId,
    };

    if (query.experimentId) {
      where.experimentId = query.experimentId;
    }

    if (query.sessionId) {
      where.sessionId = query.sessionId;
    }

    if (query.startDate || query.endDate) {
      where.timestamp = {};
      if (query.startDate) {
        where.timestamp.gte = BigInt(Math.floor(query.startDate.getTime() / 1000));
      }
      if (query.endDate) {
        where.timestamp.lte = BigInt(Math.floor(query.endDate.getTime() / 1000));
      }
    }

    const events = await this.prisma.analyticsEvent.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: query.limit || 100,
      skip: query.offset || 0,
    });

    return events.map(event => this.mapToAnalyticsEventData(event));
  }

  async count(query: AnalyticsQuery): Promise<number> {
    const where: any = {
      projectId: query.projectId,
    };

    if (query.experimentId) {
      where.experimentId = query.experimentId;
    }

    if (query.sessionId) {
      where.sessionId = query.sessionId;
    }

    if (query.startDate || query.endDate) {
      where.timestamp = {};
      if (query.startDate) {
        where.timestamp.gte = BigInt(Math.floor(query.startDate.getTime() / 1000));
      }
      if (query.endDate) {
        where.timestamp.lte = BigInt(Math.floor(query.endDate.getTime() / 1000));
      }
    }

    return this.prisma.analyticsEvent.count({ where });
  }

  async getExposureStats(projectId: string, experimentId: string): Promise<ExposureStats[]> {
    const stats = await this.prisma.analyticsEvent.groupBy({
      by: ['experimentId', 'properties'],
      where: {
        projectId,
        experimentId,
        eventType: 'exposure',
      },
      _count: {
        id: true,
        sessionId: true,
      },
    });

    // Group by variantId from properties
    const variantStats = new Map<string, ExposureStats>();
    
    for (const stat of stats) {
      const properties = stat.properties as any;
      const variantId = properties.variantId;
      
      if (!variantId) continue;

      if (!variantStats.has(variantId)) {
        variantStats.set(variantId, {
          experimentId,
          variantId,
          exposures: 0,
          uniqueSessions: 0,
        });
      }

      const current = variantStats.get(variantId)!;
      current.exposures += stat._count.id;
      current.uniqueSessions += stat._count.sessionId;
    }

    return Array.from(variantStats.values());
  }

  private mapToAnalyticsEventData(event: any): AnalyticsEventData {
    return {
      id: event.id,
      projectId: event.projectId,
      experimentId: event.experimentId,
      eventType: event.eventType,
      sessionId: event.sessionId,
      viewId: event.viewId,
      properties: event.properties,
      timestamp: Number(event.timestamp),
      createdAt: event.createdAt,
    };
  }
}