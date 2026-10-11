import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite';

/**
 * The mirror's SQLite connection, on Node's built-in `node:sqlite`.
 *
 * A native SQLite addon is compiled for one Node ABI, so it cannot load in a host
 * running a different runtime — Electron's embedded Node included — while the
 * built-in module ships with whichever Node runs the server. This wrapper keeps
 * the small call shape the repositories use: prepared statements, `exec`,
 * `pragma`, and `transaction(fn)()`.
 */

/** A prepared statement whose rows come back as ordinary objects. */
export class Statement {
  constructor(private readonly statement: StatementSync) {}

  /**
   * Run the statement and return its first row.
   * @param params - positional parameters.
   * @returns the first row, or `undefined` when there is none.
   */
  get(...params: unknown[]): unknown {
    const row = this.statement.get(...(params as SQLInputValue[]));
    // `node:sqlite` builds rows without a prototype; a plain copy behaves like
    // any other object under comparison, spreading, and serialization.
    return row === undefined ? undefined : { ...row };
  }

  /**
   * Run the statement and return every row.
   * @param params - positional parameters.
   * @returns the rows, each as an ordinary object.
   */
  all(...params: unknown[]): unknown[] {
    return this.statement.all(...(params as SQLInputValue[])).map((row) => ({ ...row }));
  }

  /**
   * Run a statement that returns no rows.
   * @param params - positional parameters.
   * @returns how many rows changed, and the last inserted rowid.
   */
  run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint } {
    const outcome = this.statement.run(...(params as SQLInputValue[]));
    return { changes: Number(outcome.changes), lastInsertRowid: outcome.lastInsertRowid };
  }
}

export default class Database {
  private readonly connection: DatabaseSync;
  /** Monotonic counter that gives every savepoint a distinct name. */
  private savepoints = 0;

  /**
   * Open a database file, or an in-memory database for `':memory:'`.
   * @param path - the database location.
   * @param options - `readOnly` opens the file without write access.
   */
  constructor(path: string, options: { readOnly?: boolean } = {}) {
    this.connection = new DatabaseSync(path, { readOnly: options.readOnly === true });
  }

  /**
   * Compile one SQL statement.
   * @param sql - the statement text.
   * @returns the prepared statement.
   */
  prepare(sql: string): Statement {
    return new Statement(this.connection.prepare(sql));
  }

  /**
   * Run one or more SQL statements that return no rows.
   * @param sql - the statements.
   */
  exec(sql: string): void {
    this.connection.exec(sql);
  }

  /**
   * Run a `PRAGMA` and return whatever rows it produces.
   * @param source - the pragma body, such as `foreign_keys = ON` or `table_info(t)`.
   * @param options - `simple` returns only the first column of the first row.
   * @returns the pragma's rows (setting a pragma usually returns none), or the
   * single value when `simple` is set.
   */
  pragma(source: string, options: { simple?: boolean } = {}): unknown {
    const rows = this.prepare(`PRAGMA ${source}`).all() as Record<string, unknown>[];
    if (options.simple !== true) return rows;
    const first = rows[0];
    return first === undefined ? undefined : Object.values(first)[0];
  }

  /**
   * Wrap a function so each call runs atomically.
   *
   * Every call opens a savepoint: outermost it begins a transaction, nested it
   * becomes a sub-transaction, so a failure rolls back only its own changes and
   * rethrows. A `PRAGMA foreign_keys` change is ignored inside a transaction, so
   * callers toggle it outside.
   * @param run - the work to make atomic.
   * @returns a function that runs `run` inside a savepoint and returns its result.
   */
  transaction<T>(run: () => T): () => T {
    return () => {
      this.savepoints += 1;
      const name = `momo_tx_${this.savepoints}`;
      this.connection.exec(`SAVEPOINT ${name}`);
      try {
        const result = run();
        this.connection.exec(`RELEASE ${name}`);
        return result;
      } catch (error) {
        this.connection.exec(`ROLLBACK TO ${name}`);
        this.connection.exec(`RELEASE ${name}`);
        throw error;
      }
    };
  }

  /** Close the connection. */
  close(): void {
    this.connection.close();
  }
}
