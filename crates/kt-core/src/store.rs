use std::cmp::Ordering;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

use chrono::Utc;
use serde::de::DeserializeOwned;
use serde::Serialize;

use crate::document::template_for;
use crate::error::{Error, Result};
use crate::graph::parent_link_is_cyclic;
use crate::id::{allocate_id, validate_id};
use crate::layout::layout_tree;
use crate::model::{
    NewNode, NewRelation, NewStage, NewSubject, Node, NodeSnapshot, NodeStatus, Relation,
    SearchHit, Stage, Subject, TreeLayout, UpdateNode, UpdateNodeFacts, UpdateStage,
    FORMAT_VERSION,
};
use crate::search::snippet_around;
use crate::text::{
    blank_to_none, ensure_year_range, normalize_description, normalize_list, normalize_note,
    normalize_optional, normalize_title,
};

#[derive(Debug, Clone)]
pub struct Library {
    root: PathBuf,
}

#[derive(Debug, Clone)]
pub struct SubjectStore {
    root: PathBuf,
}

impl Library {
    /// Open an existing root without creating any directories or records.
    pub fn open_existing(root: impl Into<PathBuf>) -> Result<Self> {
        let root = root.into();
        if !root.is_dir() {
            return Err(Error::Invalid("知识库目录不存在".into()));
        }
        let library = Self { root };
        library.list_subjects()?;
        Ok(library)
    }
    pub fn open(root: impl Into<PathBuf>) -> Result<Self> {
        let root = root.into();
        std::fs::create_dir_all(&root).map_err(|source| Error::io(&root, source))?;
        Ok(Self { root })
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn list_subjects(&self) -> Result<Vec<Subject>> {
        let mut subjects = Vec::new();
        let entries =
            std::fs::read_dir(&self.root).map_err(|source| Error::io(&self.root, source))?;
        for entry in entries {
            let path = entry
                .map_err(|source| Error::io(&self.root, source))?
                .path();
            if path.is_dir() && path.join("subject.yaml").is_file() {
                subjects.push(load_subject(&path)?);
            }
        }
        subjects.sort_by(|left, right| left.title.cmp(&right.title).then(left.id.cmp(&right.id)));
        Ok(subjects)
    }

    pub fn create_subject(&self, req: NewSubject) -> Result<Subject> {
        let title = normalize_title(&req.title)?;
        let description = normalize_description(&req.description)?;
        let used: HashSet<String> = self
            .list_subjects()?
            .into_iter()
            .map(|subject| subject.id)
            .collect();
        let preferred = blank_to_none(req.id);
        let id = allocate_id(&title, preferred.as_deref(), &used)?;
        let path = self.root.join(&id);
        if path.exists() {
            return Err(Error::DuplicateId(id));
        }
        if let Err(err) = write_new_subject(&path, &id, &title, &description) {
            let _ = std::fs::remove_dir_all(&path);
            return Err(err);
        }
        let subject = load_subject(&path)?;
        remember(&path, &format!("创建学科「{}」", subject.title));
        Ok(subject)
    }

    pub fn open_subject(&self, id: &str) -> Result<SubjectStore> {
        validate_id(id)?;
        let root = self.root.join(id);
        if !root.join("subject.yaml").is_file() {
            return Err(Error::SubjectNotFound(id.to_string()));
        }
        load_subject(&root)?;
        Ok(SubjectStore { root })
    }
}

impl SubjectStore {
    pub fn subject(&self) -> Result<Subject> {
        load_subject(&self.root)
    }

    pub fn list_stages(&self) -> Result<Vec<Stage>> {
        let mut stages = load_records::<Stage>(&self.root.join("stages"), "stage")?;
        stages.sort_by(|left, right| {
            left.order
                .cmp(&right.order)
                .then_with(|| cmp_year(left.start, right.start))
                .then_with(|| cmp_year(left.end, right.end))
                .then_with(|| left.title.cmp(&right.title))
                .then(left.id.cmp(&right.id))
        });
        Ok(stages)
    }

    pub fn create_stage(&self, req: NewStage) -> Result<Stage> {
        let title = normalize_title(&req.title)?;
        let description = normalize_description(&req.description)?;
        ensure_year_range(req.start, req.end)?;
        let stages = self.list_stages()?;
        let used: HashSet<String> = stages.iter().map(|stage| stage.id.clone()).collect();
        let id = allocate_id(&title, blank_to_none(req.id).as_deref(), &used)?;
        let order = req.order.unwrap_or_else(|| {
            stages
                .iter()
                .map(|stage| stage.order)
                .max()
                .unwrap_or(0)
                .saturating_add(1)
        });
        let now = Utc::now();
        let stage = Stage {
            record_type: "stage".to_string(),
            id: id.clone(),
            title,
            description,
            start: req.start,
            end: req.end,
            order,
            created: now,
            updated: now,
        };
        save_yaml(&self.root.join("stages").join(format!("{id}.yaml")), &stage)?;
        touch(&self.root)?;
        remember(&self.root, &format!("新增阶段「{}」", stage.title));
        Ok(stage)
    }

    pub fn update_stage(&self, id: &str, req: UpdateStage) -> Result<Stage> {
        validate_id(id)?;
        let path = self.stage_path(id);
        if !path.is_file() {
            return Err(Error::StageNotFound(id.to_string()));
        }
        let mut stage: Stage = load_yaml(&path)?;
        ensure_stem(&path, &stage.id)?;
        if stage.record_type != "stage" {
            return Err(Error::BadRecordType(stage.record_type));
        }
        stage.title = normalize_title(&req.title)?;
        stage.description = normalize_description(&req.description)?;
        ensure_year_range(req.start, req.end)?;
        stage.start = req.start;
        stage.end = req.end;
        stage.order = req.order;
        stage.updated = Utc::now();
        save_yaml(&path, &stage)?;
        touch(&self.root)?;
        remember(&self.root, &format!("更新阶段「{}」", stage.title));
        Ok(stage)
    }

    pub fn delete_stage(&self, id: &str) -> Result<()> {
        validate_id(id)?;
        let path = self.stage_path(id);
        if !path.is_file() {
            return Err(Error::StageNotFound(id.to_string()));
        }
        let title = load_yaml::<Stage>(&path)
            .map(|stage| stage.title)
            .unwrap_or_else(|_| id.to_string());
        if self
            .list_nodes()?
            .iter()
            .any(|node| node.stage.as_deref() == Some(id))
        {
            return Err(Error::Invalid(format!("阶段「{title}」仍被节点使用")));
        }
        std::fs::remove_file(&path).map_err(|source| Error::io(&path, source))?;
        touch(&self.root)?;
        remember(&self.root, &format!("删除阶段「{title}」"));
        Ok(())
    }

    pub fn list_nodes(&self) -> Result<Vec<Node>> {
        let mut nodes = load_records::<Node>(&self.root.join("nodes"), "node")?;
        nodes.sort_by(|left, right| left.title.cmp(&right.title).then(left.id.cmp(&right.id)));
        Ok(nodes)
    }

    pub fn get_node(&self, id: &str) -> Result<Node> {
        validate_id(id)?;
        let path = self.node_path(id);
        if !path.is_file() {
            return Err(Error::NodeNotFound(id.to_string()));
        }
        let node: Node = load_yaml(&path)?;
        ensure_stem(&path, &node.id)?;
        validate_id(&node.id)?;
        Ok(node)
    }

    pub fn create_node(&self, req: NewNode) -> Result<Node> {
        let title = normalize_title(&req.title)?;
        let nodes = self.list_nodes()?;
        let stages = self.list_stages()?;
        let used: HashSet<String> = nodes.iter().map(|node| node.id.clone()).collect();
        let id = allocate_id(&title, blank_to_none(req.id).as_deref(), &used)?;
        let parent = blank_to_none(req.parent);
        let stage = blank_to_none(req.stage);
        if let Some(parent_id) = &parent {
            validate_id(parent_id)?;
        }
        if let Some(stage_id) = &stage {
            validate_id(stage_id)?;
        }
        ensure_tree(&nodes, &id, parent.as_deref(), stage.as_deref(), &stages)?;
        let mut node = Node::draft(id.clone(), title, req.node_type, parent, stage);
        node.tags = normalize_list(req.tags, "标签", 32, 40)?;
        node.origin = normalize_optional(req.origin, "来源")?;
        node.inventor = normalize_optional(req.inventor, "发明者")?;
        node.organization = normalize_optional(req.organization, "组织")?;
        node.year = req.year;
        node.purpose = normalize_optional(req.purpose, "目的")?;
        node.problem = normalize_optional(req.problem, "问题")?;
        node.solution = normalize_optional(req.solution, "方案")?;
        node.references = normalize_list(req.references, "引用", 32, 300)?;
        node.status = NodeStatus::Active;
        save_yaml(&self.node_path(&id), &node)?;
        let doc = self.document_path(&id);
        if !doc.is_file() {
            write_atomic(&doc, template_for(&node.title, node.node_type).as_bytes())?;
        }
        touch(&self.root)?;
        remember(&self.root, &format!("新增节点「{}」", node.title));
        Ok(node)
    }

    pub fn update_node(&self, id: &str, req: UpdateNode) -> Result<Node> {
        let mut node = self.get_node(id)?;
        let nodes = self.list_nodes()?;
        let stages = self.list_stages()?;
        let parent = blank_to_none(req.parent);
        let stage = blank_to_none(req.stage);
        if let Some(parent_id) = &parent {
            validate_id(parent_id)?;
        }
        if let Some(stage_id) = &stage {
            validate_id(stage_id)?;
        }
        ensure_tree(&nodes, id, parent.as_deref(), stage.as_deref(), &stages)?;
        node.title = normalize_title(&req.title)?;
        node.node_type = req.node_type;
        node.parent = parent;
        node.stage = stage;
        node.status = req.status;
        node.tags = normalize_list(req.tags, "标签", 32, 40)?;
        node.updated = Utc::now();
        save_yaml(&self.node_path(id), &node)?;
        touch(&self.root)?;
        remember(&self.root, &format!("更新节点「{}」", node.title));
        Ok(node)
    }

    pub fn update_node_facts(&self, id: &str, req: UpdateNodeFacts) -> Result<Node> {
        let mut node = self.get_node(id)?;
        node.origin = normalize_optional(req.origin, "来源")?;
        node.inventor = normalize_optional(req.inventor, "发明者")?;
        node.organization = normalize_optional(req.organization, "组织")?;
        node.year = req.year;
        node.purpose = normalize_optional(req.purpose, "目的")?;
        node.problem = normalize_optional(req.problem, "问题")?;
        node.solution = normalize_optional(req.solution, "方案")?;
        node.references = normalize_list(req.references, "引用", 32, 300)?;
        node.updated = Utc::now();
        save_yaml(&self.node_path(id), &node)?;
        touch(&self.root)?;
        remember(&self.root, &format!("更新节点「{}」的属性", node.title));
        Ok(node)
    }

    pub fn delete_node(&self, id: &str) -> Result<()> {
        let node = self.get_node(id)?;
        if self
            .list_nodes()?
            .iter()
            .any(|node| node.parent.as_deref() == Some(id))
        {
            return Err(Error::HasChildren(id.to_string()));
        }
        for relation in self.list_relations()? {
            if relation.from == id || relation.to == id {
                let path = self.relation_path(&relation.id);
                std::fs::remove_file(&path).map_err(|source| Error::io(&path, source))?;
            }
        }
        let doc = self.document_path(id);
        if doc.exists() {
            std::fs::remove_file(&doc).map_err(|source| Error::io(&doc, source))?;
        }
        let path = self.node_path(id);
        std::fs::remove_file(&path).map_err(|source| Error::io(&path, source))?;
        touch(&self.root)?;
        remember(&self.root, &format!("删除节点「{}」", node.title));
        Ok(())
    }

    pub fn delete_node_undoable(&self, id: &str) -> Result<NodeSnapshot> {
        let snapshot = NodeSnapshot {
            node: self.get_node(id)?,
            document: self.read_document(id)?,
            relations: self
                .list_relations()?
                .into_iter()
                .filter(|relation| relation.from == id || relation.to == id)
                .collect(),
        };
        self.delete_node(id)?;
        Ok(snapshot)
    }

    pub fn restore_node(&self, snapshot: NodeSnapshot) -> Result<Node> {
        let node = snapshot.node;
        validate_id(&node.id)?;
        let nodes = self.list_nodes()?;
        let stages = self.list_stages()?;
        ensure_tree(
            &nodes,
            &node.id,
            node.parent.as_deref(),
            node.stage.as_deref(),
            &stages,
        )?;
        let mut paths = vec![self.node_path(&node.id), self.document_path(&node.id)];
        let existing = self.list_relations()?;
        let mut ids = HashSet::new();
        let mut keys = HashSet::new();
        for relation in &snapshot.relations {
            validate_id(&relation.id)?;
            validate_id(&relation.from)?;
            validate_id(&relation.to)?;
            if relation.from == relation.to {
                return Err(Error::SelfRelation);
            }
            if relation.from != node.id && relation.to != node.id {
                return Err(Error::Invalid("恢复快照包含无关关系".into()));
            }
            for endpoint in [&relation.from, &relation.to] {
                if endpoint != &node.id && !nodes.iter().any(|other| &other.id == endpoint) {
                    return Err(Error::EndpointNotFound(endpoint.clone()));
                }
            }
            if !ids.insert(&relation.id) {
                return Err(Error::DuplicateId(relation.id.clone()));
            }
            let key = (
                &relation.from,
                &relation.to,
                relation.relation_type.as_str(),
            );
            if !keys.insert(key)
                || existing.iter().any(|other| {
                    other.from == relation.from
                        && other.to == relation.to
                        && other.relation_type == relation.relation_type
                })
            {
                return Err(Error::DuplicateRelation);
            }
            paths.push(self.relation_path(&relation.id));
        }
        // Preflight every target before writing; never overwrite files created since deletion.
        if let Some(path) = paths.iter().find(|path| path.exists()) {
            return Err(Error::DuplicateId(
                path.file_stem()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .into(),
            ));
        }
        let result = (|| {
            save_yaml(&paths[0], &node)?;
            write_atomic(&paths[1], snapshot.document.as_bytes())?;
            for relation in &snapshot.relations {
                save_yaml(&self.relation_path(&relation.id), relation)?;
            }
            touch(&self.root)
        })();
        if let Err(error) = result {
            for path in paths {
                let _ = std::fs::remove_file(path);
            }
            return Err(error);
        }
        remember(&self.root, &format!("恢复节点「{}」", node.title));
        Ok(node)
    }

    pub fn list_relations(&self) -> Result<Vec<Relation>> {
        let mut relations = load_records::<Relation>(&self.root.join("relations"), "relation")?;
        relations.sort_by(|left, right| {
            left.from
                .cmp(&right.from)
                .then(left.to.cmp(&right.to))
                .then(
                    left.relation_type
                        .as_str()
                        .cmp(right.relation_type.as_str()),
                )
                .then(left.id.cmp(&right.id))
        });
        Ok(relations)
    }

    pub fn create_relation(&self, req: NewRelation) -> Result<Relation> {
        let from = req.from.trim();
        let to = req.to.trim();
        validate_id(from)?;
        validate_id(to)?;
        if from == to {
            return Err(Error::SelfRelation);
        }
        let nodes = self.list_nodes()?;
        if !nodes.iter().any(|node| node.id == from) {
            return Err(Error::EndpointNotFound(from.to_string()));
        }
        if !nodes.iter().any(|node| node.id == to) {
            return Err(Error::EndpointNotFound(to.to_string()));
        }
        let relations = self.list_relations()?;
        if relations.iter().any(|relation| {
            relation.from == from
                && relation.to == to
                && relation.relation_type == req.relation_type
        }) {
            return Err(Error::DuplicateRelation);
        }
        let used: HashSet<String> = relations
            .iter()
            .map(|relation| relation.id.clone())
            .collect();
        let id = allocate_id("rel", blank_to_none(req.id).as_deref(), &used)?;
        let relation = Relation {
            id: id.clone(),
            from: from.to_string(),
            to: to.to_string(),
            relation_type: req.relation_type,
            note: match blank_to_none(req.note) {
                Some(note) => Some(normalize_note(&note)?),
                None => None,
            },
            created: Utc::now(),
        };
        save_yaml(&self.relation_path(&id), &relation)?;
        touch(&self.root)?;
        let from_title = node_title(&nodes, from);
        let to_title = node_title(&nodes, to);
        remember(
            &self.root,
            &format!(
                "建立关系「{from_title}」{}「{to_title}」",
                relation.relation_type.as_str()
            ),
        );
        Ok(relation)
    }

    pub fn delete_relation(&self, id: &str) -> Result<()> {
        validate_id(id)?;
        let path = self.relation_path(id);
        if !path.is_file() {
            return Err(Error::RelationNotFound(id.to_string()));
        }
        let relation: Relation = load_yaml(&path)?;
        std::fs::remove_file(&path).map_err(|source| Error::io(&path, source))?;
        touch(&self.root)?;
        remember(
            &self.root,
            &format!("删除关系「{}」→「{}」", relation.from, relation.to),
        );
        Ok(())
    }

    pub fn read_document(&self, node_id: &str) -> Result<String> {
        let node = self.get_node(node_id)?;
        let path = self.document_path(node_id);
        if path.is_file() {
            return std::fs::read_to_string(&path).map_err(|source| Error::io(&path, source));
        }
        Ok(template_for(&node.title, node.node_type))
    }

    pub fn write_document(&self, node_id: &str, content: &str) -> Result<()> {
        let mut node = self.get_node(node_id)?;
        if content.chars().any(|ch| ch == '\0') {
            return Err(Error::Invalid("文档不能包含空字符".into()));
        }
        write_atomic(&self.document_path(node_id), content.as_bytes())?;
        node.updated = Utc::now();
        save_yaml(&self.node_path(node_id), &node)?;
        touch(&self.root)?;
        remember(&self.root, &format!("更新「{}」的正文", node.title));
        Ok(())
    }

    pub fn search(&self, query: &str) -> Result<Vec<SearchHit>> {
        let query = query.trim();
        if query.is_empty() {
            return Ok(Vec::new());
        }
        let needle = query.to_lowercase();
        let mut hits = Vec::new();
        for node in self.list_nodes()? {
            if hits.len() >= 50 {
                break;
            }
            if node.title.to_lowercase().contains(&needle)
                || node.id.to_lowercase().contains(&needle)
            {
                hits.push(hit(&node, "title", node.title.clone()));
                continue;
            }
            if let Some(tag) = node
                .tags
                .iter()
                .find(|tag| tag.to_lowercase().contains(&needle))
            {
                hits.push(hit(&node, "tag", tag.clone()));
                continue;
            }
            if let Some((field, snippet)) = fact_match(&node, &needle) {
                hits.push(hit(&node, field, snippet));
                continue;
            }
            let path = self.document_path(&node.id);
            if path.is_file() {
                let body =
                    std::fs::read_to_string(&path).map_err(|source| Error::io(&path, source))?;
                if let Some(snippet) = snippet_around(&body, &needle) {
                    hits.push(hit(&node, "body", snippet));
                }
            }
        }
        Ok(hits)
    }

    pub fn layout(&self) -> Result<TreeLayout> {
        layout_tree(
            &self.list_nodes()?,
            &self.list_stages()?,
            &self.list_relations()?,
        )
    }

    pub fn history(&self, limit: usize) -> crate::git::History {
        crate::git::history(&self.root, limit)
    }

    pub fn change_diff(&self, hash: &str) -> Result<crate::git::ChangeDiff> {
        crate::git::change_diff(&self.root, hash)
    }

    fn stage_path(&self, id: &str) -> PathBuf {
        self.root.join("stages").join(format!("{id}.yaml"))
    }

    fn node_path(&self, id: &str) -> PathBuf {
        self.root.join("nodes").join(format!("{id}.yaml"))
    }

    fn relation_path(&self, id: &str) -> PathBuf {
        self.root.join("relations").join(format!("{id}.yaml"))
    }

    fn document_path(&self, id: &str) -> PathBuf {
        self.root.join("documents").join(format!("{id}.md"))
    }
}

fn fact_match(node: &Node, needle: &str) -> Option<(&'static str, String)> {
    let labeled = [
        ("origin", node.origin.as_deref()),
        ("inventor", node.inventor.as_deref()),
        ("organization", node.organization.as_deref()),
        ("purpose", node.purpose.as_deref()),
        ("problem", node.problem.as_deref()),
        ("solution", node.solution.as_deref()),
    ];
    for (field, value) in labeled {
        if let Some(value) = value {
            if value.to_lowercase().contains(needle) {
                let snippet = snippet_around(value, needle).unwrap_or_else(|| value.to_string());
                return Some((field, snippet));
            }
        }
    }
    if let Some(year) = node.year {
        let text = year.to_string();
        if text.contains(needle) {
            return Some(("year", text));
        }
    }
    if let Some(item) = node
        .references
        .iter()
        .find(|item| item.to_lowercase().contains(needle))
    {
        let snippet = snippet_around(item, needle).unwrap_or_else(|| item.clone());
        return Some(("reference", snippet));
    }
    None
}

fn hit(node: &Node, field: &str, snippet: String) -> SearchHit {
    SearchHit {
        node_id: node.id.clone(),
        title: node.title.clone(),
        node_type: node.node_type,
        field: field.to_string(),
        snippet,
    }
}

fn node_title(nodes: &[Node], id: &str) -> String {
    nodes
        .iter()
        .find(|node| node.id == id)
        .map(|node| node.title.clone())
        .unwrap_or_else(|| id.to_string())
}

fn remember(root: &Path, message: &str) {
    crate::git::record(root, message);
}

fn cmp_year(left: Option<i32>, right: Option<i32>) -> Ordering {
    match (left, right) {
        (Some(left), Some(right)) => left.cmp(&right),
        (Some(_), None) => Ordering::Less,
        (None, Some(_)) => Ordering::Greater,
        (None, None) => Ordering::Equal,
    }
}

fn write_new_subject(path: &Path, id: &str, title: &str, description: &str) -> Result<()> {
    for dir in ["stages", "nodes", "relations", "documents", "assets"] {
        let dir_path = path.join(dir);
        std::fs::create_dir_all(&dir_path).map_err(|source| Error::io(&dir_path, source))?;
    }
    write_atomic(&path.join(".gitignore"), b"*.tmp-*\n*.bak-*\n")?;
    let now = Utc::now();
    let subject = Subject {
        record_type: "subject".to_string(),
        format_version: FORMAT_VERSION,
        id: id.to_string(),
        title: title.to_string(),
        description: description.to_string(),
        created: now,
        updated: now,
    };
    save_yaml(&path.join("subject.yaml"), &subject)
}

fn load_subject(root: &Path) -> Result<Subject> {
    let path = root.join("subject.yaml");
    let subject: Subject = load_yaml(&path)?;
    if subject.record_type != "subject" {
        return Err(Error::BadRecordType(subject.record_type));
    }
    if subject.format_version != FORMAT_VERSION {
        return Err(Error::UnsupportedFormat(subject.format_version));
    }
    let folder = root
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("");
    if subject.id != folder {
        return Err(Error::Invalid(format!(
            "学科目录 {folder} 与标识 {} 不一致",
            subject.id
        )));
    }
    validate_id(&subject.id)?;
    Ok(subject)
}

fn touch(root: &Path) -> Result<()> {
    let mut subject = load_subject(root)?;
    subject.updated = Utc::now();
    save_yaml(&root.join("subject.yaml"), &subject)
}

fn ensure_tree(
    nodes: &[Node],
    id: &str,
    parent: Option<&str>,
    stage: Option<&str>,
    stages: &[Stage],
) -> Result<()> {
    if let Some(stage_id) = stage {
        if !stages.iter().any(|item| item.id == stage_id) {
            return Err(Error::StageNotFound(stage_id.to_string()));
        }
    }
    let Some(parent) = parent else {
        return Ok(());
    };
    if !nodes.iter().any(|node| node.id == parent) {
        return Err(Error::ParentNotFound(parent.to_string()));
    }
    let mut parents = HashMap::new();
    for node in nodes {
        if node.id == id {
            continue;
        }
        if let Some(existing) = &node.parent {
            parents.insert(node.id.clone(), existing.clone());
        }
    }
    if parent_link_is_cyclic(id, parent, &parents) {
        return Err(Error::Cycle(id.to_string()));
    }
    Ok(())
}

fn load_records<T: DeserializeOwned>(dir: &Path, kind: &str) -> Result<Vec<T>> {
    let mut items = Vec::new();
    for path in yaml_files(dir)? {
        let value: T = load_yaml(&path)?;
        if kind == "stage" {
            let stage: Stage = load_yaml(&path)?;
            if stage.record_type != "stage" {
                return Err(Error::BadRecordType(stage.record_type));
            }
            ensure_stem(&path, &stage.id)?;
            validate_id(&stage.id)?;
            ensure_year_range(stage.start, stage.end)?;
        }
        if kind == "node" {
            let node: Node = load_yaml(&path)?;
            ensure_stem(&path, &node.id)?;
            validate_id(&node.id)?;
        }
        if kind == "relation" {
            let relation: Relation = load_yaml(&path)?;
            ensure_stem(&path, &relation.id)?;
            validate_id(&relation.id)?;
        }
        items.push(value);
    }
    Ok(items)
}

fn yaml_files(dir: &Path) -> Result<Vec<PathBuf>> {
    if !dir.exists() {
        return Ok(Vec::new());
    }
    let mut paths = Vec::new();
    for entry in std::fs::read_dir(dir).map_err(|source| Error::io(dir, source))? {
        let path = entry.map_err(|source| Error::io(dir, source))?.path();
        if path.extension().and_then(|ext| ext.to_str()) == Some("yaml") {
            paths.push(path);
        }
    }
    paths.sort();
    Ok(paths)
}

fn ensure_stem(path: &Path, id: &str) -> Result<()> {
    let stem = path
        .file_stem()
        .and_then(|name| name.to_str())
        .unwrap_or("");
    if stem != id {
        return Err(Error::Invalid(format!(
            "文件 {} 中的标识是 {id}，与文件名不一致",
            path.display()
        )));
    }
    Ok(())
}

fn load_yaml<T: DeserializeOwned>(path: &Path) -> Result<T> {
    let text = std::fs::read_to_string(path).map_err(|source| Error::io(path, source))?;
    serde_yaml::from_str(&text).map_err(|err| Error::Parse {
        path: path.display().to_string(),
        message: err.to_string(),
    })
}

fn save_yaml<T: Serialize>(path: &Path, value: &T) -> Result<()> {
    let mut serialized = serde_yaml::to_value(value).map_err(|err| Error::Parse {
        path: path.display().to_string(),
        message: err.to_string(),
    })?;
    // Preserve extension metadata, while still removing cleared optional known fields.
    if path.is_file() {
        let previous: serde_yaml::Value = load_yaml(path)?;
        if let (Some(old), Some(new)) = (previous.as_mapping(), serialized.as_mapping_mut()) {
            let known: &[&str] = match path
                .parent()
                .and_then(|p| p.file_name())
                .and_then(|s| s.to_str())
            {
                Some("nodes") => &[
                    "id",
                    "title",
                    "type",
                    "stage",
                    "parent",
                    "created",
                    "updated",
                    "status",
                    "tags",
                    "origin",
                    "inventor",
                    "organization",
                    "year",
                    "purpose",
                    "problem",
                    "solution",
                    "references",
                ],
                Some("stages") => &[
                    "type",
                    "id",
                    "title",
                    "description",
                    "start",
                    "end",
                    "order",
                    "created",
                    "updated",
                ],
                Some("relations") => &["id", "from", "to", "type", "note", "created"],
                _ => &[
                    "type",
                    "format_version",
                    "id",
                    "title",
                    "description",
                    "created",
                    "updated",
                ],
            };
            for (key, val) in old {
                if !key.as_str().is_some_and(|key| known.contains(&key)) && !new.contains_key(key) {
                    new.insert(key.clone(), val.clone());
                }
            }
        }
    }
    let text = serde_yaml::to_string(&serialized).map_err(|err| Error::Parse {
        path: path.display().to_string(),
        message: err.to_string(),
    })?;
    write_atomic(path, text.as_bytes())
}

fn write_atomic(path: &Path, bytes: &[u8]) -> Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|source| Error::io(parent, source))?;
    }
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("data");
    let tmp = path.with_file_name(format!("{file_name}.tmp-{}", std::process::id()));
    let bak = path.with_file_name(format!("{file_name}.bak-{}", std::process::id()));
    std::fs::write(&tmp, bytes).map_err(|source| Error::io(&tmp, source))?;
    if path.exists() {
        let _ = std::fs::remove_file(&bak);
        std::fs::rename(path, &bak).map_err(|source| Error::io(path, source))?;
    }
    if let Err(source) = std::fs::rename(&tmp, path) {
        if bak.exists() {
            let _ = std::fs::rename(&bak, path);
        }
        return Err(Error::io(path, source));
    }
    let _ = std::fs::remove_file(&bak);
    Ok(())
}
