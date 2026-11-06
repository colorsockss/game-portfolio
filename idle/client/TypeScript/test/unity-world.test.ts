import { HERO_ID } from "@idle/game-core";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createScope } from "../src/application/scope.js";
import type { AssetHandle, ViewRoot } from "../src/presentation/ui/ports.js";
import { createResources } from "../src/presentation/ui/resources.js";
import type { BattleDirector, Direction } from "../src/presentation/world/battle-director.js";
import type { WorldBridge } from "../src/presentation/world/ports.js";
import { createWorld } from "../src/presentation/world/world.js";
import type { RefsSource } from "../src/unity/binding/refs.js";
import type { UnityAsset } from "../src/unity/resources.js";
import { battleView } from "../src/unity/views/battle.js";
import { createWorldBridge } from "../src/unity/world.js";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

test("a world instance is made from the loaded asset's id and shown, hidden and destroyed through the facade", () => {
  const made: number[] = [];
  const calls: string[] = [];
  const refs = {} as unknown as ReturnType<Parameters<typeof createWorldBridge>[0]["Create"]>;
  const bridge = createWorldBridge({
    Create: assetId => (made.push(assetId), refs),
    SetActive: (view, active) => void calls.push(`active ${view === refs} ${active}`),
    Destroy: view => void calls.push(`destroy ${view === refs}`),
    Shake: (strength, seconds) => void calls.push(`shake ${strength} ${seconds}`),
    HitStop: seconds => void calls.push(`hitStop ${seconds}`),
  });
  const instance = bridge.create({ id: 9, release: () => {} } as UnityAsset);
  expect(made).toEqual([9]);
  expect(instance.root).toBe(refs as unknown as ViewRoot);
  instance.setActive(false);
  instance.setActive(true);
  instance.destroy();
  bridge.shake(0.1, 0.2);
  bridge.hitStop(0.05);
  expect(calls).toEqual(["active true false", "active true true", "destroy true", "shake 0.1 0.2", "hitStop 0.05"]);
});

const HERO = { clips: "hero", color: [1, 1, 1], size: 1 } as const;
const SLIME = { clips: "monster", color: [0.3, 0.8, 0.4], size: 1 } as const;
const BOSS = { clips: "boss", color: [0.9, 0.2, 0.2], size: 1.6 } as const;
// 화면은 영웅을 기준으로 그린다: 영웅은 늘 화면 x -2에 서고, 다른 배우는 영웅과의 거리만큼 떨어져 선다. 여기서는 영웅의
// 시뮬레이션 x도 -2라서 화면 x가 시뮬레이션 x와 같다. 적 1(x 1.2, HP 절반)과 적 2(x 2). 영웅은 actor1, 적은 actor2(0번 줄),
// actor3(1번 줄)이 된다.
const withEnemies: Direction = {
  type: "reset",
  background: "meadow",
  hero: { look: HERO, hpRatio: 1, down: false, x: -2 },
  enemies: [{ id: 1, look: SLIME, boss: false, hpRatio: 0.5, x: 1.2 }, { id: 2, look: SLIME, boss: false, hpRatio: 1, x: 2 }],
  summons: [],
  projectiles: [],
};
const WHITE = [1, 1, 1] as const;
const WOLF = { clips: "summon", color: [0.8, 0.75, 0.6], size: 0.7 } as const;
const ARROW = { clip: "arrow", color: [1, 1, 1], size: 0.6, fromAbove: false } as const;

/**
 * 진짜 World 위의 전투 뷰. 엔진은 Battle/Actor에서 "actor1"…, Battle/DamageText에서 "text1"…, Battle/Projectile에서
 * "shot1"…, Battle/Stage에서 "stage1"을 만들고, 그 ActorView·FloatingText·ProjectileView·StageView와 인스턴스에 온 호출을
 * `log`에 "actor1.Hit(0.5)"처럼 남긴다. 배우의 EffectIcons는 "actor1fx"이고, 카메라의 흔들림과 히트스톱은 "world"다.
 * 시계와 연출자(BattleDirector)가 내는 지시는 테스트가 정하고, `frame()`이 한 프레임을 돌린다.
 */
function setUp() {
  const log: string[] = [];
  const counts = new Map<string, number>();
  const recorder = (name: string) =>
    // then이 없어야 await가 이것을 프로미스로 보지 않는다.
    new Proxy({}, { get: (_, method) => (method === "then" ? undefined : (...args: unknown[]) => void log.push(`${name}.${String(method)}(${args.join(", ")})`)) });
  const bridge: WorldBridge = {
    create(prefab) {
      const key = (prefab as unknown as { key: string }).key;
      const kinds: Record<string, [string, string[]]> = { "Battle/Actor": ["actor", ["actor", "effects"]], "Battle/Projectile": ["shot", ["projectile"]], "Battle/Stage": ["stage", ["stage"]] };
      const [kind, entries] = kinds[key] ?? ["text", ["text"]];
      const name = `${kind}${counts.set(kind, (counts.get(kind) ?? 0) + 1).get(kind)}`;
      const views = new Map(entries.map((entry, i) => [entry, recorder(i === 0 ? name : `${name}fx`)]));
      const refs: Pick<RefsSource, "GetKind" | "GetObject"> = { GetKind: entry => (views.has(entry) ? 0 : -1), GetObject: entry => views.get(entry)! };
      const instance = recorder(name) as { setActive(active: boolean): void; destroy(): void };
      return { root: refs as unknown as ViewRoot, setActive: active => instance.setActive(active), destroy: () => instance.destroy() };
    },
    shake: (strength, seconds) => void log.push(`world.shake(${strength}, ${seconds})`),
    hitStop: seconds => void log.push(`world.hitStop(${seconds})`),
  };
  const resources = createResources({ load: async key => ({ key, release: () => {} }) as AssetHandle });
  const world = createWorld({ bridge, resources });

  const pending: Direction[][] = [];
  let frames = 0;
  const director: BattleDirector = { frame: () => (frames++, pending.shift() ?? []) };
  const clock = { now: 0 };
  const scope = createScope();
  battleView.bind(scope, world, director, () => clock.now);
  return {
    log, scope, clock,
    frames: () => frames,
    async frame(...directions: Direction[]) {
      pending.push(directions);
      await vi.advanceTimersByTimeAsync(1);
    },
  };
}

test("a reset stands the hero and the enemies at their x, the enemies in lanes in order, and a later reset clears the enemies", async () => {
  const t = setUp();
  await t.frame(withEnemies);
  const [r, g, b] = HERO.color;
  // 영웅 편은 오른쪽(1), 적은 왼쪽(-1)을 본다.
  expect(t.log).toEqual([
    "actor1.setActive(true)", "stage1.Show(meadow)", `actor1.Setup(hero, ${r}, ${g}, ${b}, 1, 1)`, "actor1.Place(-2, 0)", "actor1.Revive(1)",
    "actor2.setActive(true)", "actor2.Setup(monster, 0.3, 0.8, 0.4, 1, -1)", "actor2.Place(1.2, 0)", "actor2.Revive(0.5)",
    "actor3.setActive(true)", "actor3.Setup(monster, 0.3, 0.8, 0.4, 1, -1)", "actor3.Place(2, 0.9)", "actor3.Revive(1)",
  ]);

  t.log.length = 0;
  await t.frame({ type: "reset", background: "lava", hero: { look: HERO, hpRatio: 0, down: true, x: -2 }, enemies: [], summons: [], projectiles: [] });
  // 세운 영웅은 다시 세우지 않는다. 쓰러졌으면 쓰러뜨리고, 사라진 적은 흐려지며 물러나 0.3초 뒤에 풀로 돌아간다.
  expect(t.log).toEqual(["stage1.Show(lava)", "actor1.Die()", "actor2.Leave()", "actor3.Leave()"]);
  t.log.length = 0;
  t.clock.now += 300;
  await t.frame();
  expect(t.log).toEqual(["actor2.setActive(false)", "actor3.setActive(false)"]);
});

test("a later reset keeps the actors and shots still there, moving them to their x and setting their HP, and stands only new ones", async () => {
  const t = setUp();
  await t.frame({ ...withEnemies, projectiles: [{ id: 5, by: HERO_ID, targets: [1], look: ARROW, flightSeconds: 0.2 }] });
  t.log.length = 0;
  // 강화 뒤처럼 같은 장면이 이어진다: 적 1은 HP가 줄어 그 자리에 있고, 적 2는 사라졌고, 적 9가 새로 나왔다. 발사체 5는 날고 있다.
  await t.frame({
    type: "reset", background: "meadow", hero: { look: HERO, hpRatio: 0.8, down: false, x: -2 },
    enemies: [{ id: 1, look: SLIME, boss: false, hpRatio: 0.25, x: 1.2 }, { id: 9, look: SLIME, boss: false, hpRatio: 1, x: 3.5 }],
    summons: [], projectiles: [{ id: 5, by: HERO_ID, targets: [1], look: ARROW, flightSeconds: 0.1 }],
  });
  // 적 9는 물러나는 적 2(actor3)가 아직 풀에 돌아오지 않아 새 배우(actor4)에 선다.
  expect(t.log).toEqual([
    "stage1.Show(meadow)", "actor1.SetHp(0.8)", "actor3.Leave()", "actor2.SetHp(0.25)",
    "actor4.setActive(true)", "actor4.Setup(monster, 0.3, 0.8, 0.4, 1, -1)", "actor4.Place(3.5, 0.9)", "actor4.Revive(1)",
  ]);
});

test("a reset with the hero walked ahead still stands it at -2 and the others by their distance from it", async () => {
  const t = setUp();
  await t.frame({ ...withEnemies, hero: { look: HERO, hpRatio: 1, down: false, x: 1 }, enemies: [{ id: 1, look: SLIME, boss: false, hpRatio: 1, x: 3 }] });
  expect(t.log.filter(call => call.includes(".Place("))).toEqual(["actor1.Place(-2, 0)", "actor2.Place(0, 0)"]);
});

test("an enemy that dies goes back to the pool 0.3 s later, the others keep their places, and the next one appears at its x in the first free lane", async () => {
  const t = setUp();
  await t.frame(withEnemies);
  t.log.length = 0;
  await t.frame({ type: "death", id: 1 });
  // 쓰러진 자리에서 조각이 터진다.
  expect(t.log).toEqual(["actor2.Die()", "stage1.Burst(1.2, 0, 0.85, 0.85, 0.85, 16, 0.18)"]);
  t.clock.now += 299;
  await t.frame();
  expect(t.log).toHaveLength(2);
  t.clock.now += 1;
  await t.frame();
  expect(t.log.slice(2)).toEqual(["actor2.setActive(false)"]);

  t.log.length = 0;
  await t.frame({ type: "monsterAppear", id: 3, look: BOSS, boss: true, x: 3.5 });
  expect(t.log).toEqual(["actor2.setActive(true)", "actor2.Setup(boss, 0.9, 0.2, 0.2, 1.6, -1)", "actor2.Place(3.5, 0)"]);
});

test("a retreat takes every enemy away", async () => {
  const t = setUp();
  await t.frame(withEnemies);
  t.log.length = 0;
  await t.frame({ type: "death", id: HERO_ID }, { type: "retreat" });
  expect(t.log).toEqual(["actor1.Die()", "stage1.Burst(-2, 0, 0.85, 0.85, 0.85, 16, 0.18)", "actor2.Die()", "actor3.Die()"]);
  t.clock.now += 300;
  await t.frame({ type: "monsterAppear", id: 3, look: SLIME, boss: false, x: 3.5 });
  expect(t.log.slice(4)).toEqual([
    "actor2.setActive(false)", "actor3.setActive(false)",
    "actor2.setActive(true)", "actor2.Setup(monster, 0.3, 0.8, 0.4, 1, -1)", "actor2.Place(3.5, 0)",
  ]);
});

test("attacks play their clip timed to the impact, the hero falls and gets back up", async () => {
  const t = setUp();
  await t.frame(withEnemies);
  t.log.length = 0;
  await t.frame(
    { type: "attack", by: HERO_ID, clip: "cast", impactSeconds: 0.4 },
    { type: "attack", by: 2, clip: "attack", impactSeconds: 0 },
    { type: "death", id: HERO_ID },
    { type: "revive" },
  );
  expect(t.log).toEqual(["actor1.Attack(cast, 0.4)", "actor3.Attack(attack, 0)", "actor1.Die()", "stage1.Burst(-2, 0, 0.85, 0.85, 0.85, 16, 0.18)", "actor1.Revive(1)"]);
});

test("a hit flashes its target, sparks in its colour and floats the damage over it, crits larger and yellow, back in the pool 0.8 s later", async () => {
  const t = setUp();
  await t.frame(withEnemies);
  t.log.length = 0;
  await t.frame({ type: "hit", target: 1, hpRatio: 0.25, text: "12", crit: false, sparks: WHITE }, { type: "hit", target: 2, hpRatio: 0.5, text: "12", crit: false, sparks: [1, 0.5, 0.15] });
  expect(t.log).toEqual([
    "actor2.Hit(0.25)", "stage1.Burst(1.2, 0, 1, 1, 1, 6, 0.12)", "text1.setActive(true)", "text1.Show(12, 1, 1, 1, 1, 1.2, 1.2, true)",
    "actor3.Hit(0.5)", "stage1.Burst(2, 0.9, 1, 0.5, 0.15, 6, 0.12)", "text2.setActive(true)", `text2.Show(12, 1, 1, 1, 1, 2, ${0.9 + 1.2}, true)`,
  ]);

  // 치명타는 불꽃이 두 배다.
  t.log.length = 0;
  t.clock.now += 400;
  await t.frame({ type: "hit", target: HERO_ID, hpRatio: 0.9, text: "30!", crit: true, sparks: WHITE });
  expect(t.log).toEqual(["actor1.Hit(0.9)", "stage1.Burst(-2, 0, 1, 1, 1, 12, 0.12)", "text3.setActive(true)", "text3.Show(30!, 1, 0.85, 0.2, 1.5, -2, 1.2, false)"]);

  t.log.length = 0;
  t.clock.now += 399;
  await t.frame();
  expect(t.log).toEqual([]);
  t.clock.now += 1;
  await t.frame();
  expect(t.log).toEqual(["text1.setActive(false)", "text2.setActive(false)"]);
  t.clock.now += 400;
  await t.frame();
  expect(t.log).toEqual(["text1.setActive(false)", "text2.setActive(false)", "text3.setActive(false)"]);
  // 없는 적을 맞힌 지시는 아무것도 하지 않는다.
  t.log.length = 0;
  await t.frame({ type: "hit", target: 9, hpRatio: 0, text: "1", crit: false, sparks: WHITE });
  expect(t.log).toEqual([]);
});

test("a banner floats in the middle above the fight", async () => {
  const t = setUp();
  await t.frame({ type: "banner", text: "보스 등장!" });
  expect(t.log).toContain("text1.Show(보스 등장!, 1, 1, 1, 1.2, 0, 2, false)");
});

test("banners in one frame float one after another instead of on top of each other", async () => {
  const t = setUp();
  await t.frame(
    { type: "banner", text: "보스 처치!" }, { type: "banner", text: "화염 드래곤의 둥지 클리어" }, { type: "banner", text: "웨이브 1/3" },
  );
  const shown = () => t.log.filter(call => call.includes(".Show("));
  expect(shown()).toEqual(["text1.Show(보스 처치!, 1, 1, 1, 1.2, 0, 2, false)"]);
  // 0.6초마다 하나씩 뜬다.
  t.clock.now += 599;
  await t.frame();
  expect(shown()).toHaveLength(1);
  t.clock.now += 1;
  await t.frame();
  expect(shown()).toEqual(["text1.Show(보스 처치!, 1, 1, 1, 1.2, 0, 2, false)", "text2.Show(화염 드래곤의 둥지 클리어, 1, 1, 1, 1.2, 0, 2, false)"]);
  t.clock.now += 600;
  await t.frame();
  // 첫 글자는 0.8초에 풀로 돌아와 다시 쓰인다.
  expect(shown()[2]).toBe("text1.Show(웨이브 1/3, 1, 1, 1, 1.2, 0, 2, false)");
});

test("a background direction changes the stage's picture", async () => {
  const t = setUp();
  await t.frame({ type: "background", background: "forest" });
  expect(t.log).toContain("stage1.Show(forest)");
});

test("a cover direction covers the stage in its color for a moment", async () => {
  const t = setUp();
  await t.frame({ type: "cover", color: [0.22, 0.02, 0.02] });
  expect(t.log).toContain("stage1.Cover(0.22, 0.02, 0.02)");
});

test("a level-up floats in green above the hero, higher than a banner", async () => {
  const t = setUp();
  await t.frame(withEnemies, { type: "banner", text: "숲의 입구 클리어" }, { type: "levelUp", text: "레벨 업! Lv.2" });
  expect(t.log).toContain("text2.Show(레벨 업! Lv.2, 0.4, 1, 0.5, 1.2, -2, 3, false)");
});

test("closing the scope stops the frames and destroys every actor and text once", async () => {
  const t = setUp();
  await t.frame(withEnemies, { type: "hit", target: 1, hpRatio: 0.5, text: "1", crit: false, sparks: WHITE });
  const frames = t.frames();
  t.log.length = 0;
  t.scope.dispose();
  await t.frame();
  expect(t.frames()).toBe(frames);
  expect(t.log.sort()).toEqual(["actor1.destroy()", "actor2.destroy()", "actor3.destroy()", "stage1.destroy()", "text1.destroy()"]);
});

test("a summon appears at its summoner's x in an ally lane, takes hits there and fades out when it expires", async () => {
  const t = setUp();
  await t.frame(withEnemies);
  t.log.length = 0;
  await t.frame({ type: "summonAppear", id: 7, by: HERO_ID, look: WOLF, ally: true });
  expect(t.log).toEqual(["actor4.setActive(true)", "actor4.Setup(summon, 0.8, 0.75, 0.6, 0.7, 1)", "actor4.Place(-2, 0.9)"]);

  t.log.length = 0;
  await t.frame({ type: "hit", target: 7, hpRatio: 0.5, text: "3", crit: false, sparks: WHITE }, { type: "attack", by: 7, clip: "attack", impactSeconds: 0.2 });
  expect(t.log).toEqual([
    "actor4.Hit(0.5)", "stage1.Burst(-2, 0.9, 1, 1, 1, 6, 0.12)", "text1.setActive(true)", `text1.Show(3, 1, 1, 1, 1, -2, ${0.9 + 1.2}, true)`,
    "actor4.Attack(attack, 0.2)",
  ]);

  // 만료는 흐려지며 물러나고, 적의 대형은 그대로다.
  t.log.length = 0;
  await t.frame({ type: "summonLeave", id: 7 });
  expect(t.log).toEqual(["actor4.Leave()"]);
  t.clock.now += 300;
  await t.frame();
  expect(t.log).toEqual(["actor4.Leave()", "actor4.setActive(false)"]);
});

test("a reset stands the summons and flies the projectiles still in flight", async () => {
  const t = setUp();
  await t.frame({
    ...withEnemies,
    summons: [{ id: 7, look: WOLF, ally: true, hpRatio: 0.5, x: -2 }, { id: 8, look: SLIME, ally: false, hpRatio: 1, x: 2.3 }],
    projectiles: [{ id: 5, by: HERO_ID, targets: [1], look: ARROW, flightSeconds: 0.2 }],
  });
  expect(t.log.slice(13)).toEqual([
    "actor4.setActive(true)", "actor4.Setup(summon, 0.8, 0.75, 0.6, 0.7, 1)", "actor4.Place(-2, 0.9)", "actor4.Revive(0.5)",
    // 적이 부른 소환수는 적의 다음 줄에 선다.
    "actor5.setActive(true)", "actor5.Setup(monster, 0.3, 0.8, 0.4, 1, -1)", "actor5.Place(2.3, -0.9)", "actor5.Revive(1)",
    "shot1.setActive(true)", `shot1.Fly(arrow, -2, ${0 + 0.2}, 1.2, 0, 0.2, 1, 1, 1, 0.6)`,
  ]);
});

test("a projectile flies from its shooter to each target, lands at once or fizzles out before it goes back to the pool", async () => {
  const t = setUp();
  await t.frame(withEnemies);
  t.log.length = 0;
  await t.frame({ type: "launch", id: 9, by: HERO_ID, targets: [1, 2], look: { clip: "orb", color: [1, 0.5, 0.2], size: 0.7, fromAbove: false }, flightSeconds: 0.4 });
  expect(t.log).toEqual([
    "shot1.setActive(true)", `shot1.Fly(orb, -2, ${0 + 0.2}, 1.2, 0, 0.4, 1, 0.5, 0.2, 0.7)`,
    "shot2.setActive(true)", `shot2.Fly(orb, -2, ${0 + 0.2}, 2, 0.9, 0.4, 1, 0.5, 0.2, 0.7)`,
  ]);
  t.log.length = 0;
  await t.frame({ type: "projectileEnd", id: 9, landed: true });
  expect(t.log).toEqual(["shot1.setActive(false)", "shot2.setActive(false)"]);

  // 운석은 대상 위에서 떨어진다. 떨어지기 전에 사라지면 작아진 뒤 0.15초에 풀로 돌아간다.
  t.log.length = 0;
  await t.frame({ type: "launch", id: 10, by: 1, targets: [HERO_ID], look: { clip: "rock", color: [1, 1, 1], size: 1.2, fromAbove: true }, flightSeconds: 1 });
  await t.frame({ type: "projectileEnd", id: 10, landed: false });
  expect(t.log).toEqual(["shot1.setActive(true)", "shot1.Fly(rock, -3.5, 6, -2, 0, 1, 1, 1, 1, 1.2)", "shot1.Fizzle()"]);
  t.clock.now += 149;
  await t.frame();
  expect(t.log).toHaveLength(3);
  t.clock.now += 1;
  await t.frame();
  expect(t.log.slice(3)).toEqual(["shot1.setActive(false)"]);
  // 화면에 없는 배우가 쏘거나 맞는 발사체는 보이지 않는다.
  t.log.length = 0;
  await t.frame({ type: "launch", id: 11, by: 99, targets: [1], look: ARROW, flightSeconds: 0.2 }, { type: "projectileEnd", id: 11, landed: true });
  expect(t.log).toEqual([]);
});

test("effect icons go to the fighter's EffectIcons and a damage-over-time tick moves its bar and floats a small number", async () => {
  const t = setUp();
  await t.frame(withEnemies);
  t.log.length = 0;
  await t.frame(
    { type: "effects", target: 1, effects: [{ icon: "effect_burn", color: [0.7, 0.35, 0.9], seconds: 3, total: 3 }, { icon: "", color: [1, 0.85, 0.2], seconds: 1, total: 1.5 }] },
    { type: "effects", target: HERO_ID, effects: [] },
    { type: "effects", target: 99, effects: [] },
  );
  expect(t.log).toEqual(["actor2fx.SetCount(2)", "actor2fx.Show(0, effect_burn, 0.7, 0.35, 0.9, 3, 3)", "actor2fx.Show(1, , 1, 0.85, 0.2, 1, 1.5)", "actor1fx.SetCount(0)"]);

  t.log.length = 0;
  await t.frame({ type: "dot", target: 1, text: "20", heal: false, hpRatio: 0.25 }, { type: "dot", target: HERO_ID, text: "+5", heal: true, hpRatio: 1 });
  expect(t.log).toEqual([
    "actor2.SetHp(0.25)", "text1.setActive(true)", `text1.Show(20, 0.8, 0.5, 1, 0.75, ${1.2 + 0.6}, 0.3, true)`,
    "actor1.SetHp(1)", "text2.setActive(true)", `text2.Show(+5, 0.55, 1, 0.55, 0.75, ${-2 + 0.6}, 0.3, false)`,
  ]);
});

test("the hero walks in place while the stage scrolls by its step and the others shift back by it, a long jump walks, and hits float at the new x", async () => {
  const t = setUp();
  await t.frame(withEnemies);
  t.log.length = 0;
  await t.frame({ type: "move", places: [{ id: HERO_ID, x: -1.8, moving: true }, { id: 1, x: 1.1, moving: true }, { id: 99, x: 0, moving: true }] });
  // 영웅이 앞으로 걸은 만큼 배경이 흐르고, 걷지 않은 적 2도 화면에서 그만큼 뒤로 간다(걷지 않는 채로).
  const step = -1.8 - -2;
  expect(t.log).toEqual([
    "actor1.MoveTo(-2, 0, 0.1, true)", `stage1.Scroll(${step}, 0.1)`, `actor2.MoveTo(${1.1 - step}, 0, 0.1, true)`, `actor3.MoveTo(${2 - step}, 0.9, 0.1, false)`,
  ]);
  // 한 번에 멀리 옮겨지면 거리 ÷ 6초 동안 걸어간다.
  t.log.length = 0;
  await t.frame({ type: "move", places: [{ id: 2, x: -1, moving: false }] }, { type: "hit", target: 2, hpRatio: 1, text: "1", crit: false, sparks: WHITE });
  expect(t.log.slice(0, 3)).toEqual([
    `actor3.MoveTo(${-1 - step}, 0.9, ${Math.abs(-1 - step - (2 - step)) / 6}, true)`, "actor3.Hit(1)", `stage1.Burst(${-1 - step}, 0.9, 1, 1, 1, 6, 0.12)`,
  ]);
  // 경계에서 영웅이 제자리로 돌아가는 것은 배경을 흘리지 않는다.
  t.log.length = 0;
  await t.frame({ type: "move", places: [{ id: HERO_ID, x: -2, moving: false }] });
  expect(t.log).toEqual(["actor1.MoveTo(-2, 0, 0.1, false)", "actor2.MoveTo(1.1, 0, 0.1, true)", "actor3.MoveTo(-1, 0.9, 0.1, false)"]);
});

test("a hit stop and a shake go to the world's camera", async () => {
  const t = setUp();
  await t.frame({ type: "hitStop", seconds: 0.05 }, { type: "shake", strength: 0.06, seconds: 0.12 });
  expect(t.log.filter(entry => entry.startsWith("world."))).toEqual(["world.hitStop(0.05)", "world.shake(0.06, 0.12)"]);
});
