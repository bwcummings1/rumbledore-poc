/**
 * Memory Store Unit Tests
 * 
 * Tests for the AI agent memory storage and retrieval system.
 */

import { MemoryVectorStore } from '@/lib/ai/memory-store';
import { PrismaClient } from '@prisma/client';

// Mock Prisma Client
jest.mock('@prisma/client', () => {
  const mockPrismaClient = {
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
    $disconnect: jest.fn(),
  };
  return { PrismaClient: jest.fn(() => mockPrismaClient) };
});

// Mock OpenAI Embeddings
jest.mock('@langchain/openai', () => ({
  OpenAIEmbeddings: jest.fn().mockImplementation(() => ({
    embedQuery: jest.fn().mockResolvedValue(new Array(1536).fill(0.1)),
  })),
}));

describe('MemoryVectorStore', () => {
  let memoryStore: MemoryVectorStore;
  let mockPrisma: any;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Set environment variable for testing
    process.env.OPENAI_API_KEY = 'test-key';
    
    // Create memory store instance
    memoryStore = new MemoryVectorStore({
      agentId: 'test-agent',
      leagueSandbox: 'test-league',
    });
    
    // Get mock prisma instance
    mockPrisma = (PrismaClient as any).mock.instances[0];
  });

  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
  });

  describe('store', () => {
    it('should store a memory with embedding', async () => {
      // Mock the database response
      mockPrisma.$queryRaw.mockResolvedValue([{ id: 'test-memory-id' }]);

      const memoryId = await memoryStore.store({
        content: 'Test memory content',
        metadata: { type: 'test' },
        importance: 0.8,
      });

      expect(memoryId).toBe('test-memory-id');
      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
      
      // Verify the SQL query contains the expected values
      const queryCall = mockPrisma.$queryRaw.mock.calls[0];
      expect(queryCall[0][0]).toContain('INSERT INTO agent_memories');
    });

    it('should handle storage errors gracefully', async () => {
      mockPrisma.$queryRaw.mockRejectedValue(new Error('Database error'));

      await expect(memoryStore.store({
        content: 'Test content',
      })).rejects.toThrow('Failed to store memory');
    });

    it('should validate memory input', async () => {
      await expect(memoryStore.store({
        content: '', // Empty content should fail validation
      })).rejects.toThrow();
    });
  });

  describe('retrieveRelevant', () => {
    it('should retrieve relevant memories based on similarity', async () => {
      const mockMemories = [
        {
          id: 'memory-1',
          content: 'League standings update',
          metadata: {},
          importance: 0.7,
          createdAt: new Date(),
          accessCount: 5,
          similarity: 0.85,
        },
        {
          id: 'memory-2',
          content: 'Trade evaluation',
          metadata: {},
          importance: 0.9,
          createdAt: new Date(),
          accessCount: 3,
          similarity: 0.75,
        },
      ];

      mockPrisma.$queryRaw.mockResolvedValue(mockMemories);
      mockPrisma.$executeRaw.mockResolvedValue(2);

      const results = await memoryStore.retrieveRelevant('league update', 5, 0.7);

      expect(results).toHaveLength(2);
      expect(results[0].similarity).toBe(0.85);
      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
      expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1); // Update access stats
    });

    it('should respect the similarity threshold', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);

      const results = await memoryStore.retrieveRelevant('test query', 5, 0.95);

      expect(results).toHaveLength(0);
      expect(mockPrisma.$executeRaw).not.toHaveBeenCalled(); // No updates if no results
    });

    it('should handle retrieval errors', async () => {
      mockPrisma.$queryRaw.mockRejectedValue(new Error('Query failed'));

      const results = await memoryStore.retrieveRelevant('test query');

      expect(results).toEqual([]); // Should return empty array on error
    });
  });

  describe('getStats', () => {
    it('should return memory statistics', async () => {
      const mockStats = [{
        totalMemories: 100,
        avgImportance: 0.75,
        lastAccess: new Date('2024-01-01'),
        totalAccesses: 500,
        oldestMemory: new Date('2023-01-01'),
        newestMemory: new Date('2024-01-01'),
      }];

      mockPrisma.$queryRaw.mockResolvedValue(mockStats);

      const stats = await memoryStore.getStats();

      expect(stats.totalMemories).toBe(100);
      expect(stats.avgImportance).toBe(0.75);
      expect(stats.totalAccesses).toBe(500);
      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
    });

    it('should handle empty stats', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{
        totalMemories: null,
        avgImportance: null,
        lastAccess: null,
        totalAccesses: null,
        oldestMemory: null,
        newestMemory: null,
      }]);

      const stats = await memoryStore.getStats();

      expect(stats.totalMemories).toBe(0);
      expect(stats.avgImportance).toBe(0);
      expect(stats.totalAccesses).toBe(0);
    });
  });

  describe('pruneOldMemories', () => {
    it('should prune old memories based on criteria', async () => {
      mockPrisma.$executeRaw.mockResolvedValue(10);

      const pruned = await memoryStore.pruneOldMemories(30, 0.7, 3);

      expect(pruned).toBe(10);
      expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1);
      
      // Verify the query includes the correct parameters
      const queryCall = mockPrisma.$executeRaw.mock.calls[0];
      expect(queryCall[0][0]).toContain('DELETE FROM agent_memories');
    });

    it('should handle no memories to prune', async () => {
      mockPrisma.$executeRaw.mockResolvedValue(0);

      const pruned = await memoryStore.pruneOldMemories(90, 0.5, 1);

      expect(pruned).toBe(0);
    });
  });

  describe('searchByMetadata', () => {
    it('should search memories by metadata', async () => {
      const mockResults = [
        {
          id: 'memory-1',
          content: 'Test content',
          metadata: { type: 'ruling', league: 'test' },
          importance: 0.9,
          createdAt: new Date(),
          accessCount: 10,
          similarity: 1.0,
        },
      ];

      mockPrisma.$queryRaw.mockResolvedValue(mockResults);

      const results = await memoryStore.searchByMetadata({ type: 'ruling' });

      expect(results).toHaveLength(1);
      expect(results[0].metadata.type).toBe('ruling');
      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
    });
  });

  describe('clear', () => {
    it('should clear all memories for the agent', async () => {
      mockPrisma.$executeRaw.mockResolvedValue(50);

      await memoryStore.clear();

      expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1);
      
      // Verify it's a DELETE query
      const queryCall = mockPrisma.$executeRaw.mock.calls[0];
      expect(queryCall[0][0]).toContain('DELETE FROM agent_memories');
    });
  });

  describe('updateImportance', () => {
    it('should update memory importance', async () => {
      mockPrisma.$executeRaw.mockResolvedValue(1);

      await memoryStore.updateImportance('memory-id', 0.95);

      expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1);
      
      // Verify it's an UPDATE query
      const queryCall = mockPrisma.$executeRaw.mock.calls[0];
      expect(queryCall[0][0]).toContain('UPDATE agent_memories');
    });
  });

  describe('getMostImportant', () => {
    it('should retrieve most important memories', async () => {
      const mockMemories = [
        {
          id: 'memory-1',
          content: 'Critical ruling',
          metadata: {},
          importance: 1.0,
          createdAt: new Date(),
          accessCount: 20,
          similarity: 1.0,
        },
        {
          id: 'memory-2',
          content: 'Important trade',
          metadata: {},
          importance: 0.95,
          createdAt: new Date(),
          accessCount: 15,
          similarity: 1.0,
        },
      ];

      mockPrisma.$queryRaw.mockResolvedValue(mockMemories);

      const results = await memoryStore.getMostImportant(2);

      expect(results).toHaveLength(2);
      expect(results[0].importance).toBe(1.0);
      expect(results[1].importance).toBe(0.95);
    });
  });

  describe('storeBatch', () => {
    it('should store multiple memories in batch', async () => {
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([{ id: 'memory-1' }])
        .mockResolvedValueOnce([{ id: 'memory-2' }])
        .mockResolvedValueOnce([{ id: 'memory-3' }]);

      const memories = [
        { content: 'Memory 1', importance: 0.7 },
        { content: 'Memory 2', importance: 0.8 },
        { content: 'Memory 3', importance: 0.9 },
      ];

      const ids = await memoryStore.storeBatch(memories);

      expect(ids).toEqual(['memory-1', 'memory-2', 'memory-3']);
      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(3);
    });

    it('should handle large batches', async () => {
      const largeBatch = Array(25).fill(null).map((_, i) => ({
        content: `Memory ${i}`,
        importance: 0.5,
      }));

      // Mock responses for each memory
      for (let i = 0; i < 25; i++) {
        mockPrisma.$queryRaw.mockResolvedValueOnce([{ id: `memory-${i}` }]);
      }

      const ids = await memoryStore.storeBatch(largeBatch);

      expect(ids).toHaveLength(25);
      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(25);
    });
  });
});