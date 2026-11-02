import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Opcode } from "@idle/codes";
import { CloseCode, ResultCode, decodeMessage, encodeMessage, socketPath } from "@idle/protocol";
import { expect, test } from "vitest";

const serverRoot = fileURLToPath(new URL("../", import.meta.url));

// 다른 테스트는 TypeScript 소스를 돌리고, 이 테스트는 배포되는 번들을 돌린다. ws 같은 CommonJS
// 의존성을 ESM 파일 하나로 묶으면 실행할 때만 깨질 수 있다.
test("the built bundle starts and serves a login over WebSocket", async () => {
  const build = spawnSync(process.execPath, ["tools/build.mjs"], { cwd: serverRoot, encoding: "utf8" });
  expect(build.status, build.stdout + build.stderr).toBe(0);

  const child = spawn(process.execPath, ["dist/main.mjs"], {
    // Live VPS처럼 127.0.0.1에만 연다(HOST).
    cwd: serverRoot, env: { ...process.env, HOST: "127.0.0.1", PORT: "0", DATABASE_PATH: ":memory:" },
  });
  try {
    // 서버가 알리는 주소는 규칙 테이블의 지문까지 실은 경로다.
    const [port, path] = await new Promise<[string, string]>((resolve, reject) => {
      let output = "";
      child.stdout.on("data", chunk => {
        output += chunk;
        const match = /Listening on ws:\/\/127\.0\.0\.1:(\d+)(\/\S*)/.exec(output);
        if (match) resolve([match[1], match[2]]);
      });
      child.stderr.on("data", chunk => (output += chunk));
      child.on("exit", code => reject(new Error(`Server exited with ${code}:\n${output}`)));
    });

    expect(path).toMatch(/^\/ws\?v=\d+&d=[0-9a-f]{8}$/);
    const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`);
    ws.binaryType = "arraybuffer";
    const reply = new Promise<unknown>(resolve => ws.addEventListener("message", event => resolve(decodeMessage(event.data as ArrayBuffer))));
    await new Promise(resolve => ws.addEventListener("open", resolve));
    ws.send(encodeMessage({ op: Opcode.AuthLogin, id: "1", body: { loginId: "hero" } }));
    expect(await reply).toMatchObject({ code: ResultCode.Ok });
    ws.close();

    const outdated = new WebSocket(`ws://127.0.0.1:${port}${socketPath("00000000")}`);
    const closed = await new Promise<number>(resolve => outdated.addEventListener("close", event => resolve(event.code)));
    expect(closed).toBe(CloseCode.VersionMismatch);
  } finally {
    child.kill();
  }
}, 30_000);
