#!/usr/bin/env tsx
/**
 * Health check script for Rumbledore development environment
 * Verifies that all required services are running and accessible
 */

console.log('🔍 Rumbledore Health Check\n');

interface HealthCheckResult {
  service: string;
  status: 'healthy' | 'unhealthy' | 'warning';
  message: string;
}

const results: HealthCheckResult[] = [];

// Check Node.js version
const nodeVersion = process.version;
const requiredNodeVersion = 'v20';
if (nodeVersion.startsWith(requiredNodeVersion)) {
  results.push({
    service: 'Node.js',
    status: 'healthy',
    message: `Version ${nodeVersion}`
  });
} else {
  results.push({
    service: 'Node.js',
    status: 'warning',
    message: `Version ${nodeVersion} (recommended: ${requiredNodeVersion})`
  });
}

// Check for required environment variables
const requiredEnvVars = ['DATABASE_URL', 'REDIS_URL'];
for (const envVar of requiredEnvVars) {
  if (process.env[envVar]) {
    results.push({
      service: `ENV: ${envVar}`,
      status: 'healthy',
      message: 'Set'
    });
  } else {
    results.push({
      service: `ENV: ${envVar}`,
      status: 'unhealthy',
      message: 'Not set - check .env.local'
    });
  }
}

// TODO: Add Docker checks
// TODO: Add PostgreSQL connection check
// TODO: Add Redis connection check

// Display results
console.log('Health Check Results:');
console.log('━'.repeat(50));

for (const result of results) {
  const statusEmoji = {
    'healthy': '✅',
    'unhealthy': '❌',
    'warning': '⚠️'
  }[result.status];
  
  console.log(`${statusEmoji} ${result.service}: ${result.message}`);
}

console.log('━'.repeat(50));

const unhealthyCount = results.filter(r => r.status === 'unhealthy').length;
const warningCount = results.filter(r => r.status === 'warning').length;

if (unhealthyCount > 0) {
  console.log(`\n❌ ${unhealthyCount} service(s) unhealthy. Please fix before proceeding.`);
  process.exit(1);
} else if (warningCount > 0) {
  console.log(`\n⚠️  ${warningCount} warning(s) found but system is operational.`);
} else {
  console.log('\n✅ All systems healthy!');
}