#!/usr/bin/env tsx

/**
 * Database Optimization Script
 * Creates indexes, materialized views, and analyzes query performance
 */

import chalk from 'chalk';
import ora from 'ora';
import { PrismaClient } from '@prisma/client';
import { QueryOptimizer } from '../lib/db/query-optimizer';

const prisma = new PrismaClient();

async function main() {
  console.log(chalk.bold.cyan('\n🚀 Database Optimization Script\n'));
  console.log(chalk.gray('═'.repeat(60)));
  
  const optimizer = new QueryOptimizer(prisma);
  
  try {
    // Step 1: Analyze current performance
    console.log(chalk.bold.yellow('\n📊 Analyzing Current Performance\n'));
    const spinner1 = ora('Analyzing slow queries...').start();
    
    try {
      const slowQueries = await optimizer.analyzeSlowQueries();
      spinner1.succeed(`Found ${slowQueries.length} slow queries`);
      
      if (slowQueries.length > 0) {
        console.log('\nSlow Queries:');
        slowQueries.slice(0, 5).forEach(q => {
          console.log(chalk.gray('─'.repeat(40)));
          console.log(`Query: ${chalk.cyan(q.query.substring(0, 100))}...`);
          console.log(`Avg Time: ${chalk.yellow(q.avgTime.toFixed(2))}ms`);
          console.log(`Calls: ${q.calls}`);
          if (q.suggestions.length > 0) {
            console.log('Suggestions:');
            q.suggestions.forEach(s => console.log(`  • ${s}`));
          }
        });
      }
    } catch (error) {
      spinner1.fail('Failed to analyze queries');
      console.error(error);
    }
    
    // Step 2: Create indexes
    console.log(chalk.bold.yellow('\n🔧 Creating Performance Indexes\n'));
    const spinner2 = ora('Creating indexes...').start();
    
    try {
      await optimizer.createIndexes();
      spinner2.succeed('Indexes created successfully');
    } catch (error) {
      spinner2.fail('Failed to create some indexes');
      console.error(error);
    }
    
    // Step 3: Create materialized views
    console.log(chalk.bold.yellow('\n📈 Creating Materialized Views\n'));
    const spinner3 = ora('Creating materialized views...').start();
    
    try {
      await optimizer.implementMaterializedViews();
      spinner3.succeed('Materialized views created successfully');
    } catch (error) {
      spinner3.fail('Failed to create materialized views');
      console.error(error);
    }
    
    // Step 4: Refresh materialized views
    console.log(chalk.bold.yellow('\n🔄 Refreshing Materialized Views\n'));
    const spinner4 = ora('Refreshing views...').start();
    
    try {
      await optimizer.refreshMaterializedViews();
      spinner4.succeed('Views refreshed successfully');
    } catch (error) {
      spinner4.fail('Failed to refresh views');
      console.error(error);
    }
    
    // Step 5: Analyze table sizes
    console.log(chalk.bold.yellow('\n📦 Analyzing Table Sizes\n'));
    await optimizer.analyzeTableSizes();
    
    // Step 6: Check index usage
    console.log(chalk.bold.yellow('\n📊 Checking Index Usage\n'));
    await optimizer.getIndexUsage();
    
    // Step 7: Optimize tables (VACUUM and ANALYZE)
    console.log(chalk.bold.yellow('\n🧹 Optimizing Tables\n'));
    const spinner5 = ora('Running VACUUM and ANALYZE...').start();
    
    try {
      await optimizer.optimizeTables();
      spinner5.succeed('Table optimization complete');
    } catch (error) {
      spinner5.fail('Failed to optimize tables');
      console.error(error);
    }
    
    // Summary
    console.log(chalk.bold.green('\n✨ Database Optimization Complete!\n'));
    console.log(chalk.gray('═'.repeat(60)));
    
    console.log('\n' + chalk.bold.cyan('Next Steps:'));
    console.log('1. Run the benchmark script to measure improvements:');
    console.log(chalk.gray('   npm run bench'));
    console.log('2. Monitor slow queries in production');
    console.log('3. Schedule regular materialized view refreshes');
    console.log('4. Consider partitioning large tables if needed');
    
  } catch (error) {
    console.error(chalk.red('\n❌ Optimization failed:'), error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Add to package.json scripts:
// "db:optimize": "tsx scripts/optimize-database.ts"

main();