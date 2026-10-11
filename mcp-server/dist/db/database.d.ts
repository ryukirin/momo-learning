import Database from './sqlite.js';
export declare const defaultDatabasePath: () => string;
export declare const openDatabase: (path?: string) => Database;
