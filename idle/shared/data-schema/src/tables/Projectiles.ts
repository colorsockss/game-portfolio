// sheet-baker가 자동 생성한 파일. 직접 수정하지 마세요.
// sheet-baker가 검증하고 정규화한 데이터를 읽는다. 데이터와 코드는 함께 다시 생성한다.
import { readMessagePack } from './runtime/messagepack.js';

export interface ProjectilesRow {
  // 인덱스 0: 발사체 고유 ID. Skills.projectileId가 가리키고, 64의 연출이 이것으로 모습을 고른다
  "id": number;
  // 인덱스 1: 나는 속도 (월드 단위/초). 비행 틱 = 쏜 순간 첫 대상까지의 거리 ÷ 속도를 0.1초 틱으로 반올림, 최소 1틱
  "speed": number;
  // 인덱스 2: 기획 메모 (선택)
  "note": string | null;
  // 인덱스 3: 날아가는 그림의 클립 이름 (클라이언트 Assets/Battle/Clips/projectiles 묶음의 arrow, orb, blob, rock)
  "clip": string;
  // 인덱스 4: 그림에 입히는 색 [r, g, b] (각 0~1). 색이 있는 그림은 [1,1,1]
  "color": number[];
  // 인덱스 5: 그림 크기의 배율. 비행 시간과 충돌에는 영향 없음
  "size": number;
  // 인덱스 6: 대상 위에서 떨어지는지 (운석). 아니면 쏜 배우에게서 곧게 난다
  "fromAbove": boolean;
}

export async function deserializeProjectilesMessagePack(bytes: Uint8Array | ArrayBuffer): Promise<Map<number, ProjectilesRow>> {
  const result = new Map<number, ProjectilesRow>();
  for (const row of readMessagePack(bytes)) {
    const record: ProjectilesRow = {
      "id": row[0] as number,
      "speed": row[1] as number,
      "note": row[2] as string | null,
      "clip": row[3] as string,
      "color": row[4] as number[],
      "size": row[5] as number,
      "fromAbove": row[6] as boolean,
    };
    result.set(record.id, record);
  }
  return result;
}
