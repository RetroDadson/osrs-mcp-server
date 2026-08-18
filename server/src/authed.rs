use crate::auth_middleware::Authenticated;
use crate::db;
use crate::error::ApiError;
use crate::models::{
    AmIInGroupRequest, ClueCompletion, DeathEvent, GroupMember, GroupSkillData,
    RenameGroupMember, SlayerTaskCompletion, SHARED_MEMBER,
};
use crate::validators::{
    valid_name, validate_member_prop_length, validate_optional_string_length,
    validate_string_length, ArrayFormat,
};
use actix_web::{delete, get, post, put, web, Error, HttpResponse};
use chrono::{DateTime, Utc};
use deadpool_postgres::{Client, Pool};
use serde::Deserialize;
use std::collections::HashMap;
use tokio::sync::mpsc;

#[post("/add-group-member")]
pub async fn add_group_member(
    auth: Authenticated,
    group_member: web::Json<GroupMember>,
    db_pool: web::Data<Pool>,
) -> Result<HttpResponse, Error> {
    if group_member.name.eq(SHARED_MEMBER) {
        return Ok(
            HttpResponse::BadRequest().body(format!("Member name {} not allowed", SHARED_MEMBER))
        );
    }

    if !valid_name(&group_member.name) {
        return Ok(HttpResponse::BadRequest()
            .body(format!("Member name {} is not valid", group_member.name)));
    }

    let client: Client = db_pool.get().await.map_err(ApiError::PoolError)?;
    db::add_group_member(&client, auth.group_id, &group_member.name).await?;
    Ok(HttpResponse::Created().finish())
}

#[delete("/delete-group-member")]
pub async fn delete_group_member(
    auth: Authenticated,
    group_member: web::Json<GroupMember>,
    db_pool: web::Data<Pool>,
) -> Result<HttpResponse, Error> {
    if group_member.name.eq(SHARED_MEMBER) {
        return Ok(
            HttpResponse::BadRequest().body(format!("Member name {} not allowed", SHARED_MEMBER))
        );
    }

    let mut client: Client = db_pool.get().await.map_err(ApiError::PoolError)?;
    db::delete_group_member(&mut client, auth.group_id, &group_member.name).await?;
    Ok(HttpResponse::Ok().finish())
}

#[put("/rename-group-member")]
pub async fn rename_group_member(
    auth: Authenticated,
    rename_member: web::Json<RenameGroupMember>,
    db_pool: web::Data<Pool>,
) -> Result<HttpResponse, Error> {
    if rename_member.original_name.eq(SHARED_MEMBER) || rename_member.new_name.eq(SHARED_MEMBER) {
        return Ok(
            HttpResponse::BadRequest().body(format!("Member name {} not allowed", SHARED_MEMBER))
        );
    }

    if !valid_name(&rename_member.new_name) {
        return Ok(HttpResponse::BadRequest().body(format!(
            "Member name {} is not valid",
            rename_member.new_name
        )));
    }

    let client: Client = db_pool.get().await.map_err(ApiError::PoolError)?;
    db::rename_group_member(
        &client,
        auth.group_id,
        &rename_member.original_name,
        &rename_member.new_name,
    )
    .await?;
    Ok(HttpResponse::Ok().finish())
}

#[post("/update-group-member")]
pub async fn update_group_member(
    auth: Authenticated,
    group_member: web::Json<GroupMember>,
    sender: web::Data<mpsc::Sender<GroupMember>>,
) -> Result<HttpResponse, Error> {
    if group_member.name.eq(SHARED_MEMBER) {
        return Ok(
            HttpResponse::BadRequest().body(format!("Member name {} not allowed", SHARED_MEMBER))
        );
    }

    let mut group_member_inner: GroupMember = group_member.into_inner();
    group_member_inner.group_id = Some(auth.group_id);

    validate_member_prop_length("stats", &group_member_inner.stats, 7, 7, ArrayFormat::Flat)?;
    validate_member_prop_length(
        "coordinates",
        &group_member_inner.coordinates,
        3,
        4,
        ArrayFormat::Flat,
    )?;
    validate_member_prop_length(
        "skills",
        &group_member_inner.skills,
        23,
        24,
        ArrayFormat::Flat,
    )?;
    validate_member_prop_length(
        "quests",
        &group_member_inner.quests,
        0,
        250,
        ArrayFormat::Flat,
    )?;
    validate_member_prop_length(
        "inventory",
        &group_member_inner.inventory,
        56,
        56,
        ArrayFormat::ItemPairs,
    )?;
    validate_member_prop_length(
        "equipment",
        &group_member_inner.equipment,
        28,
        28,
        ArrayFormat::ItemPairs,
    )?;
    validate_member_prop_length(
        "bank",
        &group_member_inner.bank,
        0,
        3000,
        ArrayFormat::ItemPairs,
    )?;
    validate_member_prop_length(
        "shared_bank",
        &group_member_inner.shared_bank,
        0,
        1000,
        ArrayFormat::ItemPairs,
    )?;
    validate_member_prop_length(
        "rune_pouch",
        &group_member_inner.rune_pouch,
        6,
        8,
        ArrayFormat::ItemPairs,
    )?;
    validate_member_prop_length(
        "seed_vault",
        &group_member_inner.seed_vault,
        0,
        500,
        ArrayFormat::ItemPairs,
    )?;
    validate_member_prop_length(
        "deposited",
        &group_member_inner.deposited,
        0,
        200,
        ArrayFormat::ItemPairs,
    )?;
    validate_member_prop_length(
        "diary_vars",
        &group_member_inner.diary_vars,
        0,
        62,
        ArrayFormat::Flat,
    )?;
    validate_member_prop_length(
        "collection_log_v2",
        &group_member_inner.collection_log_v2,
        0,
        4000,
        ArrayFormat::Flat,
    )?;
    validate_member_prop_length(
        "potion_storage",
        &group_member_inner.potion_storage,
        0,
        400,
        ArrayFormat::ItemPairs,
    )?;
    validate_member_prop_length(
        "combat_achievements",
        &group_member_inner.combat_achievements,
        6,
        6,
        ArrayFormat::Flat,
    )?;
    validate_member_prop_length(
        "farming_patches",
        &group_member_inner.farming_patches,
        0,
        20,
        ArrayFormat::Flat,
    )?;
    if let Some(slayer_task) = &group_member_inner.slayer_task {
        validate_string_length("slayer_task.task", &slayer_task.task, 100)?;
        validate_optional_string_length("slayer_task.master", &slayer_task.master, 50)?;
    }

    match sender.send(group_member_inner).await {
        Ok(_) => Ok(HttpResponse::Ok().finish()),
        Err(_) => Ok(HttpResponse::InternalServerError().body("Failed to submit player update")),
    }
}

#[post("/slayer-task-completed")]
pub async fn slayer_task_completed(
    auth: Authenticated,
    body: web::Json<SlayerTaskCompletion>,
    db_pool: web::Data<Pool>,
) -> Result<HttpResponse, Error> {
    if body.name.eq(SHARED_MEMBER) {
        return Ok(
            HttpResponse::BadRequest().body(format!("Member name {} not allowed", SHARED_MEMBER))
        );
    }
    validate_string_length("task", &body.task, 100)?;
    validate_optional_string_length("master", &body.master, 50)?;

    let client: Client = db_pool.get().await.map_err(ApiError::PoolError)?;
    let member_id = db::get_member_id(&client, auth.group_id, &body.name).await?;
    db::record_slayer_task_completion(
        &client,
        member_id,
        &body.task,
        body.master.as_deref(),
        body.amount_completed,
        body.outcome.as_str(),
    )
    .await?;
    Ok(HttpResponse::Created().finish())
}

#[post("/clue-completed")]
pub async fn clue_completed(
    auth: Authenticated,
    body: web::Json<ClueCompletion>,
    db_pool: web::Data<Pool>,
) -> Result<HttpResponse, Error> {
    if body.name.eq(SHARED_MEMBER) {
        return Ok(
            HttpResponse::BadRequest().body(format!("Member name {} not allowed", SHARED_MEMBER))
        );
    }

    let client: Client = db_pool.get().await.map_err(ApiError::PoolError)?;
    let member_id = db::get_member_id(&client, auth.group_id, &body.name).await?;
    db::record_clue_completion(&client, member_id, body.tier.as_str()).await?;
    Ok(HttpResponse::Created().finish())
}

#[post("/death")]
pub async fn death(
    auth: Authenticated,
    body: web::Json<DeathEvent>,
    db_pool: web::Data<Pool>,
) -> Result<HttpResponse, Error> {
    if body.name.eq(SHARED_MEMBER) {
        return Ok(
            HttpResponse::BadRequest().body(format!("Member name {} not allowed", SHARED_MEMBER))
        );
    }
    validate_optional_string_length("killer", &body.killer, 100)?;

    let client: Client = db_pool.get().await.map_err(ApiError::PoolError)?;
    let member_id = db::get_member_id(&client, auth.group_id, &body.name).await?;
    db::record_death(
        &client,
        member_id,
        body.world_x,
        body.world_y,
        body.plane,
        body.killer.as_deref(),
    )
    .await?;
    Ok(HttpResponse::Created().finish())
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct GetGroupDataQuery {
    pub from_time: DateTime<Utc>,
}
#[get("/get-group-data")]
pub async fn get_group_data(
    auth: Authenticated,
    db_pool: web::Data<Pool>,
    query: web::Query<GetGroupDataQuery>,
) -> Result<web::Json<Vec<GroupMember>>, Error> {
    let from_time = query.from_time;
    let client: Client = db_pool.get().await.map_err(ApiError::PoolError)?;
    let group_members = db::get_group_data(&client, auth.group_id, &from_time).await?;
    Ok(web::Json(group_members))
}

#[derive(Deserialize)]
pub enum SkillDataPeriod {
    Day,
    Week,
    Month,
    Year,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct GetSkillDataQuery {
    pub period: SkillDataPeriod,
}
#[get("/get-skill-data")]
pub async fn get_skill_data(
    auth: Authenticated,
    db_pool: web::Data<Pool>,
    query: web::Query<GetSkillDataQuery>,
) -> Result<web::Json<GroupSkillData>, Error> {
    let client: Client = db_pool.get().await.map_err(ApiError::PoolError)?;
    let aggregate_period = match query.period {
        SkillDataPeriod::Day => db::AggregatePeriod::Day,
        SkillDataPeriod::Week => db::AggregatePeriod::Month,
        SkillDataPeriod::Month => db::AggregatePeriod::Month,
        SkillDataPeriod::Year => db::AggregatePeriod::Year,
    };
    let group_skill_data =
        db::get_skills_for_period(&client, auth.group_id, aggregate_period).await?;
    Ok(web::Json(group_skill_data))
}

#[get("/am-i-logged-in")]
pub async fn am_i_logged_in(_auth: Authenticated) -> Result<HttpResponse, Error> {
    Ok(HttpResponse::Ok().finish())
}

#[get("/am-i-in-group")]
pub async fn am_i_in_group(
    auth: Authenticated,
    db_pool: web::Data<Pool>,
    q: web::Query<AmIInGroupRequest>,
) -> Result<HttpResponse, Error> {
    let client: Client = db_pool.get().await.map_err(ApiError::PoolError)?;
    let in_group: bool = db::is_member_in_group(&client, auth.group_id, &q.member_name).await?;

    if !in_group {
        return Ok(HttpResponse::Unauthorized().body("Player is not a member of this group"));
    }
    Ok(HttpResponse::Ok().finish())
}

#[get("/collection-log")]
pub async fn get_collection_log() -> Result<web::Json<HashMap<String, Vec<i32>>>, Error> {
    Ok(web::Json(HashMap::new()))
}
