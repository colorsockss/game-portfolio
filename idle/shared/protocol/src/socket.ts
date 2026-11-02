import { PROTOCOL_VERSION } from "./api.js";

/** 유일한 WebSocket 엔드포인트. 클라이언트의 프로토콜 버전과 규칙 테이블의 지문(GameData.version)은 쿼리에 싣는다: /ws?v=1&d=0a1b2c3d. */
export const SOCKET_PATH = "/ws";

export function socketPath(dataVersion: string, version: number = PROTOCOL_VERSION): string {
  return `${SOCKET_PATH}?v=${version}&d=${encodeURIComponent(dataVersion)}`;
}

/** 서버가 연결을 닫은 이유(4000-4999는 애플리케이션이 쓰도록 WebSocket이 정해 둔 범위다). */
export enum CloseCode {
  /** 클라이언트가 다른 프로토콜 버전이나 다른 규칙 테이블을 쓴다: 재연결하기 전에 업데이트해야 한다. */
  VersionMismatch = 4000,
  /**
   * 계정이 다른 연결에서 로그인했다. 스스로 재연결하거나 다시 로그인하지 않는다. 그러면 이번에는
   * 상대 연결이 닫힌다.
   */
  SessionReplaced = 4001,
}
