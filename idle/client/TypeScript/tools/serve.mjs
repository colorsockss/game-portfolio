// 로컬 버킷(릴리스 빌드의 dist/patch)을 정적 파일로 내준다(패치 시연). Live VPS의 Caddy가 패치 폴더에 하는 일만 하고, 클라이언트가
// 무엇을 받는지 보이도록 요청마다 한 줄씩 찍는다: node tools/serve.mjs [디렉터리] [포트]
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";

const [directory = "dist/patch", port = "8081"] = process.argv.slice(2);
const root = path.resolve(directory);

createServer(async (request, response) => {
  let file;
  try {
    file = path.join(root, decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname));
  } catch {
    file = root;
  }
  // 디렉터리 밖이나 파일이 아닌 것은 내주지 않는다.
  const found = file.startsWith(root + path.sep) && (await stat(file).catch(() => null))?.isFile();
  console.log(`[serve] ${found ? 200 : 404} ${request.url}`);
  if (!found) return void response.writeHead(404).end();
  response.writeHead(200, { "cache-control": "no-cache" });
  createReadStream(file).pipe(response);
}).listen(Number(port), () => console.log(`[serve] ${root} at http://localhost:${port}/`));
