import { supabase } from '../supabase/client';
import { upsertLocalUser } from './session';

// The local `users` row is written here directly rather than left to the
// onAuthStateChange listener in AuthProvider — that listener fires
// asynchronously and isn't awaited by anything, so a caller that navigates
// right after signIn/signUp resolves could still see isAuthenticated as
// false for a beat (or indefinitely, if the app navigated away before the
// event landed).
export async function signUpWithEmail(email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  if (data.user) await upsertLocalUser(data.user);
  return data;
}

export async function signInWithEmail(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  if (data.user) await upsertLocalUser(data.user);
  return data;
}
