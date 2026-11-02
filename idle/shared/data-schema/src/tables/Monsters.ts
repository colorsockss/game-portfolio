// sheet-baker가 자동 생성한 파일. 직접 수정하지 마세요.
// sheet-baker가 검증하고 정규화한 데이터를 읽는다. 데이터와 코드는 함께 다시 생성한다.
import { Big } from '@idle/big-number';
import type { SkillElement } from './Enums.js';
import type { StringsId } from './Strings.js';
import { readMessagePack } from './runtime/messagepack.js';

export interface MonstersRow {
  // 인덱스 0: 몬스터 고유 ID
  "id": number;
  // 인덱스 1: 몬스터 표시 이름의 키 (Strings)
  "nameKey": StringsId;
  // 인덱스 2: 몬스터 레벨
  "level": number;
  // 인덱스 3: 최대 체력
  "maxHp": Big;
  // 인덱스 4: 기본 공격력
  "attack": Big;
  // 인덱스 5: 기본 방어력
  "defense": Big;
  // 인덱스 6: 이동 속도 (월드 단위/초). 기본 공격의 사거리까지 영웅 쪽으로 걸어온다
  "moveSpeed": number;
  // 인덱스 7: 사용 스킬 ID 목록
  "skillIds": number[];
  // 인덱스 8: 처치 보상 아이템. rewardAmounts와 같은 순서
  "rewardItemIds": number[];
  // 인덱스 9: 처치 보상 수량. rewardItemIds와 같은 순서
  "rewardAmounts": Big[];
  // 인덱스 10: 보스 여부
  "isBoss": boolean;
  // 인덱스 11: 특성 설명 (선택)
  "note": string | null;
  // 인덱스 12: 공격 간격 (초). 전투에서는 0.1초 틱 단위로 반올림
  "attackIntervalSeconds": number;
  // 인덱스 13: 몬스터의 속성 (Enums의 SkillElement). 맞는 스킬의 속성과 견주어 피해 배율(공식 elementMultiplier)을 정한다
  "element": SkillElement;
  // 인덱스 14: 배우 그림의 클립 묶음 이름 (클라이언트 Assets/Battle/Actors의 폴더). 비우면 임시 그림(몬스터, 보스)에 색을 입힌다
  "clips": string | null;
  // 인덱스 15: 배우 몸 높이의 배율. 비우면 일반 1, 보스 1.6. 전투 능력치에는 영향 없음
  "size": number | null;
}

export async function deserializeMonstersMessagePack(bytes: Uint8Array | ArrayBuffer): Promise<Map<number, MonstersRow>> {
  const result = new Map<number, MonstersRow>();
  for (const row of readMessagePack(bytes)) {
    const record: MonstersRow = {
      "id": row[0] as number,
      "nameKey": row[1] as StringsId,
      "level": row[2] as number,
      "maxHp": Big.parse(row[3] as string),
      "attack": Big.parse(row[4] as string),
      "defense": Big.parse(row[5] as string),
      "moveSpeed": row[6] as number,
      "skillIds": row[7] as number[],
      "rewardItemIds": row[8] as number[],
      "rewardAmounts": (row[9] as string[]).map((text) => Big.parse(text)),
      "isBoss": row[10] as boolean,
      "note": row[11] as string | null,
      "attackIntervalSeconds": row[12] as number,
      "element": row[13] as SkillElement,
      "clips": row[14] as string | null,
      "size": row[15] as number | null,
    };
    result.set(record.id, record);
  }
  return result;
}
