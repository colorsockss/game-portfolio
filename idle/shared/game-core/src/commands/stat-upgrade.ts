import { Big } from "@idle/big-number";
import { GameErrorCode, type Opcode } from "@idle/codes";
import { settle } from "../battle/settle.js";
import { refitHero } from "../battle/simulation.js";
import type { CommandOf } from "../command.js";
import { minus } from "../items.js";
import { statUpgradeCost } from "../stat-upgrade.js";
import { fail, ok, type CommandHandler } from "./types.js";

// 강화는 착용(equipment.ts)처럼 `now`의 틱까지 확정한 뒤 그 틱에서 새 능력치로 전투를 이어 간다. 비용은 그 확정의 골드에서
// 낸다: 진행 중인 웨이브의 처치 보상도 들어 있어 보이는 골드와 같다.

/** 강화 하나를 한 단계 올린다. 없는 강화, 최대 단계, 확정한 골드가 다음 단계의 비용보다 적으면 거절한다. */
export const upgradeStat: CommandHandler<CommandOf<Opcode.StatUpgrade>> = (state, { upgradeId }, { now, data }) => {
  // 네트워크에서 온 값이지만 Map은 프로토타입의 키를 찾지 않고, 정수가 아니면 행이 없다.
  const row = data.statUpgrades.get(upgradeId);
  if (row === undefined) return fail(GameErrorCode.StatUpgradeNotFound, `Stat upgrade ${String(upgradeId)} does not exist.`);
  const step = state.statUpgrades[row.id] ?? 0;
  if (step >= row.maxStep) return fail(GameErrorCode.StatUpgradeMaxed, `Stat upgrade ${row.id} is at its max step ${row.maxStep}.`);
  // 단계는 전투가 바꾸지 않으므로 커맨드에서 가장 비싼 확정은 단계를 본 뒤에 한다.
  const settled = settle(state, data, now);
  const { goldItemId } = data.constants;
  const gold = settled.items[goldItemId] ?? Big.ZERO;
  const cost = statUpgradeCost(step);
  if (Big.lt(gold, cost)) {
    return fail(GameErrorCode.NotEnoughGold, `Stat upgrade ${row.id} costs ${Big.toNumber(cost)} gold but ${Big.toNumber(gold)} is held.`);
  }
  const player = {
    ...settled,
    items: { ...settled.items, [goldItemId]: minus(gold, cost) },
    statUpgrades: { ...settled.statUpgrades, [row.id]: step + 1 },
  };
  return ok({ ...player, battle: refitHero(settled, player, data) });
};
