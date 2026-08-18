use crate::db;
use crate::error::ApiError;
use crate::mcp::auth::AuthenticatedGroup;
use crate::models::GroupMember;
use chrono::DateTime;
use deadpool_postgres::Pool;
use rmcp::handler::server::tool::Extension;
use rmcp::handler::server::wrapper::{Json, Parameters};
use rmcp::{tool, tool_handler, tool_router, ErrorData, ServerHandler};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

fn to_error(err: ApiError) -> ErrorData {
    ErrorData::internal_error(err.to_string(), None)
}

fn member_not_found(member_name: &str) -> ErrorData {
    ErrorData::invalid_params(
        format!(
            "No member named '{}' in this group. Call list_group_members to see valid names.",
            member_name
        ),
        None,
    )
}

/// Standard RuneLite `Skill` enum order (stable, only ever appended to - Sailing was the
/// most recent addition). The `skills` array holds 23 or 24 XP values (never includes
/// Overall, which is always the sum of the rest); index 23 (Sailing) is only present
/// when the array has 24 elements. Worth cross-checking against real plugin output once
/// Phase 5 lands, since this project's own frontend reference for this ordering was
/// removed in the Phase 2 dashboard trim.
const SKILL_NAMES: [&str; 24] = [
    "Attack",
    "Defence",
    "Strength",
    "Hitpoints",
    "Ranged",
    "Prayer",
    "Magic",
    "Cooking",
    "Woodcutting",
    "Fletching",
    "Fishing",
    "Firemaking",
    "Crafting",
    "Smithing",
    "Mining",
    "Herblore",
    "Agility",
    "Thieving",
    "Slayer",
    "Farming",
    "Runecraft",
    "Hunter",
    "Construction",
    "Sailing",
];

/// Standard OSRS equipment slot order (RuneLite `EquipmentInventorySlot`). A handful of
/// indices are legacy/unused reserved slots that the game client no longer assigns items
/// to, kept only so the array stays positionally stable. Same caveat as SKILL_NAMES: this
/// project's own frontend reference for this ordering was removed in the Phase 2 dashboard
/// trim, so it's worth cross-checking against real plugin output once Phase 5 lands.
const EQUIPMENT_SLOT_NAMES: [&str; 14] = [
    "head",
    "cape",
    "amulet",
    "weapon",
    "body",
    "shield",
    "arms", // legacy/unused
    "legs",
    "hair", // legacy/unused
    "hands",
    "feet",
    "jaw", // legacy/unused
    "ring",
    "ammo",
];

#[derive(Serialize, JsonSchema)]
pub struct ResolvedItem {
    pub item_id: i32,
    /// Absent if this item has no metadata row yet (rare - only very recently added items).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    pub quantity: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub slot: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub high_alch: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub low_alch: Option<i32>,
}

/// Resolve a flat [id, qty, id, qty, ...] array into named, alch-valued items. Zero-item
/// slots (id == 0, used for empty inventory/equipment positions) are skipped entirely
/// rather than returned as a "no item" placeholder, since the AI client only cares about
/// what's actually there. When `slots` is provided (equipment only), each item is
/// labeled with its fixed slot name by position rather than being dropped from the list.
async fn resolve_flat_items(
    pool: &Pool,
    flat: &[i32],
    slots: Option<&[&'static str]>,
) -> Result<Vec<ResolvedItem>, ErrorData> {
    let pairs: Vec<(usize, i32, i32)> = flat
        .chunks_exact(2)
        .enumerate()
        .filter(|(_, pair)| pair[0] != 0)
        .map(|(idx, pair)| (idx, pair[0], pair[1]))
        .collect();

    let item_ids: Vec<i32> = pairs.iter().map(|(_, id, _)| *id).collect();
    let client = pool.get().await.map_err(ApiError::PoolError).map_err(to_error)?;
    let metadata = db::get_item_metadata_batch(&client, &item_ids)
        .await
        .map_err(to_error)?;

    Ok(pairs
        .into_iter()
        .map(|(idx, item_id, quantity)| {
            let meta = metadata.get(&item_id);
            ResolvedItem {
                item_id,
                name: meta.map(|m| m.name.clone()),
                quantity,
                slot: slots.and_then(|s| s.get(idx)).copied(),
                high_alch: meta.and_then(|m| m.high_alch),
                low_alch: meta.and_then(|m| m.low_alch),
            }
        })
        .collect())
}

async fn fetch_member(
    pool: &Pool,
    group_id: i64,
    member_name: &str,
) -> Result<GroupMember, ErrorData> {
    let client = pool.get().await.map_err(ApiError::PoolError).map_err(to_error)?;
    let epoch = DateTime::from_timestamp(0, 0).unwrap();
    let members = db::get_group_data(&client, group_id, &epoch)
        .await
        .map_err(to_error)?;
    members
        .into_iter()
        .find(|m| m.name.eq_ignore_ascii_case(member_name))
        .ok_or_else(|| member_not_found(member_name))
}

async fn resolve_member_id(
    pool: &Pool,
    group_id: i64,
    member_name: &str,
) -> Result<i64, ErrorData> {
    let client = pool.get().await.map_err(ApiError::PoolError).map_err(to_error)?;
    db::get_member_id(&client, group_id, member_name)
        .await
        .map_err(|_| member_not_found(member_name))
}

fn authenticated_group(parts: &http::request::Parts) -> Result<AuthenticatedGroup, ErrorData> {
    parts
        .extensions
        .get::<AuthenticatedGroup>()
        .copied()
        .ok_or_else(|| ErrorData::internal_error("missing authenticated group context", None))
}

#[derive(Deserialize, JsonSchema)]
pub struct MemberArgs {
    /// The exact member name as returned by list_group_members.
    pub member_name: String,
}

#[derive(Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum ItemContainer {
    Inventory,
    Bank,
    Equipment,
    SeedVault,
    SharedBank,
}

#[derive(Deserialize, JsonSchema)]
pub struct ItemsArgs {
    pub member_name: String,
    pub container: ItemContainer,
}

#[derive(Deserialize, JsonSchema)]
pub struct HistoryArgs {
    pub member_name: String,
    /// Maximum number of entries to return, most recent first. Defaults to 20.
    #[serde(default)]
    pub limit: Option<i64>,
}

#[derive(Deserialize, JsonSchema)]
pub struct ClueTotalsArgs {
    pub member_name: String,
    /// Optional: restrict to one tier (e.g. "elite"). Omit for all tiers.
    #[serde(default)]
    pub tier: Option<String>,
}

#[derive(Deserialize, JsonSchema)]
pub struct KillCountArgs {
    pub member_name: String,
    /// Optional: restrict to one boss/activity name (as it appears on the OSRS
    /// Hiscores, e.g. "Zulrah"). Omit for all tracked bosses.
    #[serde(default)]
    pub boss: Option<String>,
}

#[derive(Serialize, JsonSchema)]
pub struct GroupMemberSummary {
    pub name: String,
    /// One of: regular, ironman, hardcore_ironman, ultimate. Absent if not yet detected
    /// by the Hiscores poller (runs on an interval, so this can lag briefly after a
    /// member is first added). Group Ironman is not currently distinguishable from
    /// regular - see the plan's Phase 3 notes on Hiscores probe limitations.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub account_type: Option<String>,
}

#[derive(Clone)]
pub struct McpServer {
    pub pool: Pool,
}

#[tool_router]
impl McpServer {
    pub fn new(pool: Pool) -> Self {
        Self { pool }
    }

    #[tool(description = "List the members of the authenticated group, with their detected OSRS account type (regular/ironman/hardcore_ironman/ultimate) where known. Per-member tools require an exact member_name from this list.")]
    pub async fn list_group_members(
        &self,
        Extension(parts): Extension<http::request::Parts>,
    ) -> Result<Json<Vec<GroupMemberSummary>>, ErrorData> {
        let auth = authenticated_group(&parts)?;
        let client = self.pool.get().await.map_err(ApiError::PoolError).map_err(to_error)?;
        let members = db::list_group_members(&client, auth.group_id)
            .await
            .map_err(to_error)?;
        Ok(Json(
            members
                .into_iter()
                .map(|m| GroupMemberSummary {
                    name: m.member_name,
                    account_type: m.account_type,
                })
                .collect(),
        ))
    }

    #[tool(description = "Get a member's current status: HP/prayer/run energy, world, coordinates, who/what they're currently interacting with, and their current Slayer task if any. This is the 'what is this player doing right now' snapshot.")]
    pub async fn get_member_status(
        &self,
        Extension(parts): Extension<http::request::Parts>,
        Parameters(args): Parameters<MemberArgs>,
    ) -> Result<Json<serde_json::Value>, ErrorData> {
        let auth = authenticated_group(&parts)?;
        let member = fetch_member(&self.pool, auth.group_id, &args.member_name).await?;
        Ok(Json(serde_json::json!({
            "name": member.name,
            "account_type": member.account_type,
            "stats": member.stats,
            "coordinates": member.coordinates,
            "interacting": member.interacting,
            "slayer_task": member.slayer_task,
            "last_updated": member.last_updated,
        })))
    }

    #[tool(description = "Get the named item container's contents (inventory, bank, equipment, seed vault, or the group's shared bank) with item names and alch values resolved. For equipment, each item is also labeled with its slot (head/weapon/body/etc). Empty item slots are omitted from the results.")]
    pub async fn get_items(
        &self,
        Extension(parts): Extension<http::request::Parts>,
        Parameters(args): Parameters<ItemsArgs>,
    ) -> Result<Json<Vec<ResolvedItem>>, ErrorData> {
        let auth = authenticated_group(&parts)?;
        let member = fetch_member(&self.pool, auth.group_id, &args.member_name).await?;

        let (flat, slots): (Vec<i32>, Option<&[&'static str]>) = match args.container {
            ItemContainer::Inventory => (member.inventory.unwrap_or_default(), None),
            ItemContainer::Bank => (member.bank.unwrap_or_default(), None),
            ItemContainer::Equipment => (
                member.equipment.unwrap_or_default(),
                Some(&EQUIPMENT_SLOT_NAMES),
            ),
            ItemContainer::SeedVault => (member.seed_vault.unwrap_or_default(), None),
            ItemContainer::SharedBank => (member.shared_bank.unwrap_or_default(), None),
        };

        Ok(Json(resolve_flat_items(&self.pool, &flat, slots).await?))
    }

    #[tool(description = "Get a member's skill levels, derived from raw XP using the standard OSRS XP table implied by RuneLite's Skill enum order.")]
    pub async fn get_skills(
        &self,
        Extension(parts): Extension<http::request::Parts>,
        Parameters(args): Parameters<MemberArgs>,
    ) -> Result<Json<HashMap<String, i64>>, ErrorData> {
        let auth = authenticated_group(&parts)?;
        let member = fetch_member(&self.pool, auth.group_id, &args.member_name).await?;
        let xp = member.skills.unwrap_or_default();
        let mut result = HashMap::new();
        for (idx, value) in xp.iter().enumerate() {
            if let Some(name) = SKILL_NAMES.get(idx) {
                result.insert(name.to_string(), *value as i64);
            }
        }
        Ok(Json(result))
    }

    #[tool(description = "Get a member's raw quest-completion state array. NOTE: this returns state ordinals by quest index, not decoded quest names - name resolution isn't implemented (the reference mapping lived in frontend code removed when the dashboard was trimmed). Values are typically 0=not started, 1=in progress, 2=finished, but this is not independently confirmed for this project.")]
    pub async fn get_quests(
        &self,
        Extension(parts): Extension<http::request::Parts>,
        Parameters(args): Parameters<MemberArgs>,
    ) -> Result<Json<Vec<u8>>, ErrorData> {
        let auth = authenticated_group(&parts)?;
        let member = fetch_member(&self.pool, auth.group_id, &args.member_name).await?;
        Ok(Json(member.quests.unwrap_or_default()))
    }

    #[tool(description = "Get a member's current Slayer task: monster, amount remaining/initial, assigning master (if known), points, and streaks.")]
    pub async fn get_slayer_task(
        &self,
        Extension(parts): Extension<http::request::Parts>,
        Parameters(args): Parameters<MemberArgs>,
    ) -> Result<Json<Option<crate::models::SlayerTask>>, ErrorData> {
        let auth = authenticated_group(&parts)?;
        let member = fetch_member(&self.pool, auth.group_id, &args.member_name).await?;
        Ok(Json(member.slayer_task))
    }

    #[tool(description = "Get a member's Slayer task completion history, most recent first. Only includes tasks observed while the plugin was actively running - a task completed while the plugin was closed leaves a gap here (the current-task snapshot from get_slayer_task is always accurate regardless).")]
    pub async fn get_slayer_history(
        &self,
        Extension(parts): Extension<http::request::Parts>,
        Parameters(args): Parameters<HistoryArgs>,
    ) -> Result<Json<Vec<db::SlayerTaskHistoryEntry>>, ErrorData> {
        let auth = authenticated_group(&parts)?;
        let member_id = resolve_member_id(&self.pool, auth.group_id, &args.member_name).await?;
        let client = self.pool.get().await.map_err(ApiError::PoolError).map_err(to_error)?;
        let entries = db::get_slayer_task_history(&client, member_id, args.limit.unwrap_or(20))
            .await
            .map_err(to_error)?;
        Ok(Json(entries))
    }

    #[tool(description = "Get a member's boss/activity kill counts from the OSRS Hiscores. Authoritative and gap-resilient (reconciled against the official Hiscores on a timer, independent of whether the plugin is running) - but note the Hiscores only rank most bosses after 5 kills, so a freshly-started grind shows 0 until kill 5.")]
    pub async fn get_kill_counts(
        &self,
        Extension(parts): Extension<http::request::Parts>,
        Parameters(args): Parameters<KillCountArgs>,
    ) -> Result<Json<HashMap<String, i32>>, ErrorData> {
        let auth = authenticated_group(&parts)?;
        let member_id = resolve_member_id(&self.pool, auth.group_id, &args.member_name).await?;
        let client = self.pool.get().await.map_err(ApiError::PoolError).map_err(to_error)?;
        let activities = db::get_hiscore_activities(&client, member_id)
            .await
            .map_err(to_error)?;
        let filtered = activities
            .into_iter()
            .filter(|(name, _)| !name.starts_with("Clue Scrolls"))
            .filter(|(name, _)| args.boss.as_deref().is_none_or(|b| name.eq_ignore_ascii_case(b)))
            .collect();
        Ok(Json(filtered))
    }

    #[tool(description = "Get a member's Combat Achievement tier completion counts: [easy, medium, hard, elite, master, grandmaster].")]
    pub async fn get_combat_achievements(
        &self,
        Extension(parts): Extension<http::request::Parts>,
        Parameters(args): Parameters<MemberArgs>,
    ) -> Result<Json<Option<Vec<i32>>>, ErrorData> {
        let auth = authenticated_group(&parts)?;
        let member = fetch_member(&self.pool, auth.group_id, &args.member_name).await?;
        Ok(Json(member.combat_achievements))
    }

    #[tool(description = "Get a member's total clue scroll completions by tier, from the OSRS Hiscores. Authoritative and gap-resilient regardless of plugin uptime, but only reflects opened caskets (per the Hiscores' own counting rule), not just received ones.")]
    pub async fn get_clue_totals(
        &self,
        Extension(parts): Extension<http::request::Parts>,
        Parameters(args): Parameters<ClueTotalsArgs>,
    ) -> Result<Json<HashMap<String, i32>>, ErrorData> {
        let auth = authenticated_group(&parts)?;
        let member_id = resolve_member_id(&self.pool, auth.group_id, &args.member_name).await?;
        let client = self.pool.get().await.map_err(ApiError::PoolError).map_err(to_error)?;
        let activities = db::get_hiscore_activities(&client, member_id)
            .await
            .map_err(to_error)?;
        let filtered = activities
            .into_iter()
            .filter(|(name, _)| name.starts_with("Clue Scrolls"))
            .filter(|(name, _)| {
                args.tier
                    .as_deref()
                    .is_none_or(|t| name.to_lowercase().contains(&t.to_lowercase()))
            })
            .collect();
        Ok(Json(filtered))
    }

    #[tool(description = "Get a member's individual clue-scroll completion timestamps, most recent first. Best-effort and session-only (only completions observed while the plugin was running are logged) - use get_clue_totals for the authoritative, gap-resilient cumulative count per tier.")]
    pub async fn get_clue_completion_history(
        &self,
        Extension(parts): Extension<http::request::Parts>,
        Parameters(args): Parameters<HistoryArgs>,
    ) -> Result<Json<Vec<db::ClueCompletionEntry>>, ErrorData> {
        let auth = authenticated_group(&parts)?;
        let member_id = resolve_member_id(&self.pool, auth.group_id, &args.member_name).await?;
        let client = self.pool.get().await.map_err(ApiError::PoolError).map_err(to_error)?;
        let entries = db::get_clue_completions(&client, member_id, None, args.limit.unwrap_or(20))
            .await
            .map_err(to_error)?;
        Ok(Json(entries))
    }

    #[tool(description = "Get a member's death log: when, where, and (best-effort) what killed them. Only deaths observed while the plugin was running are logged - there is no authoritative external source for this category, unlike kill counts or clue totals.")]
    pub async fn get_deaths(
        &self,
        Extension(parts): Extension<http::request::Parts>,
        Parameters(args): Parameters<HistoryArgs>,
    ) -> Result<Json<Vec<db::DeathEntry>>, ErrorData> {
        let auth = authenticated_group(&parts)?;
        let member_id = resolve_member_id(&self.pool, auth.group_id, &args.member_name).await?;
        let client = self.pool.get().await.map_err(ApiError::PoolError).map_err(to_error)?;
        let entries = db::get_deaths(&client, member_id, args.limit.unwrap_or(20))
            .await
            .map_err(to_error)?;
        Ok(Json(entries))
    }

    #[tool(description = "Get a member's current farming patch states, by generic slot (patch_a..patch_e), not resolved to real patch names. Each slot reports 'empty' when confidently known, otherwise a raw varbit value only - growth-stage decoding (growing/harvestable/diseased/dead) requires knowing the crop type per slot, which isn't tracked (deferred scope), so don't guess a stage from raw_value. Does not include a ready-in-X-minutes ETA (also deferred).")]
    pub async fn get_farming_patches(
        &self,
        Extension(parts): Extension<http::request::Parts>,
        Parameters(args): Parameters<MemberArgs>,
    ) -> Result<Json<Option<Vec<crate::models::FarmingPatch>>>, ErrorData> {
        let auth = authenticated_group(&parts)?;
        let member = fetch_member(&self.pool, auth.group_id, &args.member_name).await?;
        Ok(Json(member.farming_patches))
    }

    #[tool(description = "Get a member's collection log: item IDs (with names/alch values resolved) they've unlocked.")]
    pub async fn get_collection_log(
        &self,
        Extension(parts): Extension<http::request::Parts>,
        Parameters(args): Parameters<MemberArgs>,
    ) -> Result<Json<Vec<ResolvedItem>>, ErrorData> {
        let auth = authenticated_group(&parts)?;
        let member = fetch_member(&self.pool, auth.group_id, &args.member_name).await?;
        // Collection log is a flat list of item IDs, not [id, qty] pairs like the item
        // containers - build a synthetic quantity-1-each pair list so resolve_flat_items
        // (which expects [id, qty, ...]) can be reused as-is.
        let ids = member.collection_log_v2.unwrap_or_default();
        let flat: Vec<i32> = ids.into_iter().flat_map(|id| [id, 1]).collect();
        Ok(Json(resolve_flat_items(&self.pool, &flat, None).await?))
    }

    #[tool(description = "Get a member's raw achievement diary progress (varbit/varp values). NOTE: not decoded into per-region/tier/task detail - the reference mapping lived in frontend code removed when the dashboard was trimmed. Useful mainly for spotting changes over time, not for reading specific task names.")]
    pub async fn get_achievement_diary_progress(
        &self,
        Extension(parts): Extension<http::request::Parts>,
        Parameters(args): Parameters<MemberArgs>,
    ) -> Result<Json<Option<Vec<i32>>>, ErrorData> {
        let auth = authenticated_group(&parts)?;
        let member = fetch_member(&self.pool, auth.group_id, &args.member_name).await?;
        Ok(Json(member.diary_vars))
    }
}

#[tool_handler]
impl ServerHandler for McpServer {
    fn get_info(&self) -> rmcp::model::ServerInfo {
        let mut info = rmcp::model::ServerInfo::default();
        info.server_info = rmcp::model::Implementation::new("osrs-mcp", "0.1.0");
        info.instructions = Some(
            "OSRS MCP: query a tracked OSRS group's live player data (skills, items, \
             Slayer tasks, kill counts, clues, deaths, farming patches, and more). \
             Every per-member tool requires an exact member_name - call \
             list_group_members first if you don't already know it. This server \
             exposes raw, well-labeled game state; combining it with goals like \
             'best gear for XP/hour' or 'what should I alch' is left to your own \
             OSRS knowledge - no gear-recommendation or DPS-calculation logic is \
             built in here."
                .into(),
        );
        info
    }
}
