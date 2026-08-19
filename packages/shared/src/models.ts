import { z } from 'zod';
import { CropStateSchema, SlayerTaskOutcomeSchema, ClueTierSchema } from './enums.js';

export const CoordinatesSchema = z
  .object({
    x: z.number().int(),
    y: z.number().int(),
    plane: z.number().int(),
  })
  .strict();
export type Coordinates = z.infer<typeof CoordinatesSchema>;

export const InteractingSchema = z
  .object({
    name: z.string(),
    scale: z.number().int(),
    ratio: z.number().int(),
    location: CoordinatesSchema,
    last_updated: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();
export type Interacting = z.infer<typeof InteractingSchema>;

export const FarmingPatchSchema = z
  .object({
    name: z.string(),
    state: CropStateSchema.optional(),
    raw_value: z.number().int().default(0),
    produce: z.string().optional(),
  })
  .strict();
export type FarmingPatch = z.infer<typeof FarmingPatchSchema>;

export const SlayerTaskSchema = z
  .object({
    task: z.string(),
    master: z.string().optional(),
    amount_remaining: z.number().int(),
    initial_amount: z.number().int(),
    points: z.number().int(),
    task_streak: z.number().int(),
    wilderness_streak: z.number().int(),
  })
  .strict();
export type SlayerTask = z.infer<typeof SlayerTaskSchema>;

export const RenameMemberSchema = z
  .object({
    original_name: z.string(),
    new_name: z.string(),
  })
  .strict();
export type RenameMember = z.infer<typeof RenameMemberSchema>;

export const AmIAMemberQuerySchema = z
  .object({
    member_name: z.string(),
  })
  .strict();
export type AmIAMemberQuery = z.infer<typeof AmIAMemberQuerySchema>;

/**
 * Partial update payload for `POST /api/login/:loginName/update-member`. Every field
 * except `name` is optional (a `null`/absent field means "unchanged", not "clear the value") -
 * mirrors the Rust `GroupMember` struct, which is deliberately NOT `deny_unknown_fields` since
 * the plugin client may send extra fields the server should just ignore.
 */
export const MemberUpdateSchema = z.object({
  name: z.string(),
  stats: z.array(z.number().int()).optional(),
  coordinates: z.array(z.number().int()).optional(),
  skills: z.array(z.number().int()).optional(),
  quests: z.array(z.number().int().min(0).max(255)).optional(),
  inventory: z.array(z.number().int()).optional(),
  equipment: z.array(z.number().int()).optional(),
  bank: z.array(z.number().int()).optional(),
  shared_bank: z.array(z.number().int()).optional(),
  rune_pouch: z.array(z.number().int()).optional(),
  interacting: InteractingSchema.optional(),
  seed_vault: z.array(z.number().int()).optional(),
  deposited: z.array(z.number().int()).optional(),
  diary_vars: z.array(z.number().int()).optional(),
  collection_log_v2: z.array(z.number().int()).optional(),
  potion_storage: z.array(z.number().int()).optional(),
  slayer_task: SlayerTaskSchema.optional(),
  combat_achievements: z.array(z.number().int()).optional(),
  farming_patches: z.array(FarmingPatchSchema).optional(),
  account_type: z.string().optional(),
  last_updated: z.iso.datetime({ offset: true }).optional(),
});
export type MemberUpdate = z.infer<typeof MemberUpdateSchema>;

/** Full member record as returned by `get-data` / the MCP tools. */
export const MemberSchema = MemberUpdateSchema.omit({ name: true }).extend({
  name: z.string(),
});
export type Member = z.infer<typeof MemberSchema>;

export const SlayerTaskCompletionSchema = z
  .object({
    name: z.string(),
    task: z.string(),
    master: z.string().optional(),
    amount_completed: z.number().int(),
    outcome: SlayerTaskOutcomeSchema,
  })
  .strict();
export type SlayerTaskCompletion = z.infer<typeof SlayerTaskCompletionSchema>;

export const ClueCompletionSchema = z
  .object({
    name: z.string(),
    tier: ClueTierSchema,
  })
  .strict();
export type ClueCompletion = z.infer<typeof ClueCompletionSchema>;

export const DeathEventSchema = z
  .object({
    name: z.string(),
    world_x: z.number().int().optional(),
    world_y: z.number().int().optional(),
    plane: z.number().int().optional(),
    killer: z.string().optional(),
  })
  .strict();
export type DeathEvent = z.infer<typeof DeathEventSchema>;

export const CreateLoginRequestSchema = z
  .object({
    login_name: z.string(),
    member_names: z.array(z.string()),
    captcha_response: z.string().optional().default(''),
  })
  .strict();
export type CreateLoginRequest = z.infer<typeof CreateLoginRequestSchema>;

export const CreateLoginResponseSchema = z.object({
  login_name: z.string(),
  member_names: z.array(z.string()),
  token: z.string(),
});
export type CreateLoginResponse = z.infer<typeof CreateLoginResponseSchema>;

export const CaptchaConfigSchema = z.object({
  enabled: z.boolean(),
  sitekey: z.string(),
});
export type CaptchaConfig = z.infer<typeof CaptchaConfigSchema>;

export const AggregateSkillDataSchema = z.object({
  time: z.iso.datetime({ offset: true }),
  data: z.array(z.number().int()),
});
export type AggregateSkillData = z.infer<typeof AggregateSkillDataSchema>;

export const MemberSkillDataSchema = z.object({
  name: z.string(),
  skill_data: z.array(AggregateSkillDataSchema),
});
export type MemberSkillData = z.infer<typeof MemberSkillDataSchema>;

export type LoginSkillData = MemberSkillData[];

export const SkillDataPeriodSchema = z.enum(['Day', 'Week', 'Month', 'Year']);
export type SkillDataPeriod = z.infer<typeof SkillDataPeriodSchema>;
