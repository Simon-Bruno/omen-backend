import { PrismaClient } from '@prisma/client';
import {
  AnalyticsEventData,
  AnalyticsQuery,
  ExposureStats,
  FunnelAnalysis,
  ConversionRates,
  FunnelStep
} from '@domain/analytics/types';
import { AnalyticsRepository } from '@domain/analytics/analytics-service';

export class PrismaAnalyticsRepository implements AnalyticsRepository {
  constructor(private prisma: PrismaClient) { }

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
    // Filter out events with invalid experiment IDs to prevent foreign key violations
    const validEvents = [];
    const invalidEvents = [];

    for (const event of events) {
      if (event.experimentId) {
        // Check if experiment exists
        const experimentExists = await this.prisma.experiment.findUnique({
          where: { id: event.experimentId },
          select: { id: true }
        });

        if (experimentExists) {
          validEvents.push(event);
        } else {
          console.warn(`[ANALYTICS] Skipping event for non-existent experiment: ${event.experimentId}`);
          invalidEvents.push(event);
        }
      } else {
        // Events without experimentId are valid (e.g., general pageview events)
        validEvents.push(event);
      }
    }

    if (validEvents.length === 0) {
      console.warn(`[ANALYTICS] No valid events to create after filtering`);
      return [];
    }

    if (invalidEvents.length > 0) {
      console.warn(`[ANALYTICS] Filtered out ${invalidEvents.length} events with invalid experiment IDs`);
    }

    const createdEvents = await this.prisma.analyticsEvent.createMany({
      data: validEvents.map(event => ({
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
    // First, get all variants from the experiment
    const experiment = await this.prisma.experiment.findUnique({
      where: { id: experimentId },
      select: { variants: true }
    });

    if (!experiment) {
      return [];
    }

    // Initialize all variants with zero stats
    const variantStats = new Map<string, ExposureStats>();

    // Parse variants from experiment data
    const variants = experiment.variants as any[];
    for (const variant of variants) {
      const variantId = variant.variantId;
      if (variantId) {
        variantStats.set(variantId, {
          experimentId,
          variantId,
          exposures: 0,
          uniqueSessions: 0,
        });
      }
    }

    // Get all exposure events for this experiment
    const exposureEvents = await this.prisma.analyticsEvent.findMany({
      where: {
        projectId,
        experimentId,
        eventType: 'EXPOSURE',
      },
    });

    // Group by variant and count unique sessions
    const variantSessions = new Map<string, Set<string>>();
    const variantExposureCounts = new Map<string, number>();

    for (const event of exposureEvents) {
      const properties = event.properties as any;
      const variantKey = properties.variantKey; // SDK sends variantKey, not variantId

      if (!variantKey) continue;

      if (!variantStats.has(variantKey)) {
        // If we find a variant in events that's not in the experiment, add it
        variantStats.set(variantKey, {
          experimentId,
          variantId: variantKey, // Use variantKey as variantId for the response
          exposures: 0,
          uniqueSessions: 0,
        });
      }

      // Track unique sessions for this variant
      if (!variantSessions.has(variantKey)) {
        variantSessions.set(variantKey, new Set());
        variantExposureCounts.set(variantKey, 0);
      }

      variantSessions.get(variantKey)!.add(event.sessionId);
      variantExposureCounts.set(variantKey, (variantExposureCounts.get(variantKey) || 0) + 1);
    }

    // Fill in actual stats from events
    for (const [variantKey, stats] of variantStats.entries()) {
      const sessions = variantSessions.get(variantKey) || new Set();
      const exposureCount = variantExposureCounts.get(variantKey) || 0;
      
      stats.exposures = exposureCount;
      stats.uniqueSessions = sessions.size;
    }

    return Array.from(variantStats.values());
  }

  async getFunnelAnalysis(projectId: string, experimentId: string): Promise<FunnelAnalysis> {
    // First, find all sessions that have events for this experiment
    const experimentSessions = await this.prisma.analyticsEvent.findMany({
      where: {
        projectId,
        experimentId,
      },
      select: {
        sessionId: true,
      },
      distinct: ['sessionId'],
    });

    const sessionIds = experimentSessions.map(s => s.sessionId);

    if (sessionIds.length === 0) {
      return {
        experimentId,
        variants: [],
        overallStats: {
          totalSessions: 0,
          totalExposures: 0,
          totalConversions: 0,
          overallConversionRate: 0,
        },
      };
    }

    // Get ALL events for these sessions (not just experiment events)
    const events = await this.prisma.analyticsEvent.findMany({
      where: {
        projectId,
        sessionId: {
          in: sessionIds,
        },
      },
      orderBy: { timestamp: 'asc' },
    });

    // Map to AnalyticsEventData format
    const mappedEvents = events.map(event => this.mapToAnalyticsEventData(event));

    // First, find all exposure events to get variant information
    const exposureEvents = mappedEvents.filter(e => e.eventType === 'EXPOSURE');
    console.log('[FUNNEL_DEBUG] Exposure events found:', exposureEvents.length);
    console.log('[FUNNEL_DEBUG] Exposure events:', exposureEvents.map(e => ({
      sessionId: e.sessionId,
      variantKey: (e.properties as any)?.variantKey,
      experimentId: e.experimentId
    })));

    // Create a map of sessionId -> variantId from exposure events
    const sessionToVariant = new Map<string, string>();
    for (const exposure of exposureEvents) {
      const variantKey = (exposure.properties as any)?.variantKey;
      if (variantKey) {
        sessionToVariant.set(exposure.sessionId, variantKey);
      }
    }

    console.log('[FUNNEL_DEBUG] Session to variant mapping:', Array.from(sessionToVariant.entries()));

    // Group events by session and variant
    const sessionsByVariant = new Map<string, Map<string, any[]>>();

    for (const event of mappedEvents) {
      // Get variant for this session from exposure events
      const variantId = sessionToVariant.get(event.sessionId) || 'unknown';

      if (!sessionsByVariant.has(variantId)) {
        sessionsByVariant.set(variantId, new Map());
      }

      const variantSessions = sessionsByVariant.get(variantId)!;
      if (!variantSessions.has(event.sessionId)) {
        variantSessions.set(event.sessionId, []);
      }

      variantSessions.get(event.sessionId)!.push(event);
    }

    // Calculate overall stats first
    const allPageviewSessions = new Set(mappedEvents.filter(e => e.eventType === 'PAGEVIEW').map(e => e.sessionId));
    const allExposureSessions = new Set(mappedEvents.filter(e => e.eventType === 'EXPOSURE').map(e => e.sessionId));
    const allConversionSessions = new Set(mappedEvents.filter(e => e.eventType === 'CONVERSION').map(e => e.sessionId));

    const overallStats = {
      totalSessions: allPageviewSessions.size,
      totalExposures: allExposureSessions.size,
      totalConversions: allConversionSessions.size,
      overallConversionRate: allExposureSessions.size > 0 ? (allConversionSessions.size / allExposureSessions.size) * 100 : 0,
    };

    // Build funnel for each variant
    const variants = Array.from(sessionsByVariant.keys()).map(variantId => {
      const variantSessions = sessionsByVariant.get(variantId)!;
      const variantEvents = Array.from(variantSessions.values()).flat();

      // Count sessions by event type for this variant
      const pageviewSessions = new Set(variantEvents.filter(e => e.eventType === 'PAGEVIEW').map(e => e.sessionId));
      const exposureSessions = new Set(variantEvents.filter(e => e.eventType === 'EXPOSURE').map(e => e.sessionId));
      const conversionSessions = new Set(variantEvents.filter(e => e.eventType === 'CONVERSION').map(e => e.sessionId));

      const pageviewSessionCount = pageviewSessions.size;
      const exposureSessionCount = exposureSessions.size;
      const conversionSessionCount = conversionSessions.size;

      // Build funnel steps for this variant
      const steps: FunnelStep[] = [];

      // Step 1: Sessions (sessions that had at least one pageview)
      steps.push({
        stepName: 'Session',
        eventType: 'PAGEVIEW',
        count: pageviewSessionCount,
        percentage: 100, // Sessions are the baseline
        dropoffRate: 0,
      });

      // Step 2: Exposures (sessions that saw this variant)
      steps.push({
        stepName: 'Exposure',
        eventType: 'EXPOSURE',
        count: exposureSessionCount,
        percentage: exposureSessionCount > 0 ? (exposureSessionCount / pageviewSessionCount) * 100 : 0,
        dropoffRate: pageviewSessionCount > 0 ? ((pageviewSessionCount - exposureSessionCount) / pageviewSessionCount) * 100 : 0,
      });

      // Step 3: Conversions (sessions that converted)
      steps.push({
        stepName: 'Conversion',
        eventType: 'CONVERSION',
        count: conversionSessionCount,
        percentage: conversionSessionCount > 0 ? (conversionSessionCount / pageviewSessionCount) * 100 : 0,
        dropoffRate: exposureSessionCount > 0 ? ((exposureSessionCount - conversionSessionCount) / exposureSessionCount) * 100 : 0,
      });

      const conversionRate = exposureSessionCount > 0 ? (conversionSessionCount / exposureSessionCount) * 100 : 0;

      return {
        variantId,
        steps,
        totalSessions: pageviewSessionCount,
        conversionRate,
      };
    });

    console.log('[FUNNEL_DEBUG] Final variants array:', JSON.stringify(variants, null, 2));
    console.log('[FUNNEL_DEBUG] Overall stats:', JSON.stringify(overallStats, null, 2));

    return {
      experimentId,
      variants,
      overallStats,
    };
  }

  async getConversionRates(projectId: string, experimentId: string): Promise<ConversionRates[]> {
    // First, get all variants from the experiment
    const experiment = await this.prisma.experiment.findUnique({
      where: { id: experimentId },
      select: { variants: true }
    });

    if (!experiment) {
      return [];
    }

    // Initialize all variants with zero stats
    const variantStats = new Map<string, {
      sessions: number;
      conversions: number;
      totalValue: number;
      conversionCount: number;
    }>();

    // Parse variants from experiment data
    const variants = experiment.variants as any[];
    for (const variant of variants) {
      const variantId = variant.variantId;
      if (variantId) {
        variantStats.set(variantId, {
          sessions: 0,
          conversions: 0,
          totalValue: 0,
          conversionCount: 0,
        });
      }
    }

    // First, find all sessions that have events for this experiment
    const experimentSessions = await this.prisma.analyticsEvent.findMany({
      where: {
        projectId,
        experimentId,
      },
      select: {
        sessionId: true,
      },
      distinct: ['sessionId'],
    });

    const sessionIds = experimentSessions.map(s => s.sessionId);

    if (sessionIds.length === 0) {
      return Array.from(variantStats.entries()).map(([variantId]) => ({
        experimentId,
        variantId,
        sessions: 0,
        conversions: 0,
        conversionRate: 0,
        averageValue: 0,
        totalValue: 0,
      }));
    }

    // Get only EXPOSURE and CONVERSION events for these sessions
    const events = await this.prisma.analyticsEvent.findMany({
      where: {
        projectId,
        sessionId: {
          in: sessionIds,
        },
        eventType: {
          in: ['EXPOSURE', 'CONVERSION']
        }
      },
      orderBy: { timestamp: 'asc' },
    });

    // Map to AnalyticsEventData format
    const mappedEvents = events.map(event => this.mapToAnalyticsEventData(event));

    // Group events by variant and session to count unique sessions
    const variantSessions = new Map<string, Set<string>>();
    const variantConversions = new Map<string, Set<string>>();
    const variantValues = new Map<string, number[]>();

    // Initialize maps for all variants
    for (const [variantId] of variantStats.entries()) {
      variantSessions.set(variantId, new Set());
      variantConversions.set(variantId, new Set());
      variantValues.set(variantId, []);
    }

    // Process events
    for (const event of mappedEvents) {
      if (event.eventType === 'EXPOSURE' && event.experimentId === experimentId) {
        // Get variant from exposure event
        const variantKey = (event.properties as any)?.variantKey;
        if (variantKey) {
          if (!variantStats.has(variantKey)) {
            // If we find a variant in events that's not in the experiment, add it
            variantStats.set(variantKey, {
              sessions: 0,
              conversions: 0,
              totalValue: 0,
              conversionCount: 0,
            });
            variantSessions.set(variantKey, new Set());
            variantConversions.set(variantKey, new Set());
            variantValues.set(variantKey, []);
          }
          
          // Track unique sessions that were exposed to this variant
          const sessions = variantSessions.get(variantKey);
          if (sessions) {
            sessions.add(event.sessionId);
          }
        }
      } else if (event.eventType === 'CONVERSION') {
        // For conversions, we need to find which variant this session was exposed to
        // Look for the most recent exposure event for this session in this experiment
        const exposureEvent = mappedEvents
          .filter(e => e.eventType === 'EXPOSURE' && e.experimentId === experimentId && e.sessionId === event.sessionId)
          .sort((a, b) => b.timestamp - a.timestamp)[0];
        
        if (exposureEvent) {
          const variantKey = (exposureEvent.properties as any)?.variantKey;
          if (variantKey) {
            if (!variantStats.has(variantKey)) {
              // If we find a variant in events that's not in the experiment, add it
              variantStats.set(variantKey, {
                sessions: 0,
                conversions: 0,
                totalValue: 0,
                conversionCount: 0,
              });
              variantSessions.set(variantKey, new Set());
              variantConversions.set(variantKey, new Set());
              variantValues.set(variantKey, []);
            }
            
            // Track unique sessions that converted for this variant
            const conversions = variantConversions.get(variantKey);
            const values = variantValues.get(variantKey);
            if (conversions && values) {
              conversions.add(event.sessionId);
              const value = (event.properties as any)?.value || 0;
              values.push(value);
            }
          }
        }
      }
    }

    // Calculate final stats for each variant
    for (const [variantId, stats] of variantStats.entries()) {
      const sessions = variantSessions.get(variantId) || new Set();
      const conversions = variantConversions.get(variantId) || new Set();
      const values = variantValues.get(variantId) || [];

      stats.sessions = sessions.size;
      stats.conversions = conversions.size;
      stats.totalValue = values.reduce((sum, val) => sum + val, 0);
      stats.conversionCount = values.length;
    }

    return Array.from(variantStats.entries()).map(([variantId, stats]) => ({
      experimentId,
      variantId,
      sessions: stats.sessions,
      conversions: stats.conversions,
      conversionRate: stats.sessions > 0 ? (stats.conversions / stats.sessions) * 100 : 0,
      averageValue: stats.conversionCount > 0 ? stats.totalValue / stats.conversionCount : 0,
      totalValue: stats.totalValue,
    }));
  }

  async getUserJourney(projectId: string, sessionId: string): Promise<AnalyticsEventData[]> {
    const events = await this.prisma.analyticsEvent.findMany({
      where: {
        projectId,
        sessionId,
      },
      orderBy: { timestamp: 'asc' },
    });

    return events.map(event => this.mapToAnalyticsEventData(event));
  }

  /**
   * Get events with variant attribution using database joins
   * This is the core method for database-based attribution
   */
  async getEventsWithAttribution(query: AnalyticsQuery): Promise<AnalyticsEventData[]> {
    const events = await this.prisma.analyticsEvent.findMany({
      where: {
        projectId: query.projectId,
        sessionId: query.sessionId,
        // Filter by experimentId if provided
        ...(query.experimentId && { experimentId: query.experimentId }),
        timestamp: query.startDate || query.endDate ? {
          gte: query.startDate ? BigInt(query.startDate.getTime()) : undefined,
          lte: query.endDate ? BigInt(query.endDate.getTime()) : undefined,
        } : undefined,
      },
      orderBy: { timestamp: 'asc' },
      take: query.limit || 1000,
    });

    // If no experimentId is provided, return all events as-is (for journey view)
    if (!query.experimentId) {
      return events.map(event => this.mapToAnalyticsEventData(event));
    }

    // For specific experiment queries, add variant attribution to non-exposure events
    const eventsWithAttribution = await Promise.all(
      events.map(async (event) => {
        if (event.eventType === 'EXPOSURE' || event.experimentId) {
          // Already has attribution or is an exposure event
          return this.mapToAnalyticsEventData(event);
        }

        // Get the most recent exposure for this session before this event
        const exposure = await this.prisma.analyticsEvent.findFirst({
          where: {
            sessionId: event.sessionId,
            eventType: 'EXPOSURE',
            experimentId: query.experimentId,
            timestamp: { lte: event.timestamp },
          },
          orderBy: { timestamp: 'desc' },
        });

        if (exposure) {
          // Add attribution to the event
          const eventProperties = event.properties as Record<string, any> || {};
          return this.mapToAnalyticsEventData({
            ...event,
            experimentId: exposure.experimentId,
            properties: {
              ...eventProperties,
              variantKey: (exposure.properties as any)?.variantKey,
              attributedFrom: 'database_join',
            },
          });
        }

        // Return null for events that can't be attributed to this experiment
        return null;
      })
    );

    // Filter out null values (events that couldn't be attributed to this experiment)
    return eventsWithAttribution.filter(event => event !== null);
  }

  async getExperimentSessions(projectId: string, experimentId: string, limit: number = 100, offset: number = 0): Promise<{ sessions: { sessionId: string, eventCount: number }[], total: number }> {
    // Use raw SQL to get sessions that have experiment events, with counts of ALL their events
    const result = await this.prisma.$queryRaw<Array<{ sessionId: string, eventCount: bigint }>>`
      SELECT 
        e1."sessionId",
        COUNT(e2.id)::bigint as "eventCount"
      FROM analytics_events e1
      INNER JOIN analytics_events e2 ON e1."sessionId" = e2."sessionId"
      WHERE e1."projectId" = ${projectId}
        AND e1."experimentId" = ${experimentId}
        AND e2."projectId" = ${projectId}
      GROUP BY e1."sessionId"
      ORDER BY e1."sessionId" ASC
      LIMIT ${limit} OFFSET ${offset}
    `;

    // Get total count for pagination
    const totalResult = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(DISTINCT "sessionId")::bigint as count
      FROM analytics_events
      WHERE "projectId" = ${projectId}
        AND "experimentId" = ${experimentId}
    `;

    return {
      sessions: result.map(s => ({
        sessionId: s.sessionId,
        eventCount: Number(s.eventCount),
      })),
      total: Number(totalResult[0]?.count || 0),
    };
  }

  private mapToAnalyticsEventData(event: any): AnalyticsEventData {
    return {
      id: event.id,
      projectId: event.projectId,
      experimentId: event.experimentId,
      eventType: event.eventType,
      sessionId: event.sessionId,
      viewId: event.viewId,
      properties: event.properties ? JSON.parse(JSON.stringify(event.properties)) : {},
      timestamp: Number(event.timestamp),
      createdAt: event.createdAt,
    };
  }
}