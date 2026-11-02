pub fn snippet_around(text: &str, needle_lower: &str) -> Option<String> {
    let lower = text.to_lowercase();
    if !lower.contains(needle_lower) {
        return None;
    }
    if lower.len() == text.len() {
        let index = lower.find(needle_lower)?;
        return Some(slice_snippet(text, index, needle_lower.len()));
    }
    for line in text.lines() {
        if line.to_lowercase().contains(needle_lower) {
            return Some(trim_len(line, 120));
        }
    }
    Some(trim_len(text, 120))
}

fn slice_snippet(text: &str, index: usize, needle_len: usize) -> String {
    let start = floor_char(text, index.saturating_sub(40));
    let end = ceil_char(text, (index + needle_len + 40).min(text.len()));
    let mut snippet = text[start..end].replace(['\n', '\r'], " ");
    if start > 0 {
        snippet.insert(0, '…');
    }
    if end < text.len() {
        snippet.push('…');
    }
    snippet
}

fn trim_len(text: &str, max: usize) -> String {
    let mut out = String::new();
    for ch in text.chars().take(max) {
        out.push(ch);
    }
    if text.chars().count() > max {
        out.push('…');
    }
    out
}

fn floor_char(text: &str, mut index: usize) -> usize {
    while index > 0 && !text.is_char_boundary(index) {
        index -= 1;
    }
    index
}

fn ceil_char(text: &str, mut index: usize) -> usize {
    while index < text.len() && !text.is_char_boundary(index) {
        index += 1;
    }
    index
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn snippet_keeps_chinese_match_context() {
        let text = "寄存器保存 CPU 正在使用的数据。";
        let snippet = snippet_around(text, "寄存器").unwrap();
        assert!(snippet.contains("寄存器"));
    }
}
