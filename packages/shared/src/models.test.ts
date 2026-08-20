import { describe, expect, it } from 'vitest';
import {
  ClueCompletionSchema,
  CreateLoginRequestSchema,
  DeathEventSchema,
  FarmingPatchSchema,
  LoginUpdateSchema,
  InteractingSchema,
  SlayerTaskCompletionSchema,
  SlayerTaskSchema,
} from './models.js';

describe('LoginUpdateSchema', () => {
  it('accepts a payload with only name set (partial update)', () => {
    const result = LoginUpdateSchema.safeParse({ name: 'Zezima' });
    expect(result.success).toBe(true);
  });

  it('accepts a full snapshot payload', () => {
    const result = LoginUpdateSchema.safeParse({
      name: 'Zezima',
      stats: [1, 2, 3, 4, 5, 6, 7],
      combat_achievements: [1, 2, 3, 4, 5, 6],
      slayer_task: {
        task: 'Gargoyles',
        amount_remaining: 5,
        initial_amount: 10,
        points: 2,
        task_streak: 1,
        wilderness_streak: 0,
      },
      farming_patches: [{ name: 'Herb patch (Falador)', raw_value: 0 }],
    });
    expect(result.success).toBe(true);
  });

  it('does NOT deny unknown fields (the plugin client may send extra fields to ignore)', () => {
    const result = LoginUpdateSchema.safeParse({ name: 'Zezima', some_future_field: 123 });
    expect(result.success).toBe(true);
  });

  it('requires name', () => {
    expect(LoginUpdateSchema.safeParse({ stats: [1] }).success).toBe(false);
  });
});

describe('FarmingPatchSchema', () => {
  it('defaults raw_value to 0 when absent', () => {
    const result = FarmingPatchSchema.parse({ name: 'Herb patch (Falador)' });
    expect(result.raw_value).toBe(0);
  });

  it('rejects unknown fields', () => {
    expect(FarmingPatchSchema.safeParse({ name: 'x', raw_value: 0, extra: true }).success).toBe(false);
  });
});

describe('SlayerTaskSchema', () => {
  it('accepts a task without master (best-effort/optional)', () => {
    const result = SlayerTaskSchema.safeParse({
      task: 'Gargoyles',
      amount_remaining: 5,
      initial_amount: 10,
      points: 2,
      task_streak: 1,
      wilderness_streak: 0,
    });
    expect(result.success).toBe(true);
  });
});

describe('InteractingSchema', () => {
  it('accepts a full interacting snapshot', () => {
    const result = InteractingSchema.safeParse({
      name: 'Gargoyle',
      scale: 100,
      ratio: 1,
      location: { x: 100, y: 200, plane: 0 },
    });
    expect(result.success).toBe(true);
  });
});

describe('SlayerTaskCompletionSchema', () => {
  it('rejects unknown fields', () => {
    const result = SlayerTaskCompletionSchema.safeParse({
      name: 'Zezima',
      task: 'Gargoyles',
      amount_completed: 10,
      outcome: 'completed',
      extra: 1,
    });
    expect(result.success).toBe(false);
  });

  it('accepts a valid completion without master', () => {
    const result = SlayerTaskCompletionSchema.safeParse({
      name: 'Zezima',
      task: 'Gargoyles',
      amount_completed: 10,
      outcome: 'completed',
    });
    expect(result.success).toBe(true);
  });
});

describe('ClueCompletionSchema', () => {
  it('rejects an invalid tier', () => {
    expect(ClueCompletionSchema.safeParse({ name: 'Zezima', tier: 'legendary' }).success).toBe(false);
  });
});

describe('DeathEventSchema', () => {
  it('accepts a death with all optional fields absent', () => {
    expect(DeathEventSchema.safeParse({ name: 'Zezima' }).success).toBe(true);
  });

  it('accepts a full death payload', () => {
    const result = DeathEventSchema.safeParse({
      name: 'Zezima',
      world_x: 3200,
      world_y: 3200,
      plane: 0,
      killer: 'Gargoyle',
    });
    expect(result.success).toBe(true);
  });
});

describe('CreateLoginRequestSchema', () => {
  it('defaults captcha_response to an empty string', () => {
    const result = CreateLoginRequestSchema.parse({ login_name: 'my-login' });
    expect(result.captcha_response).toBe('');
  });

  it('rejects unknown fields (e.g. a client-supplied token or a leftover member_names array)', () => {
    const withToken = CreateLoginRequestSchema.safeParse({ login_name: 'my-login', token: 'client-supplied' });
    expect(withToken.success).toBe(false);

    const withMemberNames = CreateLoginRequestSchema.safeParse({ login_name: 'my-login', member_names: ['a'] });
    expect(withMemberNames.success).toBe(false);
  });
});
