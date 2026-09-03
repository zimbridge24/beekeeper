// Local timestamps are epoch-ms integers (see src/db/schema.ts). Supabase's
// columns are `timestamptz`, which PostgREST expects as ISO-8601 strings —
// sending a raw number silently fails Postgres's type coercion, so every
// push payload must convert through this before going over the wire.
export function toIso(ms: number | null | undefined): string | null {
  return ms === null || ms === undefined ? null : new Date(ms).toISOString();
}
