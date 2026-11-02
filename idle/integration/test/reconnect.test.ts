import { GameErrorCode } from "@idle/codes";
import { startApp } from "@idle/client/composition";
import { createTestServer, loadTestData } from "@idle/server/testing";
import { expect, test, vi } from "vitest";
import { createHero } from "./support/hero.js";
import { createLoopbackBridge } from "./support/loopback.js";
import { captureViews } from "./support/views.js";

const data = await loadTestData();

async function startClient(server: Awaited<ReturnType<typeof createTestServer>>) {
  const bridge = createLoopbackBridge(server.rpc);
  const app = await startApp(bridge, { server: "ws://game.test", mode: "release" }, captureViews().views);
  app.start();
  return { bridge, app, network: () => app.state.network.value, flow: () => app.state.flow.value };
}

test("a dropped connection comes back by itself and carries on with the session", async () => {
  const server = await createTestServer(data);
  await createHero(server, data);
  const client = await startClient(server);
  await client.app.account.login("hero");

  client.bridge.drop();
  await vi.waitFor(() => expect(client.network().status).toBe("reconnecting"));
  await vi.waitFor(() => expect(client.network().status).toBe("online"));
  expect(await client.app.progress.cmd.StageSelect({ stageId: 3002 })).toBeUndefined();
});

test("a command whose answer was lost runs only once: the client comes back, resumes and sends it again", async () => {
  const server = await createTestServer(data);
  await createHero(server, data);
  const client = await startClient(server);
  await client.app.account.login("hero");
  const { id } = (await server.store.findAccount("hero"))!;

  client.bridge.loseNextAnswer();
  const sent = client.app.progress.cmd.StageSelect({ stageId: 3002 });
  await vi.waitFor(() => expect(client.network().status).toBe("reconnecting"));
  // 그 사이 서버에 다른 변경이 반영된다. 커맨드를 다시 실행하면 이 변경이 되돌려진다.
  const saved = (await server.store.load(id))!;
  await server.store.save(id, { ...saved.player, stage: { ...saved.player.stage, currentId: 3003 } }, saved.revision, Date.now());

  expect(await sent).toBeUndefined();
  expect(client.network().status).toBe("online");
  expect(await server.store.load(id)).toMatchObject({ revision: 3, player: { stage: { currentId: 3003 } } });
  // 되풀이된 응답은 재개된 저장보다 오래된 것이므로 클라이언트는 서버의 상태를 유지한다.
  expect(client.app.state.player.value?.stage.currentId).toBe(3003);
});

test("commands sent together apply in the order sent, on the client and on the server", async () => {
  const server = await createTestServer(data);
  await createHero(server, data);
  const client = await startClient(server);
  await client.app.account.login("hero");

  const answers = await Promise.all([3002, 9999, 3003, 3002].map(stageId => client.app.progress.cmd.StageSelect({ stageId })));
  expect(answers.map(error => error?.code)).toEqual([undefined, GameErrorCode.StageNotFound, undefined, undefined]);
  const { id } = (await server.store.findAccount("hero"))!;
  expect(await server.store.load(id)).toMatchObject({ revision: 4, player: { stage: { currentId: 3002 } } });
  expect(client.app.state.player.value?.stage.currentId).toBe(3002);
});

test("logging in elsewhere ends the first client's session and sends it back to login", async () => {
  const server = await createTestServer(data);
  const first = await startClient(server);
  const second = await startClient(server);
  expect(first.flow()).toBe("login");
  await first.app.account.login("hero");
  expect(first.flow()).toBe("main");
  await second.app.account.login("hero");

  await vi.waitFor(() => expect(first.network()).toMatchObject({ status: "ended", ended: "replaced" }));
  expect(first.flow()).toBe("login");
  expect(first.app.state.player.value).toBeNull();
  expect(second.flow()).toBe("main");
  expect(second.network().status).toBe("online");

  // 다시 로그인하면 되고, 이번에는 두 번째 클라이언트가 밀려난다.
  await first.app.account.login("hero");
  expect(first.flow()).toBe("main");
  await vi.waitFor(() => expect(second.flow()).toBe("login"));
});
