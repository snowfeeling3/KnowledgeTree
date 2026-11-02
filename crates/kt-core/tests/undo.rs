use kt_core::{Error, Library, NewNode, NewRelation, NewSubject, NodeType, RelationType};

fn node(id: &str, parent: Option<&str>) -> NewNode {
    NewNode {
        id: Some(id.into()),
        title: id.into(),
        node_type: NodeType::Hardware,
        parent: parent.map(Into::into),
        stage: None,
        tags: vec!["test".into()],
        origin: Some("origin".into()),
        inventor: Some("inventor".into()),
        organization: Some("organization".into()),
        year: Some(1971),
        purpose: Some("purpose".into()),
        problem: Some("problem".into()),
        solution: Some("solution".into()),
        references: vec!["reference".into()],
    }
}
fn store() -> (tempfile::TempDir, kt_core::SubjectStore) {
    let dir = tempfile::tempdir().unwrap();
    let lib = Library::open(dir.path()).unwrap();
    lib.create_subject(NewSubject {
        id: Some("test".into()),
        title: "Test".into(),
        description: "".into(),
    })
    .unwrap();
    let store = lib.open_subject("test").unwrap();
    (dir, store)
}

#[test]
fn delete_and_undo_restore_exact_identity_metadata_document_and_relations() {
    let (_dir, store) = store();
    store.create_node(node("cpu", None)).unwrap();
    store.create_node(node("alu", Some("cpu"))).unwrap();
    let relation = store
        .create_relation(NewRelation {
            id: Some("alu-cpu".into()),
            from: "alu".into(),
            to: "cpu".into(),
            relation_type: RelationType::DependsOn,
            note: Some("note".into()),
        })
        .unwrap();
    let markdown = "# 自定义 ALU\n\nUnicode 与 **Markdown**\n";
    store.write_document("alu", markdown).unwrap();
    let original = store.get_node("alu").unwrap();
    let snapshot = store.delete_node_undoable("alu").unwrap();
    assert!(matches!(store.get_node("alu"), Err(Error::NodeNotFound(_))));
    assert!(store.list_relations().unwrap().is_empty());
    assert_eq!(store.restore_node(snapshot).unwrap(), original);
    assert_eq!(store.read_document("alu").unwrap(), markdown);
    assert_eq!(store.list_relations().unwrap(), vec![relation]);
}

#[test]
fn restore_conflicts_never_overwrite_a_new_node_or_document() {
    let (_dir, store) = store();
    store.create_node(node("alu", None)).unwrap();
    let snapshot = store.delete_node_undoable("alu").unwrap();
    let replacement = store.create_node(node("alu", None)).unwrap();
    store.write_document("alu", "replacement").unwrap();
    assert!(matches!(
        store.restore_node(snapshot),
        Err(Error::DuplicateId(_))
    ));
    assert_eq!(store.get_node("alu").unwrap().title, replacement.title);
    assert_eq!(store.read_document("alu").unwrap(), "replacement");
}

#[test]
fn restore_preflights_missing_endpoints_and_delete_rejects_non_leaves() {
    let (_dir, store) = store();
    store.create_node(node("cpu", None)).unwrap();
    store.create_node(node("alu", Some("cpu"))).unwrap();
    assert!(matches!(
        store.delete_node_undoable("cpu"),
        Err(Error::HasChildren(_))
    ));
    store.create_node(node("peer", None)).unwrap();
    store
        .create_relation(NewRelation {
            id: Some("relation".into()),
            from: "alu".into(),
            to: "peer".into(),
            relation_type: RelationType::RelatedTo,
            note: None,
        })
        .unwrap();
    let snapshot = store.delete_node_undoable("alu").unwrap();
    store.delete_node("peer").unwrap();
    assert!(matches!(
        store.restore_node(snapshot),
        Err(Error::EndpointNotFound(_))
    ));
    assert!(matches!(store.get_node("alu"), Err(Error::NodeNotFound(_))));
}
