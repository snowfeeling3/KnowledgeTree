use kt_core::{with_git_program, Library, NewNode, NewStage, NewSubject, NodeType};

fn open() -> (tempfile::TempDir, Library) {
    let dir = tempfile::tempdir().unwrap();
    let library = Library::open(dir.path()).unwrap();
    (dir, library)
}

fn node(title: &str, id: &str, parent: Option<&str>, stage: Option<&str>) -> NewNode {
    NewNode {
        title: title.into(),
        id: Some(id.into()),
        node_type: NodeType::Hardware,
        stage: stage.map(str::to_string),
        parent: parent.map(str::to_string),
        tags: vec![],
        origin: None,
        inventor: None,
        organization: None,
        year: None,
        purpose: None,
        problem: None,
        solution: None,
        references: vec![],
    }
}

#[test]
fn stage_timeline_orders_by_sequence_then_year() {
    let (_dir, library) = open();
    let subject = library
        .create_subject(NewSubject {
            title: "计算机科学".into(),
            id: Some("computer-science".into()),
            description: "".into(),
        })
        .unwrap();
    let store = library.open_subject(&subject.id).unwrap();
    for (title, id, start, order) in [
        ("集成电路", "ic", Some(1971), 1),
        ("未定年代", "undated", None, 1),
        ("电子管", "tube", Some(1945), 1),
        ("更早的起点", "origin", Some(1900), 0),
    ] {
        store
            .create_stage(NewStage {
                title: title.into(),
                id: Some(id.into()),
                description: "".into(),
                start,
                end: start,
                order: Some(order),
            })
            .unwrap();
    }
    let ids: Vec<_> = store
        .list_stages()
        .unwrap()
        .into_iter()
        .map(|stage| stage.id)
        .collect();
    assert_eq!(ids, ["origin", "tube", "ic", "undated"]);
}

#[test]
fn commits_record_structure_and_document_diff() {
    let (dir, library) = open();
    let subject = library
        .create_subject(NewSubject {
            title: "计算机科学".into(),
            id: Some("computer-science".into()),
            description: "".into(),
        })
        .unwrap();
    assert!(dir.path().join("computer-science/.git").is_dir());
    assert!(dir.path().join("computer-science/.gitignore").is_file());
    let store = library.open_subject(&subject.id).unwrap();
    store.create_node(node("CPU", "cpu", None, None)).unwrap();
    store
        .write_document("cpu", "# CPU\n\nCPU 是中央处理器。\n")
        .unwrap();

    let history = store.history(20);
    assert!(history.ready, "{}", history.note);
    assert!(history.note.is_empty(), "{}", history.note);
    assert!(history.entries.len() >= 3);
    assert!(history.entries[0].summary.contains("正文"));
    assert!(history
        .entries
        .iter()
        .any(|entry| entry.summary.contains("创建学科")));
    assert!(history
        .entries
        .iter()
        .any(|entry| entry.summary.contains("新增节点")));

    let diff = store.change_diff(&history.entries[0].hash).unwrap();
    assert!(diff
        .files
        .iter()
        .any(|file| file.path == "documents/cpu.md"));
    assert!(diff.patch.contains("中央处理器"));
    assert!(store.change_diff("not a hash").is_err());
    assert!(store.change_diff("--version").is_err());
}

#[test]
fn missing_git_keeps_files_and_a_later_commit_can_catch_up() {
    let (dir, library) = open();
    let subject = with_git_program("kt-git-missing", || {
        library
            .create_subject(NewSubject {
                title: "物理".into(),
                id: Some("physics".into()),
                description: "".into(),
            })
            .unwrap()
    });
    assert!(dir.path().join("physics/subject.yaml").is_file());
    assert!(!dir.path().join("physics/.git").exists());
    let store = library.open_subject(&subject.id).unwrap();
    let blocked = with_git_program("kt-git-missing", || store.history(5));
    assert!(!blocked.ready);
    assert!(blocked.note.contains("未找到 Git"));

    store
        .create_stage(NewStage {
            title: "经典力学".into(),
            id: Some("classical".into()),
            description: "".into(),
            start: Some(1687),
            end: None,
            order: Some(1),
        })
        .unwrap();
    let history = store.history(10);
    assert!(history.ready, "{}", history.note);
    assert!(history
        .entries
        .iter()
        .any(|entry| entry.summary.contains("经典力学")));
    let diff = store.change_diff(&history.entries[0].hash).unwrap();
    assert!(diff
        .files
        .iter()
        .any(|file| file.path == "subject.yaml" || file.path.ends_with("classical.yaml")));
}
