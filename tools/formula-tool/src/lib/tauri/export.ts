import { invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';

export function writeTextFile(path: string, contents: string): Promise<void> {
  return invoke<void>('write_text_file', { path, contents });
}

export async function pickTsExportPath(defaultName: string): Promise<string | null> {
  const path = await save({
    defaultPath: `${defaultName}.ts`,
    filters: [{ name: 'TypeScript', extensions: ['ts'] }],
  });
  if (path === null) return null;
  return path.toLowerCase().endsWith('.ts') ? path : `${path}.ts`;
}
