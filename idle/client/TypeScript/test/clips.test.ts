import { existsSync, readFileSync } from "node:fs";
import { loadGameData } from "@idle/data-schema";
import { expect, test } from "vitest";

const data = await loadGameData(table => readFileSync(new URL(`../../../shared/data-schema/data/${table}.bytes`, import.meta.url)));
const clips = (name: string) => new URL(`../../Assets/Battle/Clips/${name}.asset`, import.meta.url);

// 배우와 발사체는 없는 클립 이름이면 그리지 못하므로, 테이블이 고른 묶음과 클립이 있는지는 여기서 본다.
test("every actor's clips and every projectile's clip exist in the battle clip assets", () => {
  const actors = [...data.heroes.values(), ...data.monsters.values(), ...data.summons.values()];
  for (const row of actors) {
    if (row.clips !== null) expect(existsSync(clips(row.clips)), `${row.id} ${row.clips}`).toBe(true);
  }
  const projectiles = readFileSync(clips("projectiles"), "utf8");
  for (const row of data.projectiles.values()) expect(projectiles, `${row.id} ${row.clip}`).toContain(`- Name: ${row.clip}\n`);
});
