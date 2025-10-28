import { prisma } from '@infra/prisma';
import { Signal, PersistedGoal, PublishedGoal } from '@features/signal_generation/types';

export interface CreateSignalData {
  experimentId: string;
  name: string;
  type: string;
  role: string;
  selector?: string;
  eventType?: string;
  targetUrls?: string[];
  dataLayerEvent?: string;
  customJs?: string;
  valueSelector?: string;
  currency?: string;
  existsInControl: boolean;
  existsInVariant: boolean;
}

/**
 * Signal Data Access Layer
 */
export class SignalDAL {
  /**
   * Create a new signal (goal) for an experiment
   */
  static async createSignal(data: CreateSignalData): Promise<PersistedGoal> {
    const goal = await prisma.experimentGoal.create({
      data: {
        experimentId: data.experimentId,
        name: data.name,
        type: data.type,
        role: data.role,
        selector: data.selector,
        eventType: data.eventType,
        targetUrls: data.targetUrls ? data.targetUrls : undefined,
        dataLayerEvent: data.dataLayerEvent,
        customJs: data.customJs,
        valueSelector: data.valueSelector,
        currency: data.currency,
        existsInControl: data.existsInControl,
        existsInVariant: data.existsInVariant,
      },
    });

    return this.mapToPersistedGoal(goal);
  }

  /**
   * Create multiple signals at once
   */
  static async createSignals(signals: CreateSignalData[]): Promise<PersistedGoal[]> {
    const created = await prisma.$transaction(
      signals.map(data =>
        prisma.experimentGoal.create({
          data: {
            experimentId: data.experimentId,
            name: data.name,
            type: data.type,
            role: data.role,
            selector: data.selector,
            eventType: data.eventType,
            targetUrls: data.targetUrls ? data.targetUrls : undefined,
            dataLayerEvent: data.dataLayerEvent,
            customJs: data.customJs,
            valueSelector: data.valueSelector,
            currency: data.currency,
            existsInControl: data.existsInControl,
            existsInVariant: data.existsInVariant,
          },
        })
      )
    );

    return created.map(this.mapToPersistedGoal);
  }

  /**
   * Get all signals for an experiment
   */
  static async getSignalsByExperiment(experimentId: string): Promise<PersistedGoal[]> {
    const goals = await prisma.experimentGoal.findMany({
      where: { experimentId },
      orderBy: [
        { role: 'asc' }, // primary, mechanism, guardrail
        { createdAt: 'asc' },
      ],
    });

    return goals.map(this.mapToPersistedGoal);
  }

  /**
   * Get signals by experiment and role
   */
  static async getSignalsByRole(
    experimentId: string,
    role: 'primary' | 'mechanism' | 'guardrail'
  ): Promise<PersistedGoal[]> {
    const goals = await prisma.experimentGoal.findMany({
      where: {
        experimentId,
        role,
      },
      orderBy: { createdAt: 'asc' },
    });

    return goals.map(this.mapToPersistedGoal);
  }

  /**
   * Get primary signal for an experiment
   */
  static async getPrimarySignal(experimentId: string): Promise<PersistedGoal | null> {
    const goal = await prisma.experimentGoal.findFirst({
      where: {
        experimentId,
        role: 'primary',
      },
      orderBy: { createdAt: 'asc' },
    });

    return goal ? this.mapToPersistedGoal(goal) : null;
  }

  /**
   * Delete all signals for an experiment
   */
  static async deleteSignalsByExperiment(experimentId: string): Promise<void> {
    await prisma.experimentGoal.deleteMany({
      where: { experimentId },
    });
  }

  /**
   * Delete a specific signal
   */
  static async deleteSignal(signalId: string): Promise<void> {
    await prisma.experimentGoal.delete({
      where: { id: signalId },
    });
  }

  /**
   * Update a signal
   */
  static async updateSignal(
    signalId: string,
    data: Partial<CreateSignalData>
  ): Promise<PersistedGoal> {
    const goal = await prisma.experimentGoal.update({
      where: { id: signalId },
      data: {
        name: data.name,
        type: data.type,
        role: data.role,
        selector: data.selector,
        eventType: data.eventType,
        targetUrls: data.targetUrls ? data.targetUrls : undefined,
        dataLayerEvent: data.dataLayerEvent,
        customJs: data.customJs,
        valueSelector: data.valueSelector,
        currency: data.currency,
        existsInControl: data.existsInControl,
        existsInVariant: data.existsInVariant,
      },
    });

    return this.mapToPersistedGoal(goal);
  }

  /**
   * Convert Prisma ExperimentGoal to PersistedGoal type
   */
  private static mapToPersistedGoal(goal: any): PersistedGoal {
    return {
      id: goal.id,
      experimentId: goal.experimentId,
      name: goal.name,
      type: goal.type,
      role: goal.role,
      selector: goal.selector || undefined,
      eventType: goal.eventType || undefined,
      targetUrls: goal.targetUrls as string[] | undefined,
      bodyClasses: goal.bodyClasses as string[] | undefined,
      dataLayerEvent: goal.dataLayerEvent || undefined,
      customJs: goal.customJs || undefined,
      valueSelector: goal.valueSelector || undefined,
      currency: goal.currency || undefined,
      existsInControl: goal.existsInControl,
      existsInVariant: goal.existsInVariant,
      createdAt: goal.createdAt,
    };
  }

  /**
   * Convert PersistedGoal to PublishedGoal (for Cloudflare)
   */
  static toPublishedGoal(goal: PersistedGoal): PublishedGoal {
    return {
      name: goal.name,
      type: goal.type as any,
      role: goal.role as any,
      selector: goal.selector,
      eventType: goal.eventType,
      targetUrls: goal.targetUrls,
      dataLayerEvent: goal.dataLayerEvent,
      customJs: goal.customJs,
      valueSelector: goal.valueSelector,
      currency: goal.currency,
    };
  }

  /**
   * Convert Signal to CreateSignalData
   */
  static fromSignal(signal: Signal, experimentId: string): CreateSignalData {
    return {
      experimentId,
      name: signal.name,
      type: signal.type,
      role: signal.role,
      selector: signal.selector,
      eventType: signal.eventType,
      targetUrls: signal.targetUrls,
      dataLayerEvent: signal.dataLayerEvent,
      customJs: signal.customJs,
      valueSelector: signal.valueSelector,
      currency: signal.currency,
      existsInControl: signal.existsInControl,
      existsInVariant: signal.existsInVariant,
    };
  }
}

