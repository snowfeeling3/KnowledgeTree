use crate::model::NodeType;

pub fn template_for(title: &str, node_type: NodeType) -> String {
    let title = title.replace(['\n', '\r', '#'], " ");
    match node_type {
        NodeType::Person | NodeType::Organization => format!(
            "# {title}\n\n## Definition\n\n## Contribution\n\n## Organization\n\n## Historical Context\n\n## Related Technologies\n\n## References\n"
        ),
        _ => format!(
            "# {title}\n\n## Definition（定义）\n\n## Purpose（用途）\n\n## Problem（要解决的问题）\n\n## Core Concepts（核心概念）\n\n## Architecture（结构 / 工作原理）\n\n## Historical Development（历史发展）\n\n## Related Technologies（相关技术）\n\n## Inventor / Organization（发明者 / 组织）\n\n## References（参考资料）\n"
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn technical_template_matches_the_knowledge_leaf_headings() {
        let text = template_for("CPU", NodeType::Hardware);
        for heading in [
            "## Definition（定义）",
            "## Purpose（用途）",
            "## Problem（要解决的问题）",
            "## Core Concepts（核心概念）",
            "## Architecture（结构 / 工作原理）",
            "## Historical Development（历史发展）",
            "## Related Technologies（相关技术）",
            "## Inventor / Organization（发明者 / 组织）",
            "## References（参考资料）",
        ] {
            assert!(text.contains(heading), "{heading}");
        }
    }
}
