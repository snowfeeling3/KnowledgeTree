use crate::AppState;
use serde::Serialize;
use std::{
    sync::Mutex,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{Emitter, Manager, State};
use tauri_plugin_updater::{Update, UpdaterExt};

#[derive(Clone, Serialize)]
pub struct UpdateStatus {
    pub current_version: String,
    pub phase: String,
    pub version: Option<String>,
    pub notes: Option<String>,
    pub downloaded: u64,
    pub total: Option<u64>,
    pub error: Option<String>,
}
struct Pending {
    status: UpdateStatus,
    update: Option<Update>,
    bytes: Option<Vec<u8>>,
}
pub struct Updates(Mutex<Pending>);
fn enabled() -> bool {
    option_env!("KNOWLEDGE_TREE_UPDATE_URL").is_some_and(|s| s.starts_with("https://"))
        && option_env!("KNOWLEDGE_TREE_UPDATE_PUBLIC_KEY").is_some_and(|s| !s.trim().is_empty())
}
pub fn setup(app: &mut tauri::App) {
    app.manage(Updates(Mutex::new(Pending {
        status: UpdateStatus {
            current_version: env!("CARGO_PKG_VERSION").into(),
            phase: if enabled() { "idle" } else { "unconfigured" }.into(),
            version: None,
            notes: None,
            downloaded: 0,
            total: None,
            error: None,
        },
        update: None,
        bytes: None,
    })));
}
fn publish(app: &tauri::AppHandle, status: &UpdateStatus) {
    let _ = app.emit("knowledge-tree-update", status);
}
#[tauri::command]
pub fn update_status(state: State<Updates>) -> Result<UpdateStatus, String> {
    Ok(state.0.lock().map_err(|e| e.to_string())?.status.clone())
}
pub fn check_due(last: u64, failures: u32, now: u64) -> bool {
    let interval = if failures == 0 {
        86400
    } else {
        (900u64.saturating_mul(1u64 << failures.min(6))).min(86400)
    };
    last == 0 || now.saturating_sub(last) >= interval
}
#[tauri::command]
pub async fn check_update(app: tauri::AppHandle, manual: bool) -> Result<UpdateStatus, String> {
    let updates = app.state::<Updates>();
    if !enabled() {
        return update_status(updates);
    }
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_secs();
    {
        let mut pending = updates.0.lock().map_err(|e| e.to_string())?;
        if matches!(
            pending.status.phase.as_str(),
            "checking" | "downloading" | "downloaded" | "installing"
        ) {
            return Ok(pending.status.clone());
        }
        let state = app.state::<AppState>();
        let mut session = state.library.lock().map_err(|e| e.to_string())?;
        if !manual
            && !check_due(
                session.config.last_update_check,
                session.config.update_failures,
                now,
            )
        {
            return Ok(pending.status.clone());
        }
        let mut config = session.config.clone();
        config.last_update_check = now;
        session.store.as_ref().ok_or("配置不可用")?.save(&config)?;
        session.config = config;
        pending.status.phase = "checking".into();
        pending.status.error = None;
        publish(&app, &pending.status);
    }
    let result: Result<Option<Update>, String> = async {
        let endpoint = option_env!("KNOWLEDGE_TREE_UPDATE_URL")
            .ok_or("更新地址未配置")?
            .parse()
            .map_err(|e| format!("更新地址错误：{e}"))?;
        let update = app
            .updater_builder()
            .endpoints(vec![endpoint])
            .map_err(|e| e.to_string())?
            .pubkey(option_env!("KNOWLEDGE_TREE_UPDATE_PUBLIC_KEY").unwrap_or_default())
            .timeout(Duration::from_secs(15))
            .build()
            .map_err(|e| e.to_string())?
            .check()
            .await
            .map_err(|e| e.to_string())?;
        if update
            .as_ref()
            .is_some_and(|u| u.download_url.scheme() != "https")
        {
            return Err("更新包必须使用 HTTPS 下载地址".into());
        }
        Ok(update)
    }
    .await;
    let mut pending = updates.0.lock().map_err(|e| e.to_string())?;
    pending.bytes = None;
    match result {
        Ok(update) => {
            pending.status.phase = if update.is_some() {
                "available"
            } else {
                "current"
            }
            .into();
            pending.status.version = update.as_ref().map(|u| u.version.clone());
            pending.status.notes = update.as_ref().and_then(|u| u.body.clone());
            pending.update = update;
        }
        Err(error) => {
            pending.status.phase = "failed".into();
            pending.status.error = Some(format!("检查未完成，可继续离线使用：{error}"));
            pending.update = None;
        }
    }
    {
        let state = app.state::<AppState>();
        let mut session = state.library.lock().map_err(|e| e.to_string())?;
        let mut config = session.config.clone();
        config.update_failures = if pending.status.phase == "failed" {
            config.update_failures.saturating_add(1)
        } else {
            0
        };
        if let Some(store) = &session.store {
            store.save(&config)?;
        }
        session.config = config;
    }
    publish(&app, &pending.status);
    Ok(pending.status.clone())
}
#[tauri::command]
pub async fn download_update(app: tauri::AppHandle) -> Result<UpdateStatus, String> {
    let updates = app.state::<Updates>();
    let update = {
        let mut pending = updates.0.lock().map_err(|e| e.to_string())?;
        if pending.status.phase != "available" {
            return Err("没有可下载的更新".into());
        }
        let mut update = pending.update.clone().ok_or("更新信息已失效")?;
        // Keep metadata checks short, but allow slow connections to finish the signed package.
        update.timeout = Some(Duration::from_secs(600));
        pending.status.phase = "downloading".into();
        pending.status.downloaded = 0;
        pending.status.total = None;
        pending.status.error = None;
        publish(&app, &pending.status);
        update
    };
    let progress_app = app.clone();
    let result = update
        .download(
            move |chunk, total| {
                let state = progress_app.state::<Updates>();
                if let Ok(mut pending) = state.0.lock() {
                    pending.status.downloaded += chunk as u64;
                    pending.status.total = total;
                    publish(&progress_app, &pending.status);
                };
            },
            || {},
        )
        .await;
    let mut pending = updates.0.lock().map_err(|e| e.to_string())?;
    match result {
        Ok(bytes) => {
            pending.bytes = Some(bytes);
            pending.status.phase = "downloaded".into();
        }
        Err(e) => {
            pending.bytes = None;
            pending.status.phase = "available".into();
            pending.status.error = Some(format!("下载或签名验证失败，未安装：{e}"));
        }
    }
    publish(&app, &pending.status);
    Ok(pending.status.clone())
}
#[tauri::command]
pub fn install_update(app: tauri::AppHandle) -> Result<(), String> {
    let updates = app.state::<Updates>();
    let mut pending = updates.0.lock().map_err(|e| e.to_string())?;
    if pending.status.phase != "downloaded" {
        return Err("更新尚未下载并验证".into());
    }
    let state = app.state::<AppState>();
    {
        let mut session = state.library.lock().map_err(|e| e.to_string())?;
        crate::library_session::reject_other_processes()?;
        session
            .store
            .as_ref()
            .ok_or("配置不可用")?
            .save(&session.config)?;
        session.frozen = true;
    }
    use tauri_plugin_window_state::{AppHandleExt, StateFlags};
    if std::env::var_os("KNOWLEDGE_TREE_CONFIG_DIR").is_none() {
        let _ = app.save_window_state(StateFlags::all());
    }
    pending.status.phase = "installing".into();
    publish(&app, &pending.status);
    let result = pending
        .update
        .as_ref()
        .ok_or("缺少更新信息")?
        .install(pending.bytes.as_ref().ok_or("缺少更新包")?);
    if let Err(e) = result {
        state.library.lock().map_err(|e| e.to_string())?.frozen = false;
        pending.status.phase = "downloaded".into();
        pending.status.error = Some(e.to_string());
        publish(&app, &pending.status);
        return Err(e.to_string());
    }
    app.restart();
}
#[tauri::command]
pub fn cancel_install(state: State<AppState>) -> Result<(), String> {
    state.library.lock().map_err(|e| e.to_string())?.frozen = false;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn signed_fixture_rejects_tampered_package_and_version_comment() {
        use base64::Engine;
        let decode = |value: &str| {
            String::from_utf8(
                base64::engine::general_purpose::STANDARD
                    .decode(value.trim())
                    .unwrap(),
            )
            .unwrap()
        };
        let key = minisign_verify::PublicKey::decode(&decode(include_str!(
            "../test-fixtures/update-fixture.pub"
        )))
        .unwrap();
        let text = decode(include_str!("../test-fixtures/update-fixture.bin.sig"));
        let signature = minisign_verify::Signature::decode(&text).unwrap();
        let payload = include_bytes!("../test-fixtures/update-fixture.bin");
        key.verify(payload, &signature, false).unwrap();
        assert!(signature.trusted_comment().contains("version:0.1.1"));
        let mut tampered = payload.to_vec();
        tampered[0] ^= 1;
        assert!(key.verify(&tampered, &signature, false).is_err());
        let altered =
            minisign_verify::Signature::decode(&text.replace("version:0.1.1", "version:9.9.9"))
                .unwrap();
        assert!(key.verify(payload, &altered, false).is_err());
    }
    #[test]
    fn check_frequency_and_offline_backoff() {
        assert!(check_due(0, 0, 1));
        assert!(!check_due(100, 0, 101));
        assert!(check_due(100, 0, 86500));
        assert!(!check_due(100, 1, 1000));
        assert!(check_due(100, 1, 1900));
        assert!(!check_due(100, 0, 50));
    }
}
