// Jest configuration for Statistics Engine tests
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>'],
  testMatch: [
    '**/__tests__/**/stats/**/*.test.ts',
    '**/__tests__/**/statistics*.test.ts',
    '**/__tests__/integration/statistics*.test.ts',
    '**/__tests__/performance/statistics*.test.ts',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  moduleDirectories: ['node_modules', '<rootDir>'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        jsx: 'react',
        esModuleInterop: true,
        moduleResolution: 'node',
        allowSyntheticDefaultImports: true,
      },
    }],
  },
  collectCoverageFrom: [
    'lib/stats/**/*.ts',
    'lib/workers/statistics-*.ts',
    '!**/*.d.ts',
    '!**/node_modules/**',
  ],
  coverageDirectory: 'coverage/stats',
  coverageReporters: ['text', 'lcov', 'html'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.stats.js'],
  testTimeout: 30000,
  globals: {
    'ts-jest': {
      isolatedModules: true,
    },
  },
};