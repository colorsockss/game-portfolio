import { expect, test } from "vitest";
import { createScope } from "../src/application/scope.js";
import type { AssetHandle, ResourceBridge } from "../src/presentation/ui/ports.js";
import { createResources } from "../src/presentation/ui/resources.js";
import type { WorldBridge } from "../src/presentation/world/ports.js";
import { createWorld } from "../src/presentation/world/world.js";

// 불러오기와 인스턴스 만들기를 기록하는 가짜 엔진. 로드는 테스트가 `finish()`할 때 끝난다.
function setUp() {
  const log: string[] = [];
  const pending: (() => void)[] = [];
  let created = 0;
  const resourceBridge: Pick<ResourceBridge, "load"> = {
    load: key => new Promise<AssetHandle>(resolve => {
      log.push(`load ${key}`);
      pending.push(() => resolve({ release: () => void log.push(`release ${key}`) }));
    }),
  };
  const bridge: WorldBridge = {
    create() {
      const id = ++created;
      log.push(`create ${id}`);
      return {
        root: { id } as never,
        setActive: active => void log.push(`active ${id} ${active}`),
        destroy: () => void log.push(`destroy ${id}`),
      };
    },
    shake: (strength, seconds) => void log.push(`shake ${strength} ${seconds}`),
    hitStop: seconds => void log.push(`hitStop ${seconds}`),
  };
  const world = createWorld({ bridge, resources: createResources(resourceBridge) });
  return { world, log, finish: () => pending.splice(0).forEach(done => done()) };
}

test("a prefab is loaded once per scope and key, however many instances are spawned", async () => {
  const t = setUp();
  const scope = createScope();
  const spawns = [t.world.spawn("Battle/Actor", scope), t.world.spawn("Battle/Actor", scope), t.world.spawn("Battle/DamageText", scope)];
  t.finish();
  const [first, second, text] = await Promise.all(spawns);
  expect(t.log.filter(entry => entry.startsWith("load"))).toEqual(["load Battle/Actor", "load Battle/DamageText"]);
  expect(first).not.toBe(second);
  expect([first, second, text].map(instance => (instance!.root as unknown as { id: number }).id)).toEqual([1, 2, 3]);

  // 다른 스코프는 따로 불러오고 따로 해제한다.
  const other = createScope();
  const again = t.world.spawn("Battle/Actor", other);
  t.finish();
  await again;
  expect(t.log.filter(entry => entry === "load Battle/Actor")).toHaveLength(2);
  // 이미 불러온 스코프에서는 더 불러오지 않는다.
  await t.world.spawn("Battle/Actor", scope);
  expect(t.log.filter(entry => entry === "load Battle/Actor")).toHaveLength(2);
});

test("closing the scope destroys each instance once, then releases the prefab", async () => {
  const t = setUp();
  const scope = createScope();
  const spawned = t.world.spawn("Battle/Actor", scope);
  t.finish();
  const instance = (await spawned)!;
  instance.setActive(false);
  // 풀처럼 먼저 없애도 스코프가 닫힐 때 다시 없애지 않는다.
  instance.destroy();
  scope.dispose();
  expect(t.log).toEqual(["load Battle/Actor", "create 1", "active 1 false", "destroy 1", "release Battle/Actor"]);
});

test("a scope that closed while the prefab loaded gets no instance and nothing is left loaded", async () => {
  const t = setUp();
  const scope = createScope();
  const spawned = t.world.spawn("Battle/Actor", scope);
  scope.dispose();
  t.finish();
  await expect(spawned).resolves.toBeUndefined();
  expect(t.log).toEqual(["load Battle/Actor", "release Battle/Actor"]);
  await expect(t.world.spawn("Battle/Actor", scope)).resolves.toBeUndefined();
});
