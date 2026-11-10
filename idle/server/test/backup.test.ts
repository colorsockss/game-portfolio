import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DAY } from "@idle/game-core";
import { afterAll, expect, test } from "vitest";
import { BACKUPS_KEPT, backupDatabase } from "../src/backup.js";
import { createPlayer } from "../src/save.js";
import { openStore } from "../src/store.js";
import { loadTestData } from "../src/testing.js";

const data = await loadTestData();
const root = await mkdtemp(path.join(tmpdir(), "idle-backup-"));
const NOON = Date.UTC(2026, 10, 10, 12);

afterAll(() => rm(root, { recursive: true, force: true }));

test("copies the open database once a day and the copy opens with its accounts", async () => {
  const database = path.join(root, "daily.sqlite");
  const backups = path.join(root, "daily-backup");
  expect(backupDatabase(database, backups, NOON)).toBeUndefined();

  const store = await openStore(database);
  const account = (await store.createAccount("hero", createPlayer("hero", data, NOON), NOON))!;
  // 쓰다가 꺼진 지난 시도의 파일이 있어도 만든다.
  const target = path.join(backups, "game-2026-11-10.sqlite");
  expect(backupDatabase(database, backups, NOON - 1)).toBe(target);
  await rm(target);
  await writeFile(`${target}.tmp`, "half");
  expect(backupDatabase(database, backups, NOON)).toBe(target);
  expect(backupDatabase(database, backups, NOON + 11 * 60 * 60 * 1000)).toBeUndefined();
  expect(await readdir(backups)).toEqual(["game-2026-11-10.sqlite"]);

  // 사본을 만든 뒤의 계정은 사본에 없다.
  await store.createAccount("later", createPlayer("later", data, NOON), NOON);
  await store.close();
  const copy = await openStore(target);
  expect(await copy.findAccount("hero")).toEqual(account);
  expect((await copy.load(account.id))?.revision).toBe(1);
  expect(await copy.findAccount("later")).toBeUndefined();
  await copy.close();
});

test("keeps the newest copies and deletes the rest", async () => {
  const database = path.join(root, "kept.sqlite");
  const backups = path.join(root, "kept-backup");
  await (await openStore(database)).close();
  for (let day = 0; day < BACKUPS_KEPT + 2; day++) backupDatabase(database, backups, NOON + day * DAY);
  const kept = await readdir(backups);
  expect(kept).toHaveLength(BACKUPS_KEPT);
  expect(kept.sort()[0]).toBe("game-2026-11-12.sqlite");
});
