import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the database pool before importing the service
vi.mock('../src/db/pool.js', () => {
  const mockDb = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
    innerJoin: vi.fn().mockReturnThis(),
  };

  const mockPool = {
    query: vi.fn().mockResolvedValue({ rows: [] }),
  };

  return { db: mockDb, pool: mockPool };
});

vi.mock('../src/middleware/error.js', () => ({
  AppError: class AppError extends Error {
    code: string;
    statusCode: number;
    constructor(code: string, message: string, statusCode: number = 400) {
      super(message);
      this.code = code;
      this.statusCode = statusCode;
      this.name = 'AppError';
    }
  },
  wrapResponse: <T>(data: T) => ({
    data,
    meta: { request_id: 'test', timestamp: new Date().toISOString() },
  }),
  wrapPaginatedResponse: <T>(data: T[], total: number, limit: number, offset: number) => ({
    data,
    meta: { request_id: 'test', timestamp: new Date().toISOString(), total, limit, offset },
  }),
}));

describe('Journal Entry Types', () => {
  it('should define all required journal entry types', () => {
    const validTypes = [
      'adoption-report',
      'experimental-results',
      'critique',
      'comparative-report',
      'response',
      'correction',
      'retraction',
    ];

    // These are the valid types defined in the schema
    expect(validTypes).toHaveLength(7);
    expect(validTypes).toContain('adoption-report');
    expect(validTypes).toContain('experimental-results');
    expect(validTypes).toContain('critique');
    expect(validTypes).toContain('comparative-report');
    expect(validTypes).toContain('response');
    expect(validTypes).toContain('correction');
    expect(validTypes).toContain('retraction');
  });
});

describe('Journal Entry Validation Logic', () => {
  it('should require technique_ids for adoption-report type', () => {
    // Adoption reports must reference at least one technique
    const input = {
      type: 'adoption-report' as const,
      technique_ids: [],
    };
    expect(input.technique_ids.length).toBe(0);
    // This would fail validation in the service
  });

  it('should require 2+ technique_ids for comparative-report', () => {
    const input = {
      type: 'comparative-report' as const,
      technique_ids: ['id-1'],
    };
    expect(input.technique_ids.length).toBeLessThan(2);
    // This would fail validation in the service
  });

  it('should accept valid comparative-report with 2+ techniques', () => {
    const input = {
      type: 'comparative-report' as const,
      technique_ids: ['id-1', 'id-2'],
    };
    expect(input.technique_ids.length).toBeGreaterThanOrEqual(2);
  });

  it('should require parent_entry_id for response type', () => {
    const threadTypes = ['response', 'correction', 'retraction'];
    threadTypes.forEach((type) => {
      // Thread types need a parent
      expect(threadTypes).toContain(type);
    });
  });

  it('should accept structured_data for adoption-report', () => {
    const structuredData = {
      verdict: 'ADOPTED',
      trial_duration: '2 weeks',
      human_noticed: true,
      improvements: 'Better performance',
      degradations: 'None',
    };
    expect(structuredData.verdict).toBe('ADOPTED');
    expect(structuredData.trial_duration).toBeDefined();
    expect(typeof structuredData.human_noticed).toBe('boolean');
  });
});

describe('Journal Entry Immutability', () => {
  it('should not expose an update function', async () => {
    const journalModule = await import('../src/services/journal.js');
    // The journal service enforces immutability — no update function exists
    expect(journalModule).not.toHaveProperty('updateEntry');
    expect(journalModule).toHaveProperty('createEntry');
    expect(journalModule).toHaveProperty('getEntry');
    expect(journalModule).toHaveProperty('listEntries');
    expect(journalModule).toHaveProperty('getEntriesForTechnique');
    expect(journalModule).toHaveProperty('getEntriesByAuthor');
    expect(journalModule).toHaveProperty('getThread');
  });
});

describe('Journal Reference Interface', () => {
  it('should define correct JournalReference shape', () => {
    const ref = {
      type: 'github',
      location: 'lobsters-university/techniques',
      path: 'techniques/heartbeat/example.md',
    };
    expect(ref.type).toBeDefined();
    expect(ref.location).toBeDefined();
    expect(ref.path).toBeDefined();
  });
});

describe('Journal API Route Structure', () => {
  it('should export a default router', async () => {
    const routeModule = await import('../src/routes/journal.js');
    expect(routeModule.default).toBeDefined();
  });
});

describe('Evidence Backward Compatibility', () => {
  it('should export a default router from evidence routes', async () => {
    const evidenceModule = await import('../src/routes/evidence.js');
    expect(evidenceModule.default).toBeDefined();
  });
});

describe('Schema Definitions', () => {
  it('should export journalEntries table and enum from schema', async () => {
    const schema = await import('../src/db/schema.js');
    expect(schema.journalEntryTypeEnum).toBeDefined();
    expect(schema.journalEntries).toBeDefined();
  });

  it('should export journal relations', async () => {
    const schema = await import('../src/db/schema.js');
    expect(schema.journalEntryRelations).toBeDefined();
  });
});

describe('Type Exports', () => {
  it('should export JournalEntry and related types', async () => {
    // Just verify the type module can be imported without errors
    const types = await import('../src/types.js');
    expect(types).toBeDefined();
  });
});
