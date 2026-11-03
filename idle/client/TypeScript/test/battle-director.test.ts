import { readFileSync } from "node:fs";
import { Big } from "@idle/big-number";
import { loadGameData, SoundChannel, type SoundsId } from "@idle/data-schema";
import { BattleMode, freshBattle, HERO_ID, NO_EQUIPMENT, NO_REBIRTH, NO_STAT_UPGRADES, playerBattle, type BattleSnapshot, startSkills } from "@idle/game-core";
import { signal } from "@preact/signals-core";
import { expect, test } from "vitest";
import type { ShownEvent, UpcomingAttack } from "../src/application/battle/battle.js";
import { ATTACK_LEAD_MS, createBattleDirector, type Direction } from "../src/presentation/world/battle-director.js";
import { texts } from "./support/text.js";

const data = await loadGameData(table => readFileSync(new URL(`../../../shared/data-schema/data/${table}.bytes`, import.meta.url)));
const STAGE = 3001;

const hero = {
  level: 1, hp: Big.from(50), maxHp: Big.from(100), down: false, effects: [], x: -2, moving: false, attack: Big.from(10), critChance: 0, skills: [],
};
const monster = { id: 1, monsterId: 1, boss: false, hp: Big.from(5000), maxHp: Big.from(10_000), effects: [], x: 1, moving: false };
const second = { ...monster, id: 2, monsterId: 2, maxHp: Big.from(400) };

function snapshot(overrides: Partial<BattleSnapshot> = {}): BattleSnapshot {
  return {
    stageId: STAGE, mode: BattleMode.Hunt, waves: 2, wavesNeeded: 3, autoBoss: true, hasBoss: true,
    bossTicksLeft: null, hero, enemies: [monster, second], summons: [], projectiles: [], items: {}, ...overrides,
  };
}

type Next = { events?: readonly ShownEvent[]; upcoming?: readonly UpcomingAttack[]; snapshot?: BattleSnapshot | undefined };

// 이벤트, 예측한 공격, 스냅숏을 테스트가 정해 주는 전투 서비스. 한 프레임의 이벤트는 `advance()`가 한 번 내놓는다.
function setUp(first: BattleSnapshot | null = snapshot(), gameData = data) {
  const shown = signal<BattleSnapshot | undefined>(first ?? undefined);
  let events: readonly ShownEvent[] = [];
  let upcoming: readonly UpcomingAttack[] = [];
  const leads: number[] = [];
  const played: SoundsId[] = [];
  const audio = { play: (key: SoundsId) => void played.push(key) };
  const { t } = texts(gameData);
  const battle = { advance: () => events, snapshot: shown, upcoming: (ms: number) => (leads.push(ms), upcoming) };
  const director = createBattleDirector({ battle, data: gameData, t, audio });
  return {
    /** 지금까지 낸 효과음의 키. */
    played,
    /** 연출자가 `upcoming()`에 물은 시간(ms). */
    leads,
    /** 서비스가 이 프레임에 내놓을 것을 정하고 프레임을 돌린다. 자리 지시(move)는 따로 시험하므로 뺀다. */
    frame(next: Next = {}) {
      return this.frameAll(next).filter(direction => direction.type !== "move");
    },
    /** frame과 같되 자리 지시도 그대로 돌려준다. */
    frameAll(next: Next = {}) {
      events = next.events ?? [];
      upcoming = next.upcoming ?? [];
      if ("snapshot" in next) shown.value = next.snapshot;
      return director.frame();
    },
  };
}

// 영웅의 모습: Heroes의 그림 묶음과 크기, 색은 입히지 않음.
const HERO = { clips: "hero", color: [1, 1, 1], size: 1 };

// 불꽃의 색: 물리(모르는 스킬도), 불, 얼음.
const PHYSICAL = [1, 0.95, 0.75];
const FIRE = [1, 0.5, 0.15];
const ICE = [0.6, 0.9, 1];
const CRIT_FEEL = [{ type: "hitStop", seconds: 0.05 }, { type: "shake", strength: 0.06, seconds: 0.12 }];
const HERO_HURT = { type: "shake", strength: 0.12, seconds: 0.2 };

// `hits`는 [대상 id, 피해, 남은 HP]의 목록이다.
const attack = (by: number, hits: readonly (readonly [number, number, number])[], crit = false): ShownEvent => ({
  tick: 1, type: "attack", by, skillId: 1, crit,
  hits: hits.map(([target, damage, hp]) => ({ target, damage: Big.from(damage), absorbed: Big.ZERO, hp: Big.from(hp) })),
});

test("a normal monster appears in a color fixed by its ID, a boss in red and larger, a drawn one untinted", () => {
  const t = setUp();
  const appear = (monsterId: number, boss: boolean) => t.frame({ events: [{ tick: 1, type: "spawn", id: 7, monsterId, boss, x: 5.5 }] });

  const [first] = appear(1, false);
  // 몬스터는 시뮬레이션이 정한 자리에 나타난다.
  expect(first).toEqual({ type: "monsterAppear", id: 7, look: expect.anything(), boss: false, x: 5.5 });
  if (first.type !== "monsterAppear") throw new Error("not an appearance");
  expect(first.look.size).toBe(1);
  // hue = 0.618034, saturation 0.6, value 0.9.
  expect(first.look.color[0]).toBeCloseTo(0.36);
  expect(first.look.color[1]).toBeCloseTo(0.5176, 3);
  expect(first.look.color[2]).toBeCloseTo(0.9);

  expect(appear(1, false)).toEqual([first]);
  expect(appear(2, false)).not.toEqual([first]);

  expect(appear(1, true)).toEqual([
    { type: "monsterAppear", id: 7, look: { clips: "boss", color: [0.9, 0.2, 0.2], size: 1.6 }, boss: true, x: 5.5 },
  ]);
  expect(first.look.clips).toBe("monster");
  // 그림이 있는 몬스터는 색을 입히지 않고, 데이터에 정한 종별 크기로 세운다.
  expect(appear(2001, false)).toEqual([
    { type: "monsterAppear", id: 7, look: { clips: "green_slime", color: [1, 1, 1], size: 0.45 }, boss: false, x: 5.5 },
  ]);
  expect(appear(2002, false)).toEqual([
    { type: "monsterAppear", id: 7, look: { clips: "forest_boar", color: [1, 1, 1], size: 0.65 }, boss: false, x: 5.5 },
  ]);
  expect(appear(2003, false)).toEqual([
    { type: "monsterAppear", id: 7, look: { clips: "goblin_scout", color: [1, 1, 1], size: 0.75 }, boss: false, x: 5.5 },
  ]);
  expect(appear(2004, false)).toEqual([
    { type: "monsterAppear", id: 7, look: { clips: "goblin_archer", color: [1, 1, 1], size: 0.75 }, boss: false, x: 5.5 },
  ]);
});

test("an attack shows each hit's damage and its target's remaining HP", () => {
  const t = setUp();
  // 공격하는 배우는 예측한 공격(upcoming)이 먼저 움직였으므로 지시가 없다.
  expect(t.frame({ events: [attack(HERO_ID, [[1, 1234, 2500]])] })).toEqual([
    { type: "hit", target: 1, hpRatio: 0.25, text: "1.2K", crit: false, sparks: PHYSICAL },
  ]);
  // 범위 공격은 맞은 대상마다 그 대상의 최대 HP로 비율을 낸다. 치명타는 그 뒤에 월드를 멈추고 흔든다.
  expect(t.frame({ events: [attack(HERO_ID, [[1, 1234, 2500], [2, 1234, 100]], true)] })).toEqual([
    { type: "hit", target: 1, hpRatio: 0.25, text: "1.2K!", crit: true, sparks: PHYSICAL },
    { type: "hit", target: 2, hpRatio: 0.25, text: "1.2K!", crit: true, sparks: PHYSICAL },
    ...CRIT_FEEL,
  ]);
  expect(t.frame({ events: [attack(2, [[HERO_ID, 20, 30]])] })).toEqual([
    { type: "hit", target: HERO_ID, hpRatio: 0.3, text: "20", crit: false, sparks: PHYSICAL },
  ]);
});

test("an upcoming attack plays its clip ahead of the impact: attack for a basic attack, cast for a skill, special for a boss skill", () => {
  const boss = { ...monster, id: 3, boss: true };
  const t = setUp(snapshot({ enemies: [monster, boss] }));
  // 1001은 기본 공격(재사용 대기 0), 1002와 1004는 재사용 대기가 있는 스킬이다. 재사용 대기 0인 스킬이 없는 배우의
  // 기본 공격은 skillId 0이다.
  expect(t.frame({
    events: [attack(1, [[HERO_ID, 5, 45]])],
    upcoming: [
      { by: HERO_ID, skillId: 1001, inMs: 400 },
      { by: HERO_ID, skillId: 1004, inMs: 100 },
      { by: 1, skillId: 1002, inMs: 0 },
      { by: 3, skillId: 1002, inMs: 500 },
      { by: 3, skillId: 1001, inMs: 250 },
      { by: 3, skillId: 0, inMs: 300 },
    ],
  })).toEqual([
    { type: "hit", target: HERO_ID, hpRatio: 0.45, text: "5", crit: false, sparks: PHYSICAL },
    { type: "attack", by: HERO_ID, clip: "attack", impactSeconds: 0.4 },
    { type: "attack", by: HERO_ID, clip: "cast", impactSeconds: 0.1 },
    { type: "attack", by: 1, clip: "cast", impactSeconds: 0 },
    { type: "attack", by: 3, clip: "special", impactSeconds: 0.5 },
    { type: "attack", by: 3, clip: "attack", impactSeconds: 0.25 },
    { type: "attack", by: 3, clip: "attack", impactSeconds: 0.3 },
  ]);
  // 가장 긴 선딜레이(보스 전용 0.375초)보다 먼저 묻는다.
  expect(t.leads).toEqual([ATTACK_LEAD_MS]);
  expect(ATTACK_LEAD_MS).toBeGreaterThan(375);
});

test("a projectile flies from its shooter to each target and shows its hits with their sound when it lands", () => {
  const t = setUp();
  const shot: ShownEvent[] = [
    { tick: 1, type: "attack", by: HERO_ID, skillId: 1005, crit: true, hits: [] },
    { tick: 1, type: "launch", id: 9, by: HERO_ID, projectileId: 5002, targets: [1, 2], flightTicks: 4 },
  ];
  // 쏘는 배우는 upcoming이 먼저 움직였다. 5002는 화염구(주황 구)다.
  expect(t.frame({ events: shot })).toEqual([
    { type: "launch", id: 9, by: HERO_ID, targets: [1, 2], look: { clip: "orb", color: [1, 0.5, 0.15], size: 0.9, fromAbove: false }, flightSeconds: 0.4 },
  ]);
  expect(t.played).toEqual([]);
  const { hits } = attack(HERO_ID, [[1, 1234, 2500], [2, 1234, 100]]) as Extract<ShownEvent, { type: "attack" }>;
  expect(t.frame({ events: [{ tick: 5, type: "impact", id: 9, by: HERO_ID, skillId: 1005, crit: true, hits }, { tick: 6, type: "vanish", id: 10 }] })).toEqual([
    { type: "projectileEnd", id: 9, landed: true },
    { type: "hit", target: 1, hpRatio: 0.25, text: "1.2K!", crit: true, sparks: FIRE },
    { type: "hit", target: 2, hpRatio: 0.25, text: "1.2K!", crit: true, sparks: FIRE },
    ...CRIT_FEEL,
    { type: "projectileEnd", id: 10, landed: false },
  ]);
  expect(t.played).toEqual([data.constants.critSfx]);
  // 운석(5004)은 대상 위에서 떨어지고, 모르는 발사체는 회색 구다.
  const [meteor, unknown] = t.frame({ events: [
    { tick: 7, type: "launch", id: 11, by: 3, projectileId: 5004, targets: [HERO_ID], flightTicks: 10 },
    { tick: 7, type: "launch", id: 12, by: 3, projectileId: 1, targets: [HERO_ID], flightTicks: 1 },
  ] });
  expect(meteor).toMatchObject({ look: { clip: "rock", fromAbove: true }, flightSeconds: 1 });
  expect(unknown).toMatchObject({ look: { clip: "orb", color: [0.8, 0.8, 0.8] } });
});


test("a summon walks out from its summoner, leaves when it expires, and its death is not a kill to sound", () => {
  const t = setUp();
  expect(t.frame({ events: [attack(HERO_ID, []), { tick: 1, type: "summon", id: 9, by: HERO_ID, summonId: 6001, ticksLeft: 250 }] })).toEqual([
    { type: "summonAppear", id: 9, by: HERO_ID, look: { clips: "spirit_wolf", color: [1, 1, 1], size: 0.9 }, ally: true },
  ]);
  expect(t.frame({ events: [{ tick: 5, type: "death", id: 9 }, { tick: 6, type: "expire", id: 10 }, { tick: 7, type: "death", id: 1 }] })).toEqual([
    { type: "death", id: 9 }, { type: "summonLeave", id: 10 }, { type: "death", id: 1 },
  ]);
  expect(t.played).toEqual([data.constants.killSfx]);
  // 몬스터가 부른 소환수도 Summons의 모습이고 적 편에 선다.
  expect(t.frame({ events: [{ tick: 8, type: "summon", id: 11, by: 1, summonId: 6001, ticksLeft: 250 }] })).toEqual([
    { type: "summonAppear", id: 11, by: 1, look: { clips: "spirit_wolf", color: [1, 1, 1], size: 0.9 }, ally: false },
  ]);
});

test("a reset learns the summons standing from the snapshot, so their deaths are not kills either", () => {
  const wolf = { id: 7, summonId: 6001, by: HERO_ID, ally: true, hp: Big.from(30), maxHp: Big.from(60), ticksLeft: 100, effects: [], x: -2, moving: false };
  const t = setUp(snapshot({ summons: [wolf] }));
  const [reset] = t.frame({ events: [{ tick: 0, type: "reset" }] });
  expect(reset).toMatchObject({ summons: [{ id: 7, look: { clips: "spirit_wolf" }, ally: true, hpRatio: 0.5 }] });
  t.frame({ events: [{ tick: 1, type: "death", id: 7 }], snapshot: snapshot() });
  expect(t.played).toEqual([]);
});

test("each fighter's effects become icons when they change, are refreshed or wear off, and again after a reset", () => {
  const burn = { effectId: 4002, stacks: 1, ticksLeft: 30 };
  const t = setUp();
  const withBurn = (effects: readonly { effectId: number; stacks: number; ticksLeft: number }[]) =>
    snapshot({ enemies: [{ ...monster, effects: [...effects] }, second] });
  // 화상(지속 피해)은 보라, 공격력 버프(4005)는 초록, 둔화(4004: 공격 간격이 늘어남)는 빨강이다. 막대는 처음 지속 시간에 비례한다.
  expect(t.frame({ snapshot: withBurn([burn]) })).toEqual([
    { type: "effects", target: 1, effects: [{ color: [0.7, 0.35, 0.9], seconds: 3, total: 3 }] },
  ]);
  expect(t.frame({ snapshot: withBurn([{ ...burn, ticksLeft: 29 }]) })).toEqual([]);
  expect(t.frame({ snapshot: withBurn([{ ...burn, ticksLeft: 30 }]) })).toHaveLength(1);
  const buffed = snapshot({ hero: { ...hero, effects: [{ effectId: 4005, stacks: 1, ticksLeft: 100 }, { effectId: 4004, stacks: 2, ticksLeft: 40 }] } });
  expect(t.frame({ snapshot: buffed })).toEqual([
    { type: "effects", target: HERO_ID, effects: [{ color: [0.35, 0.85, 0.4], seconds: 10, total: 10 }, { color: [0.9, 0.3, 0.3], seconds: 4, total: 4 }] },
    { type: "effects", target: 1, effects: [] },
  ]);
  expect(t.frame({ events: [{ tick: 9, type: "reset" }] }).filter(direction => direction.type === "effects")).toEqual([
    expect.objectContaining({ target: HERO_ID }),
  ]);
});

test("a damage-over-time or heal tick moves the bar without a flash and floats a small number", () => {
  const t = setUp();
  expect(t.frame({ events: [
    { tick: 1, type: "effectTick", id: 1, effectId: 4002, amount: Big.from(30), absorbed: Big.from(10), hp: Big.from(2500) },
    { tick: 1, type: "effectTick", id: HERO_ID, effectId: 4007, amount: Big.from(1500), absorbed: Big.ZERO, hp: Big.from(75) },
  ] })).toEqual([
    { type: "dot", target: 1, text: "20", heal: false, hpRatio: 0.25 },
    { type: "dot", target: HERO_ID, text: "+1.5K", heal: true, hpRatio: 0.75 },
  ]);
  expect(t.played).toEqual([]);
});

test("a hunting wave starts with a banner", () => {
  const t = setUp();
  expect(t.frame({ events: [{ tick: 1, type: "waveStart", wave: 2, wavesNeeded: 3 }] })).toEqual([{ type: "banner", text: "웨이브 2/3" }]);
});

test("a killing blow empties the bar even though its monster is gone from the snapshot", () => {
  const t = setUp(snapshot({ enemies: [second] }));
  expect(t.frame({ events: [attack(HERO_ID, [[1, 9999, 0]]), { tick: 1, type: "death", id: 1 }] })).toEqual([
    { type: "hit", target: 1, hpRatio: 0, text: "9.9K", crit: false, sparks: PHYSICAL },
    { type: "death", id: 1 },
  ]);
});

test("deaths, revival, bosses, cleared stages and level-ups become directions and banners", () => {
  const t = setUp();
  const stage = "훈련의 초원";
  expect(t.frame({
    events: [
      { tick: 1, type: "death", id: HERO_ID },
      { tick: 1, type: "retreat" },
      { tick: 2, type: "revive" },
      { tick: 3, type: "bossStart" },
      { tick: 4, type: "bossEnd", win: true },
      { tick: 5, type: "bossEnd", win: false },
      { tick: 6, type: "stageClear", stageId: STAGE, nextId: 3002 },
      { tick: 6, type: "levelUp", level: 2 },
    ],
  })).toEqual([
    { type: "death", id: HERO_ID },
    HERO_HURT,
    { type: "retreat" },
    { type: "revive" },
    // 보스 시작, 보스 종료(승패 모두), 클리어, 레벨업은 영웅을 최대 HP로 되돌리므로 글자 뒤에 다시 세운다. 보스전이 시작하면
    // 무대를 검붉게, 지면 검게 다 덮었다가 걷는다. 이기면 덮지 않는다.
    { type: "cover", color: [0.22, 0.02, 0.02] },
    { type: "banner", text: "보스 등장!" },
    { type: "revive" },
    { type: "banner", text: "보스 처치!" },
    { type: "revive" },
    { type: "cover", color: [0, 0, 0] },
    { type: "banner", text: "보스 실패" },
    { type: "revive" },
    { type: "banner", text: `${stage} 클리어` },
    { type: "revive" },
    // 다음 스테이지(3002)로 넘어가므로 그 배경으로 바꾼다.
    { type: "background", background: "forest" },
    { type: "levelUp", text: "레벨 업! Lv.2" },
    { type: "revive" },
  ]);
});

test("the hero stands again at full HP when a boss starts and after it falls to the boss", () => {
  // 3004의 보스를 1레벨 영웅으로 상대하면 틱 66에 쓰러져 진다. 시뮬레이션의 이벤트를 그대로 넘긴다.
  const base = { profile: { loginId: "hero", level: 1 }, items: {}, equipment: NO_EQUIPMENT, statUpgrades: NO_STAT_UPGRADES, rebirth: NO_REBIRTH, skills: startSkills(data), stage: { currentId: 3004, clearedIds: [] } };
  const state = { ...base, battle: { ...freshBattle(base, data, 1_000_000), mode: BattleMode.Boss, waves: 3 }, tutorial: { stepId: null } };
  const real = playerBattle(state, data);
  const events: ShownEvent[] = [];
  real.advance(100, event => events.push(event));
  const directions = setUp(real.snapshot()).frame({ events });

  // revive는 뷰가 영웅을 HP 비율 1로 세우는 지시다. 보스전의 시작과 실패는 무대를 덮었다가 걷는다.
  expect(directions.slice(0, 3)).toEqual([{ type: "cover", color: [0.22, 0.02, 0.02] }, { type: "banner", text: "보스 등장!" }, { type: "revive" }]);
  const death = directions.findIndex(direction => direction.type === "death" && direction.id === HERO_ID);
  expect(death).toBeGreaterThan(0);
  expect(directions.slice(death, death + 6)).toEqual([
    { type: "death", id: HERO_ID },
    HERO_HURT,
    { type: "retreat" },
    { type: "cover", color: [0, 0, 0] },
    { type: "banner", text: "보스 실패" },
    { type: "revive" },
  ]);
});

test("a reset stands the hero in the clips and size its Heroes row names", () => {
  const row = data.heroes.get(data.constants.heroId)!;
  const knight = { ...data, heroes: new Map([[row.id, { ...row, clips: "knight", size: 1.2 }]]) };
  const [reset] = setUp(snapshot(), knight).frame({ events: [{ tick: 0, type: "reset" }] });
  expect(reset).toMatchObject({ type: "reset", hero: { look: { clips: "knight", color: [1, 1, 1], size: 1.2 } } });
});

test("a reset becomes one direction that rebuilds the scene from the snapshot", () => {
  const t = setUp();
  const reset: ShownEvent = { tick: 0, type: "reset" };
  expect(t.frame({ events: [reset] })).toEqual([
    {
      type: "reset",
      background: "meadow",
      hero: { look: HERO, hpRatio: 0.5, down: false, x: -2 },
      enemies: [
        { id: 1, look: expect.objectContaining({ size: 1 }), boss: false, hpRatio: 0.5, x: 1 },
        { id: 2, look: expect.objectContaining({ size: 1 }), boss: false, hpRatio: 1, x: 1 },
      ],
      summons: [],
      projectiles: [],
    },
  ]);
  // 날던 발사체는 남은 시간만큼 다시 난다.
  const flying = { id: 5, by: HERO_ID, projectileId: 5001, targets: [1], ticksLeft: 2 };
  expect(t.frame({ events: [reset], snapshot: snapshot({ hero: { ...hero, down: true }, enemies: [], projectiles: [flying] }) })).toEqual([
    {
      type: "reset", background: "meadow", hero: { look: HERO, hpRatio: 0.5, down: true, x: -2 }, enemies: [], summons: [],
      projectiles: [{ id: 5, by: HERO_ID, targets: [1], look: expect.objectContaining({ clip: "arrow" }), flightSeconds: 0.2 }],
    },
  ]);
  const boss = { ...monster, boss: true };
  expect(t.frame({ events: [reset], snapshot: snapshot({ enemies: [boss] }) })[0]).toMatchObject({
    enemies: [{ id: 1, look: { color: [0.9, 0.2, 0.2], size: 1.6 }, boss: true }],
  });
});

test("each fighter's place goes out when it moves or starts or stops walking, and all of them again after a reset", () => {
  const t = setUp();
  // 처음에는 모두 보인다.
  expect(t.frameAll()).toEqual([{ type: "move", places: [
    { id: HERO_ID, x: -2, moving: false }, { id: 1, x: 1, moving: false }, { id: 2, x: 1, moving: false },
  ] }]);
  expect(t.frameAll()).toEqual([]);
  // 한 틱 걸은 것만, 걷기를 멈춘 것도 나온다.
  const walked = snapshot({ hero: { ...hero, x: -1.8, moving: true } });
  expect(t.frameAll({ snapshot: walked })).toEqual([{ type: "move", places: [{ id: HERO_ID, x: -1.8, moving: true }] }]);
  expect(t.frameAll({ snapshot: snapshot({ hero: { ...hero, x: -1.8 } }) })).toEqual([{ type: "move", places: [{ id: HERO_ID, x: -1.8, moving: false }] }]);
  // reset 뒤에는 다시 모두.
  const after = t.frameAll({ events: [{ tick: 0, type: "reset" }], snapshot: snapshot({ hero: { ...hero, x: -1.8 } }) });
  expect(after.find(direction => direction.type === "move")).toEqual({ type: "move", places: [
    { id: HERO_ID, x: -1.8, moving: false }, { id: 1, x: 1, moving: false }, { id: 2, x: 1, moving: false },
  ] });
});

test("before there is a battle, a frame shows nothing", () => {
  const t = setUp(null);
  expect(t.frame({ events: [{ tick: 0, type: "reset" }] })).toEqual([]);
});

test("the director sounds hits, crits, kills, the boss, clears and level-ups, each chosen by the Constants table", () => {
  const t = setUp();
  const sounds = data.constants;
  t.frame({ events: [attack(HERO_ID, [[1, 10, 90], [2, 10, 90]]), attack(1, [[HERO_ID, 5, 45]], true), { tick: 1, type: "death", id: HERO_ID }] });
  // 범위 공격도 소리는 공격마다 하나다.
  expect(t.played).toEqual([sounds.hitSfx, sounds.critSfx]);
  t.frame({ events: [
    { tick: 2, type: "death", id: 1 }, { tick: 2, type: "bossStart" },
    { tick: 3, type: "stageClear", stageId: STAGE, nextId: null }, { tick: 3, type: "levelUp", level: 2 },
  ] });
  expect(t.played.slice(2)).toEqual([sounds.killSfx, sounds.bossSfx, sounds.clearSfx, sounds.levelUpSfx]);
  // 맞은 대상이 없고 속성 소리도 없는 스킬과 효과 이벤트는 소리가 없다. 지속 피해는 작은 숫자만 뜨고, 효과 칸은 스냅숏을 따른다.
  expect(t.frame({ events: [
    attack(HERO_ID, []),
    { tick: 4, type: "effectApply", id: HERO_ID, effectId: 4005, by: HERO_ID, stacks: 1, ticksLeft: 100 },
    { tick: 5, type: "effectTick", id: 1, effectId: 4002, amount: Big.from(3), absorbed: Big.ZERO, hp: Big.from(40) },
    { tick: 6, type: "effectEnd", id: HERO_ID, effectId: 4005, reason: "expire" },
    { tick: 6, type: "effectImmune", id: 1, effectId: 4003 },
  ] })).toEqual([{ type: "dot", target: 1, text: "3", heal: false, hpRatio: 40 / 10_000 }]);
  expect(t.played).toHaveLength(6);
  // 따라잡은 프레임(reset)은 소리 없이 다시 세운다.
  t.frame({ events: [{ tick: 9, type: "reset" }] });
  expect(t.played).toHaveLength(6);
  for (const key of t.played) expect(data.sounds.get(key)?.channel).toBe(SoundChannel.Sfx);
});

test("a crit stops the world briefly with a small shake, a boss kill longer with a hard one, and a boss's hit on the hero or the hero's fall shakes it", () => {
  const boss = { ...monster, id: 3, boss: true };
  const t = setUp(snapshot({ enemies: [monster, boss] }));
  // reset이 스냅숏에서 보스를 알아 둔다.
  t.frame({ events: [{ tick: 0, type: "reset" }] });
  const feel = (directions: readonly Direction[]) => directions.filter(direction => direction.type === "hitStop" || direction.type === "shake");
  expect(feel(t.frame({ events: [attack(HERO_ID, [[1, 10, 90]], true)] }))).toEqual(CRIT_FEEL);
  // 맞은 대상이 없는 치명타(발사체를 쏘기만 함)는 멈추지 않는다.
  expect(feel(t.frame({ events: [attack(HERO_ID, [], true)] }))).toEqual([]);
  expect(feel(t.frame({ events: [attack(3, [[HERO_ID, 5, 45]])] }))).toEqual([HERO_HURT]);
  expect(feel(t.frame({ events: [attack(1, [[HERO_ID, 5, 45]])] }))).toEqual([]);
  expect(feel(t.frame({ events: [{ tick: 2, type: "death", id: 3 }] }))).toEqual([
    { type: "hitStop", seconds: 0.15 }, { type: "shake", strength: 0.25, seconds: 0.4 },
  ]);
  expect(feel(t.frame({ events: [{ tick: 2, type: "death", id: 1 }] }))).toEqual([]);
  expect(feel(t.frame({ events: [{ tick: 3, type: "death", id: HERO_ID }] }))).toEqual([HERO_HURT]);
  // 나중에 나온 보스도 보스다.
  t.frame({ events: [{ tick: 4, type: "spawn", id: 8, monsterId: 2, boss: true, x: 5.5 }] });
  expect(feel(t.frame({ events: [{ tick: 5, type: "death", id: 8 }] }))).toHaveLength(2);
});

test("hits spark in their skill's element colour and sound its element, while a crit always sounds the crit", () => {
  const t = setUp();
  const sounds = data.constants;
  // 1008(서리 숨결)은 얼음, 1005(화염구)는 불이고 발사체를 쏜다. 1006(치유의 빛)은 맞는 대상이 없는 신성, 1010(전투의
  // 포효)은 속성 소리가 없는 버프다. 모르는 스킬(1)은 물리다.
  const used = (skillId: number, hits: readonly (readonly [number, number, number])[], crit = false) =>
    ({ ...attack(HERO_ID, hits, crit), skillId }) as ShownEvent;
  expect(t.frame({ events: [used(1008, [[1, 10, 90]])] })[0]).toMatchObject({ type: "hit", sparks: ICE });
  expect(t.frame({ events: [used(1, [[1, 10, 90]])] })[0]).toMatchObject({ type: "hit", sparks: PHYSICAL });
  expect(t.played).toEqual(["sfx.ice", sounds.hitSfx]);
  t.frame({ events: [used(1008, [[1, 10, 90]], true), used(1006, []), used(1005, []), used(1010, [])] });
  expect(t.played.slice(2)).toEqual([sounds.critSfx, "sfx.holy"]);
  t.frame({ events: [{ tick: 2, type: "impact", id: 9, by: HERO_ID, skillId: 1005, crit: false, hits: (attack(HERO_ID, [[1, 10, 90]]) as Extract<ShownEvent, { type: "attack" }>).hits }] });
  expect(t.played.slice(4)).toEqual(["sfx.fire"]);
  for (const key of ["sfx.ice", "sfx.holy", "sfx.fire"] as const) expect(data.sounds.get(key)?.channel).toBe(SoundChannel.Sfx);
});
