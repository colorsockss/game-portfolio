// 여러 테이블에 걸친 검사: Enums 테이블에서 Enum 정의를 읽고, ref 열이 가리키는 id가 대상 테이블에 있는지 본다.
// 한 행 안의 검사(enum, range, length, when)는 workbook.js가 읽으면서 한다.

/** Enum 정의를 담는 테이블의 이름. 이 테이블은 로더 대신 TS enum(Enums.ts)을 만든다. */
export const ENUMS_TABLE = 'Enums';

const ENUM_ID = /^([A-Z][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)$/;

// Enums 테이블의 행(id `Enum.Member`, 정수 Enum은 value, 문자열 Enum은 text)을 Enum 이름 → 정의로 모은다.
export function readEnums({ fields, rows, cell }, violations) {
  const type = (name) => fields.find((field) => field.name === name);
  const fits = (name, bases) => !type(name) || (bases.includes(type(name).base) && !type(name).array);
  if (type('id')?.base !== 'string' || !fits('value', ['int', 'uint']) || !fits('text', ['string'])) {
    throw new Error(`${ENUMS_TABLE} needs a string id, an int value and a string text field`);
  }
  const enums = new Map();
  rows.forEach((row, i) => {
    const match = ENUM_ID.exec(row.id);
    if (!match) return violations.push(`${cell('id', i)} (id): '${row.id}' must look like EnumName.Member`);
    const [, name, member] = match;
    const value = row.value ?? null;
    const text = row.text ?? null;
    if ((value === null) === (text === null)) return violations.push(`${cell('id', i)} (${row.id}): fill exactly one of value (int enum) or text (string enum)`);
    const kind = value === null ? 'string' : 'number';
    if (!enums.has(name)) enums.set(name, { kind, members: new Map(), values: new Set(), list: [] });
    const definition = enums.get(name);
    if (definition.kind !== kind) return violations.push(`${cell('id', i)} (${row.id}): ${name} mixes int and string members`);
    const v = value ?? text;
    if (definition.values.has(v)) return violations.push(`${cell(kind === 'number' ? 'value' : 'text', i)} (${row.id}): ${name} already has the value ${JSON.stringify(v)}`);
    definition.members.set(member, v);
    definition.values.add(v);
    definition.list.push({ name: member, value: v, description: row.description ?? '' });
  });
  return enums;
}

// tables: { table, file, workbook }[]. ref 열의 값(배열이면 원소마다)이 대상 테이블의 id인지 본다. null은 건너뛴다.
export function checkReferences(tables, violations) {
  const byName = new Map(tables.map((entry) => [entry.table, entry]));
  const ids = new Map();
  for (const { file, workbook } of tables) {
    for (const field of workbook.fields.filter((f) => f.ref !== undefined)) {
      const target = byName.get(field.ref);
      if (!target) throw new Error(`${file}: field '${field.name}' refers to table '${field.ref}', which is not among the converted workbooks; convert the folder`);
      if (!target.workbook.fields.some((f) => f.name === 'id')) throw new Error(`${file}: field '${field.name}' refers to '${field.ref}', which has no id field`);
      // long id는 bigint라서 글자로 비교한다.
      if (!ids.has(field.ref)) ids.set(field.ref, new Set(target.workbook.rows.map((row) => String(row.id))));
      const known = ids.get(field.ref);
      workbook.rows.forEach((row, i) => {
        const value = row[field.name];
        if (value === null) return;
        (field.array ? value : [value]).forEach((v, j) => {
          if (known.has(String(v))) return;
          violations.push(`${file}: ${workbook.cell(field.name, i)} (${field.name}${field.array ? `[${j}]` : ''}): ${typeof v === 'string' ? JSON.stringify(v) : v} is not an id in ${field.ref}`);
        });
      });
    }
  }
}
