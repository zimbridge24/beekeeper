import { eq } from 'drizzle-orm';

import { db } from '../db/client';
import { outbox, syncCursors } from '../db/schema';

export type OutboxOp = 'insert' | 'update' | 'delete';
// Structurally, a Drizzle transaction supports the same query-builder calls
// as the top-level db instance — this alias lets repository code accept
// either without repeating the transaction's inferred type everywhere.
export type DbOrTx = typeof db | Parameters<Parameters<(typeof db)['transaction']>[0]>[0];

export async function getCursor(tx: DbOrTx, tableName: string): Promise<number> {
  const rows = await tx.select().from(syncCursors).where(eq(syncCursors.tableName, tableName)).limit(1);
  return rows[0]?.lastPulledAt ?? 0;
}

export async function enqueueOutbox(
  tx: DbOrTx,
  params: { entityTable: string; entityId: string; op: OutboxOp; payload: Record<string, unknown> },
) {
  const watermark = await getCursor(tx, params.entityTable);
  await tx.insert(outbox).values({
    entityTable: params.entityTable,
    entityId: params.entityId,
    op: params.op,
    payloadJson: JSON.stringify(params.payload),
    watermarkAtEnqueue: watermark,
    status: 'pending',
    attemptCount: 0,
    createdAt: Date.now(),
  });
}
