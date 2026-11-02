//! Local-first knowledge model.
//!
//! Structure lives in YAML. Prose lives in Markdown. Callers render either
//! without changing the stored model.

mod document;
mod error;
mod git;
mod graph;
mod id;
mod import;
mod layout;
mod model;
mod search;
mod store;
mod text;

pub use error::{Error, Result};
pub use git::{with_git_program, ChangeDiff, DiffFile, History, HistoryEntry};
pub use import::{validate_import, ImportReport};
pub use model::*;
pub use store::{Library, SubjectStore};
