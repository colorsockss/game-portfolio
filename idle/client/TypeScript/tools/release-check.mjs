// 단위로 나눠 낸 패치가 함께 돌 서버와 맞는지 본다(docs/superpowers/specs/2026-10-30-patch-design.md 4.12절의 조합 검사).
//   node tools/release-check.mjs --patch=<버전 폴더> --server-data=<서버의 data 폴더> --server-commit=<커밋> [--repo=<git 저장소>]
// 1. 패치의 규칙 테이블 지문이 서버의 것과 같아야 한다(다르면 서버가 접속을 끊음).
// 2. 패치의 게임 TS를 만든 커밋과 서버의 커밋이 idle/shared/에서 같아야 한다(예측과 확정이 같은 규칙·프로토콜로 돎).
// 3. 게임 TS와 Addressables가 다른 커밋에서 왔고 그 사이에 에셋이나 뷰가 바뀌었으면 경고만 한다(어긋났는지는 모름).
// 맞지 않으면 이유를 찍고 1로 끝낸다. CI가 내보내기 전에 부른다.
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ruleFingerprint } from "./data-schema.mjs";
import { MANIFEST } from "./manifest.mjs";

const option = name => process.argv.slice(2).find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const patch = option("patch");
const serverData = option("server-data");
const server = option("server-commit");
if (!patch || !serverData) throw new Error("Usage: node tools/release-check.mjs --patch=<folder> --server-data=<folder> --server-commit=<commit>");
const repo = option("repo") ?? git(process.cwd(), "rev-parse", "--show-toplevel").stdout.trim();

const manifest = JSON.parse(await readFile(path.join(patch, MANIFEST), "utf8"));
const problems = [];

// 1. 규칙 테이블. 서버가 소켓 경로의 d=로 견주는 값과 같은 계산이다.
const [patchRules, serverRules] = [await ruleFingerprint(path.join(patch, "data")), await ruleFingerprint(serverData)];
if (patchRules !== serverRules) {
  problems.push(`The patch's rule tables (${patchRules}) differ from the server's (${serverRules}); release the rule tables with the server (stage it with publish off, then publish the patch version).`);
}

// 2. 공용 코드. 기록이 없으면(단위를 적기 전의 버전) 어느 커밋인지 모르므로 한 번은 전체를 내야 한다.
const game = manifest.parts?.game;
if (!game) problems.push("The patch does not record which commit built its game bundle; release every unit once.");
else if (!server) problems.push("No server commit to check the game bundle against.");
else if (game !== server) {
  const shared = git(repo, "diff", "--quiet", game, server, "--", "idle/shared");
  if (shared.status === 1) {
    problems.push(`idle/shared differs between the game bundle (${game.slice(0, 7)}) and the server (${server.slice(0, 7)}); release the game bundle with the server.`);
  } else if (shared.status !== 0) {
    problems.push(`Cannot compare ${game.slice(0, 7)} and ${server.slice(0, 7)}: ${shared.stderr.trim()}`);
  }
}

// 3. 경고만: TS가 쓰는 프리팹 키와 뷰 참조는 CI가 맞춰 보지 못한다.
const assets = manifest.parts?.assets;
if (game && assets && game !== assets) {
  const views = git(repo, "diff", "--quiet", assets, game, "--", "idle/client/Assets/Remote", "idle/client/TypeScript/src/unity/views");
  if (views.status !== 0) {
    console.log(`::warning::The game bundle (${game.slice(0, 7)}) and the asset bundles (${assets.slice(0, 7)}) come from commits whose assets or views differ; release them together if the code uses new prefabs or refs.`);
  }
}

if (problems.length > 0) {
  for (const problem of problems) console.error(`::error::${problem}`);
  process.exit(1);
}
console.log(`[check] ${manifest.version}: rule tables ${patchRules} match the server, idle/shared matches (game ${game.slice(0, 7)}, server ${server.slice(0, 7)})`);

function git(cwd, ...args) {
  const result = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8" });
  if (result.error) throw result.error;
  return result;
}
