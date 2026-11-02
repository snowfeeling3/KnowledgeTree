use std::collections::HashSet;
use std::sync::atomic::{AtomicU64, Ordering};

use crate::error::{Error, Result};

const MAX_LEN: usize = 64;
static SEQ: AtomicU64 = AtomicU64::new(1);

const RESERVED: &[&str] = &[
    "con", "prn", "aux", "nul", "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8",
    "com9", "lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9",
];

pub fn validate_id(id: &str) -> Result<()> {
    let bytes = id.as_bytes();
    if bytes.is_empty()
        || bytes.len() > MAX_LEN
        || !bytes[0].is_ascii_lowercase()
        || bytes.ends_with(b"-")
        || id.contains("--")
        || bytes
            .iter()
            .any(|byte| !byte.is_ascii_lowercase() && !byte.is_ascii_digit() && *byte != b'-')
        || RESERVED.contains(&id)
    {
        return Err(Error::InvalidId(id.to_string()));
    }
    Ok(())
}

pub fn allocate_id(title: &str, preferred: Option<&str>, used: &HashSet<String>) -> Result<String> {
    if let Some(id) = preferred {
        let id = id.trim();
        validate_id(id)?;
        if used.contains(id) {
            return Err(Error::DuplicateId(id.to_string()));
        }
        return Ok(id.to_string());
    }

    let base = slugify(title);
    if validate_id(&base).is_ok() && !used.contains(&base) {
        return Ok(base);
    }

    let stem = prefixed_stem(&base);
    for _ in 0..10_000 {
        let seq = SEQ.fetch_add(1, Ordering::Relaxed);
        let candidate = fit_len(&format!("{stem}-{seq:x}"));
        if validate_id(&candidate).is_ok() && !used.contains(&candidate) {
            return Ok(candidate);
        }
    }
    Err(Error::InvalidId(title.to_string()))
}

fn slugify(title: &str) -> String {
    let mut out = String::new();
    let mut dash = false;
    for ch in title.chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch.to_ascii_lowercase());
            dash = false;
        } else if !out.is_empty() && !dash {
            out.push('-');
            dash = true;
        }
        if out.len() >= MAX_LEN {
            break;
        }
    }
    while out.ends_with('-') {
        out.pop();
    }
    out
}

fn prefixed_stem(base: &str) -> String {
    let trimmed = base.trim_matches('-');
    if trimmed.is_empty() {
        return "n".to_string();
    }
    if trimmed.as_bytes()[0].is_ascii_lowercase() {
        fit_len(trimmed)
    } else {
        fit_len(&format!("n-{trimmed}"))
    }
}

fn fit_len(id: &str) -> String {
    let mut end = id.len().min(MAX_LEN);
    while end > 0 && !id.is_char_boundary(end) {
        end -= 1;
    }
    let mut sliced = id[..end].to_string();
    while sliced.ends_with('-') {
        sliced.pop();
    }
    sliced
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slugs_ascii_titles() {
        let used = HashSet::new();
        assert_eq!(allocate_id("CPU", None, &used).unwrap(), "cpu");
        assert_eq!(
            allocate_id("Computer Science", None, &used).unwrap(),
            "computer-science"
        );
    }

    #[test]
    fn chinese_titles_get_generated_ids() {
        let used = HashSet::new();
        let id = allocate_id("计算机科学", None, &used).unwrap();
        assert!(id.starts_with("n-"), "{id}");
        validate_id(&id).unwrap();
    }

    #[test]
    fn rejects_reserved_and_malformed_ids() {
        for id in ["con", "AUX", "a--b", "-ab", "1cpu", "cpu-", "中文"] {
            assert!(validate_id(id).is_err(), "{id}");
        }
    }
}
