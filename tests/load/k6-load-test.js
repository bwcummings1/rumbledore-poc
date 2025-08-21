/**
 * k6 Load Testing Script for Rumbledore
 * Comprehensive performance testing with multiple scenarios
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter, Gauge } from 'k6/metrics';
import { randomString, randomIntBetween, randomItem } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';
import ws from 'k6/ws';
import { htmlReport } from 'https://raw.githubusercontent.com/benc-uk/k6-reporter/main/dist/bundle.js';

// Custom metrics
const apiErrors = new Rate('api_errors');
const apiResponseTime = new Trend('api_response_time');
const cacheHits = new Counter('cache_hits');
const cacheMisses = new Counter('cache_misses');
const dbQueryTime = new Trend('db_query_time');
const wsConnections = new Gauge('ws_connections');
const aiResponseTime = new Trend('ai_response_time');

// Test configuration
export const options = {
  scenarios: {
    // Smoke test
    smoke: {
      executor: 'constant-vus',
      vus: 2,
      duration: '1m',
      startTime: '0s',
      tags: { scenario: 'smoke' },
    },
    
    // Average load test
    average_load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 20 }, // Ramp up
        { duration: '5m', target: 20 }, // Stay at 20 users
        { duration: '2m', target: 0 },  // Ramp down
      ],
      startTime: '1m',
      tags: { scenario: 'average' },
    },
    
    // Stress test
    stress: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 50 },
        { duration: '5m', target: 50 },
        { duration: '2m', target: 100 },
        { duration: '5m', target: 100 },
        { duration: '2m', target: 0 },
      ],
      startTime: '10m',
      tags: { scenario: 'stress' },
    },
    
    // Spike test
    spike: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 100 },
        { duration: '1m', target: 100 },
        { duration: '10s', target: 0 },
      ],
      startTime: '26m',
      tags: { scenario: 'spike' },
    },
    
    // Soak test (optional - long running)
    /*
    soak: {
      executor: 'constant-vus',
      vus: 30,
      duration: '2h',
      startTime: '30m',
      tags: { scenario: 'soak' },
    },
    */
  },
  
  thresholds: {
    // HTTP thresholds
    http_req_duration: ['p(95)<1000', 'p(99)<2000'],
    http_req_failed: ['rate<0.05'],
    
    // Custom metric thresholds
    api_errors: ['rate<0.05'],
    api_response_time: ['p(95)<500'],
    ai_response_time: ['p(95)<3000'],
    db_query_time: ['p(95)<100'],
    
    // WebSocket thresholds
    ws_connecting: ['p(95)<500'],
    ws_msgs_sent: ['rate>0'],
    ws_msgs_received: ['rate>0'],
  },
  
  // Tags for filtering
  tags: {
    environment: 'test',
    team: 'performance',
  },
};

// Test configuration
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const WS_URL = __ENV.WS_URL || 'ws://localhost:3000';
const AUTH_TOKEN = __ENV.AUTH_TOKEN || generateAuthToken();

// Helper function to generate auth token
function generateAuthToken() {
  // In real scenario, this would be a valid JWT
  return 'Bearer test-jwt-token-' + randomString(10);
}

// Main test function
export default function () {
  // Select scenario based on execution context
  const scenario = __ENV.K6_SCENARIO || 'mixed';
  
  switch (scenario) {
    case 'api':
      testAPIEndpoints();
      break;
    case 'websocket':
      testWebSocket();
      break;
    case 'ai':
      testAIAgents();
      break;
    case 'betting':
      testBettingSystem();
      break;
    case 'mixed':
    default:
      // Run all tests with weights
      if (Math.random() < 0.3) testHomepage();
      if (Math.random() < 0.3) testAPIEndpoints();
      if (Math.random() < 0.2) testWebSocket();
      if (Math.random() < 0.1) testAIAgents();
      if (Math.random() < 0.1) testBettingSystem();
  }
  
  sleep(randomIntBetween(1, 5));
}

// Test homepage and static assets
function testHomepage() {
  group('Homepage', () => {
    const res = http.get(`${BASE_URL}/`);
    
    check(res, {
      'homepage status is 200': (r) => r.status === 200,
      'homepage loads quickly': (r) => r.timings.duration < 2000,
      'homepage has content': (r) => r.body.length > 1000,
    });
    
    // Parse and load critical resources
    const resources = res.html().find('link[rel="stylesheet"], script[src]').toArray();
    const responses = http.batch(
      resources.slice(0, 5).map(r => ({
        method: 'GET',
        url: r.attr('href') || r.attr('src'),
      }))
    );
    
    responses.forEach(r => {
      check(r, {
        'resource loaded': (r) => r.status === 200,
        'resource cached': (r) => {
          const cacheStatus = r.headers['X-Cache'];
          if (cacheStatus === 'HIT') {
            cacheHits.add(1);
            return true;
          } else {
            cacheMisses.add(1);
            return false;
          }
        },
      });
    });
  });
}

// Test API endpoints
function testAPIEndpoints() {
  const leagueId = 'test-league-' + randomString(8);
  const headers = {
    'Authorization': AUTH_TOKEN,
    'Content-Type': 'application/json',
  };
  
  group('API Endpoints', () => {
    // Test league endpoint
    group('League API', () => {
      const leagueRes = http.get(`${BASE_URL}/api/leagues/${leagueId}`, { headers });
      
      check(leagueRes, {
        'league API status ok': (r) => r.status === 200 || r.status === 404,
        'league API response time ok': (r) => {
          apiResponseTime.add(r.timings.duration);
          return r.timings.duration < 500;
        },
      });
      
      if (leagueRes.status >= 400) {
        apiErrors.add(1);
      } else {
        apiErrors.add(0);
      }
    });
    
    // Test statistics endpoint
    group('Statistics API', () => {
      const statsRes = http.get(`${BASE_URL}/api/statistics/season/${leagueId}`, { headers });
      
      check(statsRes, {
        'stats API status ok': (r) => r.status === 200 || r.status === 404,
        'stats API response time ok': (r) => {
          const queryTime = r.headers['X-DB-Query-Time'];
          if (queryTime) {
            dbQueryTime.add(parseFloat(queryTime));
          }
          return r.timings.duration < 1000;
        },
      });
    });
    
    // Test sync endpoint
    group('Sync API', () => {
      const syncRes = http.post(
        `${BASE_URL}/api/sync/${leagueId}`,
        JSON.stringify({ force: false }),
        { headers }
      );
      
      check(syncRes, {
        'sync API status ok': (r) => r.status === 200 || r.status === 202,
        'sync API returns job ID': (r) => {
          try {
            const body = JSON.parse(r.body);
            return body.data && body.data.jobId;
          } catch {
            return false;
          }
        },
      });
    });
  });
}

// Test WebSocket connections
function testWebSocket() {
  group('WebSocket', () => {
    const url = `${WS_URL}/socket.io/?EIO=4&transport=websocket`;
    const params = {
      headers: {
        'Authorization': AUTH_TOKEN,
      },
      tags: { type: 'websocket' },
    };
    
    const response = ws.connect(url, params, (socket) => {
      wsConnections.add(1);
      
      socket.on('open', () => {
        console.log('WebSocket connected');
        
        // Send auth
        socket.send(JSON.stringify({
          type: 'auth',
          token: AUTH_TOKEN,
        }));
        
        // Join league
        socket.send(JSON.stringify({
          type: 'join:league',
          leagueId: 'test-league-123',
        }));
      });
      
      socket.on('message', (data) => {
        // Handle different message types
        try {
          const message = JSON.parse(data);
          
          check(message, {
            'valid message format': (m) => m.type !== undefined,
          });
        } catch {
          // Binary message or non-JSON
        }
      });
      
      socket.on('error', (e) => {
        console.error('WebSocket error:', e);
      });
      
      socket.on('close', () => {
        wsConnections.add(-1);
      });
      
      // Simulate activity
      socket.setTimeout(() => {
        socket.send(JSON.stringify({
          type: 'request:sync',
          leagueId: 'test-league-123',
        }));
      }, 2000);
      
      socket.setTimeout(() => {
        socket.close();
      }, 10000);
    });
    
    check(response, {
      'WebSocket connected': (r) => r && r.status === 101,
    });
  });
}

// Test AI agents
function testAIAgents() {
  group('AI Agents', () => {
    const messages = [
      "What are the current standings?",
      "Analyze my team's performance",
      "Who should I start this week?",
      "Give me trade suggestions",
      "What are the playoff scenarios?",
    ];
    
    const agentTypes = ['commissioner', 'analyst', 'narrator', 'trash-talker'];
    
    const headers = {
      'Authorization': AUTH_TOKEN,
      'Content-Type': 'application/json',
    };
    
    const payload = JSON.stringify({
      leagueId: 'test-league-123',
      userId: 'test-user-456',
      message: randomItem(messages),
      agentType: randomItem(agentTypes),
    });
    
    const res = http.post(`${BASE_URL}/api/ai/chat`, payload, { headers });
    
    check(res, {
      'AI API status ok': (r) => r.status === 200,
      'AI API response time acceptable': (r) => {
        aiResponseTime.add(r.timings.duration);
        return r.timings.duration < 5000;
      },
      'AI response has content': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.data && body.data.response && body.data.response.length > 0;
        } catch {
          return false;
        }
      },
    });
  });
}

// Test betting system
function testBettingSystem() {
  group('Betting System', () => {
    const headers = {
      'Authorization': AUTH_TOKEN,
      'Content-Type': 'application/json',
    };
    
    // Get odds
    group('Get Odds', () => {
      const oddsRes = http.get(`${BASE_URL}/api/odds/nfl`, { headers });
      
      check(oddsRes, {
        'odds API status ok': (r) => r.status === 200,
        'odds cached': (r) => r.headers['X-Cache'] === 'HIT',
        'odds data present': (r) => {
          try {
            const body = JSON.parse(r.body);
            return body.data && body.data.odds && body.data.odds.length > 0;
          } catch {
            return false;
          }
        },
      });
      
      // Place bet if odds available
      if (oddsRes.status === 200) {
        try {
          const oddsData = JSON.parse(oddsRes.body);
          if (oddsData.data && oddsData.data.odds && oddsData.data.odds.length > 0) {
            const game = oddsData.data.odds[0];
            
            const betPayload = JSON.stringify({
              leagueId: 'test-league-123',
              userId: 'test-user-456',
              gameId: game.gameId,
              betType: 'STRAIGHT',
              marketType: 'SPREAD',
              selection: 'home',
              stake: randomIntBetween(50, 200),
              odds: -110,
            });
            
            const betRes = http.post(`${BASE_URL}/api/betting/bet`, betPayload, { headers });
            
            check(betRes, {
              'bet placed successfully': (r) => r.status === 201,
              'bet has ID': (r) => {
                try {
                  const body = JSON.parse(r.body);
                  return body.data && body.data.bet && body.data.bet.id;
                } catch {
                  return false;
                }
              },
            });
          }
        } catch (e) {
          console.error('Error placing bet:', e);
        }
      }
    });
  });
}

// Handle test summary
export function handleSummary(data) {
  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    'summary.html': htmlReport(data),
    'summary.json': JSON.stringify(data, null, 2),
  };
}

// Custom summary function
function textSummary(data, options) {
  const { indent = '', enableColors = false } = options;
  let summary = '\n';
  
  // Add header
  summary += `${indent}======== LOAD TEST SUMMARY ========\n\n`;
  
  // Add metrics summary
  summary += `${indent}Scenarios:\n`;
  Object.entries(data.metrics).forEach(([name, metric]) => {
    if (metric.type === 'trend') {
      summary += `${indent}  ${name}:\n`;
      summary += `${indent}    avg: ${metric.values.avg.toFixed(2)}ms\n`;
      summary += `${indent}    p95: ${metric.values['p(95)'].toFixed(2)}ms\n`;
      summary += `${indent}    p99: ${metric.values['p(99)'].toFixed(2)}ms\n`;
    } else if (metric.type === 'rate') {
      summary += `${indent}  ${name}: ${(metric.values.rate * 100).toFixed(2)}%\n`;
    } else if (metric.type === 'counter') {
      summary += `${indent}  ${name}: ${metric.values.count}\n`;
    }
  });
  
  // Add threshold results
  summary += `\n${indent}Thresholds:\n`;
  Object.entries(data.thresholds || {}).forEach(([name, result]) => {
    const status = result.ok ? '✓' : '✗';
    const color = enableColors ? (result.ok ? '\x1b[32m' : '\x1b[31m') : '';
    const reset = enableColors ? '\x1b[0m' : '';
    summary += `${indent}  ${color}${status}${reset} ${name}\n`;
  });
  
  summary += `\n${indent}====================================\n`;
  
  return summary;
}