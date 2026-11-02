// 시뮬레이션 결과를 CSV와 터미널 표로 낸다. 열은 시각, 접속 여부, 레벨, 환생(횟수/포인트), 장비가 아닌 아이템(Items.id 순서, 이름이
// 머리글)의 보유량, 스테이지, 영웅 능력치, 전투력, 강화 단계(StatUpgrades ID 순서, `/`로 이음), 장착한 스킬의 레벨(슬롯 순서),
// 입은 장비(강화 단계)다. 능력치 열 이름은 Formula Lab의 스탯 key와 같다.
import { Big } from "@idle/big-number";
import { ItemKind, type GameData, type ItemsRow } from "@idle/data-schema";
import type { EquipmentInstance } from "@idle/game-core";
import type { Sample } from "./simulate.js";

function columns(samples: readonly Sample[], data: GameData): { header: string[]; rows: string[][] } {
  const held = [...data.items.values()].filter(row => row.kind !== ItemKind.Equipment).sort((a, b) => a.id - b.id);
  // 개발자가 보는 표라서 기본 언어(Strings의 ko)로 쓴다.
  const text = (row: ItemsRow) => data.strings.get(row.nameKey)?.ko ?? String(row.id);
  const name = ({ itemId, enhance }: EquipmentInstance) => {
    const row = data.items.get(itemId);
    return `${row ? text(row) : String(itemId)}${enhance === 0 ? "" : ` +${enhance}`}`;
  };
  // shortcut: 수는 double로 찍으므로 1.8e308을 넘는 보유량은 Infinity가 된다. 그만큼 자라면 Big 표기로 바꾼다.
  const number = (value: Big) => String(Big.toNumber(value));
  return {
    header: ["hour", "online", "level", "rebirth", ...held.map(text), "stage", "attack", "defense", "maxHp", "power", "upgrades", "skills", "equipped"],
    rows: samples.map(s => [
      String(s.hour),
      s.online ? "on" : "off",
      String(s.level),
      `${s.rebirth.count}/${s.rebirth.points}`,
      ...held.map(row => number(s.items[row.id] ?? Big.ZERO)),
      String(s.stageId),
      number(s.stats.attack),
      number(s.stats.defense),
      number(s.stats.maxHp),
      String(s.power),
      s.upgrades.join("/"),
      s.skillLevels.join("/"),
      s.equipped.map(name).join(" / "),
    ]),
  };
}

export function toCsv(samples: readonly Sample[], data: GameData): string {
  const { header, rows } = columns(samples, data);
  const field = (value: string) => (/[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value);
  return [header, ...rows].map(row => row.map(field).join(",")).join("\n") + "\n";
}

/** 칸을 맞춘 표. 마지막 열(장비)만 왼쪽 정렬이고 나머지는 오른쪽 정렬이다. */
export function toTable(samples: readonly Sample[], data: GameData): string {
  const { header, rows } = columns(samples, data);
  const all = [header, ...rows];
  const widths = header.map((_, i) => Math.max(...all.map(row => width(row[i]))));
  const line = (row: string[]) =>
    row.map((cell, i) => (i === row.length - 1 ? cell : " ".repeat(widths[i] - width(cell)) + cell)).join("  ").trimEnd();
  return all.map(line).join("\n") + "\n";
}

// 한글은 터미널에서 두 칸을 차지한다.
function width(text: string): number {
  let cells = 0;
  for (const char of text) cells += char.codePointAt(0)! >= 0x1100 ? 2 : 1;
  return cells;
}
