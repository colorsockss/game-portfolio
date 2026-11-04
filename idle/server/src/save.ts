// 서버 쪽 저장: 새 계정이 시작하는 상태와 저장 데이터의 형식. 저장된 데이터에는 쓰인 형식 버전이
// 함께 담기고 읽을 때 최신으로 올리므로, PlayerState를 바꿔도 이미 저장된 데이터가 깨지지 않는다.
import { decode, encode } from "@msgpack/msgpack";
import { Big } from "@idle/big-number";
import type { GameData } from "@idle/data-schema";
import {
  firstStageId,
  freshBattle,
  NO_EQUIPMENT,
  NO_REBIRTH,
  NO_STAT_UPGRADES,
  startSkills,
  startTutorial,
  type PlayerState,
} from "@idle/game-core";

/** 저장 데이터를 형식 버전 하나만큼 올린다. 옛 형태에는 타입이 없으므로 일반 데이터로 다룬다. */
export type Migration = (save: Record<string, unknown>) => Record<string, unknown>;

// migrations[i]는 저장 데이터를 버전 i + 1에서 i + 2로 올린다. 배포한 마이그레이션은 고치거나
// 지우지 않는다. 그 전에 쓴 저장 데이터에 아직 필요하다. 현재 버전은 목록 길이로 정해지므로
// 마이그레이션을 덧붙이는 것이 변경의 전부다.
const migrations: readonly Migration[] = [
  // 1 → 2: 전투 체크포인트(mode 0은 사냥). at 0은 첫 정산이 상한을 넘은 공백으로 보고 그때부터 새
  // 사냥을 시작하므로 게임 데이터가 필요 없다.
  save => ({
    ...save,
    battle: { mode: 0, at: 0, rng: 0, heroHp: { m: 0, e: 0 }, cooldowns: [], kills: 0, autoBoss: true },
  }),
  // 2 → 3: 골드와 경험치를 아이템 보유량으로 옮긴다. 이 버전의 Items에서 1이 골드, 2가 경험치다. 0은 담지
  // 않는다(없는 키가 0이다).
  ({ currencies, profile, ...save }) => {
    const { exp, ...rest } = profile as { exp: Big };
    const held: [number, Big][] = [[1, (currencies as { gold: Big }).gold], [2, exp]];
    return { ...save, profile: rest, items: Object.fromEntries(held.filter(([, amount]) => Big.sign(amount) !== 0)) };
  },
  // 3 → 4: 장비. 가진 것도 입은 것도 없이 ID 1부터 매긴다.
  save => ({ ...save, equipment: { nextId: 1, owned: {}, equipped: {} } }),
  // 4 → 5: 튜토리얼. 튜토리얼이 생기기 전부터 하던 계정이라 마친 것(null)으로 둔다.
  save => ({ ...save, tutorial: { stepId: null } }),
  // 5 → 6: 웨이브 전투. 몬스터 사망 경계의 체크포인트는 웨이브 사이와 같으므로 영웅 상태를 옮기고 전투원 id는 영웅
  // 다음부터 매긴다. 처치 수는 게임 데이터 없이 웨이브 수로 바꿀 수 없어 0에서 다시 센다(목표의 웨이브 수 이하, 1분
  // 남짓). mode, at, rng, autoBoss는 그대로라 오프라인 보상과 보스 차례가 이어진다.
  ({ battle, ...save }) => {
    const { heroHp, cooldowns, kills: _, ...rest } = battle as { heroHp: unknown; cooldowns: unknown; kills: unknown };
    return { ...save, battle: { ...rest, hero: { hp: heroHp, cooldowns }, waves: 0, nextId: 1 } };
  },
  // 6 → 7: 효과(버프/디버프). 그전 체크포인트의 영웅에는 걸린 효과가 없다.
  ({ battle, ...save }) => {
    const { hero, ...rest } = battle as { hero: Record<string, unknown> };
    return { ...save, battle: { ...rest, hero: { ...hero, effects: [] } } };
  },
  // 7 → 8: 소환수. 그전 체크포인트에는 소환수가 없다.
  ({ battle, ...save }) => ({ ...save, battle: { ...(battle as object), summons: [] } }),
  // 8 → 9: 골드 능력치 강화. 모든 강화가 0단계다.
  save => ({ ...save, statUpgrades: {} }),
  // 9 → 10: 스킬 배우기, 장착, 레벨. 이 버전의 Heroes.skillIds에서 기본 공격 1001을 뺀 1004, 1005, 1011을 1레벨로 배워 그 순서로
  // 장착하므로 전투가 그대로 이어진다(체크포인트의 재사용 대기도 같은 순서다). 그 밖의 스킬은 새 계정처럼 배워야 한다. 능력치
  // 효과의 비율은 이제 걸 때 정해 amount에 담으므로, 체크포인트에 남은 능력치 효과(이 버전에서는 몬스터가 거는 둔화뿐, 길어야
  // 4초)는 amount가 0이라 남은 동안 듣지 않는다.
  save => ({ ...save, skills: { equipped: { 0: 1004, 1: 1005, 2: 1011 }, levels: { 1004: 1, 1005: 1, 1011: 1 } } }),
  // 10 → 11: 장비 강화. 그전에 가진 장비는 모두 +0이다.
  ({ equipment, ...save }) => {
    const { owned, ...rest } = equipment as { owned: Record<string, object> };
    const enhanced = Object.fromEntries(Object.entries(owned).map(([id, instance]) => [id, { ...instance, enhance: 0 }]));
    return { ...save, equipment: { ...rest, owned: enhanced } };
  },
  // 11 → 12: 환생. 그전 계정은 환생한 적이 없다.
  save => ({ ...save, rebirth: { count: 0, points: 0 } }),
  // 12 → 13: 웨이브 도중의 체크포인트. 그전 체크포인트는 경계뿐이라 적, 발사체, 진행 중인 웨이브, 보스 시간, 부활 대기가 없고 아군은
  // 0에 서 있다. 소환수는 모두 영웅(id 0)이 부른 것이다.
  ({ battle, ...save }) => {
    const { hero, summons, ...rest } = battle as { hero: object; summons: object[] };
    return {
      ...save,
      battle: {
        ...rest,
        hero: { ...hero, x: 0 },
        summons: summons.map(summon => ({ ...summon, by: 0, x: 0 })),
        enemies: [],
        projectiles: [],
        wave: null,
        bossTicksLeft: null,
        reviveTicksLeft: null,
      },
    };
  },
  // 13 → 14: 영웅 레벨을 계정(`profile`)에서 영웅 슬라이스(`hero`)로 옮긴다. 값은 그대로다.
  ({ profile, ...save }) => {
    const { level, ...rest } = profile as { level: number };
    return { ...save, profile: rest, hero: { level } };
  },
];

export const SAVE_VERSION = migrations.length + 1;

/**
 * 새 계정의 저장 데이터. 전투는 `now`에서 시작하는 첫 스테이지(`firstStageId`, 환생도 여기서 시작)의 새 사냥이고, 튜토리얼은 첫
 * 스텝부터다. 스킬은 `startSkills`다.
 */
export function createPlayer(loginId: string, data: GameData, now: number): PlayerState {
  const player = {
    profile: { loginId },
    hero: { level: 1 },
    items: {},
    equipment: NO_EQUIPMENT,
    statUpgrades: NO_STAT_UPGRADES,
    skills: startSkills(data),
    stage: { currentId: firstStageId(data), clearedIds: [] },
    rebirth: NO_REBIRTH,
  };
  return { ...player, battle: freshBattle(player, data, now), tutorial: startTutorial(data) };
}

/** 저장소가 저장 데이터로 보관하는 바이트: { version, player }의 MessagePack. */
export function encodeSave(player: PlayerState): Uint8Array {
  return encode({ version: SAVE_VERSION, player });
}

/** 저장된 바이트를 읽어, 쓰인 버전에서 최신으로 올린다. */
export function decodeSave(bytes: Uint8Array): PlayerState {
  const stored = decode(bytes);
  if (typeof stored !== "object" || stored === null) throw new Error("Not a stored save.");
  const { version, player } = stored as Record<string, unknown>;
  if (typeof player !== "object" || player === null) throw new Error("A stored save has no player.");
  return upgrade(player as Record<string, unknown>, version) as unknown as PlayerState;
}

/**
 * `version`부터 최신까지 마이그레이션을 하나씩 실행한다. 이 서버가 모르는 버전은(더 새로운 버전
 * 포함) 추측하지 않고 오류를 던진다. 롤백한 뒤에는 그 버전을 아는 서버가 돌아올 때까지 저장
 * 데이터가 그대로 남는다.
 */
export function upgrade(
  save: Record<string, unknown>, version: unknown, list: readonly Migration[] = migrations,
): Record<string, unknown> {
  if (!Number.isInteger(version) || (version as number) < 1 || (version as number) > list.length + 1) {
    throw new Error(`Save format ${String(version)} is unknown; this server reads 1 to ${list.length + 1}.`);
  }
  return list.slice((version as number) - 1).reduce((upgraded, migrate) => migrate(upgraded), save);
}
