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

   That is why this talks to Supabase Storage over the S3 protocol with an S3
   access key pair (Storage settings -> S3 Connection), not the ordinary
   Supabase client with a project API key: every current Supabase API key
   (publishable or secret) grants project-wide access and bypasses RLS, so it
   is not a smaller blast radius than the CRM's own key. The S3 credential is
   the only key Supabase issues that is inherently limited to Storage.
   ========================================================================== */

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

export const BUCKET = 'intake';

/** Configured only when every part is present; a partial configuration is none. */
export function intakeStorageConfigured() {
  return Boolean(
    process.env.SUPABASE_URL &&
      process.env.SUPABASE_STORAGE_KEY_ID &&
      process.env.SUPABASE_STORAGE_KEY,
  );
}

function client() {
  return new S3Client({
    endpoint: `${process.env.SUPABASE_URL}/storage/v1/s3`,
    region: process.env.SUPABASE_STORAGE_REGION || 'eu-central-1',
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.SUPABASE_STORAGE_KEY_ID,
      secretAccessKey: process.env.SUPABASE_STORAGE_KEY,
    },
  });
}

/**
 * Uploads one file and returns its object path.
 *
 * No upsert flag: the S3 protocol's PutObject always overwrites, but the path
 * already carries an unguessable submission id, so a genuine collision is a
 * signal worth investigating rather than a normal replay to guard against.
 */
export async function putIntakeFile(submissionId, name, file, contentType) {
  const path = `submissions/${submissionId}/${name}`;
  try {
    await client().send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: path,
        Body: file,
        ContentType: contentType,
      }),
    );
  } catch (error) {
    throw new Error(`storage_upload_failed: ${error.message}`);
  }
  return path;
}
