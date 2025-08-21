/**
 * Artillery Load Test Processor
 * Custom functions for load testing
 */

const crypto = require('crypto');
const jwt = require('jsonwebtoken');

module.exports = {
  /**
   * Generate a random user ID
   */
  generateUserId: function(context, events, done) {
    context.vars.userId = `user-${crypto.randomBytes(8).toString('hex')}`;
    return done();
  },

  /**
   * Generate a random league ID
   */
  generateLeagueId: function(context, events, done) {
    context.vars.leagueId = `league-${crypto.randomBytes(8).toString('hex')}`;
    return done();
  },

  /**
   * Generate a JWT token for authentication
   */
  generateAuthToken: function(context, events, done) {
    const payload = {
      userId: context.vars.userId || 'test-user',
      leagueId: context.vars.leagueId || 'test-league',
      role: 'member',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (60 * 60), // 1 hour
    };

    const secret = process.env.JWT_SECRET || 'test-secret';
    context.vars.authToken = jwt.sign(payload, secret);
    return done();
  },

  /**
   * Set random think time
   */
  setRandomThinkTime: function(context, events, done) {
    context.vars.thinkTime = Math.floor(Math.random() * 5) + 1;
    return done();
  },

  /**
   * Validate response time
   */
  validateResponseTime: function(requestParams, response, context, ee, next) {
    const responseTime = response.headers['x-response-time'];
    if (responseTime && parseInt(responseTime) > 1000) {
      ee.emit('error', `Slow response: ${responseTime}ms`);
    }
    return next();
  },

  /**
   * Log errors for debugging
   */
  logError: function(requestParams, response, context, ee, next) {
    if (response.statusCode >= 400) {
      console.error(`Error ${response.statusCode}: ${response.body}`);
      ee.emit('error', `HTTP ${response.statusCode}`);
    }
    return next();
  },

  /**
   * Before request hook
   */
  beforeRequest: function(requestParams, context, ee, next) {
    // Add request ID for tracking
    requestParams.headers['X-Request-ID'] = crypto.randomBytes(16).toString('hex');
    
    // Add timestamp
    requestParams.headers['X-Request-Time'] = new Date().toISOString();
    
    return next();
  },

  /**
   * After response hook
   */
  afterResponse: function(requestParams, response, context, ee, next) {
    // Track custom metrics
    if (response.headers['x-cache']) {
      ee.emit('counter', `cache.${response.headers['x-cache'].toLowerCase()}`, 1);
    }
    
    if (response.headers['x-response-time']) {
      const responseTime = parseInt(response.headers['x-response-time']);
      ee.emit('histogram', 'response_time_custom', responseTime);
    }
    
    return next();
  },

  /**
   * Generate random bet data
   */
  generateBetData: function(context, events, done) {
    context.vars.betData = {
      stake: Math.floor(Math.random() * 500) + 50,
      odds: [-110, -105, +100, +110, +150][Math.floor(Math.random() * 5)],
      betType: ['STRAIGHT', 'PARLAY'][Math.floor(Math.random() * 2)],
      marketType: ['SPREAD', 'MONEYLINE', 'TOTAL'][Math.floor(Math.random() * 3)],
      selection: ['home', 'away', 'over', 'under'][Math.floor(Math.random() * 4)],
    };
    return done();
  },

  /**
   * Generate random message for AI chat
   */
  generateChatMessage: function(context, events, done) {
    const messages = [
      "What are the current standings?",
      "Who should I start this week?",
      "Analyze my team performance",
      "What are the playoff odds?",
      "Give me trade suggestions",
      "Who has the best record?",
      "What's the weather forecast for games?",
      "Show me injury reports",
      "Compare these two players",
      "What are the betting odds?",
    ];
    
    context.vars.chatMessage = messages[Math.floor(Math.random() * messages.length)];
    return done();
  },

  /**
   * Simulate WebSocket events
   */
  simulateWebSocketEvents: function(context, events, done) {
    const eventTypes = [
      'score:update',
      'transaction:new',
      'roster:update',
      'news:update',
      'matchup:update',
    ];
    
    context.vars.wsEvent = {
      type: eventTypes[Math.floor(Math.random() * eventTypes.length)],
      data: {
        timestamp: Date.now(),
        leagueId: context.vars.leagueId,
        random: Math.random(),
      },
    };
    
    return done();
  },

  /**
   * Check cache effectiveness
   */
  checkCacheHit: function(requestParams, response, context, ee, next) {
    const cacheStatus = response.headers['x-cache'];
    if (cacheStatus === 'HIT') {
      context.vars.cacheHits = (context.vars.cacheHits || 0) + 1;
    } else if (cacheStatus === 'MISS') {
      context.vars.cacheMisses = (context.vars.cacheMisses || 0) + 1;
    }
    
    // Emit cache ratio periodically
    const total = (context.vars.cacheHits || 0) + (context.vars.cacheMisses || 0);
    if (total > 0 && total % 100 === 0) {
      const hitRatio = (context.vars.cacheHits / total) * 100;
      ee.emit('customStat', 'cache_hit_ratio', hitRatio);
      console.log(`Cache hit ratio: ${hitRatio.toFixed(2)}%`);
    }
    
    return next();
  },

  /**
   * Validate API response structure
   */
  validateApiResponse: function(requestParams, response, context, ee, next) {
    try {
      const body = JSON.parse(response.body);
      
      // Check for required fields
      if (!body.success && !body.data) {
        ee.emit('error', 'Invalid API response structure');
      }
      
      // Check for error responses
      if (body.error) {
        ee.emit('error', `API error: ${body.error.message}`);
      }
      
    } catch (e) {
      // Not JSON response, might be HTML
    }
    
    return next();
  },

  /**
   * Calculate and report custom metrics
   */
  reportCustomMetrics: function(context, events, done) {
    // Report cache effectiveness
    if (context.vars.cacheHits || context.vars.cacheMisses) {
      const total = (context.vars.cacheHits || 0) + (context.vars.cacheMisses || 0);
      const hitRatio = total > 0 ? (context.vars.cacheHits || 0) / total : 0;
      console.log(`Final cache hit ratio: ${(hitRatio * 100).toFixed(2)}%`);
    }
    
    return done();
  },
};