import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import Database from './sqlite.js';
import { config } from '../config.js';
import { migrate } from './migrations.js';

export const defaultDatabasePath = (): string => {
  const root =
    process.env.LOCALAPPDATA ?? join(process.env.USERPROFILE ?? process.cwd(), 'AppData', 'Local');
  return join(root, config.dataDirectoryName, 'learning.sqlite');
};

export const openDatabase = (path = defaultDatabasePath()): Database => {
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  migrate(db);
  return db;
};
