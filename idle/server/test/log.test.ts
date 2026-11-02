import { expect, test } from "vitest";
import { createLog, type LogLevel } from "../src/log.js";

function lines(level: LogLevel): string[] {
  const out: string[] = [];
  const push = (line: string) => void out.push(line);
  const rpc = createLog({ log: push, warn: line => push(`warn ${line}`), error: line => push(`error ${line}`) }, level)("rpc");
  rpc.debug("d");
  rpc.info("i");
  rpc.warn("w");
  rpc.error("e");
  return out;
}

test("prefixes the channel and drops lines below the level", () => {
  expect(lines("debug")).toEqual(["[rpc] d", "[rpc] i", "warn [rpc] w", "error [rpc] e"]);
  // 릴리즈 모드의 기본 레벨.
  expect(lines("info")).toEqual(["[rpc] i", "warn [rpc] w", "error [rpc] e"]);
  expect(lines("error")).toEqual(["error [rpc] e"]);
});
