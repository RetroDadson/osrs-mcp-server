use crate::crypto::token_hash;
use crate::error::ApiError;
use crate::models::{
    AggregateSkillData, CreateGroup, GroupMember, GroupSkillData, MemberSkillData, SHARED_MEMBER,
};
use chrono::{DateTime, Utc};
use deadpool_postgres::{Client, Transaction};
use serde::{de::DeserializeOwned, Serialize};
use std::collections::{HashMap, HashSet};
use tokio_postgres::Row;

const CURRENT_GROUP_VERSION: i32 = 2;
pub async fn create_group(client: &mut Client, create_group: &CreateGroup) -> Result<(), ApiError> {
    let create_group_stmt = client.prepare_cached("INSERT INTO osrsmcp.groups (group_name, group_token_hash, version) VALUES($1, $2, $3) RETURNING group_id").await?;
    let create_member_stmt = client
        .prepare_cached("INSERT INTO osrsmcp.members (group_id, member_name) VALUES($1, $2)")
        .await?;
    let transaction = client.transaction().await?;

    let hashed_token = token_hash(&create_group.token, &create_group.name);
    let group_id: i64 = transaction
        .query_one(
            &create_group_stmt,
            &[&create_group.name, &hashed_token, &CURRENT_GROUP_VERSION],
        )
        .await?
        .try_get(0)
        .map_err(ApiError::GroupCreationError)?;

    transaction
        .execute(&create_member_stmt, &[&group_id, &SHARED_MEMBER])
        .await
        .map_err(ApiError::GroupCreationError)?;
    for member_name in &create_group.member_names {
        transaction
            .execute(&create_member_stmt, &[&group_id, &member_name])
            .await
            .map_err(ApiError::GroupCreationError)?;
    }

    transaction
        .commit()
        .await
        .map_err(ApiError::GroupCreationError)
}

pub async fn add_group_member(
    client: &Client,
    group_id: i64,
    member_name: &str,
) -> Result<(), ApiError> {
    let member_count_stmt = client
        .prepare_cached(
            "SELECT COUNT(*) FROM osrsmcp.members WHERE group_id=$1 AND member_name!=$2",
        )
        .await?;
    let member_count: i64 = client
        .query_one(&member_count_stmt, &[&group_id, &SHARED_MEMBER])
        .await?
        .try_get(0)
        .map_err(ApiError::AddMemberError)?;

    if member_count >= 5 {
        return Err(ApiError::GroupFullError);
    }

    let create_member_stmt = client
        .prepare_cached("INSERT INTO osrsmcp.members (group_id, member_name) VALUES($1, $2)")
        .await?;
    client
        .execute(&create_member_stmt, &[&group_id, &member_name])
        .await
        .map_err(ApiError::AddMemberError)?;
    Ok(())
}

pub async fn delete_skills_data_for_member(
    transaction: &Transaction<'_>,
    period: AggregatePeriod,
    member_id: i64,
) -> Result<(), ApiError> {
    let s = format!(
        r#"
DELETE FROM osrsmcp.skills_{} WHERE member_id=$1
"#,
        match period {
            AggregatePeriod::Day => "day",
            AggregatePeriod::Month => "month",
            AggregatePeriod::Year => "year",
        }
    );
    let delete_skills_data_stmt = transaction.prepare_cached(&s).await?;
    transaction
        .execute(&delete_skills_data_stmt, &[&member_id])
        .await?;

    Ok(())
}

pub async fn get_member_id(
    client: &Client,
    group_id: i64,
    member_name: &str,
) -> Result<i64, ApiError> {
    let get_member_id_stmt = client
        .prepare_cached(
            "SELECT member_id FROM osrsmcp.members WHERE group_id=$1 AND member_name=$2",
        )
        .await?;
    let member_id: i64 = client
        .query_one(&get_member_id_stmt, &[&group_id, &member_name])
        .await
        .map_err(ApiError::DeleteGroupMemberError)?
        .try_get(0)?;
    Ok(member_id)
}

pub async fn delete_group_member(
    client: &mut Client,
    group_id: i64,
    member_name: &str,
) -> Result<(), ApiError> {
    let member_id = get_member_id(client, group_id, member_name).await?;
    let transaction = client.transaction().await?;
    delete_skills_data_for_member(&transaction, AggregatePeriod::Day, member_id).await?;
    delete_skills_data_for_member(&transaction, AggregatePeriod::Month, member_id).await?;
    delete_skills_data_for_member(&transaction, AggregatePeriod::Year, member_id).await?;

    let stmt = transaction
        .prepare_cached("DELETE FROM osrsmcp.members WHERE group_id=$1 AND member_name=$2")
        .await?;
    transaction
        .execute(&stmt, &[&group_id, &member_name])
        .await
        .map_err(ApiError::DeleteGroupMemberError)?;

    transaction
        .commit()
        .await
        .map_err(ApiError::DeleteGroupMemberError)?;

    Ok(())
}

pub async fn rename_group_member(
    client: &Client,
    group_id: i64,
    original_name: &str,
    new_name: &str,
) -> Result<(), ApiError> {
    let stmt = client
        .prepare_cached(
            "UPDATE osrsmcp.members SET member_name=$1 WHERE group_id=$2 AND member_name=$3",
        )
        .await?;
    client
        .execute(&stmt, &[&new_name, &group_id, &original_name])
        .await
        .map_err(ApiError::RenameGroupMemberError)?;
    Ok(())
}

pub async fn is_member_in_group(
    client: &Client,
    group_id: i64,
    member_name: &str,
) -> Result<bool, ApiError> {
    let stmt = client.prepare_cached("SELECT COUNT(member_name) FROM osrsmcp.members WHERE group_id=$1 AND member_name=$2").await?;
    let member_count: i64 = client
        .query_one(&stmt, &[&group_id, &member_name])
        .await?
        .try_get(0)
        .map_err(ApiError::IsMemberInGroupError)?;
    Ok(member_count > 0)
}

pub fn serialize_serde<T>(value: &Option<T>) -> Result<Option<String>, ApiError>
where
    T: Serialize,
{
    match value {
        Some(v) => {
            let result = serde_json::to_string(&v)?;
            Ok(Some(result))
        }
        None => Ok(None),
    }
}

pub async fn get_group(client: &Client, group_name: &str, token: &str) -> Result<i64, ApiError> {
    let stmt = client
        .prepare_cached(
            "SELECT group_id FROM osrsmcp.groups WHERE group_token_hash=$1 AND group_name=$2",
        )
        .await?;
    let hashed_token = token_hash(token, group_name);
    let group: Row = client
        .query_one(&stmt, &[&hashed_token, &group_name])
        .await
        .map_err(ApiError::GetGroupError)?;
    Ok(group.try_get(0)?)
}

fn try_deserialize_json_column<T>(row: &Row, column: &str) -> Result<Option<T>, ApiError>
where
    T: DeserializeOwned,
{
    match row.try_get(column) {
        Ok(column_data) => Ok(serde_json::from_str(column_data).ok()),
        Err(_) => Ok(None),
    }
}

pub async fn get_group_data(
    client: &Client,
    group_id: i64,
    timestamp: &DateTime<Utc>,
) -> Result<Vec<GroupMember>, ApiError> {
    let stmt = client
        .prepare_cached(
            r#"
SELECT member_name,
GREATEST(stats_last_update, coordinates_last_update, skills_last_update,
quests_last_update, inventory_last_update, equipment_last_update, bank_last_update,
rune_pouch_last_update, interacting_last_update, seed_vault_last_update, diary_vars_last_update,
collection_log_last_update, potion_storage_last_update, slayer_task_last_update,
combat_achievements_last_update, farming_patches_last_update) as last_updated,
CASE WHEN stats_last_update >= $1::TIMESTAMPTZ THEN stats ELSE NULL END as stats,
CASE WHEN coordinates_last_update >= $1::TIMESTAMPTZ THEN coordinates ELSE NULL END as coordinates,
CASE WHEN skills_last_update >= $1::TIMESTAMPTZ THEN skills ELSE NULL END as skills,
CASE WHEN quests_last_update >= $1::TIMESTAMPTZ THEN quests ELSE NULL END as quests,
CASE WHEN inventory_last_update >= $1::TIMESTAMPTZ THEN inventory ELSE NULL END as inventory,
CASE WHEN equipment_last_update >= $1::TIMESTAMPTZ THEN equipment ELSE NULL END as equipment,
CASE WHEN bank_last_update >= $1::TIMESTAMPTZ THEN bank ELSE NULL END as bank,
CASE WHEN rune_pouch_last_update >= $1::TIMESTAMPTZ THEN rune_pouch ELSE NULL END as rune_pouch,
CASE WHEN interacting_last_update >= $1::TIMESTAMPTZ THEN interacting ELSE NULL END as interacting,
CASE WHEN seed_vault_last_update >= $1::TIMESTAMPTZ THEN seed_vault ELSE NULL END as seed_vault,
CASE WHEN diary_vars_last_update >= $1::TIMESTAMPTZ THEN diary_vars ELSE NULL END as diary_vars,
CASE WHEN collection_log_last_update >= $1::TIMESTAMPTZ THEN collection_log ELSE NULL END as collection_log,
CASE WHEN potion_storage_last_update >= $1::TIMESTAMPTZ THEN potion_storage ELSE NULL END as potion_storage,
CASE WHEN slayer_task_last_update >= $1::TIMESTAMPTZ THEN slayer_task ELSE NULL END as slayer_task,
CASE WHEN combat_achievements_last_update >= $1::TIMESTAMPTZ THEN combat_achievements ELSE NULL END as combat_achievements,
CASE WHEN farming_patches_last_update >= $1::TIMESTAMPTZ THEN farming_patches ELSE NULL END as farming_patches,
account_type
FROM osrsmcp.members WHERE group_id=$2
"#,
        )
        .await?;

    let rows = client
        .query(&stmt, &[&timestamp, &group_id])
        .await
        .map_err(ApiError::GetGroupDataError)?;
    let mut result = Vec::with_capacity(rows.len());
    for row in rows {
        let member_name = row.try_get("member_name")?;
        let last_updated: Option<DateTime<Utc>> = row.try_get("last_updated").ok();
        let group_member = GroupMember {
            group_id: Some(group_id),
            name: member_name,
            last_updated,
            stats: row.try_get("stats").ok(),
            coordinates: row.try_get("coordinates").ok(),
            skills: row.try_get("skills").ok(),
            quests: row.try_get("quests")?,
            inventory: row.try_get("inventory").ok(),
            equipment: row.try_get("equipment").ok(),
            bank: row.try_get("bank").ok(),
            rune_pouch: row.try_get("rune_pouch").ok(),
            seed_vault: row.try_get("seed_vault").ok(),
            interacting: try_deserialize_json_column(&row, "interacting")?,
            diary_vars: row.try_get("diary_vars").ok(),
            shared_bank: Option::None,
            deposited: Option::None,
            collection_log_v2: row.try_get("collection_log").ok(),
            potion_storage: row.try_get("potion_storage").ok(),
            slayer_task: try_deserialize_json_column(&row, "slayer_task")?,
            combat_achievements: row.try_get("combat_achievements").ok(),
            farming_patches: try_deserialize_json_column(&row, "farming_patches")?,
            account_type: row.try_get("account_type").ok(),
        };
        result.push(group_member);
    }

    Ok(result)
}

pub struct MemberRef {
    pub member_id: i64,
    pub member_name: String,
}

#[derive(Serialize)]
pub struct GroupMemberRef {
    pub member_name: String,
    pub account_type: Option<String>,
}

/// List the real (non-`@SHARED`) members of one specific group, with their detected
/// account type. Used by the `list_group_members` MCP tool - distinct from
/// `list_all_members`, which sweeps every group for the Hiscores poller.
pub async fn list_group_members(client: &Client, group_id: i64) -> Result<Vec<GroupMemberRef>, ApiError> {
    let stmt = client
        .prepare_cached(
            "SELECT member_name, account_type FROM osrsmcp.members WHERE group_id=$1 AND member_name != $2",
        )
        .await?;
    let rows = client.query(&stmt, &[&group_id, &SHARED_MEMBER]).await?;
    let mut result = Vec::with_capacity(rows.len());
    for row in rows {
        result.push(GroupMemberRef {
            member_name: row.try_get("member_name")?,
            account_type: row.try_get("account_type")?,
        });
    }
    Ok(result)
}

/// List every real (non-`@SHARED`) member across every group. Used by the periodic
/// Hiscores poller, which needs to sweep all tracked players regardless of group.
pub async fn list_all_members(client: &Client) -> Result<Vec<MemberRef>, ApiError> {
    let stmt = client
        .prepare_cached(
            "SELECT member_id, member_name FROM osrsmcp.members WHERE member_name != $1",
        )
        .await?;
    let rows = client.query(&stmt, &[&SHARED_MEMBER]).await?;
    let mut result = Vec::with_capacity(rows.len());
    for row in rows {
        result.push(MemberRef {
            member_id: row.try_get("member_id")?,
            member_name: row.try_get("member_name")?,
        });
    }
    Ok(result)
}

pub async fn record_slayer_task_completion(
    client: &Client,
    member_id: i64,
    task: &str,
    master: Option<&str>,
    amount_completed: i32,
    outcome: &str,
) -> Result<(), ApiError> {
    let stmt = client
        .prepare_cached(
            r#"
INSERT INTO osrsmcp.slayer_task_history (member_id, task, master, amount_completed, outcome)
VALUES ($1, $2, $3, $4, $5)
"#,
        )
        .await?;
    client
        .execute(&stmt, &[&member_id, &task, &master, &amount_completed, &outcome])
        .await
        .map_err(ApiError::RecordSlayerTaskCompletionError)?;
    Ok(())
}

pub async fn record_clue_completion(
    client: &Client,
    member_id: i64,
    tier: &str,
) -> Result<(), ApiError> {
    let stmt = client
        .prepare_cached(
            "INSERT INTO osrsmcp.clue_completions (member_id, tier) VALUES ($1, $2)",
        )
        .await?;
    client
        .execute(&stmt, &[&member_id, &tier])
        .await
        .map_err(ApiError::RecordClueCompletionError)?;
    Ok(())
}

pub async fn record_death(
    client: &Client,
    member_id: i64,
    world_x: Option<i32>,
    world_y: Option<i32>,
    plane: Option<i32>,
    killer: Option<&str>,
) -> Result<(), ApiError> {
    let stmt = client
        .prepare_cached(
            r#"
INSERT INTO osrsmcp.deaths (member_id, world_x, world_y, plane, killer)
VALUES ($1, $2, $3, $4, $5)
"#,
        )
        .await?;
    client
        .execute(&stmt, &[&member_id, &world_x, &world_y, &plane, &killer])
        .await
        .map_err(ApiError::RecordDeathError)?;
    Ok(())
}

/// Upsert a single Hiscores activity score (boss KC or clue-tier total) for a member.
/// Called by the periodic Hiscores poller - not client-reported, so this bypasses the
/// update_batcher entirely.
pub async fn upsert_hiscore_activity(
    client: &Client,
    member_id: i64,
    activity_name: &str,
    score: i32,
) -> Result<(), ApiError> {
    let stmt = client
        .prepare_cached(
            r#"
INSERT INTO osrsmcp.hiscore_activities (member_id, activity_name, score, last_updated)
VALUES ($1, $2, $3, NOW())
ON CONFLICT (member_id, activity_name) DO UPDATE SET score = excluded.score, last_updated = NOW()
"#,
        )
        .await?;
    client
        .execute(&stmt, &[&member_id, &activity_name, &score])
        .await
        .map_err(ApiError::UpsertHiscoreActivityError)?;
    Ok(())
}

pub async fn get_hiscore_activities(
    client: &Client,
    member_id: i64,
) -> Result<HashMap<String, i32>, ApiError> {
    let stmt = client
        .prepare_cached(
            "SELECT activity_name, score FROM osrsmcp.hiscore_activities WHERE member_id=$1",
        )
        .await?;
    let rows = client.query(&stmt, &[&member_id]).await?;
    let mut result = HashMap::with_capacity(rows.len());
    for row in rows {
        let activity_name: String = row.try_get("activity_name")?;
        let score: i32 = row.try_get("score")?;
        result.insert(activity_name, score);
    }
    Ok(result)
}

/// Update a member's detected account type. Called by the periodic Hiscores poller, which
/// determines this as a side effect of probing which mode-specific leaderboard matches -
/// not a one-time detection, since account type can genuinely change (e.g. a Hardcore
/// Ironman's unsafe death demotes them to regular Ironman immediately).
pub async fn update_account_type(
    client: &Client,
    member_id: i64,
    account_type: &str,
) -> Result<(), ApiError> {
    let stmt = client
        .prepare_cached(
            r#"
UPDATE osrsmcp.members SET account_type=$1, account_type_last_checked=NOW() WHERE member_id=$2
"#,
        )
        .await?;
    client
        .execute(&stmt, &[&account_type, &member_id])
        .await
        .map_err(ApiError::UpdateAccountTypeError)?;
    Ok(())
}

pub async fn upsert_item_metadata(
    client: &Client,
    item_id: i32,
    name: &str,
    high_alch: Option<i32>,
    low_alch: Option<i32>,
    tradeable: bool,
    members_only: Option<bool>,
) -> Result<(), ApiError> {
    let stmt = client
        .prepare_cached(
            r#"
INSERT INTO osrsmcp.item_metadata (item_id, name, high_alch, low_alch, tradeable, members_only, last_synced)
VALUES ($1, $2, $3, $4, $5, $6, NOW())
ON CONFLICT (item_id) DO UPDATE SET
  name = excluded.name,
  high_alch = excluded.high_alch,
  low_alch = excluded.low_alch,
  tradeable = excluded.tradeable,
  members_only = excluded.members_only,
  last_synced = NOW()
"#,
        )
        .await?;
    client
        .execute(
            &stmt,
            &[&item_id, &name, &high_alch, &low_alch, &tradeable, &members_only],
        )
        .await
        .map_err(ApiError::UpsertItemMetadataError)?;
    Ok(())
}

#[derive(Serialize, schemars::JsonSchema)]
pub struct SlayerTaskHistoryEntry {
    pub task: String,
    pub master: Option<String>,
    pub amount_completed: i32,
    pub outcome: String,
    pub completed_at: DateTime<Utc>,
}

pub async fn get_slayer_task_history(
    client: &Client,
    member_id: i64,
    limit: i64,
) -> Result<Vec<SlayerTaskHistoryEntry>, ApiError> {
    let stmt = client
        .prepare_cached(
            r#"
SELECT task, master, amount_completed, outcome, completed_at
FROM osrsmcp.slayer_task_history WHERE member_id=$1
ORDER BY completed_at DESC LIMIT $2
"#,
        )
        .await?;
    let rows = client.query(&stmt, &[&member_id, &limit]).await?;
    let mut result = Vec::with_capacity(rows.len());
    for row in rows {
        result.push(SlayerTaskHistoryEntry {
            task: row.try_get("task")?,
            master: row.try_get("master")?,
            amount_completed: row.try_get("amount_completed")?,
            outcome: row.try_get("outcome")?,
            completed_at: row.try_get("completed_at")?,
        });
    }
    Ok(result)
}

#[derive(Serialize, schemars::JsonSchema)]
pub struct ClueCompletionEntry {
    pub tier: String,
    pub completed_at: DateTime<Utc>,
}

pub async fn get_clue_completions(
    client: &Client,
    member_id: i64,
    tier: Option<&str>,
    limit: i64,
) -> Result<Vec<ClueCompletionEntry>, ApiError> {
    let rows = match tier {
        Some(tier) => {
            let stmt = client
                .prepare_cached(
                    r#"
SELECT tier, completed_at FROM osrsmcp.clue_completions
WHERE member_id=$1 AND tier=$2 ORDER BY completed_at DESC LIMIT $3
"#,
                )
                .await?;
            client.query(&stmt, &[&member_id, &tier, &limit]).await?
        }
        None => {
            let stmt = client
                .prepare_cached(
                    r#"
SELECT tier, completed_at FROM osrsmcp.clue_completions
WHERE member_id=$1 ORDER BY completed_at DESC LIMIT $2
"#,
                )
                .await?;
            client.query(&stmt, &[&member_id, &limit]).await?
        }
    };
    let mut result = Vec::with_capacity(rows.len());
    for row in rows {
        result.push(ClueCompletionEntry {
            tier: row.try_get("tier")?,
            completed_at: row.try_get("completed_at")?,
        });
    }
    Ok(result)
}

#[derive(Serialize, schemars::JsonSchema)]
pub struct DeathEntry {
    pub died_at: DateTime<Utc>,
    pub world_x: Option<i32>,
    pub world_y: Option<i32>,
    pub plane: Option<i32>,
    pub killer: Option<String>,
}

pub async fn get_deaths(
    client: &Client,
    member_id: i64,
    limit: i64,
) -> Result<Vec<DeathEntry>, ApiError> {
    let stmt = client
        .prepare_cached(
            r#"
SELECT died_at, world_x, world_y, plane, killer
FROM osrsmcp.deaths WHERE member_id=$1 ORDER BY died_at DESC LIMIT $2
"#,
        )
        .await?;
    let rows = client.query(&stmt, &[&member_id, &limit]).await?;
    let mut result = Vec::with_capacity(rows.len());
    for row in rows {
        result.push(DeathEntry {
            died_at: row.try_get("died_at")?,
            world_x: row.try_get("world_x")?,
            world_y: row.try_get("world_y")?,
            plane: row.try_get("plane")?,
            killer: row.try_get("killer")?,
        });
    }
    Ok(result)
}

pub struct ItemMetadataEntry {
    pub name: String,
    pub high_alch: Option<i32>,
    pub low_alch: Option<i32>,
    pub tradeable: bool,
}

/// Batch-resolve item metadata (name + alch values) for a set of item IDs, for
/// translating raw [id, qty, ...] arrays into LLM-readable output. Items with no
/// metadata row (should be rare after the weekly sync, but possible for very
/// recently-added items) are simply absent from the returned map - callers should
/// treat a missing entry as "name unknown" rather than erroring.
pub async fn get_item_metadata_batch(
    client: &Client,
    item_ids: &[i32],
) -> Result<HashMap<i32, ItemMetadataEntry>, ApiError> {
    if item_ids.is_empty() {
        return Ok(HashMap::new());
    }
    let stmt = client
        .prepare_cached(
            "SELECT item_id, name, high_alch, low_alch, tradeable FROM osrsmcp.item_metadata WHERE item_id = ANY($1)",
        )
        .await?;
    let rows = client.query(&stmt, &[&item_ids]).await?;
    let mut result = HashMap::with_capacity(rows.len());
    for row in rows {
        let item_id: i32 = row.try_get("item_id")?;
        result.insert(
            item_id,
            ItemMetadataEntry {
                name: row.try_get("name")?,
                high_alch: row.try_get("high_alch")?,
                low_alch: row.try_get("low_alch")?,
                tradeable: row.try_get("tradeable")?,
            },
        );
    }
    Ok(result)
}

pub enum AggregatePeriod {
    Day,
    Month,
    Year,
}
async fn aggregate_skills_for_period(
    transaction: &Transaction<'_>,
    period: AggregatePeriod,
    last_aggregation: &DateTime<Utc>,
) -> Result<(), ApiError> {
    let s = format!(
        r#"
INSERT INTO osrsmcp.skills_{} (member_id, time, skills)
SELECT member_id, date_trunc('{}', skills_last_update), skills FROM osrsmcp.members
WHERE skills_last_update IS NOT NULL AND skills IS NOT NULL AND skills_last_update >= $1
ON CONFLICT (member_id, time)
DO UPDATE SET skills=excluded.skills;
"#,
        match period {
            AggregatePeriod::Day => "day",
            AggregatePeriod::Month => "month",
            AggregatePeriod::Year => "year",
        },
        match period {
            AggregatePeriod::Day => "hour",
            AggregatePeriod::Month => "day",
            AggregatePeriod::Year => "month",
        }
    );
    let aggregate_stmt = transaction.prepare_cached(&s).await?;
    transaction
        .execute(&aggregate_stmt, &[&last_aggregation])
        .await?;

    Ok(())
}

async fn apply_skills_retention_for_period(
    transaction: &Transaction<'_>,
    period: AggregatePeriod,
    last_aggregation: &DateTime<Utc>,
) -> Result<(), ApiError> {
    let s = format!(
        r#"
DELETE FROM osrsmcp.skills_{0}
WHERE time < ($1::timestamptz - interval '{1}') AND (member_id, time) NOT IN (
  SELECT member_id, max(time) FROM osrsmcp.skills_{0} WHERE time < ($1::timestamptz - interval '{1}') GROUP BY member_id
)
"#,
        match period {
            AggregatePeriod::Day => "day",
            AggregatePeriod::Month => "month",
            AggregatePeriod::Year => "year",
        },
        match period {
            AggregatePeriod::Day => "1 day",
            AggregatePeriod::Month => "1 month",
            AggregatePeriod::Year => "1 year",
        }
    );
    let delete_old_rows_stmt = transaction.prepare_cached(&s).await?;
    transaction
        .execute(&delete_old_rows_stmt, &[&last_aggregation])
        .await?;

    Ok(())
}

pub async fn get_last_skills_aggregation(client: &Client) -> Result<DateTime<Utc>, ApiError> {
    let last_aggregation_stmt = client
        .prepare_cached(
            r#"
SELECT last_aggregation FROM osrsmcp.aggregation_info WHERE type='skills'"#,
        )
        .await?;
    let last_aggregation: DateTime<Utc> = client
        .query_one(&last_aggregation_stmt, &[])
        .await?
        .try_get(0)?;

    Ok(last_aggregation)
}

pub async fn aggregate_skills(client: &mut Client) -> Result<(), ApiError> {
    let last_aggregation = get_last_skills_aggregation(client).await?;

    let transaction = client.transaction().await?;
    let update_last_aggregation_stmt = transaction
        .prepare_cached(
            r#"
UPDATE osrsmcp.aggregation_info SET last_aggregation=NOW() WHERE type='skills'"#,
        )
        .await?;
    transaction
        .execute(&update_last_aggregation_stmt, &[])
        .await?;

    aggregate_skills_for_period(&transaction, AggregatePeriod::Day, &last_aggregation).await?;
    aggregate_skills_for_period(&transaction, AggregatePeriod::Month, &last_aggregation).await?;
    aggregate_skills_for_period(&transaction, AggregatePeriod::Year, &last_aggregation).await?;
    transaction.commit().await?;

    Ok(())
}

pub async fn apply_skills_retention(client: &mut Client) -> Result<(), ApiError> {
    let last_aggregation = get_last_skills_aggregation(client).await?;

    let transaction = client.transaction().await?;
    apply_skills_retention_for_period(&transaction, AggregatePeriod::Day, &last_aggregation)
        .await?;
    apply_skills_retention_for_period(&transaction, AggregatePeriod::Month, &last_aggregation)
        .await?;
    apply_skills_retention_for_period(&transaction, AggregatePeriod::Year, &last_aggregation)
        .await?;
    transaction.commit().await?;

    Ok(())
}

pub async fn get_skills_for_period(
    client: &Client,
    group_id: i64,
    period: AggregatePeriod,
) -> Result<GroupSkillData, ApiError> {
    let s = format!(
        r#"
SELECT member_name, time, s.skills
FROM osrsmcp.skills_{} s
INNER JOIN osrsmcp.members m ON m.member_id=s.member_id
WHERE m.group_id=$1
"#,
        match period {
            AggregatePeriod::Day => "day",
            AggregatePeriod::Month => "month",
            AggregatePeriod::Year => "year",
        }
    );
    let get_skills_stmt = client.prepare_cached(&s).await?;
    let rows = client
        .query(&get_skills_stmt, &[&group_id])
        .await
        .map_err(ApiError::GetSkillsDataError)?;

    let mut member_data = HashMap::new();
    for row in rows {
        let member_name: String = row.try_get("member_name")?;
        let skill_data = AggregateSkillData {
            time: row.try_get("time")?,
            data: row.try_get("skills")?,
        };

        if !member_data.contains_key(&member_name) {
            member_data.insert(
                member_name.clone(),
                MemberSkillData {
                    name: member_name,
                    skill_data: vec![skill_data],
                },
            );
        } else if let Some(member_skill_data) = member_data.get_mut(&member_name) {
            member_skill_data.skill_data.push(skill_data);
        }
    }

    Ok(member_data.into_values().collect())
}

pub async fn has_migration_run(client: &mut Client, name: &str) -> Result<bool, ApiError> {
    let count: i64 = client
        .query_one(
            "SELECT COUNT(*) FROM osrsmcp.migrations WHERE name=$1",
            &[&name],
        )
        .await?
        .try_get(0)?;

    Ok(count > 0)
}

pub async fn commit_migration(transaction: &Transaction<'_>, name: &str) -> Result<(), ApiError> {
    transaction
        .execute(
            "INSERT INTO osrsmcp.migrations (name, date) VALUES($1, NOW())",
            &[&name],
        )
        .await?;

    Ok(())
}

async fn create_timestamp_trigger(
    transaction: &Transaction<'_>,
    name: &str,
) -> Result<(), ApiError> {
    let create_fn = format!(
        r#"
CREATE OR REPLACE FUNCTION osrsmcp.update_{0}_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.{0}_last_update = now();
    RETURN NEW;
END;
$$ language 'plpgsql';
"#,
        name
    );
    transaction.execute(&create_fn, &[]).await?;

    let trigger_stmt = format!(
        r#"
DO
$$BEGIN
  CREATE TRIGGER set_{0}_timestamp
  BEFORE UPDATE ON osrsmcp.members
  FOR EACH ROW
  WHEN (OLD.{0} IS DISTINCT FROM NEW.{0})
  EXECUTE FUNCTION osrsmcp.update_{0}_timestamp();
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END;$$;
"#,
        name
    );
    transaction.execute(&trigger_stmt, &[]).await?;

    Ok(())
}

pub async fn update_schema(client: &mut Client) -> Result<(), ApiError> {
    client
        .execute(
            r#"
CREATE TABLE IF NOT EXISTS osrsmcp.migrations (
    name TEXT,
    date TIMESTAMPTZ
)
"#,
            &[],
        )
        .await?;

    if !has_migration_run(client, "add_groups_version_column").await? {
        let transaction = client.transaction().await?;
        transaction
            .execute(
                r#"
ALTER TABLE osrsmcp.groups ADD COLUMN IF NOT EXISTS version INTEGER default 1
"#,
                &[],
            )
            .await?;

        commit_migration(&transaction, "add_groups_version_column").await?;
        transaction.commit().await?;
    }

    if !has_migration_run(client, "create_members_table").await? {
        let transaction = client.transaction().await?;
        transaction
            .execute(
                r#"
CREATE TABLE IF NOT EXISTS osrsmcp.members (
  member_id BIGSERIAL PRIMARY KEY,
  group_id BIGSERIAL REFERENCES osrsmcp.groups(group_id),
  member_name TEXT NOT NULL,

  stats_last_update TIMESTAMPTZ,
  stats INTEGER[7],

  coordinates_last_update TIMESTAMPTZ,
  coordinates INTEGER[3],

  skills_last_update TIMESTAMPTZ,
  skills INTEGER[24],

  quests_last_update TIMESTAMPTZ,
  quests bytea,

  inventory_last_update TIMESTAMPTZ,
  inventory INTEGER[56],

  equipment_last_update TIMESTAMPTZ,
  equipment INTEGER[28],

  rune_pouch_last_update TIMESTAMPTZ,
  rune_pouch INTEGER[8],

  bank_last_update TIMESTAMPTZ,
  bank INTEGER[],

  seed_vault_last_update TIMESTAMPTZ,
  seed_vault INTEGER[],

  interacting_last_update TIMESTAMPTZ,
  interacting TEXT
);
"#,
                &[],
            )
            .await?;

        transaction.execute(r#"
CREATE UNIQUE INDEX IF NOT EXISTS members_groupid_name_idx ON osrsmcp.members (group_id, member_name);
"#, &[]).await?;

        commit_migration(&transaction, "create_members_table").await?;
        transaction.commit().await?;
    }

    if !has_migration_run(client, "add_diary_vars").await? {
        let transaction = client.transaction().await?;
        // Adding new columns for new types of data
        transaction
            .execute(
                r#"
ALTER TABLE osrsmcp.members
ADD COLUMN IF NOT EXISTS diary_vars_last_update TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS diary_vars INTEGER[62]
"#,
                &[],
            )
            .await?;

        commit_migration(&transaction, "add_diary_vars").await?;
        transaction.commit().await?;
    }

    if !has_migration_run(client, "add_skill_periods").await? {
        let transaction = client.transaction().await?;

        let periods = vec!["day", "month", "year"];
        for period in periods {
            let create_skills_aggregate = format!(
                r#"
CREATE TABLE IF NOT EXISTS osrsmcp.skills_{} (
    member_id BIGSERIAL REFERENCES osrsmcp.members(member_id),
    time TIMESTAMPTZ,
    skills INTEGER[24],

    PRIMARY KEY (member_id, time)
);
"#,
                period
            );
            transaction.execute(&create_skills_aggregate, &[]).await?;
        }

        transaction
            .execute(
                r#"
CREATE TABLE IF NOT EXISTS osrsmcp.aggregation_info (
    type TEXT PRIMARY KEY,
    last_aggregation TIMESTAMPTZ NOT NULL DEFAULT TIMESTAMP WITH TIME ZONE 'epoch'
);
"#,
                &[],
            )
            .await?;
        transaction
            .execute(
                r#"
INSERT INTO osrsmcp.aggregation_info (type) VALUES ('skills')
ON CONFLICT (type) DO NOTHING
"#,
                &[],
            )
            .await?;

        commit_migration(&transaction, "add_skill_periods").await?;
        transaction.commit().await?;
    }

    if !has_migration_run(client, "member_name_citext").await? {
        let transaction = client.transaction().await?;

        // We need to rename members in groups which would violate the unique constraint after
        // we make the column case insensitive.
        let duplicates = transaction
            .query(
                r#"
SELECT a.group_id, a.member_id, a.member_name FROM osrsmcp.members a
INNER JOIN (
	SELECT group_id, lower(member_name) as member_name, COUNT(*) FROM osrsmcp.members
	GROUP BY group_id, lower(member_name)
	HAVING COUNT(*) > 1
) b
ON a.group_id=b.group_id AND lower(a.member_name)=lower(b.member_name)
ORDER BY GREATEST(
	stats_last_update,
	coordinates_last_update,
	skills_last_update,
	quests_last_update,
	inventory_last_update,
	equipment_last_update,
	bank_last_update,
	rune_pouch_last_update,
	interacting_last_update,
	seed_vault_last_update,
	diary_vars_last_update
) ASC;
"#,
                &[],
            )
            .await?;

        let mut already_encounted: HashSet<String> = HashSet::new();
        for row in duplicates {
            let group_id: i64 = row.try_get("group_id")?;
            let member_id: i64 = row.try_get("member_id")?;
            let member_name: String = row.try_get("member_name")?;
            let member_name_lower: String = member_name.to_lowercase();

            let key = format!("{}::{}", group_id, member_name_lower);
            // Skip the first encounter with the duplicate name since that is the entry
            // with the most recent update.
            if !already_encounted.insert(key) {
                log::info!(
                    "Renaming duplicate member name '{}' in group '{}'",
                    member_name,
                    group_id
                );

                for _ in 1..5 {
                    let uuid = uuid::Uuid::new_v4().hyphenated().to_string();
                    let new_name = &uuid[..uuid.find("-").unwrap()];
                    log::info!("Trying new name '{}'", new_name);
                    if transaction
                        .execute(
                            "UPDATE osrsmcp.members SET member_name=$1 WHERE member_id=$2",
                            &[&new_name, &member_id],
                        )
                        .await
                        .is_ok()
                    {
                        break;
                    }
                }
            }
        }

        transaction
            .execute(
                "CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public",
                &[],
            )
            .await
            .ok();
        transaction
            .execute(
                "ALTER TABLE osrsmcp.members ALTER COLUMN member_name TYPE citext",
                &[],
            )
            .await?;

        commit_migration(&transaction, "member_name_citext").await?;
        transaction.commit().await?;
    }

    if !has_migration_run(client, "add_collection_log_member_column").await? {
        let transaction = client.transaction().await?;
        transaction
            .execute(
                r#"
ALTER TABLE osrsmcp.members
ADD COLUMN IF NOT EXISTS collection_log_last_update TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS collection_log INTEGER[]
"#,
                &[],
            )
            .await?;
        commit_migration(&transaction, "add_collection_log_member_column").await?;
        transaction.commit().await?;
    }

    if !has_migration_run(client, "migrate_collection_log_v2").await?
        && has_migration_run(client, "add_collection_log").await?
    {
        println!("beginning migration migrate_collection_log_v2");
        let transaction = client.transaction().await?;

        // collect the data to migrate
        let rows = transaction
            .query("SELECT member_id, items FROM osrsmcp.collection_log WHERE cardinality(items) > 0", &[])
            .await
            .unwrap();
        let mut member_data: HashMap<i64, Vec<i32>> = HashMap::new();
        for row in rows {
            let member_id: i64 = row.try_get("member_id")?;
            let items: Vec<i32> = row.try_get("items")?;

            match member_data.get_mut(&member_id) {
                Some(collection_log) => {
                    collection_log.extend(items.iter());
                }
                None => {
                    member_data.insert(member_id, items);
                }
            };
        }
        println!("need to migrate {} members", member_data.len());

        // breakup into chunks
        let chunk_size = 100;
        let member_data_list: Vec<(i64, Vec<i32>)> = member_data.into_iter().collect();
        let mut chunks = Vec::new();
        for chunk_slice in member_data_list.chunks(chunk_size) {
            let chunk_map: HashMap<i64, Vec<i32>> = chunk_slice.iter().cloned().collect();
            chunks.push(chunk_map);
        }
        println!("split into {} chunks of size {}", chunks.len(), chunk_size);

        // update new collection log column
        for (i, chunk) in chunks.iter().enumerate() {
            println!(
                "migrating chunk {}/{} size {}",
                i + 1,
                chunks.len(),
                chunk.len()
            );
            let mut values_clause = String::new();
            for i in 0..chunk.len() {
                values_clause.push_str(&format!(
                    "(${}::BIGINT, ${}::INTEGER[])",
                    i * 2 + 1,
                    i * 2 + 2
                ));
                if i < chunk.len() - 1 {
                    values_clause.push_str(", ");
                }
            }
            let mut params: Vec<&(dyn tokio_postgres::types::ToSql + Sync)> = Vec::new();
            for (member_id, items) in chunk.iter() {
                params.push(member_id);
                params.push(items);
            }

            // timestamp is set to value that will return on the initial frontend request, but does not show the player as online
            let update_query = format!(
                r#"
UPDATE osrsmcp.members as a SET collection_log=b.collection_log, collection_log_last_update='epoch'::timestamptz + INTERVAL '5 days'
FROM (VALUES {}) AS b(member_id, collection_log)
WHERE a.member_id=b.member_id
"#,
                values_clause
            );

            transaction.execute(&update_query, &params).await?;
        }

        commit_migration(&transaction, "migrate_collection_log_v2").await?;
        transaction.commit().await?;
        println!("finished migration migrate_collection_log_v2");
    }

    if !has_migration_run(client, "update_timestamp_triggers").await? {
        let transaction = client.transaction().await?;

        let names = vec![
            "stats",
            "coordinates",
            "skills",
            "quests",
            "inventory",
            "equipment",
            "bank",
            "rune_pouch",
            "interacting",
            "seed_vault",
            "diary_vars",
            "collection_log",
        ];

        for name in names {
            create_timestamp_trigger(&transaction, name).await?;
        }

        commit_migration(&transaction, "update_timestamp_triggers").await?;
        transaction.commit().await?;
    }

    if !has_migration_run(client, "add_potion_storage").await? {
        let transaction = client.transaction().await?;
        transaction
            .execute(
                r#"
ALTER TABLE osrsmcp.members
ADD COLUMN IF NOT EXISTS potion_storage_last_update TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS potion_storage INTEGER[]
"#,
                &[],
            )
            .await?;

        create_timestamp_trigger(&transaction, "potion_storage").await?;

        commit_migration(&transaction, "add_potion_storage").await?;
        transaction.commit().await?;
    }

    if !has_migration_run(client, "add_slayer_task_snapshot").await? {
        let transaction = client.transaction().await?;
        transaction
            .execute(
                r#"
ALTER TABLE osrsmcp.members
ADD COLUMN IF NOT EXISTS slayer_task_last_update TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS slayer_task TEXT
"#,
                &[],
            )
            .await?;

        create_timestamp_trigger(&transaction, "slayer_task").await?;

        commit_migration(&transaction, "add_slayer_task_snapshot").await?;
        transaction.commit().await?;
    }

    if !has_migration_run(client, "add_slayer_task_history").await? {
        let transaction = client.transaction().await?;
        transaction
            .execute(
                r#"
CREATE TABLE IF NOT EXISTS osrsmcp.slayer_task_history (
  id BIGSERIAL PRIMARY KEY,
  member_id BIGINT NOT NULL REFERENCES osrsmcp.members(member_id) ON DELETE CASCADE,
  task TEXT NOT NULL,
  master TEXT,
  amount_completed INTEGER NOT NULL,
  outcome TEXT NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)
"#,
                &[],
            )
            .await?;
        transaction
            .execute(
                r#"
CREATE INDEX IF NOT EXISTS slayer_task_history_member_idx
ON osrsmcp.slayer_task_history (member_id, completed_at DESC)
"#,
                &[],
            )
            .await?;

        commit_migration(&transaction, "add_slayer_task_history").await?;
        transaction.commit().await?;
    }

    if !has_migration_run(client, "add_combat_achievements_snapshot").await? {
        let transaction = client.transaction().await?;
        transaction
            .execute(
                r#"
ALTER TABLE osrsmcp.members
ADD COLUMN IF NOT EXISTS combat_achievements_last_update TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS combat_achievements INTEGER[6]
"#,
                &[],
            )
            .await?;

        create_timestamp_trigger(&transaction, "combat_achievements").await?;

        commit_migration(&transaction, "add_combat_achievements_snapshot").await?;
        transaction.commit().await?;
    }

    if !has_migration_run(client, "add_hiscore_activities").await? {
        let transaction = client.transaction().await?;
        transaction
            .execute(
                r#"
CREATE TABLE IF NOT EXISTS osrsmcp.hiscore_activities (
  member_id BIGINT NOT NULL REFERENCES osrsmcp.members(member_id) ON DELETE CASCADE,
  activity_name TEXT NOT NULL,
  score INTEGER NOT NULL,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (member_id, activity_name)
)
"#,
                &[],
            )
            .await?;

        commit_migration(&transaction, "add_hiscore_activities").await?;
        transaction.commit().await?;
    }

    if !has_migration_run(client, "add_account_type").await? {
        let transaction = client.transaction().await?;
        transaction
            .execute(
                r#"
ALTER TABLE osrsmcp.members
ADD COLUMN IF NOT EXISTS account_type TEXT,
ADD COLUMN IF NOT EXISTS account_type_last_checked TIMESTAMPTZ
"#,
                &[],
            )
            .await?;

        commit_migration(&transaction, "add_account_type").await?;
        transaction.commit().await?;
    }

    if !has_migration_run(client, "add_clue_completions").await? {
        let transaction = client.transaction().await?;
        transaction
            .execute(
                r#"
CREATE TABLE IF NOT EXISTS osrsmcp.clue_completions (
  id BIGSERIAL PRIMARY KEY,
  member_id BIGINT NOT NULL REFERENCES osrsmcp.members(member_id) ON DELETE CASCADE,
  tier TEXT NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)
"#,
                &[],
            )
            .await?;
        transaction
            .execute(
                r#"
CREATE INDEX IF NOT EXISTS clue_completions_member_idx
ON osrsmcp.clue_completions (member_id, tier, completed_at DESC)
"#,
                &[],
            )
            .await?;

        commit_migration(&transaction, "add_clue_completions").await?;
        transaction.commit().await?;
    }

    if !has_migration_run(client, "add_deaths_log").await? {
        let transaction = client.transaction().await?;
        transaction
            .execute(
                r#"
CREATE TABLE IF NOT EXISTS osrsmcp.deaths (
  id BIGSERIAL PRIMARY KEY,
  member_id BIGINT NOT NULL REFERENCES osrsmcp.members(member_id) ON DELETE CASCADE,
  died_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  world_x INTEGER,
  world_y INTEGER,
  plane INTEGER,
  killer TEXT
)
"#,
                &[],
            )
            .await?;
        transaction
            .execute(
                r#"
CREATE INDEX IF NOT EXISTS deaths_member_idx ON osrsmcp.deaths (member_id, died_at DESC)
"#,
                &[],
            )
            .await?;

        commit_migration(&transaction, "add_deaths_log").await?;
        transaction.commit().await?;
    }

    if !has_migration_run(client, "add_farming_patches_snapshot").await? {
        let transaction = client.transaction().await?;
        transaction
            .execute(
                r#"
ALTER TABLE osrsmcp.members
ADD COLUMN IF NOT EXISTS farming_patches_last_update TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS farming_patches TEXT
"#,
                &[],
            )
            .await?;

        create_timestamp_trigger(&transaction, "farming_patches").await?;

        commit_migration(&transaction, "add_farming_patches_snapshot").await?;
        transaction.commit().await?;
    }

    if !has_migration_run(client, "add_item_metadata").await? {
        let transaction = client.transaction().await?;
        transaction
            .execute(
                r#"
CREATE TABLE IF NOT EXISTS osrsmcp.item_metadata (
  item_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  high_alch INTEGER,
  low_alch INTEGER,
  tradeable BOOLEAN NOT NULL DEFAULT false,
  members_only BOOLEAN,
  last_synced TIMESTAMPTZ NOT NULL DEFAULT NOW()
)
"#,
                &[],
            )
            .await?;

        commit_migration(&transaction, "add_item_metadata").await?;
        transaction.commit().await?;
    }

    Ok(())
}
