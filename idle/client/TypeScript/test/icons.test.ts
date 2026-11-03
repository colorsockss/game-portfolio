import { existsSync, readFileSync } from "node:fs";
import { loadGameData } from "@idle/data-schema";
import { expect, test } from "vitest";

const data = await loadGameData(table => readFileSync(new URL(`../../../shared/data-schema/data/${table}.bytes`, import.meta.url)));

// IconView는 없는 이름이면 숨기만 하므로, 테이블이 고른 아이콘에 그림이 있는지는 여기서 본다.
test("every item's icon has its picture in the UI icon folder", () => {
  for (const row of data.items.values()) {
    expect(existsSync(new URL(`../../Assets/UI/Sprites/Icons/${row.icon}.png`, import.meta.url)), `${row.id} ${row.icon}`).toBe(true);
  }
});

test("every skill's icon has its picture in the UI icon folder", () => {
  for (const row of data.skills.values()) {
    if (row.icon === null) continue;
    expect(existsSync(new URL(`../../Assets/UI/Sprites/Icons/${row.icon}.png`, import.meta.url)), `${row.id} ${row.icon}`).toBe(true);
  }
});
