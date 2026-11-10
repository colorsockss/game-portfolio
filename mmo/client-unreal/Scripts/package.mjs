// Unreal 클라이언트를 대상 서버의 주소로 패키징해 Saved/Archive/에 둔다. 주소는 패키지의 명령줄(UECommandLine.txt)에
// -MmoServer=로 넣으므로 커밋한 ini는 바뀌지 않는다. Mac은 실행 파일의 로컬 심볼을 지우고(약 100 MB) 다시 서명한다.
//
//   node mmo/client-unreal/Scripts/package.mjs <mac|android> [--target local|live] [--config Shipping|Development]
//
//   local  Mac은 127.0.0.1, Android는 이 Mac의 LAN 주소(같은 Wi-Fi의 휴대폰과 BlueStacks가 붙는다). 포트는 7777.
//   live   Live 서버(mmo.dennou.cloud:7777).
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
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
  `-cmdline=-MmoServer=${server}`,
  "-unattended",
];
console.log(`Packaging ${platform} ${values.config} for ${values.target} server ${server}`);
const runUat = path.join(ENGINE, "Engine/Build/BatchFiles/RunUAT.sh");
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
