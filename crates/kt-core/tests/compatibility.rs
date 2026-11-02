use kt_core::{Library, NewSubject};

#[test]
fn legacy_schema_is_read_without_modification_and_future_schema_is_rejected() {
    let dir = tempfile::tempdir().unwrap();
    let library = Library::open(dir.path()).unwrap();
    library
        .create_subject(NewSubject {
            title: "旧库".into(),
            description: "".into(),
            id: Some("legacy".into()),
        })
        .unwrap();
    let path = dir.path().join("legacy/subject.yaml");
    let text = std::fs::read_to_string(&path)
        .unwrap()
        .replace("format_version: 1\n", "");
    std::fs::write(&path, &text).unwrap();
    assert_eq!(
        Library::open_existing(dir.path())
            .unwrap()
            .list_subjects()
            .unwrap()[0]
            .format_version,
        1
    );
    assert_eq!(std::fs::read_to_string(&path).unwrap(), text);
    let future = format!("{text}format_version: 99\n");
    std::fs::write(&path, &future).unwrap();
    assert!(Library::open_existing(dir.path()).is_err());
    assert_eq!(std::fs::read_to_string(path).unwrap(), future);
}

#[test]
fn unknown_subject_metadata_survives_document_and_structure_updates() {
    let dir = tempfile::tempdir().unwrap();
    let library = Library::open(dir.path()).unwrap();
    library
        .create_subject(NewSubject {
            title: "测试".into(),
            description: "".into(),
            id: Some("test".into()),
        })
        .unwrap();
    let path = dir.path().join("test/subject.yaml");
    let mut text = std::fs::read_to_string(&path).unwrap();
    text.push_str("extension:\n  author: 用户\n  custom: [1, 2]\n");
    std::fs::write(&path, text).unwrap();
    let store = library.open_subject("test").unwrap();
    store
        .create_stage(kt_core::NewStage {
            title: "阶段".into(),
            description: "".into(),
            id: None,
            start: None,
            end: None,
            order: None,
        })
        .unwrap();
    let value: serde_yaml::Value =
        serde_yaml::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
    assert_eq!(value["extension"]["author"].as_str(), Some("用户"));
}
