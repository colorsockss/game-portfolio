// sheet-baker가 자동 생성한 파일. 직접 수정하지 마세요.
// sheet-baker가 검증하고 정규화한 데이터를 읽는다. 데이터와 코드는 함께 다시 생성한다.
import type { EffectKind, Stat } from './Enums.js';
import { readMessagePack } from './runtime/messagepack.js';

export interface EffectsRow {
  // 인덱스 0: 효과 고유 ID. Skills.effectIds가 가리킨다
  "id": number;
  // 인덱스 1: 종류 (Enums의 EffectKind)
  "kind": EffectKind;
  // 인덱스 2: 지속 시간 (초). 0.1초 틱으로 반올림. 0이면 걸리는 순간 한 번 듣고 남지 않는다
  "durationSeconds": number;
  // 인덱스 3: 한 대상에 함께 있을 수 있는 겹 수. 겹마다 따로 끝나고, 꽉 차면 가장 먼저 끝날 겹을 새 겹으로 바꾼다(1이면 갱신)
  "maxStacks": number;
  // 인덱스 4: 바꾸는 능력치 (Enums의 Stat)
  "stat": Stat | null;
  // 인덱스 5: 지속 피해·회복이 도는 간격 (초). 0.1초 틱으로 반올림
  "tickSeconds": number | null;
  // 인덱스 6: 세기. 능력치는 겹마다의 비율(0.3 = +30%), 피해·회복은 틱마다, 보호막은 흡수량으로 시전자 공격력 × 세기
  "power": number | null;
  // 인덱스 7: 정화가 풀고 지속 동안 막는 효과
  "effectIds": number[] | null;
  // 인덱스 8: 기획 메모 (선택)
  "note": string | null;
}

export async function deserializeEffectsMessagePack(bytes: Uint8Array | ArrayBuffer): Promise<Map<number, EffectsRow>> {
  const result = new Map<number, EffectsRow>();
  for (const row of readMessagePack(bytes)) {
    const record: EffectsRow = {
      "id": row[0] as number,
      "kind": row[1] as EffectKind,
      "durationSeconds": row[2] as number,
      "maxStacks": row[3] as number,
      "stat": row[4] as Stat | null,
      "tickSeconds": row[5] as number | null,
      "power": row[6] as number | null,
      "effectIds": row[7] as number[] | null,
      "note": row[8] as string | null,
    };
    result.set(record.id, record);
  }
  return result;
}
