// Unreal 클라이언트를 대상 서버의 주소로 패키징해 Saved/Archive/에 둔다. 먼저 Field 레벨의 맵 액터가 맵의 목록과 같은지 본다(MmoExportMap -Check). 주소는 패키지의 명령줄(UECommandLine.txt)에
// -MmoServer=로 넣으므로 커밋한 ini는 바뀌지 않는다. 같은 명령줄의 -MmoCommit=에 커밋 SHA를 남긴다(작업 트리가 더러우면 뒤에 -dirty).
// Mac은 실행 파일의 로컬 심볼을 지우고(약 100 MB) 다시 서명한다.
//
// live는 올릴 빌드라 먼저 멈출 것을 본다(mmo backlog 10): main 체크아웃인가(worktree가 아님), 작업 트리가 깨끗한가(다른 세션이 같은
// 작업 트리를 씀), 엔진 없는 검사(npm run test:mmo), Live 서버의 프로토콜 버전과 데이터 해시가 이 빌드와 같은가.
//
//   node mmo/client-unreal/Scripts/package.mjs <mac|android> [--target local|live] [--config Shipping|Development]
//
//   local  Mac은 127.0.0.1, Android는 이 Mac의 LAN 주소(같은 Wi-Fi의 휴대폰과 BlueStacks가 붙는다). 포트는 7777.
//   live   Live 서버(mmo.dennou.cloud:7777).
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, readFileSync, rmSync } from "node:fs";
import { connect } from "node:net";
import { networkInterfaces } from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

const ENGINE = process.env.UE_ROOT ?? "/Users/Shared/Epic Games/UE_5.8";
const ANDROID_ENV = path.join(process.env.MMO_ANDROID_ROOT ?? "/Users/Shared/Epic Games/Android/UE_5.8", "env.sh");
if (!existsSync(ENGINE)) {
  throw new Error(`Unreal Engine not found at ${ENGINE} (set UE_ROOT).`);
}
const PORT = 7777;
// Live 서버(mmo/server/deploy). 키우기와 같은 VPS이고 Caddy를 거치지 않고 TCP로 붙는다.
const LIVE_SERVER = "mmo.dennou.cloud:7777";

const client = fileURLToPath(new URL("../", import.meta.url));
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    target: { type: "string", default: "local" },
    config: { type: "string", default: "Shipping" },
  },
});
const platform = positionals[0];
if (!["mac", "android"].includes(platform) || !["local", "live"].includes(values.target) || !["Shipping", "Development"].includes(values.config)) {
  throw new Error("Usage: package.mjs <mac|android> [--target local|live] [--config Shipping|Development]");
}

const server = serverFor(platform, values.target);
const repo = path.join(client, "../..");
if (values.target === "live") {
  await checkLive(server);
}
const commit = git("rev-parse", "HEAD") + (git("status", "--porcelain") ? "-dirty" : "");
const archive = path.join(client, "Saved/Archive");
const args = [
  "BuildCookRun",
  `-project=${path.join(client, "PortfolioMmo.uproject")}`,
  "-noP4",
  `-platform=${platform === "mac" ? "Mac" : "Android"}`,
  ...(platform === "android" ? ["-cookflavor=ASTC", "-UbtArgs=-NoUBA"] : []),
  `-clientconfig=${values.config}`,
  "-build",
  "-cook",
  "-stage",
  "-pak",
  "-package",
  "-archive",
  `-archivedirectory=${archive}`,
  `-cmdline=-MmoServer=${server} -MmoCommit=${commit}`,
  "-unattended",
];
console.log(`Packaging ${platform} ${values.config} of ${commit} for ${values.target} server ${server}`);
// 레벨의 맵 액터가 맵 생성기의 목록(shared/data/files/Map.tsv)과 다르면 멈춘다(원본만 고침, 레벨만 고침, 놓인 종류의 줄만 고침을 함께 잡음).
// 에디터 모듈의 커맨드렛이라 에디터 타깃이 빌드되어 있어야 한다.
run(path.join(ENGINE, "Engine/Binaries/Mac/UnrealEditor-Cmd"), [
  path.join(client, "PortfolioMmo.uproject"),
  "-run=MmoExportMap",
  "-Check",
  "-unattended",
  "-nosplash",
  "-nullrhi",
]);
const runUat = path.join(ENGINE, "Engine/Build/BatchFiles/RunUAT.sh");
// 기획 데이터를 패키지에 싣는다(DefaultGame.ini의 DirectoriesToAlwaysStageAsUFS). 원본은 저장소의 생성물 하나이고,
// 복사본은 패키징 동안만 둔다.
const stagedData = path.join(client, "Content/Data");
rmSync(stagedData, { recursive: true, force: true });
cpSync(path.join(client, "../shared/data/files"), stagedData, { recursive: true });
// run이 실패하면 process.exit로 끝나 finally가 돌지 않으므로 프로세스가 끝날 때 지운다.
process.on("exit", () => rmSync(stagedData, { recursive: true, force: true }));
// Android 빌드는 setup-android.mjs가 만든 env.sh의 JDK·SDK·NDK를 쓴다.
run("bash", ["-c", platform === "android" ? `source "${ANDROID_ENV}" && exec "$0" "$@"` : `exec "$0" "$@"`, runUat, ...args]);

if (platform === "mac") {
  const name = `PortfolioMmo${values.config === "Shipping" ? "-Mac-Shipping" : ""}`;
  const app = path.join(archive, "Mac", `${name}.app`);
  run("strip", ["-x", path.join(app, "Contents/MacOS", name)]);
  run("codesign", ["--force", "--sign", "-", app]);
  console.log(`Packaged ${app}`);
} else {
  console.log(`Packaged ${path.join(archive, "Android_ASTC")}`);
}

/** 올릴 빌드의 조건을 보고 하나라도 어긋나면 멈춘다. */
async function checkLive(server) {
  if (path.resolve(repo, git("rev-parse", "--git-dir")) !== path.resolve(repo, git("rev-parse", "--git-common-dir"))) {
    throw new Error("Package live builds from the main checkout, not a worktree.");
  }
  const dirty = git("status", "--porcelain");
  if (dirty) {
    throw new Error(`Commit or remove these changes before a live build:\n${dirty}`);
  }
  run("npm", ["run", "test:mmo", "--prefix", repo]);
  // 클라이언트가 싣는 값: 패킷 정의의 PROTOCOL_VERSION_CURRENT와 생성한 데이터의 해시(패키지가 shared/data/files를 싣는다).
  const version = Number(/PROTOCOL_VERSION_CURRENT = (\d+);/.exec(readFileSync(path.join(client, "../shared/contract/packets.proto"), "utf8"))[1]);
  const hash = readFileSync(path.join(client, "../shared/data/files/data.hash"), "utf8").trim();
  const result = await loginProbe(server, version, hash);
  // 서버는 버전 → 데이터 해시 → ID 형식의 차례로 본다(LoginSystem.Login). 빈 ID가 형식에서 걸렸으면 앞의 둘이 맞은 것이고 계정은 생기지 않는다.
  const INVALID_LOGIN_ID = 1;
  const names = { 2: "protocol version", 4: "data hash" };
  if (result !== INVALID_LOGIN_ID) {
    throw new Error(`Live server ${server} rejected this build's ${names[result] ?? `login (result ${result})`} (protocol ${version}, data ${hash}). Deploy the server first.`);
  }
  console.log(`Live server ${server} matches protocol ${version} and data ${hash}.`);
}

/** 빈 ID로 Login을 보내 LoginResult의 결과 코드를 받는다. Packet { login = 1 { protocol_version = 1, data_hash = 3 (fixed64) } }를 손으로 인코딩한다. */
function loginProbe(server, version, hash) {
  const [host, port] = server.split(":");
  const login = Buffer.alloc(11);
  login.writeUInt8(0x08, 0);
  login.writeUInt8(version, 1);
  login.writeUInt8(0x19, 2);
  login.writeBigUInt64LE(BigInt(`0x${hash}`), 3);
  const frame = Buffer.concat([Buffer.from([2 + login.length, 0x0a, login.length]), login]);
  return new Promise((resolve, reject) => {
    const socket = connect({ host, port: Number(port) });
    socket.setTimeout(5000, () => socket.destroy(new Error(`No LoginResult from ${server} within 5 s.`)));
    socket.on("connect", () => socket.write(frame));
    socket.on("error", reject);
    let received = Buffer.alloc(0);
    socket.on("data", (chunk) => {
      received = Buffer.concat([received, chunk]);
      // [프레임 길이][0x12 = login_result = 2][길이][0x08 result]. 결과 0(OK)은 빈 메시지라 실제로는 오지 않는다.
      if (received.length >= 3 && received.length >= 1 + received[0]) {
        socket.destroy();
        if (received[1] !== 0x12) {
          reject(new Error(`Expected a LoginResult from ${server}, got ${received.toString("hex")}.`));
        } else {
          resolve(received[2] >= 2 && received[3] === 0x08 ? received[4] : 0);
        }
      }
    });
  });
}

function git(...args) {
  return spawnSync("git", ["-C", repo, ...args], { encoding: "utf8" }).stdout.trim();
}

/** 대상과 플랫폼 → 호스트:포트. */
function serverFor(platform, target) {
  if (target === "live") {
    return LIVE_SERVER;
  }
  if (platform === "mac") {
    return `127.0.0.1:${PORT}`;
  }
  // 기기는 이 Mac에 LAN으로 붙는다. Wi-Fi(en0)를 먼저 고른다.
  const interfaces = networkInterfaces();
  const names = ["en0", ...Object.keys(interfaces).filter((name) => name !== "en0")];
  for (const name of names) {
    const address = interfaces[name]?.find((entry) => entry.family === "IPv4" && !entry.internal);
    if (address) {
      return `${address.address}:${PORT}`;
    }
  }
  throw new Error("No LAN IPv4 address found for a device to reach this Mac.");
}

function run(command, commandArgs) {
  const result = spawnSync(command, commandArgs, { stdio: "inherit" });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
