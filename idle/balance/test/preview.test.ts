import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { loadGameData } from "@idle/data-schema";
import { describe, expect, test } from "vitest";
import { preview, type PreviewRequest } from "../src/preview.js";

const data = await loadGameData(table => readFileSync(new URL(`../../shared/data-schema/data/${table}.bytes`, import.meta.url)));
const project = JSON.parse(readFileSync(new URL("../../data/formulas.json", import.meta.url), "utf8"));
const request: PreviewRequest = { stageId: 3003, level: 10, seconds: 60, seed: 1 };

// 툴이 하는 것과 같이 run.mjs --preview에 요청을 표준 입력으로 주고 표준 출력을 읽는다.
function runPreview(body: unknown) {
  const run = spawnSync(process.execPath, [new URL("../run.mjs", import.meta.url).pathname, "--preview"], {
    input: JSON.stringify(body),
    encoding: "utf8",
  });
  return { status: run.status, stdout: run.stdout, stderr: run.stderr };
}

const withFormula = (key: string, expression: string) => ({
  ...project,
  formulas: project.formulas.map((f: { key: string }) => (f.key === key ? { ...f, expression } : f)),
});

describe("preview", () => {
  test("the same request gives the same battle and another seed another", () => {
    const result = preview(data, request);
    expect(preview(data, request)).toEqual(result);
    expect(preview(data, { ...request, seed: 2 })).not.toEqual(result);
  });

  test("totals add up over the skills and effects the battle used", () => {
    const { hero, skills, effects, progress } = preview(data, request);
    expect(hero.kills).toBeGreaterThan(0);
    expect(skills.reduce((sum, skill) => sum + skill.damage, 0)).toBe(hero.damage);
    expect(effects.filter(e => e.kind === "damage").reduce((sum, e) => sum + e.amount, 0)).toBeGreaterThanOrEqual(hero.dotDamage);
    expect(hero.dps).toBeCloseTo((hero.damage + hero.dotDamage) / 60);
    expect(progress.level).toBeGreaterThanOrEqual(10);
  });

  test("a hero below the stage's unlock level is previewed at that level", () => {
    expect(preview(data, { ...request, stageId: 3005, seconds: 1 }).progress).toMatchObject({ level: 10, stageId: 3005 });
  });

  test.each([
    [{ seconds: 0 }, "seconds must be an integer"],
    [{ seconds: 1.5 }, "seconds must be an integer"],
    [{ seed: -1 }, "seed must be a uint32"],
    [{ stageId: 999 }, "Stage 999 does not exist."],
    [{ level: 999 }, "Hero level 999 does not exist."],
  ])("rejects %o", (change, message) => {
    expect(() => preview(data, { ...request, ...change })).toThrow(message);
  });
});

describe("run.mjs --preview", () => {
  test("runs the request's formulas instead of the generated ones and answers with JSON", () => {
    const same = runPreview({ project, ...request });
    expect(same.status, same.stderr).toBe(0);
    expect(JSON.parse(same.stdout)).toEqual(preview(data, request));

    const stronger = runPreview({ project: withFormula("dotDamage", "floor(caster.attack * power * 10)"), ...request });
    expect(stronger.status, stronger.stderr).toBe(0);
    expect(JSON.parse(stronger.stdout).hero.dotDamage).toBeGreaterThan(5 * preview(data, request).hero.dotDamage);
  });

  test("a formula the export refuses fails with the reason on stderr", () => {
    const run = runPreview({ project: withFormula("dotDamage", "sqrt(caster.attack)"), ...request });
    expect(run.status).toBe(1);
    expect(run.stdout).toBe("");
    expect(run.stderr).toContain("Big 모드에서 쓸 수 없는 함수 'sqrt'");
  });

  test("a bad request fails with the reason on stderr", () => {
    const run = runPreview({ project, ...request, seconds: 0 });
    expect(run.status).toBe(1);
    expect(run.stderr).toContain("seconds must be an integer");
  });
});
