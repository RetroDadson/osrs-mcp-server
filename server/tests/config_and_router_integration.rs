use axum::body::Body;
use axum::http::{Request, StatusCode};
use deadpool_postgres::{ManagerConfig, Pool};
use std::env;
use std::sync::Arc;
use tokio_postgres::NoTls;
use tower::ServiceExt;

use server::auth_middleware::AuthenticationCache;
use server::config::{Config, LogLevel};
use server::mcp;

async fn create_test_pool() -> Pool {
    let mut cfg = if let Ok(url) = env::var("TEST_DATABASE_URL") {
        let mut c = deadpool_postgres::Config::new();
        c.url = Some(url);
        c
    } else {
        let config: Config = Config::from_env().expect("failed to read config.toml");
        let mut pg = config.pg.clone();
        pg.dbname = Some("osrsmcp_test".to_string());
        pg
    };

    cfg.manager = Some(ManagerConfig {
        recycling_method: deadpool_postgres::RecyclingMethod::Fast,
    });

    cfg.create_pool(None, NoTls).expect("failed to create test pool")
}

#[test]
fn test_config_deserializes_with_only_pg_section_using_defaults() {
    let toml = r#"
[pg]
host = "localhost"
port = 5432
user = "postgres"
password = "postgres"
dbname = "osrsmcp"
"#;
    let config: Config = basic_toml::from_str(toml).expect("minimal config should parse");
    assert_eq!(config.logger.level.to_string(), "info");
    assert!(!config.hcaptcha.enabled);
    assert_eq!(config.hcaptcha.sitekey, "");
}

#[test]
fn test_config_deserializes_explicit_logger_and_captcha_sections() {
    let toml = r#"
[pg]
host = "localhost"
port = 5432
user = "postgres"
password = "postgres"
dbname = "osrsmcp"

[logger]
level = "Warn"

[hcaptcha]
enabled = true
sitekey = "site123"
secret = "secret123"
"#;
    let config: Config = basic_toml::from_str(toml).expect("full config should parse");
    assert_eq!(config.logger.level.to_string(), "warn");
    assert!(config.hcaptcha.enabled);
    assert_eq!(config.hcaptcha.sitekey, "site123");
}

#[test]
fn test_log_level_to_string_covers_every_variant() {
    assert_eq!(LogLevel::Info.to_string(), "info");
    assert_eq!(LogLevel::Warn.to_string(), "warn");
    assert_eq!(LogLevel::Error.to_string(), "error");
}

#[tokio::test]
async fn test_mcp_build_router_rejects_unauthenticated_request() {
    let pool = create_test_pool().await;
    let auth_cache = Arc::new(AuthenticationCache::new());
    let router = mcp::build_router(pool, auth_cache);

    let response = router
        .oneshot(
            Request::builder()
                .uri("/mcp/some-group")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}
