import { getTableName, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { SQLiteTable } from 'drizzle-orm/sqlite-core';
import { openDatabaseSync } from 'expo-sqlite';

import * as schema from './schema';

export const DATABASE_NAME = 'beehero.db';

// Single shared native connection. Both repositories (user actions) and the
// sync engine (background pull writes) must go through this same instance —
// Drizzle's useLiveQuery reactivity is driven by expo-sqlite's native change
// listener on this specific connection, so a second openDatabaseSync() call
// would not be observed by components subscribed via this db.
export const expoDb = openDatabaseSync(DATABASE_NAME, { enableChangeListener: true });

export const db = drizzle(expoDb, { schema });

export async function resetLocalDatabase() {
  const tableNames = (Object.values(schema) as unknown[])
    .filter((value): value is SQLiteTable => value instanceof SQLiteTable)
    .map((table) => getTableName(table));

  // Migration 0005 leaves `PRAGMA foreign_keys=ON` set for the rest of this
  // connection's lifetime (SQLite pragmas are per-connection, not
  // persisted). A full wipe deletes tables in declaration order, which is
  // parent-before-child (e.g. apiaries before colonies) — under FK
  // enforcement that throws immediately and aborts the whole transaction,
  // so logout/account-delete silently fails to clear anything. Since this
  // wipes every table anyway, referential integrity mid-wipe doesn't
  // matter, so enforcement is simply turned off for it. PRAGMA changes are
  // a no-op inside a transaction, so this must happen outside one.
  await db.run(sql.raw('PRAGMA foreign_keys = OFF'));
  try {
    await db.transaction(async (tx) => {
      for (const name of tableNames) {
        await tx.run(sql.raw(`DELETE FROM "${name}"`));
      }
    });
  } finally {
    await db.run(sql.raw('PRAGMA foreign_keys = ON'));
  }
}
