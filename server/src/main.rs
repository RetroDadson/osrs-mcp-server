use server::auth_middleware::AuthenticateMiddlewareFactory;
use server::authed;
use server::config::Config;
use server::db;
use server::models;
use server::unauthed;
use server::update_batcher;

use actix_cors::Cors;
use actix_web::{http::header, middleware, web, App, HttpServer};
use tokio::sync::mpsc;
use tokio_postgres::NoTls;

use mimalloc::MiMalloc;

#[global_allocator]
static GLOBAL: MiMalloc = MiMalloc;

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    let config = Config::from_env().unwrap();
    let pool = config.pg.create_pool(None, NoTls).unwrap();
    env_logger::init_from_env(
        env_logger::Env::new().default_filter_or(config.logger.level.to_string()),
    );

    let mut client = pool.get().await.unwrap();
    db::update_schema(&mut client).await.unwrap();

    unauthed::start_ge_updater();
    unauthed::start_skills_aggregator(pool.clone());
    unauthed::start_hiscores_poller(pool.clone());
    unauthed::start_item_metadata_sync(pool.clone());

    let update_batcher_pool = config.pg.create_pool(None, NoTls).unwrap();
    let (tx, rx) = mpsc::channel::<models::GroupMember>(10000);
    tokio::spawn(async move {
        update_batcher::background_worker(update_batcher_pool, rx, None).await;
    });
    let auth_cache = std::sync::Arc::new(server::auth_middleware::AuthenticationCache::new());

    // MCP server: a second, axum-hosted HTTP listener (port 8081) alongside the actix-web
    // REST API. Shares the same Postgres pool and AuthenticationCache. At the
    // reverse-proxy/ingress layer, route <domain>/mcp/* to this port so it's one hostname
    // externally. See the plan's Phase 4 notes on why a second port over a single-port
    // actix integration (rmcp-actix-web trails rmcp's current version).
    let mcp_router = server::mcp::build_router(pool.clone(), auth_cache.clone());
    tokio::spawn(async move {
        let listener = tokio::net::TcpListener::bind("0.0.0.0:8081")
            .await
            .expect("failed to bind MCP server port 8081");
        axum::serve(listener, mcp_router)
            .await
            .expect("MCP server crashed");
    });

    HttpServer::new(move || {
        let unauthed_scope = web::scope("/api")
            .service(unauthed::create_group)
            .service(unauthed::get_ge_prices)
            .service(unauthed::captcha_enabled);
        let authed_scope = web::scope("/api/group/{group_name}")
            .wrap(AuthenticateMiddlewareFactory::new(auth_cache.clone()))
            .service(authed::update_group_member)
            .service(authed::get_group_data)
            .service(authed::add_group_member)
            .service(authed::delete_group_member)
            .service(authed::rename_group_member)
            .service(authed::am_i_logged_in)
            .service(authed::am_i_in_group)
            .service(authed::get_skill_data)
            .service(authed::get_collection_log)
            .service(authed::slayer_task_completed)
            .service(authed::clue_completed)
            .service(authed::death);
        let json_config = web::JsonConfig::default().limit(100000);
        let cors = Cors::default()
            .allow_any_origin()
            .send_wildcard()
            .allowed_methods(vec!["GET", "POST", "DELETE", "PUT", "OPTIONS"])
            .allowed_headers(vec![
                header::AUTHORIZATION,
                header::ACCEPT,
                header::CONTENT_TYPE,
                header::CONTENT_LENGTH,
            ])
            .max_age(3600);
        App::new()
            .wrap(middleware::Logger::new(
                "\"%r\" %s %b \"%{User-Agent}i\" %D",
            ))
            .wrap(middleware::Compress::default())
            .wrap(cors)
            .app_data(web::PayloadConfig::new(100000))
            .app_data(json_config)
            .app_data(web::Data::new(pool.clone()))
            .app_data(web::Data::new(config.clone()))
            .app_data(web::Data::new(tx.clone()))
            .service(authed_scope)
            .service(unauthed_scope)
    })
    .bind(("0.0.0.0", 8080))?
    .run()
    .await
}
