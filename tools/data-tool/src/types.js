const aliases = { int32: 'int', uint32: 'uint', int64: 'long', float32: 'float', float64: 'double', boolean: 'bool' };
const primitives = new Set(['int', 'uint', 'long', 'float', 'double', 'bool', 'string', 'big']);
// big은 십진 문자열로 저장한다. 지수부는 따로 캡처해 안전 정수인지 본다(Big.parse가 같은 규칙으로 읽는다).
const BIG_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE]([+-]?\d+))?$/;
export const MAX_INDEX = 4095;

export function parseType(value, location) {
  const match = /^(\w+)(\[\])?(\?)?$/.exec(String(value).trim());
  const base = match && (aliases[match[1]] ?? match[1]);
  if (!primitives.has(base)) throw new Error(`${location}: unsupported type '${value}'`);
  const array = Boolean(match[2]);
  const nullable = Boolean(match[3]);
  return { base, array, nullable, type: base + (array ? '[]' : '') + (nullable ? '?' : '') };
}

export function isBlank(value) {
  return value === null || value === undefined || value === '';
}

export function parseValue(value, type, location) {
  const fail = (message) => { throw new Error(`${location}: ${message} (expected ${type.type})`); };
  if (value === null) {
    if (type.nullable) return null;
    fail('null is not allowed');
  }
  if (type.array) {
    let values = value;
    if (typeof values === 'string') {
      try { values = JSON.parse(values); } catch { fail('array must be valid JSON'); }
    }
    if (!Array.isArray(values)) fail('array must be a JSON array');
    const element = { base: type.base, array: false, nullable: false, type: type.base };
    return values.map((v, i) => {
      // JSON 배열 안의 문자열은 이미 이스케이프가 풀려 있어 Excel의 빈 문자열 표시를 적용하지 않는다.
      if (type.base === 'string' && typeof v === 'string') return v;
      return parseValue(v, element, `${location}[${i}]`);
    });
  }
  switch (type.base) {
    case 'string':
      if (typeof value !== 'string') fail('use an Excel text cell for strings');
      return value === '""' ? '' : value;
    case 'bool':
      if (value === true || value === 1 || (typeof value === 'string' && /^(true|1)$/i.test(value.trim()))) return true;
      if (value === false || value === 0 || (typeof value === 'string' && /^(false|0)$/i.test(value.trim()))) return false;
      fail('boolean must be true, false, 1 or 0');
      break;
    case 'long': {
      if (typeof value === 'number' && !Number.isInteger(value)) fail('number must be an integer');
      if (typeof value === 'number' && !Number.isSafeInteger(value)) fail('unsafe integer; store long values as Excel text');
      if (!(typeof value === 'number' || (typeof value === 'string' && /^[+-]?\d+$/.test(value.trim())))) fail('invalid integer');
      const n = BigInt(value);
      if (n < -(1n << 63n) || n > (1n << 63n) - 1n) fail('integer is outside the signed 64-bit range');
      return n;
    }
    case 'big': {
      // 숫자 셀의 String(n)은 지수 표기까지 위 형식을 따른다.
      const text = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : '';
      const match = BIG_PATTERN.exec(text);
      if (!match) fail('invalid decimal number');
      if (match[1] !== undefined && !Number.isSafeInteger(Number(match[1]))) fail('exponent is too large');
      return text;
    }
    default: {
      if (typeof value !== 'number' && !(typeof value === 'string' && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()))) fail('invalid number');
      let n = Number(value);
      if (!Number.isFinite(n)) fail('number must be finite');
      if ((type.base === 'int' || type.base === 'uint') && !Number.isInteger(n)) fail('number must be an integer');
      if (type.base === 'int' && (n < -2147483648 || n > 2147483647)) fail('integer is outside the signed 32-bit range');
      if (type.base === 'uint' && (n < 0 || n > 4294967295)) fail('integer is outside the unsigned 32-bit range');
      if (type.base === 'float') {
        n = Math.fround(n);
        if (!Number.isFinite(n)) fail('number is outside the float32 range');
      }
      // JSON과 간결한 MessagePack은 음의 0을 0으로 인코딩한다.
      return Object.is(n, -0) ? 0 : n;
    }
  }
}

export function stringify(value, space = 2) {
  return JSON.stringify(value, (_key, v) => typeof v === 'bigint' ? v.toString() : v, space);
}

export function validateName(name, what = 'field') {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) || ['__proto__', 'prototype', 'constructor'].includes(name)) {
    throw new Error(`Invalid ${what} name '${name}': use an ASCII identifier`);
  }
}

export function validateTableName(table) {
  if (!/^[A-Z][A-Za-z0-9_]*$/.test(table)) throw new Error(`Invalid table name '${table}': use PascalCase ASCII (for example Items)`);
}

// 열의 값 범위 `최소..최대`(양 끝 포함, 한쪽은 비울 수 있다). 예: `0..`, `0..1`, `..100`.
export function parseRange(value, location) {
  const number = '[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?';
  const match = new RegExp(`^(${number})?\\.\\.(${number})?$`).exec(String(value).trim());
  if (!match || (match[1] === undefined && match[2] === undefined)) throw new Error(`${location}: range must look like 0.., 0..1 or ..100`);
  const [min, max] = [match[1], match[2]].map((end) => end === undefined ? undefined : Number(end));
  if (min !== undefined && max !== undefined && min > max) throw new Error(`${location}: range minimum is above its maximum`);
  return { min, max };
}

// rowNumbers에는 레코드별 Excel 행 번호가 들어 있어, 오류가 빈 행을 건너뛴 순서가 아니라 시트의 행을 가리킨다.
// id가 없는 테이블은 키-값 시트라 행이 하나다(로더가 Map 대신 그 행을 돌려준다. 두 시트 테이블은 workbook.js가 id를 요구한다).
export function validateMapKey(fields, rows, rowNumbers, sheet) {
  const key = fields.find((field) => field.name === 'id');
  if (!key) return;
  if (key.array || key.nullable || key.when || !['int', 'uint', 'long', 'string'].includes(key.base)) {
    throw new Error("Map key 'id' must be a non-nullable int, uint, long or string field");
  }
  const seen = new Map();
  for (const [i, row] of rows.entries()) {
    if (seen.has(row.id)) throw new Error(`Duplicate id '${row.id}' in ${sheet} rows ${seen.get(row.id)} and ${rowNumbers[i]}`);
    seen.set(row.id, rowNumbers[i]);
  }
}
