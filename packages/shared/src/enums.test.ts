import { describe, expect, it } from 'vitest';
import { AccountTypeSchema, ClueTierSchema, CropStateSchema, ItemContainerSchema, SlayerTaskOutcomeSchema } from './enums.js';

describe('CropStateSchema', () => {
  it('accepts every documented crop state', () => {
    for (const value of ['growing', 'harvestable', 'diseased', 'dead', 'empty']) {
      expect(CropStateSchema.parse(value)).toBe(value);
    }
  });

  it('rejects an unknown value', () => {
    expect(CropStateSchema.safeParse('withered').success).toBe(false);
  });
});

describe('SlayerTaskOutcomeSchema', () => {
  it('accepts every documented outcome', () => {
    for (const value of ['completed', 'skipped', 'cancelled', 'unknown']) {
      expect(SlayerTaskOutcomeSchema.parse(value)).toBe(value);
    }
  });
});

describe('ClueTierSchema', () => {
  it('accepts every documented tier', () => {
    for (const value of ['beginner', 'easy', 'medium', 'hard', 'elite', 'master']) {
      expect(ClueTierSchema.parse(value)).toBe(value);
    }
  });
});

describe('AccountTypeSchema', () => {
  it('accepts every documented account type', () => {
    for (const value of ['hardcore_ironman', 'ultimate', 'ironman', 'regular']) {
      expect(AccountTypeSchema.parse(value)).toBe(value);
    }
  });
});

describe('ItemContainerSchema', () => {
  it('accepts every documented container', () => {
    for (const value of ['inventory', 'bank', 'equipment', 'seed_vault', 'shared_bank']) {
      expect(ItemContainerSchema.parse(value)).toBe(value);
    }
  });

  it('rejects an unknown container', () => {
    expect(ItemContainerSchema.safeParse('vault').success).toBe(false);
  });
});
