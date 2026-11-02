use kt_core::{
    ChangeDiff, History, NewNode, NewRelation, NewStage, NewSubject, Node, NodeSnapshot, Relation,
    SearchHit, Stage, Subject, TreeLayout, UpdateNode, UpdateNodeFacts, UpdateStage,
};
use tauri::State;

use crate::AppState;

fn run<T>(
    state: &AppState,
    action: impl FnOnce(&kt_core::Library) -> kt_core::Result<T>,
) -> Result<T, String> {
    let library = state
        .library
        .lock()
        .map_err(|_| "知识库锁已损坏".to_string())?;
    let active = library.active.as_ref().ok_or("知识库尚未连接")?;
    action(&active.library).map_err(|err| err.to_string())
}

fn run_write<T>(
    state: &AppState,
    action: impl FnOnce(&kt_core::Library) -> kt_core::Result<T>,
) -> Result<T, String> {
    let session = state
        .library
        .lock()
        .map_err(|_| "知识库锁已损坏".to_string())?;
    if session.frozen {
        return Err("正在安装更新，写入已暂停".into());
    }
    crate::library_session::reject_other_processes()?;
    let active = session.active.as_ref().ok_or("知识库尚未连接")?;
    action(&active.library).map_err(|err| err.to_string())
}

#[tauri::command]
pub fn library_root(state: State<AppState>) -> Result<String, String> {
    run(state.inner(), move |library| {
        Ok(library.root().display().to_string())
    })
}

#[tauri::command]
pub fn list_subjects(state: State<AppState>) -> Result<Vec<Subject>, String> {
    run(state.inner(), move |library| library.list_subjects())
}

#[tauri::command]
pub fn create_subject(
    state: State<AppState>,
    title: String,
    description: String,
    id: Option<String>,
) -> Result<Subject, String> {
    run_write(state.inner(), move |library| {
        library.create_subject(NewSubject {
            title,
            description,
            id,
        })
    })
}

#[tauri::command]
pub fn list_stages(state: State<AppState>, subject_id: String) -> Result<Vec<Stage>, String> {
    run(state.inner(), move |library| {
        library.open_subject(&subject_id)?.list_stages()
    })
}

#[tauri::command]
pub fn create_stage(
    state: State<AppState>,
    subject_id: String,
    stage: NewStage,
) -> Result<Stage, String> {
    run_write(state.inner(), move |library| {
        library.open_subject(&subject_id)?.create_stage(stage)
    })
}

#[tauri::command]
pub fn update_stage(
    state: State<AppState>,
    subject_id: String,
    stage_id: String,
    stage: UpdateStage,
) -> Result<Stage, String> {
    run_write(state.inner(), move |library| {
        library
            .open_subject(&subject_id)?
            .update_stage(&stage_id, stage)
    })
}

#[tauri::command]
pub fn delete_stage(
    state: State<AppState>,
    subject_id: String,
    stage_id: String,
) -> Result<(), String> {
    run_write(state.inner(), move |library| {
        library.open_subject(&subject_id)?.delete_stage(&stage_id)
    })
}

#[tauri::command]
pub fn list_nodes(state: State<AppState>, subject_id: String) -> Result<Vec<Node>, String> {
    run(state.inner(), move |library| {
        library.open_subject(&subject_id)?.list_nodes()
    })
}

#[tauri::command]
pub fn create_node(
    state: State<AppState>,
    subject_id: String,
    node: NewNode,
) -> Result<Node, String> {
    run_write(state.inner(), move |library| {
        library.open_subject(&subject_id)?.create_node(node)
    })
}

#[tauri::command]
pub fn update_node(
    state: State<AppState>,
    subject_id: String,
    node_id: String,
    node: UpdateNode,
) -> Result<Node, String> {
    run_write(state.inner(), move |library| {
        library
            .open_subject(&subject_id)?
            .update_node(&node_id, node)
    })
}

#[tauri::command]
pub fn update_node_facts(
    state: State<AppState>,
    subject_id: String,
    node_id: String,
    facts: UpdateNodeFacts,
) -> Result<Node, String> {
    run_write(state.inner(), move |library| {
        library
            .open_subject(&subject_id)?
            .update_node_facts(&node_id, facts)
    })
}

#[tauri::command]
pub fn delete_node(
    state: State<AppState>,
    subject_id: String,
    node_id: String,
) -> Result<(), String> {
    run_write(state.inner(), move |library| {
        library.open_subject(&subject_id)?.delete_node(&node_id)
    })
}

#[tauri::command]
pub fn list_relations(state: State<AppState>, subject_id: String) -> Result<Vec<Relation>, String> {
    run(state.inner(), move |library| {
        library.open_subject(&subject_id)?.list_relations()
    })
}

#[tauri::command]
pub fn delete_node_undoable(
    state: State<AppState>,
    subject_id: String,
    node_id: String,
) -> Result<NodeSnapshot, String> {
    run_write(state.inner(), move |library| {
        library
            .open_subject(&subject_id)?
            .delete_node_undoable(&node_id)
    })
}

#[tauri::command]
pub fn restore_node(
    state: State<AppState>,
    subject_id: String,
    snapshot: NodeSnapshot,
) -> Result<Node, String> {
    run_write(state.inner(), move |library| {
        library.open_subject(&subject_id)?.restore_node(snapshot)
    })
}

#[tauri::command]
pub fn create_relation(
    state: State<AppState>,
    subject_id: String,
    relation: NewRelation,
) -> Result<Relation, String> {
    run_write(state.inner(), move |library| {
        library.open_subject(&subject_id)?.create_relation(relation)
    })
}

#[tauri::command]
pub fn delete_relation(
    state: State<AppState>,
    subject_id: String,
    relation_id: String,
) -> Result<(), String> {
    run_write(state.inner(), move |library| {
        library
            .open_subject(&subject_id)?
            .delete_relation(&relation_id)
    })
}

#[tauri::command]
pub fn read_document(
    state: State<AppState>,
    subject_id: String,
    node_id: String,
) -> Result<String, String> {
    run(state.inner(), move |library| {
        library.open_subject(&subject_id)?.read_document(&node_id)
    })
}

#[tauri::command]
pub fn write_document(
    state: State<AppState>,
    subject_id: String,
    node_id: String,
    content: String,
) -> Result<(), String> {
    run_write(state.inner(), move |library| {
        library
            .open_subject(&subject_id)?
            .write_document(&node_id, &content)
    })
}

#[tauri::command]
pub fn search_nodes(
    state: State<AppState>,
    subject_id: String,
    query: String,
) -> Result<Vec<SearchHit>, String> {
    run(state.inner(), move |library| {
        library.open_subject(&subject_id)?.search(&query)
    })
}

#[tauri::command]
pub fn layout_subject(state: State<AppState>, subject_id: String) -> Result<TreeLayout, String> {
    run(state.inner(), move |library| {
        library.open_subject(&subject_id)?.layout()
    })
}

#[tauri::command]
pub fn subject_history(
    state: State<AppState>,
    subject_id: String,
    limit: Option<u32>,
) -> Result<History, String> {
    run(state.inner(), move |library| {
        Ok(library
            .open_subject(&subject_id)?
            .history(limit.unwrap_or(30) as usize))
    })
}

#[tauri::command]
pub fn subject_diff(
    state: State<AppState>,
    subject_id: String,
    hash: String,
) -> Result<ChangeDiff, String> {
    run(state.inner(), move |library| {
        library.open_subject(&subject_id)?.change_diff(&hash)
    })
}

#[tauri::command]
pub fn validate_import(text: String) -> kt_core::ImportReport {
    kt_core::validate_import(&text)
}
