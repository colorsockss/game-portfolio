import type { BattleState } from "./battle/state.js";
import type { EquipmentState } from "./equipment.js";
import type { ItemAmounts } from "./items.js";
import type { RebirthState } from "./rebirth.js";
import type { StatUpgradeState } from "./stat-upgrade.js";
import type { SkillsState } from "./skills.js";
import type { TutorialState } from "./tutorial.js";

/**
 * 플레이어의 저장 데이터 전체를 직렬화 가능한 객체 하나로 나타낸다. 최상위 키 하나가 슬라이스다.
 * 커맨드는 건드리는 슬라이스만 바꾸고 나머지는 참조로 그대로 두므로, 서버는 바뀐 슬라이스만 보내고
 * 클라이언트 셀렉터는 참조로 비교할 수 있다.
 *
 * 이 모양을 바꾸려면 클라이언트를 위해 PROTOCOL_VERSION을 올리고, 서버에 이미 저장된 데이터를 위해
 * 저장 데이터 마이그레이션을 해야 한다.
 */
export interface PlayerState {
  /** 계정. 계정이 무엇을 이루었는지(계정 레벨 같은 것)가 생기면 여기에 둔다. */
  readonly profile: ProfileState;
  /** 영웅의 성장(레벨). 싸우는 중의 HP, 재사용 대기, 효과는 전투 체크포인트(`battle.hero`)에 있다. */
  readonly hero: HeroState;
  /** 아이템(Items.id)별 보유량. 골드와 경험치도 여기 있다. */
  readonly items: ItemAmounts;
  /** 가진 장비(아이템 종류가 장비인 것은 `items`에 없고 여기에 하나씩 있다)와 착용. */
  readonly equipment: EquipmentState;
  /** 골드 능력치 강화(StatUpgrades.id)별 단계(stat-upgrade.ts). */
  readonly statUpgrades: StatUpgradeState;
  /** 장착한 스킬과 스킬 레벨(skills.ts). */
  readonly skills: SkillsState;
  readonly stage: StageState;
  /** 마지막으로 확정한 전투 체크포인트. 현재 스테이지는 `stage.currentId`다. */
  readonly battle: BattleState;
  /** 튜토리얼의 지금 스텝(tutorial.ts). */
  readonly tutorial: TutorialState;
  /** 환생 횟수와 쌓은 포인트(rebirth.ts). */
  readonly rebirth: RebirthState;
}

export interface ProfileState {
  readonly loginId: string;
}

export interface HeroState {
  /** 영웅 레벨(HeroLevels.level). 경험치는 보유량의 Constants.expItemId 아이템이고, 차면 전투가 경계에서 올린다(level.ts). */
  readonly level: number;
}

export interface StageState {
  readonly currentId: number;
  readonly clearedIds: readonly number[];
}
