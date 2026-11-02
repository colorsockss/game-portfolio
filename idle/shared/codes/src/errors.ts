/**
 * 서버가 형식이 올바른 요청을 거절한 이유: 게임 규칙, 또는 더는 유효하지 않은 세션. 값은 명시적으로
 * 정하며, 배포된 값은 번호를 바꾸거나 재사용하지 않는다. 범위는 Opcode의 묶음을 따른다.
 */
export enum GameErrorCode {
  // 1-99: 요청, 세션, 계정
  InvalidCommand = 1,
  UnknownCommand = 2,
  /** 세션의 토큰이 만료되었다. */
  SessionExpired = 10,
  /** 토큰이 더는 계정의 세션이 아니다: 그 뒤에 계정이 다른 곳에서 로그인했다. */
  SessionReplaced = 11,
  // 100-199: 스테이지
  StageNotFound = 100,
  /** 스테이지의 해금 조건(선행 클리어, 영웅 레벨)을 채우지 못했다. */
  StageLocked = 101,
  // 200-299: 성장
  /** 가진 장비가 아니다. */
  EquipmentNotFound = 200,
  /** 장비가 이미 그 아이템의 최대 강화 단계(Items.enhanceMax)다. */
  EquipmentMaxEnhance = 201,
  /** 다음 등급(Items.mergeItemId)이 없는 장비라 합성할 수 없다. */
  EquipmentNotMergeable = 202,
  /** 합성에 쓸 같은 장비가 Items.mergeCount보다 적다. */
  MergeMaterialsShort = 203,
  // 300-399: 골드 강화
  /** StatUpgrades에 없는 강화다. */
  StatUpgradeNotFound = 300,
  /** 강화가 이미 최대 단계(StatUpgrades.maxStep)다. */
  StatUpgradeMaxed = 301,
  /** 확정한 골드가 비용(골드 강화의 다음 단계, 장비 강화)보다 적다. */
  NotEnoughGold = 302,
  // 400-499: 스킬
  /** 영웅이 장착할 수 있는 스킬이 아니다(기본 공격, 다른 영웅이나 몬스터의 스킬, 없는 스킬). */
  SkillNotFound = 400,
  /** 아직 배우지 않은 스킬이라 장착하거나 레벨을 올릴 수 없다. */
  SkillNotLearned = 401,
  /** 없는 스킬 슬롯이다. */
  SkillSlotInvalid = 402,
  /** 스킬이 이미 최대 레벨(Skills.maxLevel)이다. */
  SkillMaxLevel = 403,
  /** 배우거나 레벨을 올리는 비용(Skills.costItemId 아이템)이 모자라다. */
  SkillCostShort = 404,
  // 500-599: 튜토리얼
  /** 지금 튜토리얼 스텝이 아니다: 건너뛰거나 지난 스텝을 다시 보냈다. */
  TutorialStepNotCurrent = 500,
  /** 스텝의 조건(선행 클리어, 영웅 레벨, 장비 착용)을 채우지 못했다. */
  TutorialStepUnmet = 501,
  // 600-699: 환생
  /** 확정한 레벨에서 환생하면 받을 포인트(공식 rebirthPoints)가 없다: 환생할 레벨에 닿지 않았다. */
  RebirthNotReady = 600,
  // 900-999: 치트
  /** 개발 모드가 아닌 서버는 치트를 받지 않는다. */
  CheatDisabled = 900,
}
