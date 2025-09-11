#!/usr/bin/env tsx
/**
 * Development Seed Script
 * Creates dummy data for development and testing
 * 
 * Usage:
 *   npm run seed
 *   npm run seed:reset  (clears all data first)
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function clearDatabase() {
  console.log('🗑️  Clearing existing data...');
  
  // Delete in reverse order of dependencies
  await prisma.chatMessage.deleteMany();
  await prisma.chatSession.deleteMany();
  await prisma.diagnosticsRun.deleteMany();
  await prisma.experiment.deleteMany();
  await prisma.project.deleteMany();
  await prisma.user.deleteMany();
  
  console.log('✅ Database cleared');
}

async function createUsers() {
  console.log('👤 Creating users...');
  
  const users = await Promise.all([
    prisma.user.create({
      data: {
        auth0Id: 'auth0|dev-user-1',
        email: 'dev1@example.com',
      },
    }),
    prisma.user.create({
      data: {
        auth0Id: 'auth0|dev-user-2',
        email: 'dev2@example.com',
      },
    }),
  ]);
  
  console.log(`✅ Created ${users.length} users`);
  return users;
}

async function createProjects(users: any[]) {
  console.log('🏢 Creating projects...');
  
  // For seeding, we'll use plain text tokens (in real app these would be encrypted)
  const accessToken1 = 'shpat_dummy_token_1_encrypted_placeholder';
  const accessToken2 = 'shpat_dummy_token_2_encrypted_placeholder';
  
  const projects = await Promise.all([
    prisma.project.create({
      data: {
        userId: users[0].id,
        shopDomain: 'dev-shop-1.myshopify.com',
        accessTokenEnc: accessToken1,
      },
    }),
    prisma.project.create({
      data: {
        userId: users[1].id,
        shopDomain: 'dev-shop-2.myshopify.com',
        accessTokenEnc: accessToken2,
      },
    }),
  ]);
  
  console.log(`✅ Created ${projects.length} projects`);
  return projects;
}

async function createExperiments(projects: any[]) {
  console.log('🧪 Creating experiments...');
  
  const experiments = [];
  
  for (const project of projects) {
    // Create 2-3 experiments per project
    const projectExperiments = await Promise.all([
      prisma.experiment.create({
        data: {
          projectId: project.id,
          name: 'Homepage Hero Test',
          status: 'DRAFT',
          dsl: {
            type: 'ab_test',
            variants: [
              { name: 'Control', weight: 50 },
              { name: 'Variant A', weight: 50 }
            ],
            target: 'homepage.hero',
            metrics: ['conversion_rate', 'click_through_rate']
          },
        },
      }),
      prisma.experiment.create({
        data: {
          projectId: project.id,
          name: 'Product Page CTA',
          status: 'RUNNING',
          publishedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
          dsl: {
            type: 'multivariate',
            variants: [
              { name: 'Original', weight: 33 },
              { name: 'Red Button', weight: 33 },
              { name: 'Green Button', weight: 34 }
            ],
            target: 'product_page.add_to_cart',
            metrics: ['add_to_cart_rate', 'revenue_per_visitor']
          },
        },
      }),
      prisma.experiment.create({
        data: {
          projectId: project.id,
          name: 'Checkout Flow Optimization',
          status: 'FINISHED',
          publishedAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000), // 14 days ago
          finishedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
          dsl: {
            type: 'ab_test',
            variants: [
              { name: 'Single Page', weight: 50 },
              { name: 'Multi Step', weight: 50 }
            ],
            target: 'checkout.flow',
            metrics: ['checkout_completion_rate', 'time_to_complete']
          },
        },
      }),
    ]);
    
    experiments.push(...projectExperiments);
  }
  
  console.log(`✅ Created ${experiments.length} experiments`);
  return experiments;
}

async function createDiagnosticsRuns(projects: any[]) {
  console.log('🔍 Creating diagnostics runs...');
  
  const diagnosticsRuns = [];
  
  for (const project of projects) {
    // Create 2-3 diagnostics runs per project
    const projectDiagnostics = await Promise.all([
      prisma.diagnosticsRun.create({
        data: {
          projectId: project.id,
          status: 'COMPLETED',
          startedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
          finishedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
          summary: {
            total_pages: 15,
            issues_found: 3,
            performance_score: 85,
            accessibility_score: 92,
            seo_score: 78
          },
          pages: {
            homepage: { score: 90, issues: ['slow_image_load'] },
            products: { score: 85, issues: ['missing_alt_text', 'large_image'] },
            checkout: { score: 88, issues: ['form_validation'] }
          },
        },
      }),
      prisma.diagnosticsRun.create({
        data: {
          projectId: project.id,
          status: 'PENDING',
          startedAt: new Date(Date.now() - 1 * 60 * 60 * 1000), // 1 hour ago
        },
      }),
      prisma.diagnosticsRun.create({
        data: {
          projectId: project.id,
          status: 'FAILED',
          startedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
          finishedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 + 30 * 60 * 1000), // 30 min later
          summary: {
            error: 'Shopify API rate limit exceeded',
            retry_after: 3600
          },
        },
      }),
    ]);
    
    diagnosticsRuns.push(...projectDiagnostics);
  }
  
  console.log(`✅ Created ${diagnosticsRuns.length} diagnostics runs`);
  return diagnosticsRuns;
}

async function createChatSessions(projects: any[]) {
  console.log('💬 Creating chat sessions...');
  
  const chatSessions = [];
  
  for (const project of projects) {
    const session = await prisma.chatSession.create({
      data: {
        projectId: project.id,
        status: 'ACTIVE',
      },
    });
    
    // Add some messages to the session
    await prisma.chatMessage.createMany({
      data: [
        {
          sessionId: session.id,
          role: 'USER',
          content: { text: 'How can I improve my conversion rate?' },
        },
        {
          sessionId: session.id,
          role: 'AGENT',
          content: { 
            text: 'I can help you with that! Let me analyze your current experiments and suggest some improvements.',
            suggestions: ['Run A/B test on checkout flow', 'Optimize product page CTAs']
          },
        },
        {
          sessionId: session.id,
          role: 'USER',
          content: { text: 'What about the homepage hero section?' },
        },
        {
          sessionId: session.id,
          role: 'AGENT',
          content: { 
            text: 'Great idea! I see you have a "Homepage Hero Test" experiment in draft. Would you like me to help you set it up?',
            actions: ['review_experiment', 'publish_experiment']
          },
        },
      ],
    });
    
    chatSessions.push(session);
  }
  
  console.log(`✅ Created ${chatSessions.length} chat sessions with messages`);
  return chatSessions;
}

async function main() {
  const shouldReset = process.argv.includes('--reset') || process.argv.includes('-r');
  
  try {
    console.log('🌱 Starting database seeding...');
    
    if (shouldReset) {
      await clearDatabase();
    }
    
    const users = await createUsers();
    const projects = await createProjects(users);
    const experiments = await createExperiments(projects);
    const diagnosticsRuns = await createDiagnosticsRuns(projects);
    const chatSessions = await createChatSessions(projects);
    
    console.log('\n🎉 Seeding completed successfully!');
    console.log(`📊 Summary:`);
    console.log(`   - Users: ${users.length}`);
    console.log(`   - Projects: ${projects.length}`);
    console.log(`   - Experiments: ${experiments.length}`);
    console.log(`   - Diagnostics Runs: ${diagnosticsRuns.length}`);
    console.log(`   - Chat Sessions: ${chatSessions.length}`);
    console.log('\n💡 You can now test the API with this dummy data!');
    
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run if called directly
if (require.main === module) {
  main();
}
