import { supabase } from '../supabase/client';

// Supabase phone auth expects E.164 (+82...). Accepts common Korean input
// shapes ("010-1234-5678", "01012345678") and converts the leading 0 to +82.
export function toE164Korea(input: string): string {
  const digits = input.replace(/\D/g, '');
  const withoutLeadingZero = digits.startsWith('0') ? digits.slice(1) : digits;
  return `+82${withoutLeadingZero}`;
}

// Inverse of toE164Korea, for display purposes (e.g. settings/account.tsx):
// "+821012345678" -> "010-1234-5678".
export function fromE164Korea(e164: string): string {
  const digits = e164.startsWith('+82') ? `0${e164.slice(3)}` : e164.replace(/\D/g, '');
  if (digits.length !== 11) return digits;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

export async function sendPhoneOtp(rawPhone: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({ phone: toE164Korea(rawPhone) });
  if (error) throw error;
}

export async function verifyPhoneOtp(rawPhone: string, token: string): Promise<void> {
  const { error } = await supabase.auth.verifyOtp({ phone: toE164Korea(rawPhone), token, type: 'sms' });
  if (error) throw error;
}
