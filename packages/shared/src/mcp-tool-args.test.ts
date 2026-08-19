import { describe, expect, it } from 'vitest';
import {
  ClueTotalsArgsSchema,
  MemberSummarySchema,
  HistoryArgsSchema,
  ItemsArgsSchema,
  KillCountArgsSchema,
  MemberArgsSchema,
} from './mcp-tool-args.js';

describe('MemberArgsSchema', () => {
  it('makes member_name optional (auto-defaults when a login has one member)', () => {
    expect(MemberArgsSchema.safeParse({}).success).toBe(true);
    expect(MemberArgsSchema.safeParse({ member_name: 'Zezima' }).success).toBe(true);
  });
});

describe('ItemsArgsSchema', () => {
  it('rejects a container outside the fixed enum', () => {
    const result = ItemsArgsSchema.safeParse({ member_name: 'Zezima', container: 'wardrobe' });
    expect(result.success).toBe(false);
  });

  it('accepts every valid container', () => {
    for (const container of ['inventory', 'bank', 'equipment', 'seed_vault', 'shared_bank']) {
      expect(ItemsArgsSchema.safeParse({ member_name: 'Zezima', container }).success).toBe(true);
    }
  });
});

describe('HistoryArgsSchema', () => {
  it('makes limit optional', () => {
    expect(HistoryArgsSchema.safeParse({ member_name: 'Zezima' }).success).toBe(true);
  });

  it('rejects a non-positive limit', () => {
    expect(HistoryArgsSchema.safeParse({ member_name: 'Zezima', limit: 0 }).success).toBe(false);
    expect(HistoryArgsSchema.safeParse({ member_name: 'Zezima', limit: -5 }).success).toBe(false);
  });
});

describe('ClueTotalsArgsSchema and KillCountArgsSchema', () => {
  it('make their filter field optional', () => {
    expect(ClueTotalsArgsSchema.safeParse({ member_name: 'Zezima' }).success).toBe(true);
    expect(KillCountArgsSchema.safeParse({ member_name: 'Zezima' }).success).toBe(true);
  });
});

describe('MemberSummarySchema', () => {
  it('allows account_type to be null (not yet detected)', () => {
    const result = MemberSummarySchema.safeParse({ name: 'Zezima', account_type: null });
    expect(result.success).toBe(true);
  });
});
