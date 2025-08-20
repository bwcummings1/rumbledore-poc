#!/usr/bin/env tsx
/**
 * Verify that the Rumbledore development environment is properly set up
 */

import { existsSync } from 'fs';
import { join } from 'path';

console.log('🔍 Verifying Rumbledore Setup...\n');

const checks = [
  {
    name: 'Project Structure',
    check: () => {
      const requiredDirs = [
        'app',
        'components',
        'lib',
        'types',
        'development_plan',
        'scripts'
      ];
      
      const missing = requiredDirs.filter(dir => !existsSync(join(process.cwd(), dir)));
      return {
        pass: missing.length === 0,
        message: missing.length === 0 ? 'All directories present' : `Missing: ${missing.join(', ')}`
      };
    }
  },
  {
    name: 'Documentation Files',
    check: () => {
      const requiredFiles = [
        'QUICKSTART.md',
        'START_HERE.md',
        'CLAUDE.md',
        'development_plan/README.md',
        'development_plan/SPRINT_WORKFLOW.md',
        'development_plan/CURRENT_SPRINT.txt'
      ];
      
      const missing = requiredFiles.filter(file => !existsSync(join(process.cwd(), file)));
      return {
        pass: missing.length === 0,
        message: missing.length === 0 ? 'All documentation present' : `Missing: ${missing.join(', ')}`
      };
    }
  },
  {
    name: 'Environment File',
    check: () => {
      const hasEnvLocal = existsSync(join(process.cwd(), '.env.local'));
      const hasEnvExample = existsSync(join(process.cwd(), '.env.example'));
      
      if (hasEnvLocal) {
        return { pass: true, message: '.env.local configured' };
      } else if (hasEnvExample) {
        return { pass: false, message: '.env.local missing - copy from .env.example' };
      } else {
        return { pass: false, message: 'No environment files found' };
      }
    }
  },
  {
    name: 'Package.json',
    check: () => {
      const packagePath = join(process.cwd(), 'package.json');
      if (existsSync(packagePath)) {
        const pkg = require(packagePath);
        return {
          pass: pkg.name === 'rumbledore',
          message: pkg.name === 'rumbledore' ? 'Correctly configured' : 'Name should be "rumbledore"'
        };
      }
      return { pass: false, message: 'package.json not found' };
    }
  }
];

// Run checks
let allPassed = true;
for (const { name, check } of checks) {
  const result = check();
  const icon = result.pass ? '✅' : '❌';
  console.log(`${icon} ${name}: ${result.message}`);
  if (!result.pass) allPassed = false;
}

console.log('\n' + '━'.repeat(50));

if (allPassed) {
  console.log('✅ Setup verification complete! Ready to start development.');
  console.log('\nNext steps:');
  console.log('1. Run: npm run docker:up');
  console.log('2. Run: npm run dev');
  console.log('3. Open: http://localhost:3000');
} else {
  console.log('❌ Setup incomplete. Please fix the issues above.');
  console.log('\nQuick fixes:');
  console.log('1. Copy .env.example to .env.local');
  console.log('2. Run: npm install');
  console.log('3. Check that all files were created properly');
  process.exit(1);
}