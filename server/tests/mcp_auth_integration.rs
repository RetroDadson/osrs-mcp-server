use axum::body::Body;
use axum::http::{Request, StatusCode};
use axum::routing::get;
use axum::{middleware, Router};
use deadpool_postgres::{ManagerConfig, Pool};
use std::env;
use std::sync::Arc;
use tokio_postgres::NoTls;
use tower::ServiceExt;

use server::auth_middleware::AuthenticationCache;
use server::config::Config;
use server::db;
use server::mcp::auth::{require_group_auth, McpAuthState};
use server::models::CreateGroup;

/// Serializes tests since they all share the same database and each drops/recreates the
/// schema. Mirrors the pattern in the other integration test files.
static TEST_MUTEX: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

const GROUP_NAME: &str = "mcp_auth_test_group";
const TOKEN: &str = "mcp_auth_test_token";

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
        name: GROUP_NAME.to_string(),
        member_names: vec!["alice".to_string()],
        captcha_response: String::new(),
        token: TOKEN.to_string(),
    };
    db::create_group(&mut client, &create_group)
        .await
        .expect("failed to create test group");
}

fn build_router(pool: Pool) -> Router {
    let state = McpAuthState {
        pool,
        auth_cache: Arc::new(AuthenticationCache::new()),
    };
    Router::new()
        .route("/mcp/{group_name}", get(|| async { "ok" }))
        .route_layer(middleware::from_fn_with_state(state, require_group_auth))
}

#[tokio::test]
async fn test_missing_authorization_header_is_rejected() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = create_test_pool().await;
    setup(&pool).await;
    let app = build_router(pool);

    let response = app
        .oneshot(
            Request::builder()
                .uri(format!("/mcp/{GROUP_NAME}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_wrong_token_is_rejected() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = create_test_pool().await;
    setup(&pool).await;
    let app = build_router(pool);

    let response = app
        .oneshot(
            Request::builder()
                .uri(format!("/mcp/{GROUP_NAME}"))
                .header("Authorization", "not-the-real-token")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_correct_token_is_accepted() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = create_test_pool().await;
    setup(&pool).await;
    let app = build_router(pool);

    let response = app
        .oneshot(
            Request::builder()
                .uri(format!("/mcp/{GROUP_NAME}"))
                .header("Authorization", TOKEN)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
}

#[tokio::test]
async fn test_correct_token_for_wrong_group_name_is_rejected() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = create_test_pool().await;
    setup(&pool).await;
    let app = build_router(pool);

    let response = app
        .oneshot(
            Request::builder()
                .uri("/mcp/some-other-group")
                .header("Authorization", TOKEN)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}
