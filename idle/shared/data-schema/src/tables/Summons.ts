// sheet-baker가 자동 생성한 파일. 직접 수정하지 마세요.
// sheet-baker가 검증하고 정규화한 데이터를 읽는다. 데이터와 코드는 함께 다시 생성한다.
import { readMessagePack } from './runtime/messagepack.js';

export interface SummonsRow {
  // 인덱스 0: 소환수 고유 ID. Skills.summonId가 가리키고, 64의 연출이 이것으로 모습을 고른다
  "id": number;
  // 인덱스 1: 최대 HP 배율. 최대 HP = floor(공식 summonMaxHp) = floor(소환자의 효과 전 최대 HP × 이 값)
  "maxHpRate": number;
  // 인덱스 2: 공격력 배율. 공격력 = floor(공식 summonAttack) = floor(소환자의 효과 전 공격력 × 이 값)
  "attackRate": number;
  // 인덱스 3: 방어력 배율. 방어력 = floor(공식 summonDefense) = floor(소환자의 효과 전 방어력 × 이 값)
  "defenseRate": number;
  // 인덱스 4: 공격 간격 (초). 전투에서는 0.1초 틱 단위로 반올림
  "attackIntervalSeconds": number;
  // 인덱스 5: 사용 스킬 ID 목록. 소환 스킬(summonId)은 쓰지 않는다
  "skillIds": number[];
  // 인덱스 6: 지속 시간 (초). 0.1초 틱으로 반올림. 다하면 만료한다
  "durationSeconds": number;
  // 인덱스 7: 한 소환자가 함께 둘 수 있는 수. 꽉 찬 채 부르면 가장 먼저 부른 것이 만료하고 새 것이 나온다
  "maxCount": number;
  // 인덱스 8: 기획 메모 (선택)
  "note": string | null;
  // 인덱스 9: 이동 속도 (월드 단위/초). 사거리 밖의 적에게 다가갈 때 쓴다
  "moveSpeed": number;
  // 인덱스 10: 배우 그림의 클립 묶음 이름 (클라이언트 Assets/Battle/Clips의 에셋, 그림이 있으면 Assets/Battle/Actors의 폴더). 영웅 편과 적 편이 같은 모습이다
  "clips": string;
  // 인덱스 11: 배우 몸 높이의 배율. 전투 능력치에는 영향 없음
  "size": number;
}

export async function deserializeSummonsMessagePack(bytes: Uint8Array | ArrayBuffer): Promise<Map<number, SummonsRow>> {
  const result = new Map<number, SummonsRow>();
  for (const row of readMessagePack(bytes)) {
    const record: SummonsRow = {
      "id": row[0] as number,
      "maxHpRate": row[1] as number,
      "attackRate": row[2] as number,
      "defenseRate": row[3] as number,
      "attackIntervalSeconds": row[4] as number,
      "skillIds": row[5] as number[],
      "durationSeconds": row[6] as number,
      "maxCount": row[7] as number,
      "note": row[8] as string | null,
      "moveSpeed": row[9] as number,
      "clips": row[10] as string,
      "size": row[11] as number,
    };
    result.set(record.id, record);
  }
  return result;
}
