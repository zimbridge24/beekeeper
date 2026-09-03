import { supabase } from '../supabase/client';

// Supabase phone auth expects E.164 (+82...). Accepts common Korean input
// shapes ("010-1234-5678", "01012345678") and converts the leading 0 to +82.
export function toE164Korea(input: string): string {
  const digits = input.replace(/\D/g, '');
  const withoutLeadingZero = digits.startsWith('0') ? digits.slice(1) : digits;
  return `+82${withoutLeadingZero}`;
}

export async function sendPhoneOtp(rawPhone: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({ phone: toE164Korea(rawPhone) });
  if (error) throw error;
}

export async function verifyPhoneOtp(rawPhone: string, token: string): Promise<void> {
  const { error } = await supabase.auth.verifyOtp({ phone: toE164Korea(rawPhone), token, type: 'sms' });
  if (error) throw error;
}
