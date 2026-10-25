// Pengganti node:sqlite (DatabaseSync) di browser, dibangun di atas sql.js (SQLite WASM).
let SQL = null;
let initialBytes = null;

export function configure(sqlJs, bytes) {
  SQL = sqlJs;
  initialBytes = bytes;
}

const bindable = (params) => params.map((v) => (v === undefined ? null : typeof v === 'boolean' ? Number(v) : v));

export class DatabaseSync {
  constructor() {
    this.raw = initialBytes ? new SQL.Database(initialBytes) : new SQL.Database();
  }

  exec(sql) {
    this.raw.exec(sql);
  }

  prepare(sql) {
    const raw = this.raw;
    const each = (params, fn) => {
      const stmt = raw.prepare(sql);
      try {
        stmt.bind(bindable(params));
        while (stmt.step()) if (fn(stmt.getAsObject()) === false) break;
      } finally {
        stmt.free();
      }
    };
    return {
      run(...params) {
        raw.run(sql, bindable(params));
        const changes = raw.getRowsModified();
        const lastInsertRowid = raw.exec('SELECT last_insert_rowid()')[0].values[0][0];
        return { changes, lastInsertRowid };
      },
      get(...params) {
        let row;
        each(params, (r) => {
          row = r;
          return false;
        });
        return row;
      },
      all(...params) {
        const rows = [];
        each(params, (r) => rows.push(r));
        return rows;
      },
    };
  }

  // Snapshot untuk disimpan di localStorage. sql.js mereset PRAGMA saat export.
  export() {
    const bytes = this.raw.export();
    this.raw.exec('PRAGMA foreign_keys = ON;');
    return bytes;
  }
}
