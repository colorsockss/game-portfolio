use crate::project::{
    read_project_file, write_project_file, ExportSettings, PreviewSettings, Project, RecentEntry,
    SCHEMA_VERSION,
};
use crate::files::write_atomic;
use crate::preview::run_preview_script;
use crate::recent::{load_recent, remove_recent, touch_recent};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

fn config_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map_err(|e| format!("설정 폴더를 찾을 수 없습니다: {e}"))
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis().try_into().unwrap_or(i64::MAX))
        .unwrap_or(0)
}

// 최근 목록은 편의 데이터다 — 갱신에 실패해도 주 작업(파일 입출력)을 실패로 만들지 않고 로그만 남긴다.
fn record_recent(app: &AppHandle, path: &str, name: &str) {
    match config_dir(app) {
        Ok(dir) => {
            if let Err(e) = touch_recent(&dir, path, name, now_ms()) {
                eprintln!("[recent] 최근 목록 갱신 실패, 무시합니다: {e}");
            }
        }
        Err(e) => eprintln!("[recent] 설정 폴더 해석 실패, 무시합니다: {e}"),
    }
}

#[tauri::command]
pub fn create_project(app: AppHandle, path: String, name: String) -> Result<Project, String> {
    let project = Project {
        schema_version: SCHEMA_VERSION,
        name,
        stats: Vec::new(),
        constants: Vec::new(),
        inputs: Vec::new(),
        formulas: Vec::new(),
        export_settings: ExportSettings::default(),
        preview_settings: None,
    };
    write_project_file(Path::new(&path), &project)?;
    record_recent(&app, &path, &project.name);
    Ok(project)
}

#[tauri::command]
pub fn read_project(app: AppHandle, path: String) -> Result<Project, String> {
    let project = read_project_file(Path::new(&path))?;
    record_recent(&app, &path, &project.name);
    Ok(project)
}

#[tauri::command]
pub fn write_project(app: AppHandle, path: String, project: Project) -> Result<(), String> {
    write_project_file(Path::new(&path), &project)?;
    record_recent(&app, &path, &project.name);
    Ok(())
}

#[tauri::command]
pub fn list_recent_projects(app: AppHandle) -> Result<Vec<RecentEntry>, String> {
    Ok(load_recent(&config_dir(&app)?))
}

#[tauri::command]
pub fn remove_recent_project(app: AppHandle, path: String) -> Result<Vec<RecentEntry>, String> {
    remove_recent(&config_dir(&app)?, &path)
}

#[tauri::command]
pub fn write_text_file(path: String, contents: String) -> Result<(), String> {
    write_atomic(Path::new(&path), contents.as_bytes())
        .map_err(|e| format!("파일을 저장할 수 없습니다: {e}"))
}

// 전투 미리보기. 스크립트가 0.1초 넘게 걸리므로 화면이 멈추지 않게 작업 스레드에서 기다린다.
#[tauri::command]
pub async fn run_preview(
    project_path: String,
    settings: PreviewSettings,
    request: String,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let dir = Path::new(&project_path)
            .parent()
            .ok_or_else(|| "프로젝트 폴더를 찾을 수 없습니다".to_string())?;
        run_preview_script(dir, &settings, &request)
    })
    .await
    .map_err(|e| format!("미리보기 작업이 끝나지 않았습니다: {e}"))?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn write_text_file_writes_contents() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("out.ts");
        write_text_file(path.to_string_lossy().into_owned(), "hello".into()).unwrap();
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "hello");
    }
}
