// 밸런스 시뮬레이션: 서버가 만드는 새 계정으로 N시간을 플레이한다. 규칙은 따로 두지 않고 클라이언트처럼 정해진
// 간격마다 `BattleSettle`을 보내고 단순한 정책으로 커맨드를 고르며, 모두 game-core의 `applyCommand`가 적용한다.
// 오프라인 공백은 커맨드를 보내지 않는 시간이고, 돌아와서 보내는 정산이 오프라인 보상을 준다.
import { Big } from "@idle/big-number";
import { Opcode } from "@idle/codes";
import type { GameData } from "@idle/data-schema";
import {
  applyCommand,
  enhanceCost,
  HOUR,
  heroStats,
  isUnlocked,
  rebirthPoints,
  skillLevel,
  skillLevelCost,
  statUpgradeCost,
  type CombatStats,
  type Command,
  type EquipmentInstance,
  type ItemAmounts,
  type PlayerState,
  type RebirthState,
} from "@idle/game-core";
import { createPlayer } from "@idle/server/save";

// 아무 시각이나 된다. 0만은 체크포인트가 없다는 뜻이라 피한다.
const START = Date.UTC(2026, 0, 1);

export interface SimulationOptions {
  readonly hours: number;
  /** 전투 난수의 시작 상태(uint32). 같으면 같은 곡선이 나온다. */
  readonly seed: number;
  /** 한 번 접속해 있는 시간(ms). Infinity면 내내 접속해 있다. */
  readonly online: number;
  /** 접속 사이의 공백(ms). 0이면 떠나지 않는다. */
  readonly offline: number;
  /** 접속해 있는 동안 정산을 보내고 정책을 돌리는 간격(ms). 클라이언트는 60초다(SETTLE_INTERVAL_MS). */
  readonly step: number;
  /** 이 레벨에 닿으면 환생한다(받을 포인트가 있을 때). 0이면 환생하지 않는다. */
  readonly rebirthLevel: number;
}

/** 정각마다의 저장 데이터. 떠나 있는 동안은 떠날 때의 것이다. */
export interface Sample {
  readonly hour: number;
  readonly online: boolean;
  readonly level: number;
  /** 환생 횟수와 쌓은 포인트. */
  readonly rebirth: RebirthState;
  /** 골드, 경험치(레벨업에 쓰고 남은 것) 같은 보유량. */
  readonly items: ItemAmounts;
  readonly stageId: number;
  /** 슬롯 순서로 입은 장비(Items.id와 강화 단계). */
  readonly equipped: readonly EquipmentInstance[];
  /** StatUpgrades ID 순서로 강화 단계. */
  readonly upgrades: readonly number[];
  /** 슬롯 순서로 장착한 스킬의 레벨. */
  readonly skillLevels: readonly number[];
  readonly stats: CombatStats;
  readonly power: number;
}

export function simulate(data: GameData, { hours, seed, online, offline, step, rebirthLevel }: SimulationOptions): Sample[] {
  const created = createPlayer("balance", data, START);
  let state: PlayerState = { ...created, battle: { ...created.battle, rng: seed >>> 0 } };
  const end = START + hours * HOUR;
  const samples = [sample(state, 0, true, data)];
  const policy = createPolicy(data, rebirthLevel);
  let now = START;
  let leaveAt = START + online;
  while (now < end) {
    const mark = START + samples.length * HOUR;
    if (offline > 0 && now >= leaveAt) {
      const back = Math.min(end, now + offline);
      for (let at = mark; at < back; at += HOUR) samples.push(sample(state, samples.length, false, data));
      now = back;
      leaveAt = back + online;
    } else {
      now = Math.min(now + step, leaveAt, mark);
    }
    state = policy(state, now);
    if (now === START + samples.length * HOUR) samples.push(sample(state, samples.length, true, data));
  }
  return samples;
}

/**
 * 정산한 뒤 환생할 레벨이면 환생하고, 더 강한 장비를 입고, 클리어한 스테이지에 머물면 해금된 다음 스테이지로 옮기고, 보스에
 * 도전하고, 비용이 닿는 만큼 성장을 산다(`purchases`).
 */
function createPolicy(data: GameData, rebirthLevel: number): (state: PlayerState, now: number) => PlayerState {
  // 진 보스는 그 뒤에 전투력이 올라야 다시 도전한다.
  let tried: { stageId: number; power: number } | undefined;
  return (state, now) => {
    const send = (command: Command): PlayerState => {
      const result = applyCommand(state, command, { now, data });
      // 정책은 받아들여질 커맨드만 보내므로 거절은 정책이나 규칙의 버그다.
      if (!result.ok) throw new Error(`Command ${command.type} was rejected: ${result.error.message}`);
      return result.state;
    };
    state = send({ type: Opcode.BattleSettle });
    // 골드는 정산마다 다 쓰므로 환생이 버리는 골드는 마지막 정산 한 번 몫이다. 환생은 사냥을 다시 시작해 진행 중인 웨이브를 버린다.
    const { level } = state.profile;
    if (rebirthLevel > 0 && level >= rebirthLevel && rebirthPoints(level) > 0) state = send({ type: Opcode.Rebirth });

    for (const key of Object.keys(state.equipment.owned)) {
      const equipmentId = Number(key);
      const slot = data.items.get(state.equipment.owned[equipmentId].itemId)?.slot;
      if (slot == null || state.equipment.equipped[slot] === equipmentId) continue;
      const equipment = { ...state.equipment, equipped: { ...state.equipment.equipped, [slot]: equipmentId } };
      if (powerOf(heroStats({ ...state, equipment }, data)) > powerOf(heroStats(state, data))) {
        state = send({ type: Opcode.ItemEquip, equipmentId });
      }
    }

    const { currentId, clearedIds } = state.stage;
    if (clearedIds.includes(currentId)) {
      let next: number | undefined;
      for (const row of data.stages.values()) {
        if (clearedIds.includes(row.id) || !isUnlocked(row, state)) continue;
        if (next === undefined || row.id < next) next = row.id;
      }
      if (next !== undefined) state = send({ type: Opcode.StageSelect, stageId: next });
    }

    const row = data.stages.get(state.stage.currentId);
    const power = powerOf(heroStats(state, data));
    if (row?.bossId != null && !state.battle.autoBoss && !state.stage.clearedIds.includes(row.id)
      && (tried?.stageId !== row.id || power > tried.power)) {
      tried = { stageId: row.id, power };
      state = send({ type: Opcode.BossChallenge });
    }

    // 보유량은 남기지 않고, 낼 수 있는 것 중 가장 싼 것부터 산다(같으면 purchases의 순서). 강화와 스킬 레벨업의 비용 공식이
    // 다르므로 싼 쪽이 번갈아 오른다.
    for (let next = cheapest(state, data); next !== undefined; next = cheapest(state, data)) state = send(next.command);
    return state;
  };
}

/** 살 수 있는 성장 하나: 내는 아이템과 양, 보낼 커맨드. */
interface Purchase {
  readonly itemId: number;
  readonly cost: Big;
  readonly command: Command;
}

/**
 * 지금 살 수 있는 성장: 최대가 아닌 강화의 다음 단계(StatUpgrades ID 순서), 장착한 스킬의 다음 레벨(슬롯 순서), 입은 장비의
 * 다음 강화 단계(슬롯 순서). 스킬 배우기와 장착 바꾸기는 하지 않는다: 새 계정은 슬롯이 다 찬 채 시작해 배운 스킬을 쓰려면 바꿔
 * 끼워야 하는데, 이 툴에는 스킬의 값어치를 재는 기준이 없다(전투력은 능력치만 본다). 장비 합성도 하지 않는다: 지금 데이터에서
 * 같은 장비는 지난 스테이지를 다시 돌아야 모이고, 이 정책은 앞으로만 간다.
 */
function purchases(state: PlayerState, data: GameData): Purchase[] {
  const found: Purchase[] = [];
  for (const row of [...data.statUpgrades.values()].sort((a, b) => a.id - b.id)) {
    const step = state.statUpgrades[row.id] ?? 0;
    if (step < row.maxStep) {
      found.push({ itemId: data.constants.goldItemId, cost: statUpgradeCost(step), command: { type: Opcode.StatUpgrade, upgradeId: row.id, steps: 1 } });
    }
  }
  const { skills } = state;
  for (const id of Object.values(skills.equipped)) {
    const row = data.skills.get(id)!;
    const level = skillLevel(skills, id);
    if (row.costItemId !== null && level > 0 && level < row.maxLevel) {
      found.push({ itemId: row.costItemId, cost: skillLevelCost(level), command: { type: Opcode.SkillLevelUp, skillId: id } });
    }
  }
  const { equipment } = state;
  for (const equipmentId of Object.values(equipment.equipped)) {
    const { itemId, enhance } = equipment.owned[equipmentId];
    if (enhance < (data.items.get(itemId)?.enhanceMax ?? 0)) {
      found.push({ itemId: data.constants.goldItemId, cost: enhanceCost(enhance), command: { type: Opcode.ItemEnhance, equipmentId } });
    }
  }
  return found;
}

// 낼 수 있는 것 중 가장 싼 것.
function cheapest(state: PlayerState, data: GameData): Purchase | undefined {
  let best: Purchase | undefined;
  for (const purchase of purchases(state, data)) {
    if (Big.lt(state.items[purchase.itemId] ?? Big.ZERO, purchase.cost)) continue;
    if (best === undefined || Big.lt(purchase.cost, best.cost)) best = purchase;
  }
  return best;
}

// shortcut: 가중치는 이 툴이 장비를 고르려고 정한 것이고 게임 규칙이 아니다. 게임이 전투력을 보여 주게 되면 그 정의를 쓴다.
function powerOf(stats: CombatStats): number {
  return Math.floor(Big.toNumber(stats.attack) + Big.toNumber(stats.defense) + Big.toNumber(stats.maxHp) / 10);
}

function sample(state: PlayerState, hour: number, online: boolean, data: GameData): Sample {
  const stats = heroStats(state, data);
  const { equipped, owned } = state.equipment;
  return {
    hour,
    online,
    level: state.profile.level,
    rebirth: state.rebirth,
    items: state.items,
    stageId: state.stage.currentId,
    equipped: Object.keys(equipped).map(slot => owned[equipped[Number(slot)]]),
    upgrades: [...data.statUpgrades.keys()].sort((a, b) => a - b).map(id => state.statUpgrades[id] ?? 0),
    skillLevels: Object.values(state.skills.equipped).map(id => skillLevel(state.skills, id)),
    stats,
    power: powerOf(stats),
  };
}
