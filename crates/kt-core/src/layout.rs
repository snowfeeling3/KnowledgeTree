use std::cmp::Ordering;
use std::collections::{HashMap, HashSet};

use crate::error::{Error, Result};
use crate::graph::parent_link_is_cyclic;
use crate::model::{LayoutEdge, LayoutNode, Node, Relation, Stage, TreeLayout};

const X_GAP: f64 = 240.0;
const Y_GAP: f64 = 84.0;
const PADDING: f64 = 56.0;
const MAX_DEPTH: u32 = 2048;

pub fn layout_tree(nodes: &[Node], stages: &[Stage], relations: &[Relation]) -> Result<TreeLayout> {
    if nodes.is_empty() {
        return Ok(TreeLayout {
            nodes: Vec::new(),
            edges: Vec::new(),
            width: 960.0,
            height: 540.0,
        });
    }

    let by_id: HashMap<&str, &Node> = nodes.iter().map(|node| (node.id.as_str(), node)).collect();
    let parents: HashMap<String, String> = nodes
        .iter()
        .filter_map(|node| node.parent.clone().map(|parent| (node.id.clone(), parent)))
        .collect();
    let mut children: HashMap<String, Vec<String>> = HashMap::new();
    let mut roots = Vec::new();
    for node in nodes {
        let parent = node
            .parent
            .as_deref()
            .filter(|parent| by_id.contains_key(parent));
        let cyclic = parent.is_some_and(|parent| parent_link_is_cyclic(&node.id, parent, &parents));
        if let Some(parent) = parent.filter(|_| !cyclic) {
            children
                .entry(parent.to_string())
                .or_default()
                .push(node.id.clone());
        } else {
            roots.push(node.id.clone());
        }
    }

    let stage_order: HashMap<&str, i32> = stages
        .iter()
        .map(|stage| (stage.id.as_str(), stage.order))
        .collect();
    let title = |id: &str| by_id.get(id).map(|node| node.title.as_str()).unwrap_or("");
    let rank = |id: &str| {
        by_id
            .get(id)
            .and_then(|node| node.stage.as_deref())
            .and_then(|stage| stage_order.get(stage).copied())
            .unwrap_or(i32::MAX)
    };
    for kids in children.values_mut() {
        kids.sort_by(|left, right| title(left).cmp(title(right)).then(left.cmp(right)));
    }
    roots.sort_by(|left, right| {
        rank(left)
            .cmp(&rank(right))
            .then(title(left).cmp(title(right)))
            .then(left.cmp(right))
    });

    let mut placed = HashMap::new();
    let mut y = PADDING;
    for root in &roots {
        y = place(root, 0, y, &children, &by_id, &mut placed)?;
    }

    let mut edges = Vec::new();
    let mut seen = HashSet::new();
    for node in nodes {
        if let Some(parent) = &node.parent {
            let linked = children
                .get(parent)
                .is_some_and(|kids| kids.iter().any(|id| id == &node.id));
            if linked && seen.insert((parent.clone(), node.id.clone())) {
                edges.push(LayoutEdge {
                    from: parent.clone(),
                    to: node.id.clone(),
                    kind: "parent".to_string(),
                });
            }
        }
    }
    for relation in relations {
        if !placed.contains_key(&relation.from) || !placed.contains_key(&relation.to) {
            continue;
        }
        if seen.insert((relation.from.clone(), relation.to.clone())) {
            edges.push(LayoutEdge {
                from: relation.from.clone(),
                to: relation.to.clone(),
                kind: relation.relation_type.as_str().to_string(),
            });
        }
    }

    let max_x = placed.values().map(|node| node.x).fold(0.0, f64::max);
    let max_y = placed.values().map(|node| node.y).fold(0.0, f64::max);
    let mut laid_out: Vec<_> = placed.into_values().collect();
    laid_out.sort_by(|left, right| {
        left.depth
            .cmp(&right.depth)
            .then(cmp_f64(left.y, right.y))
            .then(left.id.cmp(&right.id))
    });
    Ok(TreeLayout {
        nodes: laid_out,
        edges,
        width: max_x + 280.0,
        height: max_y + 120.0,
    })
}

fn place(
    id: &str,
    depth: u32,
    y_start: f64,
    children: &HashMap<String, Vec<String>>,
    by_id: &HashMap<&str, &Node>,
    placed: &mut HashMap<String, LayoutNode>,
) -> Result<f64> {
    if depth > MAX_DEPTH {
        return Err(Error::Invalid("知识树层级超过 2048，无法安全布局".into()));
    }
    let node = by_id
        .get(id)
        .copied()
        .ok_or_else(|| Error::NodeNotFound(id.to_string()))?;
    let kids = children.get(id).cloned().unwrap_or_default();
    let x = PADDING + f64::from(depth) * X_GAP;
    if kids.is_empty() {
        placed.insert(id.to_string(), layout_node(node, depth, x, y_start));
        return Ok(y_start + Y_GAP);
    }
    let mut cursor = y_start;
    let mut child_y = Vec::new();
    for child in kids {
        cursor = place(&child, depth + 1, cursor, children, by_id, placed)?;
        if let Some(pos) = placed.get(&child) {
            child_y.push(pos.y);
        }
    }
    let y = match (child_y.first(), child_y.last()) {
        (Some(first), Some(last)) => (first + last) / 2.0,
        _ => y_start,
    };
    placed.insert(id.to_string(), layout_node(node, depth, x, y));
    Ok(cursor)
}

fn layout_node(node: &Node, depth: u32, x: f64, y: f64) -> LayoutNode {
    LayoutNode {
        id: node.id.clone(),
        title: node.title.clone(),
        node_type: node.node_type,
        stage: node.stage.clone(),
        parent: node.parent.clone(),
        x,
        y,
        depth,
    }
}

fn cmp_f64(left: f64, right: f64) -> Ordering {
    left.partial_cmp(&right).unwrap_or(Ordering::Equal)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{NodeType, RelationType};

    #[test]
    fn siblings_do_not_share_a_row_and_parents_stay_left() {
        let nodes = vec![
            Node::draft(
                "org",
                "计算机组成",
                NodeType::Concept,
                None,
                Some("architecture".into()),
            ),
            Node::draft(
                "cpu",
                "CPU",
                NodeType::Hardware,
                Some("org".into()),
                Some("architecture".into()),
            ),
            Node::draft(
                "alu",
                "ALU",
                NodeType::Hardware,
                Some("cpu".into()),
                Some("architecture".into()),
            ),
            Node::draft(
                "register",
                "Register",
                NodeType::Hardware,
                Some("cpu".into()),
                Some("architecture".into()),
            ),
        ];
        let relations = vec![Relation {
            id: "rel-alu-register".into(),
            from: "alu".into(),
            to: "register".into(),
            relation_type: RelationType::RelatedTo,
            note: None,
            created: nodes[0].created,
        }];
        let layout = layout_tree(&nodes, &[], &relations).unwrap();
        let pos = |id: &str| layout.nodes.iter().find(|node| node.id == id).unwrap();
        assert!(pos("org").x < pos("cpu").x && pos("cpu").x < pos("alu").x);
        assert!((pos("alu").y - pos("register").y).abs() >= 80.0);
        assert!(layout.edges.iter().any(|edge| edge.kind == "related_to"));
        assert_eq!(
            layout
                .edges
                .iter()
                .filter(|edge| edge.from == "cpu" && edge.to == "alu")
                .count(),
            1
        );
    }
}
