// MMO 서버가 바깥에서 답하는지 본다: 주소에 TCP로 붙어 Ping 프레임을 보내고 Pong 프레임이 오면 성공이다.
// 배포(deploy.sh)가 다시 시작한 뒤에 부른다. Node 내장 모듈만 쓴다.
//   node mmo/server/deploy/check.mjs <호스트> [포트]
import assert from "node:assert/strict";
import { connect } from "node:net";

// Packet { ping = 4 }: 필드 4의 길이 구분 값(태그 0x22)이 빈 메시지다. 앞에 varint 프레임 길이 2가 붙는다.
const PING = Buffer.from([0x02, 0x22, 0x00]);
// Pong은 필드 5(태그 0x2a)다. 프레임 길이(varint 한 바이트) 다음 바이트로 본다.
const PONG_TAG = 0x2a;

/** 답의 첫 프레임이 Pong인가. */
function isPong(bytes) {
  return bytes.length >= 2 && bytes[0] < 0x80 && bytes[1] === PONG_TAG;
}
assert.equal(isPong(Buffer.from([0x04, 0x2a, 0x02, 0x08, 0x05])), true);
assert.equal(isPong(Buffer.from([0x02, 0x1a, 0x00])), false);

const [host, port = "7777"] = process.argv.slice(2);
if (!host) {
  throw new Error("Usage: check.mjs <host> [port]");
}

const socket = connect({ host, port: Number(port) });
socket.setTimeout(5000, () => socket.destroy(new Error(`No Pong from ${host}:${port} within 5 s.`)));
socket.on("connect", () => socket.write(PING));
socket.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
let received = Buffer.alloc(0);
socket.on("data", (chunk) => {
  received = Buffer.concat([received, chunk]);
  if (received.length >= 2) {
    process.exitCode = isPong(received) ? 0 : 1;
    if (process.exitCode) {
      console.error(`Expected a Pong from ${host}:${port}, got ${received.subarray(0, 8).toString("hex")}.`);
    }
    socket.destroy();
  }
});
