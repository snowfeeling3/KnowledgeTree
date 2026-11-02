use fs2::FileExt;
use kt_core::Library;
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeMap,
    fs::{File, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
};

pub struct LibrarySession {
    pub library: Library,
    _lock: File,
}

fn reject_links(path: &Path) -> Result<(), String> {
    let meta = std::fs::symlink_metadata(path).map_err(|e| e.to_string())?;
    if path.file_name().is_some_and(|name| name == ".git") && !meta.is_dir() {
        return Err(format!(
            "暂不支持外置 Git 工作树；完整备份必须包含实际 .git 目录：{}",
            path.display()
        ));
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if meta.file_attributes() & 0x400 != 0 {
            return Err(format!(
                "暂不支持含符号链接或联接点的知识库：{}",
                path.display()
            ));
        }
    }
    if meta.file_type().is_symlink() {
        return Err(format!("暂不支持符号链接：{}", path.display()));
    }
    if meta.is_dir() {
        for entry in std::fs::read_dir(path).map_err(|e| e.to_string())? {
            reject_links(&entry.map_err(|e| e.to_string())?.path())?;
        }
    }
    Ok(())
}

pub fn inspect(path: &Path) -> Result<Library, String> {
    if !path.is_absolute() || !path.is_dir() {
        return Err("请选择已存在的绝对目录路径".into());
    }
    reject_links(path)?;
    let library = Library::open_existing(path).map_err(|e| e.to_string())?;
    let subjects = library.list_subjects().map_err(|e| e.to_string())?;
    // Ignore no files silently when deciding whether an arbitrary directory is a library.
    for entry in std::fs::read_dir(path).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name();
        if name == ".knowledge-tree.lock" || name == ".knowledge-tree.json" {
            continue;
        }
        if !entry.path().is_dir() || !entry.path().join("subject.yaml").is_file() {
            return Err(format!(
                "目录包含无法识别的文件或文件夹：{}。不会覆盖，请选择知识库根目录。",
                entry.path().display()
            ));
        }
    }
    if subjects.is_empty() && !path.join(".knowledge-tree.json").is_file() {
        return Err("未识别到知识库；空目录请使用创建新知识库".into());
    }
    let manifest = path.join(".knowledge-tree.json");
    if manifest.exists() {
        let value: serde_json::Value =
            serde_json::from_slice(&std::fs::read(manifest).map_err(|e| e.to_string())?)
                .map_err(|e| e.to_string())?;
        if value["schema_version"] != 1 || value["kind"] != "knowledge-tree-library" {
            return Err("不支持的知识库根格式，请使用较新版本；当前禁止写入".into());
        }
    }
    for subject in subjects {
        let store = library
            .open_subject(&subject.id)
            .map_err(|e| e.to_string())?;
        let stages = store.list_stages().map_err(|e| e.to_string())?;
        let nodes = store.list_nodes().map_err(|e| e.to_string())?;
        let relations = store.list_relations().map_err(|e| e.to_string())?;
        let ids: std::collections::HashSet<_> = nodes.iter().map(|n| n.id.as_str()).collect();
        for node in &nodes {
            if node
                .stage
                .as_ref()
                .is_some_and(|id| !stages.iter().any(|s| &s.id == id))
            {
                return Err(format!("节点 {} 引用不存在的阶段", node.id));
            }
            let mut seen = std::collections::HashSet::new();
            let mut current = Some(node.id.as_str());
            while let Some(id) = current {
                if !seen.insert(id) {
                    return Err(format!("节点 {} 的父链成环", node.id));
                }
                let record = nodes
                    .iter()
                    .find(|n| n.id == id)
                    .ok_or_else(|| format!("节点 {} 引用不存在的上级", node.id))?;
                current = record.parent.as_deref();
            }
        }
        if relations
            .iter()
            .any(|r| !ids.contains(r.from.as_str()) || !ids.contains(r.to.as_str()))
        {
            return Err("关系包含缺失的端点，请先修复知识库".into());
        }
        for node in &nodes {
            store.read_document(&node.id).map_err(|e| e.to_string())?;
        }
    }
    Ok(library)
}

impl LibrarySession {
    pub fn open(path: &Path, create: bool) -> Result<Self, String> {
        reject_other_processes()?;
        if !path.is_absolute() {
            return Err("请选择绝对路径".into());
        }
        if create {
            if path.exists()
                && (!path.is_dir()
                    || std::fs::read_dir(path)
                        .map_err(|e| e.to_string())?
                        .next()
                        .is_some())
            {
                return Err("新知识库必须使用空目录；已有文件不会被覆盖".into());
            }
            std::fs::create_dir_all(path).map_err(|e| e.to_string())?;
        } else {
            inspect(path)?;
        }
        let lock = OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .open(path.join(".knowledge-tree.lock"))
            .map_err(|e| format!("目录不可写：{e}"))?;
        lock.try_lock_exclusive()
            .map_err(|_| "此知识库正在被另一实例使用，请先关闭它".to_string())?;
        if create {
            for entry in std::fs::read_dir(path).map_err(|e| e.to_string())? {
                if entry.map_err(|e| e.to_string())?.file_name() != ".knowledge-tree.lock" {
                    return Err("创建期间目录出现已有文件，已停止，未覆盖".into());
                }
            }
        }
        // Unique create_new probe; it never truncates an existing user file.
        let probe = path.join(format!(".kt-write-probe-{}", std::process::id()));
        let mut file = OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&probe)
            .map_err(|e| format!("目录不可写：{e}"))?;
        let result = file
            .write_all(b"permission check")
            .and_then(|_| file.sync_all());
        drop(file);
        std::fs::remove_file(&probe).map_err(|e| e.to_string())?;
        result.map_err(|e| e.to_string())?;
        if create {
            crate::config::atomic_json(
                &path.join(".knowledge-tree.json"),
                &serde_json::json!({"kind":"knowledge-tree-library","schema_version":1}),
            )?;
        }
        Ok(Self {
            library: Library::open_existing(path.canonicalize().map_err(|e| e.to_string())?)
                .map_err(|e| e.to_string())?,
            _lock: lock,
        })
    }
}

/// Older 0.1.0 does not cooperate with the lock. Fail closed if any desktop instance is visible.
#[cfg(windows)]
pub fn reject_other_processes() -> Result<(), String> {
    use windows_sys::Win32::{
        Foundation::{CloseHandle, INVALID_HANDLE_VALUE},
        System::Diagnostics::ToolHelp::{
            CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
            TH32CS_SNAPPROCESS,
        },
    };
    unsafe {
        let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if snapshot == INVALID_HANDLE_VALUE {
            return Err("无法检查旧版进程，暂时禁止写入".into());
        }
        let mut entry: PROCESSENTRY32W = std::mem::zeroed();
        entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
        let mut more = Process32FirstW(snapshot, &mut entry);
        let mut found = false;
        while more != 0 {
            let len = entry
                .szExeFile
                .iter()
                .position(|c| *c == 0)
                .unwrap_or(entry.szExeFile.len());
            let name = String::from_utf16_lossy(&entry.szExeFile[..len]).to_lowercase();
            if entry.th32ProcessID != std::process::id()
                && name.starts_with("knowledge-tree-desktop")
                && name.ends_with(".exe")
            {
                found = true;
                break;
            }
            more = Process32NextW(snapshot, &mut entry);
        }
        CloseHandle(snapshot);
        if found {
            Err("检测到另一个 KnowledgeTree 程序（可能是旧版），请关闭后重试".into())
        } else {
            Ok(())
        }
    }
}
#[cfg(not(windows))]
pub fn reject_other_processes() -> Result<(), String> {
    Ok(())
}

pub fn digest(path: &Path) -> Result<String, String> {
    let mut file = File::open(path).map_err(|e| e.to_string())?;
    let mut hash = Sha256::new();
    let mut buffer = [0u8; 65536];
    loop {
        let count = file.read(&mut buffer).map_err(|e| e.to_string())?;
        if count == 0 {
            break;
        }
        hash.update(&buffer[..count]);
    }
    Ok(format!("{:x}", hash.finalize()))
}
fn files(root: &Path, base: &Path, result: &mut BTreeMap<PathBuf, String>) -> Result<(), String> {
    for entry in std::fs::read_dir(root).map_err(|e| e.to_string())? {
        let path = entry.map_err(|e| e.to_string())?.path();
        if path
            .file_name()
            .is_some_and(|n| n == ".knowledge-tree.lock")
        {
            continue;
        }
        if path.is_dir() {
            files(&path, base, result)?;
        } else {
            result.insert(
                path.strip_prefix(base).map_err(|e| e.to_string())?.into(),
                digest(&path)?,
            );
        }
    }
    Ok(())
}
pub fn backup(
    source: &Path,
    destination: &Path,
    config: &crate::config::Config,
) -> Result<PathBuf, String> {
    reject_links(source)?;
    if destination.exists() {
        return Err("备份目标已存在，禁止覆盖".into());
    }
    let source = source.canonicalize().map_err(|e| e.to_string())?;
    let parent = destination
        .parent()
        .ok_or("无效的备份目标")?
        .canonicalize()
        .map_err(|e| e.to_string())?;
    if parent.starts_with(&source) {
        return Err("备份不能放在知识库内部".into());
    }
    std::fs::create_dir(destination).map_err(|e| e.to_string())?;
    let data = destination.join("library");
    std::fs::create_dir(&data).map_err(|e| e.to_string())?;
    let mut before = BTreeMap::new();
    files(&source, &source, &mut before)?;
    fn copy_dirs(source: &Path, dest: &Path) -> Result<(), String> {
        for entry in std::fs::read_dir(source).map_err(|e| e.to_string())? {
            let path = entry.map_err(|e| e.to_string())?.path();
            let name = path.file_name().ok_or("无效路径")?;
            if name == ".knowledge-tree.lock" {
                continue;
            }
            let target = dest.join(name);
            if path.is_dir() {
                std::fs::create_dir(&target).map_err(|e| e.to_string())?;
                copy_dirs(&path, &target)?;
            } else {
                std::fs::copy(&path, &target).map_err(|e| e.to_string())?;
            }
        }
        Ok(())
    }
    copy_dirs(&source, &data)?;
    let mut after = BTreeMap::new();
    files(&source, &source, &mut after)?;
    let mut copied = BTreeMap::new();
    files(&data, &data, &mut copied)?;
    if before != after || before != copied {
        return Err("备份时文件发生变化或复制不完整；保留不完整备份供检查，原知识库未修改".into());
    }
    crate::config::atomic_json(&destination.join("settings.json"), config)?;
    crate::config::atomic_json(
        &destination.join("manifest.json"),
        &serde_json::json!({"status":"data-verified", "schema_version":1,"files":before,"settings_sha256":digest(&destination.join("settings.json"))?}),
    )?;
    Ok(destination.into())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn create_never_overwrites_and_lock_excludes_second_writer() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("库");
        let session = LibrarySession::open(&path, true).unwrap();
        assert!(LibrarySession::open(&path, false).is_err());
        drop(session);
        let session = LibrarySession::open(&path, false).unwrap();
        drop(session);
        assert!(LibrarySession::open(&path, true).is_err());
        let arbitrary = dir.path().join("other");
        std::fs::create_dir(&arbitrary).unwrap();
        std::fs::write(arbitrary.join("notes.md"), b"keep").unwrap();
        assert!(LibrarySession::open(&arbitrary, true).is_err());
        assert!(inspect(&arbitrary).is_err());
        assert_eq!(std::fs::read(arbitrary.join("notes.md")).unwrap(), b"keep");
    }
    #[test]
    fn full_backup_preserves_hidden_git_assets_and_settings() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("库");
        let session = LibrarySession::open(&path, true).unwrap();
        let subject = session
            .library
            .create_subject(kt_core::NewSubject {
                title: "测试".into(),
                description: "".into(),
                id: Some("test".into()),
            })
            .unwrap();
        std::fs::write(
            path.join(subject.id).join("assets/image.bin"),
            [0, 1, 2, 255],
        )
        .unwrap();
        let mut config = crate::config::Config::default();
        config
            .preferences
            .insert("kt-theme".into(), serde_json::json!("dark"));
        let dest = dir.path().join("backup");
        backup(&path, &dest, &config).unwrap();
        assert_eq!(
            std::fs::read(dest.join("library/test/assets/image.bin")).unwrap(),
            [0, 1, 2, 255]
        );
        assert!(dest.join("library/test/.git").is_dir());
        assert!(dest.join("settings.json").is_file());
        assert!(backup(&path, &dest, &config).is_err());
        assert!(backup(&path, &path.join("nested"), &config).is_err());
    }
}
