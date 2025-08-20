#!/usr/bin/env tsx

import { systemMonitor } from '../lib/services/system-monitor';
import chalk from 'chalk';

console.log(chalk.blue('🔍 Starting System Monitor...'));

// Start monitoring with 60 second intervals
systemMonitor.startMonitoring(60000);

console.log(chalk.green('✅ System Monitor started successfully'));
console.log(chalk.gray('Collecting metrics every 60 seconds...'));

// Keep the process running
process.on('SIGINT', () => {
  console.log(chalk.yellow('\n⏹️  Stopping System Monitor...'));
  systemMonitor.stopMonitoring();
  process.exit(0);
});