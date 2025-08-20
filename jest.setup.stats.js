// Jest setup for Statistics Engine tests

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.TEST_DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.TEST_REDIS_URL = 'redis://localhost:6379/1';

// Mock timers for scheduled jobs
jest.useFakeTimers();

// Suppress console output in tests
global.console = {
  ...console,
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
};

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks();
  jest.clearAllTimers();
});

// Clean up after all tests
afterAll(() => {
  jest.useRealTimers();
});