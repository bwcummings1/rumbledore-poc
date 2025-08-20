/**
 * Memory Vector Store for AI Agents
 * 
 * Integrates with PostgreSQL pgvector extension for semantic search
 * and memory management for league-specific AI agents.
 */

import { OpenAIEmbeddings } from '@langchain/openai';
import { PrismaClient, Prisma } from '@prisma/client';
import { z } from 'zod';

const prisma = new PrismaClient();

// Memory storage schema
const MemorySchema = z.object({
  content: z.string(),
  metadata: z.record(z.any()).optional(),
  importance: z.number().min(0).max(1).optional(),
});

export type MemoryInput = z.infer<typeof MemorySchema>;

export interface MemoryConfig {
  agentId: string;
  leagueSandbox?: string;
  embeddingModel?: string;
  dimensions?: number;
}

export interface MemorySearchResult {
  id: string;
  content: string;
  metadata: any;
  importance: number;
  similarity: number;
  createdAt: Date;
  accessCount: number;
}

export interface MemoryStats {
  totalMemories: number;
  avgImportance: number;
  lastAccess: Date | null;
  totalAccesses: number;
  oldestMemory: Date | null;
  newestMemory: Date | null;
}

export class MemoryVectorStore {
  private embeddings: OpenAIEmbeddings;
  private agentId: string;
  private leagueSandbox?: string;
  private dimensions: number;

  constructor(config: MemoryConfig) {
    this.agentId = config.agentId;
    this.leagueSandbox = config.leagueSandbox;
    this.dimensions = config.dimensions || 1536;

    // Initialize OpenAI embeddings
    this.embeddings = new OpenAIEmbeddings({
      modelName: config.embeddingModel || 'text-embedding-3-small',
      apiKey: process.env.OPENAI_API_KEY,
      dimensions: this.dimensions,
    });
  }

  /**
   * Store a memory with its embedding
   */
  async store(memory: MemoryInput): Promise<string> {
    try {
      // Validate input
      const validated = MemorySchema.parse(memory);
      
      // Generate embedding for the content
      const embedding = await this.embeddings.embedQuery(validated.content);
      
      // Store in database using raw SQL for pgvector
      const result = await prisma.$queryRaw<{ id: string }[]>`
        INSERT INTO agent_memories (
          agent_id, 
          league_sandbox, 
          content, 
          embedding, 
          metadata, 
          importance,
          created_at,
          accessed_at,
          access_count
        )
        VALUES (
          ${this.agentId},
          ${this.leagueSandbox || null},
          ${validated.content},
          ${embedding}::vector,
          ${JSON.stringify(validated.metadata || {})}::jsonb,
          ${validated.importance || 0.5},
          NOW(),
          NOW(),
          0
        )
        RETURNING id
      `;
      
      return result[0].id;
    } catch (error) {
      console.error('Error storing memory:', error);
      throw new Error(`Failed to store memory: ${(error as Error).message}`);
    }
  }

  /**
   * Store multiple memories in batch
   */
  async storeBatch(memories: MemoryInput[]): Promise<string[]> {
    const ids: string[] = [];
    
    // Process in batches to avoid overwhelming the API
    const batchSize = 10;
    for (let i = 0; i < memories.length; i += batchSize) {
      const batch = memories.slice(i, i + batchSize);
      
      // Generate embeddings for all memories in parallel
      const embeddings = await Promise.all(
        batch.map(m => this.embeddings.embedQuery(m.content))
      );
      
      // Store each memory with its embedding
      for (let j = 0; j < batch.length; j++) {
        const memory = batch[j];
        const embedding = embeddings[j];
        
        const result = await prisma.$queryRaw<{ id: string }[]>`
          INSERT INTO agent_memories (
            agent_id, 
            league_sandbox, 
            content, 
            embedding, 
            metadata, 
            importance
          )
          VALUES (
            ${this.agentId},
            ${this.leagueSandbox || null},
            ${memory.content},
            ${embedding}::vector,
            ${JSON.stringify(memory.metadata || {})}::jsonb,
            ${memory.importance || 0.5}
          )
          RETURNING id
        `;
        
        ids.push(result[0].id);
      }
    }
    
    return ids;
  }

  /**
   * Retrieve relevant memories based on semantic similarity
   */
  async retrieveRelevant(
    query: string,
    limit: number = 5,
    threshold: number = 0.7
  ): Promise<MemorySearchResult[]> {
    try {
      // Generate embedding for the query
      const queryEmbedding = await this.embeddings.embedQuery(query);
      
      // Search for similar memories using cosine similarity
      const results = await prisma.$queryRaw<MemorySearchResult[]>`
        SELECT 
          id::text,
          content,
          metadata,
          importance,
          created_at as "createdAt",
          access_count as "accessCount",
          1 - (embedding <=> ${queryEmbedding}::vector) as similarity
        FROM agent_memories
        WHERE 
          agent_id = ${this.agentId}
          ${this.leagueSandbox ? Prisma.sql`AND league_sandbox = ${this.leagueSandbox}` : Prisma.sql``}
          AND 1 - (embedding <=> ${queryEmbedding}::vector) > ${threshold}
        ORDER BY 
          importance * (1 - (embedding <=> ${queryEmbedding}::vector)) DESC
        LIMIT ${limit}
      `;
      
      // Update access statistics for retrieved memories
      if (results.length > 0) {
        const ids = results.map(r => r.id);
        await prisma.$executeRaw`
          UPDATE agent_memories 
          SET 
            accessed_at = NOW(),
            access_count = access_count + 1
          WHERE id = ANY(${ids}::uuid[])
        `;
      }
      
      return results;
    } catch (error) {
      console.error('Error retrieving memories:', error);
      return [];
    }
  }

  /**
   * Search memories by metadata
   */
  async searchByMetadata(
    metadataQuery: Record<string, any>,
    limit: number = 10
  ): Promise<MemorySearchResult[]> {
    const results = await prisma.$queryRaw<MemorySearchResult[]>`
      SELECT 
        id::text,
        content,
        metadata,
        importance,
        created_at as "createdAt",
        access_count as "accessCount",
        1.0 as similarity
      FROM agent_memories
      WHERE 
        agent_id = ${this.agentId}
        ${this.leagueSandbox ? Prisma.sql`AND league_sandbox = ${this.leagueSandbox}` : Prisma.sql``}
        AND metadata @> ${JSON.stringify(metadataQuery)}::jsonb
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
    
    return results;
  }

  /**
   * Get a specific memory by ID
   */
  async get(memoryId: string): Promise<MemorySearchResult | null> {
    const result = await prisma.$queryRaw<MemorySearchResult[]>`
      SELECT 
        id::text,
        content,
        metadata,
        importance,
        created_at as "createdAt",
        access_count as "accessCount",
        1.0 as similarity
      FROM agent_memories
      WHERE 
        id = ${memoryId}::uuid
        AND agent_id = ${this.agentId}
        ${this.leagueSandbox ? Prisma.sql`AND league_sandbox = ${this.leagueSandbox}` : Prisma.sql``}
      LIMIT 1
    `;
    
    return result[0] || null;
  }

  /**
   * Update the importance of a memory
   */
  async updateImportance(memoryId: string, importance: number): Promise<void> {
    await prisma.$executeRaw`
      UPDATE agent_memories
      SET importance = ${importance}
      WHERE 
        id = ${memoryId}::uuid
        AND agent_id = ${this.agentId}
        ${this.leagueSandbox ? Prisma.sql`AND league_sandbox = ${this.leagueSandbox}` : Prisma.sql``}
    `;
  }

  /**
   * Delete a specific memory
   */
  async delete(memoryId: string): Promise<void> {
    await prisma.$executeRaw`
      DELETE FROM agent_memories
      WHERE 
        id = ${memoryId}::uuid
        AND agent_id = ${this.agentId}
        ${this.leagueSandbox ? Prisma.sql`AND league_sandbox = ${this.leagueSandbox}` : Prisma.sql``}
    `;
  }

  /**
   * Clear all memories for this agent
   */
  async clear(): Promise<void> {
    await prisma.$executeRaw`
      DELETE FROM agent_memories
      WHERE 
        agent_id = ${this.agentId}
        ${this.leagueSandbox ? Prisma.sql`AND league_sandbox = ${this.leagueSandbox}` : Prisma.sql``}
    `;
  }

  /**
   * Get statistics about the memory store
   */
  async getStats(): Promise<MemoryStats> {
    const stats = await prisma.$queryRaw<any[]>`
      SELECT 
        COUNT(*)::int as "totalMemories",
        COALESCE(AVG(importance), 0)::float as "avgImportance",
        MAX(accessed_at) as "lastAccess",
        COALESCE(SUM(access_count), 0)::int as "totalAccesses",
        MIN(created_at) as "oldestMemory",
        MAX(created_at) as "newestMemory"
      FROM agent_memories
      WHERE 
        agent_id = ${this.agentId}
        ${this.leagueSandbox ? Prisma.sql`AND league_sandbox = ${this.leagueSandbox}` : Prisma.sql``}
    `;
    
    const result = stats[0];
    return {
      totalMemories: result.totalMemories || 0,
      avgImportance: result.avgImportance || 0,
      lastAccess: result.lastAccess,
      totalAccesses: result.totalAccesses || 0,
      oldestMemory: result.oldestMemory,
      newestMemory: result.newestMemory,
    };
  }

  /**
   * Prune old memories based on age and importance
   */
  async pruneOldMemories(
    daysOld: number = 30,
    keepImportantThreshold: number = 0.7,
    keepAccessedThreshold: number = 3
  ): Promise<number> {
    const result = await prisma.$executeRaw`
      DELETE FROM agent_memories
      WHERE 
        agent_id = ${this.agentId}
        ${this.leagueSandbox ? Prisma.sql`AND league_sandbox = ${this.leagueSandbox}` : Prisma.sql``}
        AND accessed_at < NOW() - INTERVAL '${Prisma.sql`${daysOld} days`}'
        AND importance < ${keepImportantThreshold}
        AND access_count < ${keepAccessedThreshold}
    `;
    
    return Number(result);
  }

  /**
   * Consolidate similar memories to reduce redundancy
   */
  async consolidateSimilarMemories(
    similarityThreshold: number = 0.95,
    keepMostImportant: boolean = true
  ): Promise<number> {
    // Get all memories
    const memories = await prisma.$queryRaw<any[]>`
      SELECT 
        id,
        content,
        embedding,
        importance,
        access_count
      FROM agent_memories
      WHERE 
        agent_id = ${this.agentId}
        ${this.leagueSandbox ? Prisma.sql`AND league_sandbox = ${this.leagueSandbox}` : Prisma.sql``}
      ORDER BY importance DESC, access_count DESC
    `;
    
    let consolidatedCount = 0;
    const processedIds = new Set<string>();
    
    for (const memory of memories) {
      if (processedIds.has(memory.id)) continue;
      
      // Find similar memories
      const similar = await prisma.$queryRaw<any[]>`
        SELECT 
          id,
          1 - (embedding <=> ${memory.embedding}::vector) as similarity
        FROM agent_memories
        WHERE 
          agent_id = ${this.agentId}
          ${this.leagueSandbox ? Prisma.sql`AND league_sandbox = ${this.leagueSandbox}` : Prisma.sql``}
          AND id != ${memory.id}::uuid
          AND 1 - (embedding <=> ${memory.embedding}::vector) > ${similarityThreshold}
      `;
      
      if (similar.length > 0) {
        // Mark similar memories for deletion (keep the most important one)
        for (const sim of similar) {
          processedIds.add(sim.id);
          
          if (!keepMostImportant || memory.importance >= sim.importance) {
            await this.delete(sim.id);
            consolidatedCount++;
          }
        }
      }
      
      processedIds.add(memory.id);
    }
    
    return consolidatedCount;
  }

  /**
   * Export memories for backup or analysis
   */
  async export(): Promise<any[]> {
    const memories = await prisma.$queryRaw`
      SELECT 
        id::text,
        content,
        metadata,
        importance,
        created_at,
        access_count
      FROM agent_memories
      WHERE 
        agent_id = ${this.agentId}
        ${this.leagueSandbox ? Prisma.sql`AND league_sandbox = ${this.leagueSandbox}` : Prisma.sql``}
      ORDER BY created_at DESC
    `;
    
    return memories;
  }

  /**
   * Import memories from backup
   */
  async import(memories: any[]): Promise<void> {
    for (const memory of memories) {
      await this.store({
        content: memory.content,
        metadata: memory.metadata,
        importance: memory.importance,
      });
    }
  }

  /**
   * Get the most important memories
   */
  async getMostImportant(limit: number = 10): Promise<MemorySearchResult[]> {
    const results = await prisma.$queryRaw<MemorySearchResult[]>`
      SELECT 
        id::text,
        content,
        metadata,
        importance,
        created_at as "createdAt",
        access_count as "accessCount",
        1.0 as similarity
      FROM agent_memories
      WHERE 
        agent_id = ${this.agentId}
        ${this.leagueSandbox ? Prisma.sql`AND league_sandbox = ${this.leagueSandbox}` : Prisma.sql``}
      ORDER BY importance DESC, access_count DESC
      LIMIT ${limit}
    `;
    
    return results;
  }

  /**
   * Get the most frequently accessed memories
   */
  async getMostAccessed(limit: number = 10): Promise<MemorySearchResult[]> {
    const results = await prisma.$queryRaw<MemorySearchResult[]>`
      SELECT 
        id::text,
        content,
        metadata,
        importance,
        created_at as "createdAt",
        access_count as "accessCount",
        1.0 as similarity
      FROM agent_memories
      WHERE 
        agent_id = ${this.agentId}
        ${this.leagueSandbox ? Prisma.sql`AND league_sandbox = ${this.leagueSandbox}` : Prisma.sql``}
      ORDER BY access_count DESC, importance DESC
      LIMIT ${limit}
    `;
    
    return results;
  }
}