import { prisma } from './src/infra/prisma';

async function checkExperimentStatus() {
  const experiments = await prisma.experiment.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: {
      id: true,
      name: true,
      status: true,
      createdAt: true,
      publishedAt: true,
      finishedAt: true,
    }
  });

  console.log('\n📊 Recent Experiments:');
  console.log('='.repeat(100));

  experiments.forEach((exp) => {
    console.log(`\nID: ${exp.id}`);
    console.log(`Name: ${exp.name}`);
    console.log(`Status: ${exp.status}`);
    console.log(`Created: ${exp.createdAt}`);
    console.log(`Published: ${exp.publishedAt || 'N/A'}`);
    console.log(`Finished: ${exp.finishedAt || 'N/A'}`);
    console.log('-'.repeat(100));
  });

  await prisma.$disconnect();
}

checkExperimentStatus().catch(console.error);
