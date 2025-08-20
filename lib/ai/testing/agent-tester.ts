/**
 * AI Agent Testing Framework
 * 
 * Provides comprehensive testing capabilities for AI agents including
 * behavior validation, performance testing, and quality assurance.
 */

import { BaseAgent } from '../base-agent';
import { z } from 'zod';

// Test case schema
const TestCaseSchema = z.object({
  id: z.string(),
  description: z.string(),
  category: z.enum(['personality', 'accuracy', 'tools', 'memory', 'performance']),
  input: z.string(),
  context: z.record(z.any()).optional(),
  expectedPatterns: z.array(z.string()).optional(),
  unexpectedPatterns: z.array(z.string()).optional(),
  expectedTools: z.array(z.string()).optional(),
  maxResponseTime: z.number().optional(), // in milliseconds
  minConfidence: z.number().min(0).max(1).optional(),
});

export type TestCase = z.infer<typeof TestCaseSchema>;

// Test result schema
const TestResultSchema = z.object({
  testId: z.string(),
  passed: z.boolean(),
  category: z.string(),
  executionTime: z.number(),
  response: z.string().optional(),
  toolsUsed: z.array(z.string()).optional(),
  error: z.string().optional(),
  score: z.number().min(0).max(100),
  details: z.record(z.any()).optional(),
});

export type TestResult = z.infer<typeof TestResultSchema>;

// Test suite results
export interface TestSuiteResults {
  agentId: string;
  agentType: string;
  totalTests: number;
  passed: number;
  failed: number;
  results: TestResult[];
  overallScore: number;
  executionTime: number;
  categoryScores: Record<string, number>;
  recommendations: string[];
}

export class AgentTester {
  private agent: BaseAgent;
  private testCases: TestCase[] = [];
  private results: TestResult[] = [];

  constructor(agent: BaseAgent) {
    this.agent = agent;
  }

  /**
   * Add a single test case
   */
  addTestCase(testCase: TestCase): void {
    const validated = TestCaseSchema.parse(testCase);
    this.testCases.push(validated);
  }

  /**
   * Add multiple test cases
   */
  addTestCases(testCases: TestCase[]): void {
    testCases.forEach(tc => this.addTestCase(tc));
  }

  /**
   * Load default test cases for agent type
   */
  loadDefaultTests(agentType: string): void {
    const defaultTests = this.getDefaultTestsForType(agentType);
    this.addTestCases(defaultTests);
  }

  /**
   * Run all test cases
   */
  async runTests(verbose: boolean = false): Promise<TestSuiteResults> {
    const startTime = Date.now();
    this.results = [];

    // Initialize agent if not already done
    await this.agent.initialize();

    // Run each test case
    for (const testCase of this.testCases) {
      if (verbose) {
        console.log(`Running test: ${testCase.id} - ${testCase.description}`);
      }

      const result = await this.runSingleTest(testCase);
      this.results.push(result);

      if (verbose) {
        console.log(`  Result: ${result.passed ? '✅ PASSED' : '❌ FAILED'} (${result.score}/100)`);
      }
    }

    // Calculate overall results
    const suiteResults = this.calculateSuiteResults(Date.now() - startTime);

    if (verbose) {
      this.printSummary(suiteResults);
    }

    return suiteResults;
  }

  /**
   * Run a single test case
   */
  private async runSingleTest(testCase: TestCase): Promise<TestResult> {
    const testStartTime = Date.now();
    let passed = true;
    let score = 100;
    let details: Record<string, any> = {};

    try {
      // Generate a unique session ID for this test
      const sessionId = `test-${testCase.id}-${Date.now()}`;

      // Process the message
      const response = await this.agent.processMessage(
        testCase.input,
        sessionId,
        undefined,
        testCase.context
      );

      const executionTime = Date.now() - testStartTime;

      // Check response time
      if (testCase.maxResponseTime && executionTime > testCase.maxResponseTime) {
        passed = false;
        score -= 20;
        details.responseTimeExceeded = true;
      }

      // Check expected patterns
      if (testCase.expectedPatterns) {
        const missingPatterns = testCase.expectedPatterns.filter(
          pattern => !response.response.toLowerCase().includes(pattern.toLowerCase())
        );
        
        if (missingPatterns.length > 0) {
          passed = false;
          score -= (missingPatterns.length / testCase.expectedPatterns.length) * 30;
          details.missingPatterns = missingPatterns;
        }
      }

      // Check unexpected patterns
      if (testCase.unexpectedPatterns) {
        const foundUnexpected = testCase.unexpectedPatterns.filter(
          pattern => response.response.toLowerCase().includes(pattern.toLowerCase())
        );
        
        if (foundUnexpected.length > 0) {
          passed = false;
          score -= (foundUnexpected.length / testCase.unexpectedPatterns.length) * 30;
          details.unexpectedPatterns = foundUnexpected;
        }
      }

      // Check tool usage
      if (testCase.expectedTools) {
        const missingTools = testCase.expectedTools.filter(
          tool => !response.toolsUsed.includes(tool)
        );
        
        if (missingTools.length > 0) {
          passed = false;
          score -= (missingTools.length / testCase.expectedTools.length) * 20;
          details.missingTools = missingTools;
        }
      }

      // Additional checks based on category
      switch (testCase.category) {
        case 'personality':
          score = await this.evaluatePersonality(response.response, score);
          break;
        case 'accuracy':
          score = await this.evaluateAccuracy(response.response, testCase.context, score);
          break;
        case 'performance':
          score = this.evaluatePerformance(executionTime, score);
          break;
      }

      return {
        testId: testCase.id,
        passed,
        category: testCase.category,
        executionTime,
        response: response.response,
        toolsUsed: response.toolsUsed,
        score: Math.max(0, Math.min(100, score)),
        details,
      };
    } catch (error) {
      return {
        testId: testCase.id,
        passed: false,
        category: testCase.category,
        executionTime: Date.now() - testStartTime,
        error: (error as Error).message,
        score: 0,
        details: { error: true },
      };
    }
  }

  /**
   * Evaluate personality consistency
   */
  private async evaluatePersonality(response: string, currentScore: number): Promise<number> {
    const config = this.agent.getConfig();
    const personality = config.personality;

    // Check tone consistency
    if (personality.tone.includes('professional') && /lol|haha|😂/i.test(response)) {
      currentScore -= 10;
    }

    if (personality.tone.includes('humorous') && response.length > 100 && !/[!?]/.test(response)) {
      currentScore -= 5; // Lacks enthusiasm
    }

    // Check catchphrase usage (should appear occasionally)
    if (personality.catchphrases && Math.random() > 0.7) {
      const hasCatchphrase = personality.catchphrases.some(
        phrase => response.includes(phrase)
      );
      if (!hasCatchphrase) {
        currentScore -= 5;
      }
    }

    return currentScore;
  }

  /**
   * Evaluate accuracy of information
   */
  private async evaluateAccuracy(
    response: string,
    context: any,
    currentScore: number
  ): Promise<number> {
    // Check for common accuracy issues
    if (/\d{4,}/.test(response)) {
      // Contains large numbers - verify they're reasonable
      const numbers = response.match(/\d+/g) || [];
      for (const num of numbers) {
        if (parseInt(num) > 10000 && !context?.allowLargeNumbers) {
          currentScore -= 10; // Suspicious large number
        }
      }
    }

    // Check for contradictions
    if (response.includes('increase') && response.includes('decrease')) {
      currentScore -= 5; // Potential contradiction
    }

    return currentScore;
  }

  /**
   * Evaluate performance metrics
   */
  private evaluatePerformance(executionTime: number, currentScore: number): number {
    if (executionTime < 1000) {
      currentScore += 5; // Bonus for very fast response
    } else if (executionTime > 5000) {
      currentScore -= 15; // Penalty for slow response
    } else if (executionTime > 3000) {
      currentScore -= 5; // Minor penalty
    }

    return currentScore;
  }

  /**
   * Calculate overall suite results
   */
  private calculateSuiteResults(totalExecutionTime: number): TestSuiteResults {
    const passed = this.results.filter(r => r.passed).length;
    const failed = this.results.filter(r => !r.passed).length;

    // Calculate category scores
    const categoryScores: Record<string, number> = {};
    const categories = [...new Set(this.results.map(r => r.category))];
    
    for (const category of categories) {
      const categoryResults = this.results.filter(r => r.category === category);
      const avgScore = categoryResults.reduce((sum, r) => sum + r.score, 0) / categoryResults.length;
      categoryScores[category] = Math.round(avgScore);
    }

    // Calculate overall score
    const overallScore = Math.round(
      this.results.reduce((sum, r) => sum + r.score, 0) / this.results.length
    );

    // Generate recommendations
    const recommendations = this.generateRecommendations(categoryScores, this.results);

    return {
      agentId: this.agent.getConfig().id,
      agentType: this.agent.getConfig().type,
      totalTests: this.testCases.length,
      passed,
      failed,
      results: this.results,
      overallScore,
      executionTime: totalExecutionTime,
      categoryScores,
      recommendations,
    };
  }

  /**
   * Generate recommendations based on test results
   */
  private generateRecommendations(
    categoryScores: Record<string, number>,
    results: TestResult[]
  ): string[] {
    const recommendations: string[] = [];

    // Check category-specific issues
    if (categoryScores.personality && categoryScores.personality < 70) {
      recommendations.push('Improve personality consistency - agent responses don\'t match configured traits');
    }

    if (categoryScores.accuracy && categoryScores.accuracy < 80) {
      recommendations.push('Enhance accuracy - consider adding validation for generated data');
    }

    if (categoryScores.performance && categoryScores.performance < 75) {
      recommendations.push('Optimize performance - responses are taking too long');
    }

    // Check tool usage
    const toolFailures = results.filter(r => r.details?.missingTools);
    if (toolFailures.length > 2) {
      recommendations.push('Improve tool utilization - agent not using available tools effectively');
    }

    // Check response patterns
    const patternFailures = results.filter(r => r.details?.missingPatterns);
    if (patternFailures.length > 3) {
      recommendations.push('Review response generation - expected content patterns are missing');
    }

    // General recommendations
    if (results.filter(r => r.error).length > 0) {
      recommendations.push('Fix error handling - some tests resulted in exceptions');
    }

    if (recommendations.length === 0 && categoryScores.personality && categoryScores.personality > 90) {
      recommendations.push('Excellent performance! Consider adding more challenging test cases');
    }

    return recommendations;
  }

  /**
   * Print test summary to console
   */
  private printSummary(results: TestSuiteResults): void {
    console.log('\n' + '='.repeat(50));
    console.log(`AGENT TEST RESULTS: ${results.agentId}`);
    console.log('='.repeat(50));
    console.log(`Overall Score: ${results.overallScore}/100`);
    console.log(`Tests Passed: ${results.passed}/${results.totalTests}`);
    console.log(`Execution Time: ${results.executionTime}ms`);
    
    console.log('\nCategory Scores:');
    Object.entries(results.categoryScores).forEach(([category, score]) => {
      const emoji = score >= 80 ? '✅' : score >= 60 ? '⚠️' : '❌';
      console.log(`  ${emoji} ${category}: ${score}/100`);
    });
    
    if (results.recommendations.length > 0) {
      console.log('\nRecommendations:');
      results.recommendations.forEach(rec => {
        console.log(`  • ${rec}`);
      });
    }
    
    console.log('='.repeat(50) + '\n');
  }

  /**
   * Get default test cases for agent type
   */
  private getDefaultTestsForType(agentType: string): TestCase[] {
    const baseTests: TestCase[] = [
      {
        id: 'greeting-1',
        description: 'Responds appropriately to greeting',
        category: 'personality',
        input: 'Hello! How are you today?',
        maxResponseTime: 3000,
      },
      {
        id: 'help-1',
        description: 'Provides helpful information when asked',
        category: 'accuracy',
        input: 'What can you help me with?',
        expectedPatterns: ['help', 'assist', 'can'],
        maxResponseTime: 3000,
      },
      {
        id: 'data-1',
        description: 'Uses tools to fetch data',
        category: 'tools',
        input: 'Show me the current league standings',
        expectedTools: ['get_league_data'],
        maxResponseTime: 5000,
      },
    ];

    // Add agent-specific tests
    switch (agentType) {
      case 'COMMISSIONER':
        return [
          ...baseTests,
          {
            id: 'comm-ruling-1',
            description: 'Makes authoritative rulings',
            category: 'personality',
            input: 'Is this trade fair?',
            expectedPatterns: ['fair', 'balance', 'ruling'],
          },
          {
            id: 'comm-announce-1',
            description: 'Creates official announcements',
            category: 'personality',
            input: 'Make an announcement about the trade deadline',
            expectedPatterns: ['deadline', 'trade', 'official'],
          },
        ];
      
      case 'ANALYST':
        return [
          ...baseTests,
          {
            id: 'analyst-stats-1',
            description: 'Provides statistical analysis',
            category: 'accuracy',
            input: 'Analyze the performance trends',
            expectedPatterns: ['data', 'trend', 'analysis', '%'],
          },
          {
            id: 'analyst-proj-1',
            description: 'Makes data-driven projections',
            category: 'accuracy',
            input: 'What are the playoff projections?',
            expectedPatterns: ['projection', 'probability', '%'],
          },
        ];
      
      default:
        return baseTests;
    }
  }

  /**
   * Reset test cases and results
   */
  reset(): void {
    this.testCases = [];
    this.results = [];
  }

  /**
   * Get current test results
   */
  getResults(): TestResult[] {
    return this.results;
  }

  /**
   * Export results to JSON
   */
  exportResults(): string {
    return JSON.stringify(this.results, null, 2);
  }
}