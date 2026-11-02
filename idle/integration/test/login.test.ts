import { startApp } from "@idle/client/composition";
import { createTestServer, loadTestData } from "@idle/server/testing";
import { SoundChannel } from "@idle/data-schema";
import { expect, test, vi } from "vitest";
import { createLoopbackBridge } from "./support/loopback.js";
import { captureViews } from "./support/views.js";

const data = await loadTestData();

// 저장소가 `device`인 기기에서 도는 클라이언트. `screen`은 마지막으로 띄운 로그인 화면이다.
async function startClient(server: Awaited<ReturnType<typeof createTestServer>>, device: Map<string, string>) {
  const bridge = createLoopbackBridge(server.rpc, device);
  const captured = captureViews();
  const app = await startApp(bridge, { server: "ws://game.test", mode: "release" }, captured.views);
  app.start();
  // 프리팹이 로드되면 뷰가 바인딩된다.
  await vi.waitFor(() => expect(captured.login()).toBeDefined());
  return { bridge, app, screen: () => captured.login()!, flow: () => app.state.flow.value };
}

test("the login screen sends only IDs the server accepts, and the next start logs in by itself", async () => {
  const server = await createTestServer(data);
  const device = new Map<string, string>();
  const first = await startClient(server, device);
  expect(first.flow()).toBe("login");
  first.screen().loginId.value = "Hero!";
  expect(first.screen().canLogin.value).toBe(false);
  first.screen().loginId.value = "hero";
  await first.screen().login();
  expect(first.flow()).toBe("main");

  // 같은 기기에서 앱이 다시 시작된다.
  const second = await startClient(server, device);
  await vi.waitFor(() => expect(second.flow()).toBe("main"));
  // 이 로그인이 첫 클라이언트에서 계정을 가져갔고, 첫 클라이언트는 로그인 화면에 남아 이유를 알려 준다.
  await vi.waitFor(() => expect(first.flow()).toBe("login"));
  expect(first.screen().status.value).toBe("다른 곳에서 같은 아이디로 로그인했습니다.");
  expect(first.app.state.network.value.status).toBe("ended");
});

test("logging out forgets the ID and restarts, so the next start waits at login", async () => {
  const server = await createTestServer(data);
  const device = new Map<string, string>();
  const client = await startClient(server, device);
  await client.app.account.login("hero");
  client.app.account.logout();
  expect(client.bridge.restarts).toBe(1);

  const next = await startClient(server, device);
  expect(next.flow()).toBe("login");
  expect(next.app.state.network.value.status).toBe("offline");
  expect(next.screen().loginId.value).toBe("");
});

test("a press in any view plays the click sound at its table volume times the effects setting, and not when muted", async () => {
  const server = await createTestServer(data);
  const bridge = createLoopbackBridge(server.rpc);
  const captured = captureViews();
  const app = await startApp(bridge, { server: "ws://game.test", mode: "release" }, captured.views);
  app.start();
  await vi.waitFor(() => expect(captured.context()).toBeDefined());
  const click = [...app.data.sounds.values()].find(row => row.clip === "Audio/Sfx/Click")!;

  app.settings.setVolume(SoundChannel.Sfx, 0.5);
  captured.context()!.pressed();
  await vi.waitFor(() => expect(bridge.sfx).toEqual([click.volume * 0.5]));
  app.settings.setMuted(SoundChannel.Sfx, true);
  captured.context()!.pressed();
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(bridge.sfx).toHaveLength(1);
});


test("picking a language redraws the open screen and the view labels, and the next start keeps it", async () => {
  const server = await createTestServer(data);
  const device = new Map<string, string>();
  const first = await startClient(server, device);
  first.screen().loginId.value = "Hero!";
  expect(first.screen().status.value).toBe("아이디는 영문 소문자, 숫자, _로 4~16자입니다.");

  first.app.settings.setLanguage("en");
  expect(first.screen().status.value).toBe("An ID is 4–16 lowercase letters, digits or _.");

  // 같은 기기에서 다시 시작해도 고른 언어다. 뷰의 고정 글자도 그 언어로 채운다.
  const captured = captureViews();
  const app = await startApp(createLoopbackBridge(server.rpc, device), { server: "ws://game.test", mode: "release" }, captured.views);
  app.start();
  await vi.waitFor(() => expect(captured.context()).toBeDefined());
  expect(app.settings.value.value.language).toBe("en");
  expect(captured.context()!.t("login.button")).toBe("Log in");
});

// 서버가 준 저장 데이터의 스테이지 이름도 고른 언어의 테이블 문장으로 다시 그린다.
test("after logging in, picking a language redraws the main screen from the tables in that language", async () => {
  const server = await createTestServer(data);
  const captured = captureViews();
  const app = await startApp(createLoopbackBridge(server.rpc), { server: "ws://game.test", mode: "release" }, captured.views);
  app.start();
  await app.account.login("hero");
  await vi.waitFor(() => expect(captured.main()).toBeDefined());
  const main = captured.main()!;
  const stage = data.strings.get(data.stages.get(app.state.player.value!.stage.currentId)!.nameKey)!;
  expect(main.stage.value).toBe(stage.ko);

  app.settings.setLanguage("en");
  expect(main.stage.value).toBe(stage.en);
});
