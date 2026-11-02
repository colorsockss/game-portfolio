export const GENERATED_HEADER = '// sheet-baker가 자동 생성한 파일. 직접 수정하지 마세요.';

const primitiveTypes = { int: 'number', uint: 'number', long: 'bigint', float: 'number', double: 'number', bool: 'boolean', string: 'string', big: 'Big' };
const quote = (value) => JSON.stringify(value);
// when이 있는 열은 조건이 맞지 않는 행에서 null이다. keyType은 문자열 id 테이블의 키 타입이다(index.js가 붙인다).
const tsType = (field) => (field.enum ?? field.keyType ?? primitiveTypes[field.base]) + (field.array ? '[]' : '') + (field.nullable || field.when ? ' | null' : '');
const comment = (text) => text.replace(/[\r\n\u2028\u2029]+/g, ' ');

// 문자열로 저장된 열을 값으로 바꾸는 식. JSON은 int64 값을 십진 문자열로 저장하고(MessagePack은 이미
// bigint로 디코딩한다), big은 두 형식 모두 십진 문자열이다.
function fromText(value, field) {
  const [one, each] = field.base === 'long' ? ['BigInt', 'BigInt'] : ['Big.parse', '(text) => Big.parse(text)'];
  const converted = field.array ? `(${value} as string[]).map(${each})` : `${one}(${value} as string)`;
  return field.nullable ? `${value} === null ? null : ${converted}` : converted;
}

function jsonValue(field) {
  const value = `row[${quote(field.name)}]`;
  return field.base === 'long' || field.base === 'big' ? fromText(value, field) : `${value} as ${tsType(field)}`;
}

function messagePackValue(field) {
  const value = `row[${field.index}]`;
  return field.base === 'big' ? fromText(value, field) : `${value} as ${tsType(field)}`;
}

// target: 'node'는 JSON·파일 로더를 더하고, 'puerts'는 UTF-8 폴리필을 먼저 설치하며,
// 'portable'은 호스트 API를 전혀 쓰지 않는다.
// id가 없는 테이블(키-값 시트)은 행이 하나라서 로더가 Map 대신 그 행을 돌려준다. keys는 문자열 id 테이블의 id 목록이고,
// 그 id들의 리터럴 유니온(`<Table>Id`)을 내보내 코드가 쓰는 키도 타입 검사가 잡는다.
export function generateTypeScript(table, fields, target, { bigModule, keys } = {}) {
  const node = target === 'node';
  const big = fields.some((field) => field.base === 'big');
  if (big && !bigModule) throw new Error('big columns need --big-module <specifier> (the module that exports Big)');
  const enums = [...new Set(fields.filter((field) => field.enum).map((field) => field.enum))].sort();
  const keyTypes = [...new Set(fields.filter((field) => field.keyType && field.ref && field.ref !== table).map((field) => field.ref))].sort();
  const key = fields.find((field) => field.name === 'id');
  const mapType = key ? `Map<${tsType(key)}, ${table}Row>` : `${table}Row`;
  const record = (value, indent) => `const record: ${table}Row = {
${fields.map((field) => `${indent}  ${quote(field.name)}: ${value(field)},`).join('\n')}
${indent}};`;
  const body = (rows, value) => key ? `  const result = new ${mapType}();
  for (const row of ${rows}) {
    ${record(value, '    ')}
    result.set(record.id, record);
  }
  return result;` : `  const [row] = ${rows};
  ${record(value, '  ')}
  return record;`;
  return `${GENERATED_HEADER}
// sheet-baker가 검증하고 정규화한 데이터를 읽는다. 데이터와 코드는 함께 다시 생성한다.
${node ? "import { readFile } from 'node:fs/promises';\n" : ''}${big ? `import { Big } from '${bigModule}';\n` : ''}${enums.length ? `import type { ${enums.join(', ')} } from './Enums.js';\n` : ''}${keyTypes.map((ref) => `import type { ${ref}Id } from './${ref}.js';\n`).join('')}import { readMessagePack } from './runtime/${target === 'puerts' ? 'puerts' : 'messagepack'}.js';
${keys ? `\n// 이 테이블의 id. 키를 쓰는 코드와 이 테이블을 가리키는 열의 타입이라, 없는 키는 타입 검사가 잡는다.\nexport type ${table}Id =${keys.length ? keys.map((id) => `\n  | ${quote(id)}`).join('') : ' never'};\n` : ''}
export interface ${table}Row {
${fields.map((field) => `  // 인덱스 ${field.index}${field.description ? ': ' + comment(field.description) : ''}\n  ${quote(field.name)}: ${tsType(field)};`).join('\n')}
}
${node ? `
export async function deserialize${table}Json(json: string): Promise<${mapType}> {
  const rows = JSON.parse(json) as Record<string, unknown>[];
${body('rows', jsonValue)}
}
` : ''}
export async function deserialize${table}MessagePack(bytes: Uint8Array | ArrayBuffer): Promise<${mapType}> {
${body('readMessagePack(bytes)', messagePackValue)}
}
${node ? `
export async function load${table}Json(path: string): Promise<${mapType}> {
  return deserialize${table}Json(await readFile(path, 'utf8'));
}

export async function load${table}MessagePack(path: string): Promise<${mapType}> {
  return deserialize${table}MessagePack(await readFile(path));
}
` : ''}`;
}

// Enums 테이블의 정의(checks.js의 readEnums). 멤버는 시트 순서, Enum은 처음 나온 순서다.
export function generateEnums(enums) {
  return `${GENERATED_HEADER}
// Enums 테이블에서 만든 TS enum. 이 Enum을 쓰는 열(스키마의 enum)은 변환할 때 값이 멤버인지 검사한다.
${[...enums].map(([name, { list }]) => `
export enum ${name} {
${list.map((member) => `${member.description ? `  // ${comment(member.description)}\n` : ''}  ${member.name} = ${JSON.stringify(member.value)},`).join('\n')}
}
`).join('')}`;
}
