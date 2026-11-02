import { mkdir } from 'node:fs/promises';
import ExcelJS from 'exceljs';

// 컴파일러에 넣는 실행 가능한 입력 예제. 첫 번째와 두 번째 시트는 위치로 구분한다.
const workbook = new ExcelJS.Workbook();
const data = workbook.addWorksheet('Data');
data.addRows([
  ['id', 'name', 'price', 'enabled', 'tags', 'reward', 'note', 'weight'],
  [1, '체력 물약', 100, true, '["consumable","회복"]', '9007199254740993', null, 0.5],
  [2, '강철 검', 1250, true, '["weapon","melee"]', '9223372036854775807', '초급 장비', 3.25],
  [3, '마나 물약', 150, false, '[]', '-9223372036854775808', null, 0.3],
]);
const schema = workbook.addWorksheet('Schema');
schema.addRows([
  ['index', 'name', 'type', 'default', 'description'],
  [0, 'id', 'int', null, '아이템 ID'],
  [1, 'name', 'string', null, '표시 이름'],
  [2, 'price', 'uint', 0, '구매 가격'],
  [3, 'enabled', 'bool', true, '사용 가능 여부'],
  [4, 'tags', 'string[]', '[]', '검색 태그'],
  [5, 'reward', 'long', '0', '64비트 정수 예제: Excel 텍스트 셀'],
  [6, 'note', 'string?', null, '설명 (선택)'],
  [7, 'weight', 'float', 0, '무게'],
]);
for (const sheet of [data, schema]) {
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: sheet.rowCount, column: sheet.columnCount } };
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF203864' } };
  sheet.getRow(1).height = 24;
  sheet.columns.forEach((column) => { column.width = 22; });
}
schema.getColumn(5).width = 46;
data.getColumn(5).width = 30;
data.getColumn(6).width = 26;
data.getColumn(6).numFmt = '@';
await mkdir('sheets', { recursive: true });
await workbook.xlsx.writeFile('sheets/Items.xlsx');
console.log('Created sheets/Items.xlsx');
