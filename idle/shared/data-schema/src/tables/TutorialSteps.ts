// sheet-baker가 자동 생성한 파일. 직접 수정하지 마세요.
// sheet-baker가 검증하고 정규화한 데이터를 읽는다. 데이터와 코드는 함께 다시 생성한다.
import type { EquipSlot } from './Enums.js';
import type { StringsId } from './Strings.js';
import { readMessagePack } from './runtime/messagepack.js';

export interface TutorialStepsRow {
  // 인덱스 0: 스텝 ID. 작은 것부터 차례로 진행하고, 저장 데이터는 지금 스텝의 ID를 가진다
  "id": number;
  // 인덱스 1: 대사의 키 (Strings)
  "textKey": StringsId;
  // 인덱스 2: 하이라이트할 UI: 화면 이름(Views의 키).ViewRefs 항목 이름(예: main.equipmentButton). 대상 밖의 탭을 막는다. 빈 칸이면 대사만 보인다
  "target": string | null;
  // 인덱스 3: 이 스테이지를 클리어하면 넘어간다. 조건 열(unlockStageId, unlockLevel, equipSlot)은 적은 것을 모두 채워야 넘어가고, 셋 다 비면 누르면(대상, 없으면 화면 어디든) 넘어간다
  "unlockStageId": number | null;
  // 인덱스 4: 영웅 레벨이 이 이상이면 넘어간다
  "unlockLevel": number | null;
  // 인덱스 5: 이 슬롯에 장비를 입으면 넘어간다
  "equipSlot": EquipSlot | null;
  // 인덱스 6: 대상의 화면이 열려 있지 않을 때 대신 하이라이트할 UI(그 화면을 여는 버튼, 예: main.equipmentButton). 재시작으로 대상의 팝업이 닫힌 채 조건 스텝에 돌아왔을 때 길을 알려 준다. 빈 칸이면 대상의 화면이 열릴 때까지 대사만 보인다
  "opener": string | null;
}

export async function deserializeTutorialStepsMessagePack(bytes: Uint8Array | ArrayBuffer): Promise<Map<number, TutorialStepsRow>> {
  const result = new Map<number, TutorialStepsRow>();
  for (const row of readMessagePack(bytes)) {
    const record: TutorialStepsRow = {
      "id": row[0] as number,
      "textKey": row[1] as StringsId,
      "target": row[2] as string | null,
      "unlockStageId": row[3] as number | null,
      "unlockLevel": row[4] as number | null,
      "equipSlot": row[5] as EquipSlot | null,
      "opener": row[6] as string | null,
    };
    result.set(record.id, record);
  }
  return result;
}
