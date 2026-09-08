// Permanently deletes the CALLING user's own account and all their data.
// The client SDK can't self-delete an auth user (that requires the service
// role key), so this runs server-side. The target is always derived from
// the caller's own verified JWT — never from the request body — so one user
// can never delete another's account.
//
// Deletion order:
//   1. Any inspection photo files in Storage under `${userId}/` (Storage
//      objects have no FK to auth.users, so they wouldn't be cleaned up by
//      cascade deletes otherwise).
//   2. The auth user itself — every domain table (apiaries, colonies,
//      visits, records, ..., photos) references auth.users(id) on delete
//      cascade, so this cascades through all of it in one step.
//
// Deploy: supabase functions deploy delete-account
// No extra secrets needed — SUPABASE_URL / SUPABASE_ANON_KEY /
// SUPABASE_SERVICE_ROLE_KEY are provided automatically to every Edge
// Function by the platform.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const STORAGE_BUCKET = 'inspection-photos';

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return jsonResponse({ error: 'method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return jsonResponse({ error: 'missing Authorization header' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const {
    data: { user },
    error: userError,
  } = await callerClient.auth.getUser();
  if (userError || !user) return jsonResponse({ error: 'invalid session' }, 401);

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: files } = await adminClient.storage.from(STORAGE_BUCKET).list(user.id);
  if (files && files.length > 0) {
    await adminClient.storage.from(STORAGE_BUCKET).remove(files.map((f) => `${user.id}/${f.name}`));
  }

  const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id);
  if (deleteError) return jsonResponse({ error: deleteError.message }, 500);

  return jsonResponse({}, 200);
});
