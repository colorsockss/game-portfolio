// sheet-baker가 자동 생성한 파일. 직접 수정하지 마세요.
// sheet-baker가 검증하고 정규화한 데이터를 읽는다. 데이터와 코드는 함께 다시 생성한다.
import type { StringsId } from './Strings.js';
import { readMessagePack } from './runtime/messagepack.js';

export interface HeroesRow {
  // 인덱스 0: 영웅 고유 ID
  "id": number;
  // 인덱스 1: 영웅 표시 이름의 키 (Strings)
  "nameKey": StringsId;
  // 인덱스 2: 공격 간격 (초). 전투에서는 0.1초 틱 단위로 반올림
  "attackIntervalSeconds": number;
  // 인덱스 3: 치명타 확률
  "critChance": number;
  // 인덱스 4: 치명타 피해 배율
  "critMultiplier": number;
  // 인덱스 5: 쓸 수 있는 스킬 ID 목록. 재사용 대기 0인 첫 스킬이 기본 공격이라 늘 쓰고, 나머지는 슬롯(skillSlots)에 장착한 것만 쓴다. 새 계정은 나머지를 앞에서부터 슬롯 수만큼 장착한다
  "skillIds": number[];
  // 인덱스 6: 스킬 슬롯 수(기본 공격은 슬롯 밖이다). 슬롯 순서가 전투에서 준비된 스킬을 고르는 순서다
  "skillSlots": number;
  // 인덱스 7: 이동 속도 (월드 단위/초). 사거리 밖의 적에게 다가갈 때 쓴다
  "moveSpeed": number;
  // 인덱스 8: 배우 그림의 클립 묶음 이름 (클라이언트 Assets/Battle/Clips의 에셋, 그림이 있으면 Assets/Battle/Actors의 폴더)
  "clips": string;
  // 인덱스 9: 배우 몸 높이의 배율. 전투 능력치에는 영향 없음
  "size": number;
}

export async function deserializeHeroesMessagePack(bytes: Uint8Array | ArrayBuffer): Promise<Map<number, HeroesRow>> {
  const result = new Map<number, HeroesRow>();
  for (const row of readMessagePack(bytes)) {
    const record: HeroesRow = {
      "id": row[0] as number,
      "nameKey": row[1] as StringsId,
      "attackIntervalSeconds": row[2] as number,
      "critChance": row[3] as number,
      "critMultiplier": row[4] as number,
      "skillIds": row[5] as number[],
      "skillSlots": row[6] as number,
      "moveSpeed": row[7] as number,
      "clips": row[8] as string,
      "size": row[9] as number,
    };
    result.set(record.id, record);
  }
  return result;
}
