use actix_web::{test, web, App};
use deadpool_postgres::{ManagerConfig, Pool, RecyclingMethod};
use std::env;
use tokio_postgres::NoTls;

use server::config::Config;
use server::db;
use server::unauthed;

/// Serializes tests since they all share the same database and each drops/recreates the
/// schema. Mirrors the pattern in the other integration test files.
static TEST_MUTEX: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

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

/// Clean schema, no group created - create_group itself is what's under test here.
async fn setup_empty_schema(pool: &Pool) {
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
}

/// hcaptcha.enabled defaults to false (Config's own default_captcha_config), which is
/// exactly what create_group needs to be exercised without real hCaptcha credentials.
fn default_config() -> server::config::Config {
    let toml = r#"
[pg]
host = "localhost"
port = 5432
user = "postgres"
password = "postgres"
dbname = "unused"
"#;
    basic_toml::from_str(toml).expect("failed to parse minimal test config")
}

macro_rules! test_app {
    ($pool:expr) => {
        test::init_service(
            App::new()
                .app_data(web::Data::new($pool.clone()))
                .app_data(web::Data::new(default_config()))
                .service(
                    web::scope("/api")
                        .service(unauthed::create_group)
                        .service(unauthed::captcha_enabled)
                        .service(unauthed::get_ge_prices),
                ),
        )
        .await
    };
}

#[tokio::test]
async fn test_create_group_success() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = create_test_pool().await;
    setup_empty_schema(&pool).await;
    let app = test_app!(pool);

    let req = test::TestRequest::post()
        .uri("/api/create-group")
        .set_json(serde_json::json!({
            "name": "newgroup",
            "member_names": ["alice", "bob"]
        }))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 201);

    let body: serde_json::Value = test::read_body_json(resp).await;
    assert_eq!(body["name"], "newgroup");
    assert!(body["token"].as_str().is_some_and(|t| !t.is_empty()));
}

#[tokio::test]
async fn test_create_group_solo_ironman_size_one() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = create_test_pool().await;
    setup_empty_schema(&pool).await;
    let app = test_app!(pool);

    // A group of exactly one - the Phase 2 solo-ironman fix's server-side counterpart:
    // nothing here enforces a 2-member minimum.
    let req = test::TestRequest::post()
        .uri("/api/create-group")
        .set_json(serde_json::json!({
            "name": "soloiron",
            "member_names": ["justme"]
        }))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 201);
}

#[tokio::test]
async fn test_create_group_filters_blank_member_names() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = create_test_pool().await;
    setup_empty_schema(&pool).await;
    let app = test_app!(pool);

    let req = test::TestRequest::post()
        .uri("/api/create-group")
        .set_json(serde_json::json!({
            "name": "paddedgroup",
            "member_names": ["alice", "", "  ", "bob", ""]
        }))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 201);

    let body: serde_json::Value = test::read_body_json(resp).await;
    let names: Vec<&str> = body["member_names"]
        .as_array()
        .unwrap()
        .iter()
        .map(|v| v.as_str().unwrap())
        .collect();
    assert_eq!(names, vec!["alice", "bob"]);
}

#[tokio::test]
async fn test_create_group_rejects_too_many_members() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = create_test_pool().await;
    setup_empty_schema(&pool).await;
    let app = test_app!(pool);

    let req = test::TestRequest::post()
        .uri("/api/create-group")
        .set_json(serde_json::json!({
            "name": "toobig",
            "member_names": ["a", "b", "c", "d", "e", "f"]
        }))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 400);
}

#[tokio::test]
async fn test_create_group_rejects_invalid_group_name() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = create_test_pool().await;
    setup_empty_schema(&pool).await;
    let app = test_app!(pool);

    let req = test::TestRequest::post()
        .uri("/api/create-group")
        .set_json(serde_json::json!({
            "name": "not valid!!",
            "member_names": ["alice"]
        }))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 400);
}

#[tokio::test]
async fn test_create_group_rejects_invalid_member_name() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = create_test_pool().await;
    setup_empty_schema(&pool).await;
    let app = test_app!(pool);

    let req = test::TestRequest::post()
        .uri("/api/create-group")
        .set_json(serde_json::json!({
            "name": "validgroup",
            "member_names": ["not valid!!"]
        }))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 400);
}

#[tokio::test]
async fn test_captcha_enabled_reflects_config_default() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = create_test_pool().await;
    setup_empty_schema(&pool).await;
    let app = test_app!(pool);

    let req = test::TestRequest::get().uri("/api/captcha-enabled").to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 200);
}

#[tokio::test]
async fn test_get_ge_prices_returns_cached_payload() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = create_test_pool().await;
    setup_empty_schema(&pool).await;
    let app = test_app!(pool);

    let req = test::TestRequest::get().uri("/api/ge-prices").to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 200);
    assert_eq!(
        resp.headers().get("content-type").unwrap(),
        "application/json"
    );
}
