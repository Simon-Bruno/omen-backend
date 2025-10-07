#!/usr/bin/env ts-node

/**
 * Test script for the hypothesis → variant → code generation pipeline
 *
 * Usage:
 *   # Test with a specific project from database
 *   TEST_PROJECT_ID=your-project-id npx ts-node src/test-variant-pipeline.ts
 *
 *   # List available projects and pick one
 *   npx ts-node src/test-variant-pipeline.ts
 *
 * This script tests the complete pipeline using real projects from the database
 */

import { createVariantGenerationService } from './features/variant_generation/variant-generation';
import { createHypothesesGenerationService } from './features/hypotheses_generation/hypotheses-generation';
import { createPlaywrightCrawler } from './features/crawler';
import { createScreenshotStorageService } from './services/screenshot-storage';
import { getServiceConfig } from './infra/config/services';
import { prisma } from './infra/prisma';
import { ProjectDAL } from './infra/dal';
import { DEMO_CONDITION } from './shared/demo-config';

async function selectProject(): Promise<string> {
    // If project ID is provided via env, use it
    if (process.env.TEST_PROJECT_ID) {
        console.log(`📌 Using project ID from environment: ${process.env.TEST_PROJECT_ID}`);
        return process.env.TEST_PROJECT_ID;
    }

    // Otherwise, list available projects
    console.log('📋 Fetching available projects from database...\n');
    const projects = await prisma.project.findMany({
        select: {
            id: true,
            shopDomain: true,
            createdAt: true
        },
        orderBy: {
            createdAt: 'desc'
        }
    });

    if (projects.length === 0) {
        throw new Error('No projects found in database. Please create a project first.');
    }

    console.log('Available projects:');
    console.log('─'.repeat(60));
    projects.forEach((project, index) => {
        console.log(`${index + 1}. ${project.shopDomain}`);
        console.log(`   ID: ${project.id}`);
        console.log(`   Created: ${project.createdAt.toLocaleDateString()}`);
        console.log('');
    });

    // Use the most recent project by default
    const selectedProject = projects[0];
    console.log(`➡️  Auto-selecting most recent project: ${selectedProject.shopDomain}`);
    console.log(`   (Set TEST_PROJECT_ID env variable to use a specific project)\n`);

    return selectedProject.id;
}

async function testPipeline() {
    console.log('🚀 Starting Variant Generation Pipeline Test\n');
    console.log('='.repeat(60));

    try {
        // Step 1: Select project
        console.log('\n📁 Step 1: Selecting project...');
        const projectId = await selectProject();

        // Fetch full project details
        const project = await ProjectDAL.getProjectById(projectId);
        if (!project) {
            throw new Error(`Project not found: ${projectId}`);
        }

        console.log('✅ Project loaded:');
        console.log(`  • Domain: ${project.shopDomain}`);
        console.log(`  • ID: ${project.id}`);

        // Check if brand analysis exists
        const brandAnalysis = await ProjectDAL.getProjectBrandAnalysis(projectId);
        if (!brandAnalysis) {
            console.log('\n⚠️  Warning: No brand analysis found for this project');
            console.log('   Run brand analysis first for better results');
        } else {
            console.log(`  • Brand Analysis: ✅ Available (${brandAnalysis.length} chars)`);
        }

        // Step 2: Initialize services
        console.log('\n📦 Step 2: Initializing services...');
        const config = getServiceConfig();
        const crawler = createPlaywrightCrawler(config.crawler);
        const screenshotStorage = createScreenshotStorageService();
        const variantService = createVariantGenerationService(crawler, screenshotStorage, prisma);
        const hypothesesService = createHypothesesGenerationService(crawler, prisma);

        console.log('✅ Services initialized');
        console.log(`  • Demo Mode: ${DEMO_CONDITION ? 'ENABLED' : 'DISABLED'}`);

        // Step 3: Generate hypothesis from the project URL
        console.log('\n🎯 Step 3: Generating hypothesis...');

        // Build URL from shop domain
        const url = project.shopDomain.startsWith('http')
            ? project.shopDomain
            : `https://${project.shopDomain}`;

        console.log(`  • URL: ${url}`);
        console.log('  • Generating hypothesis from homepage...');

        const hypothesisResult = await hypothesesService.generateHypotheses(url, projectId);
        const hypotheses = JSON.parse(hypothesisResult.hypothesesSchema);
        const hypothesis = hypotheses.hypotheses[0];

        console.log('\n✅ Generated hypothesis:');
        console.log(`  • Title: ${hypothesis.title}`);
        console.log(`  • Description: ${hypothesis.description}`);
        console.log(`  • Problem: ${hypothesis.current_problem}`);
        console.log(`  • Expected Lift: ${hypothesis.predicted_lift_range.min}-${hypothesis.predicted_lift_range.max}%`);

        // Display all generated hypotheses
        if (hypotheses.hypotheses.length > 1) {
            console.log(`\n  (Generated ${hypotheses.hypotheses.length} total hypotheses, using the first one)`);
        }

        // Step 4: Generate variants
        console.log('\n🎨 Step 4: Generating variants...');

        const variantResult = await variantService.generateVariants(hypothesis, projectId);
        const variants = JSON.parse(variantResult.variantsSchema).variants;

        console.log(`✅ Generated ${variants.length} variants`);

        // Step 5: Display results and save JavaScript code
        console.log('\n📊 Step 5: Results\n');
        console.log('='.repeat(60));

        // Create output directory if it doesn't exist
        const fs = require('fs');
        const path = require('path');
        const outputDir = path.join(process.cwd(), 'test-output');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        // Generate timestamp for unique filenames
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

        variants.forEach((variant: any, index: number) => {
            console.log(`\n🔹 Variant ${index + 1}: ${variant.variant_label}`);
            console.log('  Description:', variant.description);
            console.log('  Rationale:', variant.rationale);
            console.log('  Target Selector:', variant.target_selector || 'Not specified');
            console.log('  Execution Timing:', variant.execution_timing || 'dom_ready');

            if (variant.javascript_code) {
                console.log('\n  📄 JavaScript Code Preview:');
                console.log('  ' + '─'.repeat(40));
                const codePreview = variant.javascript_code
                    .split('\n')
                    .slice(0, 10)
                    .map((line: string) => '  ' + line)
                    .join('\n');
                console.log(codePreview);
                if (variant.javascript_code.split('\n').length > 10) {
                    console.log('  ... (truncated, ' + variant.javascript_code.length + ' chars total)');
                }
                console.log('  ' + '─'.repeat(40));
            } else {
                console.log('\n  ⚠️  No JavaScript code generated');
            }
        });

        // Step 6: Save results to file
        console.log('\n💾 Step 6: Saving results...');
        const outputFile = `${outputDir}/variant-test-${timestamp}.json`;

        const testResults = {
            timestamp: new Date().toISOString(),
            project: {
                id: project.id,
                shopDomain: project.shopDomain,
                hasBrandAnalysis: !!brandAnalysis
            },
            demoMode: DEMO_CONDITION,
            hypothesis,
            variants,
            summary: {
                totalVariants: variants.length,
                hasJavaScriptCode: variants.every((v: any) => v.javascript_code),
                targetSelectors: variants.map((v: any) => v.target_selector).filter(Boolean),
                averageCodeLength: Math.round(
                    variants.reduce((sum: number, v: any) => sum + (v.javascript_code?.length || 0), 0) / variants.length
                )
            }
        };

        fs.writeFileSync(outputFile, JSON.stringify(testResults, null, 2));
        console.log(`✅ Results saved to: ${outputFile}`);

        // Step 7: Validate JavaScript code
        console.log('\n✅ Step 7: Validating JavaScript...');
        let validCount = 0;
        let invalidCount = 0;

        variants.forEach((variant: any, index: number) => {
            if (variant.javascript_code) {
                try {
                    // Basic syntax check
                    new Function(variant.javascript_code);
                    validCount++;
                    console.log(`  ✓ Variant ${index + 1} JavaScript is valid`);
                } catch (error: any) {
                    invalidCount++;
                    console.log(`  ✗ Variant ${index + 1} JavaScript has syntax error:`, error.message);
                }
            }
        });

        console.log(`\n  Summary: ${validCount} valid, ${invalidCount} invalid`);

        // Step 8: Save JavaScript code to separate file
        console.log('\n💾 Step 8: Saving JavaScript code...');
        const jsCodeContent = variants
            .filter((variant: any) => variant.javascript_code)
            .map((variant: any, index: number) => {
                return `// ========================================
// Variant ${index + 1}: ${variant.variant_label}
// ========================================
// Description: ${variant.description}
// Target Selector: ${variant.target_selector || 'Not specified'}
// Execution Timing: ${variant.execution_timing || 'dom_ready'}
// ========================================

${variant.javascript_code}

// ========================================
// End of Variant ${index + 1}
// ========================================

`;
            })
            .join('\n');

        if (jsCodeContent.trim()) {
            const jsOutputFile = `${outputDir}/variant-js-${timestamp}.js`;
            fs.writeFileSync(jsOutputFile, jsCodeContent);
            console.log(`✅ JavaScript code saved to: ${jsOutputFile}`);
            console.log('\n📋 You can copy and paste the JavaScript code from the file above!');
        } else {
            console.log('⚠️  No JavaScript code to save');
        }

        // Clean up
        console.log('\n🧹 Cleaning up...');
        await crawler.close();
        await prisma.$disconnect();

        console.log('\n' + '='.repeat(60));
        console.log('✨ Pipeline test completed successfully!');
        console.log('='.repeat(60));

        // Display quick stats
        console.log('\n📈 Quick Stats:');
        console.log(`  • Project: ${project.shopDomain}`);
        console.log(`  • Hypothesis: "${hypothesis.title}"`);
        console.log(`  • Variants Generated: ${variants.length}`);
        console.log(`  • Average Code Length: ${testResults.summary.averageCodeLength} chars`);
        console.log(`  • Demo Mode: ${DEMO_CONDITION ? 'ON' : 'OFF'}`);
        console.log(`  • Brand Analysis: ${brandAnalysis ? 'YES' : 'NO'}`);

    } catch (error) {
        console.error('\n❌ Pipeline test failed:', error);
        console.error('\nStack trace:', error instanceof Error ? error.stack : 'No stack trace available');

        // Clean up on error
        await prisma.$disconnect();
        process.exit(1);
    }
}

// Run the test
if (require.main === module) {
    console.log('Starting variant generation pipeline test...\n');

    testPipeline()
        .then(() => {
            console.log('\n👋 Test completed. Exiting...');
            process.exit(0);
        })
        .catch((error) => {
            console.error('Fatal error:', error);
            process.exit(1);
        });
}

// Export for use in other tests
export { testPipeline };