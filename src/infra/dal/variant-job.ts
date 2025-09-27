import { prisma } from '@infra/prisma';
import { JobStatus } from '@prisma/client';

export interface CreateVariantJobData {
    projectId: string;
}

export interface UpdateVariantJobData {
    status?: JobStatus;
    progress?: number;
    result?: any;
    error?: string;
    startedAt?: Date;
    completedAt?: Date;
}

export interface VariantJob {
    id: string;
    projectId: string;
    status: JobStatus;
    progress: number | null;
    result: any;
    error: string | null;
    createdAt: Date;
    startedAt: Date | null;
    completedAt: Date | null;
}

export class VariantJobDAL {
    static async createJob(data: CreateVariantJobData): Promise<VariantJob> {
        return await prisma.variantJob.create({
            data: {
                projectId: data.projectId,
                status: 'PENDING',
                progress: 0,
            },
        });
    }

    static async getJobById(jobId: string): Promise<VariantJob | null> {
        return await prisma.variantJob.findUnique({
            where: { id: jobId },
        });
    }

    static async getJobsByProject(
        projectId: string,
        limit?: number,
        offset?: number
    ): Promise<VariantJob[]> {
        return await prisma.variantJob.findMany({
            where: { projectId },
            orderBy: { createdAt: 'desc' },
            ...(limit && { take: limit }),
            ...(offset && { skip: offset }),
        });
    }

    static async updateJob(jobId: string, data: UpdateVariantJobData): Promise<VariantJob> {
        return await prisma.variantJob.update({
            where: { id: jobId },
            data: {
                ...data,
                ...(data.status === 'RUNNING' && !data.startedAt && { startedAt: new Date() }),
                ...(data.status === 'COMPLETED' && !data.completedAt && { completedAt: new Date() }),
                ...(data.status === 'FAILED' && !data.completedAt && { completedAt: new Date() }),
            },
        });
    }

    static async deleteJob(jobId: string): Promise<void> {
        await prisma.variantJob.delete({
            where: { id: jobId },
        });
    }

    static async getJobsByStatus(status: JobStatus, limit?: number): Promise<VariantJob[]> {
        return await prisma.variantJob.findMany({
            where: { status },
            orderBy: { createdAt: 'asc' },
            ...(limit && { take: limit }),
        });
    }

    static async cleanupOldJobs(olderThanDays: number = 7): Promise<number> {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

        const result = await prisma.variantJob.deleteMany({
            where: {
                status: {
                    in: ['COMPLETED', 'FAILED'],
                },
                completedAt: {
                    lt: cutoffDate,
                },
            },
        });

        return result.count;
    }
}
