import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';

export async function ensureDataDir(): Promise<string> {
  const dataDir = path.resolve(config.data.dir);
  await fs.mkdir(dataDir, { recursive: true });
  return dataDir;
}

export function resolveDataPath(fileName: string): string {
  return path.resolve(config.data.dir, fileName);
}
