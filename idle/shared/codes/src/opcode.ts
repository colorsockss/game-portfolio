/**
 * 시스템 API와 게임 커맨드를 가리지 않고 모든 패킷의 번호. 값은 명시적으로 정하며, 배포된 값은
 * 번호를 바꾸거나 재사용하지 않는다. 범위는 관련된 패킷을 묶을 뿐이다.
 */
export enum Opcode {
  // 1-99: 세션과 계정
  AuthLogin = 1,
  AuthResume = 2,
  Ping = 3,
  StateFetch = 4,
  // 100-199: 스테이지와 전투
  StageSelect = 100,
  BattleSettle = 101,
  BossChallenge = 102,
  // 200-299: 성장
  ItemEquip = 200,
  ItemUnequip = 201,
  ItemEnhance = 202,
  ItemMerge = 203,
  ItemMergeAll = 204,
  // 300-399: 골드 강화
  StatUpgrade = 300,
  // 400-499: 스킬
  SkillLearn = 400,
  SkillEquip = 401,
  SkillUnequip = 402,
  SkillLevelUp = 403,
  // 500-599: 튜토리얼
  TutorialAdvance = 500,
  // 600-699: 환생
  Rebirth = 600,
  // 900-999: 치트(개발용). 개발 모드의 서버만 받는다.
  CheatItemGrant = 900,
  CheatLevelSet = 901,
  CheatStageUnlock = 902,
  CheatTimeShift = 903,
}
