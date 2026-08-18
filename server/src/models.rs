use chrono::{DateTime, Utc};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

pub const SHARED_MEMBER: &str = "@SHARED";

#[derive(Serialize, Deserialize, Clone)]
#[serde(deny_unknown_fields)]
pub struct Coordinates {
    x: i32,
    y: i32,
    plane: i32,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(deny_unknown_fields)]
pub struct Interacting {
    name: String,
    scale: i32,
    ratio: i32,
    location: Coordinates,
    #[serde(default = "default_last_updated")]
    last_updated: DateTime<Utc>,
}
fn default_last_updated() -> DateTime<Utc> {
    Utc::now()
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RenameGroupMember {
    pub original_name: String,
    pub new_name: String,
}

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum CropState {
    Growing,
    Harvestable,
    Diseased,
    Dead,
    Empty,
}

impl CropState {
    pub fn as_str(&self) -> &'static str {
        match self {
            CropState::Growing => "growing",
            CropState::Harvestable => "harvestable",
            CropState::Diseased => "diseased",
            CropState::Dead => "dead",
            CropState::Empty => "empty",
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct FarmingPatch {
    pub name: String,
    /// None when the raw varbit value couldn't be confidently mapped to a CropState (growth
    /// stages are crop-type-specific and the plugin doesn't resolve crop type - see raw_value).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub state: Option<CropState>,
    /// The unresolved varbit value backing `state`, kept for context/future decoding.
    #[serde(default)]
    pub raw_value: i32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub produce: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct SlayerTask {
    pub task: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub master: Option<String>,
    pub amount_remaining: i32,
    pub initial_amount: i32,
    pub points: i32,
    pub task_streak: i32,
    pub wilderness_streak: i32,
}

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum SlayerTaskOutcome {
    Completed,
    Skipped,
    Cancelled,
    Unknown,
}

impl SlayerTaskOutcome {
    pub fn as_str(&self) -> &'static str {
        match self {
            SlayerTaskOutcome::Completed => "completed",
            SlayerTaskOutcome::Skipped => "skipped",
            SlayerTaskOutcome::Cancelled => "cancelled",
            SlayerTaskOutcome::Unknown => "unknown",
        }
    }
}

#[derive(Deserialize, Debug)]
#[serde(deny_unknown_fields)]
pub struct SlayerTaskCompletion {
    pub name: String,
    pub task: String,
    #[serde(default)]
    pub master: Option<String>,
    pub amount_completed: i32,
    pub outcome: SlayerTaskOutcome,
}

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum ClueTier {
    Beginner,
    Easy,
    Medium,
    Hard,
    Elite,
    Master,
}

impl ClueTier {
    pub fn as_str(&self) -> &'static str {
        match self {
            ClueTier::Beginner => "beginner",
            ClueTier::Easy => "easy",
            ClueTier::Medium => "medium",
            ClueTier::Hard => "hard",
            ClueTier::Elite => "elite",
            ClueTier::Master => "master",
        }
    }
}

#[derive(Deserialize, Debug)]
#[serde(deny_unknown_fields)]
pub struct ClueCompletion {
    pub name: String,
    pub tier: ClueTier,
}

#[derive(Deserialize, Debug)]
#[serde(deny_unknown_fields)]
pub struct DeathEvent {
    pub name: String,
    #[serde(default)]
    pub world_x: Option<i32>,
    #[serde(default)]
    pub world_y: Option<i32>,
    #[serde(default)]
    pub plane: Option<i32>,
    #[serde(default)]
    pub killer: Option<String>,
}

#[derive(Deserialize, Serialize)]
pub struct GroupMember {
    #[serde(skip)]
    pub group_id: Option<i64>,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stats: Option<Vec<i32>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub coordinates: Option<Vec<i32>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub skills: Option<Vec<i32>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub quests: Option<Vec<u8>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub inventory: Option<Vec<i32>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub equipment: Option<Vec<i32>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bank: Option<Vec<i32>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub shared_bank: Option<Vec<i32>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rune_pouch: Option<Vec<i32>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub interacting: Option<Interacting>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub seed_vault: Option<Vec<i32>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deposited: Option<Vec<i32>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub diary_vars: Option<Vec<i32>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub collection_log_v2: Option<Vec<i32>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub potion_storage: Option<Vec<i32>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub slayer_task: Option<SlayerTask>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub combat_achievements: Option<Vec<i32>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub farming_patches: Option<Vec<FarmingPatch>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub account_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_updated: Option<DateTime<Utc>>,
}
#[derive(Serialize)]
pub struct AggregateSkillData {
    pub time: DateTime<Utc>,
    pub data: Vec<i32>,
}
#[derive(Serialize)]
pub struct MemberSkillData {
    pub name: String,
    pub skill_data: Vec<AggregateSkillData>,
}
pub type GroupSkillData = Vec<MemberSkillData>;
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct CreateGroup {
    pub name: String,
    pub member_names: Vec<String>,
    #[serde(default, skip_serializing)]
    pub captcha_response: String,
    #[serde(default = "default_token")]
    #[serde(skip_deserializing)]
    pub token: String,
}
fn default_token() -> String {
    uuid::Uuid::new_v4().hyphenated().to_string()
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AmIInGroupRequest {
    pub member_name: String,
}
#[derive(Deserialize)]
pub struct WikiGEPrice {
    pub high: Option<i64>,
    pub low: Option<i64>,
}
#[derive(Deserialize)]
pub struct WikiGEPrices {
    pub data: std::collections::HashMap<i32, WikiGEPrice>,
}
pub type GEPrices = std::collections::HashMap<i32, i64>;
#[derive(Deserialize)]
pub struct CaptchaVerifyResponse {
    pub success: bool,
    // NOTE: unused
    // #[serde(rename = "error-codes", default)]
    // pub error_codes: std::vec::Vec<String>,
}

// -- OSRS Hiscores (secure.runescape.com/m=hiscore_oldschool*/index_lite.json) --

#[derive(Deserialize, Debug, Clone)]
pub struct HiscoreSkill {
    #[allow(dead_code)]
    pub id: i32,
    pub name: String,
    pub rank: i64,
    #[allow(dead_code)]
    pub level: i64,
    #[allow(dead_code)]
    pub xp: i64,
}

#[derive(Deserialize, Debug, Clone)]
pub struct HiscoreActivity {
    #[allow(dead_code)]
    pub id: i32,
    pub name: String,
    pub rank: i64,
    pub score: i64,
}

#[derive(Deserialize, Debug, Clone)]
pub struct HiscoreResponse {
    pub skills: Vec<HiscoreSkill>,
    pub activities: Vec<HiscoreActivity>,
}

/// The account types this project probes for via Hiscores, most-restrictive-first.
/// Group Ironman is deliberately excluded - it has no player-name-keyed lookup at all
/// (confirmed: it's a group-name-keyed HTML page, not a JSON leaderboard), so it can't
/// be folded into this probe and is handled separately as a lower-priority stretch goal.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AccountType {
    HardcoreIronman,
    Ultimate,
    Ironman,
    Regular,
}

impl AccountType {
    pub fn as_str(&self) -> &'static str {
        match self {
            AccountType::HardcoreIronman => "hardcore_ironman",
            AccountType::Ultimate => "ultimate",
            AccountType::Ironman => "ironman",
            AccountType::Regular => "regular",
        }
    }

    /// The OSRS Hiscores URL path segment for this mode's `index_lite.json` endpoint.
    pub fn hiscore_path_segment(&self) -> &'static str {
        match self {
            AccountType::HardcoreIronman => "hiscore_oldschool_hardcore_ironman",
            AccountType::Ultimate => "hiscore_oldschool_ultimate",
            AccountType::Ironman => "hiscore_oldschool_ironman",
            AccountType::Regular => "hiscore_oldschool",
        }
    }

    /// Probe order: most-restrictive-first. The regular board returns a genuine ranked
    /// response for every real account regardless of mode, so probing least-restrictive-first
    /// would always match immediately and never actually check the other three.
    pub const PROBE_ORDER: [AccountType; 4] = [
        AccountType::HardcoreIronman,
        AccountType::Ultimate,
        AccountType::Ironman,
        AccountType::Regular,
    ];
}

// -- OSRS Wiki Bucket API (oldschool.runescape.wiki/api.php?action=bucket) --

/// A row from the wiki's `infobox_item` Bucket table. `item_id` is a repeated field -
/// some infobox entries cover multiple numeric item IDs sharing one page (e.g. item
/// variants), so this must be exploded into one record per ID.
///
/// `tradeable`/`is_members_only` are MediaWiki-style presence-flags, not real JSON
/// booleans: the field is present (with an arbitrary, often-empty string value) when
/// true, and omitted entirely when false. Deserialize as `Option<serde_json::Value>`
/// and treat `.is_some()` as true - do not attempt to parse the inner value.
#[derive(Deserialize, Debug, Clone)]
pub struct BucketItemRow {
    /// Confirmed via a real full-table sweep (not just small filtered test queries) that
    /// some rows omit this field entirely rather than sending an empty array - default to
    /// empty so one malformed row (e.g. an incomplete/stub infobox page) doesn't abort
    /// deserializing the whole page.
    #[serde(default)]
    pub item_id: Vec<String>,
    /// Also confirmed missing on the same malformed row(s) that omit item_id - defaults
    /// to empty, which is harmless since flatten_bucket_row already produces zero records
    /// for a row with no item IDs to attach a name to.
    #[serde(default)]
    pub item_name: String,
    #[serde(default)]
    pub high_alchemy_value: Option<i64>,
    #[serde(default)]
    pub value: Option<i64>,
    #[serde(default)]
    pub tradeable: Option<serde_json::Value>,
    #[serde(default)]
    pub is_members_only: Option<serde_json::Value>,
}

#[derive(Deserialize, Debug)]
pub struct BucketQueryResponse {
    pub bucket: Vec<BucketItemRow>,
}
