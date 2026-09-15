/* Where a submission is stored.
   ---------------------------------------------------------------------------
   Supabase holds everything: the files in a private bucket, the record itself
   in the CRM database via the bridge. One system means one backup, one set of
   access rules, and -- the reason that actually matters -- one deletion. While
   the files lived in Vercel Blob and the case lived in Supabase, erasing a
   customer meant two jobs, and a miss in either left a face photo behind after
   somebody asked to be forgotten.

   THE SAFETY NET

   Supabase is not always reachable, and a submission must never be lost
   because of that. The previous design got this right for the wrong reason:
   it wrote to Blob first because Blob was the store. Here Blob is not a store
   at all -- it is a holding area that is used only when the real one refuses.

   So in normal operation nothing is duplicated: the file goes to Supabase and
   Blob is never touched. When Supabase fails, the whole submission is parked
   in Blob under `unreceived/` with the reason, the visitor still gets an
   answer, and the operator has something to recover from. That directory
   existing at all is the alert.

   The website holds a storage-scoped key and nothing more. It cannot read the
   CRM database: if this site is ever compromised, what is reachable is the
   files, not every customer. The record still travels through the
   authenticated bridge, which the CRM owns.
   ========================================================================== */

import { createClient } from '@supabase/supabase-js';

export const BUCKET = 'intake';

/** Configured only when both halves are present; half a configuration is none. */
export function intakeStorageConfigured() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_STORAGE_KEY);
}

function client() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_STORAGE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Uploads one file and returns its object path.
 *
 * `upsert: false` so a replayed submission cannot overwrite a stored file:
 * the path already carries an unguessable submission id, and a collision is a
 * signal worth failing on rather than quietly resolving.
 */
export async function putIntakeFile(submissionId, name, file, contentType) {
  const path = `submissions/${submissionId}/${name}`;
  const { error } = await client()
    .storage.from(BUCKET)
    .upload(path, file, { contentType, upsert: false });
  if (error) throw new Error(`storage_upload_failed: ${error.message}`);
  return path;
}

/**
 * Signs a stored object for a short read.
 *
 * Used by the CRM. The website itself never needs this -- it has no screen
 * that shows an intake back to anyone.
 */
export async function signIntakeFile(path, seconds = 300) {
  const { data, error } = await client()
    .storage.from(BUCKET)
    .createSignedUrl(path, seconds);
  if (error || !data?.signedUrl) throw new Error('storage_sign_failed');
  return data.signedUrl;
}
