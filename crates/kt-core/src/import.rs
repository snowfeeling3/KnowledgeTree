use std::collections::HashSet;

use serde::{Deserialize, Serialize};

use crate::error::Error;
use crate::graph::find_cycle;
use crate::id::validate_id;
use crate::model::{NodeType, RelationType};
use crate::text::{
    blank_to_none, ensure_year_range, normalize_description, normalize_list, normalize_title,
};

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ImportReport {
    pub ok: bool,
    pub errors: Vec<String>,
    pub stage_count: usize,
    pub node_count: usize,
    pub relation_count: usize,
}

#[derive(Debug, Deserialize)]
struct ImportBundle {
    subject: ImportSubject,
    #[serde(default)]
    stages: Vec<ImportStage>,
    #[serde(default)]
    nodes: Vec<ImportNode>,
    #[serde(default)]
    relations: Vec<ImportRelation>,
}

#[derive(Debug, Deserialize)]
struct ImportSubject {
    id: String,
    title: String,
    #[serde(default)]
    description: String,
}

#[derive(Debug, Deserialize)]
struct ImportStage {
    id: String,
    title: String,
    #[serde(default)]
    description: String,
    #[serde(default)]
    start: Option<i32>,
    #[serde(default)]
    end: Option<i32>,
    order: i32,
}

#[derive(Debug, Deserialize)]
struct ImportNode {
    id: String,
    title: String,
    #[serde(rename = "type")]
    node_type: NodeType,
    #[serde(default)]
    stage: Option<String>,
    #[serde(default)]
    parent: Option<String>,
    #[serde(default)]
    tags: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct ImportRelation {
    #[serde(default)]
    id: Option<String>,
    from: String,
    to: String,
    #[serde(rename = "type")]
    relation_type: RelationType,
}

pub fn validate_import(text: &str) -> ImportReport {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return fail(vec!["导入内容为空".into()], 0, 0, 0);
    }
    let parsed = if trimmed.starts_with('{') {
        serde_json::from_str::<ImportBundle>(trimmed).map_err(|err| err.to_string())
    } else {
        serde_yaml::from_str::<ImportBundle>(trimmed).map_err(|err| err.to_string())
    };
    match parsed {
        Ok(bundle) => validate_bundle(bundle),
        Err(message) => fail(vec![format!("无法解析导入数据：{message}")], 0, 0, 0),
    }
}

fn validate_bundle(bundle: ImportBundle) -> ImportReport {
    let mut errors = Vec::new();
    let stage_count = bundle.stages.len();
    let node_count = bundle.nodes.len();
    let relation_count = bundle.relations.len();
    push(&mut errors, check_id("学科", &bundle.subject.id));
    push(&mut errors, normalize_title(&bundle.subject.title).err());
    push(
        &mut errors,
        normalize_description(&bundle.subject.description).err(),
    );

    let mut stage_ids = HashSet::new();
    for stage in &bundle.stages {
        if !stage_ids.insert(stage.id.clone()) {
            push(&mut errors, Some(Error::DuplicateId(stage.id.clone())));
        }
        push(&mut errors, check_id("阶段", &stage.id));
        push(&mut errors, normalize_title(&stage.title).err());
        push(&mut errors, normalize_description(&stage.description).err());
        push(&mut errors, ensure_year_range(stage.start, stage.end).err());
        let _ = stage.order;
    }

    let mut node_ids = HashSet::new();
    for node in &bundle.nodes {
        if !node_ids.insert(node.id.clone()) {
            push(&mut errors, Some(Error::DuplicateId(node.id.clone())));
        }
        push(&mut errors, check_id("节点", &node.id));
        push(&mut errors, normalize_title(&node.title).err());
        push(
            &mut errors,
            normalize_list(node.tags.clone(), "标签", 32, 40).err(),
        );
        if let Some(stage) = blank_to_none(node.stage.clone()) {
            if !stage_ids.contains(&stage) {
                push(&mut errors, Some(Error::StageNotFound(stage)));
            }
        }
        let _ = node.node_type;
    }

    let links = bundle.nodes.iter().map(|node| {
        let parent = blank_to_none(node.parent.clone()).filter(|parent| node_ids.contains(parent));
        if let Some(raw) = blank_to_none(node.parent.clone()) {
            if !node_ids.contains(&raw) {
                push(&mut errors, Some(Error::ParentNotFound(raw)));
            }
        }
        (node.id.clone(), parent)
    });
    if let Some(id) = find_cycle(links) {
        push(&mut errors, Some(Error::Cycle(id)));
    }

    let mut relation_keys = HashSet::new();
    for relation in &bundle.relations {
        if let Some(id) = blank_to_none(relation.id.clone()) {
            push(&mut errors, check_id("关系", &id));
        }
        let from = relation.from.trim();
        let to = relation.to.trim();
        if from == to {
            push(&mut errors, Some(Error::SelfRelation));
        }
        if !node_ids.contains(from) {
            push(&mut errors, Some(Error::EndpointNotFound(from.to_string())));
        }
        if !node_ids.contains(to) {
            push(&mut errors, Some(Error::EndpointNotFound(to.to_string())));
        }
        let key = format!("{from}->{to}:{}", relation.relation_type.as_str());
        if !relation_keys.insert(key) {
            push(&mut errors, Some(Error::DuplicateRelation));
        }
    }

    ImportReport {
        ok: errors.is_empty(),
        errors,
        stage_count,
        node_count,
        relation_count,
    }
}

fn check_id(label: &str, id: &str) -> Option<Error> {
    validate_id(id)
        .err()
        .map(|err| Error::Invalid(format!("{label}{err}")))
}

fn push(errors: &mut Vec<String>, err: Option<Error>) {
    if errors.len() < 100 {
        if let Some(err) = err {
            errors.push(err.to_string());
        }
    }
}

fn fail(
    errors: Vec<String>,
    stage_count: usize,
    node_count: usize,
    relation_count: usize,
) -> ImportReport {
    ImportReport {
        ok: false,
        errors,
        stage_count,
        node_count,
        relation_count,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_the_checked_in_example_and_json() {
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../schemas/examples/computer-science.yaml");
        let text = std::fs::read_to_string(path).unwrap();
        let report = validate_import(&text);
        assert!(report.ok, "{:?}", report.errors);
        let json =
            r#"{"subject":{"id":"math","title":"数学"},"stages":[],"nodes":[],"relations":[]}"#;
        assert!(validate_import(json).ok);
    }

    #[test]
    fn reports_a_parent_cycle_without_writing() {
        let yaml = r#"
subject:
  id: demo
  title: Demo
nodes:
  - id: a
    title: A
    type: concept
    parent: b
  - id: b
    title: B
    type: concept
    parent: a
"#;
        let report = validate_import(yaml);
        assert!(!report.ok);
        assert!(report.errors.iter().any(|err| err.contains("环")));
    }
}
