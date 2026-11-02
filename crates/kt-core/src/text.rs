use crate::error::{Error, Result};

pub fn normalize_title(title: &str) -> Result<String> {
    if title.chars().any(|ch| ch.is_control()) {
        return Err(Error::Invalid("标题不能包含控制字符".into()));
    }
    let title = title.trim();
    if title.is_empty() {
        return Err(Error::EmptyTitle);
    }
    if title.chars().count() > 200 {
        return Err(Error::Invalid("标题不能超过 200 个字符".into()));
    }
    Ok(title.to_string())
}

pub fn normalize_description(text: &str) -> Result<String> {
    normalize_body(text, "描述", 8_000)
}

pub fn normalize_note(text: &str) -> Result<String> {
    normalize_body(text, "关系说明", 2_000)
}

pub fn normalize_meta(text: &str, label: &str) -> Result<String> {
    normalize_body(text, label, 4_000)
}

fn normalize_body(text: &str, label: &str, max: usize) -> Result<String> {
    if text.chars().any(|ch| ch == '\0') {
        return Err(Error::Invalid(format!("{label}包含非法字符")));
    }
    let text = text.trim();
    if text.chars().count() > max {
        return Err(Error::Invalid(format!("{label}不能超过 {max} 个字符")));
    }
    Ok(text.to_string())
}

pub fn blank_to_none(value: Option<String>) -> Option<String> {
    value.and_then(|text| {
        let text = text.trim().to_string();
        if text.is_empty() {
            None
        } else {
            Some(text)
        }
    })
}

pub fn normalize_optional(value: Option<String>, label: &str) -> Result<Option<String>> {
    match blank_to_none(value) {
        Some(text) => Ok(Some(normalize_meta(&text, label)?)),
        None => Ok(None),
    }
}

pub fn normalize_list(
    items: Vec<String>,
    label: &str,
    max_items: usize,
    max_len: usize,
) -> Result<Vec<String>> {
    let mut out = Vec::new();
    for item in items {
        let item = item.trim();
        if item.is_empty() {
            continue;
        }
        if item.chars().any(|ch| ch == '\0') {
            return Err(Error::Invalid(format!("{label}包含非法字符")));
        }
        if item.chars().count() > max_len {
            return Err(Error::Invalid(format!("{label}不能超过 {max_len} 个字符")));
        }
        if out.iter().any(|existing: &String| existing == item) {
            continue;
        }
        out.push(item.to_string());
        if out.len() > max_items {
            return Err(Error::Invalid(format!("{label}不能超过 {max_items} 个")));
        }
    }
    Ok(out)
}

pub fn ensure_year_range(start: Option<i32>, end: Option<i32>) -> Result<()> {
    if let (Some(start), Some(end)) = (start, end) {
        if start > end {
            return Err(Error::InvalidYearRange);
        }
    }
    Ok(())
}
