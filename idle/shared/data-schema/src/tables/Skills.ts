// sheet-baker가 자동 생성한 파일. 직접 수정하지 마세요.
// sheet-baker가 검증하고 정규화한 데이터를 읽는다. 데이터와 코드는 함께 다시 생성한다.
import { Big } from '@idle/big-number';
import type { SkillCondition, SkillElement, SkillTarget, TargetRule } from './Enums.js';
import type { SoundsId } from './Sounds.js';
import type { StringsId } from './Strings.js';
import { readMessagePack } from './runtime/messagepack.js';

export interface SkillsRow {
  // 인덱스 0: 스킬 고유 ID
  "id": number;
  // 인덱스 1: 스킬 표시 이름의 키 (Strings)
  "nameKey": StringsId;
  // 인덱스 2: 속성 (Enums의 SkillElement)
  "element": SkillElement;
  // 인덱스 3: 대상 (Enums의 SkillTarget)
  "target": SkillTarget;
  // 인덱스 4: 적에게 주는 공격력 대비 피해 배율. 0이면 피해 없이 효과만. 아군·자신 스킬은 빈 칸(회복은 효과가 정함)
  "powerMultiplier": number | null;
  // 인덱스 5: 재사용 대기 시간 (초)
  "cooldownSeconds": number;
  // 인덱스 7: 동시에 적용할 최대 대상 수. radius가 있으면 첫 대상 둘레의 반경 안에서 센다
  "maxTargets": number;
  // 인덱스 8: 거는 효과 (Effects). 적 스킬은 피해 뒤 살아남은 대상에, 아군·자신 스킬은 고른 대상에 건다
  "effectIds": number[];
  // 인덱스 9: 스킬 설명 (선택)
  "note": string | null;
  // 인덱스 10: 대상을 고르는 규칙 (Enums의 TargetRule). 사거리 안의 대상에서 고른다
  "targetRule": TargetRule;
  // 인덱스 11: 쏘는 발사체 (Projectiles). 비우면 쓰는 틱에 맞고, 있으면 날아가 착탄 틱에 피해와 효과를 준다. 적 스킬만
  "projectileId": number | null;
  // 인덱스 12: 부르는 소환수 (Summons). 자신 대상 스킬만. 쓰는 틱에 소환자 진영의 끝에 나와 다음 틱부터 싸운다
  "summonId": number | null;
  // 인덱스 13: 레벨 상한. 1이면 레벨을 올리지 않는다. 레벨은 영웅이 장착하는 스킬(Heroes.skillIds)만 가지고, 몬스터와 소환수의 스킬은 늘 1레벨이다
  "maxLevel": number;
  // 인덱스 14: 배우기(learnCost)와 레벨업(공식 skillLevelCost) 비용을 내는 아이템(골드나 재료). 영웅이 장착할 수 있는 스킬은 채운다
  "costItemId": number | null;
  // 인덱스 15: 배우는 비용(costItemId 아이템). 영웅이 장착할 수 있는 스킬은 채운다. 새 계정이 처음 장착하는 스킬은 배운 채로 시작한다
  "learnCost": Big | null;
  // 인덱스 16: 속성의 효과음 (Sounds, sfx 채널). 맞으면(발사체는 떨어지면) 내고 치명타는 늘 Constants의 critSfx다. 맞는 대상이 없고 발사체도 없는 스킬(버프·회복·소환)은 쓸 때 낸다. 비우면 맞을 때 hitSfx이고 쓸 때는 소리가 없다
  "sfx": SoundsId | null;
  // 인덱스 17: 사거리 (월드 단위). 적·아군 스킬은 대상이 이 거리 안에 있어야 쓰고, 전투원은 기본 공격의 사거리까지 다가간다. 자신 스킬은 crowd 조건이 적을 세는 거리
  "range": number;
  // 인덱스 18: 범위 반경 (월드 단위). 0이면 targetRule로 maxTargets까지 고르고, 0보다 크면 첫 대상과 그 둘레 이 거리 안의 대상을 가까운 순서로 maxTargets까지 맞힌다
  "radius": number;
  // 인덱스 19: 쓰는 조건 (Enums의 SkillCondition). 맞지 않으면 다음 스킬, 그다음 기본 공격을 본다
  "condition": SkillCondition;
  // 인덱스 20: 조건의 값. hurt는 HP 비율(0.7 = 70% 이하), crowd는 적의 수
  "conditionValue": number | null;
}

export async function deserializeSkillsMessagePack(bytes: Uint8Array | ArrayBuffer): Promise<Map<number, SkillsRow>> {
  const result = new Map<number, SkillsRow>();
  for (const row of readMessagePack(bytes)) {
    const record: SkillsRow = {
      "id": row[0] as number,
      "nameKey": row[1] as StringsId,
      "element": row[2] as SkillElement,
      "target": row[3] as SkillTarget,
      "powerMultiplier": row[4] as number | null,
      "cooldownSeconds": row[5] as number,
      "maxTargets": row[7] as number,
      "effectIds": row[8] as number[],
      "note": row[9] as string | null,
      "targetRule": row[10] as TargetRule,
      "projectileId": row[11] as number | null,
      "summonId": row[12] as number | null,
      "maxLevel": row[13] as number,
      "costItemId": row[14] as number | null,
      "learnCost": row[15] === null ? null : Big.parse(row[15] as string),
      "sfx": row[16] as SoundsId | null,
      "range": row[17] as number,
      "radius": row[18] as number,
      "condition": row[19] as SkillCondition,
      "conditionValue": row[20] as number | null,
    };
    result.set(record.id, record);
  }
  return result;
}
