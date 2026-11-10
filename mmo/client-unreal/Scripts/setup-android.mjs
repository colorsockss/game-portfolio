// Unreal의 Android 빌드에 쓸 JDK와 SDK(NDK 포함)를 Android Studio·Unity와 따로 한 폴더에 받는다. Unity가 에디터 버전마다
// Android 도구를 따로 두는 것처럼 엔진 버전마다 둔다:
//   <root>/jdk/   Temurin JDK 21. UE 5.8의 Gradle 8.13은 Java 23까지만 돌아 Android Studio의 JDK(25)를 쓸 수 없다.
//   <root>/sdk/   cmdline-tools와, 엔진의 Engine/Config/Android/Android_SDK.json이 정한 platform, build-tools, cmake, NDK
//   <root>/env.sh 빌드 명령 앞에 source하는 ANDROID_HOME, NDKROOT, JAVA_HOME
//
//   node mmo/client-unreal/Scripts/setup-android.mjs
//
// root는 MMO_ANDROID_ROOT(기본 /Users/Shared/Epic Games/Android/UE_5.8), 엔진은 UE_ROOT(기본 /Users/Shared/Epic Games/UE_5.8).
// SDK 라이선스는 사람이 동의해야 하므로, 동의 기록이 없으면 동의할 명령을 보여 주고 멈춘다. 동의한 뒤 다시 돌리면 이어서 받는다.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

// 받은 파일은 배포처가 밝힌 체크섬으로 확인한다(Adoptium은 SHA-256, Google의 SDK 저장소는 SHA-1).
const JDK = {
  url: "https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.13%2B9/OpenJDK21U-jdk_aarch64_mac_hotspot_21.0.13_9.tar.gz",
  algorithm: "sha256",
  checksum: "bf036b35b071bfb2f54f2c0af8ee8d88afa95ee6eb3dce02c0f94cfc2524d04a",
};
// cmdline-tools 21.0. 22.0부터 sdkmanager가 Android CLI(`android sdk`)로 바뀌어 라이선스 파일을 쓰지 않는데(UE는 그 파일이
// 있어야 APK를 만든다), 그 CLI는 기본으로 사용 통계도 보낸다.
const CMDLINE_TOOLS = {
  url: "https://dl.google.com/android/repository/commandlinetools-mac-15641748_latest.zip",
  algorithm: "sha1",
  checksum: "b62a5d8cf63ded173b47be867be4ee058ceda6df",
};

if (process.platform !== "darwin" || process.arch !== "arm64") throw new Error("This script downloads the macOS arm64 tools only.");

const engine = process.env.UE_ROOT ?? "/Users/Shared/Epic Games/UE_5.8";
const root = process.env.MMO_ANDROID_ROOT ?? "/Users/Shared/Epic Games/Android/UE_5.8";
const jdk = path.join(root, "jdk");
const javaHome = path.join(jdk, "Contents/Home");
const sdk = path.join(root, "sdk");
const sdkmanager = path.join(sdk, "cmdline-tools/latest/bin/sdkmanager");
const versions = JSON.parse(await readFile(path.join(engine, "Engine/Config/Android/Android_SDK.json"), "utf8"));
const work = await mkdtemp(path.join(tmpdir(), "mmo-android-"));
process.on("exit", () => spawnSync("rm", ["-rf", work]));

await mkdir(root, { recursive: true });
if (!existsSync(path.join(javaHome, "bin/java"))) {
  const extracted = await unpack(JDK, ["tar", "-xzf"]);
  await rename(path.join(extracted, "jdk-21.0.13+9"), jdk);
}
// 다른 판이 들어 있으면 고정한 판으로 바꾼다.
const toolsVersion = await readFile(path.join(sdk, "cmdline-tools/latest/source.properties"), "utf8").catch(() => "");
if (!toolsVersion.includes("Pkg.Revision=21.0")) {
  await rm(path.join(sdk, "cmdline-tools/latest"), { recursive: true, force: true });
}
if (!existsSync(sdkmanager)) {
  const extracted = await unpack(CMDLINE_TOOLS, ["unzip", "-q"]);
  await mkdir(path.join(sdk, "cmdline-tools"), { recursive: true });
  await rename(path.join(extracted, "cmdline-tools"), path.dirname(path.dirname(sdkmanager)));
}

const env = { ...process.env, JAVA_HOME: javaHome };
if (!existsSync(path.join(sdk, "licenses/android-sdk-license"))) {
  console.log(`Accept the Android SDK licenses in a terminal, then run this script again:\n\n  JAVA_HOME="${javaHome}" "${sdkmanager}" --sdk_root="${sdk}" --licenses\n`);
  process.exit(2);
}

const packages = ["platform-tools", `platforms;${versions.platforms}`, `build-tools;${versions["build-tools"]}`, `cmake;${versions.cmake}`, `ndk;${versions.ndk}`];
run(sdkmanager, [`--sdk_root=${sdk}`, ...packages], env);

const ndk = path.join(sdk, "ndk", versions.ndk);
const cmake = path.join(sdk, "cmake", versions.cmake, "bin");
await writeFile(
  path.join(root, "env.sh"),
  `# setup-android.mjs가 만든다. Unreal의 Android 빌드(와 MmoProtobuf의 build.mjs) 앞에 source한다.\n` +
    `export ANDROID_HOME="${sdk}"\nexport NDKROOT="${ndk}"\nexport NDK_ROOT="${ndk}"\nexport JAVA_HOME="${javaHome}"\nexport PATH="${cmake}:$PATH"\n`,
);
console.log(`Android tools are ready in ${root}. Run \`source "${path.join(root, "env.sh")}"\` before Android builds.`);

// 받은 파일을 체크섬으로 확인하고 작업 폴더에 풀어 그 폴더를 돌려준다.
async function unpack({ url, algorithm, checksum }, extract) {
  console.log(`Downloading ${url}`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed (${response.status}): ${url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const actual = createHash(algorithm).update(bytes).digest("hex");
  if (actual !== checksum) throw new Error(`${algorithm} mismatch for ${url}: expected ${checksum}, got ${actual}`);
  const archive = path.join(work, path.basename(new URL(url).pathname));
  await writeFile(archive, bytes);
  const out = await mkdtemp(path.join(work, "x-"));
  run(extract[0], extract[0] === "tar" ? [...extract.slice(1), archive, "-C", out] : [...extract.slice(1), archive, "-d", out]);
  await rm(archive);
  return out;
}

function run(command, args, environment = process.env) {
  const result = spawnSync(command, args, { stdio: "inherit", env: environment });
  if (result.status !== 0) throw new Error(result.error ? `${command}: ${result.error.message}` : `${path.basename(command)} failed with status ${result.status}`);
}
