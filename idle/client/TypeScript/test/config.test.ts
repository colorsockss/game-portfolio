import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { parseAppConfig } from "../src/application/app/config.js";

const committed = (environment: string) => readFileSync(new URL(`../../config/${environment}.json`, import.meta.url), "utf8");

test("parseAppConfig reads the committed local and live configs", () => {
  expect(parseAppConfig(committed("local"))).toEqual({ environment: "local", server: "ws://localhost:8080", patch: "http://localhost:8081/" });
  expect(parseAppConfig(committed("live"))).toEqual({
    environment: "live", server: "wss://idle.dennou.cloud", patch: "https://idle.dennou.cloud/patch/",
  });
});

test.each([
  ["not an object", "[]"],
  ["no environment", JSON.stringify({ server: "ws://localhost:8080", patch: "http://localhost:8081/" })],
  ["an http game server", JSON.stringify({ environment: "local", server: "http://localhost:8080", patch: "http://localhost:8081/" })],
  ["a game server with a path", JSON.stringify({ environment: "local", server: "ws://localhost:8080/ws", patch: "http://localhost:8081/" })],
  ["a patch address without a trailing slash", JSON.stringify({ environment: "local", server: "ws://localhost:8080", patch: "http://localhost:8081" })],
  ["placeholders", JSON.stringify({ environment: "live", server: "wss://<호스트>", patch: "https://<호스트>/patch/" })],
])("parseAppConfig refuses %s", (_case, text) => {
  expect(() => parseAppConfig(text)).toThrow(/app config is malformed/);
});
