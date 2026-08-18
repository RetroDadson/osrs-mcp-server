import { describe, expect, it } from 'vitest';
import { EQUIPMENT_SLOT_NAMES, SKILL_NAMES } from './constants.js';

describe('SKILL_NAMES', () => {
  it('has exactly 24 skills in RuneLite Skill-enum order, Overall excluded', () => {
    expect(SKILL_NAMES).toHaveLength(24);
    expect(SKILL_NAMES).not.toContain('Overall');
    expect(SKILL_NAMES[0]).toBe('Attack');
    expect(SKILL_NAMES[18]).toBe('Slayer');
    expect(SKILL_NAMES[23]).toBe('Sailing');
  });
});

describe('EQUIPMENT_SLOT_NAMES', () => {
  it('has exactly 14 fixed equipment slots in order', () => {
    expect(EQUIPMENT_SLOT_NAMES).toHaveLength(14);
    expect(EQUIPMENT_SLOT_NAMES[0]).toBe('head');
    expect(EQUIPMENT_SLOT_NAMES[3]).toBe('weapon');
    expect(EQUIPMENT_SLOT_NAMES[13]).toBe('ammo');
  });
});
