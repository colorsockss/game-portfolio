import { Big } from "@idle/big-number";
import type { OfflineRewarded } from "@idle/client/application/events";
import { startApp } from "@idle/client/composition";
import { HOUR } from "@idle/game-core";
import { createTestServer, loadTestData } from "@idle/server/testing";
import { expect, test, vi } from "vitest";
import { createHero } from "./support/hero.js";
import { createLoopbackBridge } from "./support/loopback.js";
import { captureViews } from "./support/views.js";

const data = await loadTestData();

// 개발 빌드의 클라이언트가 로그인해 디버그 오버레이를 연다. `cheats`는 서버가 개발 모드인지다.
async function startDevelopment(cheats: boolean) {
  const server = await createTestServer(data, { cheats });
  await createHero(server, data);
  const captured = captureViews();
  const app = await startApp(createLoopbackBridge(server.rpc), { server: "ws://game.test", mode: "development" }, captured.views);
  app.start();
  await app.account.login("hero");
  const overlay = await vi.waitFor(() => captured.debug()!);
  const saved = async () => (await server.store.load((await server.store.findAccount("hero"))!.id))!;
  return { app, overlay, saved };
}

test("only a development build opens the debug overlay", async () => {
  const release = captureViews();
  const app = await startApp(createLoopbackBridge((await createTestServer(data)).rpc), { server: "ws://game.test", mode: "release" }, release.views);
  app.start();
  await vi.waitFor(() => expect(release.login()).toBeDefined());
  expect(release.debug()).toBeUndefined();

  expect((await startDevelopment(true)).overlay).toBeDefined();
});

test("the overlay's cheats are refused by a release server and applied once by a development server", async () => {
  const release = await startDevelopment(false);
  release.overlay.cheat.value = "grant 1 1000";
  await release.overlay.runCheat();
  expect(release.overlay.cheatResult.value).toBe("거절 CheatDisabled: grant 1 1000");
  expect((await release.saved()).revision).toBe(1);

  const development = await startDevelopment(true);
  const before = development.app.state.player.value!.items[1] ?? Big.ZERO;
  development.overlay.cheat.value = "grant 1 1000";
  await development.overlay.runCheat();
  expect(development.overlay.cheatResult.value).toBe("적용: grant 1 1000");
  const saved = await development.saved();
  expect(saved.revision).toBe(2);
  expect(Big.gte(saved.player.items[1], Big.add(before, 1000))).toBe(true);
  expect(development.app.state.player.value).toEqual(saved.player);
});

// 시간 이동은 체크포인트를 과거로 옮길 뿐이고, 다음 프레임의 정산이 오프라인 보상을 확정해 보상 팝업이 뜬다.
test("shifting time pays an offline reward through the next settle", async () => {
  const { app, overlay, saved } = await startDevelopment(true);
  const rewards: OfflineRewarded[] = [];
  app.events.on("offlineReward", reward => void rewards.push(reward));
  overlay.cheat.value = "time 60";
  await overlay.runCheat();
  expect(overlay.cheatResult.value).toBe("적용: time 60");

  app.battle.advance();
  await vi.waitFor(() => expect(rewards).toHaveLength(1));
  expect(rewards[0].duration).toBeGreaterThanOrEqual(HOUR);
  await vi.waitFor(async () => expect((await saved()).player.battle.at).toBeGreaterThan(Date.now() - HOUR / 2));
});
