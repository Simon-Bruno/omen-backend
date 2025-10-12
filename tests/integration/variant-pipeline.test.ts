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

import { createVariantGenerationService } from '../../src/features/variant_generation/variant-generation';
import { createHypothesesGenerationService } from '../../src/features/hypotheses_generation/hypotheses-generation';
import { createPlaywrightCrawler } from '../../src/features/crawler';
import { createScreenshotStorageService } from '../../src/services/screenshot-storage';
import { getServiceConfig } from '../../src/infra/config/services';
import { prisma } from '../../src/infra/prisma';
import { ProjectDAL } from '../../src/infra/dal';
import { DEMO_CONDITION } from '../../src/shared/demo-config';

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

        // Step 3: Use hardcoded hypothesis for faster testing
        console.log('\n🎯 Step 3: Using hardcoded hypothesis...');

        // Alternative hypothesis example (more specific):
        // const hypothesis = {
        //     title: "Add Customer Testimonials Section",
        //     description: "Adding a customer testimonials section will increase trust and conversion rates by showcasing social proof.",
        //     current_problem: "The homepage lacks social proof and customer validation, making it harder for new visitors to trust the brand and make a purchase decision.",
        //     predicted_lift_range: {
        //         min: 0.1,
        //         max: 0.3
        //     }
        // };

        const hypothesis = {
            title: "Transform the hero section into a modern, engaging experience",
            description: "The current hero section feels bland and doesn't capture attention. We need to completely redesign it with modern visual elements, better typography hierarchy, and compelling visual design that makes visitors want to explore more.",
            current_problem: "The hero section lacks visual impact and fails to create excitement or emotional connection with visitors.",
            predicted_lift_range: {
                min: 0.15,
                max: 0.35
            }
        };

        console.log('\n✅ Using hardcoded hypothesis:');
        console.log(`  • Title: ${hypothesis.title}`);
        console.log(`  • Description: ${hypothesis.description}`);
        console.log(`  • Problem: ${hypothesis.current_problem}`);
        console.log(`  • Expected Lift: ${hypothesis.predicted_lift_range.min}-${hypothesis.predicted_lift_range.max}%`);

        // Step 4: Generate variant ideas
        console.log('\n🎨 Step 4: Generating variant ideas...');

        const variantResult = await variantService.generateVariants(hypothesis, projectId);
        const variantIdeas = variantResult.variants;
        const injectionPoints = variantResult.injectionPoints;
        const screenshot = variantResult.screenshot;
        const brandAnalysisFromVariants = variantResult.brandAnalysis;
        const designSystem = variantResult.designSystem;

        console.log(`✅ Generated ${variantIdeas.length} variant ideas`);
        console.log(`  • Injection points found: ${injectionPoints.length}`);
        console.log(`  • Screenshot: ${screenshot ? 'Available' : 'Not available'}`);
        console.log(`  • Brand analysis: ${brandAnalysisFromVariants ? 'Available' : 'Not available'}`);
        console.log(`  • Design system: ${designSystem ? 'Available' : 'Not available'}`);

        // Step 5: Generate code for the first variant only (for faster testing)
        console.log('\n💻 Step 5: Generating code for first variant only...');

        const variants: any[] = [];
        const variantIdea = variantIdeas[0]; // Only process the first variant
        console.log(`  • Generating code for variant: ${variantIdea.variant_label}`);

        try {
            // Set design system in code generator before generating code
            variantService.codeGenerator.setDesignSystem(designSystem);

            const codeResult = await variantService.codeGenerator.generateCode(
                variantIdea,
                hypothesis,
                brandAnalysisFromVariants,
                screenshot,
                injectionPoints
            );

            // Combine variant idea with generated code
            const finalVariant = {
                ...variantIdea,
                javascript_code: codeResult?.javascript_code || '',
                execution_timing: codeResult?.execution_timing || 'dom_ready',
                target_selector: codeResult?.target_selector || '',
                implementation_instructions: codeResult?.implementation_instructions || variantIdea.description,
            };

            variants.push(finalVariant);
            console.log(`    ✅ Code generated (${codeResult?.javascript_code?.length || 0} chars)`);
        } catch (error) {
            console.log(`    ❌ Failed to generate code: ${error instanceof Error ? error.message : 'Unknown error'}`);
            // Still add the variant idea without code
            variants.push({
                ...variantIdea,
                javascript_code: '',
                execution_timing: 'dom_ready',
                target_selector: '',
                implementation_instructions: variantIdea.description,
            });
        }

        console.log(`✅ Generated code for ${variants.length} variant (testing with first variant only)`);

        // Step 6: Display results and save JavaScript code
        console.log('\n📊 Step 6: Results\n');
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

        // Step 7: Save results to file
        console.log('\n💾 Step 7: Saving results...');
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
                totalVariantIdeas: variantIdeas.length,
                hasJavaScriptCode: variants.every((v: any) => v.javascript_code),
                targetSelectors: variants.map((v: any) => v.target_selector).filter(Boolean),
                averageCodeLength: Math.round(
                    variants.reduce((sum: number, v: any) => sum + (v.javascript_code?.length || 0), 0) / variants.length
                )
            }
        };

        fs.writeFileSync(outputFile, JSON.stringify(testResults, null, 2));
        console.log(`✅ Results saved to: ${outputFile}`);

        // Step 8: Validate JavaScript code
        console.log('\n✅ Step 8: Validating JavaScript...');
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

        // Step 9: Save JavaScript code to separate file
        console.log('\n💾 Step 9: Saving JavaScript code...');
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
        console.log(`  • Variant Ideas Generated: ${variantIdeas.length}`);
        console.log(`  • Variants with Code: ${variants.length} (testing first variant only)`);
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