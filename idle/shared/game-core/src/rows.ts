/** 테이블에서 `id`의 행. 없으면 저장 데이터나 다른 행이 데이터에 없는 행을 가리킨 것이라 던진다. */
export function required<K, V>(table: ReadonlyMap<K, V>, id: K, what: string): V {
  const row = table.get(id);
  if (row === undefined) throw new Error(`Unknown ${what} ${String(id)}.`);
  return row;
}
