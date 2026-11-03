-- The handover feature was intentionally removed from the admin product.
-- Remove its private RPC surface before removing the backing table.
drop function if exists public.admin_update_shift_handoff(uuid, text, boolean);
drop function if exists public.admin_create_shift_handoff(text, boolean);
drop function if exists public.admin_list_shift_handoffs(text);
drop table if exists public.admin_shift_handoffs;
