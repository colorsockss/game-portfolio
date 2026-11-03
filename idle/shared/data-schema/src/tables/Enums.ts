// sheet-baker가 자동 생성한 파일. 직접 수정하지 마세요.
// Enums 테이블에서 만든 TS enum. 이 Enum을 쓰는 열(스키마의 enum)은 변환할 때 값이 멤버인지 검사한다.

export enum ItemKind {
  // 재화. 수량으로 가진다
  Currency = 1,
  // 재료. 수량으로 가진다
  Material = 2,
  // 장비. 수량이 아니라 인스턴스로 가지고, 착용하면 능력치에 더한다
  Equipment = 3,
}

export enum EquipSlot {
  // 무기
  Weapon = 1,
  // 방어구
  Armor = 2,
  // 장신구
  Accessory = 3,
}

export enum Grade {
  // 일반
  Common = 1,
  // 고급
  Uncommon = 2,
  // 희귀
  Rare = 3,
  // 영웅
  Epic = 4,
  // 전설
  Legendary = 5,
}

export enum SoundChannel {
  // 배경 음악. 반복하고 하나만 돈다
  Bgm = "bgm",
  // 효과음. 한 번 나고 겹친다
  Sfx = "sfx",
}

export enum SkillElement {
  // 물리
  Physical = "physical",
  // 독
  Poison = "poison",
  // 불
  Fire = "fire",
  // 얼음
  Ice = "ice",
  // 신성
  Holy = "holy",
}

export enum SkillTarget {
  // 적
  Enemy = "enemy",
  // 아군
  Ally = "ally",
  // 자신
  Self = "self",
}

export enum TargetRule {
  // 앞: 가장 가까운 대상. 같으면 먼저 나온 쪽(아군은 영웅부터)
  Front = "front",
  // 사거리 안에서 남은 HP가 가장 적은 대상. 같으면 가까운 쪽
  Weakest = "weakest",
  // 사거리 안에서 시드 난수로 고른 대상. 한 번 고른 대상은 다시 고르지 않는다
  Random = "random",
}

export enum EffectKind {
  // 능력치 수정: 겹마다 stat을 power 비율만큼(0.3 = +30%)
  Stat = "stat",
  // 지속 피해: tickSeconds마다 시전자 공격력 × power (방어 무시)
  Damage = "damage",
  // 회복: tickSeconds마다 시전자 공격력 × power. 지속 0이면 즉시 한 번
  Heal = "heal",
  // 기절: 행동하지 않고 재사용 대기도 흐르지 않는다
  Stun = "stun",
  // 보호막: 시전자 공격력 × power만큼 공격과 지속 피해를 먼저 흡수한다
  Shield = "shield",
  // 정화: effectIds의 효과를 풀고, 지속 동안 다시 걸리지 않게 막는다
  Cleanse = "cleanse",
}

export enum Stat {
  // 최대 HP
  MaxHp = "maxHp",
  // 공격력
  Attack = "attack",
  // 방어력
  Defense = "defense",
  // 공격 간격. 늘면 느려진다(둔화)
  AttackInterval = "attackInterval",
  // 치명 확률. 더하는 값은 확률(0.005 = +0.5%p)
  CritChance = "critChance",
  // 이동 속도. 줄면 느려진다(둔화)
  MoveSpeed = "moveSpeed",
}

export enum SkillCondition {
  // 사거리 안에 대상이 있으면 쓴다
  Always = "always",
  // HP가 conditionValue 비율 이하인 대상(자신 스킬은 자신)이 사거리 안에 있을 때만 쓰고, 그 대상 중에서 고른다
  Hurt = "hurt",
  // 사거리 안의 적이 conditionValue 이상일 때만 쓴다
  Crowd = "crowd",
}
