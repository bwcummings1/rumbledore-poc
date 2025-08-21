/**
 * Database Query Optimizer
 * Analyzes and optimizes database queries
 */

import { PrismaClient } from '@prisma/client';
import performanceMonitor from '../monitoring/performance-monitor';

export interface QueryAnalysis {
  query: string;
  avgTime: number;
  calls: number;
  totalTime: number;
  suggestions: string[];
}

export interface IndexRecommendation {
  table: string;
  columns: string[];
  type: 'btree' | 'hash' | 'gin' | 'gist';
  reason: string;
  estimatedImprovement: number;
}

export class QueryOptimizer {
  private prisma: PrismaClient;
  
  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Analyze slow queries using pg_stat_statements
   */
  async analyzeSlowQueries(threshold: number = 100): Promise<QueryAnalysis[]> {
    try {
      // First, ensure pg_stat_statements is enabled
      await this.ensurePgStatStatements();
      
      const slowQueries = await this.prisma.$queryRaw<any[]>`
        SELECT 
          query,
          mean_exec_time as mean_time,
          calls,
          total_exec_time as total_time,
          rows,
          100.0 * shared_blks_hit / nullif(shared_blks_hit + shared_blks_read, 0) AS hit_percent
        FROM pg_stat_statements
        WHERE mean_exec_time > ${threshold}
          AND query NOT LIKE '%pg_stat_statements%'
          AND query NOT LIKE '%COMMIT%'
          AND query NOT LIKE '%BEGIN%'
        ORDER BY mean_exec_time DESC
        LIMIT 20
      `;
      
      return slowQueries.map(q => ({
        query: this.sanitizeQuery(q.query),
        avgTime: parseFloat(q.mean_time),
        calls: parseInt(q.calls),
        totalTime: parseFloat(q.total_time),
        suggestions: this.generateOptimizationSuggestions(q),
      }));
    } catch (error) {
      console.error('Failed to analyze slow queries:', error);
      // Fallback to basic analysis if pg_stat_statements is not available
      return this.fallbackQueryAnalysis();
    }
  }

  /**
   * Ensure pg_stat_statements extension is created
   */
  private async ensurePgStatStatements() {
    try {
      await this.prisma.$executeRaw`CREATE EXTENSION IF NOT EXISTS pg_stat_statements`;
    } catch (error) {
      console.warn('Could not create pg_stat_statements extension:', error);
    }
  }

  /**
   * Fallback query analysis when pg_stat_statements is not available
   */
  private async fallbackQueryAnalysis(): Promise<QueryAnalysis[]> {
    // Analyze table statistics
    const tableStats = await this.prisma.$queryRaw<any[]>`
      SELECT 
        schemaname,
        tablename,
        n_live_tup as row_count,
        n_dead_tup as dead_rows,
        last_vacuum,
        last_autovacuum
      FROM pg_stat_user_tables
      WHERE schemaname = 'public'
      ORDER BY n_live_tup DESC
    `;
    
    const suggestions: QueryAnalysis[] = [];
    
    for (const table of tableStats) {
      if (table.dead_rows > table.row_count * 0.2) {
        suggestions.push({
          query: `Table: ${table.tablename}`,
          avgTime: 0,
          calls: 0,
          totalTime: 0,
          suggestions: [`Table ${table.tablename} has ${table.dead_rows} dead rows. Consider running VACUUM.`],
        });
      }
    }
    
    return suggestions;
  }

  /**
   * Create performance indexes
   */
  async createIndexes(): Promise<void> {
    console.log('Creating performance indexes...');
    
    const indexes = [
      // League-based queries
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_league_member_lookup ON "LeagueMember"("leagueId", "userId")',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_league_teams ON "LeagueTeam"("leagueId", "espnTeamId")',
      
      // Betting queries
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bets_user_week ON "Bet"("userId", "week", "createdAt" DESC)',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bets_status ON "Bet"(status) WHERE status = \'PENDING\'',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bankroll_user_league ON "Bankroll"("userId", "leagueId", week DESC)',
      
      // Competition queries
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_competition_active ON "Competition"(status) WHERE status = \'ACTIVE\'',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_competition_entry_lookup ON "CompetitionEntry"("competitionId", "userId")',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leaderboard_comp ON "Leaderboard"("competitionId", "lastCalculated" DESC)',
      
      // Content queries
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_content_published ON "GeneratedContent"(status, "publishedAt" DESC) WHERE status = \'PUBLISHED\'',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_blog_posts_league ON "BlogPost"("leagueId", "publishedAt" DESC)',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_content_schedule_active ON "ContentSchedule"("isActive", "nextRun") WHERE "isActive" = true',
      
      // Statistics queries
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_matchup_lookup ON "LeagueMatchup"("leagueId", "seasonId", week)',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_player_stats ON "LeaguePlayerStats"("playerId", "seasonId", week)',
      
      // Agent/Chat queries
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agent_memory_league ON "AgentMemory"("leagueId", "createdAt" DESC)',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chat_session ON "ChatSession"("userId", "leagueId", "createdAt" DESC)',
      
      // Identity resolution
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_player_mapping ON "PlayerIdentityMapping"("espnPlayerId", "identityId")',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_team_mapping ON "TeamIdentityMapping"("espnTeamId", "identityId")',
      
      // GIN indexes for JSONB columns
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_odds_snapshot_data ON "OddsSnapshot" USING gin(data)',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bet_parlay_legs ON "Bet" USING gin("parlayLegs") WHERE "parlayLegs" IS NOT NULL',
      
      // Partial indexes for common filters
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_verified ON "User"("emailVerified") WHERE "emailVerified" IS NOT NULL',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leagues_active ON "League"("isActive") WHERE "isActive" = true',
    ];
    
    for (const index of indexes) {
      try {
        await this.prisma.$executeRawUnsafe(index);
        console.log(`✓ Created index: ${this.extractIndexName(index)}`);
        
        // Track index creation
        performanceMonitor.recordMetric({
          name: 'db.index.created',
          value: 1,
          unit: 'count',
          timestamp: Date.now(),
          tags: {
            index: this.extractIndexName(index),
          },
        });
      } catch (error: any) {
        if (error.message?.includes('already exists')) {
          console.log(`- Index already exists: ${this.extractIndexName(index)}`);
        } else {
          console.error(`✗ Failed to create index: ${this.extractIndexName(index)}`, error.message);
        }
      }
    }
  }

  /**
   * Create materialized views for complex queries
   */
  async implementMaterializedViews(): Promise<void> {
    console.log('Creating materialized views...');
    
    // League summary view
    await this.createMaterializedView(
      'league_summary_mv',
      `SELECT 
        l.id as league_id,
        l.name as league_name,
        l."espnLeagueId",
        COUNT(DISTINCT lm."userId") as member_count,
        COUNT(DISTINCT lt.id) as team_count,
        COUNT(DISTINCT lma.id) as matchup_count,
        MAX(lma."gameDate") as last_game_date,
        NOW() as last_updated
      FROM "League" l
      LEFT JOIN "LeagueMember" lm ON l.id = lm."leagueId"
      LEFT JOIN "LeagueTeam" lt ON l.id = lt."leagueId"
      LEFT JOIN "LeagueMatchup" lma ON l.id = lma."leagueId"
      WHERE l."isActive" = true
      GROUP BY l.id, l.name, l."espnLeagueId"`
    );
    
    // User statistics summary
    await this.createMaterializedView(
      'user_stats_mv',
      `SELECT 
        u.id as user_id,
        u.username,
        COUNT(DISTINCT b.id) as total_bets,
        COUNT(DISTINCT b.id) FILTER (WHERE b.status = 'WON') as won_bets,
        COUNT(DISTINCT b.id) FILTER (WHERE b.status = 'LOST') as lost_bets,
        COALESCE(SUM(b.stake), 0) as total_wagered,
        COALESCE(SUM(b."actualPayout") FILTER (WHERE b.status = 'WON'), 0) as total_winnings,
        COUNT(DISTINCT ce.id) as competitions_entered,
        COUNT(DISTINCT cr.id) as competitions_won,
        NOW() as last_updated
      FROM "User" u
      LEFT JOIN "Bet" b ON u.id = b."userId"
      LEFT JOIN "CompetitionEntry" ce ON u.id = ce."userId"
      LEFT JOIN "CompetitionReward" cr ON u.id = cr."userId" AND cr.rank = 1
      GROUP BY u.id, u.username`
    );
    
    // Competition leaderboard cache
    await this.createMaterializedView(
      'competition_leaderboard_mv',
      `SELECT 
        c.id as competition_id,
        c.name as competition_name,
        ce."userId",
        u.username,
        ce.score,
        ce.rank,
        COUNT(b.id) as bet_count,
        COUNT(b.id) FILTER (WHERE b.status = 'WON') as wins,
        COALESCE(SUM(b."actualPayout") - SUM(b.stake), 0) as profit,
        NOW() as last_updated
      FROM "Competition" c
      INNER JOIN "CompetitionEntry" ce ON c.id = ce."competitionId"
      INNER JOIN "User" u ON ce."userId" = u.id
      LEFT JOIN "Bet" b ON u.id = b."userId" 
        AND b."createdAt" >= c."startDate" 
        AND b."createdAt" <= c."endDate"
      WHERE c.status IN ('ACTIVE', 'COMPLETED')
      GROUP BY c.id, c.name, ce."userId", u.username, ce.score, ce.rank`
    );
    
    // Content performance view
    await this.createMaterializedView(
      'content_performance_mv',
      `SELECT 
        gc.id as content_id,
        gc."leagueId",
        gc.type,
        gc.status,
        gc."qualityScore",
        bp.views,
        bp."readTime",
        gc."generatedAt",
        gc."publishedAt",
        NOW() as last_updated
      FROM "GeneratedContent" gc
      LEFT JOIN "BlogPost" bp ON gc.id = bp."contentId"
      WHERE gc.status = 'PUBLISHED'`
    );
  }

  /**
   * Helper to create a materialized view
   */
  private async createMaterializedView(name: string, query: string) {
    try {
      // Drop existing view if it exists
      await this.prisma.$executeRawUnsafe(`DROP MATERIALIZED VIEW IF EXISTS ${name}`);
      
      // Create the materialized view
      await this.prisma.$executeRawUnsafe(`
        CREATE MATERIALIZED VIEW ${name} AS ${query}
      `);
      
      // Create unique index for concurrent refresh
      const primaryKey = name.includes('league') ? 'league_id' : 
                         name.includes('user') ? 'user_id' :
                         name.includes('competition') ? 'competition_id' :
                         'content_id';
      
      await this.prisma.$executeRawUnsafe(`
        CREATE UNIQUE INDEX ON ${name}(${primaryKey})
      `);
      
      console.log(`✓ Created materialized view: ${name}`);
      
      performanceMonitor.recordMetric({
        name: 'db.view.created',
        value: 1,
        unit: 'count',
        timestamp: Date.now(),
        tags: { view: name },
      });
    } catch (error: any) {
      console.error(`✗ Failed to create materialized view ${name}:`, error.message);
    }
  }

  /**
   * Refresh all materialized views
   */
  async refreshMaterializedViews(concurrent: boolean = true): Promise<void> {
    const views = [
      'league_summary_mv',
      'user_stats_mv',
      'competition_leaderboard_mv',
      'content_performance_mv',
    ];
    
    for (const view of views) {
      try {
        const start = Date.now();
        const refresh = concurrent ? 'CONCURRENTLY' : '';
        
        await this.prisma.$executeRawUnsafe(`
          REFRESH MATERIALIZED VIEW ${refresh} ${view}
        `);
        
        const duration = Date.now() - start;
        console.log(`✓ Refreshed view ${view} in ${duration}ms`);
        
        performanceMonitor.recordMetric({
          name: 'db.view.refresh',
          value: duration,
          unit: 'ms',
          timestamp: Date.now(),
          tags: { view },
        });
      } catch (error: any) {
        console.error(`✗ Failed to refresh view ${view}:`, error.message);
      }
    }
  }

  /**
   * Analyze table sizes and recommend optimizations
   */
  async analyzeTableSizes(): Promise<void> {
    const tables = await this.prisma.$queryRaw<any[]>`
      SELECT 
        schemaname,
        tablename,
        pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
        pg_total_relation_size(schemaname||'.'||tablename) as size_bytes
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
      LIMIT 20
    `;
    
    console.log('\nTable Sizes:');
    tables.forEach(table => {
      console.log(`  ${table.tablename}: ${table.size}`);
      
      // Recommend partitioning for large tables
      if (table.size_bytes > 1000000000) { // > 1GB
        console.log(`    ⚠️ Consider partitioning ${table.tablename}`);
      }
    });
  }

  /**
   * Generate optimization suggestions based on query analysis
   */
  private generateOptimizationSuggestions(queryStats: any): string[] {
    const suggestions: string[] = [];
    
    // Check cache hit ratio
    if (queryStats.hit_percent && queryStats.hit_percent < 90) {
      suggestions.push('Low cache hit ratio. Consider increasing shared_buffers.');
    }
    
    // Check for sequential scans
    if (queryStats.query.includes('Seq Scan')) {
      suggestions.push('Query uses sequential scan. Consider adding an index.');
    }
    
    // Check for high row counts
    if (queryStats.rows > 10000) {
      suggestions.push('Query returns many rows. Consider pagination or filtering.');
    }
    
    // Check for missing indexes based on WHERE clauses
    const whereMatch = queryStats.query.match(/WHERE\s+(\w+)/i);
    if (whereMatch) {
      suggestions.push(`Consider indexing column: ${whereMatch[1]}`);
    }
    
    // Check for JOIN operations
    if (queryStats.query.includes('JOIN')) {
      suggestions.push('Query uses JOIN. Ensure foreign key columns are indexed.');
    }
    
    return suggestions;
  }

  /**
   * Sanitize query for display
   */
  private sanitizeQuery(query: string): string {
    return query
      .replace(/\$\d+/g, '?') // Replace parameter placeholders
      .replace(/\s+/g, ' ') // Normalize whitespace
      .substring(0, 200); // Truncate long queries
  }

  /**
   * Extract index name from CREATE INDEX statement
   */
  private extractIndexName(statement: string): string {
    const match = statement.match(/INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/i);
    return match ? match[1] : 'unknown';
  }

  /**
   * Run VACUUM and ANALYZE on tables
   */
  async optimizeTables(): Promise<void> {
    console.log('Running VACUUM and ANALYZE...');
    
    try {
      // Run VACUUM ANALYZE on all tables
      await this.prisma.$executeRawUnsafe('VACUUM ANALYZE');
      console.log('✓ VACUUM ANALYZE completed');
      
      // Update table statistics
      await this.prisma.$executeRawUnsafe('ANALYZE');
      console.log('✓ Statistics updated');
    } catch (error) {
      console.error('Failed to optimize tables:', error);
    }
  }

  /**
   * Get index usage statistics
   */
  async getIndexUsage(): Promise<void> {
    const indexStats = await this.prisma.$queryRaw<any[]>`
      SELECT 
        schemaname,
        tablename,
        indexname,
        idx_scan as index_scans,
        idx_tup_read as tuples_read,
        idx_tup_fetch as tuples_fetched,
        pg_size_pretty(pg_relation_size(indexrelid)) as index_size
      FROM pg_stat_user_indexes
      WHERE schemaname = 'public'
      ORDER BY idx_scan DESC
      LIMIT 20
    `;
    
    console.log('\nIndex Usage:');
    indexStats.forEach(idx => {
      console.log(`  ${idx.indexname}: ${idx.index_scans} scans, ${idx.index_size}`);
      
      if (idx.index_scans === 0) {
        console.log(`    ⚠️ Unused index - consider dropping`);
      }
    });
  }
}

export default QueryOptimizer;