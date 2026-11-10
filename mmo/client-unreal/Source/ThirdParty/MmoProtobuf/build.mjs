// protobuf와 그것이 요구하는 abseil을 받아, 이 모듈이 링크하는 정적 라이브러리와 헤더를 만든다:
//   36.2/include/                      헤더(플랫폼마다 같다)
//   36.2/lib/Mac/                      arm64·x86_64 유니버설
//   36.2/lib/Android/arm64-v8a/        엔진과 같은 NDK, 정적 libc++(UE는 libc++_shared를 링크하는 라이브러리를 거부한다)
// 결과는 LFS로 커밋하므로 버전을 바꿀 때만 다시 돌린다. 서버의 C# 런타임(Google.Protobuf)과 같은 버전이어야 한다.
//
//   node build.mjs [mac] [android]     플랫폼을 주지 않으면 둘 다
//
// cmake(3.16 이상)와 ninja가 PATH에 있어야 하고, android는 NDKROOT(UE와 같은 이름)에 NDK가 있어야 한다.
// 내려받은 소스와 빌드 폴더는 OS 임시 폴더에 두고 다시 쓴다.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROTOBUF = {
  version: "36.2",
  url: "https://github.com/protocolbuffers/protobuf/releases/download/v36.2/protobuf-36.2.tar.gz",
  sha256: "3d9642a662d10e68ebae5e53f14dcce5105684212d5078f8e0d47d1ab3ae6b64",
};
// protobuf의 cmake/dependencies.cmake가 정한 abseil 버전.
const ABSEIL = {
  version: "20250512.1",
  url: "https://github.com/abseil/abseil-cpp/releases/download/20250512.1/abseil-cpp-20250512.1.tar.gz",
  sha256: "9b7a064305e9fd94d124ffa6cc358592eb42b5da588fb4e07d09254aa40086db",
};

// UE 5.8의 Engine/Config/Mac/Mac_SDK.json(DeploymentTarget)과 Engine/Config/Android의 MinSDKVersion.
const PLATFORMS = {
  mac: {
    output: "Mac",
    flags: () => ["-DCMAKE_OSX_ARCHITECTURES=arm64;x86_64", "-DCMAKE_OSX_DEPLOYMENT_TARGET=14.0"],
  },
  android: {
    output: "Android/arm64-v8a",
    flags: () => [
      `-DCMAKE_TOOLCHAIN_FILE=${path.join(ndk(), "build/cmake/android.toolchain.cmake")}`,
      "-DANDROID_ABI=arm64-v8a",
      "-DANDROID_PLATFORM=android-26",
      "-DANDROID_STL=c++_static",
    ],
    // NDK 툴체인은 Release에도 -g를 넣어 라이브러리가 열 배쯤 커진다(145 MB). 디버그 정보만 지운다.
    strip: async (lib) => {
      const prebuilt = path.join(ndk(), "toolchains/llvm/prebuilt");
      const [host] = await readdir(prebuilt);
      run(path.join(prebuilt, host, "bin/llvm-strip"), ["--strip-debug", lib]);
    },
  },
};

function ndk() {
  const root = process.env.NDKROOT;
  if (!root || !existsSync(path.join(root, "build/cmake/android.toolchain.cmake"))) {
    throw new Error("Set NDKROOT to the Android NDK that UE uses (r27c).");
  }
  return root;
}

// UE 5.8이 컴파일하는 C++ 표준. abseil은 표준에 따라 std 타입을 쓸지 정하므로 맞춘다.
// 모듈이 공유 라이브러리(Android의 libUnreal.so, 에디터의 모듈 dylib)에 들어가므로 PIC로 만든다.
const COMMON = ["-G", "Ninja", "-DCMAKE_BUILD_TYPE=Release", "-DCMAKE_CXX_STANDARD=20", "-DCMAKE_POSITION_INDEPENDENT_CODE=ON", "-DCMAKE_INSTALL_LIBDIR=lib"];

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.join(moduleDir, PROTOBUF.version);
const workDir = path.join(tmpdir(), `mmo-protobuf-${PROTOBUF.version}`);

const names = process.argv.slice(2);
for (const name of names) {
  if (!Object.hasOwn(PLATFORMS, name)) throw new Error(`Unknown platform "${name}". Choose from: ${Object.keys(PLATFORMS).join(", ")}.`);
}

await mkdir(workDir, { recursive: true });
const protobufSource = await fetchSource(PROTOBUF, `protobuf-${PROTOBUF.version}`);
const abseilSource = await fetchSource(ABSEIL, `abseil-cpp-${ABSEIL.version}`);

for (const name of names.length > 0 ? names : Object.keys(PLATFORMS)) {
  const platform = PLATFORMS[name];
  const prefix = path.join(workDir, "install", name);
  await rm(prefix, { recursive: true, force: true });
  const flags = [...COMMON, ...platform.flags(), `-DCMAKE_INSTALL_PREFIX=${prefix}`];

  build(abseilSource, path.join(workDir, "build", name, "abseil"), [
    ...flags,
    "-DABSL_PROPAGATE_CXX_STD=ON",
    "-DABSL_ENABLE_INSTALL=ON",
    "-DABSL_BUILD_TESTING=OFF",
    "-DBUILD_TESTING=OFF",
  ]);
  // Android 툴체인은 find_package가 sysroot 밖을 찾지 않으므로 abseil의 위치를 직접 준다.
  build(protobufSource, path.join(workDir, "build", name, "protobuf"), [
    ...flags,
    `-Dabsl_DIR=${path.join(prefix, "lib/cmake/absl")}`,
    "-Dprotobuf_LOCAL_DEPENDENCIES_ONLY=ON",
    "-Dprotobuf_BUILD_TESTS=OFF",
    "-Dprotobuf_BUILD_CONFORMANCE=OFF",
    "-Dprotobuf_BUILD_EXAMPLES=OFF",
    "-Dprotobuf_BUILD_PROTOC_BINARIES=OFF",
    "-Dprotobuf_BUILD_LIBUPB=OFF",
    "-Dprotobuf_WITH_ZLIB=OFF",
    "-Dprotobuf_INSTALL=ON",
  ]);

  // 링크할 정적 라이브러리만 옮긴다. lite 런타임은 생성 코드가 쓰지 않는다.
  const libs = (await readdir(path.join(prefix, "lib"))).filter((file) => file.endsWith(".a") && file !== "libprotobuf-lite.a").sort();
  const libDir = path.join(outputDir, "lib", platform.output);
  await rm(libDir, { recursive: true, force: true });
  await mkdir(libDir, { recursive: true });
  for (const lib of libs) {
    await cp(path.join(prefix, "lib", lib), path.join(libDir, lib));
    await platform.strip?.(path.join(libDir, lib));
  }
  await rm(path.join(outputDir, "include"), { recursive: true, force: true });
  await cp(path.join(prefix, "include"), path.join(outputDir, "include"), { recursive: true });
  console.log(`Wrote ${libs.length} libraries to ${path.relative(moduleDir, libDir)}`);
}

// 내려받은 tar.gz를 해시로 확인하고 풀어 둔다. 이미 풀려 있으면 그대로 쓴다.
async function fetchSource({ url, sha256 }, folder) {
  const source = path.join(workDir, folder);
  if (existsSync(path.join(source, "CMakeLists.txt"))) return source;
  const archive = path.join(workDir, path.basename(url));
  if (!existsSync(archive)) {
    console.log(`Downloading ${url}`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Download failed (${response.status}): ${url}`);
    await writeFile(archive, Buffer.from(await response.arrayBuffer()));
  }
  const actual = createHash("sha256").update(await readFile(archive)).digest("hex");
  if (actual !== sha256) {
    await rm(archive);
    throw new Error(`SHA-256 mismatch for ${url}: expected ${sha256}, got ${actual}`);
  }
  run("tar", ["-xzf", archive, "-C", workDir]);
  return source;
}

function build(source, buildDir, flags) {
  run("cmake", ["-S", source, "-B", buildDir, ...flags]);
  run("cmake", ["--build", buildDir]);
  run("cmake", ["--install", buildDir]);
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(result.error ? `${command}: ${result.error.message}` : `${command} ${args[0]} failed with status ${result.status}`);
  }
}
