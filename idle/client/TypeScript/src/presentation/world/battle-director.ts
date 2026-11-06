import { Big } from "@idle/big-number";
import { EffectKind, SkillElement, Stat, type EffectsRow, type GameData, type SoundsId } from "@idle/data-schema";
import { HERO_ID, TICK_MS, type BattleSnapshot, type EffectSnapshot, type ProjectileSnapshot } from "@idle/game-core";
import type { BattleService, ShownEvent, UpcomingAttack } from "../../application/battle/battle.js";
import type { Audio } from "../audio/audio.js";
import { formatBig } from "../format/big.js";
import type { Translate } from "../text.js";

/** 배우의 모습: 클립 묶음(`Assets/Battle/Clips`의 에셋 이름. 그림이 있는 몬스터는 `Monsters.clips`), 몸에 입히는 색(0~1의 r, g, b)과 크기 배율. */
export interface ActorLook {
  readonly clips: string;
  readonly color: Color;
  readonly size: number;
}

/** 0~1의 r, g, b. */
export type Color = readonly [number, number, number];

/** 발사체의 모습(`Projectiles`의 행): 클립(`projectiles` 묶음의 이름), 색, 크기 배율, 대상 위에서 떨어지는지(운석). */
export interface ProjectileLook {
  readonly clip: string;
  readonly color: Color;
  readonly size: number;
  readonly fromAbove: boolean;
}

/** 배우 머리 위의 효과 칸 하나: 아이콘(Effects.icon, 없으면 빈 문자열이라 색 사각형), 막대의 색과 남은 시간, 처음 지속 시간(막대가 그 비율로 줄어듦). */
export interface EffectIcon {
  readonly icon: string;
  readonly color: Color;
  readonly seconds: number;
  readonly total: number;
}

/** 날아가는 발사체. 대상마다 하나씩 날아 `flightSeconds` 뒤에 떨어진다. */
export interface Flight {
  readonly id: number;
  readonly by: number;
  readonly targets: readonly number[];
  readonly look: ProjectileLook;
  readonly flightSeconds: number;
}

/** 공격 클립: 기본 공격, 재사용 대기가 있는 스킬의 시전, 보스의 스킬(보스 전용). 묶음에 없으면 배우가 공격 클립으로 대신한다. */
export type AttackClip = "attack" | "cast" | "special";

/**
 * 공격 지시를 타격보다 이만큼 먼저 낸다. 클립의 선딜레이(타격 프레임까지의 시간, 가장 긴 보스 전용이 0.375초)보다 길어야
 * 타격 프레임이 타격 틱에 맞는다. 짧으면 배우가 앞 프레임을 건너뛴다.
 */
export const ATTACK_LEAD_MS = 500;

/** reset이 세우는 적 하나. `x`는 시뮬레이션의 월드 x다. */
export interface EnemyLook {
  readonly id: number;
  readonly look: ActorLook;
  readonly boss: boolean;
  readonly hpRatio: number;
  readonly x: number;
}

/** reset이 세우는 소환수 하나. `ally`면 영웅 편이다. */
export interface SummonLook {
  readonly id: number;
  readonly look: ActorLook;
  readonly ally: boolean;
  readonly hpRatio: number;
  readonly x: number;
}

/** 배우 하나의 자리: 시뮬레이션의 월드 x와 걷는 중인지. 화면은 x를 따라 걷고, y는 화면이 정한 줄이다. */
export interface ActorPlace {
  readonly id: number;
  readonly x: number;
  readonly moving: boolean;
}

/** 뷰가 월드에 옮기는 지시. 연출자가 전투 이벤트를 화면의 말로 바꾼 것이다. 배우는 전투원 id(`HERO_ID`가 영웅)로 가리킨다. */
export type Direction =
  /** 적은 먼저 나온 것부터다. 효과 칸은 뒤따르는 effects 지시가 다시 세운다. 배경은 스테이지의 그림 이름이다. */
  | {
    type: "reset";
    background: string;
    hero: { look: ActorLook; hpRatio: number; down: boolean; x: number };
    enemies: readonly EnemyLook[];
    summons: readonly SummonLook[];
    projectiles: readonly Flight[];
  }
  /** 몬스터가 `x`(영웅 앞으로 Constants의 spawnDistance)에 나타난다. 그 뒤로는 move 지시를 따라 걷는다. */
  | { type: "monsterAppear"; id: number; look: ActorLook; boss: boolean; x: number }
  /** 소환수가 소환자의 자리에 나타난다. */
  | { type: "summonAppear"; id: number; by: number; look: ActorLook; ally: boolean }
  /** 자리나 걷기가 바뀐 배우들. 시뮬레이션의 한 틱(0.1초) 동안 그 자리로 옮겨 간다. */
  | { type: "move"; places: readonly ActorPlace[] }
  /** 소환수가 쓰러지지 않고 물러난다(만료). 쓰러지면 death다. */
  | { type: "summonLeave"; id: number }
  | ({ type: "launch" } & Flight)
  /** 발사체가 떨어졌거나(`landed`) 떨어지기 전에 사라졌다. 떨어진 피해는 같은 프레임의 hit 지시다. */
  | { type: "projectileEnd"; id: number; landed: boolean }
  /** 배우에 걸린 효과 칸 전체. 효과의 종류나 겹 수가 바뀌거나 다시 걸리면 낸다. */
  | { type: "effects"; target: number; effects: readonly EffectIcon[] }
  /** 지속 피해·회복 한 번: HP 막대를 깜빡임 없이 바꾸고 작은 숫자를 띄운다. */
  | { type: "dot"; target: number; text: string; heal: boolean; hpRatio: number }
  /** 공격 클립을 그 타격 프레임이 `impactSeconds`초 뒤에 오게 재생한다. 맞는 쪽은 그때 오는 hit 지시다. */
  | { type: "attack"; by: number; clip: AttackClip; impactSeconds: number }
  /** 맞은 자리에 `sparks` 색(스킬의 속성)의 불꽃이 튄다. */
  | { type: "hit"; target: number; hpRatio: number; text: string; crit: boolean; sparks: Color }
  | { type: "death"; id: number }
  /** 살아 있는 적이 모두 물러난다. */
  | { type: "retreat" }
  | { type: "revive" }
  /** 한 프레임에 여러 개(보스 처치, 클리어, 다음 웨이브)가 와도 뷰가 차례로 띄운다. */
  | { type: "banner"; text: string }
  /** 스테이지를 깨고 다음 스테이지로 넘어가 배경이 바뀐다. 배경은 그 스테이지의 그림 이름이다. 무대가 검게 덮였다가 바뀐 배경으로 걷힌다. */
  | { type: "background"; background: string }
  /** 무대를 잠깐 `color`로 다 덮었다가 걷는다(보스전의 시작과 실패). 글자는 막 위에 보인다. */
  | { type: "cover"; color: Color }
  /** 영웅 머리 위에 뜨는 레벨업 글자. 같은 프레임의 클리어 배너와 겹치지 않게 배너와 따로 둔다. */
  | { type: "levelUp"; text: string }
  /** 월드를 잠깐 멈춘다(치명타, 보스 처치). 연달아 오면 엔진이 거른다. */
  | { type: "hitStop"; seconds: number }
  /** 월드 카메라를 흔든다. 처음 크기 `strength`(유닛)가 `seconds`초 동안 0까지 줄어든다. */
  | { type: "shake"; strength: number; seconds: number };

export interface BattleDirector {
  /**
   * 전투를 서버 시각까지 진행하고, 그동안의 이벤트를 화면 지시로 바꿔 돌려준다. 효과음은 그 자리에서 낸다.
   * 뷰가 프레임마다 부른다.
   */
  frame(): readonly Direction[];
}

export interface BattleDirectorOptions {
  readonly battle: Pick<BattleService, "advance" | "snapshot" | "upcoming">;
  /** 스테이지 이름(클리어 배너)을 읽는다. */
  readonly data: GameData;
  /** 배너와 레벨업 글자. 뜨는 때의 언어다. */
  readonly t: Translate;
  readonly audio: Pick<Audio, "play">;
}

/**
 * 전투 이벤트에 내는 효과음의 키(Sounds 테이블의 id). 공격은 스킬의 속성 소리(Skills의 sfx, 비면 Constants의 hitSfx)이고
 * 치명타는 늘 critSfx다. 그 밖의 소리는 Constants 테이블이 정한다.
 */
function soundOf(event: ShownEvent, data: GameData): SoundsId | undefined {
  const sounds = data.constants;
  switch (event.type) {
    case "attack":
    case "impact": {
      const skill = data.skills.get(event.skillId);
      if (event.hits.length > 0) return event.crit ? sounds.critSfx : (skill?.sfx ?? sounds.hitSfx);
      // 맞은 대상이 없는 공격: 발사체를 쏘기만 한 것은 떨어질 때 내고, 버프·회복·소환은 쓸 때 속성 소리를 낸다.
      return event.type === "attack" && skill?.projectileId === null ? (skill.sfx ?? undefined) : undefined;
    }
    case "death":
      return event.id !== HERO_ID ? sounds.killSfx : undefined;
    case "bossStart":
      return sounds.bossSfx;
    case "stageClear":
      return sounds.clearSfx;
    case "levelUp":
      return sounds.levelUpSfx;
    default:
      return undefined;
  }
}

/** 치명타: 짧은 히트스톱과 약한 흔들림. */
const CRIT_FEEL = { stopSeconds: 0.05, strength: 0.06, shakeSeconds: 0.12 };
/** 보스 처치: 긴 히트스톱과 센 흔들림. */
const BOSS_KILL_FEEL = { stopSeconds: 0.15, strength: 0.25, shakeSeconds: 0.4 };
/** 보스에게 맞거나 쓰러진 영웅: 흔들림만. */
const HERO_HURT_FEEL = { strength: 0.12, shakeSeconds: 0.2 };

// 맞은 자리에서 튀는 불꽃의 색: 물리는 흰 노랑, 불은 주황, 얼음은 하늘, 독은 초록, 신성은 금색.
const SPARK_COLORS: Readonly<Record<SkillElement, Color>> = {
  [SkillElement.Physical]: [1, 0.95, 0.75],
  [SkillElement.Fire]: [1, 0.5, 0.15],
  [SkillElement.Ice]: [0.6, 0.9, 1],
  [SkillElement.Poison]: [0.5, 0.95, 0.3],
  [SkillElement.Holy]: [1, 0.9, 0.4],
};

/** 완성된 배우 그림에는 색을 입히지 않고, 그림이 없는 묶음에만 임시 몸의 색을 입힌다. */
// 보스전이 시작하면 무대를 검붉게, 보스에게 지면 검게 다 덮었다가 걷는다. 배너는 막 위에 뜬다.
const BOSS_COVER: Color = [0.22, 0.02, 0.02];
const BOSS_LOSE_COVER: Color = [0, 0, 0];

const BOSS_LOOK: ActorLook = { clips: "boss", color: [0.9, 0.2, 0.2], size: 1.6 };
/** Projectiles에 없는 발사체. */
const UNKNOWN_PROJECTILE: ProjectileLook = { clip: "orb", color: [0.8, 0.8, 0.8], size: 0.8, fromAbove: false };

// 효과 칸 막대의 색(아이콘이 없으면 칸의 색): 이로운 능력치는 초록, 해로운 능력치는 빨강, 지속 피해 보라, 회복 연두, 기절 노랑, 보호막 하늘, 그 밖에 회색.
// 공격 간격은 늘면 느려지므로 늘리는 쪽이 해롭다.
function effectColor(row: EffectsRow | undefined): Color {
  switch (row?.kind) {
    case EffectKind.Stat: {
      const raises = (row.power ?? 0) > 0;
      return raises === (row.stat === Stat.AttackInterval) ? [0.9, 0.3, 0.3] : [0.35, 0.85, 0.4];
    }
    case EffectKind.Damage:
      return [0.7, 0.35, 0.9];
    case EffectKind.Heal:
      return [0.55, 1, 0.55];
    case EffectKind.Stun:
      return [1, 0.85, 0.2];
    case EffectKind.Shield:
      return [0.4, 0.8, 1];
    default:
      return [0.75, 0.75, 0.75];
  }
}

// 효과 칸을 다시 보일 때: 효과의 종류·차례·겹 수가 다르거나 남은 틱이 늘었다(다시 걸림).
function effectsChanged(before: readonly EffectSnapshot[], after: readonly EffectSnapshot[]): boolean {
  return before.length !== after.length || after.some((effect, i) =>
    effect.effectId !== before[i].effectId || effect.stacks !== before[i].stacks || effect.ticksLeft > before[i].ticksLeft);
}

const secondsOf = (ticks: number) => (ticks * TICK_MS) / 1000;

// 영웅은 Heroes의 그림 묶음과 크기로 세우고 색을 입히지 않는다.
function heroLook(data: GameData): ActorLook {
  const row = data.heroes.get(data.constants.heroId);
  return { clips: row?.clips ?? "hero", color: [1, 1, 1], size: row?.size ?? 1 };
}

// 소환수는 Summons의 그림 묶음과 크기로 세우고 색을 입히지 않는다. 영웅 편과 적 편이 같은 행이면 같은 모습이다.
function summonLook(data: GameData, id: number): ActorLook {
  const row = data.summons.get(id);
  return { clips: row?.clips ?? "summon", color: [1, 1, 1], size: row?.size ?? 1 };
}

// 발사체는 Projectiles의 클립, 색, 크기로 날린다.
function projectileLook(data: GameData, id: number): ProjectileLook {
  const row = data.projectiles.get(id);
  if (!row) return UNKNOWN_PROJECTILE;
  const [r, g, b] = row.color;
  return { clip: row.clip, color: [r, g, b], size: row.size, fromAbove: row.fromAbove };
}

// 그림이 있는 몬스터(Monsters.clips)는 색을 입히지 않는다. 임시 몸은 색상환 위에 황금비(0.618034)만큼씩 건너뛰어
// ID가 이웃해도 색이 멀리 떨어진다.
function monsterLook(data: GameData, id: number, boss: boolean): ActorLook {
  const row = data.monsters.get(id);
  const size = row?.size ?? (boss ? BOSS_LOOK.size : 1);
  if (row?.clips) return { clips: row.clips, color: [1, 1, 1], size };
  return boss ? { ...BOSS_LOOK, size } : { clips: "monster", color: hsvToRgb((id * 0.618034) % 1, 0.6, 0.9), size };
}

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const channel = (n: number) => {
    const k = (n + h * 6) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return [channel(5), channel(3), channel(1)];
}

// 남은 HP / 최대 HP. 최대 HP를 모르면(맞고 쓰러져 스냅숏에 없다) 0이다.
function ratio(hp: Big, maxHp: Big | undefined): number {
  if (!maxHp || Big.sign(maxHp) <= 0) return 0;
  return Math.min(1, Math.max(0, Big.toNumber(Big.div(hp, maxHp))));
}

export function createBattleDirector({ battle, data, t, audio }: BattleDirectorOptions): BattleDirector {
  // 최대 HP는 프레임 끝 스냅숏에서 읽는다. 같은 프레임에 쓰러진 적은 스냅숏에 없어 0이 되는데, 그 적은
  // 곧 이어지는 death 지시로 사라지므로 막대가 보이지 않는다.
  function maxHpOf(id: number, snapshot: BattleSnapshot | undefined): Big | undefined {
    if (id === HERO_ID) return snapshot?.hero.maxHp;
    return (snapshot?.enemies.find(enemy => enemy.id === id) ?? snapshot?.summons.find(summon => summon.id === id))?.maxHp;
  }

  function flightOf(projectile: Omit<ProjectileSnapshot, "ticksLeft" | "targets"> & { targets: readonly number[] }, ticks: number): Flight {
    const { id, by, projectileId, targets } = projectile;
    return { id, by, targets, look: projectileLook(data, projectileId), flightSeconds: secondsOf(ticks) };
  }

  function direct(event: ShownEvent, snapshot: BattleSnapshot | undefined): Direction[] {
    switch (event.type) {
      case "reset": {
        if (!snapshot) return [];
        const { hero, enemies, summons, projectiles } = snapshot;
        return [{
          type: "reset",
          background: data.stages.get(snapshot.stageId)?.background ?? "",
          hero: { look: heroLook(data), hpRatio: ratio(hero.hp, hero.maxHp), down: hero.down, x: hero.x },
          enemies: enemies.map(enemy => ({
            id: enemy.id, look: monsterLook(data, enemy.monsterId, enemy.boss), boss: enemy.boss, hpRatio: ratio(enemy.hp, enemy.maxHp), x: enemy.x,
          })),
          summons: summons.map(summon => ({
            id: summon.id, look: summonLook(data, summon.summonId), ally: summon.ally, hpRatio: ratio(summon.hp, summon.maxHp),
            x: summon.x,
          })),
          projectiles: projectiles.map(projectile => flightOf(projectile, projectile.ticksLeft)),
        }];
      }
      case "spawn":
        return [{ type: "monsterAppear", id: event.id, look: monsterLook(data, event.monsterId, event.boss), boss: event.boss, x: event.x }];
      case "waveStart":
        return [{ type: "banner", text: t("battle.wave", { wave: event.wave, waves: event.wavesNeeded }) }];
      case "summon": {
        const ally = event.by === HERO_ID || snapshot?.summons.find(summon => summon.id === event.id)?.ally === true;
        return [{ type: "summonAppear", id: event.id, by: event.by, look: summonLook(data, event.summonId), ally }];
      }
      case "expire":
        return [{ type: "summonLeave", id: event.id }];
      case "launch":
        return [{ type: "launch", ...flightOf(event, event.flightTicks) }];
      case "vanish":
        return [{ type: "projectileEnd", id: event.id, landed: false }];
      case "effectTick": {
        const heal = data.effects.get(event.effectId)?.kind === EffectKind.Heal;
        const amount = heal ? event.amount : Big.sub(event.amount, event.absorbed);
        return [{ type: "dot", target: event.id, text: (heal ? "+" : "") + formatBig(amount), heal, hpRatio: ratio(event.hp, maxHpOf(event.id, snapshot)) }];
      }
      // 공격하는 배우는 `upcoming()`이 먼저 알렸으므로 맞은 대상만 보인다. 발사체를 쏘기만 한 공격은 hits가 비고, 떨어질 때(impact) 보인다.
      case "attack":
      case "impact": {
        const sparks = SPARK_COLORS[data.skills.get(event.skillId)?.element ?? SkillElement.Physical];
        const directions: Direction[] = [
          ...(event.type === "impact" ? [{ type: "projectileEnd", id: event.id, landed: true } as const] : []),
          ...event.hits.map((hit): Direction => ({
            type: "hit",
            target: hit.target,
            hpRatio: ratio(hit.hp, maxHpOf(hit.target, snapshot)),
            text: formatBig(hit.damage) + (event.crit ? "!" : ""),
            crit: event.crit,
            sparks,
          })),
        ];
        if (event.crit && event.hits.length > 0) directions.push(...feel(CRIT_FEEL));
        if (bosses.has(event.by) && event.hits.some(hit => hit.target === HERO_ID)) directions.push(...feel(HERO_HURT_FEEL));
        return directions;
      }
      case "death":
        if (event.id === HERO_ID) return [{ type: "death", id: event.id }, ...feel(HERO_HURT_FEEL)];
        return [{ type: "death", id: event.id }, ...(bosses.has(event.id) ? feel(BOSS_KILL_FEEL) : [])];
      case "retreat":
        return [{ type: "retreat" }];
      case "revive":
        return [{ type: "revive" }];
      // 아래 셋은 영웅을 최대 HP로 되돌린다(보스에게 쓰러졌으면 일으킨다). 이벤트가 따로 없으므로 다시 세운다.
      // 보스를 이기면 쓰러뜨리는 타격감과 다음 스테이지로 가는 배경 전환이 이어지므로 덮지 않는다.
      case "bossStart":
        return [{ type: "cover", color: BOSS_COVER }, { type: "banner", text: t("battle.bossAppear") }, { type: "revive" }];
      case "bossEnd":
        return [
          ...(event.win ? [] : [{ type: "cover", color: BOSS_LOSE_COVER } as const]),
          { type: "banner", text: t(event.win ? "battle.bossWin" : "battle.bossLose") },
          { type: "revive" },
        ];
      case "stageClear": {
        const stage = data.stages.get(event.stageId);
        const next = event.nextId === null ? undefined : data.stages.get(event.nextId);
        return [
          { type: "banner", text: t("battle.stageClear", { stage: stage ? t(stage.nameKey) : "" }) },
          { type: "revive" },
          ...(next ? [{ type: "background" as const, background: next.background }] : []),
        ];
      }
      // 레벨업도 영웅을 새 최대 HP로 회복시킨다.
      case "levelUp":
        return [{ type: "levelUp", text: t("battle.levelUp", { level: event.level }) }, { type: "revive" }];
      // 효과의 부여·만료는 프레임 끝 스냅숏과 견주어 effects 지시로 낸다(effectDirections). 면역은 보이지 않는다.
      // shortcut: 겹 수는 칸에 보이지 않는다. 칸에 숫자가 필요해지면 EffectIcons에 글자를 둔다.
      default:
        return [];
    }
  }

  // shortcut: 클립은 스킬의 재사용 대기와 보스 여부로 고른다. 스킬마다 다른 클립이 필요해지면 Skills 테이블에 열을 둔다.
  // 기본 공격은 재사용 대기가 0인 스킬이고, 그런 스킬이 없는 배우의 기본 공격은 skillId 0이다.
  function clipOf({ by, skillId }: UpcomingAttack, snapshot: BattleSnapshot | undefined): AttackClip {
    const skill = data.skills.get(skillId);
    if (!skill || skill.cooldownSeconds === 0) return "attack";
    return snapshot?.enemies.find(enemy => enemy.id === by)?.boss ? "special" : "cast";
  }

  // 소환수의 사망은 처치가 아니라서 처치음을 내지 않는다. reset 앞에 나온 소환수는 스냅숏에서 읽는다.
  const summons = new Set<number>();
  // 보스의 전투원 id. 쓰러뜨리면 크게 흔들고, 영웅을 때리면 흔든다. id는 전투 안에서 다시 쓰지 않으므로 reset까지 둔다.
  const bosses = new Set<number>();

  function feel({ stopSeconds, strength, shakeSeconds }: { stopSeconds?: number; strength: number; shakeSeconds: number }): Direction[] {
    return [...(stopSeconds ? [{ type: "hitStop", seconds: stopSeconds } as const] : []), { type: "shake", strength, seconds: shakeSeconds }];
  }
  // 배우마다 마지막으로 보인 효과. reset이면 비워서 모두 다시 보인다.
  let shownEffects = new Map<number, readonly EffectSnapshot[]>();
  // 배우마다 마지막으로 보인 자리. reset이면 비워서 모두 다시 보인다.
  let shownPlaces = new Map<number, ActorPlace>();

  // 프레임 끝 스냅숏에서 자리나 걷기가 바뀐 배우. 시뮬레이션은 0.1초 틱마다 걸으므로 프레임 대부분은 바뀐 것이 없다.
  function moveDirections(snapshot: BattleSnapshot | undefined): Direction[] {
    if (!snapshot) return [];
    const next = new Map<number, ActorPlace>();
    const places: ActorPlace[] = [];
    for (const { id, x, moving } of [{ id: HERO_ID, ...snapshot.hero }, ...snapshot.enemies, ...snapshot.summons]) {
      const place = { id, x, moving };
      next.set(id, place);
      const shown = shownPlaces.get(id);
      if (!shown || shown.x !== x || shown.moving !== moving) places.push(place);
    }
    shownPlaces = next;
    return places.length > 0 ? [{ type: "move", places }] : [];
  }

  function effectDirections(snapshot: BattleSnapshot | undefined): Direction[] {
    const next = new Map<number, readonly EffectSnapshot[]>();
    const directions: Direction[] = [];
    const fighters = snapshot ? [{ id: HERO_ID, ...snapshot.hero }, ...snapshot.enemies, ...snapshot.summons] : [];
    for (const { id, effects } of fighters) {
      next.set(id, effects);
      if (!effectsChanged(shownEffects.get(id) ?? [], effects)) continue;
      directions.push({
        type: "effects",
        target: id,
        effects: effects.map(effect => {
          const row = data.effects.get(effect.effectId);
          return { icon: row?.icon ?? "", color: effectColor(row), seconds: secondsOf(effect.ticksLeft), total: row?.durationSeconds ?? 0 };
        }),
      });
    }
    shownEffects = next;
    return directions;
  }

  return {
    frame() {
      const events = battle.advance();
      const snapshot = battle.snapshot.value;
      for (const event of events) {
        if (event.type === "reset") {
          summons.clear();
          for (const summon of snapshot?.summons ?? []) summons.add(summon.id);
          bosses.clear();
          for (const enemy of snapshot?.enemies ?? []) if (enemy.boss) bosses.add(enemy.id);
          shownEffects = new Map();
          shownPlaces = new Map();
        } else if (event.type === "summon") {
          summons.add(event.id);
        } else if (event.type === "spawn" && event.boss) {
          bosses.add(event.id);
        }
        if ((event.type === "death" || event.type === "expire") && summons.delete(event.id)) continue;
        const sound = soundOf(event, data);
        if (sound) audio.play(sound);
      }
      const directions = events.flatMap(event => direct(event, snapshot));
      directions.push(...moveDirections(snapshot), ...effectDirections(snapshot));
      for (const attack of battle.upcoming(ATTACK_LEAD_MS)) {
        directions.push({ type: "attack", by: attack.by, clip: clipOf(attack, snapshot), impactSeconds: attack.inMs / 1000 });
      }
      return directions;
    },
  };
}
