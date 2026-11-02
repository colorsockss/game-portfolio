// sheet-baker가 자동 생성한 파일. 직접 수정하지 마세요.
// sheet-baker가 검증하고 정규화한 데이터를 읽는다. 데이터와 코드는 함께 다시 생성한다.
import { Big } from '@idle/big-number';
import type { Stat } from './Enums.js';
import type { StringsId } from './Strings.js';
import { readMessagePack } from './runtime/messagepack.js';

export interface StatUpgradesRow {
  // 인덱스 0: 강화 고유 ID. 저장 데이터의 강화 단계(statUpgrades)가 이 ID를 키로 쓰고, 화면은 이 순서로 보인다
  "id": number;
  // 인덱스 1: 강화 화면에 보이는 이름의 키 (Strings)
  "nameKey": StringsId;
  // 인덱스 2: 올리는 능력치. 공격 간격은 비율만 쓰므로 고르지 않는다
  "stat": Stat;
  // 인덱스 3: 단계마다 더하는 고정 가산. 단계 n이면 amount × n을 장비처럼 더한다. 치명 확률은 확률 그대로(0.005 = +0.5%p)
  "amount": Big;
  // 인덱스 4: 최대 단계. 다음 단계의 골드 비용은 공식 upgradeCost(입력 step = 지금 단계)
  "maxStep": number;
  // 인덱스 5: 기획 메모 (선택)
  "note": string | null;
}

export async function deserializeStatUpgradesMessagePack(bytes: Uint8Array | ArrayBuffer): Promise<Map<number, StatUpgradesRow>> {
  const result = new Map<number, StatUpgradesRow>();
  for (const row of readMessagePack(bytes)) {
    const record: StatUpgradesRow = {
      "id": row[0] as number,
      "nameKey": row[1] as StringsId,
      "stat": row[2] as Stat,
      "amount": Big.parse(row[3] as string),
      "maxStep": row[4] as number,
      "note": row[5] as string | null,
    };
    result.set(record.id, record);
  }
  return result;
}
