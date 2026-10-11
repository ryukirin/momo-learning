import { createRequire as __bundleCreateRequire } from 'node:module'; const require = __bundleCreateRequire(import.meta.url);

// src/migrate-legacy.ts
import { existsSync, mkdirSync as mkdirSync2, renameSync } from "node:fs";
import { dirname as dirname2, join as join2 } from "node:path";

// src/config.ts
var config = {
  apiBaseUrl: "https://open.maimemo.com",
  requestTimeoutMs: 1e4,
  maxAttempts: 2,
  localPageSizeMax: 50,
  supplementBatchMax: 50,
  upstreamCollectionMax: 1e3,
  previewMax: 50,
  credentialService: "momo-learning-mcp",
  /** Service names earlier releases stored the token under; read after the current one. */
  legacyCredentialServices: ["dsh.momo-learning-mcp", "codex.maimemo-learning-mcp"],
  credentialAccount: "default",
  /** Directory under the user's local app data that holds the mirror database. */
  dataDirectoryName: "MomoLearning",
  /** Directories earlier releases kept the mirror database in. */
  legacyDataDirectoryNames: ["CodexMomoLearning"]
};

// src/db/database.ts
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

// src/db/sqlite.ts
import { DatabaseSync } from "node:sqlite";
var Statement = class {
  constructor(statement) {
    this.statement = statement;
  }
  statement;
  /**
   * Run the statement and return its first row.
   * @param params - positional parameters.
   * @returns the first row, or `undefined` when there is none.
   */
  get(...params) {
    const row = this.statement.get(...params);
    return row === void 0 ? void 0 : { ...row };
  }
  /**
   * Run the statement and return every row.
   * @param params - positional parameters.
   * @returns the rows, each as an ordinary object.
   */
  all(...params) {
    return this.statement.all(...params).map((row) => ({ ...row }));
  }
  /**
   * Run a statement that returns no rows.
   * @param params - positional parameters.
   * @returns how many rows changed, and the last inserted rowid.
   */
  run(...params) {
    const outcome = this.statement.run(...params);
    return { changes: Number(outcome.changes), lastInsertRowid: outcome.lastInsertRowid };
  }
};
var Database = class {
  connection;
  /** Monotonic counter that gives every savepoint a distinct name. */
  savepoints = 0;
  /**
   * Open a database file, or an in-memory database for `':memory:'`.
   * @param path - the database location.
   * @param options - `readOnly` opens the file without write access.
   */
  constructor(path, options = {}) {
    this.connection = new DatabaseSync(path, { readOnly: options.readOnly === true });
  }
  /**
   * Compile one SQL statement.
   * @param sql - the statement text.
   * @returns the prepared statement.
   */
  prepare(sql) {
    return new Statement(this.connection.prepare(sql));
  }
  /**
   * Run one or more SQL statements that return no rows.
   * @param sql - the statements.
   */
  exec(sql) {
    this.connection.exec(sql);
  }
  /**
   * Run a `PRAGMA` and return whatever rows it produces.
   * @param source - the pragma body, such as `foreign_keys = ON` or `table_info(t)`.
   * @param options - `simple` returns only the first column of the first row.
   * @returns the pragma's rows (setting a pragma usually returns none), or the
   * single value when `simple` is set.
   */
  pragma(source, options = {}) {
    const rows = this.prepare(`PRAGMA ${source}`).all();
    if (options.simple !== true) return rows;
    const first = rows[0];
    return first === void 0 ? void 0 : Object.values(first)[0];
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
  transaction(run2) {
    return () => {
      this.savepoints += 1;
      const name = `momo_tx_${this.savepoints}`;
      this.connection.exec(`SAVEPOINT ${name}`);
      try {
        const result = run2();
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
  close() {
    this.connection.close();
  }
};

// src/db/migrations.ts
var schemaVersion = 6;
var schema = `
    CREATE TABLE IF NOT EXISTS schema_migration (version INTEGER PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS mirror_sync (
      id TEXT PRIMARY KEY,
      scope_type TEXT NOT NULL CHECK(scope_type IN ('today_snapshot', 'study_record_window')),
      scope_key TEXT NOT NULL,
      requested_local_date TEXT,
      upstream_date_semantics TEXT NOT NULL,
      source_limit INTEGER NOT NULL,
      retrieved_count INTEGER NOT NULL,
      known_total INTEGER,
      read_range TEXT NOT NULL,
      completeness TEXT NOT NULL CHECK(completeness IN ('complete', 'partial', 'unknown')),
      outcome TEXT NOT NULL CHECK(outcome IN ('success', 'empty', 'failed')),
      error_class TEXT,
      started_at TEXT NOT NULL,
      finished_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS mirror_word (
      word_id TEXT PRIMARY KEY,
      spelling TEXT NOT NULL,
      first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      plan_state TEXT NOT NULL DEFAULT 'current' CHECK(plan_state IN ('current', 'removed_from_current_plan')),
      plan_state_updated_at TEXT NOT NULL,
      latest_sync_id TEXT REFERENCES mirror_sync(id)
    );
    CREATE TABLE IF NOT EXISTS today_item (
      sync_id TEXT NOT NULL REFERENCES mirror_sync(id) ON DELETE CASCADE,
      word_id TEXT NOT NULL REFERENCES mirror_word(word_id),
      upstream_order INTEGER NOT NULL,
      is_new INTEGER,
      is_finished INTEGER,
      source_date TEXT NOT NULL,
      first_response TEXT,
      PRIMARY KEY(sync_id, word_id)
    );
    CREATE TABLE IF NOT EXISTS study_record (
      word_id TEXT PRIMARY KEY REFERENCES mirror_word(word_id),
      add_date TEXT,
      first_study_date TEXT,
      last_study_date TEXT,
      next_study_date TEXT,
      study_count INTEGER,
      tags TEXT,
      observed_at TEXT NOT NULL,
      latest_sync_id TEXT REFERENCES mirror_sync(id)
    );
    CREATE TABLE IF NOT EXISTS study_window_member (
      sync_id TEXT NOT NULL REFERENCES mirror_sync(id) ON DELETE CASCADE,
      word_id TEXT NOT NULL REFERENCES mirror_word(word_id),
      PRIMARY KEY(sync_id, word_id)
    );
    CREATE TABLE IF NOT EXISTS word_supplement (
      id TEXT PRIMARY KEY,
      word_id TEXT NOT NULL REFERENCES mirror_word(word_id),
      kind TEXT NOT NULL CHECK(kind IN ('interpretation', 'phrase', 'note')),
      content TEXT NOT NULL,
      translation TEXT,
      source TEXT NOT NULL CHECK(source = 'user_created'),
      updated_at TEXT,
      latest_sync_id TEXT REFERENCES mirror_sync(id)
    );
    CREATE TABLE IF NOT EXISTS capability_flag (
      name TEXT PRIMARY KEY,
      enabled INTEGER NOT NULL,
      checked_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS todo_session (
      id TEXT PRIMARY KEY,
      source_sync_id TEXT NOT NULL REFERENCES mirror_sync(id),
      local_session_date TEXT NOT NULL,
      current_entry_id TEXT,
      paused_entry_id TEXT,
      status TEXT NOT NULL CHECK(status IN ('active', 'completed', 'abandoned')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS todo_entry (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES todo_session(id) ON DELETE CASCADE,
      upstream_order INTEGER NOT NULL,
      word_id TEXT NOT NULL REFERENCES mirror_word(word_id),
      status TEXT NOT NULL CHECK(status IN ('pending', 'understood', 'skipped', 'paused')),
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS quiz_mistake (
      word_id TEXT PRIMARY KEY REFERENCES mirror_word(word_id),
      spelling TEXT NOT NULL,
      first_missed_day TEXT NOT NULL,
      last_missed_day TEXT NOT NULL,
      miss_count INTEGER NOT NULL,
      last_prompt TEXT,
      last_type TEXT,
      cleared_day TEXT
    );
    CREATE TABLE IF NOT EXISTS merged_source (
      path TEXT PRIMARY KEY,
      merged_at TEXT NOT NULL
    );
  `;
var indexes = `
    CREATE INDEX IF NOT EXISTS idx_mirror_sync_scope ON mirror_sync(scope_key, finished_at DESC);
    CREATE INDEX IF NOT EXISTS idx_study_record_last ON study_record(last_study_date);
    CREATE INDEX IF NOT EXISTS idx_study_record_next ON study_record(next_study_date);
    CREATE INDEX IF NOT EXISTS idx_quiz_mistake_last ON quiz_mistake(last_missed_day);
  `;
var orderConstraintRebuilds = [
  { table: "today_item", columns: "sync_id,word_id,upstream_order,is_new,is_finished,source_date" },
  { table: "todo_entry", columns: "id,session_id,upstream_order,word_id,status,updated_at" }
];
var tableColumns = (db, table) => {
  const exists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table);
  if (exists === void 0) return [];
  return db.pragma(`table_info(${table})`).map((column) => column.name);
};
var storedTableSql = (db, table) => {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(table);
  return row?.sql ?? "";
};
var hasUniqueUpstreamOrder = (db, table) => /UNIQUE\s*\([^)]*upstream_order[^)]*\)/i.test(storedTableSql(db, table));
var rebuildWithoutUniqueUpstreamOrder = (db, table, columns) => {
  if (!hasUniqueUpstreamOrder(db, table)) return;
  const previous = `${table}_previous`;
  db.pragma("foreign_keys = OFF");
  try {
    db.transaction(() => {
      db.exec(`ALTER TABLE ${table} RENAME TO ${previous}`);
      db.exec(schema);
      db.exec(`INSERT INTO ${table} (${columns}) SELECT ${columns} FROM ${previous}`);
      db.exec(`DROP TABLE ${previous}`);
    })();
  } finally {
    db.pragma("foreign_keys = ON");
  }
};
var collapseStudyRecordToPerWord = (db) => {
  if (!tableColumns(db, "study_record").includes("sync_id")) return;
  db.pragma("foreign_keys = OFF");
  try {
    db.transaction(() => {
      db.exec("ALTER TABLE study_record RENAME TO study_record_previous");
      db.exec(schema);
      db.exec(`
        INSERT INTO study_window_member(sync_id, word_id)
        SELECT sync_id, word_id FROM study_record_previous
      `);
      db.exec(`
        INSERT INTO study_record(
          word_id, add_date, first_study_date, last_study_date, next_study_date,
          study_count, tags, observed_at, latest_sync_id
        )
        SELECT
          previous.word_id, previous.add_date, previous.first_study_date,
          previous.last_study_date, previous.next_study_date, previous.study_count,
          previous.tags, COALESCE(sync.finished_at, ''), previous.sync_id
        FROM study_record_previous previous
        LEFT JOIN mirror_sync sync ON sync.id = previous.sync_id
        WHERE previous.rowid = (
          SELECT candidate.rowid
          FROM study_record_previous candidate
          LEFT JOIN mirror_sync candidate_sync ON candidate_sync.id = candidate.sync_id
          WHERE candidate.word_id = previous.word_id
          ORDER BY candidate_sync.finished_at DESC, candidate.rowid DESC
          LIMIT 1
        )
      `);
      db.exec("DROP TABLE study_record_previous");
    })();
  } finally {
    db.pragma("foreign_keys = ON");
  }
};
var addTodayResponseColumn = (db) => {
  if (tableColumns(db, "today_item").includes("first_response")) return;
  db.exec("ALTER TABLE today_item ADD COLUMN first_response TEXT");
};
var studyDateColumns = [
  "add_date",
  "first_study_date",
  "last_study_date",
  "next_study_date"
];
var beijingDayOfSync = (alias = "") => `date(${alias}finished_at, '+8 hours')`;
var normalizeStoredDatesToBeijingDays = (db) => {
  for (const column of studyDateColumns) {
    db.prepare(
      `UPDATE study_record SET ${column} = date(${column}, '+8 hours')
       WHERE ${column} LIKE '%T%' AND date(${column}, '+8 hours') IS NOT NULL`
    ).run();
  }
  db.prepare(
    `UPDATE mirror_sync SET scope_key = 'today:' || ${beijingDayOfSync()}
     WHERE scope_type = 'today_snapshot'
       AND ${beijingDayOfSync()} IS NOT NULL
       AND scope_key <> 'today:' || ${beijingDayOfSync()}`
  ).run();
  db.prepare(
    `UPDATE today_item SET source_date = (
       SELECT ${beijingDayOfSync("m.")} FROM mirror_sync m WHERE m.id = today_item.sync_id
     )
     WHERE (SELECT ${beijingDayOfSync("m.")} FROM mirror_sync m WHERE m.id = today_item.sync_id) IS NOT NULL
       AND source_date <> (
         SELECT ${beijingDayOfSync("m.")} FROM mirror_sync m WHERE m.id = today_item.sync_id
       )`
  ).run();
};
var migrate = (db) => {
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 3000");
  db.exec(schema);
  for (const rebuild of orderConstraintRebuilds) {
    rebuildWithoutUniqueUpstreamOrder(db, rebuild.table, rebuild.columns);
  }
  collapseStudyRecordToPerWord(db);
  addTodayResponseColumn(db);
  db.exec(indexes);
  normalizeStoredDatesToBeijingDays(db);
  db.prepare(
    "INSERT INTO schema_migration(version) VALUES(?) ON CONFLICT(version) DO NOTHING"
  ).run(schemaVersion);
};

// src/db/database.ts
var defaultDatabasePath = () => {
  const root = process.env.LOCALAPPDATA ?? join(process.env.USERPROFILE ?? process.cwd(), "AppData", "Local");
  return join(root, config.dataDirectoryName, "learning.sqlite");
};
var openDatabase = (path = defaultDatabasePath()) => {
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  migrate(db);
  return db;
};

// src/db/merge-mistakes.ts
var earlier = (left, right) => left <= right ? left : right;
var later = (left, right) => left >= right ? left : right;
var mergeQuizMistakes = (target, source, sourceKey) => {
  if (target.prepare("SELECT 1 FROM merged_source WHERE path=?").get(sourceKey) !== void 0) {
    return { added: 0, combined: 0, alreadyMerged: true };
  }
  const rows = source.prepare(
    `SELECT word_id, spelling, first_missed_day, last_missed_day, miss_count, last_prompt, last_type, cleared_day
       FROM quiz_mistake`
  ).all();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  return target.transaction(() => {
    const word = target.prepare(
      `INSERT INTO mirror_word(word_id,spelling,first_seen_at,last_seen_at,plan_state,plan_state_updated_at,latest_sync_id)
       VALUES(?,?,?,?,'current',?,NULL) ON CONFLICT(word_id) DO NOTHING`
    );
    const existing = target.prepare(
      `SELECT word_id, spelling, first_missed_day, last_missed_day, miss_count, last_prompt, last_type, cleared_day
       FROM quiz_mistake WHERE word_id=?`
    );
    const insert = target.prepare(
      `INSERT INTO quiz_mistake(word_id,spelling,first_missed_day,last_missed_day,miss_count,last_prompt,last_type,cleared_day)
       VALUES(?,?,?,?,?,?,?,?)`
    );
    const update = target.prepare(
      `UPDATE quiz_mistake SET spelling=?, first_missed_day=?, last_missed_day=?, miss_count=?,
         last_prompt=?, last_type=?, cleared_day=? WHERE word_id=?`
    );
    let added = 0;
    let combined = 0;
    for (const row of rows) {
      word.run(row.word_id, row.spelling, now, now, now);
      const mine = existing.get(row.word_id);
      if (mine === void 0) {
        insert.run(
          row.word_id,
          row.spelling,
          row.first_missed_day,
          row.last_missed_day,
          row.miss_count,
          row.last_prompt,
          row.last_type,
          row.cleared_day
        );
        added += 1;
        continue;
      }
      const latest = row.last_missed_day > mine.last_missed_day ? row : mine;
      update.run(
        mine.spelling.trim() === "" ? row.spelling : mine.spelling,
        earlier(mine.first_missed_day, row.first_missed_day),
        later(mine.last_missed_day, row.last_missed_day),
        mine.miss_count + row.miss_count,
        latest.last_prompt,
        latest.last_type,
        mine.cleared_day === null || row.cleared_day === null ? null : later(mine.cleared_day, row.cleared_day),
        row.word_id
      );
      combined += 1;
    }
    target.prepare("INSERT INTO merged_source(path, merged_at) VALUES(?,?)").run(sourceKey, now);
    return { added, combined, alreadyMerged: false };
  })();
};

// src/migrate-legacy.ts
var localRoot = () => process.env.LOCALAPPDATA ?? join2(process.env.USERPROFILE ?? process.cwd(), "AppData", "Local");
var sidecarSuffixes = ["", "-wal", "-shm"];
var migrateDatabase = (legacyDirectory) => {
  const root = localRoot();
  const target = join2(root, config.dataDirectoryName, "learning.sqlite");
  const source = join2(root, legacyDirectory, "learning.sqlite");
  if (!existsSync(source)) return `\u6570\u636E\u5E93\uFF1A${legacyDirectory} \u4E0B\u6CA1\u6709\u65E7\u6570\u636E\u5E93\uFF0C\u8DF3\u8FC7\u3002`;
  if (!existsSync(target)) {
    mkdirSync2(dirname2(target), { recursive: true });
    let moved = 0;
    for (const suffix of sidecarSuffixes) {
      const from2 = `${source}${suffix}`;
      if (!existsSync(from2)) continue;
      renameSync(from2, `${target}${suffix}`);
      moved += 1;
    }
    return `\u6570\u636E\u5E93\uFF1A\u5DF2\u628A ${moved} \u4E2A\u6587\u4EF6\u4ECE ${dirname2(source)} \u79FB\u5230 ${dirname2(target)}\u3002`;
  }
  const into = openDatabase(target);
  const from = new Database(source, { readOnly: true });
  try {
    const outcome = mergeQuizMistakes(into, from, source);
    if (outcome.alreadyMerged) return `\u9519\u9898\u672C\uFF1A${source} \u4E4B\u524D\u5DF2\u7ECF\u5408\u5E76\u8FC7\uFF0C\u8FD9\u6B21\u6CA1\u6709\u6539\u52A8\u3002`;
    return `\u9519\u9898\u672C\uFF1A\u5DF2\u628A ${source} \u5408\u5E76\u8FDB ${target}\uFF0C\u65B0\u589E ${outcome.added} \u4E2A\u8BCD\uFF0C\u5408\u5E76 ${outcome.combined} \u4E2A\u4E24\u8FB9\u90FD\u6709\u7684\u8BCD\uFF08\u7D2F\u8BA1\u6B21\u6570\u76F8\u52A0\uFF09\u3002\u65E7\u6570\u636E\u5E93\u4FDD\u7559\u5728\u539F\u4F4D\uFF0C\u786E\u8BA4\u65E0\u8BEF\u540E\u53EF\u4EE5\u5220\u9664\u3002`;
  } finally {
    from.close();
    into.close();
  }
};
var run = () => {
  for (const legacyDirectory of config.legacyDataDirectoryNames) {
    try {
      process.stdout.write(`${migrateDatabase(legacyDirectory)}
`);
    } catch (error) {
      process.stdout.write(`\u6570\u636E\u5E93\uFF1A\u8FC1\u79FB\u5931\u8D25\uFF08${String(error)}\uFF09
`);
      process.stdout.write(
        "  \u591A\u534A\u662F MCP \u670D\u52A1\u8FD8\u5728\u8FD0\u884C\u3001\u5360\u7740\u6570\u636E\u5E93\u6587\u4EF6\u3002\u8BF7\u5148\u5173\u6389\u7528\u5B83\u7684\u5BA2\u6237\u7AEF\u518D\u91CD\u8DD1\u672C\u547D\u4EE4\u3002\n"
      );
    }
  }
  process.stdout.write(
    `\u51ED\u8BC1\uFF1A\u4E0D\u9700\u8981\u8FC1\u79FB\uFF0C\u670D\u52A1\u4F1A\u4F9D\u6B21\u8BFB\u53D6 ${[config.credentialService, ...config.legacyCredentialServices].join("\u3001")}\u3002
`
  );
};
run();
