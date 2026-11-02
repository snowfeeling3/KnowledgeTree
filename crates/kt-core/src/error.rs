use std::path::Path;

use thiserror::Error;

pub type Result<T> = std::result::Result<T, Error>;

#[derive(Debug, Error)]
pub enum Error {
    #[error("读写失败（{path}）：{source}")]
    Io {
        path: String,
        #[source]
        source: std::io::Error,
    },
    #[error("无法解析 {path}：{message}")]
    Parse { path: String, message: String },
    #[error("学科不存在：{0}")]
    SubjectNotFound(String),
    #[error("阶段不存在：{0}")]
    StageNotFound(String),
    #[error("节点不存在：{0}")]
    NodeNotFound(String),
    #[error("关系不存在：{0}")]
    RelationNotFound(String),
    #[error("无效的标识「{0}」。只允许以小写字母开头，包含小写字母、数字和单个连字符，长度不超过 64，且不能是 Windows 保留名")]
    InvalidId(String),
    #[error("标识已存在：{0}")]
    DuplicateId(String),
    #[error("标题不能为空")]
    EmptyTitle,
    #[error("上级节点不存在：{0}")]
    ParentNotFound(String),
    #[error("节点「{0}」的上级关系形成了环")]
    Cycle(String),
    #[error("阶段的起始年份不能晚于结束年份")]
    InvalidYearRange,
    #[error("关系端点不存在：{0}")]
    EndpointNotFound(String),
    #[error("关系的两端不能是同一个节点")]
    SelfRelation,
    #[error("相同的关系已存在")]
    DuplicateRelation,
    #[error("节点「{0}」仍有下级，请先处理下级节点")]
    HasChildren(String),
    #[error("不支持的知识库格式版本：{0}")]
    UnsupportedFormat(u32),
    #[error("文件类型不正确：{0}")]
    BadRecordType(String),
    #[error("{0}")]
    Invalid(String),
    #[error("Git 失败：{0}")]
    Git(String),
}

impl Error {
    pub(crate) fn io(path: &Path, source: std::io::Error) -> Self {
        Self::Io {
            path: path.display().to_string(),
            source,
        }
    }
}
