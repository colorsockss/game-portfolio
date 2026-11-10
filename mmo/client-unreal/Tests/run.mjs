// 엔진 없는 코드(Source/PortfolioMmo의 ENGINE_FREE 폴더)와 생성된 C++을 clang으로 빌드해 Tests/의 테스트를 돌린다.
// 그 폴더의 .cpp를 모두 컴파일하므로, UE 헤더를 include한 파일이 하나라도 있으면 여기서 실패한다(경계 검사).
// 지금은 커밋된 Mac 라이브러리로 Mac에서만 돌고, npm run test:mmo가 부른다.
//
//   node mmo/client-unreal/Tests/run.mjs
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const client = fileURLToPath(new URL("../", import.meta.url));
const protobuf = path.join(client, "Source/ThirdParty/MmoProtobuf/36.2");
const generated = path.join(client, "../shared/contract/generated");
// shortcut: 커밋된 라이브러리가 Mac용뿐이라 다른 OS에서는 건너뛴다. GitHub에서 돌리는 것은 backlog 66.
if (process.platform !== "darwin") {
  console.log("Skipped the engine-free Unreal tests: only macOS has prebuilt MmoProtobuf libraries.");
  process.exit(0);
}

const libraries = path.join(protobuf, "lib/Mac");
const out = mkdtempSync(path.join(tmpdir(), "mmo-unreal-tests-"));
process.on("exit", () => rmSync(out, { recursive: true, force: true }));

// UE 타입을 쓰지 않는 폴더. Unity 클라이언트가 C#으로 옮기는 부분이다.
const ENGINE_FREE = ["Protocol", "World", "Screen"];
const sources = ENGINE_FREE.flatMap((folder) => {
  const directory = path.join(client, "Source/PortfolioMmo/Private", folder);
  return readdirSync(directory).filter((file) => file.endsWith(".cpp")).map((file) => path.join(directory, file));
});

// UE와 같은 C++20, RTTI·예외 없이 컴파일한다. abseil의 시간대 코드가 CoreFoundation을 쓴다.
// 생성된 packets.pb.cc는 UE에서처럼 Protocol/Packets.cpp가 include해 컴파일한다.
for (const test of readdirSync(path.join(client, "Tests")).filter((file) => file.endsWith("Test.cpp"))) {
  const binary = path.join(out, path.basename(test, ".cpp"));
  run("clang++", [
    "-std=c++20",
    "-fno-rtti",
    "-fno-exceptions",
    "-mmacosx-version-min=14.0",
    "-Wall",
    "-Werror",
    `-I${path.join(client, "Source/PortfolioMmo/Public")}`,
    "-isystem",
    path.join(protobuf, "include"),
    "-isystem",
    generated,
    path.join(client, "Tests", test),
    ...sources,
    ...readdirSync(libraries).filter((file) => file.endsWith(".a")).map((file) => path.join(libraries, file)),
    "-framework",
    "CoreFoundation",
    "-o",
    binary,
  ]);
  run(binary, []);
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
