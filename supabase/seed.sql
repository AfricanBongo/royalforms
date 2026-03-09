-- seed.sql
-- Applied on `supabase db reset`. Use for Root Admin bootstrap and test data.
-- This creates the initial Root Admin user for local development.

-- Root Admin credentials for local dev:
--   Email:    admin@royalforms.local
--   Password: password123

-- 1. Insert into auth.users (Supabase Auth)
INSERT INTO auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'admin@royalforms.local',
  crypt('password123', gen_salt('bf')),
  now(),
  jsonb_build_object(
    'full_name', 'Root Admin',
    'role', 'root_admin',
    'is_active', true
  ),
  now(),
  now(),
  '',
  '',
  '',
  ''
);

-- 2. Insert identity for email login
INSERT INTO auth.identities (
  id,
  user_id,
  identity_data,
  provider,
  provider_id,
  last_sign_in_at,
  created_at,
  updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  jsonb_build_object(
    'sub', '00000000-0000-0000-0000-000000000001',
    'email', 'admin@royalforms.local'
  ),
  'email',
  '00000000-0000-0000-0000-000000000001',
  now(),
  now(),
  now()
);

-- 3. Insert matching profiles row
INSERT INTO public.profiles (
  id,
  email,
  full_name,
  role,
  group_id,
  is_active
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'admin@royalforms.local',
  'Root Admin',
  'root_admin',
  NULL,
  true
);
