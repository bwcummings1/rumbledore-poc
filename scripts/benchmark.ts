#!/usr/bin/env tsx

/**
 * Performance Benchmarking Script
 * Measures and reports on application performance metrics
 */

import chalk from 'chalk';
import ora from 'ora';
import { performance } from 'perf_hooks';
import axios from 'axios';
import { PrismaClient } from '@prisma/client';
import { getRedis } from '../lib/redis';

const prisma = new PrismaClient();

interface BenchmarkResult {
  name: string;
  duration: number;
  success: boolean;
  error?: string;
  details?: any;
}

class PerformanceBenchmark {
  private results: BenchmarkResult[] = [];
  private baseUrl: string;
  
  constructor() {
    this.baseUrl = process.env.NEXT_PUBLIC_URL || 'http://localhost:3000';
  }

  async runAll() {
    console.log(chalk.bold.cyan('\n🚀 Starting Performance Benchmark\n'));
    
    // Database benchmarks
    await this.section('Database Performance', async () => {
      await this.benchmarkDatabaseQuery('Simple Select', async () => {
        await prisma.user.findMany({ take: 10 });
      });
      
      await this.benchmarkDatabaseQuery('Complex Join', async () => {
        await prisma.league.findMany({
          take: 10,
          include: {
            members: {
              include: {
                user: true,
              },
            },
          },
        });
      });
      
      await this.benchmarkDatabaseQuery('Aggregation', async () => {
        await prisma.bet.groupBy({
          by: ['status'],
          _count: true,
          _sum: {
            stake: true,
          },
        });
      });
      
      await this.benchmarkDatabaseQuery('Full Text Search', async () => {
        await prisma.$queryRaw`
          SELECT * FROM "User" 
          WHERE to_tsvector('english', username || ' ' || COALESCE(display_name, ''))
          @@ plainto_tsquery('english', 'test')
          LIMIT 10
        `;
      });
    });
    
    // Redis benchmarks
    await this.section('Redis Performance', async () => {
      const redis = getRedis();
      
      await this.benchmarkRedisOperation('Set Operation', async () => {
        await redis.set('benchmark:test', JSON.stringify({ data: 'test' }));
      });
      
      await this.benchmarkRedisOperation('Get Operation', async () => {
        await redis.get('benchmark:test');
      });
      
      const largeData = JSON.stringify(Array(1000).fill({ test: 'data' }));
      await this.benchmarkRedisOperation('Large Set', async () => {
        await redis.set('benchmark:large', largeData);
      });
      
      await this.benchmarkRedisOperation('Large Get', async () => {
        await redis.get('benchmark:large');
      });
      
      await this.benchmarkRedisOperation('Pipeline (100 ops)', async () => {
        const pipeline = redis.pipeline();
        for (let i = 0; i < 100; i++) {
          pipeline.set(`benchmark:pipeline:${i}`, i);
        }
        await pipeline.exec();
      });
      
      // Cleanup
      await redis.del('benchmark:test', 'benchmark:large');
      const keys = await redis.keys('benchmark:pipeline:*');
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    });
    
    // API benchmarks
    await this.section('API Performance', async () => {
      await this.benchmarkApiEndpoint('GET /api/health', 'GET', '/api/health');
      
      await this.benchmarkApiEndpoint('GET /api/leagues', 'GET', '/api/leagues');
      
      if (await this.hasTestData()) {
        await this.benchmarkApiEndpoint(
          'GET /api/statistics',
          'GET',
          '/api/statistics'
        );
        
        await this.benchmarkApiEndpoint(
          'GET /api/competitions',
          'GET',
          '/api/competitions'
        );
      }
    });
    
    // Bundle size analysis
    await this.section('Bundle Analysis', async () => {
      await this.analyzeBundleSize();
    });
    
    // Memory usage
    await this.section('Memory Usage', async () => {
      this.analyzeMemoryUsage();
    });
    
    // Generate report
    this.generateReport();
  }

  private async section(name: string, fn: () => Promise<void>) {
    console.log(chalk.bold.yellow(`\n📊 ${name}`));
    console.log(chalk.gray('─'.repeat(50)));
    await fn();
  }

  private async benchmarkDatabaseQuery(name: string, query: () => Promise<any>) {
    const spinner = ora(`Running: ${name}`).start();
    const start = performance.now();
    
    try {
      // Warm up
      await query();
      
      // Actual benchmark (run 10 times)
      const times: number[] = [];
      for (let i = 0; i < 10; i++) {
        const iterStart = performance.now();
        await query();
        times.push(performance.now() - iterStart);
      }
      
      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      const min = Math.min(...times);
      const max = Math.max(...times);
      
      this.results.push({
        name: `DB: ${name}`,
        duration: avg,
        success: true,
        details: { min, max, avg },
      });
      
      spinner.succeed(
        `${name}: ${chalk.green(avg.toFixed(2))}ms (min: ${min.toFixed(2)}ms, max: ${max.toFixed(2)}ms)`
      );
    } catch (error) {
      const duration = performance.now() - start;
      
      this.results.push({
        name: `DB: ${name}`,
        duration,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      spinner.fail(`${name}: ${chalk.red('Failed')} - ${error}`);
    }
  }

  private async benchmarkRedisOperation(name: string, operation: () => Promise<any>) {
    const spinner = ora(`Running: ${name}`).start();
    
    try {
      // Warm up
      await operation();
      
      // Actual benchmark (run 100 times)
      const times: number[] = [];
      for (let i = 0; i < 100; i++) {
        const start = performance.now();
        await operation();
        times.push(performance.now() - start);
      }
      
      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      const min = Math.min(...times);
      const max = Math.max(...times);
      
      this.results.push({
        name: `Redis: ${name}`,
        duration: avg,
        success: true,
        details: { min, max, avg },
      });
      
      spinner.succeed(
        `${name}: ${chalk.green(avg.toFixed(2))}ms (min: ${min.toFixed(2)}ms, max: ${max.toFixed(2)}ms)`
      );
    } catch (error) {
      this.results.push({
        name: `Redis: ${name}`,
        duration: 0,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      spinner.fail(`${name}: ${chalk.red('Failed')} - ${error}`);
    }
  }

  private async benchmarkApiEndpoint(name: string, method: string, path: string, data?: any) {
    const spinner = ora(`Running: ${name}`).start();
    
    try {
      // Warm up
      await axios({
        method,
        url: `${this.baseUrl}${path}`,
        data,
        validateStatus: () => true,
      });
      
      // Actual benchmark (run 10 times)
      const times: number[] = [];
      let totalSize = 0;
      
      for (let i = 0; i < 10; i++) {
        const start = performance.now();
        const response = await axios({
          method,
          url: `${this.baseUrl}${path}`,
          data,
          validateStatus: () => true,
        });
        times.push(performance.now() - start);
        
        // Estimate response size
        const responseSize = JSON.stringify(response.data).length;
        totalSize += responseSize;
      }
      
      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      const min = Math.min(...times);
      const max = Math.max(...times);
      const avgSize = totalSize / 10;
      
      this.results.push({
        name: `API: ${name}`,
        duration: avg,
        success: true,
        details: { min, max, avg, avgSize },
      });
      
      spinner.succeed(
        `${name}: ${chalk.green(avg.toFixed(2))}ms (size: ${(avgSize / 1024).toFixed(1)}KB)`
      );
    } catch (error) {
      this.results.push({
        name: `API: ${name}`,
        duration: 0,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      spinner.fail(`${name}: ${chalk.red('Failed')} - ${error}`);
    }
  }

  private async analyzeBundleSize() {
    const spinner = ora('Analyzing bundle size').start();
    
    try {
      // Check if .next directory exists
      const fs = await import('fs/promises');
      const path = await import('path');
      
      const nextDir = path.join(process.cwd(), '.next');
      const stats = await fs.stat(nextDir).catch(() => null);
      
      if (!stats) {
        spinner.warn('No build found. Run "npm run build" first.');
        return;
      }
      
      // Analyze static files
      const staticDir = path.join(nextDir, 'static');
      const chunks = await this.getDirectorySize(staticDir);
      
      // Analyze server files
      const serverDir = path.join(nextDir, 'server');
      const serverSize = await this.getDirectorySize(serverDir);
      
      this.results.push({
        name: 'Bundle: Static',
        duration: chunks / 1024, // Convert to KB
        success: true,
        details: { size: chunks },
      });
      
      this.results.push({
        name: 'Bundle: Server',
        duration: serverSize / 1024,
        success: true,
        details: { size: serverSize },
      });
      
      spinner.succeed(
        `Bundle sizes - Static: ${chalk.green((chunks / 1024).toFixed(1))}KB, Server: ${chalk.green((serverSize / 1024 / 1024).toFixed(1))}MB`
      );
    } catch (error) {
      spinner.fail(`Bundle analysis failed: ${error}`);
    }
  }

  private async getDirectorySize(dir: string): Promise<number> {
    const fs = await import('fs/promises');
    const path = await import('path');
    
    let totalSize = 0;
    
    try {
      const files = await fs.readdir(dir, { withFileTypes: true });
      
      for (const file of files) {
        const filePath = path.join(dir, file.name);
        
        if (file.isDirectory()) {
          totalSize += await this.getDirectorySize(filePath);
        } else {
          const stats = await fs.stat(filePath);
          totalSize += stats.size;
        }
      }
    } catch (error) {
      // Directory doesn't exist
    }
    
    return totalSize;
  }

  private analyzeMemoryUsage() {
    const used = process.memoryUsage();
    
    console.log(chalk.cyan('Memory Usage:'));
    console.log(`  RSS: ${chalk.green((used.rss / 1024 / 1024).toFixed(2))} MB`);
    console.log(`  Heap Total: ${chalk.green((used.heapTotal / 1024 / 1024).toFixed(2))} MB`);
    console.log(`  Heap Used: ${chalk.green((used.heapUsed / 1024 / 1024).toFixed(2))} MB`);
    console.log(`  External: ${chalk.green((used.external / 1024 / 1024).toFixed(2))} MB`);
    
    this.results.push({
      name: 'Memory: Heap Used',
      duration: used.heapUsed / 1024 / 1024,
      success: true,
      details: used,
    });
  }

  private async hasTestData(): Promise<boolean> {
    try {
      const count = await prisma.league.count();
      return count > 0;
    } catch {
      return false;
    }
  }

  private generateReport() {
    console.log(chalk.bold.cyan('\n📈 Benchmark Report\n'));
    console.log(chalk.gray('═'.repeat(60)));
    
    // Group results by category
    const categories = {
      Database: this.results.filter(r => r.name.startsWith('DB:')),
      Redis: this.results.filter(r => r.name.startsWith('Redis:')),
      API: this.results.filter(r => r.name.startsWith('API:')),
      Bundle: this.results.filter(r => r.name.startsWith('Bundle:')),
      Memory: this.results.filter(r => r.name.startsWith('Memory:')),
    };
    
    Object.entries(categories).forEach(([category, results]) => {
      if (results.length === 0) return;
      
      console.log(chalk.bold.yellow(`\n${category}:`));
      
      results.forEach(result => {
        const status = result.success ? chalk.green('✓') : chalk.red('✗');
        const value = result.duration.toFixed(2);
        const unit = category === 'Bundle' ? 'KB' : category === 'Memory' ? 'MB' : 'ms';
        
        console.log(`  ${status} ${result.name.replace(/^[^:]+:\s*/, '')}: ${value}${unit}`);
        
        if (!result.success && result.error) {
          console.log(`    ${chalk.red(`Error: ${result.error}`)}`);
        }
      });
    });
    
    // Performance summary
    console.log(chalk.bold.cyan('\n📊 Performance Summary\n'));
    console.log(chalk.gray('─'.repeat(60)));
    
    const dbAvg = this.average(categories.Database.filter(r => r.success));
    const redisAvg = this.average(categories.Redis.filter(r => r.success));
    const apiAvg = this.average(categories.API.filter(r => r.success));
    
    console.log(`Database Avg: ${this.colorize(dbAvg, 100, 500)}ms`);
    console.log(`Redis Avg: ${this.colorize(redisAvg, 5, 20)}ms`);
    console.log(`API Avg: ${this.colorize(apiAvg, 100, 500)}ms`);
    
    // Recommendations
    console.log(chalk.bold.cyan('\n💡 Recommendations\n'));
    console.log(chalk.gray('─'.repeat(60)));
    
    if (dbAvg > 100) {
      console.log(chalk.yellow('• Consider adding database indexes for slow queries'));
    }
    
    if (apiAvg > 200) {
      console.log(chalk.yellow('• API responses are slow. Consider implementing caching'));
    }
    
    const bundleSize = categories.Bundle.find(r => r.name.includes('Static'))?.duration || 0;
    if (bundleSize > 500) {
      console.log(chalk.yellow('• Bundle size is large. Consider code splitting'));
    }
    
    const memoryUsed = categories.Memory.find(r => r.name.includes('Heap'))?.duration || 0;
    if (memoryUsed > 500) {
      console.log(chalk.yellow('• High memory usage detected. Check for memory leaks'));
    }
    
    console.log(chalk.gray('\n═'.repeat(60)));
    console.log(chalk.bold.green('\n✨ Benchmark Complete!\n'));
  }

  private average(results: BenchmarkResult[]): number {
    if (results.length === 0) return 0;
    return results.reduce((sum, r) => sum + r.duration, 0) / results.length;
  }

  private colorize(value: number, good: number, bad: number): string {
    if (value <= good) return chalk.green(value.toFixed(2));
    if (value <= bad) return chalk.yellow(value.toFixed(2));
    return chalk.red(value.toFixed(2));
  }
}

// Run benchmark
async function main() {
  const benchmark = new PerformanceBenchmark();
  
  try {
    await benchmark.runAll();
  } catch (error) {
    console.error(chalk.red('\n❌ Benchmark failed:'), error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    process.exit(0);
  }
}

main();