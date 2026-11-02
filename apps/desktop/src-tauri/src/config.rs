use fs2::FileExt;
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    fs::{File, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default)]
pub struct Config {
    pub config_version: u32,
    pub library_path: Option<PathBuf>,
    pub preferences: BTreeMap<String, serde_json::Value>,
    pub legacy_preferences_imported: bool,
    pub last_update_check: u64,
    pub update_failures: u32,
}
impl Default for Config {
    fn default() -> Self {
        Self {
            config_version: 1,
            library_path: None,
            preferences: BTreeMap::new(),
            legacy_preferences_imported: false,
            last_update_check: 0,
            update_failures: 0,
        }
    }
}

pub struct ConfigStore {
    pub directory: PathBuf,
    _lock: File,
}
impl ConfigStore {
    pub fn open(directory: PathBuf) -> Result<(Self, Config), String> {
        std::fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
        let lock = OpenOptions::new()
            .create(true)
            .truncate(false)
            .read(true)
            .write(true)
            .open(directory.join("app.lock"))
            .map_err(|e| e.to_string())?;
        lock.try_lock_exclusive()
            .map_err(|_| "应用配置正被另一个 KnowledgeTree 实例使用，请关闭旧实例".to_string())?;
        let store = Self {
            directory,
            _lock: lock,
        };
        let path = store.directory.join("config.json");
        // Never replace corrupt or future configurations with defaults.
        let read_path = if !path.exists() && path.with_extension("previous").is_file() {
            path.with_extension("previous")
        } else {
            path.clone()
        };
        let config = if read_path.exists() {
            serde_json::from_slice::<Config>(&std::fs::read(&read_path).map_err(|e| e.to_string())?)
                .map_err(|e| format!("配置文件无法解析，请保留文件并修复：{e}"))?
        } else {
            Config::default()
        };
        if config.config_version != 1 {
            return Err("此程序不支持当前配置版本，请使用较新版本".into());
        }
        Ok((store, config))
    }
    pub fn save(&self, config: &Config) -> Result<(), String> {
        atomic_json(&self.directory.join("config.json"), config)
    }
}

pub fn atomic_json(path: &Path, value: &impl Serialize) -> Result<(), String> {
    let bytes = serde_json::to_vec_pretty(value).map_err(|e| e.to_string())?;
    let tmp = path.with_extension("pending");
    let bak = path.with_extension("previous");
    if tmp.exists() {
        std::fs::remove_file(&tmp).map_err(|e| e.to_string())?;
    }
    let mut file = OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(&tmp)
        .map_err(|e| e.to_string())?;
    file.write_all(&bytes)
        .and_then(|_| file.sync_all())
        .map_err(|e| e.to_string())?;
    drop(file);
    if path.exists() {
        if bak.exists() {
            std::fs::remove_file(&bak).map_err(|e| e.to_string())?;
        }
        std::fs::rename(path, &bak).map_err(|e| e.to_string())?;
    }
    if let Err(e) = std::fs::rename(&tmp, path) {
        if bak.exists() {
            let _ = std::fs::rename(&bak, path);
        }
        return Err(e.to_string());
    }
    // Keep the previous configuration for explicit recovery.
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn config_roundtrip_and_lock() {
        let dir = tempfile::tempdir().unwrap();
        let (store, mut config) = ConfigStore::open(dir.path().into()).unwrap();
        config.library_path = Some(dir.path().join("中文知识库"));
        store.save(&config).unwrap();
        assert!(ConfigStore::open(dir.path().into()).is_err());
        drop(store);
        assert_eq!(
            ConfigStore::open(dir.path().into()).unwrap().1.library_path,
            config.library_path
        );
    }
    #[test]
    fn corrupt_config_is_never_overwritten() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("config.json");
        std::fs::write(&path, b"broken").unwrap();
        assert!(ConfigStore::open(dir.path().into()).is_err());
        assert_eq!(std::fs::read(&path).unwrap(), b"broken");
    }
    #[test]
    fn interrupted_config_replace_recovers_previous_without_resetting_settings() {
        let dir = tempfile::tempdir().unwrap();
        let (store, mut config) = ConfigStore::open(dir.path().into()).unwrap();
        config
            .preferences
            .insert("kt-theme".into(), serde_json::json!("dark"));
        store.save(&config).unwrap();
        drop(store);
        std::fs::rename(
            dir.path().join("config.json"),
            dir.path().join("config.previous"),
        )
        .unwrap();
        let (store, recovered) = ConfigStore::open(dir.path().into()).unwrap();
        assert_eq!(recovered.preferences["kt-theme"], "dark");
        store.save(&recovered).unwrap();
        assert!(dir.path().join("config.json").is_file());
        assert!(dir.path().join("config.previous").is_file());
    }
}
