# Instance Page Improvements: File Upload, Bug Fixes, Sample Template

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement file upload for form instances, fix the rating save bug and text validation key mismatch, update text/textarea character limits, add builder subtext for text fields, and create a sample form template in seed data.

**Architecture:** Changes span InstanceFieldInput (file upload component, rating fix, text limits), the instance page (blur handler fix, navigation blocker), the form builder (subtext, limits section), storage RLS policies, and seed.sql.

**Tech Stack:** React 19, Supabase Storage, Shadcn UI, Tailwind CSS

---

## Task 1: Fix Rating Bug (and all instant-save fields)

**Root cause:** Rating, checkbox, select, and multi_select call `onChange()` then `onBlur()` synchronously. React batches state updates, so `handleFieldBlur` reads stale `localValues`.

**Fix:** Change `onBlur` to accept an optional value override. For instant fields, pass the value directly.

**Files:**
- Modify: `src/routes/_authenticated/instances/$readableId.tsx` — `handleFieldBlur` signature and logic
- Modify: `src/features/instances/InstanceFieldInput.tsx` — pass value to onBlur for instant fields

**Changes to `handleFieldBlur`:**
```typescript
async function handleFieldBlur(fieldId: string, valueOverride?: string | null) {
  if (!data) return
  // Use override if provided (instant fields), otherwise read from localValues
  const hasOverride = valueOverride !== undefined
  const localVal = hasOverride ? valueOverride : localValues.get(fieldId)
  if (!hasOverride && localVal === undefined) return
  // ... rest of logic uses localVal
}
```

**Changes to InstanceFieldInput:**
- Update `onBlur` prop type to `(valueOverride?: string | null) => void`
- Rating: `onBlur(current === star ? null : String(star))`
- Checkbox: `onBlur(checked === true ? 'true' : 'false')`
- Select: `onBlur(v || null)`
- MultiSelect: `onBlur(next.length > 0 ? next.join(',') : null)`

---

## Task 2: Fix Text Validation Key Mismatch + Character Limits

**Problem:** Builder saves `min_length`/`max_length`, but InstanceFieldInput reads `min_chars`/`max_chars`.

**New rules:**
- **text**: hard max 1000, counter only shows after 900 chars, always enforce maxLength=1000
- **textarea**: default max 2000, configurable up to 5000 via builder. Counter shows near limit (>90% of max). maxLength enforced.

**Files:**
- Modify: `src/features/instances/InstanceFieldInput.tsx` — fix key names, add text defaults
- Modify: `src/components/builder-field-card.tsx` — hide limits for text, show subtext, cap textarea max at 5000

**Instance field changes:**
- text case: `maxLength={1000}`, counter shows when length > 900
- textarea case: read `rules.min_length`/`rules.max_length`, default max = 2000, cap at 5000, counter shows when length > 90% of max
- CharacterCounter: add `threshold` prop to control when counter appears

**Builder changes:**
- Text field preview: add subtext "Maximum 1,000 characters"
- Hide FieldLimitsSection for text type (only show for textarea)
- Textarea limits: set max_length input max to 5000, placeholder to "2000"

---

## Task 3: File Upload Implementation

### 3a: Storage RLS Policies (Migration)

**Create:** `supabase/migrations/20260312000012_form_uploads_storage_policies.sql`

Policies for `form-uploads` bucket:
- **Upload**: Authenticated users can upload to paths matching `{instance_id}/{field_id}/*` where they have access to the instance (via group membership)
- **Download**: Same group-based access
- **Delete**: Same group-based access (for file removal)

### 3b: Builder Config — Allow Multiple Toggle

**Modify:** `src/components/builder-field-card.tsx`

Add an `allow_multiple` toggle switch in the file field limits section. Stored in `validation_rules.allow_multiple`.

### 3c: File Upload Service Functions

**Create functions in:** `src/services/form-templates.ts`

- `uploadInstanceFile(instanceId, fieldId, file)` → returns storage path
- `removeInstanceFile(storagePath)` → deletes from storage
- `getFileDownloadUrl(storagePath)` → returns signed URL (60 min expiry)

Storage path pattern: `{instance_id}/{field_id}/{timestamp}-{filename}`

### 3d: FileUploadInput Component

**Modify:** `src/features/instances/InstanceFieldInput.tsx` — replace file placeholder

UI states:
- **Empty**: Dashed border drop zone with "Click or drag to upload" + accepted types hint
- **Uploading**: File list with progress bars and X (abort) buttons
- **Uploaded**: File list with filenames, sizes, download links, and X (remove) buttons
- **Disabled**: File list with download links only (no remove)

Value format in `field_values.value`: JSON array of `{path, name, size}` objects.

### 3e: Navigation Blocker

**Modify:** `src/routes/_authenticated/instances/$readableId.tsx`

Track uploading file count. When > 0, add `beforeunload` event listener to warn the user.

---

## Task 4: Sample Form Template in Seed Data

**Modify:** `supabase/seed.sql`

After the Root Admin, add:
- 1 group: "Demo Group"
- 1 form template: "Sample Form — All Field Types" (published, sharing_mode='all')
- 1 template version (v1, published, is_latest=true)
- 3 sections with all 10 field types:

**Section 1: "Text & Numbers"**
- Text (required, label: "Full Name")
- Textarea (label: "Bio", description: "Tell us about yourself", min_length: 10, max_length: 500)
- Number (label: "Age", min_value: 0, max_value: 150)

**Section 2: "Choices & Ratings"**
- Select (label: "Department", options: ["Engineering", "Marketing", "Sales", "HR", "Finance"])
- Multi Select (label: "Skills", options: ["JavaScript", "Python", "Design", "Leadership", "Communication"])
- Checkbox (label: "I agree to the terms", required: true)
- Rating (label: "Overall Satisfaction")
- Range (label: "Confidence Level", min_value: 0, max_value: 100, step: 5)

**Section 3: "Date & Files"**
- Date (label: "Start Date", required: true)
- File (label: "Upload Resume", accepted_types: ".pdf,.docx", max_size_mb: 5, allow_multiple: false)

All UUIDs use deterministic values (e.g., `00000000-0000-0000-0000-000000000010`) for reproducibility.
