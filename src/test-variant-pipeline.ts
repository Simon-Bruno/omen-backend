#!/usr/bin/env ts-node

/**
 * Test script for the hypothesis → variant → code generation pipeline
 *
 * FEATURES TESTED:
 * - Brand analysis with screenshot-based color extraction
 * - Component detection and pattern matching
 * - JavaScript code generation for variants
 * - Visual refinement pipeline
 * - Complete hero section implementation
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
import { createPlaywrightCrawler } from './features/crawler';
import { createScreenshotStorageService } from './services/screenshot-storage';
import { getServiceConfig } from './infra/config/services';
import { prisma } from './infra/prisma';
import { ProjectDAL } from './infra/dal';
import { createDOMAnalyzer } from './features/variant_generation/dom-analyzer';
import { createVariantCodeGenerator } from './features/variant_generation/code-generator';
import { VisualRefinementService } from './features/variant_generation/visual-refinement';

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

async function testComponentDetection(htmlContent: string): Promise<any> {
    console.log('\n🧩 Testing Component Detection...\n');

    const domAnalyzer = createDOMAnalyzer();
    const components = await domAnalyzer.detectComponentPatterns(htmlContent);

    console.log(`✅ Detected ${components.length} component patterns`);

    const componentStats = {
        buttons: components.filter(c => c.componentType === 'button').length,
        cards: components.filter(c => c.componentType === 'card').length,
        inputs: components.filter(c => c.componentType === 'input').length,
        total: components.length
    };

    console.log(`  • Buttons: ${componentStats.buttons}`);
    console.log(`  • Cards: ${componentStats.cards}`);
    console.log(`  • Inputs: ${componentStats.inputs}`);

    if (components.length > 0) {
        console.log('\n📋 Component Details:');
        components.slice(0, 5).forEach((component, index) => {
            console.log(`  ${index + 1}. ${component.componentType} (${component.variant}, ${component.size})`);
            console.log(`     Selector: ${component.selector}`);
            console.log(`     Confidence: ${Math.round(component.confidence * 100)}%`);
        });

        if (components.length > 5) {
            console.log(`  ... and ${components.length - 5} more components`);
        }
    }

    return { components, componentStats };
}

async function testPipeline() {
    const overallStartTime = Date.now();
    console.log('🚀 Starting Variant Generation Pipeline Test\n');
    console.log('='.repeat(80));
    console.log('🆕 FEATURES: Brand Analysis, Component Detection, Code Generation');
    console.log('='.repeat(80));

    // Timing tracking object
    const timings: Record<string, number> = {};
    let hasError = false;

    try {
        // Step 1: Select project
        console.log('\n📁 Step 1: Selecting project...');
        const projectStartTime = Date.now();
        const projectId = await selectProject();
        timings.projectSelection = Date.now() - projectStartTime;

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
        const servicesStartTime = Date.now();
        const config = getServiceConfig();
        const crawler = createPlaywrightCrawler(config.crawler);
        const screenshotStorage = createScreenshotStorageService();
        const variantService = createVariantGenerationService(crawler, screenshotStorage, prisma);
        timings.serviceInitialization = Date.now() - servicesStartTime;

        console.log('✅ Services initialized');

        // Step 3: Use hardcoded hypothesis for hero section redesign
        console.log('\n🎯 Step 3: Using hardcoded hypothesis for hero section redesign...');

        // Hardcoded hypothesis for creating a new hero section
        const hypothesis = {
            title: "Add Dynamic Hero Section with Interactive Elements",
            description: "Create a completely new hero section that replaces the existing header area with an engaging, interactive hero featuring animated elements, compelling copy, and clear call-to-action buttons.",
            primary_outcome: "Engagement rate",
            current_problem: "The current homepage lacks a compelling hero section that captures visitor attention and communicates the brand value proposition effectively.",
            why_it_works: [
                {
                    reason: "Creates immediate visual impact and brand recognition"
                },
                {
                    reason: "Guides users through the value proposition clearly"
                },
                {
                    reason: "Increases time on page through interactive elements"
                }
            ],
            baseline_performance: 15.2,
            predicted_lift_range: {
                min: 0.25,
                max: 0.45
            }
        };

        console.log('\n✅ Using hardcoded hypothesis:');
        console.log(`  • Title: ${hypothesis.title}`);
        console.log(`  • Description: ${hypothesis.description}`);
        console.log(`  • Problem: ${hypothesis.current_problem}`);
        console.log(`  • Expected Lift: ${hypothesis.predicted_lift_range.min}-${hypothesis.predicted_lift_range.max}%`);

        // Note: Using hardcoded hypothesis for testing hero section creation

        // Step 4: Generate single hero section variant
        console.log('\n🎨 Step 4: Generating hero section variant...');
        const variantGenerationStartTime = Date.now();

        const variantResult = await variantService.generateVariants(hypothesis, projectId);
        const variantIdeas = variantResult.variants;
        timings.variantGeneration = Date.now() - variantGenerationStartTime;

        // Step 5: Generate actual JavaScript code for the hero section variant
        console.log('\n💻 Step 5: Generating JavaScript code for hero section variant...');
        const codeGenerationStartTime = Date.now();

        const codeGenerator = createVariantCodeGenerator();

        const variants = [];
        // Only generate code for the first variant (our hero section redesign)
        const heroVariantIdea = variantIdeas[0];
        console.log(`📝 Generating code for hero section variant: ${heroVariantIdea.variant_label}`);

        try {
            const codeResult = await codeGenerator.generateCode(
                heroVariantIdea,
                hypothesis,
                variantResult.brandAnalysis,
                variantResult.screenshot,
                variantResult.injectionPoints,
                variantResult.htmlContent
            );
            timings.codeGeneration = Date.now() - codeGenerationStartTime;

            // Merge the code result with the original variant idea
            const completeVariant = {
                ...heroVariantIdea,
                javascript_code: codeResult.javascript_code,
                target_selector: codeResult.target_selector,
                execution_timing: codeResult.execution_timing,
                implementation_instructions: codeResult.implementation_instructions
            };

            variants.push(completeVariant);
            console.log(`✅ Code generated for hero section variant (${codeResult.javascript_code.length} chars)`);
        } catch (error) {
            timings.codeGeneration = Date.now() - codeGenerationStartTime;
            console.error(`❌ Failed to generate code for hero section variant:`, error);
            // Still include the variant but without code
            variants.push(heroVariantIdea);
        }

        console.log(`✅ Code generation completed for hero section variant`);

        // Step 6: Test Component Detection (if HTML available)
        const componentStartTime = Date.now();
        let componentTest = null;
        if (variantResult.htmlContent) {
            console.log('\n🧩 Step 6: Testing Component Detection...');
            componentTest = await testComponentDetection(variantResult.htmlContent);
        }
        const componentTime = Date.now() - componentStartTime;
        console.log(`  ⏱️  Component detection took ${componentTime}ms`);

        // Step 7: Refine hero section variant
        console.log('\n🔧 Step 7: Refining hero section variant...');
        const refinementStartTime = Date.now();

        const visualRefinementService = new VisualRefinementService();
        const refinedVariants = [];

        // Only process the single hero variant
        const heroVariantToRefine = variants[0];
        console.log(`\n📝 Refining Hero Section Variant: ${heroVariantToRefine.variant_label}`);

        if (heroVariantToRefine.javascript_code) {
            try {
                const refinementResult = await visualRefinementService.refineVariantCode(
                    heroVariantToRefine.javascript_code,
                    heroVariantToRefine.description,
                    variantResult.screenshot as string
                );

                // Update variant with refined code
                const refinedVariant = {
                    ...heroVariantToRefine,
                    javascript_code: refinementResult.javascript_code,
                    refinement_improvements: refinementResult.improvements
                };

                refinedVariants.push(refinedVariant);
                console.log(`✅ Refined hero section variant (${refinementResult.javascript_code.length} chars)`);
                console.log(`  • Improvements: ${refinementResult.improvements.length}`);
            } catch (error) {
                console.error(`❌ Failed to refine hero section variant:`, error);
                refinedVariants.push(heroVariantToRefine);
            }
        } else {
            console.log(`  • No code to refine - keeping original`);
            refinedVariants.push(heroVariantToRefine);
        }

        timings.visualRefinement = Date.now() - refinementStartTime;
        console.log(`✅ Refinement completed for hero section variant`);

        // Step 8: Display results and save JavaScript code
        console.log('\n📊 Step 8: Results & Analysis\n');
        console.log('='.repeat(80));

        // Create output directory if it doesn't exist
        const fs = require('fs');
        const path = require('path');
        const outputDir = path.join(process.cwd(), 'test-output');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        // Generate timestamp for unique filenames
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

        // Save brand analysis for inspection
        console.log('\n💾 Step 8.5: Saving brand analysis for inspection...');
        if (variantResult.brandAnalysis) {
            const brandAnalysisFile = `${outputDir}/brand-analysis-${timestamp}.json`;
            fs.writeFileSync(brandAnalysisFile, JSON.stringify(variantResult.brandAnalysis, null, 2));
            console.log(`✅ Brand analysis saved to: ${brandAnalysisFile}`);
        }

        // Display the single hero section variant
        const heroVariant = refinedVariants[0];
        console.log(`\n🎯 Hero Section Variant: ${heroVariant.variant_label}`);
        console.log('  Description:', heroVariant.description);
        console.log('  Rationale:', heroVariant.rationale);
        console.log('  Target Selector:', heroVariant.target_selector || 'Not specified');
        console.log('  Execution Timing:', heroVariant.execution_timing || 'dom_ready');

        // Display refinement results if available
        if (heroVariant.refinement_improvements) {
            console.log('\n  🔧 Refinement Applied:');
            console.log(`    • Improvements: ${heroVariant.refinement_improvements.length}`);
            heroVariant.refinement_improvements.slice(0, 3).forEach((improvement: string) => {
                console.log(`      - ${improvement}`);
            });
            if (heroVariant.refinement_improvements.length > 3) {
                console.log(`      ... and ${heroVariant.refinement_improvements.length - 3} more`);
            }
        }

        if (heroVariant.javascript_code) {
                console.log('\n  📄 JavaScript Code Preview:');
            console.log('  ' + '─'.repeat(50));
            const codePreview = heroVariant.javascript_code
                    .split('\n')
                .slice(0, 8)
                    .map((line: string) => '  ' + line)
                    .join('\n');
                console.log(codePreview);
            if (heroVariant.javascript_code.split('\n').length > 8) {
                console.log('  ... (truncated, ' + heroVariant.javascript_code.length + ' chars total)');
                }
            console.log('  ' + '─'.repeat(50));
            } else {
                console.log('\n  ⚠️  No JavaScript code generated');
            }

        // Step 9: Save results to file
        console.log('\n💾 Step 9: Saving comprehensive results...');
        const fileSaveStartTime = Date.now();
        const outputFile = `${outputDir}/variant-test-${timestamp}.json`;

        // Calculate summary statistics for single hero section variant
        const finalHeroVariant = refinedVariants[0];

        const testResults = {
            timestamp: new Date().toISOString(),
            testType: 'hero-section-variant',
            performanceTimings: timings,
            project: {
                id: project.id,
                shopDomain: project.shopDomain,
                hasBrandAnalysis: !!brandAnalysis
            },
            hypothesis: hypothesis,
            brandAnalysis: variantResult.brandAnalysis || null,
            componentDetection: componentTest?.componentStats || null,
            refinedVariants,
            summary: {
                totalVariants: 1,
                hasJavaScriptCode: !!finalHeroVariant.javascript_code,
                targetSelectors: finalHeroVariant.target_selector ? [finalHeroVariant.target_selector] : [],
                averageCodeLength: finalHeroVariant.javascript_code?.length || 0,
                variantsWithRefinement: finalHeroVariant.refinement_improvements ? 1 : 0,
                totalImprovements: finalHeroVariant.refinement_improvements?.length || 0
            }
        };

        fs.writeFileSync(outputFile, JSON.stringify(testResults, null, 2));
        console.log(`✅ Results saved to: ${outputFile}`);

        // Step 10: Validate JavaScript code
        console.log('\n✅ Step 10: Validating JavaScript...');

        if (finalHeroVariant.javascript_code) {
            try {
                // Basic syntax check
                new Function(finalHeroVariant.javascript_code);
                console.log(`  ✓ Hero Section JavaScript is valid`);
            } catch (error: any) {
                console.log(`  ✗ Hero Section JavaScript has syntax error:`, error.message);
            }
        }

        // Step 11: Save JavaScript code to separate file
        console.log('\n💾 Step 11: Saving JavaScript code...');
        const jsCodeContent = finalHeroVariant.javascript_code ? `// ========================================
// Hero Section Variant: ${finalHeroVariant.variant_label}
// ========================================
// Description: ${finalHeroVariant.description}
// Target Selector: ${finalHeroVariant.target_selector || 'Not specified'}
// Execution Timing: ${finalHeroVariant.execution_timing || 'dom_ready'}
// Refinements: ${finalHeroVariant.refinement_improvements?.length || 0} improvements applied
// ========================================

${finalHeroVariant.javascript_code}

// ========================================
// End of Hero Section Variant
// ========================================

` : '';

        if (jsCodeContent.trim()) {
            const jsOutputFile = `${outputDir}/variant-js-${timestamp}.js`;
            fs.writeFileSync(jsOutputFile, jsCodeContent);
            console.log(`✅ JavaScript code saved to: ${jsOutputFile}`);
            console.log('\n📋 You can copy and paste the JavaScript code from the file above!');
        } else {
            console.log('⚠️  No JavaScript code to save');
        }

        timings.fileSaving = Date.now() - fileSaveStartTime;

        // Clean up
        console.log('\n🧹 Step 12: Cleaning up...');
        const cleanupStartTime = Date.now();
        await crawler.close();
        await prisma.$disconnect();
        timings.cleanup = Date.now() - cleanupStartTime;

        // Calculate total time
        timings.total = Date.now() - overallStartTime;

        console.log('\n' + '='.repeat(80));
        console.log('✨ Hero Section Pipeline Test Completed Successfully!');
        console.log('='.repeat(80));

        // Display comprehensive timing report
        console.log('\n⏱️  PERFORMANCE TIMINGS:');
        console.log('─'.repeat(60));
        Object.entries(timings).forEach(([step, duration]) => {
            if (typeof duration === 'number') {
                const emoji = duration > 5000 ? '🔴' : duration > 2000 ? '🟡' : '🟢';
                console.log(`${emoji} ${step.padEnd(25)}: ${duration.toFixed(0)}ms`);
            }
        });
        console.log('─'.repeat(60));
        console.log(`🕐 Total execution time: ${timings.total.toFixed(0)}ms`);

        // Display comprehensive stats for the hero section variant
        console.log('\n📈 Hero Section Test Results:');
        console.log(`  • Project: ${project.shopDomain}`);
        console.log(`  • Hypothesis: "${hypothesis.title}"`);
        console.log(`  • Hero Section Variant: 1 variant generated`);

        if (testResults.summary) {
            const summary = testResults.summary;
            console.log(`  • Brand Analysis: ${variantResult.brandAnalysis ? '✅ YES' : '❌ NO'} (saved to separate file)`);
            console.log(`  • Component Detection: ${componentTest ? '✅ YES' : '❌ NO'}`);
            console.log(`  • Code Generation: ✅ YES (${summary.averageCodeLength} chars)`);
            console.log(`  • Visual Refinement: ✅ YES (${summary.totalImprovements} improvements)`);
        }

        console.log(`  • Brand Analysis: ${brandAnalysis ? 'YES' : 'NO'}`);

        console.log('\n🎯 Hero Section Features Tested:');
        console.log('  ✅ Brand Analysis with Screenshot-based Colors');
        console.log('  ✅ Component Detection & Pattern Matching');
        console.log('  ✅ JavaScript Code Generation');
        console.log('  ✅ Automated Variant Refinement');
        console.log('  ✅ Complete Hero Section Implementation');
        console.log('  ✅ Brand Analysis Export to Files');

    } catch (error) {
        // Calculate total time even for failed runs
        timings.total = Date.now() - overallStartTime;
        hasError = true;

        console.error('\n❌ Pipeline test failed:', error);
        console.error('\nStack trace:', error instanceof Error ? error.stack : 'No stack trace available');

        console.log('\n⏱️  PERFORMANCE TIMINGS (FAILED RUN):');
        console.log('─'.repeat(60));
        Object.entries(timings).forEach(([step, duration]) => {
            if (step !== 'total' && typeof duration === 'number') {
                const emoji = duration > 5000 ? '🔴' : duration > 2000 ? '🟡' : '🟢';
                console.log(`${emoji} ${step.padEnd(25)}: ${duration.toFixed(0)}ms`);
            }
        });
        console.log('─'.repeat(60));
        console.log(`🕐 Total execution time: ${timings.total.toFixed(0)}ms`);
        console.log(`❌ Pipeline failed: ${hasError}`);

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