use crate::config::Config;
use crate::db;
use crate::error::ApiError;
use crate::models::{
    AccountType, BucketQueryResponse, CaptchaVerifyResponse, CreateGroup, GEPrices,
    HiscoreResponse, WikiGEPrices,
};
use crate::validators::valid_name;
use actix_web::{get, post, web, Error, HttpResponse};
use arc_swap::{ArcSwap, ArcSwapAny};
use deadpool_postgres::{Client, Pool};
use std::sync::Arc;
use std::sync::LazyLock;
use std::time::Duration;
use tokio::{task, time};

const WIKI_USER_AGENT: &str = "OsrsMcp - github.com/RetroDadson/osrs-mcp-server";

static GE_PRICES: LazyLock<ArcSwapAny<Arc<String>>> =
    LazyLock::new(|| ArcSwap::from(Arc::new(String::default())));
pub async fn fetch_latest_prices() -> Result<WikiGEPrices, ApiError> {
    let wiki_ge_prices = task::spawn_blocking(|| {
        ureq::get("https://prices.runescape.wiki/api/v1/osrs/latest")
            .header("User-Agent", WIKI_USER_AGENT)
            .call()
            .map_err(ApiError::UreqError)?
            .body_mut()
            .read_json::<WikiGEPrices>()
            .map_err(ApiError::UreqError)
    })
    .await
    .unwrap()?;

    Ok(wiki_ge_prices)
}

pub async fn update_ge_prices() -> Result<(), ApiError> {
    let wiki_ge_prices = fetch_latest_prices().await?;
    let mut ge_prices: GEPrices = std::collections::HashMap::new();
    for (item_id, wiki_ge_price) in wiki_ge_prices.data {
        let mut avg_ge_price: i64 = 0;
        if let Some(high) = wiki_ge_price.high {
            avg_ge_price = high
        }
        if let Some(low) = wiki_ge_price.low {
            if avg_ge_price > 0 {
                avg_ge_price = (avg_ge_price + low) / 2
            } else {
                avg_ge_price = low
            }
        }

        ge_prices.insert(item_id, avg_ge_price);
    }

    GE_PRICES.store(Arc::new(serde_json::to_string(&ge_prices)?));

    Ok(())
}

pub fn start_ge_updater() {
    task::spawn(async {
        let mut interval = time::interval(Duration::from_secs(14400));

        loop {
            interval.tick().await;
            log::info!("Fetching latest ge prices");

            match update_ge_prices().await {
                Ok(_) => (),
                Err(err) => {
                    log::error!("Failed to fetch latest ge prices: {}", err);
                }
            }
        }
    });
}

pub fn start_skills_aggregator(db_pool: Pool) {
    task::spawn(async move {
        let mut interval = time::interval(Duration::from_secs(1800));

        loop {
            interval.tick().await;
            log::info!("Running skill aggregator");

            match db_pool.get().await {
                Ok(mut client) => {
                    match db::aggregate_skills(&mut client).await {
                        Ok(_) => (),
                        Err(err) => {
                            log::error!("Failed to aggregate skills: {}", err);
                        }
                    }

                    match db::apply_skills_retention(&mut client).await {
                        Ok(_) => (),
                        Err(err) => {
                            log::error!("Failed to apply skills retention: {}", err);
                        }
                    }
                }
                Err(err) => {
                    log::error!("Failed to get db client: {}", err);
                }
            }
        }
    });
}

// -- Hiscores poller: boss KC, clue-tier totals, and account-type detection --
//
// OSRS's regular (non-mode-specific) Hiscores board returns real ranked data for every
// player regardless of account type - it's the master board everyone appears on. Mode-
// specific boards (HCIM/UIM/Ironman) are narrower filtered views. Probing least-
// restrictive-first would therefore always match on the first try; probe most-
// restrictive-first instead, using genuinely-ranked data (not just HTTP 200) as the
// match signal. Group Ironman has no player-name-keyed lookup at all and is handled
// separately (see AccountType::PROBE_ORDER's doc comment).

fn hiscore_url(account_type: AccountType, player_name: &str) -> String {
    // OSRS names only ever contain [A-Za-z 0-9-_] (enforced at add-member/create-group
    // time via valid_name), so a plain space encode is sufficient here.
    let encoded_name = player_name.replace(' ', "%20");
    format!(
        "https://secure.runescape.com/m={}/index_lite.json?player={}",
        account_type.hiscore_path_segment(),
        encoded_name
    )
}

/// A response counts as "genuinely ranked" for this mode if the Overall skill has a
/// real rank - the regular board returns rank:-1 placeholders for stats a given mode's
/// specialized board wouldn't track differently, so HTTP 200 alone isn't proof of a
/// real match on a mode-specific board.
fn is_ranked(response: &HiscoreResponse) -> bool {
    response
        .skills
        .iter()
        .any(|skill| skill.name == "Overall" && skill.rank > 0)
}

async fn fetch_hiscores(
    account_type: AccountType,
    player_name: &str,
) -> Result<Option<HiscoreResponse>, ApiError> {
    let url = hiscore_url(account_type, player_name);
    task::spawn_blocking(move || {
        let result = ureq::get(&url).header("User-Agent", WIKI_USER_AGENT).call();
        match result {
            Ok(mut response) => {
                let parsed: HiscoreResponse =
                    response.body_mut().read_json().map_err(ApiError::UreqError)?;
                Ok(Some(parsed))
            }
            // A 404 means "not on this leaderboard" - not an error condition.
            Err(ureq::Error::StatusCode(404)) => Ok(None),
            Err(err) => Err(ApiError::UreqError(err)),
        }
    })
    .await
    .unwrap()
}

/// Probe most-restrictive-first and return the first genuinely-ranked match.
pub async fn probe_account_hiscores(
    player_name: &str,
) -> Result<Option<(AccountType, HiscoreResponse)>, ApiError> {
    for account_type in AccountType::PROBE_ORDER {
        if let Some(response) = fetch_hiscores(account_type, player_name).await? {
            if is_ranked(&response) {
                return Ok(Some((account_type, response)));
            }
        }
    }
    Ok(None)
}

async fn sync_member_hiscores(
    client: &Client,
    member: &db::MemberRef,
) -> Result<(), ApiError> {
    let Some((account_type, hiscores)) = probe_account_hiscores(&member.member_name).await?
    else {
        log::warn!(
            "no ranked hiscores found for member_id={} name={}",
            member.member_id,
            member.member_name
        );
        return Ok(());
    };

    db::update_account_type(client, member.member_id, account_type.as_str()).await?;

    for activity in &hiscores.activities {
        // Unranked activities show rank <= 0 (usually score:-1, occasionally score:0) -
        // don't record these as if they were a real, meaningfully-tracked score.
        if activity.rank <= 0 {
            continue;
        }
        db::upsert_hiscore_activity(client, member.member_id, &activity.name, activity.score as i32)
            .await?;
    }

    Ok(())
}

pub fn start_hiscores_poller(db_pool: Pool) {
    task::spawn(async move {
        // 20 minutes: comfortably inside normal API-usage practice for this project's
        // tiny per-group volume (a handful of names), far less frequent than large
        // established trackers.
        let mut interval = time::interval(Duration::from_secs(1200));

        loop {
            interval.tick().await;
            log::info!("Running hiscores poller");

            let client = match db_pool.get().await {
                Ok(client) => client,
                Err(err) => {
                    log::error!("Failed to get db client for hiscores poller: {}", err);
                    continue;
                }
            };

            let members = match db::list_all_members(&client).await {
                Ok(members) => members,
                Err(err) => {
                    log::error!("Failed to list members for hiscores poller: {}", err);
                    continue;
                }
            };

            for member in &members {
                if let Err(err) = sync_member_hiscores(&client, member).await {
                    log::error!(
                        "Failed to sync hiscores for member_id={} name={}: {}",
                        member.member_id,
                        member.member_name,
                        err
                    );
                }
            }
        }
    });
}

// -- Item metadata sync: complete item name + alch-value coverage via the OSRS Wiki's
// Bucket structured-data API (the wiki's in-house Cargo/SMW replacement). Covers every
// item, tradeable or not - unlike the GE-prices endpoint above, which only covers the
// ~4,652 GE-tradeable items. Alch values matter specifically because most Ironman
// account types can't use the Grand Exchange at all, so alch value (not GE price) is
// the actionable "what's this worth" figure for the project's core audience.

const ITEM_METADATA_PAGE_SIZE: usize = 5000;
/// Confirmed via research: the `infobox_item` bucket table has 16,616 rows, so 4 pages
/// of 5000 covers it with room to spare; the final page(s) simply come back short.
const ITEM_METADATA_PAGE_OFFSETS: [usize; 4] = [0, 5000, 10000, 15000];

/// low alch = floor(0.4 * value), confirmed empirically against known items (stable
/// across a 22-month-old snapshot vs. a live fetch) since the wiki's Bucket table only
/// stores high_alchemy_value + value, not low alch directly. Integer division by 5/2
/// is equivalent to floor(x * 0.4) for non-negative values, avoiding float rounding.
fn derive_low_alch(value: Option<i64>) -> Option<i32> {
    value.map(|v| ((v * 2) / 5) as i32)
}

struct FlatItemMetadata {
    item_id: i32,
    name: String,
    high_alch: Option<i32>,
    low_alch: Option<i32>,
    tradeable: bool,
    members_only: bool,
}

/// Explode a Bucket row's repeated `item_id` field into one record per numeric ID,
/// skipping any non-numeric entries (logged, not fatal - the sync continues for the
/// rest of the page).
fn flatten_bucket_row(row: &crate::models::BucketItemRow) -> Vec<FlatItemMetadata> {
    let high_alch = row.high_alchemy_value.map(|v| v as i32);
    let low_alch = derive_low_alch(row.value);
    let tradeable = row.tradeable.is_some();
    let members_only = row.is_members_only.is_some();

    row.item_id
        .iter()
        .filter_map(|item_id_str| match item_id_str.parse::<i32>() {
            Ok(item_id) => Some(FlatItemMetadata {
                item_id,
                name: row.item_name.clone(),
                high_alch,
                low_alch,
                tradeable,
                members_only,
            }),
            Err(_) => {
                log::warn!(
                    "skipping non-numeric item_id '{}' for '{}'",
                    item_id_str,
                    row.item_name
                );
                None
            }
        })
        .collect()
}

async fn fetch_item_metadata_page(offset: usize) -> Result<BucketQueryResponse, ApiError> {
    let query = format!(
        "bucket('infobox_item').select('item_id','item_name','high_alchemy_value','value','tradeable','is_members_only').limit({}).offset({}).run()",
        ITEM_METADATA_PAGE_SIZE, offset
    );

    task::spawn_blocking(move || {
        ureq::get("https://oldschool.runescape.wiki/api.php")
            .query("action", "bucket")
            .query("format", "json")
            .query("query", &query)
            .header("User-Agent", WIKI_USER_AGENT)
            .call()
            .map_err(ApiError::UreqError)?
            .body_mut()
            .read_json::<BucketQueryResponse>()
            .map_err(ApiError::UreqError)
    })
    .await
    .unwrap()
}

pub async fn sync_item_metadata(pool: &Pool) -> Result<(), ApiError> {
    let client = pool.get().await.map_err(ApiError::PoolError)?;

    for offset in ITEM_METADATA_PAGE_OFFSETS {
        let page = fetch_item_metadata_page(offset).await?;
        let page_len = page.bucket.len();

        for row in &page.bucket {
            for item in flatten_bucket_row(row) {
                db::upsert_item_metadata(
                    &client,
                    item.item_id,
                    &item.name,
                    item.high_alch,
                    item.low_alch,
                    item.tradeable,
                    Some(item.members_only),
                )
                .await?;
            }
        }

        log::info!("synced item metadata page offset={} rows={}", offset, page_len);

        // The final page(s) come back short of a full page once we've passed the end
        // of the table - no need to keep requesting further offsets.
        if page_len < ITEM_METADATA_PAGE_SIZE {
            break;
        }
    }

    Ok(())
}

pub fn start_item_metadata_sync(db_pool: Pool) {
    task::spawn(async move {
        // Weekly: confirmed empirically that alch values don't drift outside of rare
        // balance patches, so a low-frequency refresh is sufficient.
        let mut interval = time::interval(Duration::from_secs(7 * 24 * 3600));

        loop {
            interval.tick().await;
            log::info!("Running item metadata sync");

            match sync_item_metadata(&db_pool).await {
                Ok(_) => (),
                Err(err) => {
                    log::error!("Failed to sync item metadata: {}", err);
                }
            }
        }
    });
}

#[get("/ge-prices")]
pub async fn get_ge_prices() -> Result<HttpResponse, Error> {
    let ge_prices_opt = GE_PRICES.load();
    let res: String = (**ge_prices_opt).clone();

    Ok(HttpResponse::Ok()
        .append_header(("Cache-Control", "public, max-age=86400"))
        .content_type("application/json")
        .body(res))
}

pub async fn verify_captcha(
    response: &str,
    secret: &str,
) -> Result<CaptchaVerifyResponse, ApiError> {
    let response = response.to_owned();
    let secret = secret.to_owned();
    let captcha_verify_response = task::spawn_blocking(move || {
        ureq::post("https://hcaptcha.com/siteverify")
            .send_form([("response", response.as_str()), ("secret", secret.as_str())])
            .map_err(ApiError::UreqError)?
            .body_mut()
            .read_json::<CaptchaVerifyResponse>()
            .map_err(ApiError::UreqError)
    })
    .await
    .unwrap()?;

    Ok(captcha_verify_response)
}

#[post("/create-group")]
pub async fn create_group(
    create_group: web::Json<CreateGroup>,
    db_pool: web::Data<Pool>,
    config: web::Data<Config>,
) -> Result<HttpResponse, Error> {
    let mut create_group_inner = create_group.into_inner();

    if config.hcaptcha.enabled {
        let captcha_verify_response = verify_captcha(
            &create_group_inner.captcha_response,
            &config.hcaptcha.secret,
        )
        .await?;
        if !captcha_verify_response.success {
            return Ok(HttpResponse::BadRequest().body("Captcha response verification failed"));
        }
    }

    if create_group_inner.member_names.len() > 5 {
        return Ok(HttpResponse::BadRequest().body("Too many member names provided"));
    }

    create_group_inner.name = create_group_inner.name.trim().to_string();
    if !valid_name(&create_group_inner.name) {
        return Ok(HttpResponse::BadRequest().body("Provided group name is not valid"));
    }

    create_group_inner
        .member_names
        .retain(|member_name| !member_name.trim().is_empty());
    for member_name in &create_group_inner.member_names {
        if !valid_name(member_name) {
            return Ok(HttpResponse::BadRequest()
                .body(format!("Member name {} is not valid", member_name)));
        }
    }

    let mut client: Client = db_pool.get().await.map_err(ApiError::PoolError)?;
    db::create_group(&mut client, &create_group_inner).await?;
    Ok(HttpResponse::Created().json(&create_group_inner))
}

#[get("captcha-enabled")]
pub async fn captcha_enabled(config: web::Data<Config>) -> Result<HttpResponse, Error> {
    Ok(HttpResponse::Ok().json(&config.hcaptcha))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{BucketItemRow, HiscoreActivity, HiscoreSkill};
    use serde_json::json;

    // -- AccountType::PROBE_ORDER --

    #[test]
    fn probe_order_is_most_restrictive_first() {
        assert_eq!(
            AccountType::PROBE_ORDER,
            [
                AccountType::HardcoreIronman,
                AccountType::Ultimate,
                AccountType::Ironman,
                AccountType::Regular,
            ]
        );
    }

    // -- hiscore_url --

    #[test]
    fn hiscore_url_uses_correct_path_segment_per_mode() {
        assert!(hiscore_url(AccountType::Regular, "Zezima").contains("m=hiscore_oldschool/"));
        assert!(hiscore_url(AccountType::Ironman, "Zezima").contains("m=hiscore_oldschool_ironman/"));
        assert!(hiscore_url(AccountType::HardcoreIronman, "Zezima")
            .contains("m=hiscore_oldschool_hardcore_ironman/"));
        assert!(hiscore_url(AccountType::Ultimate, "Zezima").contains("m=hiscore_oldschool_ultimate/"));
    }

    #[test]
    fn hiscore_url_encodes_spaces_in_names() {
        let url = hiscore_url(AccountType::Regular, "Iron Foo Bar");
        assert!(url.contains("player=Iron%20Foo%20Bar"));
    }

    // -- is_ranked --

    fn make_hiscores(overall_rank: i64) -> HiscoreResponse {
        HiscoreResponse {
            skills: vec![HiscoreSkill {
                id: 0,
                name: "Overall".to_string(),
                rank: overall_rank,
                level: 100,
                xp: 1000,
            }],
            activities: vec![],
        }
    }

    #[test]
    fn is_ranked_true_for_positive_overall_rank() {
        assert!(is_ranked(&make_hiscores(12345)));
    }

    #[test]
    fn is_ranked_false_for_unranked_placeholder() {
        assert!(!is_ranked(&make_hiscores(-1)));
    }

    #[test]
    fn is_ranked_false_for_zero_rank() {
        assert!(!is_ranked(&make_hiscores(0)));
    }

    #[test]
    fn is_ranked_false_when_overall_missing() {
        let response = HiscoreResponse {
            skills: vec![HiscoreSkill {
                id: 1,
                name: "Attack".to_string(),
                rank: 500,
                level: 60,
                xp: 100,
            }],
            activities: vec![],
        };
        assert!(!is_ranked(&response));
    }

    // -- derive_low_alch --

    #[test]
    fn derive_low_alch_matches_known_items() {
        // Confirmed empirically against real items: Raw lobster (value 70 -> lowalch 28),
        // Barrows gloves (value 100000 -> lowalch 40000).
        assert_eq!(derive_low_alch(Some(70)), Some(28));
        assert_eq!(derive_low_alch(Some(100000)), Some(40000));
    }

    #[test]
    fn derive_low_alch_none_when_value_missing() {
        assert_eq!(derive_low_alch(None), None);
    }

    #[test]
    fn derive_low_alch_zero_value() {
        assert_eq!(derive_low_alch(Some(0)), Some(0));
    }

    // -- flatten_bucket_row --

    fn make_bucket_row(
        item_ids: &[&str],
        tradeable: bool,
        members_only: bool,
    ) -> BucketItemRow {
        BucketItemRow {
            item_id: item_ids.iter().map(|s| s.to_string()).collect(),
            item_name: "Test item".to_string(),
            high_alchemy_value: Some(100),
            value: Some(70),
            tradeable: if tradeable { Some(json!("")) } else { None },
            is_members_only: if members_only { Some(json!("")) } else { None },
        }
    }

    #[test]
    fn flatten_bucket_row_single_id() {
        let row = make_bucket_row(&["4151"], true, true);
        let result = flatten_bucket_row(&row);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].item_id, 4151);
        assert_eq!(result[0].name, "Test item");
        assert_eq!(result[0].high_alch, Some(100));
        assert_eq!(result[0].low_alch, Some(28));
        assert!(result[0].tradeable);
        assert!(result[0].members_only);
    }

    #[test]
    fn flatten_bucket_row_explodes_repeated_ids() {
        let row = make_bucket_row(&["100", "101", "102"], false, false);
        let result = flatten_bucket_row(&row);
        assert_eq!(result.len(), 3);
        assert_eq!(result[0].item_id, 100);
        assert_eq!(result[1].item_id, 101);
        assert_eq!(result[2].item_id, 102);
        assert!(!result[0].tradeable);
        assert!(!result[0].members_only);
    }

    #[test]
    fn flatten_bucket_row_skips_non_numeric_ids() {
        let row = make_bucket_row(&["100", "not-a-number", "102"], true, false);
        let result = flatten_bucket_row(&row);
        assert_eq!(result.len(), 2);
        assert_eq!(result[0].item_id, 100);
        assert_eq!(result[1].item_id, 102);
    }

    #[test]
    fn flatten_bucket_row_empty_ids_produces_no_records() {
        let row = make_bucket_row(&[], true, true);
        let result = flatten_bucket_row(&row);
        assert!(result.is_empty());
    }

    #[test]
    fn flatten_bucket_row_presence_not_content_determines_boolean() {
        // Bucket's boolean convention: field presence = true regardless of the actual
        // string content inside it - even an explicitly "false"-looking value should
        // still read as true if the field is present at all.
        let mut row = make_bucket_row(&["1"], false, false);
        row.tradeable = Some(json!("false"));
        let result = flatten_bucket_row(&row);
        assert!(result[0].tradeable);
    }

    // -- HiscoreActivity rank filtering (mirrors sync_member_hiscores's inline check) --

    #[test]
    fn unranked_activity_detection() {
        let unranked = HiscoreActivity {
            id: 1,
            name: "Zulrah".to_string(),
            rank: -1,
            score: -1,
        };
        let ranked = HiscoreActivity {
            id: 2,
            name: "Zulrah".to_string(),
            rank: 500,
            score: 42,
        };
        assert!(unranked.rank <= 0);
        assert!(ranked.rank > 0);
    }
}
