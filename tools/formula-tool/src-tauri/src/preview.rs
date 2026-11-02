use crate::project::PreviewSettings;
use std::io::Write;
use std::path::Path;
use std::process::{Command, Stdio};

// 툴은 게임 코드를 모르므로 미리보기는 프로젝트가 가리키는 스크립트가 계산한다(idle/data/formulas.json이면
// idle/balance/run.mjs --preview). 요청 JSON을 표준 입력으로 주고, 성공하면 표준 출력을, 실패하면 표준 오류를 돌려준다.
// 요청마다 프로세스를 새로 띄우므로 상태가 남지 않고, 게임 코드를 고친 뒤에도 툴을 다시 켤 필요가 없다.
pub fn run_preview_script(
    dir: &Path,
    settings: &PreviewSettings,
    request: &str,
) -> Result<String, String> {
    let mut child = Command::new("node")
        .arg(&settings.script)
        .args(&settings.args)
        .current_dir(dir)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("node를 실행할 수 없습니다 (PATH에 node가 있어야 합니다): {e}"))?;
    // 스크립트는 표준 입력을 다 읽은 뒤에 쓰므로 먼저 다 쓰고 닫아도 막히지 않는다.
    let written = child
        .stdin
        .take()
        .map(|mut stdin| stdin.write_all(request.as_bytes()));
    let output = child
        .wait_with_output()
        .map_err(|e| format!("미리보기 스크립트를 기다리지 못했습니다: {e}"))?;
    if output.status.success() {
        if let Some(Err(e)) = written {
            return Err(format!("요청을 보내지 못했습니다: {e}"));
        }
        return Ok(String::from_utf8_lossy(&output.stdout).into_owned());
    }
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    Err(if stderr.is_empty() {
        format!("미리보기 스크립트가 실패했습니다 ({})", output.status)
    } else {
        stderr
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn script(dir: &Path, body: &str) -> PreviewSettings {
        std::fs::write(dir.join("preview.mjs"), body).unwrap();
        PreviewSettings {
            script: "preview.mjs".into(),
            args: vec!["--preview".into()],
            fields: vec![],
        }
    }

    #[test]
    fn answers_with_the_scripts_stdout_for_the_request_on_stdin() {
        let dir = tempfile::tempdir().unwrap();
        let settings = script(
            dir.path(),
            "let s = ''; for await (const c of process.stdin) s += c;\n\
             process.stdout.write(JSON.stringify({ args: process.argv.slice(2), got: JSON.parse(s) }));",
        );
        let out = run_preview_script(dir.path(), &settings, r#"{"seconds":60}"#).unwrap();
        assert_eq!(out, r#"{"args":["--preview"],"got":{"seconds":60}}"#);
    }

    #[test]
    fn a_failing_script_gives_its_stderr() {
        let dir = tempfile::tempdir().unwrap();
        let settings = script(dir.path(), "console.error('Stage 999 does not exist.'); process.exit(1);");
        assert_eq!(
            run_preview_script(dir.path(), &settings, "{}").unwrap_err(),
            "Stage 999 does not exist."
        );
    }

    #[test]
    fn a_missing_script_fails() {
        let dir = tempfile::tempdir().unwrap();
        let settings = PreviewSettings {
            script: "nope.mjs".into(),
            args: vec![],
            fields: vec![],
        };
        assert!(run_preview_script(dir.path(), &settings, "{}").is_err());
    }
}
