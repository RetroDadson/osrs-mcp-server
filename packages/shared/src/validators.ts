/**
 * 1-16 chars, ASCII letters/digits/space/hyphen/underscore only, not all-whitespace.
 * Mirrors the OSRS-mcp Rust server's `valid_name` exactly (same charset/length rules the
 * RuneLite plugin and existing accounts already assume).
 */
const NAME_PATTERN = /^[A-Za-z0-9 _-]{1,16}$/;

export function validName(name: string): boolean {
  return NAME_PATTERN.test(name) && name.trim().length > 0;
}

export interface ValidationResult {
  ok: boolean;
  message?: string;
}

export function validateStringLength(propName: string, value: string, maxLen: number): ValidationResult {
  if (value.length > maxLen) {
    return { ok: false, message: `${propName} must be at most ${maxLen} characters` };
  }
  return { ok: true };
}

export function validateOptionalStringLength(
  propName: string,
  value: string | undefined | null,
  maxLen: number,
): ValidationResult {
  if (value === undefined || value === null) return { ok: true };
  return validateStringLength(propName, value, maxLen);
}

export type ArrayFormat = 'flat' | 'item_pairs';

/** `min`/`max` are inclusive element-count bounds. `item_pairs` also requires an even length. */
export function validateSnapshotPropLength(
  propName: string,
  value: readonly unknown[] | undefined | null,
  min: number,
  max: number,
  format: ArrayFormat,
): ValidationResult {
  if (value === undefined || value === null) return { ok: true };
  if (value.length < min || value.length > max) {
    return { ok: false, message: `${propName} must have between ${min} and ${max} elements` };
  }
  if (format === 'item_pairs' && value.length % 2 !== 0) {
    return { ok: false, message: `${propName} must have an even number of elements (item id/quantity pairs)` };
  }
  return { ok: true };
}

/**
 * Per-field bounds for the partial `update` payload. Ported verbatim from the
 * original Rust server's per-field validation calls.
 */
export const SNAPSHOT_PROP_LIMITS = {
  // [hp, hp max, prayer, prayer max, run energy, run energy max] - no world number.
  stats: { min: 6, max: 6, format: 'flat' },
  skills: { min: 23, max: 24, format: 'flat' },
  quests: { min: 0, max: 250, format: 'flat' },
  inventory: { min: 56, max: 56, format: 'item_pairs' },
  equipment: { min: 28, max: 28, format: 'item_pairs' },
  bank: { min: 0, max: 3000, format: 'item_pairs' },
  shared_bank: { min: 0, max: 1000, format: 'item_pairs' },
  rune_pouch: { min: 6, max: 8, format: 'item_pairs' },
  seed_vault: { min: 0, max: 500, format: 'item_pairs' },
  deposited: { min: 0, max: 200, format: 'item_pairs' },
  diary_vars: { min: 0, max: 62, format: 'flat' },
  collection_log_v2: { min: 0, max: 4000, format: 'flat' },
  potion_storage: { min: 0, max: 400, format: 'item_pairs' },
  combat_achievements: { min: 6, max: 6, format: 'flat' },
  farming_patches: { min: 0, max: 20, format: 'flat' },
} as const satisfies Record<string, { min: number; max: number; format: ArrayFormat }>;

export const SLAYER_TASK_FIELD_LIMITS = { task: 100, master: 50 } as const;
export const DEATH_KILLER_MAX_LENGTH = 100;
