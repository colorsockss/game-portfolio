// sheet-baker가 자동 생성한 파일. 직접 수정하지 마세요.
// sheet-baker가 검증하고 정규화한 데이터를 읽는다. 데이터와 코드는 함께 다시 생성한다.
import { Big } from '@idle/big-number';
import type { SoundsId } from './Sounds.js';
import type { StringsId } from './Strings.js';
import { readMessagePack } from './runtime/messagepack.js';

export interface StagesRow {
  // 인덱스 0: 스테이지 고유 ID
  "id": number;
  // 인덱스 1: 스테이지 표시 이름의 키 (Strings)
  "nameKey": StringsId;
  // 인덱스 2: 권장 플레이어 레벨
  "recommendedLevel": number;
  // 인덱스 3: 일반 몬스터 종류. 하나 이상
  "monsterIds": number[];
  // 인덱스 4: 별도로 출현하는 보스 ID. 없으면 빈 셀
  "bossId": number | null;
  // 인덱스 5: 입장 시 소모 에너지
  "energyCost": number;
  // 인덱스 6: 클리어 보상 아이템. 처치 보상과 별개
  "clearItemIds": number[];
  // 인덱스 7: 클리어 보상 수량. clearItemIds와 같은 순서
  "clearAmounts": Big[];
  // 인덱스 8: 선행 클리어 스테이지. 없으면 빈 셀
  "unlockStageId": number | null;
  // 인덱스 9: 제한 시간 (초). 0이면 제한 없음
  "timeLimitSeconds": number;
  // 인덱스 10: 클리어 후 재입장 가능 여부
  "repeatable": boolean;
  // 인덱스 11: 진행 설명 (선택)
  "note": string | null;
  // 인덱스 12: 보스 도전까지 깰 사냥 웨이브 수. 보스가 없으면 클리어까지의 웨이브 수
  "waveCount": number;
  // 인덱스 13: 해금에 필요한 영웅 레벨. 없으면 빈 셀
  "unlockLevel": number | null;
  // 인덱스 14: 사냥 웨이브 하나의 몬스터 수. 종류는 monsterIds에서 난수로 고른다
  "waveSize": number;
  // 인덱스 15: 웨이브 안에서 몬스터가 차례로 나오는 간격 (초). 0.1초 틱으로 반올림하고 최소 1틱
  "spawnIntervalSeconds": number;
  // 인덱스 16: 전투 월드의 배경 그림 이름. 배경 프리팹(Battle/Stage)이 이 이름의 그림을 고르고, 없으면 첫 그림을 쓴다
  "background": string;
  // 인덱스 17: 이 스테이지를 보는 동안 메인 화면에서 트는 BGM (Sounds, bgm 채널)
  "bgm": SoundsId;
}

export async function deserializeStagesMessagePack(bytes: Uint8Array | ArrayBuffer): Promise<Map<number, StagesRow>> {
  const result = new Map<number, StagesRow>();
  for (const row of readMessagePack(bytes)) {
    const record: StagesRow = {
      "id": row[0] as number,
      "nameKey": row[1] as StringsId,
      "recommendedLevel": row[2] as number,
      "monsterIds": row[3] as number[],
      "bossId": row[4] as number | null,
      "energyCost": row[5] as number,
      "clearItemIds": row[6] as number[],
      "clearAmounts": (row[7] as string[]).map((text) => Big.parse(text)),
      "unlockStageId": row[8] as number | null,
      "timeLimitSeconds": row[9] as number,
      "repeatable": row[10] as boolean,
      "note": row[11] as string | null,
      "waveCount": row[12] as number,
      "unlockLevel": row[13] as number | null,
      "waveSize": row[14] as number,
      "spawnIntervalSeconds": row[15] as number,
      "background": row[16] as string,
      "bgm": row[17] as SoundsId,
    };
    result.set(record.id, record);
  }
  return result;
}
