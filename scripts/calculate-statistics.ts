#!/usr/bin/env tsx
// Calculate Statistics Script
// Sprint 6: Statistics Engine - On-demand statistics calculation

import { PrismaClient } from '@prisma/client';
import { StatisticsEngine } from '../lib/stats/statistics-engine';
import { CalculationType } from '../types/statistics';
import ora from 'ora';
import chalk from 'chalk';
import prompts from 'prompts';

const prisma = new PrismaClient();
const statsEngine = new StatisticsEngine(process.env.REDIS_URL);

async function calculateStatistics() {
  console.log(chalk.bold.blue('\n📊 Statistics Calculator\n'));
  
  const spinner = ora('Loading leagues...').start();
  
  try {
    // Get all leagues
    const leagues = await prisma.league.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        espnLeagueId: true,
      },
      orderBy: { name: 'asc' },
    });
    
    spinner.succeed(`Found ${leagues.length} active leagues`);
    
    if (leagues.length === 0) {
      console.log(chalk.yellow('\n⚠️  No active leagues found.\n'));
      return;
    }
    
    // Prompt for league selection
    const leagueResponse = await prompts({
      type: 'select',
      name: 'leagueId',
      message: 'Select a league:',
      choices: [
        { title: 'All Leagues', value: 'ALL' },
        ...leagues.map(l => ({
          title: `${l.name} (${l.espnLeagueId})`,
          value: l.id,
        })),
      ],
    });
    
    if (!leagueResponse.leagueId) {
      console.log(chalk.gray('\nCancelled by user.\n'));
      return;
    }
    
    // Prompt for calculation type
    const typeResponse = await prompts({
      type: 'select',
      name: 'calculationType',
      message: 'Select calculation type:',
      choices: [
        { title: 'All Statistics', value: CalculationType.ALL },
        { title: 'Season Statistics', value: CalculationType.SEASON },
        { title: 'Head-to-Head Records', value: CalculationType.HEAD_TO_HEAD },
        { title: 'All-Time Records', value: CalculationType.RECORDS },
        { title: 'Performance Trends', value: CalculationType.TRENDS },
        { title: 'Championship Records', value: CalculationType.CHAMPIONSHIPS },
      ],
    });
    
    if (!typeResponse.calculationType) {
      console.log(chalk.gray('\nCancelled by user.\n'));
      return;
    }
    
    // Prompt for additional options
    const optionsResponse = await prompts([
      {
        type: 'confirm',
        name: 'forceRecalculate',
        message: 'Force recalculation (ignore cache)?',
        initial: false,
      },
      {
        type: 'number',
        name: 'priority',
        message: 'Priority (1-10, lower = higher priority):',
        initial: 5,
        min: 1,
        max: 10,
      },
    ]);
    
    // Process calculation
    const leaguesToProcess = leagueResponse.leagueId === 'ALL' 
      ? leagues 
      : leagues.filter(l => l.id === leagueResponse.leagueId);
    
    console.log(chalk.bold(`\n📈 Processing ${leaguesToProcess.length} league(s)...\n`));
    
    const jobs = [];
    for (const league of leaguesToProcess) {
      spinner.start(`Queueing ${league.name}...`);
      
      try {
        const jobId = await statsEngine.queueCalculation({
          leagueId: league.id,
          calculationType: typeResponse.calculationType,
          forceRecalculate: optionsResponse.forceRecalculate,
          priority: optionsResponse.priority,
        });
        
        jobs.push({ league: league.name, jobId });
        spinner.succeed(`Queued ${league.name} (Job ID: ${jobId})`);
      } catch (error) {
        spinner.fail(`Failed to queue ${league.name}`);
        console.error(chalk.red(`  Error: ${(error as Error).message}`));
      }
    }
    
    if (jobs.length > 0) {
      console.log(chalk.green(`\n✅ Successfully queued ${jobs.length} calculation job(s)\n`));
      
      // Ask if user wants to monitor progress
      const monitorResponse = await prompts({
        type: 'confirm',
        name: 'monitor',
        message: 'Monitor job progress?',
        initial: true,
      });
      
      if (monitorResponse.monitor) {
        await monitorJobs(jobs.map(j => j.jobId));
      }
    } else {
      console.log(chalk.red('\n❌ No jobs were queued successfully.\n'));
    }
    
  } catch (error) {
    spinner.fail('Error');
    console.error(chalk.red('\n❌ Error:'), error);
    process.exit(1);
  } finally {
    await cleanup();
  }
}

async function monitorJobs(jobIds: string[]) {
  console.log(chalk.bold('\n📊 Monitoring job progress...\n'));
  console.log(chalk.gray('Press Ctrl+C to stop monitoring\n'));
  
  const completedJobs = new Set<string>();
  const spinner = ora('Waiting for jobs to complete...').start();
  
  while (completedJobs.size < jobIds.length) {
    for (const jobId of jobIds) {
      if (completedJobs.has(jobId)) continue;
      
      // Check job status (would normally query Bull queue)
      const status = await getJobStatus(jobId);
      
      if (status === 'completed') {
        completedJobs.add(jobId);
        spinner.succeed(`Job ${jobId} completed`);
        
        if (completedJobs.size < jobIds.length) {
          spinner.start(`Waiting for ${jobIds.length - completedJobs.size} job(s)...`);
        }
      } else if (status === 'failed') {
        completedJobs.add(jobId);
        spinner.fail(`Job ${jobId} failed`);
        
        if (completedJobs.size < jobIds.length) {
          spinner.start(`Waiting for ${jobIds.length - completedJobs.size} job(s)...`);
        }
      }
    }
    
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  spinner.stop();
  console.log(chalk.green('\n✅ All jobs completed!\n'));
}

async function getJobStatus(jobId: string): Promise<string> {
  // This would normally query the Bull queue for job status
  // For now, simulate with database query
  const log = await prisma.statisticsCalculation.findFirst({
    where: {
      metadata: {
        path: ['jobId'],
        equals: jobId,
      },
    },
    orderBy: { createdAt: 'desc' },
  });
  
  if (!log) return 'pending';
  
  switch (log.status) {
    case 'COMPLETED':
      return 'completed';
    case 'FAILED':
      return 'failed';
    default:
      return 'processing';
  }
}

async function cleanup() {
  await statsEngine.shutdown();
  await prisma.$disconnect();
}

// Handle command line arguments
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(chalk.bold('\nStatistics Calculator Script\n'));
  console.log('Usage: npm run stats:calculate [options]\n');
  console.log('Options:');
  console.log('  --league <id>      Calculate for specific league ID');
  console.log('  --type <type>      Calculation type (ALL, SEASON, HEAD_TO_HEAD, etc.)');
  console.log('  --force            Force recalculation');
  console.log('  --priority <n>     Job priority (1-10)');
  console.log('  --no-interactive   Run without prompts (requires --league and --type)');
  console.log('  --help, -h         Show this help message\n');
  console.log('Interactive mode will prompt for all options if not provided.\n');
  process.exit(0);
}

// Check for non-interactive mode
if (args.includes('--no-interactive')) {
  const leagueIndex = args.indexOf('--league');
  const typeIndex = args.indexOf('--type');
  
  if (leagueIndex === -1 || typeIndex === -1) {
    console.error(chalk.red('\n❌ --league and --type are required in non-interactive mode\n'));
    process.exit(1);
  }
  
  const leagueId = args[leagueIndex + 1];
  const calculationType = args[typeIndex + 1] as CalculationType;
  const forceRecalculate = args.includes('--force');
  const priorityIndex = args.indexOf('--priority');
  const priority = priorityIndex !== -1 ? parseInt(args[priorityIndex + 1]) : 5;
  
  // Run non-interactive calculation
  (async () => {
    try {
      const jobId = await statsEngine.queueCalculation({
        leagueId,
        calculationType,
        forceRecalculate,
        priority,
      });
      
      console.log(chalk.green(`\n✅ Job queued successfully: ${jobId}\n`));
    } catch (error) {
      console.error(chalk.red('\n❌ Error:'), error);
      process.exit(1);
    } finally {
      await cleanup();
    }
  })();
} else {
  // Run interactive mode
  calculateStatistics().catch(console.error);
}