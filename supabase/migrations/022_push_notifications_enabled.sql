ALTER TABLE public.users
  ADD COLUMN push_notifications_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.users.push_notifications_enabled IS
  'User-level Web Push toggle. false = no pushes sent, all subscriptions deleted.';
