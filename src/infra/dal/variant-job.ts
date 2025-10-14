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

    // Minimal metadata fetch to avoid loading large JSON `result`
    static async getJobMetaById(jobId: string): Promise<Pick<VariantJob, 'id' | 'projectId' | 'status' | 'progress' | 'createdAt' | 'startedAt' | 'completedAt'> | null> {
        const job = await prisma.variantJob.findUnique({
            where: { id: jobId },
            select: {
                id: true,
                projectId: true,
                status: true,
                progress: true,
                createdAt: true,
                startedAt: true,
                completedAt: true,
            },
        });
        return job as any;
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

    // Minimal preview extraction directly from JSON via SQL, without loading full job row into app memory
    static async getJobPreview(jobId: string, variantIds?: string[]): Promise<Array<{ variantId: string; selector: string; position: 'INNER'; css: string; html: string; js: string }>> {
        // Build optional filter for variant labels
        const filterBy = Array.isArray(variantIds) && variantIds.length > 0 ? variantIds : null;

        // Use parameterized raw SQL to project only needed fields
        // Note: "variant_jobs" is the mapped table name per @@map
        const rows = await prisma.$queryRawUnsafe<any[]>(
            `
            SELECT
              (v->>'variant_label') AS variant_id,
              COALESCE(v->>'target_selector', '') AS selector,
              'INNER'::text AS position,
              COALESCE(v->>'css_code', '') AS css,
              COALESCE(v->>'html_code', '') AS html,
              -- prefer javascript_code; fall back to js if present
              COALESCE(v->>'javascript_code', v->>'js', '') AS js
            FROM variant_jobs
            CROSS JOIN LATERAL jsonb_array_elements(result->'variantsSchema'->'variants') AS v
            WHERE id = $1
              AND status = 'COMPLETED'
              AND (result ? 'variantsSchema')
              AND ((result->'variantsSchema') ? 'variants')
              ${filterBy ? 'AND (v->>\'variant_label\') = ANY($2)' : ''}
            `,
            ...(filterBy ? [jobId, filterBy] : [jobId])
        );

        return rows.map(r => ({
            variantId: r.variant_id || '',
            selector: r.selector || '',
            position: 'INNER',
            css: r.css || '',
            html: r.html || '',
            js: r.js || '',
        }));
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
