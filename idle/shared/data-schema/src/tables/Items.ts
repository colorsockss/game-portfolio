// sheet-baker가 자동 생성한 파일. 직접 수정하지 마세요.
// sheet-baker가 검증하고 정규화한 데이터를 읽는다. 데이터와 코드는 함께 다시 생성한다.
import { Big } from '@idle/big-number';
import type { EquipSlot, ItemKind } from './Enums.js';
import type { StringsId } from './Strings.js';
import { readMessagePack } from './runtime/messagepack.js';

export interface ItemsRow {
  // 인덱스 0: 아이템 ID
  "id": number;
  // 인덱스 1: 표시 이름의 키 (Strings)
  "nameKey": StringsId;
  // 인덱스 2: 보유 상한. 빈 셀이면 상한 없음. 넘친 보상은 버린다. 장비는 인스턴스 수
  "cap": Big | null;
  // 인덱스 3: 설명 (선택)
  "note": string | null;
  // 인덱스 4: 종류 (Enums의 ItemKind). 가방 탭
  "kind": ItemKind;
  // 인덱스 5: 장비 슬롯 (Enums의 EquipSlot). 장비만 적고, 장비는 꼭 적는다
  "slot": EquipSlot | null;
  // 인덱스 6: 착용하면 더하는 공격력. 장비만 적고, 빈 셀이면 0
  "attack": Big | null;
  // 인덱스 7: 착용하면 더하는 방어력. 장비만 적고, 빈 셀이면 0
  "defense": Big | null;
  // 인덱스 8: 착용하면 더하는 최대 HP. 장비만 적고, 빈 셀이면 0
  "maxHp": Big | null;
  // 인덱스 9: 강화 최대 단계. 0이면 강화할 수 없다
  "enhanceMax": number | null;
  // 인덱스 10: 합성하면 되는 다음 등급 장비. 같은 슬롯의 장비여야 한다. 빈 셀이면 합성할 수 없다
  "mergeItemId": number | null;
  // 인덱스 11: 합성에 쓰는 같은 장비 수(고른 것 포함). 합성 결과는 보상이 아니라서 상한(cap)을 보지 않는다
  "mergeCount": number | null;
  // 인덱스 12: 가방 칸, 장비 줄, 재화 칸의 아이콘 그림 이름(클라이언트 Assets/UI/Sprites/Icons의 파일 이름). 장비 그림이 생기기 전에는 슬롯 그림(slot_weapon 등)
  "icon": string;
}

export async function deserializeItemsMessagePack(bytes: Uint8Array | ArrayBuffer): Promise<Map<number, ItemsRow>> {
  const result = new Map<number, ItemsRow>();
  for (const row of readMessagePack(bytes)) {
    const record: ItemsRow = {
      "id": row[0] as number,
      "nameKey": row[1] as StringsId,
      "cap": row[2] === null ? null : Big.parse(row[2] as string),
      "note": row[3] as string | null,
      "kind": row[4] as ItemKind,
      "slot": row[5] as EquipSlot | null,
      "attack": row[6] === null ? null : Big.parse(row[6] as string),
      "defense": row[7] === null ? null : Big.parse(row[7] as string),
      "maxHp": row[8] === null ? null : Big.parse(row[8] as string),
      "enhanceMax": row[9] as number | null,
      "mergeItemId": row[10] as number | null,
      "mergeCount": row[11] as number | null,
      "icon": row[12] as string,
    };
    result.set(record.id, record);
  }
  return result;
}
