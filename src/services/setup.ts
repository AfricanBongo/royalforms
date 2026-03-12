import type { SupabaseClient } from '@supabase/supabase-js'

import { supabase } from './supabase'

/**
 * Check whether the initial setup has been completed (root admin exists).
 * Calls a SECURITY DEFINER function that bypasses RLS.
 *
 * Note: `is_setup_complete` may not yet be in the generated Database types.
 * We cast the client to call the RPC without strict type checking on the
 * function name. Regenerate types after the migration is applied to remove
 * this workaround.
 */
export async function checkSetupComplete(): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as unknown as SupabaseClient).rpc('is_setup_complete')
  if (error) throw error
  return data as boolean
}

/**
 * Bootstrap the root admin and organization via the Edge Function.
 */
export async function bootstrapRootAdmin(params: {
  email: string
  password: string
  orgName: string
}): Promise<{ created: boolean; message: string; sampleFormCreated?: boolean }> {
  const { data, error } = await supabase.functions.invoke('bootstrap-root-admin', {
    body: params,
  })

  if (error) throw error
  return data as { created: boolean; message: string; sampleFormCreated?: boolean }
}
