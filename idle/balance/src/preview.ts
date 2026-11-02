// 공식 툴(Formula Lab) 안의 N초 전투 미리보기. 새 계정을 고른 스테이지와 레벨로 옮겨 사냥을 N초 돌리고 이벤트를
// 모아 영웅이 준 피해와 받은 피해, 처치·사망, 스킬과 효과별 합계를 돌려준다. 툴은 게임 코드를 import하지 않으므로
// `run.mjs --preview`가 표준 입력으로 받은 툴의 프로젝트를 formulas.ts 대신 묶어 이 파일을 부르고, 결과를 JSON으로
// 표준 출력에 쓴다. 장비는 입지 않고, 레벨업과 클리어는 실제 플레이처럼 일어난다.
import { readFile } from "node:fs/promises";
import { Big } from "@idle/big-number";
import { Opcode } from "@idle/codes";
import { EffectKind, loadGameData, type GameData } from "@idle/data-schema";
import {
  applyCommand,
  HERO_ID,
  SECOND,
  startBattle,
  TICK_MS,
  type BattleEvent,
  type Command,
  type Hit,
  type PlayerState,
} from "@idle/game-core";
import { createPlayer } from "@idle/server/save";

// 아무 시각이나 된다. 0만은 체크포인트가 없다는 뜻이라 피한다.
const START = Date.UTC(2026, 0, 1);
/** 한 번에 돌리는 최대 시간(초). 24시간이 약 0.1초다. */
export const MAX_PREVIEW_SECONDS = 24 * 60 * 60;

/** 툴이 보내는 요청. `project`(Formula Lab 프로젝트)는 run.mjs가 묶을 때 쓰고 여기서는 읽지 않는다. */
export interface PreviewRequest {
  readonly stageId: number;
  readonly level: number;
  readonly seconds: number;
  /** 전투 난수의 시작 상태(uint32). 같으면 같은 전투다. */
  readonly seed: number;
}

/** 영웅이 쓴 스킬 하나의 합계. 발사체 스킬의 피해는 떨어질 때 센다. */
export interface SkillTotal {
  readonly skillId: number;
  readonly uses: number;
  readonly crits: number;
  readonly hits: number;
  readonly damage: number;
}

/** 효과 하나의 합계(누가 걸었든). `amount`는 지속 피해·회복이 든 양의 합이다(보호막이 막기 전). */
export interface EffectTotal {
  readonly effectId: number;
  readonly kind: EffectKind;
  readonly applied: number;
  readonly ticks: number;
  readonly amount: number;
}

/** 수는 사람이 읽는 double이다(규칙이 아니라 표시용). */
export interface PreviewResult {
  readonly seconds: number;
  readonly hero: {
    /** 공격과 착탄으로 준 피해(보호막이 막은 양 포함). */
    readonly damage: number;
    /** 적에게 든 지속 피해. */
    readonly dotDamage: number;
    /** (damage + dotDamage) ÷ 초. */
    readonly dps: number;
    readonly kills: number;
    readonly deaths: number;
    /** 공격과 지속 피해로 줄어든 HP(보호막이 막은 양 제외). */
    readonly damageTaken: number;
    readonly absorbed: number;
    readonly healed: number;
  };
  readonly progress: {
    readonly level: number;
    readonly stageId: number;
    readonly waves: number;
    readonly stageClears: number;
    readonly bossWins: number;
    readonly bossLosses: number;
    readonly levelUps: number;
  };
  readonly skills: readonly SkillTotal[];
  readonly effects: readonly EffectTotal[];
}

/** 요청의 스테이지·레벨에서 새 사냥을 시작하는 계정. 체크포인트는 `START`다. */
function startState(data: GameData, { stageId, level, seed }: PreviewRequest): PlayerState {
  // 레벨은 마지막에 정해, 스테이지의 해금 레벨보다 낮은 영웅도 미리 본다.
  const commands: Command[] = [
    { type: Opcode.CheatStageUnlock, stageId },
    { type: Opcode.StageSelect, stageId },
    { type: Opcode.CheatLevelSet, level },
  ];
  const state = commands.reduce((current, command) => {
    const result = applyCommand(current, command, { now: START, data });
    if (!result.ok) throw new Error(result.error.message);
    return result.state;
  }, createPlayer("preview", data, START));
  return { ...state, battle: { ...state.battle, rng: seed >>> 0 } };
}

function check(request: PreviewRequest): void {
  const { stageId, level, seconds, seed } = request;
  const integer = (value: unknown, min: number, max: number) => Number.isInteger(value) && (value as number) >= min && (value as number) <= max;
  if (!integer(seconds, 1, MAX_PREVIEW_SECONDS)) throw new Error(`seconds must be an integer from 1 to ${MAX_PREVIEW_SECONDS}, got ${String(seconds)}.`);
  if (!integer(seed, 0, 0xffffffff)) throw new Error(`seed must be a uint32, got ${String(seed)}.`);
  if (!integer(stageId, 0, Number.MAX_SAFE_INTEGER) || !integer(level, 0, Number.MAX_SAFE_INTEGER)) {
    throw new Error(`stageId and level must be integers, got ${String(stageId)} and ${String(level)}.`);
  }
}

export function preview(data: GameData, request: PreviewRequest): PreviewResult {
  check(request);
  const player = startState(data, request);
  const battle = startBattle({ player, data });
  const skills = new Map<number, { uses: number; crits: number; hits: number; damage: Big }>();
  const effects = new Map<number, { applied: number; ticks: number; amount: Big }>();
  let damage = Big.ZERO;
  let dotDamage = Big.ZERO;
  let damageTaken = Big.ZERO;
  let absorbed = Big.ZERO;
  let healed = Big.ZERO;
  let kills = 0;
  let deaths = 0;
  let stageClears = 0;
  let bossWins = 0;
  let bossLosses = 0;
  let levelUps = 0;

  const skill = (skillId: number) => {
    let total = skills.get(skillId);
    if (total === undefined) skills.set(skillId, (total = { uses: 0, crits: 0, hits: 0, damage: Big.ZERO }));
    return total;
  };
  const effect = (effectId: number) => {
    let total = effects.get(effectId);
    if (total === undefined) effects.set(effectId, (total = { applied: 0, ticks: 0, amount: Big.ZERO }));
    return total;
  };
  const kindOf = (effectId: number) => {
    const row = data.effects.get(effectId);
    if (row === undefined) throw new Error(`Unknown effect ${effectId}.`);
    return row.kind;
  };
  // 공격과 착탄의 피해. 영웅이 친 것은 스킬에, 영웅이 맞은 것은 받은 피해에 센다.
  const strike = (by: number, skillId: number, hits: readonly Hit[]) => {
    for (const hit of hits) {
      if (by === HERO_ID) {
        const total = skill(skillId);
        total.hits++;
        total.damage = Big.add(total.damage, hit.damage);
        damage = Big.add(damage, hit.damage);
      } else if (hit.target === HERO_ID) {
        damageTaken = Big.add(damageTaken, Big.sub(hit.damage, hit.absorbed));
        absorbed = Big.add(absorbed, hit.absorbed);
      }
    }
  };

  battle.advance((request.seconds * SECOND) / TICK_MS, (event: BattleEvent) => {
    switch (event.type) {
      case "attack":
        if (event.by === HERO_ID) {
          const total = skill(event.skillId);
          total.uses++;
          if (event.crit) total.crits++;
        }
        strike(event.by, event.skillId, event.hits);
        break;
      case "impact":
        strike(event.by, event.skillId, event.hits);
        break;
      case "effectApply":
        effect(event.effectId).applied++;
        break;
      case "effectTick": {
        const total = effect(event.effectId);
        total.ticks++;
        total.amount = Big.add(total.amount, event.amount);
        const kind = kindOf(event.effectId);
        if (event.id === HERO_ID) {
          if (kind === EffectKind.Heal) healed = Big.add(healed, event.amount);
          else {
            damageTaken = Big.add(damageTaken, Big.sub(event.amount, event.absorbed));
            absorbed = Big.add(absorbed, event.absorbed);
          }
        } else if (kind === EffectKind.Damage) {
          dotDamage = Big.add(dotDamage, event.amount);
        }
        break;
      }
      case "death":
        // 영웅이 아닌 전투원은 지금 모두 적이다(59의 소환수가 생기면 진영을 본다).
        if (event.id === HERO_ID) deaths++;
        else kills++;
        break;
      case "stageClear":
        stageClears++;
        break;
      case "bossEnd":
        if (event.win) bossWins++;
        else bossLosses++;
        break;
      case "levelUp":
        levelUps++;
        break;
    }
  });

  const end = battle.snapshot();
  const shown = Big.toNumber;
  return {
    seconds: request.seconds,
    hero: {
      damage: shown(damage),
      dotDamage: shown(dotDamage),
      dps: shown(Big.div(Big.add(damage, dotDamage), request.seconds)),
      kills,
      deaths,
      damageTaken: shown(damageTaken),
      absorbed: shown(absorbed),
      healed: shown(healed),
    },
    progress: { level: end.hero.level, stageId: end.stageId, waves: end.waves, stageClears, bossWins, bossLosses, levelUps },
    skills: [...skills].sort(([a], [b]) => a - b).map(([skillId, t]) => ({ skillId, uses: t.uses, crits: t.crits, hits: t.hits, damage: shown(t.damage) })),
    effects: [...effects].sort(([a], [b]) => a - b).map(([effectId, t]) => ({ effectId, kind: kindOf(effectId), applied: t.applied, ticks: t.ticks, amount: shown(t.amount) })),
  };
}

/** run.mjs가 부른다: 게임 데이터를 읽어 미리보기를 돌린다. */
export async function runPreview(request: PreviewRequest): Promise<PreviewResult> {
  const dataDirectory = new URL("../../shared/data-schema/data/", import.meta.url);
  const data = await loadGameData(table => readFile(new URL(`${table}.bytes`, dataDirectory)));
  return preview(data, request);
}
