use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

pub const FORMAT_VERSION: u32 = 1;

/// An undo payload, not a new on-disk format. Keep IDs, timestamps and prose intact.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct NodeSnapshot {
    pub node: Node,
    pub document: String,
    pub relations: Vec<Relation>,
}

fn subject_type() -> String {
    "subject".to_string()
}

fn stage_type() -> String {
    "stage".to_string()
}

fn default_status() -> NodeStatus {
    NodeStatus::Active
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum NodeType {
    Concept,
    Technology,
    Person,
    Organization,
    Algorithm,
    Hardware,
    Software,
    Protocol,
    Theory,
    Standard,
    Event,
}

impl NodeType {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Concept => "concept",
            Self::Technology => "technology",
            Self::Person => "person",
            Self::Organization => "organization",
            Self::Algorithm => "algorithm",
            Self::Hardware => "hardware",
            Self::Software => "software",
            Self::Protocol => "protocol",
            Self::Theory => "theory",
            Self::Standard => "standard",
            Self::Event => "event",
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum NodeStatus {
    Draft,
    Active,
    Archived,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum RelationType {
    Predecessor,
    Successor,
    DerivedFrom,
    InspiredBy,
    DependsOn,
    Implements,
    Replaces,
    RelatedTo,
    Contains,
}

impl RelationType {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Predecessor => "predecessor",
            Self::Successor => "successor",
            Self::DerivedFrom => "derived_from",
            Self::InspiredBy => "inspired_by",
            Self::DependsOn => "depends_on",
            Self::Implements => "implements",
            Self::Replaces => "replaces",
            Self::RelatedTo => "related_to",
            Self::Contains => "contains",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Subject {
    #[serde(rename = "type", default = "subject_type")]
    pub record_type: String,
    // Missing version is the original schema-1 shape, subject to normal validation.
    #[serde(default = "legacy_format_version")]
    pub format_version: u32,
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub description: String,
    pub created: DateTime<Utc>,
    pub updated: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Stage {
    #[serde(rename = "type", default = "stage_type")]
    pub record_type: String,
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub description: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub start: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub end: Option<i32>,
    pub order: i32,
    pub created: DateTime<Utc>,
    pub updated: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Node {
    pub id: String,
    pub title: String,
    #[serde(rename = "type")]
    pub node_type: NodeType,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stage: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parent: Option<String>,
    pub created: DateTime<Utc>,
    pub updated: DateTime<Utc>,
    #[serde(default = "default_status")]
    pub status: NodeStatus,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub origin: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub inventor: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub organization: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub year: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub purpose: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub problem: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub solution: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub references: Vec<String>,
}

impl Node {
    pub fn draft(
        id: impl Into<String>,
        title: impl Into<String>,
        node_type: NodeType,
        parent: Option<String>,
        stage: Option<String>,
    ) -> Self {
        let now = Utc::now();
        Self {
            id: id.into(),
            title: title.into(),
            node_type,
            stage,
            parent,
            created: now,
            updated: now,
            status: NodeStatus::Active,
            tags: Vec::new(),
            origin: None,
            inventor: None,
            organization: None,
            year: None,
            purpose: None,
            problem: None,
            solution: None,
            references: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Relation {
    pub id: String,
    pub from: String,
    pub to: String,
    #[serde(rename = "type")]
    pub relation_type: RelationType,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
    pub created: DateTime<Utc>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct NewSubject {
    pub title: String,
    #[serde(default)]
    pub id: Option<String>,
    #[serde(default)]
    pub description: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct NewStage {
    pub title: String,
    #[serde(default)]
    pub id: Option<String>,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub start: Option<i32>,
    #[serde(default)]
    pub end: Option<i32>,
    #[serde(default)]
    pub order: Option<i32>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateStage {
    pub title: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub start: Option<i32>,
    #[serde(default)]
    pub end: Option<i32>,
    pub order: i32,
}

#[derive(Debug, Clone, Deserialize)]
pub struct NewNode {
    pub title: String,
    #[serde(default)]
    pub id: Option<String>,
    #[serde(rename = "type")]
    pub node_type: NodeType,
    #[serde(default)]
    pub stage: Option<String>,
    #[serde(default)]
    pub parent: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub origin: Option<String>,
    #[serde(default)]
    pub inventor: Option<String>,
    #[serde(default)]
    pub organization: Option<String>,
    #[serde(default)]
    pub year: Option<i32>,
    #[serde(default)]
    pub purpose: Option<String>,
    #[serde(default)]
    pub problem: Option<String>,
    #[serde(default)]
    pub solution: Option<String>,
    #[serde(default)]
    pub references: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateNode {
    pub title: String,
    #[serde(rename = "type")]
    pub node_type: NodeType,
    #[serde(default)]
    pub stage: Option<String>,
    #[serde(default)]
    pub parent: Option<String>,
    pub status: NodeStatus,
    #[serde(default)]
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateNodeFacts {
    #[serde(default)]
    pub origin: Option<String>,
    #[serde(default)]
    pub inventor: Option<String>,
    #[serde(default)]
    pub organization: Option<String>,
    #[serde(default)]
    pub year: Option<i32>,
    #[serde(default)]
    pub purpose: Option<String>,
    #[serde(default)]
    pub problem: Option<String>,
    #[serde(default)]
    pub solution: Option<String>,
    #[serde(default)]
    pub references: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct NewRelation {
    #[serde(default)]
    pub id: Option<String>,
    pub from: String,
    pub to: String,
    #[serde(rename = "type")]
    pub relation_type: RelationType,
    #[serde(default)]
    pub note: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct LayoutNode {
    pub id: String,
    pub title: String,
    #[serde(rename = "type")]
    pub node_type: NodeType,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stage: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parent: Option<String>,
    pub x: f64,
    pub y: f64,
    pub depth: u32,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct LayoutEdge {
    pub from: String,
    pub to: String,
    pub kind: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct TreeLayout {
    pub nodes: Vec<LayoutNode>,
    pub edges: Vec<LayoutEdge>,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct SearchHit {
    pub node_id: String,
    pub title: String,
    #[serde(rename = "type")]
    pub node_type: NodeType,
    pub field: String,
    pub snippet: String,
}

fn legacy_format_version() -> u32 {
    1
}
