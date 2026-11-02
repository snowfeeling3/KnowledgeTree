use std::collections::{HashMap, HashSet};

pub fn parent_link_is_cyclic(id: &str, parent: &str, parents: &HashMap<String, String>) -> bool {
    if id == parent {
        return true;
    }
    let mut seen = HashSet::new();
    seen.insert(id.to_string());
    let mut cursor = Some(parent);
    while let Some(current) = cursor {
        if !seen.insert(current.to_string()) {
            return true;
        }
        cursor = parents.get(current).map(String::as_str);
    }
    false
}

pub fn find_cycle(links: impl IntoIterator<Item = (String, Option<String>)>) -> Option<String> {
    let parents: HashMap<String, String> = links
        .into_iter()
        .filter_map(|(id, parent)| parent.map(|parent| (id, parent)))
        .collect();
    for id in parents.keys() {
        if parent_link_is_cyclic(id, &parents[id], &parents) {
            return Some(id.clone());
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_a_cycle_and_accepts_a_chain() {
        let mut parents = HashMap::new();
        parents.insert("b".to_string(), "a".to_string());
        assert!(!parent_link_is_cyclic("c", "b", &parents));
        parents.insert("a".to_string(), "c".to_string());
        assert!(parent_link_is_cyclic("c", "b", &parents));
        assert_eq!(
            find_cycle([
                ("a".to_string(), Some("c".to_string())),
                ("b".to_string(), Some("a".to_string())),
                ("c".to_string(), Some("b".to_string())),
            ])
            .is_some(),
            true
        );
    }
}
