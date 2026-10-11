import Database from './sqlite.js';
export declare const clearLocalLearningData: (db: Database) => {
    deletedRows: number;
};
export declare const removeDatabaseSidecars: (databasePath: string) => void;
