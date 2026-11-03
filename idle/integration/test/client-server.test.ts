import { Big } from "@idle/big-number";
import { GameErrorCode } from "@idle/codes";
import { heroStats } from "@idle/game-core";
import { startApp } from "@idle/client/composition";
import { createTestServer, loadTestData } from "@idle/server/testing";
import { expect, test } from "vitest";
import { createHero } from "./support/hero.js";
import { createLoopbackBridge } from "./support/loopback.js";
import { captureViews } from "./support/views.js";

// 모든 계층을 거치는 전체 경로를 App으로 진입해서 확인한다: 클라이언트 → 프로토콜 → 서버 rpc →
// 공용 규칙.
test("a client logs in, and its command applies at once and is confirmed by the server", async () => {
  const data = await loadTestData();
  const server = await createTestServer(data);
  await createHero(server, data);
  const bridge = createLoopbackBridge(server.rpc);
  const app = await startApp(bridge, { server: "ws://game.test", mode: "release" }, captureViews().views);

  // 커맨드 이름은 오퍼코드를 따른다.
  expect(Object.keys(app.progress.cmd)).toEqual([
    "StageSelect", "BattleSettle", "BossChallenge", "ItemEquip", "ItemUnequip", "ItemEnhance", "ItemMerge", "StatUpgrade",
    "SkillLearn", "SkillEquip", "SkillUnequip", "SkillLevelUp", "TutorialAdvance", "Rebirth",
    "CheatItemGrant", "CheatLevelSet", "CheatStageUnlock", "CheatTimeShift",
  ]);

  await app.account.login("hero");
  expect(app.state.player.value?.profile.loginId).toBe("hero");

  const sent = app.progress.cmd.StageSelect({ stageId: 3002 });
  expect(app.state.player.value?.stage.currentId).toBe(3002);
  expect(await sent).toBeUndefined();
  const account = (await server.store.findAccount("hero"))!;
  expect(await server.store.load(account.id)).toMatchObject({ revision: 2, player: { stage: { currentId: 3002 } } });

  expect(await app.progress.cmd.StageSelect({ stageId: 9999 })).toMatchObject({ code: GameErrorCode.StageNotFound });
  // 3004는 3003을 클리어해야 열린다. 클라이언트의 규칙이 먼저 거절해 서버로 가지 않는다.
  expect(await app.progress.cmd.StageSelect({ stageId: 3004 })).toMatchObject({ code: GameErrorCode.StageLocked });
});

// 착용은 클라이언트에 바로 보이고 서버가 클라이언트가 예측한 시각에 같은 규칙으로 확정한다. 전투는 그 틱에서 이어 간다.
test("wearing equipment applies at once and the server confirms it, the fight going on", async () => {
  const data = await loadTestData();
  const server = await createTestServer(data);
  await createHero(server, data, { equipment: { nextId: 3, owned: { 1: { itemId: 101, enhance: 0 }, 2: { itemId: 102, enhance: 0 } }, equipped: {} } });
  const app = await startApp(createLoopbackBridge(server.rpc), { server: "ws://game.test", mode: "release" }, captureViews().views);
  await app.account.login("hero");

  const sent = app.progress.cmd.ItemEquip({ equipmentId: 1 });
  expect(app.state.player.value?.equipment.equipped).toEqual({ 1: 1 });
  expect(await sent).toBeUndefined();
  const account = (await server.store.findAccount("hero"))!;
  const saved = (await server.store.load(account.id))!;
  expect(saved).toMatchObject({ revision: 2, player: { equipment: { equipped: { 1: 1 } } } });
  expect(app.state.player.value).toEqual(saved.player);

  expect(await app.progress.cmd.ItemUnequip({ equipmentId: 1 })).toBeUndefined();
  expect((await server.store.load(account.id))!.player.equipment.equipped).toEqual({});
  // 가지지 않은 장비는 클라이언트의 규칙이 먼저 거절한다.
  expect(await app.progress.cmd.ItemEquip({ equipmentId: 9 })).toMatchObject({ code: GameErrorCode.EquipmentNotFound });
});

// 강화는 클라이언트에 바로 보이고 서버가 같은 규칙으로 확정한다. 낸 골드, 단계, 이어 가는 전투가 예측과 같다.
test("a stat upgrade applies at once and the server confirms the gold, step and continuing fight the client predicted", async () => {
  const data = await loadTestData();
  const server = await createTestServer(data);
  // 골드 200: 공격 0단계(100)는 되고 1단계(115)는 모자란다.
  await createHero(server, data, { items: { 1: Big.from(200) } });
  const app = await startApp(createLoopbackBridge(server.rpc), { server: "ws://game.test", mode: "release" }, captureViews().views);
  await app.account.login("hero");
  const before = app.state.player.value!;

  const sent = app.progress.cmd.StatUpgrade({ upgradeId: 7001, steps: 1 });
  const predicted = app.state.player.value!;
  expect(predicted.statUpgrades).toEqual({ 7001: 1 });
  expect(predicted.items[1]).toEqual(Big.from(100));
  expect(await sent).toBeUndefined();
  const account = (await server.store.findAccount("hero"))!;
  const saved = (await server.store.load(account.id))!;
  expect(saved.revision).toBe(2);
  expect(app.state.player.value).toEqual(saved.player);
  // 서버가 클라이언트가 예측한 시각 그대로 확정하므로 예측과 같다.
  expect(saved.player).toEqual(predicted);
  expect(heroStats(saved.player, data).attack).toEqual(Big.add(heroStats(before, data).attack, 5));

  // 다음 단계는 클라이언트의 규칙이 먼저 거절해 서버로 가지 않는다.
  expect(await app.progress.cmd.StatUpgrade({ upgradeId: 7001, steps: 1 })).toMatchObject({ code: GameErrorCode.NotEnoughGold });
  expect((await server.store.load(account.id))!.revision).toBe(2);
});

// 강화와 합성도 클라이언트에 바로 보이고, 서버가 같은 규칙으로 같은 장비와 골드를 확정한다.
test("enhancing and merging apply at once and the server confirms the same equipment and gold", async () => {
  const data = await loadTestData();
  const server = await createTestServer(data);
  const sword = { itemId: 101, enhance: 0 };
  await createHero(server, data, { equipment: { nextId: 4, owned: { 1: sword, 2: sword, 3: sword }, equipped: { 1: 1 } }, items: { 1: Big.from(1000) } });
  const app = await startApp(createLoopbackBridge(server.rpc), { server: "ws://game.test", mode: "release" }, captureViews().views);
  await app.account.login("hero");
  const account = (await server.store.findAccount("hero"))!;
  const saved = async () => (await server.store.load(account.id))!.player;
  const predicted = () => ({ items: app.state.player.value!.items, equipment: app.state.player.value!.equipment });

  const enhanced = app.progress.cmd.ItemEnhance({ equipmentId: 1 });
  const afterEnhance = predicted();
  expect(afterEnhance).toEqual({ items: { 1: Big.from(500) }, equipment: { nextId: 4, owned: { 1: { itemId: 101, enhance: 1 }, 2: sword, 3: sword }, equipped: { 1: 1 } } });
  expect(await enhanced).toBeUndefined();
  expect(await saved()).toMatchObject(afterEnhance);

  // 입은 +1을 재료로 쓰면 결과(4)를 입는다.
  const merged = app.progress.cmd.ItemMerge({ equipmentId: 1 });
  const afterMerge = predicted();
  expect(afterMerge.equipment).toEqual({ nextId: 5, owned: { 4: { itemId: 107, enhance: 0 } }, equipped: { 1: 4 } });
  expect(await merged).toBeUndefined();
  expect(await saved()).toMatchObject(afterMerge);

  expect(await app.progress.cmd.ItemEnhance({ equipmentId: 4 })).toBeUndefined();
  // 골드가 0이라 다음 강화는 클라이언트의 규칙이 먼저 거절한다.
  expect(await app.progress.cmd.ItemEnhance({ equipmentId: 4 })).toMatchObject({ code: GameErrorCode.NotEnoughGold });
  expect(await saved()).toMatchObject({ items: { 1: Big.from(0) }, equipment: { owned: { 4: { itemId: 107, enhance: 1 } } } });
  expect(predicted()).toEqual({ items: (await saved()).items, equipment: (await saved()).equipment });
});

// 환생은 클라이언트에 바로 보이고, 서버가 같은 규칙으로 같은 포인트와 초기화를 확정한다. 다음 환생은 1레벨이라 클라이언트가 먼저
// 거절한다.
test("a rebirth applies at once and the server confirms the same points, reset and bonus", async () => {
  const data = await loadTestData();
  const server = await createTestServer(data);
  await createHero(server, data, { profile: { loginId: "hero", level: 40 }, items: { 1: Big.from(5000) }, statUpgrades: { 7001: 10 } });
  const app = await startApp(createLoopbackBridge(server.rpc), { server: "ws://game.test", mode: "release" }, captureViews().views);
  await app.account.login("hero");
  const before = app.state.player.value!;

  const sent = app.progress.cmd.Rebirth({});
  const predicted = app.state.player.value!;
  expect(predicted).toMatchObject({
    profile: { level: 1 }, items: {}, statUpgrades: {}, stage: { currentId: 3001, clearedIds: [] }, rebirth: { count: 1, points: 121 },
  });
  expect(await sent).toBeUndefined();
  const account = (await server.store.findAccount("hero"))!;
  const saved = (await server.store.load(account.id))!;
  expect(saved.revision).toBe(2);
  expect(app.state.player.value).toEqual(saved.player);
  // 서버가 클라이언트가 예측한 시각 그대로 확정하므로 예측과 같다.
  expect(saved.player).toEqual(predicted);
  // 1레벨 영웅의 능력치에 배율 1.121이 곱해진다.
  const level1 = heroStats({ ...before, profile: { ...before.profile, level: 1 }, statUpgrades: {} }, data);
  expect(heroStats(saved.player, data).attack).toEqual(Big.floor(Big.mul(level1.attack, 1.121)));

  expect(await app.progress.cmd.Rebirth({})).toMatchObject({ code: GameErrorCode.RebirthNotReady });
  expect((await server.store.load(account.id))!.revision).toBe(2);
});

test("a client keeps server time, even when the machines' clocks disagree", async () => {
  // 서버 시계가 이 기계보다 1년 앞서 있다.
  const ahead = 365 * 24 * 60 * 60 * 1000;
  const server = await createTestServer(await loadTestData(), { clock: { now: () => Date.now() + ahead } });
  const bridge = createLoopbackBridge(server.rpc);
  const app = await startApp(bridge, { server: "ws://game.test", mode: "release" }, captureViews().views);

  expect(Math.abs(app.clock.now() - Date.now())).toBeLessThan(1000);
  await app.account.login("hero");
  expect(Math.abs(app.clock.now() - (Date.now() + ahead))).toBeLessThan(1000);
});
