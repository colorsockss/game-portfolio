import { Big } from "@idle/big-number";
import { GameErrorCode, type Opcode } from "@idle/codes";
import type { CommandOf } from "../command.js";
import { MAX_STAT_UPGRADE_STEPS, statUpgradeBatch, statUpgradeCost } from "../stat-upgrade.js";
import { fail, refit, type CommandHandler } from "./types.js";

// 강화는 착용(equipment.ts)처럼 `now`의 틱까지 확정한 상태에서 그 틱의 새 능력치로 전투를 이어 간다. 되돌릴 수 없으므로 최대 HP가
// 오른 만큼 HP도 올린다. 비용은 그 확정의 골드에서 낸다: 진행 중인 웨이브의 처치 보상도 들어 있어 보이는 골드와 같다.

/**
 * 강화 하나를 `steps`단계까지 한 번에 올린다(statUpgradeBatch). 최대 단계나 확정한 골드가 모자란 데서 멈춘다. 없는 강화, 1–100이
 * 아닌 `steps`는 거절하고, 한 단계도 못 올리면(최대 단계, 다음 단계의 비용보다 적은 골드) 거절한다.
 */
export const upgradeStat: CommandHandler<CommandOf<Opcode.StatUpgrade>> = (settled, { upgradeId, steps }, { data }) => {
  // 네트워크에서 온 값이지만 Map은 프로토타입의 키를 찾지 않고, 정수가 아니면 행이 없다.
  const row = data.statUpgrades.get(upgradeId);
  if (row === undefined) return fail(GameErrorCode.StatUpgradeNotFound, `Stat upgrade ${String(upgradeId)} does not exist.`);
  if (!Number.isSafeInteger(steps) || steps < 1 || steps > MAX_STAT_UPGRADE_STEPS) {
    return fail(GameErrorCode.InvalidCommand, `Cannot raise a stat upgrade by ${String(steps)} steps.`);
  }
  const step = settled.statUpgrades[row.id] ?? 0;
  if (step >= row.maxStep) return fail(GameErrorCode.StatUpgradeMaxed, `Stat upgrade ${row.id} is at its max step ${row.maxStep}.`);
  const { goldItemId } = data.constants;
  const gold = settled.items[goldItemId] ?? Big.ZERO;
  const bought = statUpgradeBatch(step, row.maxStep, gold, steps);
  if (bought.steps === 0) {
    const cost = statUpgradeCost(step);
    return fail(GameErrorCode.NotEnoughGold, `Stat upgrade ${row.id} costs ${Big.toNumber(cost)} gold but ${Big.toNumber(gold)} is held.`);
  }
  const player = {
    ...settled,
    items: { ...settled.items, [goldItemId]: Big.floor(Big.sub(gold, bought.cost)) },
    statUpgrades: { ...settled.statUpgrades, [row.id]: step + bought.steps },
  };
  return refit(settled, player, data, true);
};
