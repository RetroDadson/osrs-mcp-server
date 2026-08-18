use actix_web::{test, web, App};
use deadpool_postgres::{ManagerConfig, Pool, RecyclingMethod};
use std::env;
use tokio::sync::mpsc;
use tokio_postgres::NoTls;

use server::auth_middleware::{AuthenticateMiddlewareFactory, AuthenticationCache};
use server::authed;
use server::config::Config;
use server::db;
use server::models::{CreateGroup, GroupMember};
use server::update_batcher;

/// Serializes tests since they all share the same database and each drops/recreates
/// the schema. Mirrors the pattern in tests/update_batcher_integration.rs.
static TEST_MUTEX: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

const TEST_GROUP_NAME: &str = "test_group";
const TEST_GROUP_TOKEN: &str = "test_token";

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
        recycling_method: RecyclingMethod::Fast,
    });

    cfg.create_pool(None, NoTls).expect("failed to create test pool")
}

/// Set up a clean schema and a test group with member "alice". Returns the pool.
async fn setup(pool: &Pool) {
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
        name: TEST_GROUP_NAME.to_string(),
        member_names: vec!["alice".to_string()],
        captcha_response: String::new(),
        token: TEST_GROUP_TOKEN.to_string(),
    };
    db::create_group(&mut client, &create_group)
        .await
        .expect("failed to create test group");
}

macro_rules! test_app {
    ($pool:expr) => {
        test::init_service(
            App::new()
                .app_data(web::Data::new($pool.clone()))
                .service(
                    web::scope("/api/group/{group_name}")
                        .wrap(AuthenticateMiddlewareFactory::new(std::sync::Arc::new(
                            AuthenticationCache::new(),
                        )))
                        .service(authed::slayer_task_completed)
                        .service(authed::clue_completed)
                        .service(authed::death),
                ),
        )
        .await
    };
}

/// Full authed surface, including update_group_member which needs an mpsc::Sender in
/// app_data. A bounded channel with headroom absorbs test messages without a receiver
/// actively draining it - tests that need to verify persistence spawn their own worker
/// via spawn_worker_for and drain it explicitly.
macro_rules! full_test_app {
    ($pool:expr, $tx:expr) => {
        test::init_service(
            App::new()
                .app_data(web::Data::new($pool.clone()))
                .app_data(web::Data::new($tx.clone()))
                .service(
                    web::scope("/api/group/{group_name}")
                        .wrap(AuthenticateMiddlewareFactory::new(std::sync::Arc::new(
                            AuthenticationCache::new(),
                        )))
                        .service(authed::add_group_member)
                        .service(authed::delete_group_member)
                        .service(authed::rename_group_member)
                        .service(authed::update_group_member)
                        .service(authed::get_group_data)
                        .service(authed::am_i_logged_in)
                        .service(authed::am_i_in_group)
                        .service(authed::get_skill_data)
                        .service(authed::get_collection_log)
                        .service(authed::slayer_task_completed)
                        .service(authed::clue_completed)
                        .service(authed::death),
                ),
        )
        .await
    };
}

fn spawn_worker_for(pool: &Pool) -> (mpsc::Sender<GroupMember>, mpsc::Receiver<()>) {
    let (tx, rx) = mpsc::channel::<GroupMember>(16);
    let (notify_tx, notify_rx) = mpsc::channel::<()>(16);
    let worker_pool = pool.clone();
    tokio::spawn(async move {
        update_batcher::background_worker(worker_pool, rx, Some(notify_tx)).await;
    });
    (tx, notify_rx)
}

#[tokio::test]
async fn test_slayer_task_completed_success() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = create_test_pool().await;
    setup(&pool).await;
    let app = test_app!(pool);

    let req = test::TestRequest::post()
        .uri(&format!("/api/group/{}/slayer-task-completed", TEST_GROUP_NAME))
        .insert_header(("Authorization", TEST_GROUP_TOKEN))
        .set_json(serde_json::json!({
            "name": "alice",
            "task": "Gargoyles",
            "master": "Duradel",
            "amount_completed": 150,
            "outcome": "completed"
        }))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 201);

    let client = pool.get().await.unwrap();
    let rows = client
        .query("SELECT task FROM osrsmcp.slayer_task_history", &[])
        .await
        .unwrap();
    assert_eq!(rows.len(), 1);
}

#[tokio::test]
async fn test_slayer_task_completed_rejects_shared_member() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = create_test_pool().await;
    setup(&pool).await;
    let app = test_app!(pool);

    let req = test::TestRequest::post()
        .uri(&format!("/api/group/{}/slayer-task-completed", TEST_GROUP_NAME))
        .insert_header(("Authorization", TEST_GROUP_TOKEN))
        .set_json(serde_json::json!({
            "name": "@SHARED",
            "task": "Gargoyles",
            "master": null,
            "amount_completed": 150,
            "outcome": "completed"
        }))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 400);
}

#[tokio::test]
async fn test_slayer_task_completed_rejects_oversized_task_name() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = create_test_pool().await;
    setup(&pool).await;
    let app = test_app!(pool);

    let req = test::TestRequest::post()
        .uri(&format!("/api/group/{}/slayer-task-completed", TEST_GROUP_NAME))
        .insert_header(("Authorization", TEST_GROUP_TOKEN))
        .set_json(serde_json::json!({
            "name": "alice",
            "task": "x".repeat(101),
            "master": null,
            "amount_completed": 150,
            "outcome": "completed"
        }))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 400);
}

#[tokio::test]
async fn test_slayer_task_completed_rejects_missing_authorization_header() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = create_test_pool().await;
    setup(&pool).await;
    let app = test_app!(pool);

    let req = test::TestRequest::post()
        .uri(&format!("/api/group/{}/slayer-task-completed", TEST_GROUP_NAME))
        .set_json(serde_json::json!({
            "name": "alice",
            "task": "Gargoyles",
            "master": null,
            "amount_completed": 150,
            "outcome": "completed"
        }))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 400);
}

#[tokio::test]
async fn test_authentication_cache_default_constructs() {
    use server::auth_middleware::AuthenticationCache;
    let _cache: AuthenticationCache = Default::default();
}

#[tokio::test]
async fn test_slayer_task_completed_rejects_unauthenticated_request() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = create_test_pool().await;
    setup(&pool).await;
    let app = test_app!(pool);

    let req = test::TestRequest::post()
        .uri(&format!("/api/group/{}/slayer-task-completed", TEST_GROUP_NAME))
        .insert_header(("Authorization", "wrong-token"))
        .set_json(serde_json::json!({
            "name": "alice",
            "task": "Gargoyles",
            "master": null,
            "amount_completed": 150,
            "outcome": "completed"
        }))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 401);
}

#[tokio::test]
async fn test_clue_completed_success() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = create_test_pool().await;
    setup(&pool).await;
    let app = test_app!(pool);

    let req = test::TestRequest::post()
        .uri(&format!("/api/group/{}/clue-completed", TEST_GROUP_NAME))
        .insert_header(("Authorization", TEST_GROUP_TOKEN))
        .set_json(serde_json::json!({"name": "alice", "tier": "elite"}))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 201);

    let client = pool.get().await.unwrap();
    let rows = client
        .query("SELECT tier FROM osrsmcp.clue_completions", &[])
        .await
        .unwrap();
    assert_eq!(rows.len(), 1);
    let tier: String = rows[0].get("tier");
    assert_eq!(tier, "elite");
}

#[tokio::test]
async fn test_clue_completed_rejects_invalid_tier() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = create_test_pool().await;
    setup(&pool).await;
    let app = test_app!(pool);

    // "extreme" is not a valid ClueTier variant - should fail JSON deserialization.
    let req = test::TestRequest::post()
        .uri(&format!("/api/group/{}/clue-completed", TEST_GROUP_NAME))
        .insert_header(("Authorization", TEST_GROUP_TOKEN))
        .set_json(serde_json::json!({"name": "alice", "tier": "extreme"}))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 400);
}

#[tokio::test]
async fn test_death_success() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = create_test_pool().await;
    setup(&pool).await;
    let app = test_app!(pool);

    let req = test::TestRequest::post()
        .uri(&format!("/api/group/{}/death", TEST_GROUP_NAME))
        .insert_header(("Authorization", TEST_GROUP_TOKEN))
        .set_json(serde_json::json!({
            "name": "alice",
            "world_x": 3200,
            "world_y": 3200,
            "plane": 0,
            "killer": "Zulrah"
        }))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 201);

    let client = pool.get().await.unwrap();
    let rows = client.query("SELECT killer FROM osrsmcp.deaths", &[]).await.unwrap();
    assert_eq!(rows.len(), 1);
}

#[tokio::test]
async fn test_death_with_no_optional_fields_still_succeeds() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = create_test_pool().await;
    setup(&pool).await;
    let app = test_app!(pool);

    let req = test::TestRequest::post()
        .uri(&format!("/api/group/{}/death", TEST_GROUP_NAME))
        .insert_header(("Authorization", TEST_GROUP_TOKEN))
        .set_json(serde_json::json!({"name": "alice"}))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 201);
}

#[tokio::test]
async fn test_death_rejects_unknown_member() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = create_test_pool().await;
    setup(&pool).await;
    let app = test_app!(pool);

    let req = test::TestRequest::post()
        .uri(&format!("/api/group/{}/death", TEST_GROUP_NAME))
        .insert_header(("Authorization", TEST_GROUP_TOKEN))
        .set_json(serde_json::json!({"name": "not-a-real-member"}))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 500);
}

// ──────────────────────────────────────────────────────────────────────────
// add / delete / rename group member
// ──────────────────────────────────────────────────────────────────────────

#[tokio::test]
async fn test_add_group_member_success() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = create_test_pool().await;
    setup(&pool).await;
    let (tx, _notify_rx) = spawn_worker_for(&pool);
    let app = full_test_app!(pool, tx);

    let req = test::TestRequest::post()
        .uri(&format!("/api/group/{}/add-group-member", TEST_GROUP_NAME))
        .insert_header(("Authorization", TEST_GROUP_TOKEN))
        .set_json(serde_json::json!({"name": "bob"}))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 201);

    let client = pool.get().await.unwrap();
    let rows = client
        .query("SELECT member_name FROM osrsmcp.members WHERE member_name = 'bob'", &[])
        .await
        .unwrap();
    assert_eq!(rows.len(), 1);
}

#[tokio::test]
async fn test_add_group_member_rejects_shared_member_name() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = create_test_pool().await;
    setup(&pool).await;
    let (tx, _notify_rx) = spawn_worker_for(&pool);
    let app = full_test_app!(pool, tx);

    let req = test::TestRequest::post()
        .uri(&format!("/api/group/{}/add-group-member", TEST_GROUP_NAME))
        .insert_header(("Authorization", TEST_GROUP_TOKEN))
        .set_json(serde_json::json!({"name": "@SHARED"}))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 400);
}

#[tokio::test]
async fn test_add_group_member_rejects_invalid_name() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = create_test_pool().await;
    setup(&pool).await;
    let (tx, _notify_rx) = spawn_worker_for(&pool);
    let app = full_test_app!(pool, tx);

    let req = test::TestRequest::post()
        .uri(&format!("/api/group/{}/add-group-member", TEST_GROUP_NAME))
        .insert_header(("Authorization", TEST_GROUP_TOKEN))
        .set_json(serde_json::json!({"name": "not valid!!"}))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 400);
}

#[tokio::test]
async fn test_delete_group_member_success() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = create_test_pool().await;
    setup(&pool).await;
    let (tx, _notify_rx) = spawn_worker_for(&pool);
    let app = full_test_app!(pool, tx);

    let req = test::TestRequest::delete()
        .uri(&format!("/api/group/{}/delete-group-member", TEST_GROUP_NAME))
        .insert_header(("Authorization", TEST_GROUP_TOKEN))
        .set_json(serde_json::json!({"name": "alice"}))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 200);

    let client = pool.get().await.unwrap();
    let rows = client
        .query("SELECT member_name FROM osrsmcp.members WHERE member_name = 'alice'", &[])
        .await
        .unwrap();
    assert_eq!(rows.len(), 0);
}

#[tokio::test]
async fn test_delete_group_member_rejects_shared_member_name() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = create_test_pool().await;
    setup(&pool).await;
    let (tx, _notify_rx) = spawn_worker_for(&pool);
    let app = full_test_app!(pool, tx);

    let req = test::TestRequest::delete()
        .uri(&format!("/api/group/{}/delete-group-member", TEST_GROUP_NAME))
        .insert_header(("Authorization", TEST_GROUP_TOKEN))
        .set_json(serde_json::json!({"name": "@SHARED"}))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 400);
}

#[tokio::test]
async fn test_rename_group_member_success() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = create_test_pool().await;
    setup(&pool).await;
    let (tx, _notify_rx) = spawn_worker_for(&pool);
    let app = full_test_app!(pool, tx);

    let req = test::TestRequest::put()
        .uri(&format!("/api/group/{}/rename-group-member", TEST_GROUP_NAME))
        .insert_header(("Authorization", TEST_GROUP_TOKEN))
        .set_json(serde_json::json!({"original_name": "alice", "new_name": "alicia"}))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 200);

    let client = pool.get().await.unwrap();
    let rows = client
        .query("SELECT member_name FROM osrsmcp.members WHERE member_name = 'alicia'", &[])
        .await
        .unwrap();
    assert_eq!(rows.len(), 1);
}

#[tokio::test]
async fn test_rename_group_member_rejects_invalid_new_name() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = create_test_pool().await;
    setup(&pool).await;
    let (tx, _notify_rx) = spawn_worker_for(&pool);
    let app = full_test_app!(pool, tx);

    let req = test::TestRequest::put()
        .uri(&format!("/api/group/{}/rename-group-member", TEST_GROUP_NAME))
        .insert_header(("Authorization", TEST_GROUP_TOKEN))
        .set_json(serde_json::json!({"original_name": "alice", "new_name": "not valid!!"}))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 400);
}

// ──────────────────────────────────────────────────────────────────────────
// update-group-member (HTTP layer): validation + real persistence round-trip
// ──────────────────────────────────────────────────────────────────────────

#[tokio::test]
async fn test_update_group_member_persists_new_categories() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = create_test_pool().await;
    setup(&pool).await;
    let (tx, mut notify_rx) = spawn_worker_for(&pool);
    let app = full_test_app!(pool, tx);

    let req = test::TestRequest::post()
        .uri(&format!("/api/group/{}/update-group-member", TEST_GROUP_NAME))
        .insert_header(("Authorization", TEST_GROUP_TOKEN))
        .set_json(serde_json::json!({
            "name": "alice",
            "slayer_task": {
                "task": "Zombies",
                "amount_remaining": 45,
                "initial_amount": 50,
                "points": 12,
                "task_streak": 3,
                "wilderness_streak": 0
            },
            "combat_achievements": [5, 4, 3, 2, 1, 0],
            "farming_patches": [
                {"name": "patch_a", "state": "empty", "raw_value": 0},
                {"name": "patch_b", "raw_value": 12}
            ]
        }))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 200);

    notify_rx.recv().await.expect("worker should process the update");

    let epoch = chrono::DateTime::from_timestamp(0, 0).unwrap();
    let client = pool.get().await.unwrap();
    let group_id = db::get_group(&client, TEST_GROUP_NAME, TEST_GROUP_TOKEN).await.unwrap();
    let members = db::get_group_data(&client, group_id, &epoch).await.unwrap();
    let alice = members.iter().find(|m| m.name == "alice").expect("alice should exist");
    assert_eq!(alice.combat_achievements, Some(vec![5, 4, 3, 2, 1, 0]));
    assert!(alice.slayer_task.is_some());
    assert!(alice.farming_patches.is_some());
}

#[tokio::test]
async fn test_update_group_member_rejects_oversized_stats_array() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = create_test_pool().await;
    setup(&pool).await;
    let (tx, _notify_rx) = spawn_worker_for(&pool);
    let app = full_test_app!(pool, tx);

    let req = test::TestRequest::post()
        .uri(&format!("/api/group/{}/update-group-member", TEST_GROUP_NAME))
        .insert_header(("Authorization", TEST_GROUP_TOKEN))
        .set_json(serde_json::json!({"name": "alice", "stats": [1, 2, 3]}))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 400);
}

#[tokio::test]
async fn test_update_group_member_rejects_shared_member_name() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = create_test_pool().await;
    setup(&pool).await;
    let (tx, _notify_rx) = spawn_worker_for(&pool);
    let app = full_test_app!(pool, tx);

    let req = test::TestRequest::post()
        .uri(&format!("/api/group/{}/update-group-member", TEST_GROUP_NAME))
        .insert_header(("Authorization", TEST_GROUP_TOKEN))
        .set_json(serde_json::json!({"name": "@SHARED"}))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 400);
}

// ──────────────────────────────────────────────────────────────────────────
// get-group-data / am-i-logged-in / am-i-in-group / get-skill-data / collection-log
// ──────────────────────────────────────────────────────────────────────────

#[tokio::test]
async fn test_get_group_data_returns_members() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = create_test_pool().await;
    setup(&pool).await;
    let (tx, _notify_rx) = spawn_worker_for(&pool);
    let app = full_test_app!(pool, tx);

    let req = test::TestRequest::get()
        .uri(&format!(
            "/api/group/{}/get-group-data?from_time=2000-01-01T00:00:00Z",
            TEST_GROUP_NAME
        ))
        .insert_header(("Authorization", TEST_GROUP_TOKEN))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 200);

    let body: Vec<serde_json::Value> = test::read_body_json(resp).await;
    assert!(body.iter().any(|m| m["name"] == "alice"));
}

#[tokio::test]
async fn test_am_i_logged_in_with_valid_token() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = create_test_pool().await;
    setup(&pool).await;
    let (tx, _notify_rx) = spawn_worker_for(&pool);
    let app = full_test_app!(pool, tx);

    let req = test::TestRequest::get()
        .uri(&format!("/api/group/{}/am-i-logged-in", TEST_GROUP_NAME))
        .insert_header(("Authorization", TEST_GROUP_TOKEN))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 200);
}

#[tokio::test]
async fn test_am_i_in_group_for_real_member() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = create_test_pool().await;
    setup(&pool).await;
    let (tx, _notify_rx) = spawn_worker_for(&pool);
    let app = full_test_app!(pool, tx);

    let req = test::TestRequest::get()
        .uri(&format!(
            "/api/group/{}/am-i-in-group?member_name=alice",
            TEST_GROUP_NAME
        ))
        .insert_header(("Authorization", TEST_GROUP_TOKEN))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 200);
}

#[tokio::test]
async fn test_am_i_in_group_for_non_member() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = create_test_pool().await;
    setup(&pool).await;
    let (tx, _notify_rx) = spawn_worker_for(&pool);
    let app = full_test_app!(pool, tx);

    let req = test::TestRequest::get()
        .uri(&format!(
            "/api/group/{}/am-i-in-group?member_name=not-a-member",
            TEST_GROUP_NAME
        ))
        .insert_header(("Authorization", TEST_GROUP_TOKEN))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 401);
}

#[tokio::test]
async fn test_get_skill_data_accepts_every_period() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = create_test_pool().await;
    setup(&pool).await;
    let (tx, _notify_rx) = spawn_worker_for(&pool);
    let app = full_test_app!(pool, tx);

    for period in ["Day", "Week", "Month", "Year"] {
        let req = test::TestRequest::get()
            .uri(&format!(
                "/api/group/{}/get-skill-data?period={}",
                TEST_GROUP_NAME, period
            ))
            .insert_header(("Authorization", TEST_GROUP_TOKEN))
            .to_request();
        let resp = test::call_service(&app, req).await;
        assert_eq!(resp.status(), 200, "period {period} should succeed");
    }
}

#[tokio::test]
async fn test_get_collection_log_returns_empty_map() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = create_test_pool().await;
    setup(&pool).await;
    let (tx, _notify_rx) = spawn_worker_for(&pool);
    let app = full_test_app!(pool, tx);

    let req = test::TestRequest::get()
        .uri(&format!("/api/group/{}/collection-log", TEST_GROUP_NAME))
        .insert_header(("Authorization", TEST_GROUP_TOKEN))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 200);

    // NOTE: this legacy endpoint returns an empty map unconditionally - collection log
    // data lives in collection_log_v2 now, exposed via the MCP get_collection_log tool
    // instead. Documenting current behavior, not asserting it's the intended long-term
    // shape.
    let body: std::collections::HashMap<String, Vec<i32>> = test::read_body_json(resp).await;
    assert!(body.is_empty());
}
