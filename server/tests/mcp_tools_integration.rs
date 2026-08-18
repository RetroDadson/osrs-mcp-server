use deadpool_postgres::{ManagerConfig, Pool};
use std::env;
use tokio::sync::mpsc;
use tokio_postgres::NoTls;

use rmcp::handler::server::tool::Extension;
use rmcp::handler::server::wrapper::Parameters;

use server::config::Config;
use server::db;
use server::mcp::auth::AuthenticatedGroup;
use server::mcp::tools::{
    ClueTotalsArgs, HistoryArgs, ItemContainer, ItemsArgs, KillCountArgs, McpServer, MemberArgs,
};
use server::models::{CreateGroup, CropState, FarmingPatch, GroupMember, SlayerTask};
use server::update_batcher;

/// Serializes tests since they all share the same database and each drops/recreates the
/// schema. Mirrors the pattern in tests/update_batcher_integration.rs and
/// tests/authed_endpoints_integration.rs.
static TEST_MUTEX: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

const GROUP_NAME: &str = "mcp_test_group";
const TOKEN: &str = "mcp_test_token";
const MEMBER: &str = "alice";
const ITEM_ID: i32 = 1333; // Rune scimitar

async fn create_test_pool() -> Pool {
    let mut cfg = if let Ok(url) = env::var("TEST_DATABASE_URL") {
        let mut c = deadpool_postgres::Config::new();
        c.url = Some(url);
        c
    } else {
        let config = Config::from_env().expect("failed to read config.toml");
        let mut pg = config.pg.clone();
        pg.dbname = Some("osrsmcp_test".to_string());
        pg
    };

    cfg.manager = Some(ManagerConfig {
        recycling_method: deadpool_postgres::RecyclingMethod::Fast,
    });

    cfg.create_pool(None, NoTls).expect("failed to create test pool")
}

fn spawn_worker(pool: &Pool) -> (mpsc::Sender<GroupMember>, mpsc::Receiver<()>) {
    let (tx, rx) = mpsc::channel::<GroupMember>(16);
    let (notify_tx, notify_rx) = mpsc::channel::<()>(16);
    let worker_pool = pool.clone();
    tokio::spawn(async move {
        update_batcher::background_worker(worker_pool, rx, Some(notify_tx)).await;
    });
    (tx, notify_rx)
}

fn empty_member(group_id: i64, name: &str) -> GroupMember {
    GroupMember {
        group_id: Some(group_id),
        name: name.to_string(),
        stats: None,
        coordinates: None,
        skills: None,
        quests: None,
        inventory: None,
        equipment: None,
        bank: None,
        shared_bank: None,
        rune_pouch: None,
        interacting: None,
        seed_vault: None,
        deposited: None,
        diary_vars: None,
        collection_log_v2: None,
        potion_storage: None,
        slayer_task: None,
        combat_achievements: None,
        farming_patches: None,
        account_type: None,
        last_updated: None,
    }
}

/// Sets up a clean schema with one group ("mcp_test_group") and one member ("alice"),
/// seeded with data across every category the MCP tool layer exposes: snapshot fields
/// (via the real update_batcher, same path the plugin's update-group-member POST uses),
/// event logs, Hiscores activities, item metadata, and account type. Returns (group_id,
/// member_id).
async fn setup_seeded_group(pool: &Pool) -> (i64, i64) {
    let mut client = pool.get().await.expect("failed to get client");

    client
        .execute("DROP SCHEMA IF EXISTS osrsmcp CASCADE", &[])
        .await
        .expect("failed to drop schema");
    client
        .execute("CREATE SCHEMA IF NOT EXISTS osrsmcp", &[])
        .await
        .expect("failed to create schema");
    client
        .execute(
            r#"CREATE TABLE osrsmcp.groups(
                group_id BIGSERIAL UNIQUE,
                group_name TEXT NOT NULL,
                group_token_hash CHAR(64) NOT NULL,
                PRIMARY KEY (group_name, group_token_hash)
            )"#,
            &[],
        )
        .await
        .expect("failed to create groups table");

    db::update_schema(&mut client).await.expect("failed to update schema");

    let create_group = CreateGroup {
        name: GROUP_NAME.to_string(),
        member_names: vec![MEMBER.to_string()],
        captcha_response: String::new(),
        token: TOKEN.to_string(),
    };
    db::create_group(&mut client, &create_group)
        .await
        .expect("failed to create test group");

    let group_id = db::get_group(&client, GROUP_NAME, TOKEN)
        .await
        .expect("failed to look up created group");
    let member_id = db::get_member_id(&client, group_id, MEMBER)
        .await
        .expect("failed to look up created member");

    // Snapshot fields, through the real batcher - same path update-group-member uses.
    let (tx, mut notify_rx) = spawn_worker(pool);
    let mut member = empty_member(group_id, MEMBER);
    member.stats = Some(vec![99, 99, 1, 1, 100, 0, 0]);
    member.coordinates = Some(vec![3200, 3200, 0]);

    let mut skills = vec![0i32; 24];
    skills[0] = 100_000; // Attack
    member.skills = Some(skills);

    member.quests = Some(vec![0, 1, 2]);

    let mut inventory = vec![0i32; 56];
    inventory[0] = ITEM_ID;
    inventory[1] = 5;
    member.inventory = Some(inventory);

    let mut equipment = vec![0i32; 28];
    equipment[6] = ITEM_ID; // slot index 3 ("weapon")
    equipment[7] = 1;
    member.equipment = Some(equipment);

    member.seed_vault = Some(vec![ITEM_ID, 3]);
    member.diary_vars = Some(vec![1, 2, 3]);
    member.collection_log_v2 = Some(vec![ITEM_ID]);
    member.slayer_task = Some(SlayerTask {
        task: "Zombies".to_string(),
        master: Some("Turael".to_string()),
        amount_remaining: 45,
        initial_amount: 50,
        points: 12,
        task_streak: 3,
        wilderness_streak: 0,
    });
    member.combat_achievements = Some(vec![5, 4, 3, 2, 1, 0]);
    member.farming_patches = Some(vec![
        FarmingPatch {
            name: "patch_a".to_string(),
            state: Some(CropState::Empty),
            raw_value: 0,
            produce: None,
        },
        FarmingPatch {
            name: "patch_b".to_string(),
            state: None,
            raw_value: 12,
            produce: None,
        },
    ]);

    tx.send(member).await.expect("failed to send member update");
    notify_rx.recv().await.expect("worker should process batch");

    // Everything else: direct db:: write paths, same as the real background jobs/event
    // endpoints use (Hiscores poller, item metadata sync, the 3 event endpoints).
    db::upsert_hiscore_activity(&client, member_id, "Zulrah", 150)
        .await
        .expect("failed to seed boss kc");
    db::upsert_hiscore_activity(&client, member_id, "Clue Scrolls (medium)", 12)
        .await
        .expect("failed to seed clue total");
    db::update_account_type(&client, member_id, "ironman")
        .await
        .expect("failed to seed account type");
    db::upsert_item_metadata(
        &client,
        ITEM_ID,
        "Rune scimitar",
        Some(5000),
        Some(2000),
        true,
        Some(true),
    )
    .await
    .expect("failed to seed item metadata");
    db::record_slayer_task_completion(&client, member_id, "Zombies", Some("Turael"), 50, "completed")
        .await
        .expect("failed to seed slayer history");
    db::record_clue_completion(&client, member_id, "medium")
        .await
        .expect("failed to seed clue completion");
    db::record_death(&client, member_id, Some(3200), Some(3200), Some(0), Some("Zombie"))
        .await
        .expect("failed to seed death");

    (group_id, member_id)
}

fn authed_parts(group_id: i64) -> http::request::Parts {
    let mut parts = http::Request::builder().body(()).unwrap().into_parts().0;
    parts.extensions.insert(AuthenticatedGroup { group_id });
    parts
}

fn member_args() -> MemberArgs {
    MemberArgs {
        member_name: MEMBER.to_string(),
    }
}

#[tokio::test]
async fn test_list_group_members_includes_account_type() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = create_test_pool().await;
    let (group_id, _) = setup_seeded_group(&pool).await;
    let server = McpServer::new(pool);

    let result = server
        .list_group_members(Extension(authed_parts(group_id)))
        .await
        .expect("list_group_members should succeed");

    assert_eq!(result.0.len(), 1);
    assert_eq!(result.0[0].name, MEMBER);
    assert_eq!(result.0[0].account_type.as_deref(), Some("ironman"));
}

#[tokio::test]
async fn test_get_member_status_returns_core_fields() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = create_test_pool().await;
    let (group_id, _) = setup_seeded_group(&pool).await;
    let server = McpServer::new(pool);

    let result = server
        .get_member_status(Extension(authed_parts(group_id)), Parameters(member_args()))
        .await
        .expect("get_member_status should succeed");

    let value = result.0;
    assert_eq!(value["name"], MEMBER);
    assert_eq!(value["account_type"], "ironman");
    assert_eq!(value["slayer_task"]["task"], "Zombies");
}

#[tokio::test]
async fn test_get_items_inventory_resolves_names_and_alch() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = create_test_pool().await;
    let (group_id, _) = setup_seeded_group(&pool).await;
    let server = McpServer::new(pool);

    let result = server
        .get_items(
            Extension(authed_parts(group_id)),
            Parameters(ItemsArgs {
                member_name: MEMBER.to_string(),
                container: ItemContainer::Inventory,
            }),
        )
        .await
        .expect("get_items should succeed");

    assert_eq!(result.0.len(), 1);
    let item = &result.0[0];
    assert_eq!(item.item_id, ITEM_ID);
    assert_eq!(item.name.as_deref(), Some("Rune scimitar"));
    assert_eq!(item.quantity, 5);
    assert_eq!(item.high_alch, Some(5000));
    assert_eq!(item.low_alch, Some(2000));
    assert_eq!(item.slot, None);
}

#[tokio::test]
async fn test_get_items_equipment_labels_slot() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = create_test_pool().await;
    let (group_id, _) = setup_seeded_group(&pool).await;
    let server = McpServer::new(pool);

    let result = server
        .get_items(
            Extension(authed_parts(group_id)),
            Parameters(ItemsArgs {
                member_name: MEMBER.to_string(),
                container: ItemContainer::Equipment,
            }),
        )
        .await
        .expect("get_items should succeed");

    assert_eq!(result.0.len(), 1);
    assert_eq!(result.0[0].item_id, ITEM_ID);
    assert_eq!(result.0[0].slot, Some("weapon"));
}

#[tokio::test]
async fn test_get_items_seed_vault_resolves_names() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = create_test_pool().await;
    let (group_id, _) = setup_seeded_group(&pool).await;
    let server = McpServer::new(pool);

    let result = server
        .get_items(
            Extension(authed_parts(group_id)),
            Parameters(ItemsArgs {
                member_name: MEMBER.to_string(),
                container: ItemContainer::SeedVault,
            }),
        )
        .await
        .expect("get_items should succeed");

    assert_eq!(result.0.len(), 1);
    assert_eq!(result.0[0].item_id, ITEM_ID);
    assert_eq!(result.0[0].quantity, 3);
}

#[tokio::test]
async fn test_get_items_shared_bank_is_always_empty_via_this_path() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = create_test_pool().await;
    let (group_id, _) = setup_seeded_group(&pool).await;
    let server = McpServer::new(pool);

    // db::get_group_data hardcodes shared_bank to None (it's sourced differently, not
    // per-member) - documenting that get_items(SharedBank) is currently a no-op path
    // rather than asserting it returns real data.
    let result = server
        .get_items(
            Extension(authed_parts(group_id)),
            Parameters(ItemsArgs {
                member_name: MEMBER.to_string(),
                container: ItemContainer::SharedBank,
            }),
        )
        .await
        .expect("get_items should succeed");

    assert!(result.0.is_empty());
}

#[tokio::test]
async fn test_get_info_identifies_server_and_lists_instructions() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = create_test_pool().await;
    setup_seeded_group(&pool).await;
    let server = McpServer::new(pool);

    let info = rmcp::ServerHandler::get_info(&server);
    assert_eq!(info.server_info.name, "osrs-mcp");
    assert!(info.instructions.is_some_and(|i| i.contains("list_group_members")));
}

#[tokio::test]
async fn test_get_skills_maps_xp_by_name() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = create_test_pool().await;
    let (group_id, _) = setup_seeded_group(&pool).await;
    let server = McpServer::new(pool);

    let result = server
        .get_skills(Extension(authed_parts(group_id)), Parameters(member_args()))
        .await
        .expect("get_skills should succeed");

    assert_eq!(result.0.get("Attack"), Some(&100_000i64));
    assert_eq!(result.0.get("Defence"), Some(&0i64));
}

#[tokio::test]
async fn test_get_quests_returns_raw_state() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = create_test_pool().await;
    let (group_id, _) = setup_seeded_group(&pool).await;
    let server = McpServer::new(pool);

    let result = server
        .get_quests(Extension(authed_parts(group_id)), Parameters(member_args()))
        .await
        .expect("get_quests should succeed");

    assert_eq!(result.0, vec![0, 1, 2]);
}

#[tokio::test]
async fn test_get_slayer_task_returns_current_snapshot() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = create_test_pool().await;
    let (group_id, _) = setup_seeded_group(&pool).await;
    let server = McpServer::new(pool);

    let result = server
        .get_slayer_task(Extension(authed_parts(group_id)), Parameters(member_args()))
        .await
        .expect("get_slayer_task should succeed");

    let task = result.0.expect("slayer task should be present");
    assert_eq!(task.task, "Zombies");
    assert_eq!(task.amount_remaining, 45);
}

#[tokio::test]
async fn test_get_slayer_history_returns_recorded_completion() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = create_test_pool().await;
    let (group_id, _) = setup_seeded_group(&pool).await;
    let server = McpServer::new(pool);

    let result = server
        .get_slayer_history(
            Extension(authed_parts(group_id)),
            Parameters(HistoryArgs {
                member_name: MEMBER.to_string(),
                limit: None,
            }),
        )
        .await
        .expect("get_slayer_history should succeed");

    assert_eq!(result.0.len(), 1);
    assert_eq!(result.0[0].task, "Zombies");
    assert_eq!(result.0[0].outcome, "completed");
}

#[tokio::test]
async fn test_get_kill_counts_excludes_clues_and_supports_filter() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = create_test_pool().await;
    let (group_id, _) = setup_seeded_group(&pool).await;
    let server = McpServer::new(pool);

    let all = server
        .get_kill_counts(
            Extension(authed_parts(group_id)),
            Parameters(KillCountArgs {
                member_name: MEMBER.to_string(),
                boss: None,
            }),
        )
        .await
        .expect("get_kill_counts should succeed");
    assert_eq!(all.0.get("Zulrah"), Some(&150));
    assert!(!all.0.contains_key("Clue Scrolls (medium)"));

    let filtered = server
        .get_kill_counts(
            Extension(authed_parts(group_id)),
            Parameters(KillCountArgs {
                member_name: MEMBER.to_string(),
                boss: Some("zulrah".to_string()),
            }),
        )
        .await
        .expect("get_kill_counts with filter should succeed");
    assert_eq!(filtered.0.len(), 1);
}

#[tokio::test]
async fn test_get_combat_achievements_returns_tier_counts() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = create_test_pool().await;
    let (group_id, _) = setup_seeded_group(&pool).await;
    let server = McpServer::new(pool);

    let result = server
        .get_combat_achievements(Extension(authed_parts(group_id)), Parameters(member_args()))
        .await
        .expect("get_combat_achievements should succeed");

    assert_eq!(result.0, Some(vec![5, 4, 3, 2, 1, 0]));
}

#[tokio::test]
async fn test_get_clue_totals_filters_by_tier_name() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = create_test_pool().await;
    let (group_id, _) = setup_seeded_group(&pool).await;
    let server = McpServer::new(pool);

    let all = server
        .get_clue_totals(
            Extension(authed_parts(group_id)),
            Parameters(ClueTotalsArgs {
                member_name: MEMBER.to_string(),
                tier: None,
            }),
        )
        .await
        .expect("get_clue_totals should succeed");
    assert_eq!(all.0.get("Clue Scrolls (medium)"), Some(&12));
    assert!(!all.0.contains_key("Zulrah"));

    let filtered = server
        .get_clue_totals(
            Extension(authed_parts(group_id)),
            Parameters(ClueTotalsArgs {
                member_name: MEMBER.to_string(),
                tier: Some("medium".to_string()),
            }),
        )
        .await
        .expect("get_clue_totals with filter should succeed");
    assert_eq!(filtered.0.len(), 1);
}

#[tokio::test]
async fn test_get_clue_completion_history_returns_recorded_completion() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = create_test_pool().await;
    let (group_id, _) = setup_seeded_group(&pool).await;
    let server = McpServer::new(pool);

    let result = server
        .get_clue_completion_history(
            Extension(authed_parts(group_id)),
            Parameters(HistoryArgs {
                member_name: MEMBER.to_string(),
                limit: None,
            }),
        )
        .await
        .expect("get_clue_completion_history should succeed");

    assert_eq!(result.0.len(), 1);
    assert_eq!(result.0[0].tier, "medium");
}

#[tokio::test]
async fn test_get_deaths_returns_recorded_death() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = create_test_pool().await;
    let (group_id, _) = setup_seeded_group(&pool).await;
    let server = McpServer::new(pool);

    let result = server
        .get_deaths(
            Extension(authed_parts(group_id)),
            Parameters(HistoryArgs {
                member_name: MEMBER.to_string(),
                limit: None,
            }),
        )
        .await
        .expect("get_deaths should succeed");

    assert_eq!(result.0.len(), 1);
    assert_eq!(result.0[0].killer.as_deref(), Some("Zombie"));
    assert_eq!(result.0[0].world_x, Some(3200));
}

#[tokio::test]
async fn test_get_farming_patches_honest_state_reporting() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = create_test_pool().await;
    let (group_id, _) = setup_seeded_group(&pool).await;
    let server = McpServer::new(pool);

    let result = server
        .get_farming_patches(Extension(authed_parts(group_id)), Parameters(member_args()))
        .await
        .expect("get_farming_patches should succeed");

    let patches = result.0.expect("farming patches should be present");
    assert_eq!(patches.len(), 2);
    assert_eq!(patches[0].state, Some(CropState::Empty));
    assert_eq!(patches[1].state, None);
    assert_eq!(patches[1].raw_value, 12);
}

#[tokio::test]
async fn test_get_collection_log_resolves_names() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = create_test_pool().await;
    let (group_id, _) = setup_seeded_group(&pool).await;
    let server = McpServer::new(pool);

    let result = server
        .get_collection_log(Extension(authed_parts(group_id)), Parameters(member_args()))
        .await
        .expect("get_collection_log should succeed");

    assert_eq!(result.0.len(), 1);
    assert_eq!(result.0[0].item_id, ITEM_ID);
    assert_eq!(result.0[0].name.as_deref(), Some("Rune scimitar"));
    assert_eq!(result.0[0].quantity, 1);
}

#[tokio::test]
async fn test_get_achievement_diary_progress_returns_raw_vars() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = create_test_pool().await;
    let (group_id, _) = setup_seeded_group(&pool).await;
    let server = McpServer::new(pool);

    let result = server
        .get_achievement_diary_progress(Extension(authed_parts(group_id)), Parameters(member_args()))
        .await
        .expect("get_achievement_diary_progress should succeed");

    assert_eq!(result.0, Some(vec![1, 2, 3]));
}

#[tokio::test]
async fn test_unknown_member_returns_helpful_error() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = create_test_pool().await;
    let (group_id, _) = setup_seeded_group(&pool).await;
    let server = McpServer::new(pool);

    let result = server
        .get_slayer_task(
            Extension(authed_parts(group_id)),
            Parameters(MemberArgs {
                member_name: "NotARealMember".to_string(),
            }),
        )
        .await;
    let err = match result {
        Ok(_) => panic!("unknown member should error, not return data"),
        Err(e) => e,
    };

    assert!(err.message.contains("No member named"));
    assert!(err.message.contains("list_group_members"));
}

#[tokio::test]
async fn test_wrong_group_cannot_see_another_groups_member() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = create_test_pool().await;
    let (group_id, _) = setup_seeded_group(&pool).await;
    let server = McpServer::new(pool);

    // A group_id that was never created should behave exactly like an unknown member -
    // no data leaks across groups just because a caller could guess an id.
    let result = server
        .get_slayer_task(Extension(authed_parts(group_id + 999)), Parameters(member_args()))
        .await;
    let err = match result {
        Ok(_) => panic!("member lookup scoped to a different group should fail"),
        Err(e) => e,
    };

    assert!(err.message.contains("No member named"));
}

#[tokio::test]
async fn test_missing_auth_extension_returns_internal_error() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = create_test_pool().await;
    setup_seeded_group(&pool).await;
    let server = McpServer::new(pool);

    let bare_parts = http::Request::builder().body(()).unwrap().into_parts().0;
    let result = server.list_group_members(Extension(bare_parts)).await;
    let err = match result {
        Ok(_) => panic!("missing AuthenticatedGroup extension should error"),
        Err(e) => e,
    };

    assert!(err.message.contains("authenticated group"));
}
