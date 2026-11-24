import { describe, expect, it } from 'vitest';
import { ClueTotalsArgsSchema, HistoryArgsSchema, ItemsArgsSchema, KillCountArgsSchema } from './mcp-tool-args.js';

describe('ItemsArgsSchema', () => {
  it('rejects a container outside the fixed enum', () => {
    const result = ItemsArgsSchema.safeParse({ container: 'wardrobe' });
    expect(result.success).toBe(false);
  });

  it('accepts every valid container', () => {
    for (const container of ['inventory', 'bank', 'equipment', 'seed_vault', 'shared_bank', 'quiver']) {
      expect(ItemsArgsSchema.safeParse({ container }).success).toBe(true);
    }
  });
});

describe('HistoryArgsSchema', () => {
  it('makes limit optional', () => {
    expect(HistoryArgsSchema.safeParse({}).success).toBe(true);
  });

  it('rejects a non-positive limit', () => {
    expect(HistoryArgsSchema.safeParse({ limit: 0 }).success).toBe(false);
    expect(HistoryArgsSchema.safeParse({ limit: -5 }).success).toBe(false);
  });
});

describe('ClueTotalsArgsSchema and KillCountArgsSchema', () => {
  it('make their filter field optional', () => {
    expect(ClueTotalsArgsSchema.safeParse({}).success).toBe(true);
    expect(KillCountArgsSchema.safeParse({}).success).toBe(true);
  });
});
