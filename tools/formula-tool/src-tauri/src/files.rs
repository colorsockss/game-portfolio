use std::ffi::OsString;
use std::fs::{self, File, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

// 같은 파일을 동시에 저장해도 서로의 임시 파일을 덮지 않게 이름에 붙이는 일련번호.
static NEXT_TEMP: AtomicU64 = AtomicU64::new(0);

/// `path`의 내용을 `contents`로 통째로 바꾼다. 같은 폴더의 임시 파일에 다 쓰고 디스크에 내린 뒤
/// rename으로 바꾸므로, 도중에 실패하거나 앱이 죽어도 `path`에는 이전 내용이나 새 내용만 남는다.
/// `std::fs::write`는 기존 파일을 먼저 비우고 쓰므로 쓰다 멈추면 빈 파일이나 잘린 파일이 남는다.
pub fn write_atomic(path: &Path, contents: &[u8]) -> io::Result<()> {
    replace_with(path, |file| file.write_all(contents))
}

fn replace_with(path: &Path, write: impl FnOnce(&mut File) -> io::Result<()>) -> io::Result<()> {
    let temp = temp_path(path)?;
    let mut file = OpenOptions::new().write(true).create_new(true).open(&temp)?;
    let written = write(&mut file).and_then(|()| file.sync_all());
    drop(file);
    let result = written.and_then(|()| fs::rename(&temp, path));
    if result.is_err() {
        let _ = fs::remove_file(&temp);
    }
    result
}

// rename은 같은 파일 시스템 안에서만 원자적이므로 임시 파일은 대상과 같은 폴더에 둔다.
fn temp_path(path: &Path) -> io::Result<PathBuf> {
    let name = path.file_name().ok_or_else(|| {
        io::Error::new(io::ErrorKind::InvalidInput, format!("파일 경로가 아닙니다: {}", path.display()))
    })?;
    let mut temp = OsString::from(".");
    temp.push(name);
    temp.push(format!(".{}.{}.tmp", std::process::id(), NEXT_TEMP.fetch_add(1, Ordering::Relaxed)));
    Ok(path.with_file_name(temp))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entries(dir: &Path) -> Vec<String> {
        let mut names: Vec<String> = fs::read_dir(dir)
            .unwrap()
            .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        names.sort();
        names
    }

    #[test]
    fn creates_a_file_that_did_not_exist() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("p.json");
        write_atomic(&path, b"new").unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "new");
        assert_eq!(entries(dir.path()), vec!["p.json"]);
    }

    #[test]
    fn replaces_the_whole_file_and_leaves_no_temp_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("p.json");
        fs::write(&path, "a longer previous content").unwrap();
        write_atomic(&path, b"new").unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "new");
        assert_eq!(entries(dir.path()), vec!["p.json"]);
    }

    #[test]
    fn a_write_that_fails_halfway_keeps_the_previous_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("p.json");
        fs::write(&path, "previous").unwrap();
        let result = replace_with(&path, |file| {
            file.write_all(b"half")?;
            Err(io::Error::new(io::ErrorKind::Other, "디스크가 가득 찼다"))
        });
        assert!(result.is_err());
        assert_eq!(fs::read_to_string(&path).unwrap(), "previous");
        assert_eq!(entries(dir.path()), vec!["p.json"]);
    }

    #[test]
    fn a_missing_folder_fails_without_leaving_anything() {
        let dir = tempfile::tempdir().unwrap();
        assert!(write_atomic(&dir.path().join("missing").join("p.json"), b"new").is_err());
        assert!(entries(dir.path()).is_empty());
    }
}
