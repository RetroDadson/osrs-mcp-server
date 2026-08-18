pub mod auth;
pub mod tools;

use auth::{require_group_auth, McpAuthState};
use axum::{middleware, routing::any_service, Router};
use deadpool_postgres::Pool;
use rmcp::transport::streamable_http_server::{
    session::local::LocalSessionManager, StreamableHttpServerConfig, StreamableHttpService,
};
use std::sync::Arc;
use tools::McpServer;

/// Build the MCP axum router, mounted at `/mcp/{group_name}`. Auth mirrors the REST API
/// exactly: same shared group token, same `AuthenticationCache` (passed in from main.rs
/// so both paths share one cache), no new session/OAuth layer, no usage metering.
pub fn build_router(
    pool: Pool,
    auth_cache: Arc<crate::auth_middleware::AuthenticationCache>,
) -> Router {
    let service_pool = pool.clone();
    let mcp_service = StreamableHttpService::new(
        move || Ok(McpServer::new(service_pool.clone())),
        Arc::new(LocalSessionManager::default()),
        StreamableHttpServerConfig::default(),
    );

    let auth_state = McpAuthState { pool, auth_cache };

    Router::new()
        .route_service("/mcp/{group_name}", any_service(mcp_service))
        .route_layer(middleware::from_fn_with_state(auth_state, require_group_auth))
}
