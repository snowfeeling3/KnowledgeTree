use crate::{
    config::{Config, ConfigStore},
    library_session::{inspect, LibrarySession},
    AppState,
};
use serde::Serialize;
use std::{
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::{Manager, State};

pub struct Session {
    pub store: Option<ConfigStore>,
    pub config: Config,
    pub active: Option<LibrarySession>,
    pub error: Option<String>,
    pub source: String,
    pub frozen: bool,
}
#[derive(Serialize)]
pub struct BootStatus {
    pub version: String,
    pub ready: bool,
    pub library_path: Option<String>,
    pub recommended_path: String,
    pub config_directory: String,
    pub error: Option<String>,
    pub source: String,
    pub preferences: std::collections::BTreeMap<String, serde_json::Value>,
    pub import_legacy_preferences: bool,
}
pub fn recommended() -> PathBuf {
    dirs::document_dir()
        .or_else(dirs::home_dir)
        .unwrap_or_else(|| PathBuf::from("."))
        .join("KnowledgeTree")
}
fn candidate_path(path: &Path) -> Result<PathBuf, String> {
    if !path.is_absolute()
        || path
            .components()
            .any(|c| matches!(c, std::path::Component::ParentDir))
    {
        return Err("请选择不含上级跳转的绝对路径".into());
    }
    if path.exists() {
        return path.canonicalize().map_err(|e| e.to_string());
    }
    let parent = path.parent().ok_or("目录无可用父路径")?;
    Ok(candidate_path(parent)?.join(path.file_name().ok_or("目录名称无效")?))
}
fn validate_location(path: &Path, config_dir: &Path) -> Result<PathBuf, String> {
    let candidate = candidate_path(path)?;
    let mut forbidden = vec![config_dir.canonicalize().map_err(|e| e.to_string())?];
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            forbidden.push(parent.canonicalize().map_err(|e| e.to_string())?);
        }
    }
    if let Some(local) = dirs::data_local_dir() {
        forbidden.push(candidate_path(&local.join("dev.knowledgetree.desktop"))?);
    }
    if forbidden
        .iter()
        .any(|root| candidate.starts_with(root) || root.starts_with(&candidate))
    {
        return Err(
            "知识库不能放在应用安装目录、配置目录或应用缓存目录内，请选择独立的数据目录".into(),
        );
    }
    Ok(candidate)
}
pub fn initialize(
    directory: PathBuf,
    override_path: Option<PathBuf>,
    legacy_path: PathBuf,
) -> Session {
    let (store, mut config) = match ConfigStore::open(directory) {
        Ok(value) => value,
        Err(error) => {
            return Session {
                store: None,
                config: Config::default(),
                active: None,
                error: Some(error),
                source: "configuration-error".into(),
                frozen: false,
            }
        }
    };
    let (path, source) = if let Some(path) = override_path {
        (Some(path), "environment")
    } else if let Some(path) = config.library_path.clone() {
        (Some(path), "config")
    } else if legacy_path.is_dir() && inspect(&legacy_path).is_ok() {
        (Some(legacy_path), "legacy")
    } else {
        (None, "unconfigured")
    };
    let mut error = None;
    let active = path.and_then(|path| {
        match validate_location(&path, &store.directory)
            .and_then(|path| LibrarySession::open(&path, false))
        {
            Ok(active) => {
                if source == "legacy" {
                    config.library_path = Some(path);
                    if let Err(e) = store.save(&config) {
                        error = Some(e);
                        return None;
                    }
                }
                Some(active)
            }
            Err(e) => {
                error = Some(e);
                None
            }
        }
    });
    Session {
        store: Some(store),
        config,
        active,
        error,
        source: source.into(),
        frozen: false,
    }
}
pub fn status(session: &Session) -> BootStatus {
    let library_path = session
        .active
        .as_ref()
        .map(|s| s.library.root().display().to_string());
    BootStatus {
        version: env!("CARGO_PKG_VERSION").into(),
        ready: session.active.is_some(),
        library_path,
        recommended_path: recommended().display().to_string(),
        config_directory: session
            .store
            .as_ref()
            .map(|s| s.directory.display().to_string())
            .unwrap_or_default(),
        error: session.error.clone(),
        source: session.source.clone(),
        preferences: session.config.preferences.clone(),
        import_legacy_preferences: matches!(session.source.as_str(), "legacy" | "environment")
            && !session.config.legacy_preferences_imported,
    }
}
#[tauri::command]
pub fn startup_status(state: State<AppState>) -> Result<BootStatus, String> {
    Ok(status(&*state.library.lock().map_err(|e| e.to_string())?))
}
#[tauri::command]
pub async fn choose_folder(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .file()
            .set_title("选择知识库目录")
            .blocking_pick_folder()
            .map(|p| p.to_string())
    })
    .await
    .map_err(|e| e.to_string())
}
#[tauri::command]
pub fn configure_library(
    state: State<AppState>,
    path: String,
    create: bool,
) -> Result<BootStatus, String> {
    let mut session = state.library.lock().map_err(|e| e.to_string())?;
    if session.frozen {
        return Err("正在安装更新，无法切换知识库".into());
    }
    if session.source == "environment" {
        return Err("本次运行由环境变量指定知识库，请移除环境变量后再切换".into());
    }
    let store = session
        .store
        .as_ref()
        .ok_or("应用配置不可用，未更改知识库")?;
    let path = validate_location(&PathBuf::from(path), &store.directory)?;
    if session
        .active
        .as_ref()
        .is_some_and(|s| s.library.root() == path)
    {
        return Ok(status(&session));
    }
    let active = LibrarySession::open(&path, create)?;
    let mut config = session.config.clone();
    config.library_path = Some(path.canonicalize().map_err(|e| e.to_string())?);
    session
        .store
        .as_ref()
        .ok_or("应用配置不可用，未保存路径")?
        .save(&config)?;
    session.config = config;
    session.active = Some(active);
    session.error = None;
    session.source = "config".into();
    Ok(status(&session))
}
#[tauri::command]
pub fn save_preferences(
    state: State<AppState>,
    preferences: std::collections::BTreeMap<String, serde_json::Value>,
    imported: bool,
) -> Result<(), String> {
    let mut session = state.library.lock().map_err(|e| e.to_string())?;
    let mut next = session.config.clone();
    for (key, value) in preferences {
        if !key.starts_with("kt-") && key != "knowledge-tree-layout" {
            return Err("无效的设置键".into());
        }
        next.preferences.insert(key, value);
    }
    if imported {
        next.legacy_preferences_imported = true;
    }
    session.store.as_ref().ok_or("配置不可用")?.save(&next)?;
    session.config = next;
    Ok(())
}
#[tauri::command]
pub fn create_backup(app: tauri::AppHandle, state: State<AppState>) -> Result<String, String> {
    if std::env::var_os("KNOWLEDGE_TREE_CONFIG_DIR").is_none() {
        use tauri_plugin_window_state::{AppHandleExt, StateFlags};
        app.save_window_state(StateFlags::all())
            .map_err(|e| e.to_string())?;
    }
    let session = state.library.lock().map_err(|e| e.to_string())?;
    crate::library_session::reject_other_processes()?;
    let root = session
        .active
        .as_ref()
        .ok_or("知识库尚未连接")?
        .library
        .root();
    let store = session.store.as_ref().ok_or("配置不可用")?;
    let backups = store.directory.join("backups");
    std::fs::create_dir_all(&backups).map_err(|e| e.to_string())?;
    let time = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_nanos();
    let destination = crate::library_session::backup(
        root,
        &backups.join(format!("schema1-{time}")),
        &session.config,
    )?;
    let manifest_path = destination.join("manifest.json");
    let mut manifest: serde_json::Value =
        serde_json::from_slice(&std::fs::read(&manifest_path).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
    for name in [".window-state.json", "window-state.json"] {
        let source = store.directory.join(name);
        if source.is_file() {
            let before = crate::library_session::digest(&source)?;
            std::fs::copy(&source, destination.join(name)).map_err(|e| e.to_string())?;
            if before != crate::library_session::digest(&source)?
                || before != crate::library_session::digest(&destination.join(name))?
            {
                return Err("窗口设置备份不一致".into());
            }
            manifest["window_settings"][name] = serde_json::json!(before);
        }
    }
    manifest["status"] = serde_json::json!("verified");
    crate::config::atomic_json(&manifest_path, &manifest)?;
    Ok(destination.display().to_string())
}

pub fn setup(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let isolated = std::env::var_os("KNOWLEDGE_TREE_CONFIG_DIR").map(PathBuf::from);
    let legacy = isolated
        .as_ref()
        .map(|p| p.parent().unwrap_or(p).join("legacy"))
        .unwrap_or_else(|| std::env::var_os("KNOWLEDGE_TREE_LEGACY_LIBRARY").map(PathBuf::from).unwrap_or_else(|| app.path().app_config_dir().unwrap_or_default().join("legacy")));
    let directory = isolated.unwrap_or(app.path().app_config_dir()?);
    let override_path = std::env::var_os("KNOWLEDGE_TREE_LIBRARY")
        .filter(|p| !p.is_empty())
        .map(PathBuf::from);
    app.manage(AppState {
        library: Mutex::new(initialize(directory, override_path, legacy)),
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn library_cannot_be_created_inside_application_configuration() {
        let dir = tempfile::tempdir().unwrap();
        let config = dir.path().join("config");
        std::fs::create_dir(&config).unwrap();
        assert!(validate_location(&config.join("library"), &config).is_err());
        assert!(!config.join("library").exists());
        assert!(validate_location(&dir.path().join("independent-library"), &config).is_ok());
    }
    #[test]
    fn first_run_does_not_create_a_library_and_invalid_override_does_not_fallback() {
        let dir = tempfile::tempdir().unwrap();
        let legacy = dir.path().join("legacy");
        let session = initialize(dir.path().join("config"), None, legacy.clone());
        assert!(session.active.is_none());
        assert!(!legacy.exists());
        drop(session);
        let session = initialize(
            dir.path().join("config"),
            Some(dir.path().join("missing")),
            legacy.clone(),
        );
        assert!(session.active.is_none());
        assert!(session.error.is_some());
        assert!(!legacy.exists());
    }
    #[test]
    fn legacy_is_adopted_in_place_and_restored_on_next_launch() {
        let dir = tempfile::tempdir().unwrap();
        let legacy = dir.path().join("legacy");
        drop(LibrarySession::open(&legacy, true).unwrap());
        let config = dir.path().join("config");
        let session = initialize(config.clone(), None, legacy.clone());
        assert_eq!(session.source, "legacy");
        assert!(status(&session).ready);
        drop(session);
        let session = initialize(config, None, dir.path().join("other"));
        assert_eq!(session.source, "config");
        assert_eq!(
            session.active.unwrap().library.root(),
            legacy.canonicalize().unwrap()
        );
    }
}
