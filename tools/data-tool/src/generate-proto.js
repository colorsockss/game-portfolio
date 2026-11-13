// proto 출력의 스키마. 워크북마다 `.proto` 하나를 낸다: id가 있는 테이블은 행 메시지 `<Table>Row`와 목록 메시지 `<Table>`
// (`repeated <Table>Row rows = 1`), 키-값 시트는 메시지 `<Table>` 하나, Enums 워크북은 proto enum들이다.
// 필드 번호는 스키마의 index + 1이라, index를 바꾸지 않으면 열을 더하고 지워도 옛 데이터와 코드가 서로 읽힌다.
import { ENUMS_TABLE } from './checks.js';

const HEADER = '// 자동 생성된 파일 — 직접 수정하지 마세요. data-tool이 워크북에서 만듭니다.\n';
const SCALARS = { int: 'sint32', uint: 'uint32', long: 'sint64', float: 'float', double: 'double', bool: 'bool', string: 'string' };

/** null이 될 수 있는 필드(`?`, when). proto3의 optional이라 값이 기본값이어도 실린다. */
export const isOptional = (field) => field.nullable || Boolean(field.when);

// camelCase → snake_case. protoc가 C#에서는 PascalCase, C++에서는 그대로 쓴다.
const snake = (name) => name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/([A-Z])([A-Z][a-z])/g, '$1_$2').toLowerCase();
const upperSnake = (name) => snake(name).toUpperCase();

function comment(text, indent) {
  const lines = String(text ?? '').split(/\r?\n/).filter((line) => line.trim());
  return lines.map((line) => `${indent}// ${line.trim()}\n`).join('');
}

function options({ protoPackage, csharpNamespace }) {
  if (!protoPackage || !csharpNamespace) throw new Error('proto output needs protoPackage and csharpNamespace');
  return `package ${protoPackage};\n\noption csharp_namespace = "${csharpNamespace}";\n`;
}

// proto 출력이 받을 수 없는 열을 쓰기 전에 막는다.
export function checkProtoFields(table, fields, enums) {
  for (const field of fields) {
    const where = `${table} field '${field.name}'`;
    if (field.base === 'big') throw new Error(`${where}: big columns have no proto type; use double or long`);
    if (field.array && field.nullable) throw new Error(`${where}: nullable arrays have no proto type; use an empty array`);
    if (field.array && field.when) throw new Error(`${where}: arrays with when have no proto type`);
    if (field.enum && enums.get(field.enum).kind === 'string') throw new Error(`${where}: string enums have no proto type; use an int enum`);
  }
}

function fieldLine(field) {
  const type = field.enum ?? SCALARS[field.base];
  const label = field.array ? 'repeated ' : isOptional(field) ? 'optional ' : '';
  return `${comment(field.description, '  ')}  ${label}${type} ${snake(field.name)} = ${field.index + 1};\n`;
}

/** 테이블 하나의 `.proto`. keyValue면 행 메시지 대신 메시지 하나다. */
export function generateProto(table, fields, { keyValue, ...names }) {
  const imports = fields.some((field) => field.enum) ? `import "${ENUMS_TABLE}.proto";\n\n` : '';
  const body = fields.map(fieldLine).join('');
  const messages = keyValue
    ? `message ${table} {\n${body}}\n`
    : `message ${table}Row {\n${body}}\n\nmessage ${table} {\n  repeated ${table}Row rows = 1;\n}\n`;
  return `${HEADER}syntax = "proto3";\n\n${options(names)}\n${imports}${messages}`;
}

/** Enums 워크북의 `.proto`. 멤버 이름은 Enum 이름을 앞에 붙인 UPPER_SNAKE이고(C#은 앞을 떼고 씀), 0인 멤버가 처음에 온다. */
export function generateProtoEnums(enums, names) {
  const blocks = [];
  for (const [name, { kind, list }] of enums) {
    if (kind === 'string') throw new Error(`${ENUMS_TABLE}: string enum '${name}' has no proto type; use int values`);
    const zero = list.find((member) => member.value === 0);
    if (!zero) throw new Error(`${ENUMS_TABLE}: enum '${name}' needs a member with value 0 (proto3 enums start at 0)`);
    const members = [zero, ...list.filter((member) => member !== zero)];
    const lines = members.map((member) => `${comment(member.description, '  ')}  ${upperSnake(name)}_${upperSnake(member.name)} = ${member.value};\n`);
    blocks.push(`enum ${name} {\n${lines.join('')}}\n`);
  }
  return `${HEADER}syntax = "proto3";\n\n${options(names)}\n${blocks.join('\n')}`;
}
