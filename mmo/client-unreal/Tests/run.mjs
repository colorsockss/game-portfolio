// 엔진 없는 코드(Source/PortfolioMmo의 ENGINE_FREE 폴더)와 생성된 C++을 clang으로 빌드해 Tests/의 테스트를 돌린다.
// 그 폴더의 .cpp를 모두 컴파일하므로, UE 헤더를 include한 파일이 하나라도 있으면 여기서 실패한다(경계 검사).
// 지금은 커밋된 Mac 라이브러리로 Mac에서만 돌고, npm run test:mmo가 부른다.
//
//   node mmo/client-unreal/Tests/run.mjs [이름…]   이름을 주면 파일 이름에 그 글이 든 테스트만(예: Crafting)
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { availableParallelism, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const client = fileURLToPath(new URL("../", import.meta.url));
const protobuf = path.join(client, "Source/ThirdParty/MmoProtobuf/36.2");
const generated = path.join(client, "../shared/contract/generated");
// 기획 데이터의 생성물과 비교 벡터. 테스트에 두 폴더를 넘겨 커밋된 파일을 실제로 읽게 한다.
const data = path.join(client, "../shared/data/files");
const vectors = path.join(client, "../shared/vectors");
const dataCode = path.join(client, "../shared/data/generated");
// shortcut: 커밋된 라이브러리가 Mac용뿐이라 다른 OS에서는 건너뛴다. GitHub에서 돌리는 것은 backlog 66.
if (process.platform !== "darwin") {
  console.log("Skipped the engine-free Unreal tests: only macOS has prebuilt MmoProtobuf libraries.");
  process.exit(0);
}

const libraries = path.join(protobuf, "lib/Mac");
const out = mkdtempSync(path.join(tmpdir(), "mmo-unreal-tests-"));
process.on("exit", () => rmSync(out, { recursive: true, force: true }));

// UE 타입을 쓰지 않는 폴더. Unity 클라이언트가 C#으로 옮기는 부분이다.
const ENGINE_FREE = ["Protocol", "World", "Screen", "Data"];
const sources = ENGINE_FREE.flatMap((folder) => {
  const directory = path.join(client, "Source/PortfolioMmo/Private", folder);
  return readdirSync(directory).filter((file) => file.endsWith(".cpp")).map((file) => path.join(directory, file));
});

// UE와 같은 C++20, RTTI·예외 없이 컴파일한다. abseil의 시간대 코드가 CoreFoundation을 쓴다.
// 생성된 packets.pb.cc와 데이터의 .pb.cc는 UE에서처럼 Protocol/Packets.cpp와 Data/DataTables.cpp가 include해 컴파일한다.
// 엔진 없는 소스는 테스트마다 다시 컴파일하지 않고 코어 수만큼 나란히 한 번 오브젝트로 만든 뒤, 테스트마다 테스트 파일만 컴파일해 링크한다.
const flags = [
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
  "-isystem",
  dataCode,
];
const only = process.argv.slice(2);
const tests = readdirSync(path.join(client, "Tests")).filter((file) => file.endsWith("Test.cpp") && (only.length === 0 || only.some((name) => file.includes(name))));
const objects = await compileAll(sources.map((source, index) => [source, path.join(out, `${index}-${path.basename(source, ".cpp")}.o`)]));
const testObjects = await compileAll(tests.map((test) => [path.join(client, "Tests", test), path.join(out, `${path.basename(test, ".cpp")}.o`)]));
tests.forEach((test, index) => {
  const binary = path.join(out, path.basename(test, ".cpp"));
  run("clang++", [
    "-mmacosx-version-min=14.0",
    testObjects[index],
    ...objects,
    ...readdirSync(libraries).filter((file) => file.endsWith(".a")).map((file) => path.join(libraries, file)),
    "-framework",
    "CoreFoundation",
    "-o",
    binary,
  ]);
  run(binary, [data, vectors]);
});

/** (소스, 오브젝트)들을 코어 수만큼 나란히 컴파일한다. 하나라도 실패하면 그 출력과 함께 끝난다. 오브젝트 경로를 같은 차례로 돌려준다. */
async function compileAll(pairs) {
  let next = 0;
  const worker = async () => {
    while (next < pairs.length) {
      const [source, object] = pairs[next++];
      const status = await new Promise((resolve) => spawn("clang++", [...flags, "-c", source, "-o", object], { stdio: "inherit" }).on("close", resolve));
      if (status !== 0) process.exit(status ?? 1);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, availableParallelism()) }, worker));
  return pairs.map(([, object]) => object);
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
