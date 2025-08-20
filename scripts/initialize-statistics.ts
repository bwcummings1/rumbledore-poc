#!/usr/bin/env tsx
// Statistics Initialization Script
// Sprint 6: Statistics Engine - Initialize statistics for all leagues

import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { StatisticsEngine } from '../lib/stats/statistics-engine';
import { CalculationType } from '../types/statistics';
import ora from 'ora';
import chalk from 'chalk';

const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
const statsEngine = new StatisticsEngine(process.env.REDIS_URL);

// Configuration
const CONFIG = {
  BATCH_SIZE: 5,           // Process leagues in batches
  DELAY_BETWEEN_BATCHES: 2000, // 2 seconds between batches
  SKIP_EXISTING: false,    // Skip leagues with existing statistics
};

// Track initialization progress
const progress = {
  totalLeagues: 0,
  processedLeagues: 0,
  successfulLeagues: 0,
  failedLeagues: 0,
  skippedLeagues: 0,
  errors: [] as any[],
};

/**
 * Main initialization function
 */
async function initializeStatistics() {
  console.log(chalk.bold.blue('\n🚀 Statistics Initialization Script\n'));
  console.log(chalk.gray('This script will initialize statistics for all leagues in the database.\n'));
  
  const spinner = ora('Connecting to database...').start();
  
  try {
    // Test connections
    await prisma.$connect();
    await redis.ping();
    spinner.succeed('Connected to database and Redis');
    
    // Get all leagues
    spinner.start('Fetching leagues...');
    const leagues = await prisma.league.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        espnLeagueId: true,
        _count: {
          select: {
            teams: true,
          },
        },
      },
    });
    
    progress.totalLeagues = leagues.length;
    spinner.succeed(`Found ${leagues.length} active leagues`);
    
    if (leagues.length === 0) {
      console.log(chalk.yellow('\n⚠️  No active leagues found. Nothing to initialize.\n'));
      return;
    }
    
    // Check for existing statistics if needed
    if (CONFIG.SKIP_EXISTING) {
      spinner.start('Checking for existing statistics...');
      const existingStats = await prisma.seasonStatistics.findMany({
        select: { leagueId: true },
        distinct: ['leagueId'],
      });
      
      const existingLeagueIds = new Set(existingStats.map(s => s.leagueId));
      const leaguesToProcess = leagues.filter(l => !existingLeagueIds.has(l.id));
      
      if (leaguesToProcess.length < leagues.length) {
        const skipped = leagues.length - leaguesToProcess.length;
        progress.skippedLeagues = skipped;
        spinner.info(`Skipping ${skipped} leagues with existing statistics`);
      }
    }
    
    console.log(chalk.bold('\n📊 Initialization Configuration:'));
    console.log(chalk.gray(`  - Batch Size: ${CONFIG.BATCH_SIZE}`));
    console.log(chalk.gray(`  - Delay Between Batches: ${CONFIG.DELAY_BETWEEN_BATCHES}ms`));
    console.log(chalk.gray(`  - Skip Existing: ${CONFIG.SKIP_EXISTING}\n`));
    
    // Process leagues in batches
    for (let i = 0; i < leagues.length; i += CONFIG.BATCH_SIZE) {
      const batch = leagues.slice(i, i + CONFIG.BATCH_SIZE);
      const batchNumber = Math.floor(i / CONFIG.BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(leagues.length / CONFIG.BATCH_SIZE);
      
      console.log(chalk.bold(`\n📦 Processing Batch ${batchNumber}/${totalBatches}`));
      
      await processBatch(batch);
      
      // Delay between batches (except for the last one)
      if (i + CONFIG.BATCH_SIZE < leagues.length) {
        spinner.start(`Waiting ${CONFIG.DELAY_BETWEEN_BATCHES}ms before next batch...`);
        await new Promise(resolve => setTimeout(resolve, CONFIG.DELAY_BETWEEN_BATCHES));
        spinner.stop();
      }
    }
    
    // Display summary
    displaySummary();
    
    // Create materialized views if they don't exist
    await createMaterializedViews();
    
  } catch (error) {
    spinner.fail('Initialization failed');
    console.error(chalk.red('\n❌ Error during initialization:'), error);
    process.exit(1);
  } finally {
    await cleanup();
  }
}

/**
 * Process a batch of leagues
 */
async function processBatch(leagues: any[]) {
  const promises = leagues.map(async (league) => {
    const leagueSpinner = ora(`  ${league.name} (${league.id})`).start();
    
    try {
      // Check if league has teams
      if (league._count.teams === 0) {
        leagueSpinner.warn(`  ${league.name} - No teams found`);
        progress.skippedLeagues++;
        return;
      }
      
      // Check if league has data
      const hasData = await prisma.weeklyStatistics.findFirst({
        where: { leagueId: league.id },
      });
      
      if (!hasData) {
        leagueSpinner.warn(`  ${league.name} - No data to process`);
        progress.skippedLeagues++;
        return;
      }
      
      // Queue all calculation types
      const jobs = await Promise.all([
        statsEngine.queueCalculation({
          leagueId: league.id,
          calculationType: CalculationType.SEASON,
          priority: 1,
        }),
        statsEngine.queueCalculation({
          leagueId: league.id,
          calculationType: CalculationType.HEAD_TO_HEAD,
          priority: 2,
        }),
        statsEngine.queueCalculation({
          leagueId: league.id,
          calculationType: CalculationType.RECORDS,
          priority: 2,
        }),
        statsEngine.queueCalculation({
          leagueId: league.id,
          calculationType: CalculationType.TRENDS,
          priority: 3,
        }),
        statsEngine.queueCalculation({
          leagueId: league.id,
          calculationType: CalculationType.CHAMPIONSHIPS,
          priority: 3,
        }),
      ]);
      
      leagueSpinner.succeed(`  ${league.name} - Queued ${jobs.length} jobs`);
      progress.successfulLeagues++;
      
    } catch (error) {
      leagueSpinner.fail(`  ${league.name} - Failed`);
      progress.failedLeagues++;
      progress.errors.push({
        league: league.name,
        error: (error as Error).message,
      });
    } finally {
      progress.processedLeagues++;
    }
  });
  
  await Promise.all(promises);
}

/**
 * Create or refresh materialized views
 */
async function createMaterializedViews() {
  const spinner = ora('Creating/refreshing materialized views...').start();
  
  try {
    // Check if materialized views exist
    const viewsExist = await prisma.$queryRaw`
      SELECT EXISTS (
        SELECT FROM pg_matviews 
        WHERE matviewname = 'mv_season_statistics'
      ) as exists
    ` as any[];
    
    if (!viewsExist[0]?.exists) {
      spinner.text = 'Creating materialized views...';
      // Views should be created by migration, but refresh them if they exist
      await prisma.$executeRaw`REFRESH MATERIALIZED VIEW CONCURRENTLY mv_season_statistics`;
      await prisma.$executeRaw`REFRESH MATERIALIZED VIEW CONCURRENTLY mv_h2h_summary`;
      spinner.succeed('Materialized views refreshed');
    } else {
      spinner.text = 'Refreshing materialized views...';
      await prisma.$executeRaw`REFRESH MATERIALIZED VIEW CONCURRENTLY mv_season_statistics`;
      await prisma.$executeRaw`REFRESH MATERIALIZED VIEW CONCURRENTLY mv_h2h_summary`;
      spinner.succeed('Materialized views refreshed');
    }
  } catch (error) {
    spinner.warn('Could not refresh materialized views (they may not exist yet)');
  }
}

/**
 * Display initialization summary
 */
function displaySummary() {
  console.log(chalk.bold('\n📈 Initialization Summary:\n'));
  
  const table = [
    ['Total Leagues', progress.totalLeagues],
    ['Processed', progress.processedLeagues],
    ['Successful', chalk.green(progress.successfulLeagues)],
    ['Failed', progress.failedLeagues > 0 ? chalk.red(progress.failedLeagues) : '0'],
    ['Skipped', chalk.yellow(progress.skippedLeagues)],
  ];
  
  table.forEach(([label, value]) => {
    console.log(`  ${chalk.gray(label.padEnd(15))} ${value}`);
  });
  
  if (progress.errors.length > 0) {
    console.log(chalk.red('\n❌ Errors:'));
    progress.errors.forEach(({ league, error }) => {
      console.log(`  - ${league}: ${error}`);
    });
  }
  
  const successRate = ((progress.successfulLeagues / progress.totalLeagues) * 100).toFixed(1);
  
  if (progress.successfulLeagues === progress.totalLeagues) {
    console.log(chalk.green(`\n✅ All leagues initialized successfully!`));
  } else if (progress.successfulLeagues > 0) {
    console.log(chalk.yellow(`\n⚠️  Partially successful (${successRate}% success rate)`));
  } else {
    console.log(chalk.red(`\n❌ Initialization failed for all leagues`));
  }
}

/**
 * Cleanup resources
 */
async function cleanup() {
  await statsEngine.shutdown();
  await redis.quit();
  await prisma.$disconnect();
}

/**
 * Handle process signals
 */
process.on('SIGINT', async () => {
  console.log(chalk.yellow('\n\n⚠️  Initialization interrupted by user'));
  await cleanup();
  process.exit(1);
});

// Command line arguments
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(chalk.bold('\nStatistics Initialization Script\n'));
  console.log('Usage: npm run stats:init [options]\n');
  console.log('Options:');
  console.log('  --skip-existing    Skip leagues that already have statistics');
  console.log('  --batch-size <n>   Number of leagues to process in parallel (default: 5)');
  console.log('  --help, -h         Show this help message\n');
  process.exit(0);
}

if (args.includes('--skip-existing')) {
  CONFIG.SKIP_EXISTING = true;
}

const batchSizeIndex = args.indexOf('--batch-size');
if (batchSizeIndex !== -1 && args[batchSizeIndex + 1]) {
  const batchSize = parseInt(args[batchSizeIndex + 1]);
  if (!isNaN(batchSize) && batchSize > 0) {
    CONFIG.BATCH_SIZE = batchSize;
  }
}

// Run initialization
initializeStatistics().catch(console.error);