use serde::{Deserialize, Serialize};

pub const SCHEMA_VERSION: u32 = 3;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActorDefaults {
    pub caster: f64,
    pub target: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Stat {
    pub id: String,
    pub key: String,
    pub defaults: ActorDefaults,
    pub description: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Constant {
    pub id: String,
    pub key: String,
    pub value: f64,
    pub description: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Formula {
    pub id: String,
    pub key: String,
    pub expression: String,
    pub description: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ExportSettings {
    pub ability_type_import: String,
    // 아래 두 값은 TS 쪽(codegen)이 해석한다. 읽고 쓰는 동안 사라지지 않게 담아 두기만 한다.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub numeric: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub big_import: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewField {
    pub key: String,
    pub value: f64,
    pub description: String,
}

// 툴 안의 전투 미리보기를 돌리는 스크립트(프로젝트 파일 기준 경로)와 인자, 요청에 넣을 수. preview.rs가 node로 실행한다.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewSettings {
    pub script: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub args: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub fields: Vec<PreviewField>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub schema_version: u32,
    pub name: String,
    pub stats: Vec<Stat>,
    pub constants: Vec<Constant>,
    // 공식을 부르는 쪽이 넘기는 입력. 모양은 상수와 같다(value는 툴 시뮬레이션의 기본값).
    #[serde(default)]
    pub inputs: Vec<Constant>,
    pub formulas: Vec<Formula>,
    #[serde(default)]
    pub export_settings: ExportSettings,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub preview_settings: Option<PreviewSettings>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentEntry {
    pub path: String,
    pub name: String,
    pub last_opened: i64,
}

use crate::files::write_atomic;
use std::path::Path;

pub fn read_project_file(path: &Path) -> Result<Project, String> {
    let text = std::fs::read_to_string(path)
        .map_err(|e| format!("파일을 읽을 수 없습니다: {e}"))?;
    serde_json::from_str(&text)
        .map_err(|e| format!("프로젝트 파일 형식이 올바르지 않습니다: {e}"))
}

pub fn write_project_file(path: &Path, project: &Project) -> Result<(), String> {
    let text = serde_json::to_string_pretty(project)
        .map_err(|e| format!("직렬화 실패: {e}"))?;
    // 프로젝트 파일은 공식의 원본(예: idle/data/formulas.json)이므로, 저장이 중간에 끊겨도 이전 파일이 남게 한다.
    write_atomic(path, text.as_bytes())
        .map_err(|e| format!("파일을 저장할 수 없습니다: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn write_then_read_round_trips() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("p.json");
        let p = sample();
        write_project_file(&path, &p).unwrap();
        let back = read_project_file(&path).unwrap();
        assert_eq!(p, back);
    }

    #[test]
    fn write_produces_pretty_camel_case_json() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("p.json");
        write_project_file(&path, &sample()).unwrap();
        let text = std::fs::read_to_string(&path).unwrap();
        assert!(text.contains("\"schemaVersion\""));
        assert!(text.contains('\n'));
    }

    #[test]
    fn write_replaces_an_existing_project_without_leftovers() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("p.json");
        std::fs::write(&path, "x".repeat(10_000)).unwrap();
        write_project_file(&path, &sample()).unwrap();
        assert_eq!(read_project_file(&path).unwrap(), sample());
        assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 1);
    }

    #[test]
    fn read_missing_file_errors() {
        let dir = tempfile::tempdir().unwrap();
        assert!(read_project_file(&dir.path().join("nope.json")).is_err());
    }

    #[test]
    fn read_malformed_json_errors() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("bad.json");
        std::fs::write(&path, "{ not json").unwrap();
        assert!(read_project_file(&path).is_err());
    }

    fn sample() -> Project {
        Project {
            schema_version: SCHEMA_VERSION,
            name: "테스트".into(),
            stats: vec![Stat {
                id: "s1".into(),
                key: "atk".into(),
                defaults: ActorDefaults { caster: 10.0, target: 10.0 },
                description: "".into(),
            }],
            constants: vec![Constant {
                id: "c1".into(),
                key: "crit_mult".into(),
                value: 1.5,
                description: "".into(),
            }],
            inputs: vec![Constant {
                id: "i1".into(),
                key: "power".into(),
                value: 0.15,
                description: "".into(),
            }],
            formulas: vec![Formula {
                id: "f1".into(),
                key: "dmg".into(),
                expression: "caster.atk * 2".into(),
                description: "".into(),
            }],
            export_settings: ExportSettings::default(),
            preview_settings: Some(PreviewSettings {
                script: "../balance/run.mjs".into(),
                args: vec!["--preview".into()],
                fields: vec![PreviewField {
                    key: "seconds".into(),
                    value: 60.0,
                    description: "".into(),
                }],
            }),
        }
    }

    #[test]
    fn project_round_trips_through_json() {
        let p = sample();
        let json = serde_json::to_string(&p).unwrap();
        let back: Project = serde_json::from_str(&json).unwrap();
        assert_eq!(p, back);
    }

    #[test]
    fn project_json_uses_camel_case() {
        let json = serde_json::to_string(&sample()).unwrap();
        assert!(json.contains("\"schemaVersion\""));
        assert!(json.contains("\"defaults\""));
        assert!(json.contains("\"crit_mult\""));
    }

    #[test]
    fn project_without_export_settings_loads() {
        let json = r#"{"schemaVersion":2,"name":"p","stats":[],"constants":[],"formulas":[]}"#;
        let p: Project = serde_json::from_str(json).unwrap();
        assert_eq!(p.export_settings, ExportSettings::default());
        assert!(p.inputs.is_empty());
        assert_eq!(p.preview_settings, None);
    }

    #[test]
    fn inputs_and_preview_settings_survive_a_save() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("p.json");
        write_project_file(&path, &sample()).unwrap();
        let text = std::fs::read_to_string(&path).unwrap();
        assert!(text.contains("\"inputs\""));
        assert!(text.contains("\"previewSettings\""));
        assert_eq!(read_project_file(&path).unwrap(), sample());
    }

    #[test]
    fn export_numeric_settings_survive_a_save() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("p.json");
        let mut p = sample();
        p.export_settings = ExportSettings {
            ability_type_import: "./ability-type.js".into(),
            numeric: Some("big".into()),
            big_import: Some("@idle/big-number".into()),
        };
        write_project_file(&path, &p).unwrap();
        let text = std::fs::read_to_string(&path).unwrap();
        assert!(text.contains("\"numeric\": \"big\""));
        assert!(text.contains("\"bigImport\": \"@idle/big-number\""));
        assert_eq!(read_project_file(&path).unwrap(), p);
    }

    #[test]
    fn unset_export_numeric_settings_are_not_written() {
        let json = serde_json::to_string(&sample()).unwrap();
        assert!(!json.contains("numeric"));
        assert!(!json.contains("bigImport"));
    }

    #[test]
    fn recent_entry_round_trips() {
        let e = RecentEntry { path: "/tmp/p.json".into(), name: "p".into(), last_opened: 123 };
        let json = serde_json::to_string(&e).unwrap();
        let back: RecentEntry = serde_json::from_str(&json).unwrap();
        assert_eq!(e, back);
        assert!(json.contains("\"lastOpened\""));
    }
}
