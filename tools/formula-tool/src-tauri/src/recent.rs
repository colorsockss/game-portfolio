use crate::files::write_atomic;
use crate::project::RecentEntry;
use std::path::{Path, PathBuf};

const RECENT_FILE: &str = "recent.json";
const MAX_RECENT: usize = 20;

pub fn recent_path(config_dir: &Path) -> PathBuf {
    config_dir.join(RECENT_FILE)
}

pub fn load_recent(config_dir: &Path) -> Vec<RecentEntry> {
    // recent.json은 비핵심 편의 데이터다 — 파일이 없거나 손상돼도 앱을 막지 않고 빈 목록으로 되돌린다.
    let Ok(text) = std::fs::read_to_string(recent_path(config_dir)) else {
        return Vec::new();
    };
    serde_json::from_str(&text).unwrap_or_else(|e| {
        eprintln!("[recent] recent.json 파싱 실패, 목록을 초기화합니다: {e}");
        Vec::new()
    })
}

pub fn save_recent(config_dir: &Path, entries: &[RecentEntry]) -> Result<(), String> {
    std::fs::create_dir_all(config_dir)
        .map_err(|e| format!("설정 폴더 생성 실패: {e}"))?;
    let text = serde_json::to_string_pretty(entries)
        .map_err(|e| format!("직렬화 실패: {e}"))?;
    write_atomic(&recent_path(config_dir), text.as_bytes())
        .map_err(|e| format!("최근 목록 저장 실패: {e}"))
}

pub fn touch_recent(
    config_dir: &Path,
    path: &str,
    name: &str,
    now_ms: i64,
) -> Result<Vec<RecentEntry>, String> {
    let mut entries = load_recent(config_dir);
    entries.retain(|e| e.path != path);
    entries.insert(
        0,
        RecentEntry { path: path.to_string(), name: name.to_string(), last_opened: now_ms },
    );
    entries.truncate(MAX_RECENT);
    save_recent(config_dir, &entries)?;
    Ok(entries)
}

pub fn remove_recent(config_dir: &Path, path: &str) -> Result<Vec<RecentEntry>, String> {
    let mut entries = load_recent(config_dir);
    entries.retain(|e| e.path != path);
    save_recent(config_dir, &entries)?;
    Ok(entries)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn load_missing_returns_empty() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(load_recent(dir.path()), Vec::new());
    }

    #[test]
    fn touch_adds_entry_at_front() {
        let dir = tempfile::tempdir().unwrap();
        let list = touch_recent(dir.path(), "/a.json", "A", 100).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].path, "/a.json");
        assert_eq!(list[0].last_opened, 100);
    }

    #[test]
    fn touch_moves_existing_to_front_and_dedupes() {
        let dir = tempfile::tempdir().unwrap();
        touch_recent(dir.path(), "/a.json", "A", 100).unwrap();
        touch_recent(dir.path(), "/b.json", "B", 200).unwrap();
        let list = touch_recent(dir.path(), "/a.json", "A", 300).unwrap();
        assert_eq!(list.len(), 2);
        assert_eq!(list[0].path, "/a.json");
        assert_eq!(list[0].last_opened, 300);
        assert_eq!(list[1].path, "/b.json");
    }

    #[test]
    fn touch_caps_at_max() {
        let dir = tempfile::tempdir().unwrap();
        for i in 0..25 {
            touch_recent(dir.path(), &format!("/p{i}.json"), "P", i as i64).unwrap();
        }
        assert_eq!(load_recent(dir.path()).len(), MAX_RECENT);
    }

    #[test]
    fn remove_drops_matching_entry() {
        let dir = tempfile::tempdir().unwrap();
        touch_recent(dir.path(), "/a.json", "A", 100).unwrap();
        touch_recent(dir.path(), "/b.json", "B", 200).unwrap();
        let list = remove_recent(dir.path(), "/a.json").unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].path, "/b.json");
    }

    #[test]
    fn load_reads_what_was_saved() {
        let dir = tempfile::tempdir().unwrap();
        touch_recent(dir.path(), "/a.json", "A", 100).unwrap();
        let reloaded = load_recent(dir.path());
        assert_eq!(reloaded.len(), 1);
        assert_eq!(reloaded[0].name, "A");
    }

    #[test]
    fn remove_nonexistent_is_noop() {
        let dir = tempfile::tempdir().unwrap();
        touch_recent(dir.path(), "/a.json", "A", 100).unwrap();
        let list = remove_recent(dir.path(), "/nope.json").unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].path, "/a.json");
    }
}
