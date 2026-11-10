// 저장 DB의 사본. 서버가 시작할 때와 그 뒤로 주기마다 불러, 하루(UTC)에 하나씩 DB 옆의 backup/에 남긴다(main.ts). 망가진 DB,
// 잘못된 마이그레이션, 실수로 지운 파일에서 그날 0시(UTC) 뒤 첫 사본으로 돌아갈 수 있다.
// shortcut: 사본이 DB와 같은 디스크에 있어 디스크나 VPS를 잃으면 함께 사라진다. 계정을 잃으면 안 되는 규모가 되면 다른 곳으로도
// 복사한다(예: 개발 기기가 주기적으로 rsync로 가져감).
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

/** 남겨 두는 사본의 수. 하루에 하나라서 그만큼의 날이다. */
export const BACKUPS_KEPT = 7;

// 사본의 이름: game-2026-11-10.sqlite. 이름순이 곧 날짜순이다.
const BACKUP = /^game-\d{4}-\d{2}-\d{2}\.sqlite$/;

/**
 * `now`가 속한 날(UTC)의 사본이 `directory`에 없으면 만들고, 가장 새 BACKUPS_KEPT개만 남긴다. 만들었으면 그 경로, 그날의 사본이
 * 이미 있거나 DB 파일이 아직 없으면 undefined다. 사본은 임시 이름으로 다 쓴 뒤 이름을 바꾸므로 쓰다 만 파일이 사본으로 남지 않는다.
 *
 * 사본은 따로 연 읽기 전용 연결의 `VACUUM INTO`가 만든다. WAL이라 서버의 쓰기를 막지 않고 그 순간까지 커밋된 것만 담는다.
 * shortcut: `VACUUM INTO`는 동기라 복사하는 동안 이벤트 루프가 멈춘다(DB 20MB에 0.1초 안팎). DB가 100MB를 넘으면 Node 22.16의
 * `backup()`(비동기)이나 워커로 옮긴다.
 */
export function backupDatabase(databasePath: string, directory: string, now: number): string | undefined {
  if (!existsSync(databasePath)) return undefined;
  mkdirSync(directory, { recursive: true });
  const name = `game-${new Date(now).toISOString().slice(0, 10)}.sqlite`;
  const kept = readdirSync(directory).filter(file => BACKUP.test(file));
  if (kept.includes(name)) return undefined;

  const target = path.join(directory, name);
  const temporary = `${target}.tmp`;
  // 쓰다가 꺼진 지난 시도가 남긴 파일. 있으면 VACUUM INTO가 거절한다.
  rmSync(temporary, { force: true });
  const source = new DatabaseSync(databasePath, { readOnly: true });
  try {
    source.prepare("VACUUM INTO ?").run(temporary);
  } finally {
    source.close();
  }
  renameSync(temporary, target);
  for (const old of [...kept, name].sort().slice(0, -BACKUPS_KEPT)) rmSync(path.join(directory, old));
  return target;
}
