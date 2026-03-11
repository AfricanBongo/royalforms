-- seed.sql
-- Applied on `supabase db reset`. Use for Root Admin bootstrap and test data.
-- This creates the initial Root Admin user for local development.

-- Root Admin credentials for local dev:
--   Email:    admin@royalforms.local
--   Password: password123

-- 0. Bootstrap group — the root admin's home group (undeletable)
INSERT INTO public.groups (id, name, created_by, is_active, is_bootstrap)
VALUES (
  '00000000-0000-0000-0000-000000000002',
  'RoyalHouse Root',
  NULL,  -- created_by set after profiles row exists
  true,
  true   -- marks this group as undeletable
);

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
    'group_id', '00000000-0000-0000-0000-000000000002',
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

-- 3. Insert matching profiles row (in bootstrap group)
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
  '00000000-0000-0000-0000-000000000002',
  true
);

-- 4. Backfill created_by on the bootstrap group now that profiles row exists
UPDATE public.groups
SET created_by = '00000000-0000-0000-0000-000000000001'
WHERE id = '00000000-0000-0000-0000-000000000002';

-- ============================================================================
-- 4. Sample Form Template (Demo)
-- A complete form template with all 10 field types across 3 sections.
-- Makes testing easier and serves as a demo for new root admins.
-- ============================================================================

-- Demo Group (so template_group_access tests work too)
INSERT INTO public.groups (id, name, created_by, is_active)
VALUES (
  '00000000-0000-0000-0000-000000000010',
  'Demo Group',
  '00000000-0000-0000-0000-000000000001',  -- Root Admin
  true
);

-- Form Template: published, visible to all groups
INSERT INTO public.form_templates (id, name, description, created_by, is_active, sharing_mode, status)
VALUES (
  '00000000-0000-0000-0000-000000000020',
  'Sample Form — All Field Types',
  'A demo form showcasing every field type. Use this to test form filling, field assignment, and submission workflows.',
  '00000000-0000-0000-0000-000000000001',
  true,
  'all',
  'published'
);

-- Template Version v1 (published, latest)
INSERT INTO public.template_versions (id, template_id, version_number, is_latest, status, created_by)
VALUES (
  '00000000-0000-0000-0000-000000000030',
  '00000000-0000-0000-0000-000000000020',
  1,
  true,
  'published',
  '00000000-0000-0000-0000-000000000001'
);

-- ---------------------------------------------------------------------------
-- Sections (3)
-- ---------------------------------------------------------------------------

-- Section 1: Text & Numbers
INSERT INTO public.template_sections (id, template_version_id, title, description, sort_order)
VALUES (
  '00000000-0000-0000-0000-000000000040',
  '00000000-0000-0000-0000-000000000030',
  'Text & Numbers',
  'Basic text inputs and numeric fields.',
  1
);

-- Section 2: Choices & Ratings
INSERT INTO public.template_sections (id, template_version_id, title, description, sort_order)
VALUES (
  '00000000-0000-0000-0000-000000000050',
  '00000000-0000-0000-0000-000000000030',
  'Choices & Ratings',
  'Selection fields, checkboxes, and rating scales.',
  2
);

-- Section 3: Date & Files
INSERT INTO public.template_sections (id, template_version_id, title, description, sort_order)
VALUES (
  '00000000-0000-0000-0000-000000000060',
  '00000000-0000-0000-0000-000000000030',
  'Date & Files',
  'Date pickers and file upload fields.',
  3
);

-- ---------------------------------------------------------------------------
-- Fields (10 — all field types)
-- ---------------------------------------------------------------------------

-- === Section 1: Text & Numbers ===

-- Field 1: Text (required)
INSERT INTO public.template_fields (id, template_section_id, label, description, field_type, sort_order, is_required, options, validation_rules)
VALUES (
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000040',
  'Full Name',
  'Enter your full legal name.',
  'text',
  1,
  true,
  NULL,
  NULL
);

-- Field 2: Textarea (optional, with length validation)
INSERT INTO public.template_fields (id, template_section_id, label, description, field_type, sort_order, is_required, options, validation_rules)
VALUES (
  '00000000-0000-0000-0000-000000000102',
  '00000000-0000-0000-0000-000000000040',
  'Bio',
  'Tell us about yourself, your background and interests.',
  'textarea',
  2,
  false,
  NULL,
  '{"min_length": 10, "max_length": 500}'::jsonb
);

-- Field 3: Number (optional, with min/max validation)
INSERT INTO public.template_fields (id, template_section_id, label, description, field_type, sort_order, is_required, options, validation_rules)
VALUES (
  '00000000-0000-0000-0000-000000000103',
  '00000000-0000-0000-0000-000000000040',
  'Age',
  'Your current age in years.',
  'number',
  3,
  false,
  NULL,
  '{"min_value": 0, "max_value": 150}'::jsonb
);

-- === Section 2: Choices & Ratings ===

-- Field 4: Select (required, single choice)
INSERT INTO public.template_fields (id, template_section_id, label, description, field_type, sort_order, is_required, options, validation_rules)
VALUES (
  '00000000-0000-0000-0000-000000000201',
  '00000000-0000-0000-0000-000000000050',
  'Department',
  'Select the department you belong to.',
  'select',
  1,
  true,
  '["Engineering", "Marketing", "Sales", "HR", "Finance"]'::jsonb,
  NULL
);

-- Field 5: Multi Select (optional, multiple choices)
INSERT INTO public.template_fields (id, template_section_id, label, description, field_type, sort_order, is_required, options, validation_rules)
VALUES (
  '00000000-0000-0000-0000-000000000202',
  '00000000-0000-0000-0000-000000000050',
  'Skills',
  'Select all skills that apply to you.',
  'multi_select',
  2,
  false,
  '["JavaScript", "Python", "Design", "Leadership", "Communication"]'::jsonb,
  NULL
);

-- Field 6: Checkbox (required)
INSERT INTO public.template_fields (id, template_section_id, label, description, field_type, sort_order, is_required, options, validation_rules)
VALUES (
  '00000000-0000-0000-0000-000000000203',
  '00000000-0000-0000-0000-000000000050',
  'I agree to the terms and conditions',
  'You must agree to proceed.',
  'checkbox',
  3,
  true,
  NULL,
  NULL
);

-- Field 7: Rating (optional, 1-5 stars)
INSERT INTO public.template_fields (id, template_section_id, label, description, field_type, sort_order, is_required, options, validation_rules)
VALUES (
  '00000000-0000-0000-0000-000000000204',
  '00000000-0000-0000-0000-000000000050',
  'Overall Satisfaction',
  'Rate your overall satisfaction from 1 to 5 stars.',
  'rating',
  4,
  false,
  NULL,
  NULL
);

-- Field 8: Range (optional, 0-100 with step 5)
INSERT INTO public.template_fields (id, template_section_id, label, description, field_type, sort_order, is_required, options, validation_rules)
VALUES (
  '00000000-0000-0000-0000-000000000205',
  '00000000-0000-0000-0000-000000000050',
  'Confidence Level',
  'How confident are you in your responses? Slide to indicate.',
  'range',
  5,
  false,
  NULL,
  '{"min_value": 0, "max_value": 100, "step": 5}'::jsonb
);

-- === Section 3: Date & Files ===

-- Field 9: Date (required)
INSERT INTO public.template_fields (id, template_section_id, label, description, field_type, sort_order, is_required, options, validation_rules)
VALUES (
  '00000000-0000-0000-0000-000000000301',
  '00000000-0000-0000-0000-000000000060',
  'Start Date',
  'When can you start?',
  'date',
  1,
  true,
  NULL,
  NULL
);

-- Field 10: File (optional, PDF/DOCX, max 5 MB)
INSERT INTO public.template_fields (id, template_section_id, label, description, field_type, sort_order, is_required, options, validation_rules)
VALUES (
  '00000000-0000-0000-0000-000000000302',
  '00000000-0000-0000-0000-000000000060',
  'Upload Resume',
  'Upload your resume in PDF or Word format (max 5 MB).',
  'file',
  2,
  false,
  NULL,
  '{"accepted_types": ".pdf,.docx", "max_size_mb": 5, "allow_multiple": false}'::jsonb
);
