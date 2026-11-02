// sheet-baker가 자동 생성한 파일. 직접 수정하지 마세요.
// sheet-baker가 검증하고 정규화한 데이터를 읽는다. 데이터와 코드는 함께 다시 생성한다.
import { Big } from '@idle/big-number';
import { readMessagePack } from './runtime/messagepack.js';

export interface HeroLevelsRow {
  // 인덱스 0: 영웅 레벨 (1부터)
  "id": number;
  // 인덱스 1: 이 레벨의 기본 최대 체력
  "maxHp": Big;
  // 인덱스 2: 이 레벨의 기본 공격력
  "attack": Big;
  // 인덱스 3: 이 레벨의 기본 방어력
  "defense": Big;
  // 인덱스 4: 이 레벨에서 다음 레벨로 오르는 데 쓰는 경험치(Constants의 expItemId). 빈 셀이면 최대 레벨
  "expToNext": Big | null;
}

export async function deserializeHeroLevelsMessagePack(bytes: Uint8Array | ArrayBuffer): Promise<Map<number, HeroLevelsRow>> {
  const result = new Map<number, HeroLevelsRow>();
  for (const row of readMessagePack(bytes)) {
    const record: HeroLevelsRow = {
      "id": row[0] as number,
      "maxHp": Big.parse(row[1] as string),
      "attack": Big.parse(row[2] as string),
      "defense": Big.parse(row[3] as string),
      "expToNext": row[4] === null ? null : Big.parse(row[4] as string),
    };
    result.set(record.id, record);
  }
  return result;
}
