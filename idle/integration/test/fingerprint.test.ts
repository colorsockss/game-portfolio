import { Big } from "@idle/big-number";
import { Opcode } from "@idle/codes";
import { decodeMessage } from "@idle/protocol";
import { startApp } from "@idle/client/composition";
import { createTestServer, loadTestData } from "@idle/server/testing";
import { expect, test } from "vitest";
import { createHero } from "./support/hero.js";
import { createLoopbackBridge } from "./support/loopback.js";
import { captureViews } from "./support/views.js";

type Server = Awaited<ReturnType<typeof createTestServer>>;

// 서버에 닿는 요청의 opcode와 응답의 sync를 기록하는 rpc.
function recording(rpc: Server["rpc"]) {
  const ops: number[] = [];
  const syncs: { revision: number; fingerprint: number; changes?: object }[] = [];
  const recorded: Server["rpc"] = {
    connect(peer) {
      const connection = rpc.connect(peer);
      return {
        async receive(message) {
          ops.push((decodeMessage(message) as { op: number }).op);
          const answer = await connection.receive(message);
          const { sync } = decodeMessage(answer) as { sync?: (typeof syncs)[number] };
          if (sync) syncs.push(sync);
          return answer;
        },
        closed: () => connection.closed(),
      };
    },
  };
  return { ops, syncs, rpc: recorded };
}

async function start() {
  const data = await loadTestData();
  const server = await createTestServer(data);
  await createHero(server, data, {
    items: { 1: Big.from(1e6) },
    equipment: { nextId: 2, owned: { 1: { itemId: 101, enhance: 0 } }, equipped: {} },
  });
  const wire = recording(server.rpc);
  const app = await startApp(createLoopbackBridge(wire.rpc), { server: "ws://game.test", mode: "release" }, captureViews().views);
  await app.account.login("hero");
  const account = (await server.store.findAccount("hero"))!;
  return { server, wire, app, account };
}

// 서버가 클라이언트의 시각을 그대로 받으므로 답은 지문만 싣고, 클라이언트는 자기 예측을 확정한다. 저장 데이터를 받아 오지 않는다.
test("commands are confirmed by fingerprint alone, and the client ends on the server's save", async () => {
  const { server, wire, app, account } = await start();
  const { cmd } = app.progress;
  for (const sent of [
    cmd.StatUpgrade({ upgradeId: 7001 }), cmd.ItemEquip({ equipmentId: 1 }), cmd.ItemEnhance({ equipmentId: 1 }),
    cmd.StageSelect({ stageId: 3002 }), cmd.BattleSettle({}), cmd.StatUpgrade({ upgradeId: 7002 }),
  ]) {
    expect(await sent).toBeUndefined();
  }
  expect(wire.syncs).toHaveLength(6);
  for (const sync of wire.syncs) expect(sync).not.toHaveProperty("changes");
  expect(wire.ops).not.toContain(Opcode.StateFetch);
  // 같은 틱 안의 정산처럼 아무것도 바꾸지 않은 커맨드는 revision을 올리지 않는다.
  const saved = (await server.store.load(account.id))!;
  expect(saved.revision).toBe(1 + wire.syncs.filter((sync, i) => sync.revision !== (wire.syncs[i - 1]?.revision ?? 1)).length);
  expect(app.state.player.value).toEqual(saved.player);
});

// 그 사이 다른 쪽이 저장 데이터를 바꾸면 서버가 확정한 결과는 예측과 다르다. 클라이언트는 저장 데이터를 받아 와 맞춘다.
test("a save changed elsewhere in between makes the fingerprint differ, and the client fetches the save", async () => {
  const { server, wire, app, account } = await start();
  const before = (await server.store.load(account.id))!;
  expect(await server.store.save(account.id, { ...before.player, tutorial: { stepId: 7 } }, before.revision, Date.now())).toBeTruthy();

  expect(await app.progress.cmd.StatUpgrade({ upgradeId: 7001 })).toBeUndefined();
  expect(wire.ops.filter(op => op === Opcode.StateFetch)).toHaveLength(1);
  const saved = (await server.store.load(account.id))!;
  expect(saved.player.tutorial).toEqual({ stepId: 7 });
  expect(app.state.player.value).toEqual(saved.player);

  // 맞춘 뒤로는 다시 지문만으로 확정한다.
  expect(await app.progress.cmd.StatUpgrade({ upgradeId: 7002 })).toBeUndefined();
  expect(wire.ops.filter(op => op === Opcode.StateFetch)).toHaveLength(1);
  expect(app.state.player.value).toEqual((await server.store.load(account.id))!.player);
});
