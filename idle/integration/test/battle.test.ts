import { Big } from "@idle/big-number";
import type { ShownEvent } from "@idle/client/application/battle/battle";
import type { OfflineRewarded } from "@idle/client/application/events";
import { startApp } from "@idle/client/composition";
import { HOUR, offlineReward, settle } from "@idle/game-core";
import { createTestServer, loadTestData } from "@idle/server/testing";
import { afterEach, expect, test, vi } from "vitest";
import { createHero } from "./support/hero.js";
import { createLoopbackBridge } from "./support/loopback.js";
import { captureViews } from "./support/views.js";

afterEach(() => void vi.useRealTimers());

// 클라이언트가 보여 주며 예측한 정산을 서버가 같은 시뮬레이션으로 확정하고, 화면은 다시 맞추지 않는다.
test("the server confirms the settle the client predicted", async () => {
  const server = await createTestServer(await loadTestData(), { clock: { now: () => Date.now() } });
  // Date와 타이머(루프백의 소켓 이벤트)가 함께 움직이고, 서버와 클라이언트가 같은 시계를 본다.
  vi.useFakeTimers({ now: Date.UTC(2026, 9, 13, 12, 0, 0, 50) });
  const app = await startApp(createLoopbackBridge(server.rpc), { server: "ws://game.test", mode: "release" }, captureViews().views);
  const login = app.account.login("hero");
  await vi.advanceTimersByTimeAsync(10);
  await login;
  const start = app.state.player.value!.battle;

  // 프레임은 틱 한가운데(체크포인트 + 50 ms)에서 돌아, 소켓을 건너며 몇 ms 어긋나도 양쪽의 틱이 같다.
  await vi.advanceTimersByTimeAsync(start.at + 50 - Date.now());
  const events: ShownEvent[] = [];
  for (let frame = 0; frame < 700; frame++) {
    events.push(...app.battle.advance());
    await vi.advanceTimersByTimeAsync(100);
  }

  const account = (await server.store.findAccount("hero"))!;
  const saved = (await server.store.load(account.id))!;
  // 정산은 클리어마다, 아니면 60초마다 나가므로 몇 번인지는 영웅의 운에 달렸다. 하나 이상 확정되었다.
  expect(saved.revision).toBeGreaterThan(1);
  expect(saved.player.battle.at).toBeGreaterThan(start.at);
  expect(saved.player.battle).toEqual(app.state.player.value!.battle);
  // 그동안 웨이브의 몬스터 여럿이 함께 싸웠고, 영웅의 범위 공격(화염구 발사체)이 여럿을 쳤다. 발사체는 쏜 뒤 착탄 틱에 맞았다.
  // 그 결과를 두 쪽이 같게 냈다.
  expect(events.some(event => event.type === "impact" && event.hits.length > 1)).toBe(true);
  expect(events.some(event => event.type === "launch")).toBe(true);
  // 영웅이 부른 늑대도 싸우다 만료했고, 체크포인트가 담은 소환수도 두 쪽이 같다(위의 battle 비교).
  const wolves = new Set(events.flatMap(event => (event.type === "summon" ? [event.id] : [])));
  expect(events.some(event => event.type === "attack" && wolves.has(event.by) && event.hits.length > 0)).toBe(true);
  expect(events.some(event => event.type === "expire")).toBe(true);
  // 처치·클리어 보상도 같은 정산이 지급해 두 쪽의 보유량이 같다. 보이는 골드는 그 위에서 처치마다 오른다.
  expect(saved.player.items).toEqual(app.state.player.value!.items);
  expect(Big.sign(saved.player.items[1])).toBe(1);
  expect(Big.gte(app.battle.items.value[1], saved.player.items[1])).toBe(true);
  // 처음 보이는 전투의 reset 하나뿐이다.
  expect(events.filter(event => event.type === "reset")).toEqual([events[0]]);
  expect(events[0].type).toBe("reset");
});

// 쓰는 스킬의 레벨업과 장착은 전투의 길을 바꾸므로 클라이언트가 예측한 체크포인트로 보이는 전투를 reset한다. 서버는 클라이언트가
// 예측한 시각에 같은 규칙으로 확정하므로 답이 와도 다시 reset하지 않고, 두 쪽이 같은 전투를 정산한다. 배우기는 길을 바꾸지 않는다.
test("learning keeps the shown battle, leveling up and equipping skills reset it, and the server settles the same battle after", async () => {
  const data = await loadTestData();
  const server = await createTestServer(data, { clock: { now: () => Date.now() } });
  vi.useFakeTimers({ now: Date.UTC(2026, 9, 13, 12, 0, 0, 50) });
  await createHero(server, data, { items: { 1: Big.from(10_000) } });
  const app = await startApp(createLoopbackBridge(server.rpc), { server: "ws://game.test", mode: "release" }, captureViews().views);
  const login = app.account.login("hero");
  await vi.advanceTimersByTimeAsync(10);
  await login;
  await vi.advanceTimersByTimeAsync(app.state.player.value!.battle.at + 50 - Date.now());
  const frames = async (count: number) => {
    const events: ShownEvent[] = [];
    for (let frame = 0; frame < count; frame++) {
      events.push(...app.battle.advance());
      await vi.advanceTimersByTimeAsync(100);
    }
    return events;
  };
  const isReset = (event: ShownEvent) => event.type === "reset";
  expect((await frames(30)).filter(isReset)).toHaveLength(1);

  // 보내자마자 저장 데이터에 보이고, 다음 프레임이 바뀐 길에서 reset한다.
  const leveled = app.progress.cmd.SkillLevelUp({ skillId: 1004 });
  expect(app.state.player.value!.skills.levels[1004]).toBe(2);
  expect(app.battle.advance()).toEqual([expect.objectContaining({ type: "reset" })]);
  await vi.advanceTimersByTimeAsync(10);
  expect(await leveled).toBeUndefined();
  const learned = app.progress.cmd.SkillLearn({ skillId: 1010 });
  expect(app.state.player.value!.skills.levels[1010]).toBe(1);
  expect(app.battle.advance().filter(isReset)).toEqual([]);
  await vi.advanceTimersByTimeAsync(10);
  expect(await learned).toBeUndefined();
  const equipped = app.progress.cmd.SkillEquip({ slot: 0, skillId: 1010 });
  expect(app.state.player.value!.skills.equipped).toEqual({ 0: 1010, 1: 1005, 2: 1011 });
  expect(app.battle.advance()).toEqual([expect.objectContaining({ type: "reset" })]);
  await vi.advanceTimersByTimeAsync(10);
  expect(await equipped).toBeUndefined();

  const account = (await server.store.findAccount("hero"))!;
  const confirmed = (await server.store.load(account.id))!;
  expect(confirmed.player.skills).toEqual({ equipped: { 0: 1010, 1: 1005, 2: 1011 }, levels: { 1004: 2, 1005: 1, 1010: 1, 1011: 1 } });
  expect(confirmed.player.items[1]).toEqual(app.state.player.value!.items[1]);

  // 서버가 예측한 시각 그대로 확정했으므로 reset 없이 이어 가며 정산을 두 쪽이 같게 낸다.
  const events = await frames(700);
  expect(events.filter(isReset)).toEqual([]);
  expect(events.some(event => event.type === "attack" && event.skillId === 1010)).toBe(true);
  const saved = (await server.store.load(account.id))!;
  expect(saved.revision).toBeGreaterThan(confirmed.revision);
  expect(saved.player).toEqual(app.state.player.value);
});

// 오래 떠나 있다 다시 로그인하면 첫 프레임이 낡은 체크포인트를 정산하고, 서버가 같은 규칙으로 오프라인 보상을
// 확정한다. 클라이언트가 알린 보상은 자기 시각의 예측이라 서버의 확정과 RTT만큼 다를 수 있다.
test("the first settle after a long absence pays the offline reward the client announced", async () => {
  const data = await loadTestData();
  const server = await createTestServer(data, { clock: { now: () => Date.now() } });
  vi.useFakeTimers({ now: Date.UTC(2026, 9, 13, 12, 0, 0, 50) });
  const first = await startApp(createLoopbackBridge(server.rpc), { server: "ws://game.test", mode: "release" }, captureViews().views);
  const login = first.account.login("hero");
  await vi.advanceTimersByTimeAsync(10);
  await login;

  // 첫 클라이언트는 프레임을 돌리지 않은 채 3시간이 지나고, 다른 클라이언트가 로그인한다.
  await vi.advanceTimersByTimeAsync(3 * HOUR);
  const account = (await server.store.findAccount("hero"))!;
  const away = (await server.store.load(account.id))!.player;
  const app = await startApp(createLoopbackBridge(server.rpc), { server: "ws://game.test", mode: "release" }, captureViews().views);
  const relogin = app.account.login("hero");
  await vi.advanceTimersByTimeAsync(10);
  await relogin;
  const announced: OfflineRewarded[] = [];
  app.events.on("offlineReward", reward => announced.push(reward));
  app.battle.advance();
  await vi.advanceTimersByTimeAsync(10);

  const saved = (await server.store.load(account.id))!.player;
  // 서버는 자기 시각(새 체크포인트의 at)으로 지급하고 바로 레벨을 올린다.
  const paid = settle(away, data, saved.battle.at);
  expect(saved).toMatchObject({ items: paid.items, hero: paid.hero });
  expect(saved.hero.level).toBeGreaterThan(1);
  expect(app.state.player.value!.items).toEqual(saved.items);
  expect(announced).toHaveLength(1);
  const [reward] = announced;
  expect(Math.abs(reward.duration - 3 * HOUR)).toBeLessThan(100);
  expect(Math.abs(Big.toNumber(Big.sub(reward.items[1], offlineReward(away, data, saved.battle.at).items[1])))).toBeLessThanOrEqual(1);
  expect(reward.level).toEqual({ from: away.hero.level, to: saved.hero.level });
  expect(Big.sign(saved.items[1])).toBe(1);
});
