import { PrismaClient } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';

async function verifyMigration() {
  const prisma = new PrismaClient();
  const supabase = createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  );

  try {
    // Count events in Prisma
    const prismaCount = await prisma.analyticsEvent.count();
    console.log(`[VERIFY] Prisma events: ${prismaCount}`);

    // Count events in Supabase
    const { count: supabaseCount, error } = await supabase
      .from('events')
      .select('*', { count: 'exact', head: true });

    if (error) throw error;
    console.log(`[VERIFY] Supabase events: ${supabaseCount}`);

    // Compare
    const difference = Math.abs(prismaCount - (supabaseCount || 0));
    const percentDiff = prismaCount > 0 ? (difference / prismaCount) * 100 : 0;

    if (difference === 0) {
      console.log('✅ Migration verified: Counts match exactly!');
    } else if (percentDiff < 1) {
      console.log(`⚠️  Migration mostly successful: ${difference} events differ (${percentDiff.toFixed(2)}%)`);
    } else {
      console.log(`❌ Migration incomplete: ${difference} events missing (${percentDiff.toFixed(2)}%)`);
    }

    // Sample comparison
    console.log('\n[VERIFY] Checking sample events...');
    const samplePrismaEvents = await prisma.analyticsEvent.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' }
    });

    for (const event of samplePrismaEvents) {
      const { data } = await supabase
        .from('events')
        .select('*')
        .eq('session_id', event.sessionId)
        .eq('ts', new Date(Number(event.timestamp)).toISOString())
        .limit(1)
        .single();

      const found = !!data;
      console.log(`  ${found ? '✅' : '❌'} Event ${event.id} (${event.eventType})`);
    }

  } catch (error) {
    console.error('[VERIFY] Verification failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

verifyMigration()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

