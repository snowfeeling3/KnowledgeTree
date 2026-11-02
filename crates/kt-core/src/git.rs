//! Best-effort Git history for one subject directory.
//!
//! Knowledge files are already on disk before a commit is attempted.
//! A missing Git binary or a rejected commit never rolls those files back.

use std::cell::RefCell;
use std::io::ErrorKind;
use std::path::Path;
use std::process::{Command, Output};

use serde::Serialize;

use crate::error::{Error, Result};

const PATCH_CHARS: usize = 12_000;
const FILE_LIMIT: usize = 200;

thread_local! {
    static PROGRAM_OVERRIDE: RefCell<Option<String>> = const { RefCell::new(None) };
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct History {
    pub ready: bool,
    pub note: String,
    pub entries: Vec<HistoryEntry>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct HistoryEntry {
    pub hash: String,
    pub summary: String,
    pub committed_at: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct ChangeDiff {
    pub hash: String,
    pub summary: String,
    pub files: Vec<DiffFile>,
    pub patch: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct DiffFile {
    pub status: String,
    pub path: String,
}

/// Runs `action` with a different Git executable on this thread only.
/// Integration tests use it to prove a missing Git does not lose writes.
pub fn with_git_program<T>(program: impl Into<String>, action: impl FnOnce() -> T) -> T {
    PROGRAM_OVERRIDE.with(|slot| {
        let previous = slot.borrow().clone();
        *slot.borrow_mut() = Some(program.into());
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(action));
        *slot.borrow_mut() = previous;
        match result {
            Ok(value) => value,
            Err(payload) => std::panic::resume_unwind(payload),
        }
    })
}

pub fn record(repo: &Path, message: &str) {
    let _ = try_record(repo, message);
}

pub fn history(repo: &Path, limit: usize) -> History {
    let limit = limit.clamp(1, 100);
    if let Err(err) = ensure_available() {
        return idle(false, err.to_string());
    }
    if !is_repo(repo) {
        return idle(
            false,
            "这个学科还没有版本历史。下次保存会尝试建立 Git 仓库。",
        );
    }
    if run(repo, &["rev-parse", "--verify", "--quiet", "HEAD"]).is_err() {
        return History {
            ready: true,
            note: dirty_note(repo),
            entries: Vec::new(),
        };
    }
    let limit_arg = format!("-n{limit}");
    match run(
        repo,
        &["log", &limit_arg, "--pretty=format:%H%x1f%s%x1f%cI%x1e"],
    ) {
        Ok(output) => History {
            ready: true,
            note: dirty_note(repo),
            entries: parse_log(&stdout(&output)),
        },
        Err(err) => idle(false, err.to_string()),
    }
}

pub fn change_diff(repo: &Path, hash: &str) -> Result<ChangeDiff> {
    if !valid_hash(hash) {
        return Err(Error::Invalid("提交标识不正确".into()));
    }
    ensure_available()?;
    if !is_repo(repo) {
        return Err(Error::Git("这个学科还没有 Git 仓库".into()));
    }
    let spec = format!("{hash}^{{commit}}");
    let full = stdout(&run(repo, &["rev-parse", "--verify", "--quiet", &spec])?);
    let full = full.trim().to_string();
    if !valid_hash(&full) {
        return Err(Error::Git("无法确认这次提交".into()));
    }
    let summary = one_line(&stdout(&run(repo, &["show", "-s", "--format=%s", &full])?));
    let files = parse_name_status(&stdout(&run(
        repo,
        &[
            "diff-tree",
            "--root",
            "--no-commit-id",
            "--name-status",
            "-r",
            "-M",
            &full,
        ],
    )?));
    let patch = bounded(
        &stdout(&run(
            repo,
            &["show", "--format=", "--patch", "--find-renames", &full],
        )?),
        PATCH_CHARS,
    );
    Ok(ChangeDiff {
        hash: full,
        summary,
        files,
        patch,
    })
}

fn try_record(repo: &Path, message: &str) -> Result<()> {
    ensure_available()?;
    ensure_repo(repo)?;
    let first = run(repo, &["rev-parse", "--verify", "--quiet", "HEAD"]).is_err();
    if clean(repo)? {
        return Ok(());
    }
    run(repo, &["add", "-A"])?;
    let mut message = commit_message(message);
    if first && !message.contains("创建学科") {
        message = commit_message(&format!("开始记录知识历史：{message}"));
    }
    run(repo, &["commit", "--no-verify", "-m", &message])?;
    Ok(())
}

fn ensure_repo(repo: &Path) -> Result<()> {
    if !is_repo(repo) {
        if run(repo, &["init", "-b", "main"]).is_err() {
            run(repo, &["init"])?;
        }
    }
    if run(repo, &["config", "--get", "user.name"]).is_err() {
        run(repo, &["config", "user.name", "Knowledge Tree"])?;
    }
    if run(repo, &["config", "--get", "user.email"]).is_err() {
        run(repo, &["config", "user.email", "knowledge-tree@localhost"])?;
    }
    let _ = run(repo, &["config", "core.autocrlf", "false"]);
    let _ = run(repo, &["config", "core.quotepath", "false"]);
    ensure_gitignore(repo)
}

fn ensure_gitignore(repo: &Path) -> Result<()> {
    let path = repo.join(".gitignore");
    if path.exists() {
        return Ok(());
    }
    std::fs::write(&path, "*.tmp-*\n*.bak-*\n").map_err(|source| Error::io(&path, source))
}

fn clean(repo: &Path) -> Result<bool> {
    let output = run(repo, &["status", "--porcelain"])?;
    Ok(stdout(&output).lines().all(|line| line.trim().is_empty()))
}

fn dirty_note(repo: &Path) -> String {
    match run(repo, &["status", "--porcelain"]) {
        Ok(output) => {
            let count = stdout(&output)
                .lines()
                .filter(|line| !line.trim().is_empty())
                .count();
            if count == 0 {
                String::new()
            } else {
                format!("有 {count} 项更改尚未写入历史")
            }
        }
        Err(err) => err.to_string(),
    }
}

fn ensure_available() -> Result<()> {
    let program = program();
    match Command::new(&program)
        .arg("--version")
        .env("GIT_TERMINAL_PROMPT", "0")
        .output()
    {
        Ok(output) if output.status.success() => Ok(()),
        Ok(output) => Err(Error::Git(command_detail(&output))),
        Err(source) if source.kind() == ErrorKind::NotFound => {
            Err(Error::Git(format!("未找到 Git（{program}）")))
        }
        Err(source) => Err(Error::Git(source.to_string())),
    }
}

fn run(repo: &Path, args: &[&str]) -> Result<Output> {
    let program = program();
    let output = Command::new(&program)
        .arg("-c")
        .arg("core.quotepath=false")
        .arg("-c")
        .arg("commit.gpgsign=false")
        .arg("-c")
        .arg("safe.directory=*")
        .arg("-C")
        .arg(repo)
        .arg("--no-pager")
        .args(args)
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_AUTHOR_NAME", "Knowledge Tree")
        .env("GIT_AUTHOR_EMAIL", "knowledge-tree@localhost")
        .env("GIT_COMMITTER_NAME", "Knowledge Tree")
        .env("GIT_COMMITTER_EMAIL", "knowledge-tree@localhost")
        .output()
        .map_err(|source| {
            if source.kind() == ErrorKind::NotFound {
                Error::Git(format!("未找到 Git（{program}）"))
            } else {
                Error::Git(source.to_string())
            }
        })?;
    if output.status.success() {
        Ok(output)
    } else {
        Err(Error::Git(command_detail(&output)))
    }
}

fn program() -> String {
    PROGRAM_OVERRIDE.with(|slot| {
        slot.borrow()
            .clone()
            .unwrap_or_else(|| std::env::var("KNOWLEDGE_TREE_GIT").unwrap_or_else(|_| "git".into()))
    })
}

fn is_repo(repo: &Path) -> bool {
    repo.join(".git").is_dir()
}

fn stdout(output: &Output) -> String {
    String::from_utf8_lossy(&output.stdout).into_owned()
}

fn command_detail(output: &Output) -> String {
    let stderr = String::from_utf8_lossy(&output.stderr);
    let stdout = String::from_utf8_lossy(&output.stdout);
    let detail = format!("{stderr}{stdout}")
        .replace(['\r', '\n'], " ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    let detail = if detail.is_empty() {
        format!("git 退出码 {}", output.status)
    } else {
        detail
    };
    detail.chars().take(300).collect()
}

fn idle(ready: bool, note: impl Into<String>) -> History {
    History {
        ready,
        note: note.into(),
        entries: Vec::new(),
    }
}

fn commit_message(message: &str) -> String {
    let flattened: String = message
        .chars()
        .map(|ch| if ch.is_control() { ' ' } else { ch })
        .collect();
    let trimmed = flattened.trim();
    let text = if trimmed.is_empty() {
        "更新知识"
    } else {
        trimmed
    };
    text.chars().take(200).collect()
}

fn one_line(text: &str) -> String {
    commit_message(text)
}

fn bounded(text: &str, max_chars: usize) -> String {
    if text.chars().count() <= max_chars {
        return text.to_string();
    }
    let kept: String = text.chars().take(max_chars).collect();
    format!("{kept}\n…差异过长，已截断")
}

fn valid_hash(hash: &str) -> bool {
    (7..=40).contains(&hash.len()) && hash.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn parse_log(text: &str) -> Vec<HistoryEntry> {
    let mut entries = Vec::new();
    for record in text.split('\u{1e}') {
        let record = record.trim();
        if record.is_empty() {
            continue;
        }
        let mut parts = record.split('\u{1f}');
        let Some(hash) = parts.next() else {
            continue;
        };
        let hash = hash.trim();
        if !valid_hash(hash) {
            continue;
        }
        let summary = parts.next().unwrap_or("").trim();
        let committed_at = parts.next().unwrap_or("").trim();
        entries.push(HistoryEntry {
            hash: hash.to_string(),
            summary: if summary.is_empty() {
                "更新知识".to_string()
            } else {
                summary.to_string()
            },
            committed_at: committed_at.to_string(),
        });
    }
    entries
}

fn parse_name_status(text: &str) -> Vec<DiffFile> {
    let mut files = Vec::new();
    for line in text.lines() {
        if files.len() == FILE_LIMIT {
            break;
        }
        let line = line.trim_end_matches('\r');
        if line.is_empty() {
            continue;
        }
        let mut parts = line.split('\t');
        let Some(status) = parts.next() else {
            continue;
        };
        let paths: Vec<&str> = parts.collect();
        let path = if status.starts_with('R') || status.starts_with('C') {
            match paths.as_slice() {
                [from, to] => format!("{from} -> {to}"),
                _ => paths.join(" "),
            }
        } else {
            paths.join(" ")
        };
        if path.is_empty() {
            continue;
        }
        files.push(DiffFile {
            status: status.chars().next().unwrap_or('?').to_string(),
            path,
        });
    }
    files
}
