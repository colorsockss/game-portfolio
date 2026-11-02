import type { Scope } from "../../application/scope.js";
import { createPool, type Pool } from "../../presentation/pool.js";
import type { ViewRoot } from "../../presentation/ui/ports.js";
import { HERO_ID, TICK_MS } from "@idle/game-core";
import { type ActorLook, type BattleDirector, type Color, type Direction, type EffectIcon, type Flight } from "../../presentation/world/battle-director.js";
import type { WorldInstance } from "../../presentation/world/ports.js";
import type { World, WorldView } from "../../presentation/world/world.js";
import type { ActorTarget, EffectIconsTarget, ProjectileTarget, StageTarget } from "../binding/components.js";
import { readRefs, ref, viewRefs } from "../binding/refs.js";
import { EVERY_FRAME } from "../frame.js";

// 월드 좌표(WorldRoot의 직교 카메라는 세로 반높이 5유닛, 원점이 화면 가운데, 보이는 가로 반폭은 2.8유닛 이상). 화면은 영웅을
// 기준으로 그린다: 영웅은 늘 HERO_X에 서고, 다른 배우는 시뮬레이션의 x에서 영웅의 x를 뺀 만큼 떨어져 서며, 영웅이 앞으로 걸으면
// 배경이 그만큼 흐른다. y는 화면이 정하는 줄이다.
/** 영웅이 서는 화면 x. 몬스터는 이보다 Constants의 spawnDistance만큼 앞(화면 오른쪽 밖)에 나온다. */
const HERO_X = -2;
/**
 * 적이 서는 줄의 y. 시뮬레이션에서는 같은 자리에 겹쳐 서므로, 나온 차례대로 비어 있는 첫 줄에 서서 위아래로 벌린다. 다 차면
 * 처음 줄부터 겹친다.
 */
const ENEMY_LANES: readonly number[] = [0, 0.9, -0.9, 0.45, -0.45];
/** 영웅 편 소환수가 서는 줄. 영웅은 0번 줄이다. */
const ALLY_LANES: readonly number[] = [0.9, -0.9, 0.45];
/** 한 move 지시로 옮겨 가는 시간: 시뮬레이션 한 틱. */
const STEP_SECONDS = TICK_MS / 1000;
/** 이보다 멀리 한 번에 옮겨지면(경계에서 제자리로 돌아감) 이 빠르기(유닛/초)로 걸어간다. */
const JUMP = { distance: 0.5, speed: 6 };
/** 피해 글자는 맞은 배우의 이만큼 위에 뜬다. */
const DAMAGE_Y = 1.2;
const BANNER = { x: 0, y: 2, size: 1.2 };
/** 배너가 겹치지 않게, 앞 배너가 이만큼 떠오르며 흐려진 뒤에 다음 배너를 띄운다. */
const BANNER_GAP_MS = 600;
/** 레벨업 글자: 영웅 위, 배너보다 높게. */
const LEVEL_UP = { y: 3, size: 1.2 };
const CRIT_SIZE = 1.5;
/** 지속 피해·회복 숫자는 피해 숫자보다 작고, 머리 위의 효과 칸을 가리지 않게 몸의 오른쪽 옆에 뜬다. */
const DOT_SIZE = 0.75;
const DOT = { x: 0.6, y: 0.3 };
/** 발사체는 쏜 배우의 몸 가운데보다 이만큼 위에서 나간다. 위에서 떨어지는 것(운석)은 대상 위 이만큼에서 시작한다. */
const LAUNCH_Y = 0.2;
const FALL_FROM = { x: -1.5, y: 6 };
const WHITE: Color = [1, 1, 1];
const CRIT_COLOR: Color = [1, 0.85, 0.2];
const LEVEL_UP_COLOR: Color = [0.4, 1, 0.5];
const DOT_COLOR: Color = [0.8, 0.5, 1];
const HEAL_COLOR: Color = [0.55, 1, 0.55];
/** FloatingText가 떠오르며 사라지는 시간. 이만큼 지난 프레임에 풀로 돌려놓는다. */
const TEXT_MS = 800;
/** ActorView.Die가 작아지며 사라지는 시간. ActorView.Leave가 흐려지는 시간도 같다. */
const DIE_MS = 300;
/** ProjectileView.Fizzle이 작아지며 사라지는 시간. */
const FIZZLE_MS = 150;
/** 맞은 자리에서 튀는 불꽃의 수와 크기(유닛). 치명타는 더 많이 튄다. */
const SPARKS = { count: 6, critCount: 12, size: 0.12 };
/** 쓰러진 자리에서 터지는 조각. */
const DEATH_BURST = { count: 16, size: 0.18, color: [0.85, 0.85, 0.85] as Color };

const actorRefs = { actor: ref.object("PortfolioIdleRpg.Views.ActorView"), effects: ref.object("PortfolioIdleRpg.Views.EffectIcons") };
const textRefs = { text: ref.object("PortfolioIdleRpg.Views.FloatingText") };
const projectileRefs = { projectile: ref.object("PortfolioIdleRpg.Views.ProjectileView") };
const stageRefs = { stage: ref.object("PortfolioIdleRpg.Views.StageView") };

/** 배우 프리팹의 두 부품. */
interface ActorParts {
  readonly actor: ActorTarget;
  readonly effects: EffectIconsTarget;
}

interface Pooled<T> {
  readonly instance: WorldInstance;
  readonly view: T;
}

// 월드 인스턴스의 풀. spawn이 undefined이면 스코프가 닫힌 것이고, 풀이 그것을 보고 버린다.
function worldPool<T>(scope: Scope, world: World, key: string, read: (root: ViewRoot) => T): Pool<Pooled<T> | undefined> {
  return createPool<Pooled<T> | undefined>(scope, {
    async create() {
      const instance = await world.spawn(key, scope);
      return instance && { instance, view: read(instance.root) };
    },
    activate: (item, active) => item?.instance.setActive(active),
    destroy: item => item?.instance.destroy(),
  });
}

// 영웅 편은 오른쪽, 적은 왼쪽을 본다.
function setup(actor: ActorTarget, { clips, color: [r, g, b], size }: ActorLook, ally: boolean): void {
  actor.Setup(clips, r, g, b, size, ally ? 1 : -1);
}

// 화면에서 distance만큼 옮겨 가는 시간: 한 틱, 그보다 멀면(프레임이 여러 틱을 건너뜀, 경계에서 제자리로 돌아감) 거리에 맞춰.
function stepSeconds(distance: number): number {
  return distance > JUMP.distance ? distance / JUMP.speed : STEP_SECONDS;
}

// 화면의 자리를 옮긴다. 한 틱보다 멀면 걸어서 간다.
function moveTo(actor: ActorTarget, from: number, x: number, y: number, moving: boolean): void {
  const distance = Math.abs(x - from);
  actor.MoveTo(x, y, stepSeconds(distance), moving || distance > JUMP.distance);
}

function showEffects(effects: EffectIconsTarget, icons: readonly EffectIcon[]): void {
  effects.SetCount(icons.length);
  icons.forEach(({ color: [r, g, b], seconds, total }, i) => effects.Show(i, r, g, b, seconds, total));
}

// 서 있는 적이나 소환수와 그 자리: 시뮬레이션의 x와 걷는지, 화면의 줄(ENEMY_LANES나 ALLY_LANES의 칸).
interface Standing {
  readonly pooled: Pooled<ActorParts>;
  readonly lane: number;
  readonly y: number;
  x: number;
  moving: boolean;
}

/**
 * 메인 화면 뒤의 전투: 프레임마다 연출자를 진행하고 그 지시를 ActorView, FloatingText, ProjectileView, 무대(StageView의
 * 배경과 파티클), 카메라(흔들림, 히트스톱) 호출로 옮긴다. 배우와 글자, 발사체는 풀에서 꺼내고 무대는 하나다. 꺼내기가 비동기라 지시는 한 줄로 차례차례 적용한다. 시각은 `now`(ms)로
 * 재므로 테스트가 바꿀 수 있다.
 */
export const battleView = {
  bind(scope: Scope, world: World, director: BattleDirector, now: () => number = () => Date.now()): void {
    const actors = worldPool(scope, world, "Battle/Actor", root => readRefs(viewRefs(root), actorRefs));
    const texts = worldPool(scope, world, "Battle/DamageText", root => readRefs(viewRefs(root), textRefs).text);
    const projectiles = worldPool(scope, world, "Battle/Projectile", root => readRefs(viewRefs(root), projectileRefs).projectile);
    const hero = actors.acquire();
    // 영웅의 시뮬레이션 x. 다른 배우의 화면 x는 이것을 기준으로 정한다.
    let heroX = 0;
    // 영웅을 세웠는지와 쓰러져 있는지. 이어지는 장면의 reset은 영웅을 다시 세우지 않는다.
    let heroStood = false;
    let heroDown = false;
    const screenX = (x: number) => x - (heroX - HERO_X);
    const stage = world.spawn("Battle/Stage", scope).then(instance => instance && readRefs(viewRefs(instance.root), stageRefs).stage);

    // 무대가 아직 없거나 스코프가 닫혔으면 아무것도 튀지 않는다.
    async function burst(at: readonly [number, number], [r, g, b]: Color, count: number, size: number): Promise<void> {
      (await stage)?.Burst(at[0], at[1], r, g, b, count, size);
    }
    // id 순서(나온 순서)라서 앞의 것이 앞 자리에 선다. 적이 부른 소환수도 적 대형에 선다.
    const enemies = new Map<number, Standing>();
    // 영웅 편 소환수.
    const allies = new Map<number, Standing>();
    // 날고 있는 발사체(발사체 id마다 대상 수만큼).
    const flights = new Map<number, Pooled<ProjectileTarget>[]>();
    // 정한 시각이 지난 프레임에 할 것(풀로 돌려놓기, 미뤄 둔 배너).
    let returns: { readonly at: number; readonly release: () => void }[] = [];
    // 다음 배너를 띄울 수 있는 시각.
    let bannerFree = 0;

    function later(ms: number, release: () => void): void {
      returns.push({ at: now() + ms, release });
    }

    // grounded: 영웅이 걷는 동안 땅을 따라 흐른다. 영웅이 아닌 배우 위의 숫자만 그렇고, 배너와 레벨업 글자는 화면에 머문다.
    async function float(text: string, [r, g, b]: Color, size: number, x: number, y: number, grounded = false): Promise<void> {
      const item = await texts.acquire();
      if (!item) return;
      item.view.Show(text, r, g, b, size, x, y, grounded);
      later(TEXT_MS, () => texts.release(item));
    }

    // 적(소환수면 영웅 편)을 x의 비어 있는 첫 줄에 세운다. 꺼내는 사이 스코프가 닫혔으면 undefined.
    async function stand(id: number, look: ActorLook, x: number, ally = false): Promise<ActorTarget | undefined> {
      const pooled = await actors.acquire();
      if (!pooled) return undefined;
      const [side, lanes] = ally ? [allies, ALLY_LANES] : [enemies, ENEMY_LANES];
      const taken = new Set([...side.values()].map(standing => standing.lane));
      let lane = 0;
      while (lane < lanes.length && taken.has(lane)) lane++;
      if (lane === lanes.length) lane = side.size % lanes.length;
      side.set(id, { pooled, lane, y: lanes[lane], x, moving: false });
      setup(pooled.view.actor, look, ally);
      pooled.view.actor.Place(screenX(x), lanes[lane]);
      return pooled.view.actor;
    }

    // 쓰러지거나(Die) 물러난(Leave) 적과 소환수는 0.3초 뒤 풀로 돌아간다.
    function remove(id: number, how: "Die" | "Leave"): Standing | undefined {
      const side = enemies.has(id) ? enemies : allies;
      const standing = side.get(id);
      if (!standing) return undefined;
      side.delete(id);
      standing.pooled.view.actor[how]();
      later(DIE_MS, () => actors.release(standing.pooled));
      return standing;
    }

    function fall(id: number): void {
      remove(id, "Die");
    }

    function positionOf(id: number): readonly [number, number] | undefined {
      if (id === HERO_ID) return [HERO_X, 0];
      const standing = enemies.get(id) ?? allies.get(id);
      return standing && [screenX(standing.x), standing.y];
    }

    // 발사체를 대상마다 하나씩 쏜다. 쏜 배우나 대상이 화면에 없으면 그 발사체는 보이지 않는다.
    async function launch({ id, by, targets, look, flightSeconds }: Flight): Promise<void> {
      const from = positionOf(by);
      for (const target of targets) {
        const to = positionOf(target);
        if (!from || !to) continue;
        const pooled = await projectiles.acquire();
        if (!pooled) return;
        const [fromX, fromY] = look.fromAbove ? [to[0] + FALL_FROM.x, to[1] + FALL_FROM.y] : [from[0], from[1] + LAUNCH_Y];
        const [r, g, b] = look.color;
        pooled.view.Fly(look.clip, fromX, fromY, to[0], to[1], flightSeconds, r, g, b, look.size);
        flights.set(id, [...(flights.get(id) ?? []), pooled]);
      }
    }

    function land(id: number, landed: boolean): void {
      const flying = flights.get(id) ?? [];
      flights.delete(id);
      for (const pooled of flying) {
        if (landed) {
          projectiles.release(pooled);
        } else {
          pooled.view.Fizzle();
          later(FIZZLE_MS, () => projectiles.release(pooled));
        }
      }
    }

    async function apply(direction: Direction): Promise<void> {
      const heroParts = (await hero)?.view;
      const heroView = heroParts?.actor;
      const partsOf = (id: number) => (id === HERO_ID ? heroParts : (enemies.get(id) ?? allies.get(id))?.pooled.view);
      const actorOf = (id: number) => partsOf(id)?.actor;
      switch (direction.type) {
        case "reset": {
          // 처음이 아니면 장면이 이어지는 경우가 많다(강화·착용 뒤, 서버의 확정이 조금 다름). 그래서 남아 있는 배우와 발사체는 그대로
          // 두고 HP와 자리만 맞추며, 사라진 것은 거두고 새로 생긴 것만 세운다.
          (await stage)?.Show(direction.background);
          const before = heroX;
          heroX = direction.hero.x;
          if (heroView) {
            if (!heroStood) {
              setup(heroView, direction.hero.look, true);
              heroView.Place(HERO_X, 0);
            }
            if (direction.hero.down) {
              if (!heroStood || !heroDown) {
                if (!heroStood) heroView.Revive(0);
                heroView.Die();
              }
            } else if (!heroStood || heroDown) {
              heroView.Revive(direction.hero.hpRatio);
            } else {
              heroView.SetHp(direction.hero.hpRatio);
            }
            heroStood = true;
            heroDown = direction.hero.down;
          }
          const staying = new Set([...direction.enemies, ...direction.summons].map(({ id }) => id));
          for (const side of [enemies, allies]) {
            for (const [id, standing] of side) {
              if (staying.has(id)) continue;
              side.delete(id);
              actors.release(standing.pooled);
            }
          }
          const flying = new Set(direction.projectiles.map(({ id }) => id));
          for (const [id, shots] of flights) {
            if (flying.has(id)) continue;
            flights.delete(id);
            for (const pooled of shots) projectiles.release(pooled);
          }
          const places = [
            ...direction.enemies.map(enemy => ({ ...enemy, ally: false })),
            ...direction.summons,
          ];
          for (const { id, look, ally, hpRatio, x } of places) {
            const standing = (ally ? allies : enemies).get(id);
            if (standing === undefined) {
              (await stand(id, look, x, ally))?.Revive(hpRatio);
              continue;
            }
            const { actor } = standing.pooled.view;
            actor.SetHp(hpRatio);
            const from = standing.x - (before - HERO_X);
            const to = screenX(x);
            standing.x = x;
            standing.moving = false;
            if (to !== from) moveTo(actor, from, to, standing.y, false);
          }
          for (const flight of direction.projectiles) if (!flights.has(flight.id)) await launch(flight);
          return;
        }
        case "monsterAppear":
          await stand(direction.id, direction.look, direction.x);
          return;
        case "summonAppear": {
          // 소환자의 자리에 나와 그 뒤로는 move 지시를 따라 걷는다.
          const by = direction.by === HERO_ID ? heroX : (enemies.get(direction.by) ?? allies.get(direction.by))?.x;
          await stand(direction.id, direction.look, by ?? heroX, direction.ally);
          return;
        }
        case "summonLeave":
          remove(direction.id, "Leave");
          return;
        case "move": {
          // 영웅은 제자리에서 걷고 배경이 걸은 만큼 흐르며, 다른 배우는 시뮬레이션의 자리가 그대로여도 화면에서 그만큼 뒤로
          // 간다. 경계에서 영웅이 0으로 돌아가는 것은 흐르지 않는다(그때는 적이 없다).
          const before = heroX;
          const places = new Map(direction.places.map(place => [place.id, place]));
          const heroPlace = places.get(HERO_ID);
          if (heroPlace) {
            heroX = heroPlace.x;
            heroView?.MoveTo(HERO_X, 0, STEP_SECONDS, heroPlace.moving);
            const walked = heroX - before;
            if (walked > 0) (await stage)?.Scroll(walked, stepSeconds(walked));
          }
          for (const [id, standing] of [...enemies, ...allies]) {
            const place = places.get(id);
            const from = standing.x - (before - HERO_X);
            if (place) {
              standing.x = place.x;
              standing.moving = place.moving;
            }
            const to = screenX(standing.x);
            if (place || to !== from) moveTo(standing.pooled.view.actor, from, to, standing.y, standing.moving);
          }
          return;
        }
        case "launch":
          await launch(direction);
          return;
        case "projectileEnd":
          land(direction.id, direction.landed);
          return;
        case "effects": {
          const parts = partsOf(direction.target);
          if (parts) showEffects(parts.effects, direction.effects);
          return;
        }
        case "dot": {
          const at = positionOf(direction.target);
          if (!at) return;
          actorOf(direction.target)?.SetHp(direction.hpRatio);
          await float(
            direction.text, direction.heal ? HEAL_COLOR : DOT_COLOR, DOT_SIZE, at[0] + DOT.x, at[1] + DOT.y, direction.target !== HERO_ID,
          );
          return;
        }
        case "attack":
          actorOf(direction.by)?.Attack(direction.clip, direction.impactSeconds);
          return;
        case "hit": {
          const at = positionOf(direction.target);
          if (!at) return;
          actorOf(direction.target)?.Hit(direction.hpRatio);
          await burst(at, direction.sparks, direction.crit ? SPARKS.critCount : SPARKS.count, SPARKS.size);
          const color = direction.crit ? CRIT_COLOR : WHITE;
          await float(direction.text, color, direction.crit ? CRIT_SIZE : 1, at[0], at[1] + DAMAGE_Y, direction.target !== HERO_ID);
          return;
        }
        case "death": {
          // 쓰러진 자리는 자리를 비우기 전에 읽는다.
          const at = positionOf(direction.id);
          if (direction.id === HERO_ID) {
            heroView?.Die();
            heroDown = true;
          }
          else fall(direction.id);
          if (at) await burst(at, DEATH_BURST.color, DEATH_BURST.count, DEATH_BURST.size);
          return;
        }
        case "retreat":
          for (const id of [...enemies.keys()]) fall(id);
          return;
        case "revive":
          heroView?.Revive(1);
          heroDown = false;
          return;
        case "banner": {
          const at = Math.max(now(), bannerFree);
          bannerFree = at + BANNER_GAP_MS;
          const show = () => float(direction.text, WHITE, BANNER.size, BANNER.x, BANNER.y);
          if (at > now()) later(at - now(), () => void show());
          else await show();
          return;
        }
        case "background":
          (await stage)?.Show(direction.background);
          return;
        case "levelUp":
          await float(direction.text, LEVEL_UP_COLOR, LEVEL_UP.size, HERO_X, LEVEL_UP.y);
          return;
        case "hitStop":
          world.hitStop(direction.seconds);
          return;
        case "shake":
          world.shake(direction.strength, direction.seconds);
          return;
      }
    }

    let applying = Promise.resolve();
    const timer = setInterval(() => {
      // 연출자는 그리기가 밀려도 프레임마다 진행한다(정산도 여기서 나간다).
      const directions = director.frame();
      applying = applying
        .then(async () => {
          // 닫힌 뒤에 남은 프레임은 이미 없앤 배우를 건드리지 않는다.
          if (scope.disposed) return;
          const time = now();
          const due = returns.filter(entry => entry.at <= time);
          returns = returns.filter(entry => entry.at > time);
          for (const entry of due) entry.release();
          for (const direction of directions) await apply(direction);
        })
        .catch(error => {
          if (!scope.disposed) console.error("[battle] A direction failed:", error);
        });
    }, EVERY_FRAME);
    scope.add(() => clearInterval(timer));
  },
} satisfies WorldView<BattleDirector>;
