import { GameErrorCode } from "@idle/codes";
import { startApp } from "@idle/client/composition";
import { createTestServer, loadTestData } from "@idle/server/testing";
import { afterEach, expect, test, vi } from "vitest";
import { createLoopbackBridge } from "./support/loopback.js";
import { captureViews } from "./support/views.js";

afterEach(() => void vi.useRealTimers());

// 새 계정의 튜토리얼을 클라이언트가 보이는 대로 넘기고, 서버가 같은 규칙으로 확정해 저장한다. 스텝은 배포 데이터다.
test("a new hero's tutorial advances as the client sees it and is saved on the server step by step", async () => {
  const server = await createTestServer(await loadTestData(), { clock: { now: () => Date.now() } });
  vi.useFakeTimers({ now: Date.UTC(2026, 9, 13, 12, 0, 0, 50) });
  const captured = captureViews();
  const app = await startApp(createLoopbackBridge(server.rpc), { server: "ws://game.test", mode: "release" }, captured.views);
  app.start();
  await vi.waitFor(() => expect(captured.login()).toBeDefined());
  captured.login()!.loginId.value = "hero";
  // 루프백 소켓의 이벤트는 타이머로 오가므로 시간을 밀며 답을 기다린다.
  const answered = async <T>(sent: Promise<T>) => {
    await vi.advanceTimersByTimeAsync(10);
    return sent;
  };
  await answered(captured.login()!.login());
  await vi.waitFor(() => expect(captured.tutorial()).toBeDefined());
  const tutorial = captured.tutorial()!;
  const saved = async () => (await server.store.load((await server.store.findAccount("hero"))!.id))!.player;

  // 1: 전환 화면이 걷히면 화면 전체를 막고, 누르면 넘어간다.
  await vi.waitFor(() => expect(tutorial.covering.value).toBe(true));
  tutorial.tap();
  await vi.waitFor(async () => expect((await saved()).tutorial).toEqual({ stepId: 2 }));

  // 2: 3001을 클리어할 때까지 막지 않고 기다린다. 클리어 정산이 나간 뒤 스스로 넘어간다.
  expect(tutorial.covering.value).toBe(false);
  for (let frame = 0; frame < 2000 && app.state.player.value!.tutorial.stepId === 2; frame++) {
    app.battle.advance();
    await vi.advanceTimersByTimeAsync(100);
  }
  await vi.waitFor(async () => expect((await saved()).tutorial).toEqual({ stepId: 3 }));
  expect((await saved()).stage.clearedIds).toContain(3001);

  // 3: 메인 화면의 장비 버튼을 비춘다. 누르면 넘어간다.
  expect(tutorial.target.value?.name).toBe("equipmentButton");
  tutorial.tap();
  // 4: 장비 화면이 열리기 전에는 그 화면을 여는 장비 버튼(opener)을 비춘다. 클리어 보상인 무기를 입으면 넘어간다.
  expect(tutorial.target.value?.name).toBe("equipmentButton");
  const [weapon] = Object.keys(app.state.player.value!.equipment.owned).map(Number);
  await answered(app.progress.cmd.ItemEquip({ equipmentId: weapon }));
  await vi.waitFor(async () => expect((await saved()).tutorial).toEqual({ stepId: 5 }));

  // 건너뛰기는 서버도 거절하고, 진행은 그대로다.
  expect(await answered(app.progress.cmd.TutorialAdvance({ stepId: 9 }))).toMatchObject({ code: GameErrorCode.TutorialStepNotCurrent });
  expect(app.state.player.value!.tutorial).toEqual({ stepId: 5 });
  expect((await saved()).tutorial).toEqual({ stepId: 5 });
});
