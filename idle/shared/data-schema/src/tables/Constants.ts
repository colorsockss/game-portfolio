// sheet-baker가 자동 생성한 파일. 직접 수정하지 마세요.
// sheet-baker가 검증하고 정규화한 데이터를 읽는다. 데이터와 코드는 함께 다시 생성한다.
import type { SoundsId } from './Sounds.js';
import { readMessagePack } from './runtime/messagepack.js';

export interface ConstantsRow {
  // 인덱스 0: 플레이어가 쓰는 영웅
  "heroId": number;
  // 인덱스 1: 경험치인 아이템. 레벨업이 이 수량을 쓰고, 재화 바에는 보이지 않는다
  "expItemId": number;
  // 인덱스 2: 오프라인 보상이 인정하는 가장 긴 공백 (시간)
  "offlineCapHours": number;
  // 인덱스 3: 가방에 둘 수 있는 장비 수(착용한 것 포함). 넘친 보상은 버린다
  "equipmentCap": number;
  // 인덱스 5: 영웅이 쓰러진 뒤 되살아나기까지 (초). 0.1초 틱으로 반올림하고 최소 1틱
  "reviveSeconds": number;
  // 인덱스 7: 공격이 맞을 때
  "hitSfx": SoundsId;
  // 인덱스 8: 치명타가 맞을 때
  "critSfx": SoundsId;
  // 인덱스 9: 몬스터를 처치할 때
  "killSfx": SoundsId;
  // 인덱스 10: 보스가 나타날 때
  "bossSfx": SoundsId;
  // 인덱스 11: 스테이지를 클리어할 때
  "clearSfx": SoundsId;
  // 인덱스 12: 레벨이 오를 때
  "levelUpSfx": SoundsId;
  // 인덱스 13: 버튼·탭·목록의 칸·토글을 누를 때
  "clickSfx": SoundsId;
  // 인덱스 15: 골드인 아이템. 강화 비용을 이 수량에서 낸다
  "goldItemId": number;
  // 인덱스 18: 기본 공격 스킬(재사용 대기 0)이 없는 전투원의 기본 공격 사거리 (월드 단위)
  "meleeRange": number;
  // 인덱스 19: 몬스터가 나오는 자리: 영웅 앞(오른쪽)으로 이만큼 (월드 단위). 화면 밖이어야 하고, 나온 몬스터는 영웅 쪽으로 걸어온다
  "spawnDistance": number;
}

export async function deserializeConstantsMessagePack(bytes: Uint8Array | ArrayBuffer): Promise<ConstantsRow> {
  const [row] = readMessagePack(bytes);
  const record: ConstantsRow = {
    "heroId": row[0] as number,
    "expItemId": row[1] as number,
    "offlineCapHours": row[2] as number,
    "equipmentCap": row[3] as number,
    "reviveSeconds": row[5] as number,
    "hitSfx": row[7] as SoundsId,
    "critSfx": row[8] as SoundsId,
    "killSfx": row[9] as SoundsId,
    "bossSfx": row[10] as SoundsId,
    "clearSfx": row[11] as SoundsId,
    "levelUpSfx": row[12] as SoundsId,
    "clickSfx": row[13] as SoundsId,
    "goldItemId": row[15] as number,
    "meleeRange": row[18] as number,
    "spawnDistance": row[19] as number,
  };
  return record;
}
