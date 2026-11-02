use kt_core::{
    Library, NewNode, NewRelation, NewStage, NewSubject, NodeStatus, NodeType, RelationType,
    UpdateNode, UpdateNodeFacts, UpdateStage,
};

fn open() -> (tempfile::TempDir, Library) {
    let dir = tempfile::tempdir().unwrap();
    let library = Library::open(dir.path()).unwrap();
    (dir, library)
}

#[test]
fn success_path_keeps_structure_and_markdown_apart() {
    let (dir, library) = open();
    let subject = library
        .create_subject(NewSubject {
            title: "计算机科学".into(),
            id: Some("computer-science".into()),
            description: "演化中的学科".into(),
        })
        .unwrap();
    let store = library.open_subject(&subject.id).unwrap();
    store
        .create_stage(NewStage {
            title: "计算机组成时代".into(),
            id: Some("architecture".into()),
            description: "处理与存储开始分工".into(),
            start: Some(1945),
            end: Some(1980),
            order: Some(2),
        })
        .unwrap();
    store
        .create_node(NewNode {
            title: "计算机组成".into(),
            id: Some("computer-organization".into()),
            node_type: NodeType::Concept,
            stage: Some("architecture".into()),
            parent: None,
            tags: vec!["core".into()],
            origin: None,
            inventor: None,
            organization: None,
            year: None,
            purpose: None,
            problem: None,
            solution: None,
            references: vec![],
        })
        .unwrap();
    let cpu = store
        .create_node(NewNode {
            title: "CPU".into(),
            id: Some("cpu".into()),
            node_type: NodeType::Hardware,
            stage: Some("architecture".into()),
            parent: Some("computer-organization".into()),
            tags: vec![],
            origin: None,
            inventor: Some("工程团队".into()),
            organization: None,
            year: Some(1971),
            purpose: None,
            problem: None,
            solution: None,
            references: vec![],
        })
        .unwrap();
    store
        .create_node(NewNode {
            title: "ALU".into(),
            id: Some("alu".into()),
            node_type: NodeType::Hardware,
            stage: Some("architecture".into()),
            parent: Some("cpu".into()),
            tags: vec![],
            origin: None,
            inventor: None,
            organization: None,
            year: None,
            purpose: None,
            problem: None,
            solution: None,
            references: vec![],
        })
        .unwrap();
    store
        .create_node(NewNode {
            title: "Register".into(),
            id: Some("register".into()),
            node_type: NodeType::Hardware,
            stage: Some("architecture".into()),
            parent: Some("cpu".into()),
            tags: vec![],
            origin: None,
            inventor: None,
            organization: None,
            year: None,
            purpose: None,
            problem: None,
            solution: None,
            references: vec![],
        })
        .unwrap();
    store
        .create_relation(NewRelation {
            id: Some("cpu-contains-alu".into()),
            from: "cpu".into(),
            to: "alu".into(),
            relation_type: RelationType::Contains,
            note: None,
        })
        .unwrap();

    let document = store.read_document("cpu").unwrap();
    assert!(document.contains("# CPU"));
    assert!(document.contains("## Definition"));
    store
        .write_document("cpu", "# CPU\n\nCPU 是中央处理器。\n")
        .unwrap();
    let yaml = std::fs::read_to_string(dir.path().join("computer-science/nodes/cpu.yaml")).unwrap();
    assert!(!yaml.contains("中央处理器"));
    assert_eq!(
        store.read_document("cpu").unwrap(),
        "# CPU\n\nCPU 是中央处理器。\n"
    );

    let updated = store
        .update_node(
            "cpu",
            UpdateNode {
                title: "Central Processing Unit".into(),
                node_type: NodeType::Hardware,
                stage: Some("architecture".into()),
                parent: Some("computer-organization".into()),
                status: NodeStatus::Active,
                tags: vec!["processor".into()],
            },
        )
        .unwrap();
    assert_eq!(updated.inventor.as_deref(), Some("工程团队"));
    assert_eq!(cpu.id, "cpu");

    let layout = store.layout().unwrap();
    let pos = |id: &str| layout.nodes.iter().find(|node| node.id == id).unwrap();
    assert!(pos("computer-organization").x < pos("cpu").x && pos("cpu").x < pos("alu").x);
    assert!((pos("alu").y - pos("register").y).abs() >= 80.0);
    let hits = store.search("中央处理器").unwrap();
    assert_eq!(hits.len(), 1);
    assert_eq!(hits[0].field, "body");
}

#[test]
fn guards_identity_cycles_children_and_years() {
    let (_dir, library) = open();
    let generated = library
        .create_subject(NewSubject {
            title: "计算机科学".into(),
            id: None,
            description: "".into(),
        })
        .unwrap();
    assert!(generated.id.starts_with("n-"));
    assert!(library
        .create_subject(NewSubject {
            title: "保留名".into(),
            id: Some("con".into()),
            description: "".into(),
        })
        .unwrap_err()
        .to_string()
        .contains("无效的标识"));

    let store = library.open_subject(&generated.id).unwrap();
    assert!(store
        .create_stage(NewStage {
            title: "颠倒的年代".into(),
            id: Some("bad-years".into()),
            description: "".into(),
            start: Some(1990),
            end: Some(1950),
            order: None,
        })
        .is_err());
    store
        .create_node(NewNode {
            title: "A".into(),
            id: Some("node-a".into()),
            node_type: NodeType::Concept,
            stage: None,
            parent: None,
            tags: vec![],
            origin: None,
            inventor: None,
            organization: None,
            year: None,
            purpose: None,
            problem: None,
            solution: None,
            references: vec![],
        })
        .unwrap();
    store
        .create_node(NewNode {
            title: "B".into(),
            id: Some("node-b".into()),
            node_type: NodeType::Concept,
            stage: None,
            parent: Some("node-a".into()),
            tags: vec![],
            origin: None,
            inventor: None,
            organization: None,
            year: None,
            purpose: None,
            problem: None,
            solution: None,
            references: vec![],
        })
        .unwrap();
    assert!(store
        .delete_node("node-a")
        .unwrap_err()
        .to_string()
        .contains("下级"));
    assert!(store
        .update_node(
            "node-a",
            UpdateNode {
                title: "A".into(),
                node_type: NodeType::Concept,
                stage: None,
                parent: Some("node-b".into()),
                status: NodeStatus::Active,
                tags: vec![],
            },
        )
        .unwrap_err()
        .to_string()
        .contains("环"));
    assert!(store
        .create_relation(NewRelation {
            id: None,
            from: "node-a".into(),
            to: "node-a".into(),
            relation_type: RelationType::RelatedTo,
            note: None,
        })
        .is_err());
}

#[test]
fn stage_update_keeps_identity_and_used_stages_stay() {
    let (_dir, library) = open();
    let subject = library
        .create_subject(NewSubject {
            title: "计算机科学".into(),
            id: Some("computer-science".into()),
            description: "".into(),
        })
        .unwrap();
    let store = library.open_subject(&subject.id).unwrap();
    let created = store
        .create_stage(NewStage {
            title: "电子计算".into(),
            id: Some("electronic".into()),
            description: "最初的描述".into(),
            start: Some(1940),
            end: Some(1950),
            order: Some(3),
        })
        .unwrap();
    store
        .create_stage(NewStage {
            title: "存储程序".into(),
            id: Some("stored-program".into()),
            description: "".into(),
            start: Some(1945),
            end: None,
            order: Some(2),
        })
        .unwrap();
    let updated = store
        .update_stage(
            "electronic",
            UpdateStage {
                title: "电子计算时代".into(),
                description: "真空管计算机".into(),
                start: Some(1939),
                end: Some(1955),
                order: 1,
            },
        )
        .unwrap();
    assert_eq!(updated.id, created.id);
    assert_eq!(updated.created, created.created);
    assert_eq!(updated.title, "电子计算时代");
    assert_eq!(updated.order, 1);
    assert_eq!(store.list_stages().unwrap()[0].id, "electronic");
    assert!(store
        .update_stage(
            "electronic",
            UpdateStage {
                title: "颠倒".into(),
                description: "".into(),
                start: Some(2000),
                end: Some(1900),
                order: 1,
            },
        )
        .unwrap_err()
        .to_string()
        .contains("起始年份"));
    assert_eq!(store.list_stages().unwrap()[0].title, "电子计算时代");
    store
        .create_node(NewNode {
            title: "ENIAC".into(),
            id: Some("eniac".into()),
            node_type: NodeType::Hardware,
            stage: Some("electronic".into()),
            parent: None,
            tags: vec![],
            origin: None,
            inventor: None,
            organization: None,
            year: None,
            purpose: None,
            problem: None,
            solution: None,
            references: vec![],
        })
        .unwrap();
    assert!(store
        .delete_stage("electronic")
        .unwrap_err()
        .to_string()
        .contains("仍被节点使用"));
    assert_eq!(
        store.get_node("eniac").unwrap().stage.as_deref(),
        Some("electronic")
    );
}

#[test]
fn node_facts_stay_out_of_the_tree_and_the_markdown() {
    let (_dir, library) = open();
    let subject = library
        .create_subject(NewSubject {
            title: "Computer Science".into(),
            id: Some("computer-science".into()),
            description: "".into(),
        })
        .unwrap();
    let store = library.open_subject(&subject.id).unwrap();
    store
        .create_node(NewNode {
            title: "Organization".into(),
            id: Some("org".into()),
            node_type: NodeType::Concept,
            stage: None,
            parent: None,
            tags: vec![],
            origin: None,
            inventor: None,
            organization: None,
            year: None,
            purpose: None,
            problem: None,
            solution: None,
            references: vec![],
        })
        .unwrap();
    store
        .create_node(NewNode {
            title: "CPU".into(),
            id: Some("cpu".into()),
            node_type: NodeType::Hardware,
            stage: None,
            parent: Some("org".into()),
            tags: vec!["core".into()],
            origin: None,
            inventor: None,
            organization: None,
            year: None,
            purpose: None,
            problem: None,
            solution: None,
            references: vec![],
        })
        .unwrap();
    let document = "# CPU\n\nbody only\n";
    store.write_document("cpu", document).unwrap();
    let updated = store
        .update_node_facts(
            "cpu",
            UpdateNodeFacts {
                origin: Some("  ".into()),
                inventor: Some(" Engineering ".into()),
                organization: Some("Intel".into()),
                year: Some(1971),
                purpose: Some("execute instructions".into()),
                problem: None,
                solution: None,
                references: vec!["Intel 4004".into(), " ".into(), "Intel 4004".into()],
            },
        )
        .unwrap();
    assert_eq!(updated.title, "CPU");
    assert_eq!(updated.parent.as_deref(), Some("org"));
    assert_eq!(updated.tags, vec!["core".to_string()]);
    assert_eq!(updated.inventor.as_deref(), Some("Engineering"));
    assert_eq!(updated.origin, None);
    assert_eq!(updated.references, vec!["Intel 4004".to_string()]);
    assert_eq!(store.read_document("cpu").unwrap(), document);
    assert_eq!(store.search("Engineering").unwrap()[0].field, "inventor");
    assert_eq!(store.search("1971").unwrap()[0].field, "year");
    store
        .update_node(
            "cpu",
            UpdateNode {
                title: "Central Processor".into(),
                node_type: NodeType::Hardware,
                stage: None,
                parent: Some("org".into()),
                status: NodeStatus::Active,
                tags: vec!["core".into()],
            },
        )
        .unwrap();
    assert_eq!(
        store.get_node("cpu").unwrap().inventor.as_deref(),
        Some("Engineering")
    );
    store
        .update_node_facts(
            "cpu",
            UpdateNodeFacts {
                origin: None,
                inventor: None,
                organization: None,
                year: None,
                purpose: None,
                problem: None,
                solution: None,
                references: vec![],
            },
        )
        .unwrap();
    let cleared = store.get_node("cpu").unwrap();
    assert_eq!(cleared.title, "Central Processor");
    assert!(cleared.inventor.is_none());
    assert!(cleared.year.is_none());
    assert!(cleared.references.is_empty());
    assert!(store.search("Engineering").unwrap().is_empty());
    assert_eq!(store.read_document("cpu").unwrap(), document);
}

#[test]
fn complete_computer_science_roadmap_is_valid() {
    let report = kt_core::validate_import(include_str!("../../../schemas/examples/computer-science.json"));
    assert!(report.ok, "{:?}", report.errors);
    assert_eq!(report.node_count, 117);
    assert_eq!(report.stage_count, 0);
}

