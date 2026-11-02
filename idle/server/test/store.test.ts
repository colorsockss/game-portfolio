import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { MAX_UNANSWERED_COMMANDS } from "@idle/protocol";
import { afterAll, expect, test } from "vitest";
import { createPlayer } from "../src/save.js";
import { openStore } from "../src/store.js";
import { loadTestData } from "../src/testing.js";

const data = await loadTestData();
const player = createPlayer("hero", data, 1_000_000);
const moved = { ...player, stage: { ...player.stage, currentId: 3002 } };
const directory = await mkdtemp(path.join(tmpdir(), "idle-store-"));

afterAll(() => rm(directory, { recursive: true, force: true }));

test("creates an account once, with its first save at revision 1", async () => {
  const store = await openStore(":memory:");
  const account = (await store.createAccount("hero", player, 1000))!;
  expect(account.loginId).toBe("hero");
  expect(await store.createAccount("hero", player, 2000)).toBeUndefined();
  expect(await store.findAccount("hero")).toEqual(account);
  expect(await store.findAccount("nobody")).toBeUndefined();

  const loaded = (await store.load(account.id))!;
  expect(loaded).toEqual({ player, revision: 1 });
  expect(loaded.player).not.toBe(player);
  expect(await store.load(account.id + 1)).toBeUndefined();
});

// 계정과 첫 저장 데이터는 함께 생기거나 함께 없다. 저장 데이터를 쓰지 못한 계정이 남으면 그 ID는 다시 만들 수 없다.
test("creating an account leaves nothing when its first save cannot be written", async () => {
  const store = await openStore(":memory:");
  // MessagePack은 bigint를 쓰지 못한다(useBigInt64 없이).
  const unwritable = { ...player, profile: { ...player.profile, level: 1n } } as unknown as typeof player;
  await expect(store.createAccount("hero", unwritable, 1000)).rejects.toThrow(/Unrecognized object/);
  expect(await store.findAccount("hero")).toBeUndefined();

  const account = (await store.createAccount("hero", player, 2000))!;
  expect(await store.load(account.id)).toEqual({ player, revision: 1 });
});

test("a save moves on only from the revision it was read at", async () => {
  const store = await openStore(":memory:");
  const { id } = (await store.createAccount("hero", player, 1000))!;

  expect(await store.save(id, moved, 1, 2000)).toEqual({ player: moved, revision: 2 });
  // revision 1을 함께 읽은 두 번째 요청은 한발 늦었다.
  expect(await store.save(id, player, 1, 3000)).toBeUndefined();
  expect(await store.load(id)).toEqual({ player: moved, revision: 2 });
});

test("keeps accounts and saves in its file across restarts", async () => {
  const file = path.join(directory, "restart.sqlite");
  const first = await openStore(file);
  const { id } = (await first.createAccount("hero", player, 1000))!;
  await first.close();

  const second = await openStore(file);
  expect((await second.findAccount("hero"))?.id).toBe(id);
  expect(await second.load(id)).toEqual({ player, revision: 1 });
  await second.close();
});

test("refuses a database from a newer server", async () => {
  const file = path.join(directory, "newer.sqlite");
  const db = new DatabaseSync(file);
  db.exec("PRAGMA user_version = 99");
  db.close();
  await expect(openStore(file)).rejects.toThrow(/schema 99/);
});

test("an account has one session, found by its token hash", async () => {
  const store = await openStore(":memory:");
  const account = (await store.createAccount("hero", player, 1000))!;
  const first = new Uint8Array([1, 2, 3]);
  const second = new Uint8Array([4, 5, 6]);

  await store.startSession(account.id, first, 5000);
  expect(await store.findSession(first)).toEqual({ account, expiresAt: 5000 });

  await store.startSession(account.id, second, 9000);
  expect(await store.findSession(first)).toBeUndefined();
  expect(await store.findSession(second)).toEqual({ account, expiresAt: 9000 });
});

test("keeps the latest command results of the current session", async () => {
  const store = await openStore(":memory:");
  const { id } = (await store.createAccount("hero", player, 1000))!;
  const result = (n: number) => new Uint8Array([n % 256]);

  for (let n = 0; n <= MAX_UNANSWERED_COMMANDS; n++) await store.recordResult(id, String(n), result(n));
  expect(await store.findResult(id, "0")).toBeUndefined();
  expect(await store.findResult(id, "1")).toEqual(result(1));
  expect(await store.findResult(id, String(MAX_UNANSWERED_COMMANDS))).toEqual(result(MAX_UNANSWERED_COMMANDS));

  await store.startSession(id, new Uint8Array([1]), 5000);
  expect(await store.findResult(id, String(MAX_UNANSWERED_COMMANDS))).toBeUndefined();
});

test("a transaction keeps everything or nothing", async () => {
  const store = await openStore(":memory:");
  const { id } = (await store.createAccount("hero", player, 1000))!;

  await expect(store.transaction(async tx => {
    await tx.save(id, moved, 1, 2000);
    await tx.recordResult(id, "1", new Uint8Array([1]));
    throw new Error("stop");
  })).rejects.toThrow("stop");
  expect((await store.load(id))?.revision).toBe(1);
  expect(await store.findResult(id, "1")).toBeUndefined();

  await store.transaction(async tx => {
    await tx.save(id, moved, 1, 2000);
    await tx.recordResult(id, "1", new Uint8Array([1]));
  });
  expect((await store.load(id))?.revision).toBe(2);
  expect(await store.findResult(id, "1")).toEqual(new Uint8Array([1]));
});

test("calls from outside wait while a transaction is open, and never see its unfinished work", async () => {
  const store = await openStore(":memory:");
  const { id } = (await store.createAccount("hero", player, 1000))!;
  let finish!: () => void;
  const paused = new Promise<void>(resolve => (finish = resolve));

  const transaction = store.transaction(async tx => {
    await tx.save(id, moved, 1, 2000);
    await paused;
    throw new Error("rolled back");
  });
  const outside = store.load(id);
  finish();

  await expect(transaction).rejects.toThrow("rolled back");
  expect(await outside).toEqual({ player, revision: 1 });
});
