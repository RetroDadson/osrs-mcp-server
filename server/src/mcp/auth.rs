use crate::auth_middleware::AuthenticationCache;
use crate::crypto::token_hash;
use crate::db;
use axum::{
    extract::{Path, Request, State},
    http::StatusCode,
    middleware::Next,
    response::Response,
};
use deadpool_postgres::Pool;
use std::sync::Arc;

#[derive(Clone)]
pub struct McpAuthState {
    pub pool: Pool,
    pub auth_cache: Arc<AuthenticationCache>,
}

/// Inserted into the request's extensions on successful auth. Tool handlers read this
/// via `Extension<http::request::Parts>` (rmcp's documented pattern for per-request HTTP
/// context) then `parts.extensions.get::<AuthenticatedGroup>()`.
#[derive(Clone, Copy)]
pub struct AuthenticatedGroup {
    pub group_id: i64,
}

/// Mirrors the REST API's `AuthenticateMiddlewareFactory` (auth_middleware.rs): same
/// shared-token model, same `AuthenticationCache`, no new session/OAuth layer, no usage
/// metering. Applied via `.route_layer(...)` on the `/mcp/{group_name}` nest so the
/// `{group_name}` path param is already resolved when this runs.
pub async fn require_group_auth(
    State(state): State<McpAuthState>,
    Path(group_name): Path<String>,
    mut request: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    let token = request
        .headers()
        .get("Authorization")
        .and_then(|value| value.to_str().ok())
        .ok_or(StatusCode::UNAUTHORIZED)?
        .to_string();

    let token_hash_value = token_hash(&token, &group_name);
    let group_id = match state.auth_cache.get(&group_name, &token_hash_value) {
        Some(group_id) => group_id,
        None => {
            let client = state
                .pool
                .get()
                .await
                .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
            let group_id = db::get_group(&client, &group_name, &token)
                .await
                .map_err(|_| StatusCode::UNAUTHORIZED)?;
            state
                .auth_cache
                .insert(&group_name, token_hash_value, group_id);
            group_id
        }
    };

    request
        .extensions_mut()
        .insert(AuthenticatedGroup { group_id });
    Ok(next.run(request).await)
}
