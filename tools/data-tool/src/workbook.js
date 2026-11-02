import ExcelJS from 'exceljs';
import { MAX_INDEX, isBlank, parseRange, parseType, parseValue, validateName, validateTableName } from './types.js';

const SCHEMA_HEADERS = ['index', 'name', 'type', 'default', 'description', 'ref', 'enum', 'range', 'length', 'when'];
// 키-값 시트는 스키마 행마다 그 필드의 값(value)을 적는다. 값이 행에 있으므로 default가 없고, 행이 하나라 when도 없다.
const KEY_VALUE_HEADERS = ['index', 'name', 'type', 'value', 'description', 'ref', 'enum', 'range', 'length'];
const NUMERIC = new Set(['int', 'uint', 'long', 'float', 'double', 'big']);

function location(sheet, row, column) {
  return `${sheet.name}!${sheet.getCell(row, column).address}`;
}

function cellValue(sheet, row, column) {
  const cell = sheet.getCell(row, column);
  let value = cell.value;
  if (value && typeof value === 'object' && ('formula' in value || 'sharedFormula' in value)) {
    if (value.result === undefined || value.result === null) throw new Error(`${location(sheet, row, column)}: formula has no cached result; recalculate and save in Excel`);
    value = value.result;
  }
  // 하이퍼링크의 표시 텍스트도 서식 있는 텍스트일 수 있다.
  if (value && typeof value === 'object' && 'hyperlink' in value) value = value.text;
  if (value && typeof value === 'object') {
    if ('richText' in value) return value.richText.map((part) => part.text).join('');
    throw new Error(`${location(sheet, row, column)}: unsupported cell value (date or Excel error); use a typed value or text`);
  }
  return value;
}

function headers(sheet) {
  if (sheet.hasMerges) throw new Error(`${sheet.name}: merged cells are not supported`);
  const result = new Map();
  const width = sheet.columnCount;
  for (let column = 1; column <= width; column++) {
    const raw = cellValue(sheet, 1, column);
    if (isBlank(raw)) continue;
    if (typeof raw !== 'string') throw new Error(`${location(sheet, 1, column)}: header must be text`);
    const name = raw.trim();
    if (!name) continue;
    if (result.has(name)) throw new Error(`${location(sheet, 1, column)}: duplicate header '${name}'`);
    result.set(name, column);
  }
  return result;
}

function rowValues(sheet, row, width) {
  const values = [];
  for (let column = 1; column <= width; column++) values[column] = cellValue(sheet, row, column);
  return values;
}

function checkUnheadedCells(sheet, row, values, headerMap) {
  const columns = new Set(headerMap.values());
  for (let column = 1; column < values.length; column++) {
    if (!isBlank(values[column]) && !columns.has(column)) throw new Error(`${location(sheet, row, column)}: data has no column header`);
  }
}

// 검사 열(ref, enum, range, length, when)을 읽어 필드에 붙인다. 다른 필드를 가리키는 length·when은 모든 필드를
// 읽은 뒤에 푼다. enums는 Enums 테이블에서 읽은 정의다(checks.js).
function readRules(field, get, where, enums) {
  const text = (key) => isBlank(get(key)) ? undefined : String(get(key)).trim();
  const ref = text('ref');
  if (ref !== undefined) {
    try { validateTableName(ref); } catch (error) { throw new Error(`${where} ref: ${error.message}`, { cause: error }); }
    field.ref = ref;
  }
  const name = text('enum');
  if (name !== undefined) {
    const definition = enums?.get(name);
    if (!definition) throw new Error(`${where}: unknown enum '${name}'${enums ? '' : '; convert it together with the Enums workbook'}`);
    const fits = definition.kind === 'string' ? field.base === 'string' : field.base === 'int' || field.base === 'uint';
    if (!fits) throw new Error(`${where}: ${definition.kind} enum '${name}' does not fit type ${field.type}`);
    field.enum = name;
  }
  const range = text('range');
  if (range !== undefined) {
    if (!NUMERIC.has(field.base)) throw new Error(`${where}: range needs a numeric type, not ${field.type}`);
    field.range = parseRange(range, `${where} range`);
  }
  // length는 원소 수의 범위(`1..`)이거나, 길이가 같아야 하는 다른 배열 필드의 이름이다.
  const length = text('length');
  if (length !== undefined) {
    if (!field.array) throw new Error(`${where}: length needs an array type, not ${field.type}`);
    field.length = length.includes('..') ? { range: parseRange(length, `${where} length`) } : { field: length };
  }
  const when = text('when');
  if (when !== undefined) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/.exec(when);
    if (!match) throw new Error(`${where}: when must look like field=value`);
    field.when = { field: match[1], text: match[2].trim() };
  }
}

function resolveRules(fields, schemaName, enums) {
  const byName = new Map(fields.map((field) => [field.name, field]));
  for (const field of fields) {
    const where = `${schemaName} field '${field.name}'`;
    const paired = field.length?.field;
    if (paired !== undefined && (paired === field.name || !byName.get(paired)?.array)) throw new Error(`${where}: length must be a range like 1.. or name another array field, not '${paired}'`);
    if (!field.when) continue;
    const condition = byName.get(field.when.field);
    if (!condition || condition === field || condition.when || condition.array) throw new Error(`${where}: when must name another scalar field without its own when`);
    // 값은 `|`로 여럿을 적을 수 있다(kind=Damage|Heal). 그중 하나와 같은 행에만 이 열이 있다.
    field.when.values = field.when.text.split('|').map((text) => {
      const member = condition.enum && enums.get(condition.enum).members.get(text.trim());
      return member !== undefined && member !== null ? member : parseValue(text.trim(), { ...condition, nullable: false }, `${where} when`);
    });
  }
}

const outside = (n, { min, max }) => (min !== undefined && n < min) || (max !== undefined && n > max);
const show = ({ min, max }) => `${min ?? ''}..${max ?? ''}`;

// 행 하나의 검사(enum, range, length). 위반은 던지지 않고 모아서, 한 번에 모두 보여 준다.
function checkRow(record, fields, enums, at, violations) {
  for (const field of fields) {
    const value = record[field.name];
    if (value === null) continue;
    const values = field.array ? value : [value];
    const label = (i) => `${at(field)} (${field.name}${field.array ? `[${i}]` : ''})`;
    if (field.enum) {
      const { values: allowed } = enums.get(field.enum);
      values.forEach((v, i) => {
        if (!allowed.has(v)) violations.push(`${label(i)}: ${JSON.stringify(v)} is not in ${field.enum} (${[...allowed].map((a) => JSON.stringify(a)).join(', ')})`);
      });
    }
    if (field.range) {
      values.forEach((v, i) => {
        if (outside(Number(v), field.range)) violations.push(`${label(i)}: ${v} is outside the range ${show(field.range)}`);
      });
    }
    if (field.length?.range && outside(value.length, field.length.range)) {
      violations.push(`${at(field)} (${field.name}): has ${value.length} items, outside the length ${show(field.length.range)}`);
    }
    const other = field.length?.field && record[field.length.field];
    if (other && other.length !== value.length) violations.push(`${at(field)} (${field.name}): has ${value.length} items but ${field.length.field} has ${other.length}`);
  }
}

// 스키마 행(필드 하나)들을 읽는다. 키-값 시트는 같은 행에 값도 있어서, onRow가 행마다 그 셀을 읽는다.
function readFields(sheet, allowed, required, enums, onRow = () => {}) {
  const sheetHeaders = headers(sheet);
  for (const name of required) {
    if (!sheetHeaders.has(name)) throw new Error(`${sheet.name}: missing schema header '${name}'`);
  }
  for (const header of sheetHeaders.keys()) {
    if (!allowed.includes(header)) throw new Error(`${sheet.name}: unknown schema header '${header}'`);
  }
  const width = sheet.columnCount;
  const fields = [];
  const names = new Set();
  const indices = new Set();
  for (let row = 2; row <= sheet.rowCount; row++) {
    const values = rowValues(sheet, row, width);
    if (values.every(isBlank)) continue;
    checkUnheadedCells(sheet, row, values, sheetHeaders);
    const get = (key) => values[sheetHeaders.get(key)];
    const rawIndex = get('index');
    const index = Number(rawIndex);
    if (isBlank(rawIndex) || (typeof rawIndex !== 'number' && !(typeof rawIndex === 'string' && /^\d+$/.test(rawIndex))) || !Number.isInteger(index) || index < 0 || index > MAX_INDEX) {
      throw new Error(`${sheet.name}!row ${row}: index must be an integer from 0 to ${MAX_INDEX}`);
    }
    const name = String(get('name') ?? '').trim();
    validateName(name);
    if (indices.has(index)) throw new Error(`${sheet.name}!row ${row}: duplicate index ${index}`);
    if (names.has(name)) throw new Error(`${sheet.name}!row ${row}: duplicate field '${name}'`);
    const type = parseType(get('type'), `${sheet.name}!row ${row}`);
    const field = { index, name, ...type, description: String(get('description') ?? '') };
    if (!isBlank(get('default'))) field.default = parseValue(get('default'), type, `${sheet.name}!row ${row} default`);
    readRules(field, get, `${sheet.name}!row ${row}`, enums);
    onRow(field, get, row);
    names.add(name);
    indices.add(index);
    fields.push(field);
  }
  if (fields.length === 0) throw new Error(`${sheet.name}: schema contains no fields`);
  fields.sort((a, b) => a.index - b.index);
  resolveRules(fields, sheet.name, enums);
  return { fields, headers: sheetHeaders };
}

// 키-값 시트(시트가 하나인 워크북): 스키마 행 하나가 필드 하나이고 value 열이 그 값이라, 행 하나짜리 테이블이 된다.
// 상수를 더하면 행 하나가 는다. 값은 그 행의 type으로 읽고, 검사 열의 위반은 그 값 셀을 짚는다.
function readKeyValue(sheet, enums) {
  const cells = new Map();
  const { fields, headers: sheetHeaders } = readFields(sheet, KEY_VALUE_HEADERS, ['index', 'name', 'type', 'value'], enums,
    (field, get, row) => cells.set(field.name, { raw: get('value'), row }));
  // id가 있으면 Map 키로 읽히므로 키-값 시트에는 둘 수 없다.
  if (cells.has('id')) throw new Error(`${sheet.name}!row ${cells.get('id').row}: a key-value sheet cannot name a field 'id'`);
  const cell = (name) => location(sheet, cells.get(name).row, sheetHeaders.get('value'));
  const record = {};
  const indexed = Array(fields.at(-1).index + 1).fill(null);
  for (const field of fields) {
    const { raw } = cells.get(field.name);
    let value;
    if (!isBlank(raw)) value = parseValue(raw, field, `${cell(field.name)} (${field.name})`);
    else if (field.nullable) value = null;
    else throw new Error(`${cell(field.name)}: '${field.name}' is required`);
    record[field.name] = value;
    indexed[field.index] = value;
  }
  const violations = [];
  checkRow(record, fields, enums, (field) => cell(field.name), violations);
  return { fields, rows: [record], indexedRows: [indexed], cell, violations, sheets: { data: sheet.name, schema: sheet.name } };
}

// 시트가 둘 이상이면 첫 시트가 데이터, 둘째가 스키마이고 id가 있는 테이블이다. 시트가 하나면 키-값 시트다.
// cell(name, i)은 i번째 레코드의 그 필드 셀 위치이고, 테이블 사이의 검사(checks.js)가 위반을 짚을 때 쓴다.
export async function readWorkbook(filename, { enums } = {}) {
  const book = new ExcelJS.Workbook();
  await book.xlsx.readFile(filename);
  if (book.worksheets.length === 0) throw new Error('Workbook has no sheets');
  if (book.worksheets.length === 1) return readKeyValue(book.worksheets[0], enums);
  const [data, schema] = book.worksheets;
  const dataWidth = data.columnCount;
  const { fields } = readFields(schema, SCHEMA_HEADERS, ['index', 'name', 'type'], enums);
  const names = new Set(fields.map((field) => field.name));
  if (!names.has('id')) throw new Error(`${schema.name}: a table needs an 'id' field; write a single-row table as one key-value sheet (index, name, type, value)`);
  const dataHeaders = headers(data);
  for (const header of dataHeaders.keys()) {
    if (!names.has(header)) throw new Error(`${data.name}: column '${header}' is not in the schema`);
  }
  for (const field of fields) {
    if (!dataHeaders.has(field.name) && !field.nullable && !Object.hasOwn(field, 'default')) throw new Error(`${data.name}: missing required column '${field.name}'`);
  }
  const rows = [];
  const indexedRows = [];
  const rowNumbers = [];
  const violations = [];
  const columns = new Map([...dataHeaders].map(([name, column]) => [name, data.getColumn(column).letter]));
  const place = (name, row) => columns.has(name) ? `${data.name}!${columns.get(name)}${row}` : `${data.name}!row ${row}`;
  // when이 있는 필드는 조건 필드를 읽은 뒤에 읽는다. 레코드의 키는 인덱스 순서로 먼저 만들어 JSON 순서를 지킨다.
  const ordered = [...fields.filter((field) => !field.when), ...fields.filter((field) => field.when)];
  for (let row = 2; row <= data.rowCount; row++) {
    const values = rowValues(data, row, dataWidth);
    if (values.every(isBlank)) continue;
    checkUnheadedCells(data, row, values, dataHeaders);
    const record = Object.fromEntries(fields.map((field) => [field.name, null]));
    const indexed = Array(fields.at(-1).index + 1).fill(null);
    const at = (field) => place(field.name, row);
    for (const field of ordered) {
      const raw = values[dataHeaders.get(field.name)];
      const where = at(field);
      let value;
      if (field.when && !field.when.values.includes(record[field.when.field])) {
        // 조건이 맞지 않는 행에는 이 열이 없다.
        if (!isBlank(raw)) violations.push(`${where} (${field.name}): only rows with ${field.when.field}=${field.when.text} may fill this column`);
        value = null;
      } else if (isBlank(raw)) {
        if (Object.hasOwn(field, 'default')) value = structuredClone(field.default);
        else if (field.nullable) value = null;
        else throw new Error(`${where}: '${field.name}' is required${field.when ? ` when ${field.when.field}=${field.when.text}` : ''}`);
      } else value = parseValue(raw, field, `${where} (${field.name})`);
      record[field.name] = value;
      indexed[field.index] = value;
    }
    checkRow(record, fields, enums, at, violations);
    rows.push(record);
    indexedRows.push(indexed);
    rowNumbers.push(row);
  }
  const cell = (name, i) => place(name, rowNumbers[i]);
  return { fields, rows, indexedRows, rowNumbers, cell, violations, sheets: { data: data.name, schema: schema.name } };
}
