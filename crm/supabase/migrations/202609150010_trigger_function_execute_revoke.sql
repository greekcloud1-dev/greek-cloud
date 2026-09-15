-- Close a gap the Supabase security advisor found after migration 009: four
-- trigger-only functions from the foundation migration were left executable
-- directly via PostgREST RPC by anon/authenticated, unlike the other trigger
-- functions migration 202609060002 already locked down the same way.
--
-- These are SECURITY DEFINER but only meaningful inside a trigger (they read
-- `new`/`old`), so a direct RPC call errors out rather than doing anything --
-- this is not a privilege escalation, just an unnecessary exposed surface.
-- Revoking EXECUTE does not affect trigger firing: the executor invokes
-- trigger functions directly, not through a role's EXECUTE grant.
revoke all on function public.crm_record_case_activity() from public, anon, authenticated;
revoke all on function public.crm_record_task_activity() from public, anon, authenticated;
revoke all on function public.crm_seed_notification_preferences() from public, anon, authenticated;
revoke all on function public.crm_sync_auth_user_profile() from public, anon, authenticated;

-- Migration 202609060002 revoked these same four from PUBLIC, but Supabase
-- grants EXECUTE to anon/authenticated by default privilege independently of
-- the PUBLIC pseudo-role, so that revoke never actually covered them -- the
-- live security advisor still listed all four as callable. Closing that here.
revoke all on function public.crm_record_contact_edit() from public, anon, authenticated;
revoke all on function public.crm_record_contact_time() from public, anon, authenticated;
revoke all on function public.crm_record_extra_case_changes() from public, anon, authenticated;
revoke all on function public.crm_record_task_reopened() from public, anon, authenticated;
