// 클라이언트와 서버 사이의 와이어 계약: 패킷마다 요청과 응답의 모양, 그것을 감싸는 봉투, 결과 코드,
// 세션, 소켓 경로, MessagePack 코덱. 패킷이 싣는 도메인 타입(저장 데이터, 커맨드, 게임 오류)은
// @idle/game-core의 것이고 패킷 번호는 @idle/codes의 것이다. 양쪽이 합의해야 하는 것만 여기에
// 두며, 각자 그것을 만들고 쓰는 방식은 그쪽 코드의 몫이다.
export type { Session } from "./account.js";
export {
  PROTOCOL_VERSION,
  type Apis, type LoginResult, type RequestOf, type ResponseOf, type SystemOpcode,
} from "./api.js";
export {
  COMMAND_TIME, MAX_UNANSWERED_COMMANDS, ResultCode,
  type FailureCode, type RequestEnvelope, type ResponseEnvelope, type ResponseResult,
} from "./envelope.js";
export { CloseCode, SOCKET_PATH, socketPath } from "./socket.js";
export { decodeMessage, encodeMessage } from "./codec.js";
