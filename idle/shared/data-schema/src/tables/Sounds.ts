// sheet-baker가 자동 생성한 파일. 직접 수정하지 마세요.
// sheet-baker가 검증하고 정규화한 데이터를 읽는다. 데이터와 코드는 함께 다시 생성한다.
import type { SoundChannel } from './Enums.js';
import { readMessagePack } from './runtime/messagepack.js';

// 이 테이블의 id. 키를 쓰는 코드와 이 테이블을 가리키는 열의 타입이라, 없는 키는 타입 검사가 잡는다.
export type SoundsId =
  | "bgm.battle"
  | "bgm.fortress"
  | "bgm.peak"
  | "sfx.hit"
  | "sfx.crit"
  | "sfx.kill"
  | "sfx.boss"
  | "sfx.clear"
  | "sfx.levelUp"
  | "sfx.click"
  | "sfx.fire"
  | "sfx.ice"
  | "sfx.poison"
  | "sfx.holy";

export interface SoundsRow {
  // 인덱스 0: 소리 키. Constants의 소리 상수, Stages.bgm, Skills.sfx가 이 키를 고른다
  "id": SoundsId;
  // 인덱스 1: 볼륨·뮤트 설정의 채널 (Enums의 SoundChannel). bgm은 반복하고 하나만, sfx는 한 번 나고 겹친다
  "channel": SoundChannel;
  // 인덱스 2: Resources 기준 오디오 클립 경로
  "clip": string;
  // 인덱스 3: 이 소리의 크기. 채널 볼륨과 곱한다
  "volume": number;
  // 인덱스 4: 설명 (선택)
  "note": string | null;
}

export async function deserializeSoundsMessagePack(bytes: Uint8Array | ArrayBuffer): Promise<Map<SoundsId, SoundsRow>> {
  const result = new Map<SoundsId, SoundsRow>();
  for (const row of readMessagePack(bytes)) {
    const record: SoundsRow = {
      "id": row[0] as SoundsId,
      "channel": row[1] as SoundChannel,
      "clip": row[2] as string,
      "volume": row[3] as number,
      "note": row[4] as string | null,
    };
    result.set(record.id, record);
  }
  return result;
}
