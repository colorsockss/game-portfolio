import { describe, expect, test } from "vitest";
import { createScope } from "../src/application/scope.js";
import { createPool } from "../src/presentation/pool.js";

// 만든 순서대로 "item1", "item2"…를 돌려주고 훅 호출을 기록한다. 만들기를 테스트가 끝내 줄 수도 있다.
function setUp(manual = false) {
  const log: string[] = [];
  const pending: (() => void)[] = [];
  let made = 0;
  const scope = createScope();
  const pool = createPool<string>(scope, {
    create() {
      const name = `item${++made}`;
      log.push(`create ${name}`);
      return manual ? new Promise(resolve => pending.push(() => resolve(name))) : Promise.resolve(name);
    },
    activate: (item, active) => log.push(`${active ? "on" : "off"} ${item}`),
    destroy: item => log.push(`destroy ${item}`),
  });
  return { log, scope, pool, finishCreate: () => pending.shift()!() };
}

describe("pool", () => {
  test("acquire creates an item when none is idle and activates it", async () => {
    const { log, pool } = setUp();
    expect(await pool.acquire()).toBe("item1");
    expect(log).toEqual(["create item1", "on item1"]);
  });

  test("a released item is deactivated and reused instead of creating a new one", async () => {
    const { log, pool } = setUp();
    const first = (await pool.acquire())!;
    pool.release(first);
    expect(await pool.acquire()).toBe(first);
    expect(log).toEqual(["create item1", "on item1", "off item1", "on item1"]);
  });

  test("releasing the same item twice returns it to the pool once", async () => {
    const { log, pool } = setUp();
    const first = (await pool.acquire())!;
    pool.release(first);
    pool.release(first);
    expect(await pool.acquire()).toBe(first);
    expect(await pool.acquire()).toBe("item2");
    expect(log.filter(line => line === "off item1")).toHaveLength(1);
  });

  test("an item the pool never made is ignored on release", () => {
    const { log, pool } = setUp();
    pool.release("stranger");
    expect(log).toEqual([]);
  });

  test("closing the scope destroys everything that was made, idle or in use", async () => {
    const { log, scope, pool } = setUp();
    const first = (await pool.acquire())!;
    await pool.acquire();
    pool.release(first);
    log.length = 0;
    scope.dispose();
    expect(log).toEqual(["destroy item1", "destroy item2"]);
  });

  test("a scope that closes while an item is being made resolves undefined and destroys it", async () => {
    const { log, scope, pool, finishCreate } = setUp(true);
    const acquiring = pool.acquire();
    scope.dispose();
    finishCreate();
    expect(await acquiring).toBeUndefined();
    expect(log).toEqual(["create item1", "destroy item1"]);
  });

  test("acquire after the scope closed makes nothing", async () => {
    const { log, scope, pool } = setUp();
    scope.dispose();
    expect(await pool.acquire()).toBeUndefined();
    expect(log).toEqual([]);
  });

  test("releasing after the scope closed destroys the item exactly once", async () => {
    const { log, scope, pool } = setUp();
    const first = (await pool.acquire())!;
    scope.dispose();
    pool.release(first);
    pool.release(first);
    expect(log.filter(line => line === "destroy item1")).toHaveLength(1);
  });
});
