#!/usr/bin/env tsx

import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { existsSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

const prisma = new PrismaClient({
  log: ['error'],
});

interface CheckResult {
  name: string;
  status: 'pass' | 'fail' | 'warning';
  message: string;
  details?: string;
}

const checks: CheckResult[] = [];

async function checkProjectStructure(): Promise<void> {
  console.log('📁 Checking project structure...');
  
  const requiredDirs = [
    'app',
    'app/api',
    'app/api/auth',
    'app/api/leagues',
    'components',
    'lib',
    'lib/api',
    'lib/test',
    'types',
    'prisma',
    'scripts',
    'development_plan',
  ];
  
  const missing = requiredDirs.filter(dir => !existsSync(join(process.cwd(), dir)));
  
  if (missing.length === 0) {
    checks.push({
      name: 'Project Structure',
      status: 'pass',
      message: 'All required directories present',
    });
  } else {
    checks.push({
      name: 'Project Structure',
      status: 'fail',
      message: `Missing ${missing.length} directories`,
      details: `Missing: ${missing.join(', ')}`,
    });
  }
}

async function checkDocker(): Promise<void> {
  console.log('🐳 Checking Docker...');
  
  try {
    execSync('docker --version', { stdio: 'ignore' });
    checks.push({
      name: 'Docker Installation',
      status: 'pass',
      message: 'Docker is installed',
    });
    
    // Check if docker-compose.yml exists
    if (existsSync('docker-compose.yml')) {
      checks.push({
        name: 'Docker Compose Config',
        status: 'pass',
        message: 'docker-compose.yml found',
      });
      
      // Try to check container status
      try {
        const psOutput = execSync('docker-compose ps --format json 2>/dev/null || echo "[]"', { encoding: 'utf-8' });
        if (psOutput.includes('rumbledore-postgres') || psOutput.includes('rumbledore-redis')) {
          checks.push({
            name: 'Docker Containers',
            status: 'pass',
            message: 'Containers are configured',
          });
        } else {
          checks.push({
            name: 'Docker Containers',
            status: 'warning',
            message: 'Containers not running',
            details: 'Run: npm run docker:up',
          });
        }
      } catch {
        checks.push({
          name: 'Docker Containers',
          status: 'warning',
          message: 'Could not check container status',
          details: 'Run: npm run docker:up',
        });
      }
    } else {
      checks.push({
        name: 'Docker Compose Config',
        status: 'fail',
        message: 'docker-compose.yml not found',
      });
    }
  } catch {
    checks.push({
      name: 'Docker Installation',
      status: 'fail',
      message: 'Docker is not installed',
      details: 'Install Docker Desktop from docker.com',
    });
  }
}

async function checkDatabase(): Promise<void> {
  console.log('🗄️  Checking PostgreSQL...');
  
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.push({
      name: 'PostgreSQL Connection',
      status: 'pass',
      message: 'Connected to database',
    });
    
    // Check extensions
    try {
      const extensions = await prisma.$queryRaw<{ extname: string }[]>`
        SELECT extname FROM pg_extension 
        WHERE extname IN ('uuid-ossp', 'vector', 'pg_trgm', 'btree_gist')
      `;
      
      if (extensions.length === 4) {
        checks.push({
          name: 'PostgreSQL Extensions',
          status: 'pass',
          message: 'All required extensions installed',
        });
      } else {
        checks.push({
          name: 'PostgreSQL Extensions',
          status: 'warning',
          message: `Only ${extensions.length}/4 extensions installed`,
          details: 'Some extensions missing',
        });
      }
    } catch {
      checks.push({
        name: 'PostgreSQL Extensions',
        status: 'warning',
        message: 'Could not check extensions',
      });
    }
    
    // Check if Prisma schema is applied
    try {
      const tableCount = await prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*) as count FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      `;
      
      if (Number(tableCount[0].count) > 0) {
        checks.push({
          name: 'Database Schema',
          status: 'pass',
          message: `${tableCount[0].count} tables found`,
        });
      } else {
        checks.push({
          name: 'Database Schema',
          status: 'warning',
          message: 'No tables found',
          details: 'Run: npm run db:migrate',
        });
      }
    } catch {
      checks.push({
        name: 'Database Schema',
        status: 'warning',
        message: 'Could not check schema',
      });
    }
  } catch (error) {
    checks.push({
      name: 'PostgreSQL Connection',
      status: 'fail',
      message: 'Cannot connect to database',
      details: 'Start Docker containers: npm run docker:up',
    });
  }
}

async function checkRedis(): Promise<void> {
  console.log('📦 Checking Redis...');
  
  const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: 1,
    connectTimeout: 2000,
    commandTimeout: 2000,
  });
  
  try {
    await redis.ping();
    checks.push({
      name: 'Redis Connection',
      status: 'pass',
      message: 'Connected to Redis',
    });
    
    // Test basic operations
    const testKey = 'test:verify:key';
    await redis.set(testKey, 'test-value', 'EX', 10);
    const value = await redis.get(testKey);
    await redis.del(testKey);
    
    if (value === 'test-value') {
      checks.push({
        name: 'Redis Operations',
        status: 'pass',
        message: 'Redis operations working',
      });
    } else {
      checks.push({
        name: 'Redis Operations',
        status: 'warning',
        message: 'Redis operations may have issues',
      });
    }
  } catch (error) {
    checks.push({
      name: 'Redis Connection',
      status: 'fail',
      message: 'Cannot connect to Redis',
      details: 'Start Docker containers: npm run docker:up',
    });
  } finally {
    redis.disconnect();
  }
}

async function checkEnvironment(): Promise<void> {
  console.log('🔧 Checking environment...');
  
  // Check .env.local file
  if (existsSync('.env.local')) {
    checks.push({
      name: '.env.local File',
      status: 'pass',
      message: 'Environment file exists',
    });
    
    // Check required variables
    const requiredEnvVars = [
      'DATABASE_URL',
      'REDIS_URL',
      'NEXT_PUBLIC_APP_URL',
    ];
    
    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length === 0) {
      checks.push({
        name: 'Environment Variables',
        status: 'pass',
        message: 'Required variables set',
      });
    } else {
      checks.push({
        name: 'Environment Variables',
        status: 'warning',
        message: `Missing ${missingVars.length} variables`,
        details: `Check .env.local for: ${missingVars.join(', ')}`,
      });
    }
  } else {
    checks.push({
      name: '.env.local File',
      status: 'fail',
      message: 'No .env.local file found',
      details: 'Create .env.local with required variables',
    });
  }
}

async function checkDependencies(): Promise<void> {
  console.log('📚 Checking dependencies...');
  
  try {
    const packagePath = join(process.cwd(), 'package.json');
    const packageJson = require(packagePath);
    
    const criticalDeps = [
      '@prisma/client',
      'next',
      'react',
      'react-dom',
      'zod',
    ];
    
    const installedDeps = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };
    
    const missingDeps = criticalDeps.filter(dep => !installedDeps[dep]);
    
    if (missingDeps.length === 0) {
      checks.push({
        name: 'NPM Dependencies',
        status: 'pass',
        message: 'Critical packages installed',
      });
    } else {
      checks.push({
        name: 'NPM Dependencies',
        status: 'fail',
        message: `Missing ${missingDeps.length} critical packages`,
        details: `Run: npm install`,
      });
    }
    
    // Check if node_modules exists
    if (existsSync('node_modules')) {
      checks.push({
        name: 'Node Modules',
        status: 'pass',
        message: 'Dependencies installed',
      });
    } else {
      checks.push({
        name: 'Node Modules',
        status: 'fail',
        message: 'node_modules not found',
        details: 'Run: npm install',
      });
    }
  } catch {
    checks.push({
      name: 'NPM Dependencies',
      status: 'fail',
      message: 'Cannot read package.json',
    });
  }
}

async function runChecks(): Promise<void> {
  console.log('🚀 Rumbledore Sprint 1 Setup Verification\n');
  console.log('=' .repeat(50) + '\n');
  
  await checkProjectStructure();
  await checkEnvironment();
  await checkDependencies();
  await checkDocker();
  await checkDatabase();
  await checkRedis();
  
  console.log('\n' + '=' .repeat(50));
  console.log('📊 Verification Results:\n');
  
  const passed = checks.filter(c => c.status === 'pass').length;
  const failed = checks.filter(c => c.status === 'fail').length;
  const warnings = checks.filter(c => c.status === 'warning').length;
  
  // Group by status for better readability
  const groupedChecks = {
    pass: checks.filter(c => c.status === 'pass'),
    warning: checks.filter(c => c.status === 'warning'),
    fail: checks.filter(c => c.status === 'fail'),
  };
  
  // Show passes
  if (groupedChecks.pass.length > 0) {
    console.log('✅ Passed:');
    groupedChecks.pass.forEach(check => {
      console.log(`   • ${check.name}: ${check.message}`);
    });
    console.log();
  }
  
  // Show warnings
  if (groupedChecks.warning.length > 0) {
    console.log('⚠️  Warnings:');
    groupedChecks.warning.forEach(check => {
      console.log(`   • ${check.name}: ${check.message}`);
      if (check.details) {
        console.log(`     → ${check.details}`);
      }
    });
    console.log();
  }
  
  // Show failures
  if (groupedChecks.fail.length > 0) {
    console.log('❌ Failed:');
    groupedChecks.fail.forEach(check => {
      console.log(`   • ${check.name}: ${check.message}`);
      if (check.details) {
        console.log(`     → ${check.details}`);
      }
    });
    console.log();
  }
  
  console.log('=' .repeat(50));
  console.log(`\n📈 Summary: ${passed} passed, ${failed} failed, ${warnings} warnings\n`);
  
  if (failed > 0) {
    console.log('❌ Setup verification failed.\n');
    console.log('Fix the issues above, then run: npm run verify:setup\n');
    process.exit(1);
  } else if (warnings > 0) {
    console.log('⚠️  Setup complete with warnings.\n');
    console.log('Your environment is functional but some features may be limited.');
    console.log('\nNext steps:');
    console.log('1. Fix any warnings above');
    console.log('2. Run: npm run db:migrate');
    console.log('3. Run: npm run db:seed');
    console.log('4. Run: npm run dev');
  } else {
    console.log('✅ Perfect! Your Sprint 1 environment is fully configured.\n');
    console.log('Next steps:');
    console.log('1. Run: npm run db:migrate');
    console.log('2. Run: npm run db:seed');
    console.log('3. Run: npm run dev');
    console.log('4. Open: http://localhost:3000');
  }
}

runChecks()
  .catch((error) => {
    console.error('❌ Verification script error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });