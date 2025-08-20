#!/usr/bin/env tsx
// Refresh Materialized Views Script
// Sprint 6: Statistics Engine - Manual refresh of materialized views

import { PrismaClient } from '@prisma/client';
import ora from 'ora';
import chalk from 'chalk';

const prisma = new PrismaClient();

async function refreshMaterializedViews() {
  console.log(chalk.bold.blue('\n🔄 Materialized View Refresh\n'));
  
  const spinner = ora('Connecting to database...').start();
  
  try {
    await prisma.$connect();
    spinner.succeed('Connected to database');
    
    // Check if views exist
    spinner.start('Checking materialized views...');
    const views = await prisma.$queryRaw`
      SELECT 
        matviewname as name,
        pg_size_pretty(pg_total_relation_size(C.oid)) as size,
        last_refresh.last_refresh_time
      FROM pg_matviews M
      JOIN pg_class C ON M.matviewname = C.relname
      LEFT JOIN LATERAL (
        SELECT MAX(s.last_refresh) as last_refresh_time
        FROM pg_stat_user_tables s
        WHERE s.relname = M.matviewname
      ) last_refresh ON true
      WHERE M.matviewname IN ('mv_season_statistics', 'mv_h2h_summary')
    ` as any[];
    
    if (views.length === 0) {
      spinner.fail('No materialized views found');
      console.log(chalk.yellow('\n⚠️  Materialized views do not exist. Run migrations first.\n'));
      process.exit(1);
    }
    
    spinner.succeed(`Found ${views.length} materialized views`);
    
    console.log(chalk.gray('\nCurrent view information:'));
    views.forEach(view => {
      console.log(`  - ${chalk.cyan(view.name)}: ${view.size}`);
    });
    
    // Refresh mv_season_statistics
    spinner.start('Refreshing mv_season_statistics...');
    const startTime1 = Date.now();
    await prisma.$executeRaw`REFRESH MATERIALIZED VIEW CONCURRENTLY mv_season_statistics`;
    const duration1 = Date.now() - startTime1;
    spinner.succeed(`Refreshed mv_season_statistics (${duration1}ms)`);
    
    // Refresh mv_h2h_summary
    spinner.start('Refreshing mv_h2h_summary...');
    const startTime2 = Date.now();
    await prisma.$executeRaw`REFRESH MATERIALIZED VIEW CONCURRENTLY mv_h2h_summary`;
    const duration2 = Date.now() - startTime2;
    spinner.succeed(`Refreshed mv_h2h_summary (${duration2}ms)`);
    
    // Get row counts
    const counts = await prisma.$queryRaw`
      SELECT 
        'mv_season_statistics' as view_name,
        COUNT(*) as row_count
      FROM mv_season_statistics
      UNION ALL
      SELECT 
        'mv_h2h_summary' as view_name,
        COUNT(*) as row_count
      FROM mv_h2h_summary
    ` as any[];
    
    console.log(chalk.green('\n✅ Materialized views refreshed successfully!\n'));
    console.log(chalk.gray('View statistics:'));
    counts.forEach(count => {
      console.log(`  - ${chalk.cyan(count.view_name)}: ${count.row_count} rows`);
    });
    
    const totalTime = duration1 + duration2;
    console.log(chalk.gray(`\nTotal refresh time: ${totalTime}ms\n`));
    
  } catch (error) {
    spinner.fail('Failed to refresh materialized views');
    console.error(chalk.red('\n❌ Error:'), error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Handle command line arguments
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(chalk.bold('\nMaterialized View Refresh Script\n'));
  console.log('Usage: npm run stats:refresh-views\n');
  console.log('This script refreshes the statistics materialized views concurrently,');
  console.log('allowing queries to continue while the refresh is in progress.\n');
  process.exit(0);
}

// Run the refresh
refreshMaterializedViews().catch(console.error);