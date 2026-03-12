/**
 * Form Templates service — data access for form templates and instances.
 */
import { supabase } from './supabase'
import { getCurrentAuthUser } from './auth'

import type { Json } from '../types/database'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Row from the templates_with_stats view. */
export interface TemplateListRow {
  id: string
  name: string
  description: string | null
  sharing_mode: string
  status: string
  is_active: boolean
  created_at: string
  updated_at: string
  latest_version: number
  latest_version_status: string
  submitted_count: number
  pending_count: number
}

/** Template detail — same as list row but used on the detail page. */
export type TemplateDetail = TemplateListRow

/** Instance row for the template detail page table. */
export interface InstanceRow {
  id: string
  readable_id: string
  group_id: string
  group_name: string
  status: string
  version_number: number
  created_at: string
  short_url_edit: string | null
}

/** Input for creating a new template via the form builder. */
export interface CreateTemplateInput {
  name: string
  description: string | null
  sections: CreateSectionInput[]
}

/** Input for a section in the form builder. */
export interface CreateSectionInput {
  title: string
  description: string | null
  sort_order: number
  fields: CreateFieldInput[]
}

/** Input for a field in the form builder. */
export interface CreateFieldInput {
  label: string
  description: string | null
  field_type: string
  sort_order: number
  is_required: boolean
  options: Json | null
  validation_rules: Json | null
}

/** Loaded template version with sections and fields for editing. */
export interface TemplateVersionData {
  template: {
    id: string
    name: string
    description: string | null
    status: string
  }
  version: {
    id: string
    version_number: number
    status: string
  }
  sections: LoadedSection[]
}

/** A loaded section with its fields. */
export interface LoadedSection {
  id: string
  title: string
  description: string | null
  sort_order: number
  fields: LoadedField[]
}

/** A loaded field from the database. */
export interface LoadedField {
  id: string
  label: string
  description: string | null
  field_type: string
  sort_order: number
  is_required: boolean
  options: Json | null
  validation_rules: Json | null
}

/** Row returned by the version history query. */
export interface VersionHistoryRow {
  id: string
  version_number: number
  is_latest: boolean
  restored_from: string | null
  status: string
  created_at: string
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Fetch all form templates visible to the current user (RLS-scoped),
 * with latest version number and instance counts.
 *
 * Uses the `templates_with_stats` view.
 * @param archived — when true, returns only archived (is_active=false) templates
 */
export async function fetchTemplates(
  archived = false,
): Promise<TemplateListRow[]> {
  const { data, error } = await supabase
    .from('templates_with_stats')
    .select('id, name, description, sharing_mode, status, is_active, created_at, updated_at, latest_version, latest_version_status, submitted_count, pending_count')
    .eq('is_active', !archived)
    .order('name')

  if (error) throw error

  // View columns are nullable (Postgres view inference), so coalesce here
  return (data ?? []).map((row) => ({
    id: row.id!,
    name: row.name!,
    description: row.description ?? null,
    sharing_mode: row.sharing_mode ?? 'all',
    status: row.status ?? 'draft',
    is_active: row.is_active ?? true,
    created_at: row.created_at!,
    updated_at: row.updated_at!,
    latest_version: row.latest_version ?? 0,
    latest_version_status: row.latest_version_status ?? 'draft',
    submitted_count: row.submitted_count ?? 0,
    pending_count: row.pending_count ?? 0,
  }))
}

/**
 * Fetch a single template by ID with stats.
 */
export async function fetchTemplateDetail(
  templateId: string,
): Promise<TemplateDetail> {
  const { data, error } = await supabase
    .from('templates_with_stats')
    .select('id, name, description, sharing_mode, status, is_active, created_at, updated_at, latest_version, latest_version_status, submitted_count, pending_count')
    .eq('id', templateId)
    .single()

  if (error) throw error

  return {
    id: data.id!,
    name: data.name!,
    description: data.description ?? null,
    sharing_mode: data.sharing_mode ?? 'all',
    status: data.status ?? 'draft',
    is_active: data.is_active ?? true,
    created_at: data.created_at!,
    updated_at: data.updated_at!,
    latest_version: data.latest_version ?? 0,
    latest_version_status: data.latest_version_status ?? 'draft',
    submitted_count: data.submitted_count ?? 0,
    pending_count: data.pending_count ?? 0,
  }
}

/**
 * Fetch form instances for a specific template (across all versions).
 * Joins group name and version number for display.
 */
export async function fetchTemplateInstances(
  templateId: string,
): Promise<InstanceRow[]> {
  const { data, error } = await supabase
    .from('form_instances')
    .select(`
      id,
      readable_id,
      short_url_edit,
      group_id,
      status,
      created_at,
      groups!form_instances_group_id_fkey ( name ),
      template_versions!form_instances_template_version_id_fkey ( version_number, template_id )
    `)
    .eq('template_versions.template_id', templateId)
    .eq('is_archived', false)
    .order('created_at', { ascending: false })

  if (error) throw error

  // Filter client-side since .eq on a joined column doesn't filter the parent rows
  // (it only filters the join result, returning null for non-matching joins)
  return (data ?? [])
    .filter((row) => row.template_versions !== null)
    .map((row) => {
      const group = row.groups as unknown as { name: string } | null
      const version = row.template_versions as unknown as {
        version_number: number
        template_id: string
      } | null

      return {
        id: row.id,
        readable_id: row.readable_id,
        group_id: row.group_id,
        group_name: group?.name ?? 'Unknown',
        status: row.status,
        version_number: version?.version_number ?? 0,
        created_at: row.created_at,
        short_url_edit: row.short_url_edit ?? null,
      }
    })
}

/**
 * Fetch the count of groups with access to a template.
 * For sharing_mode='all', returns total active groups.
 * For sharing_mode='restricted', returns count from template_group_access.
 */
export async function fetchGroupAccessCount(
  templateId: string,
  sharingMode: string,
): Promise<number> {
  if (sharingMode === 'all') {
    const { count, error } = await supabase
      .from('groups')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true)

    if (error) throw error
    return count ?? 0
  }

  const { count, error } = await supabase
    .from('template_group_access')
    .select('id', { count: 'exact', head: true })
    .eq('template_id', templateId)

  if (error) throw error
  return count ?? 0
}

/**
 * Check if a form template name is already taken (case-insensitive).
 * Only considers active templates.
 */
export async function isFormTemplateNameTaken(
  name: string,
): Promise<boolean> {
  const { count, error } = await supabase
    .from('form_templates')
    .select('id', { count: 'exact', head: true })
    .ilike('name', name.trim())
    .eq('is_active', true)

  if (error) throw error
  return (count ?? 0) > 0
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/**
 * Publish a new form template with its first version, sections, and fields.
 * Returns the created template ID.
 */
export async function createTemplate(
  input: CreateTemplateInput,
): Promise<string> {
  const user = await getCurrentAuthUser()

  // 1. Insert form_templates row
  const { data: template, error: tmplError } = await supabase
    .from('form_templates')
    .insert({
      name: input.name.trim(),
      description: input.description?.trim() || null,
      created_by: user.id,
      status: 'published',
    })
    .select('id')
    .single()

  if (tmplError) throw tmplError

  // 2. Insert template_versions row (version 1)
  const { data: version, error: verError } = await supabase
    .from('template_versions')
    .insert({
      template_id: template.id,
      version_number: 1,
      is_latest: true,
      created_by: user.id,
    })
    .select('id')
    .single()

  if (verError) throw verError

  // 3. Insert sections and fields
  for (const section of input.sections) {
    const { data: sec, error: secError } = await supabase
      .from('template_sections')
      .insert({
        template_version_id: version.id,
        title: section.title.trim(),
        description: section.description?.trim() || null,
        sort_order: section.sort_order,
      })
      .select('id')
      .single()

    if (secError) throw secError

    if (section.fields.length > 0) {
      const fieldRows = section.fields.map((f) => ({
        template_section_id: sec.id,
        label: f.label.trim(),
        description: f.description,
        field_type: f.field_type,
        sort_order: f.sort_order,
        is_required: f.is_required,
        options: f.options,
        validation_rules: f.validation_rules,
      }))

      const { error: fieldsError } = await supabase
        .from('template_fields')
        .insert(fieldRows)

      if (fieldsError) throw fieldsError
    }
  }

  return template.id
}

/**
 * Create a new version of an existing template (edit flow).
 * Sets current latest version to is_latest=false, creates a new version
 * with the provided sections and fields.
 * Returns the new template version ID.
 */
export async function createTemplateVersion(
  templateId: string,
  input: {
    name: string
    description: string | null
    sections: CreateSectionInput[]
  },
): Promise<string> {
  const user = await getCurrentAuthUser()

  // Update template name/description
  const { error: updateError } = await supabase
    .from('form_templates')
    .update({
      name: input.name.trim(),
      description: input.description?.trim() || null,
    })
    .eq('id', templateId)

  if (updateError) throw updateError

  // Get current latest version number
  const { data: currentVer, error: cvError } = await supabase
    .from('template_versions')
    .select('id, version_number')
    .eq('template_id', templateId)
    .eq('is_latest', true)
    .single()

  if (cvError) throw cvError

  // Set current version to not latest
  const { error: unlatestError } = await supabase
    .from('template_versions')
    .update({ is_latest: false })
    .eq('id', currentVer.id)

  if (unlatestError) throw unlatestError

  // Insert new version
  const newVersionNumber = currentVer.version_number + 1
  const { data: version, error: verError } = await supabase
    .from('template_versions')
    .insert({
      template_id: templateId,
      version_number: newVersionNumber,
      is_latest: true,
      created_by: user.id,
    })
    .select('id')
    .single()

  if (verError) throw verError

  // Insert sections and fields (same logic as createTemplate)
  for (const section of input.sections) {
    const { data: sec, error: secError } = await supabase
      .from('template_sections')
      .insert({
        template_version_id: version.id,
        title: section.title.trim(),
        description: section.description?.trim() || null,
        sort_order: section.sort_order,
      })
      .select('id')
      .single()

    if (secError) throw secError

    if (section.fields.length > 0) {
      const fieldRows = section.fields.map((f) => ({
        template_section_id: sec.id,
        label: f.label.trim(),
        description: f.description,
        field_type: f.field_type,
        sort_order: f.sort_order,
        is_required: f.is_required,
        options: f.options,
        validation_rules: f.validation_rules,
      }))

      const { error: fieldsError } = await supabase
        .from('template_fields')
        .insert(fieldRows)

      if (fieldsError) throw fieldsError
    }
  }

  return version.id
}

/**
 * Save a new form template as a draft with its first version, sections, and fields.
 * Returns the created template ID.
 */
export async function saveDraft(
  input: CreateTemplateInput,
): Promise<string> {
  const user = await getCurrentAuthUser()

  const { data: template, error: tmplError } = await supabase
    .from('form_templates')
    .insert({
      name: input.name.trim(),
      description: input.description?.trim() || null,
      created_by: user.id,
      status: 'draft',
    })
    .select('id')
    .single()

  if (tmplError) throw tmplError

  // Insert version 1
  const { data: version, error: verError } = await supabase
    .from('template_versions')
    .insert({
      template_id: template.id,
      version_number: 1,
      is_latest: true,
      created_by: user.id,
    })
    .select('id')
    .single()

  if (verError) throw verError

  // Insert sections and fields
  for (const section of input.sections) {
    const { data: sec, error: secError } = await supabase
      .from('template_sections')
      .insert({
        template_version_id: version.id,
        title: section.title.trim(),
        description: section.description?.trim() || null,
        sort_order: section.sort_order,
      })
      .select('id')
      .single()

    if (secError) throw secError

    if (section.fields.length > 0) {
      const fieldRows = section.fields.map((f) => ({
        template_section_id: sec.id,
        label: f.label.trim(),
        description: f.description,
        field_type: f.field_type,
        sort_order: f.sort_order,
        is_required: f.is_required,
        options: f.options,
        validation_rules: f.validation_rules,
      }))

      const { error: fieldsError } = await supabase
        .from('template_fields')
        .insert(fieldRows)

      if (fieldsError) throw fieldsError
    }
  }

  return template.id
}

/**
 * Update an existing draft template in-place (no new version).
 * Replaces all sections and fields with the provided data.
 */
export async function updateDraft(
  templateId: string,
  input: {
    name: string
    description: string | null
    sections: CreateSectionInput[]
  },
): Promise<void> {
  // Update template metadata
  const { error: updateError } = await supabase
    .from('form_templates')
    .update({
      name: input.name.trim(),
      description: input.description?.trim() || null,
    })
    .eq('id', templateId)

  if (updateError) throw updateError

  // Get the latest (only) version
  const { data: currentVer, error: cvError } = await supabase
    .from('template_versions')
    .select('id')
    .eq('template_id', templateId)
    .eq('is_latest', true)
    .single()

  if (cvError) throw cvError

  // Delete existing sections (cascades to fields via FK)
  const { error: delError } = await supabase
    .from('template_sections')
    .delete()
    .eq('template_version_id', currentVer.id)

  if (delError) throw delError

  // Re-insert sections and fields
  for (const section of input.sections) {
    const { data: sec, error: secError } = await supabase
      .from('template_sections')
      .insert({
        template_version_id: currentVer.id,
        title: section.title.trim(),
        description: section.description?.trim() || null,
        sort_order: section.sort_order,
      })
      .select('id')
      .single()

    if (secError) throw secError

    if (section.fields.length > 0) {
      const fieldRows = section.fields.map((f) => ({
        template_section_id: sec.id,
        label: f.label.trim(),
        description: f.description,
        field_type: f.field_type,
        sort_order: f.sort_order,
        is_required: f.is_required,
        options: f.options,
        validation_rules: f.validation_rules,
      }))

      const { error: fieldsError } = await supabase
        .from('template_fields')
        .insert(fieldRows)

      if (fieldsError) throw fieldsError
    }
  }
}

/**
 * Publish a draft template by setting its status to 'published'.
 * Also marks the latest version as 'published'.
 */
export async function publishDraft(templateId: string): Promise<void> {
  // Set template status to published
  const { error: tErr } = await supabase
    .from('form_templates')
    .update({ status: 'published' })
    .eq('id', templateId)

  if (tErr) throw tErr

  // Set the latest version status to published
  const { error: vErr } = await supabase
    .from('template_versions')
    .update({ status: 'published' })
    .eq('template_id', templateId)
    .eq('is_latest', true)

  if (vErr) throw vErr
}

/**
 * Delete a draft template that has never been published.
 * CASCADE handles versions → sections → fields.
 */
export async function deleteDraftTemplate(templateId: string): Promise<void> {
  const { error } = await supabase
    .from('form_templates')
    .delete()
    .eq('id', templateId)
    .eq('status', 'draft')

  if (error) throw error
}

/**
 * Hard-delete a template that has zero form instances.
 * CASCADE handles versions → sections → fields.
 * Also deletes group access entries.
 *
 * For templates WITH instances, use `archiveTemplate` or `hardDeleteTemplate`.
 */
export async function deleteTemplate(templateId: string): Promise<void> {
  // Safety: verify no instances exist before deleting
  const { count, error: countErr } = await supabase
    .from('form_instances')
    .select('id', { count: 'exact', head: true })
    .eq('template_id', templateId)

  if (countErr) throw countErr
  if ((count ?? 0) > 0) {
    throw new Error('Cannot hard-delete a template that has form instances')
  }

  // Delete group access entries first (no CASCADE from templates)
  const { error: gaErr } = await supabase
    .from('template_group_access')
    .delete()
    .eq('template_id', templateId)

  if (gaErr) throw gaErr

  // Delete the template (CASCADE handles versions → sections → fields)
  const { error } = await supabase
    .from('form_templates')
    .delete()
    .eq('id', templateId)

  if (error) throw error
}

/**
 * Archive a template (soft-delete) by setting is_active=false.
 * Also deactivates any active schedule for this template.
 */
export async function archiveTemplate(templateId: string): Promise<void> {
  const { error } = await supabase
    .from('form_templates')
    .update({ is_active: false })
    .eq('id', templateId)

  if (error) throw error

  // Deactivate any active schedule for this template
  const { error: schedErr } = await supabase
    .from('instance_schedules')
    .update({ is_active: false })
    .eq('template_id', templateId)

  if (schedErr) throw schedErr
}

/**
 * Restore an archived template by setting is_active=true.
 */
export async function restoreTemplate(templateId: string): Promise<void> {
  const { error } = await supabase
    .from('form_templates')
    .update({ is_active: true })
    .eq('id', templateId)

  if (error) throw error
}

/**
 * Hard-delete a template and ALL related data (instances, field values,
 * schedules, group access, versions, sections, fields).
 * Uses a Postgres SECURITY DEFINER function for transactional cascade.
 */
export async function hardDeleteTemplate(templateId: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.rpc as any)('hard_delete_template', {
    p_template_id: templateId,
  })

  if (error) throw error
}

/**
 * Discard the draft version of a published template.
 * Deletes the draft version (CASCADE handles sections/fields)
 * and restores the previous published version as latest.
 */
export async function discardDraftVersion(templateId: string): Promise<void> {
  // Find the draft version
  const { data: draftVer, error: findErr } = await supabase
    .from('template_versions')
    .select('id, version_number')
    .eq('template_id', templateId)
    .eq('status', 'draft')
    .eq('is_latest', true)
    .single()

  if (findErr) throw findErr

  // Delete draft version (CASCADE handles sections/fields)
  const { error: delErr } = await supabase
    .from('template_versions')
    .delete()
    .eq('id', draftVer.id)

  if (delErr) throw delErr

  // Restore previous published version as latest
  const { error: restoreErr } = await supabase
    .from('template_versions')
    .update({ is_latest: true })
    .eq('template_id', templateId)
    .eq('version_number', draftVer.version_number - 1)

  if (restoreErr) throw restoreErr
}

/**
 * Create a new draft version for a published template by copying
 * sections/fields from the current published version.
 * Returns the new version number.
 */
export async function createDraftVersion(
  templateId: string,
): Promise<{ versionNumber: number }> {
  const user = await getCurrentAuthUser()

  // Get current published version
  const { data: current, error: cvErr } = await supabase
    .from('template_versions')
    .select('id, version_number')
    .eq('template_id', templateId)
    .eq('is_latest', true)
    .eq('status', 'published')
    .single()

  if (cvErr) throw cvErr

  // Unset is_latest on current
  const { error: unErr } = await supabase
    .from('template_versions')
    .update({ is_latest: false })
    .eq('id', current.id)

  if (unErr) throw unErr

  // Create new draft version
  const newNum = current.version_number + 1
  const { data: newVer, error: nErr } = await supabase
    .from('template_versions')
    .insert({
      template_id: templateId,
      version_number: newNum,
      is_latest: true,
      status: 'draft',
      created_by: user.id,
    })
    .select('id')
    .single()

  if (nErr) throw nErr

  // Copy sections and fields from the current version
  const { data: sections, error: secErr } = await supabase
    .from('template_sections')
    .select('title, description, sort_order, template_fields(label, description, field_type, sort_order, is_required, options, validation_rules)')
    .eq('template_version_id', current.id)
    .order('sort_order')

  if (secErr) throw secErr

  for (const sec of sections ?? []) {
    const { data: newSec, error: nsErr } = await supabase
      .from('template_sections')
      .insert({
        template_version_id: newVer.id,
        title: sec.title,
        description: sec.description,
        sort_order: sec.sort_order,
      })
      .select('id')
      .single()

    if (nsErr) throw nsErr

    const fields = (sec.template_fields ?? []) as unknown as Array<{
      label: string
      description: string | null
      field_type: string
      sort_order: number
      is_required: boolean
      options: Json | null
      validation_rules: Json | null
    }>

    if (fields.length > 0) {
      const fieldRows = fields.map((f) => ({
        template_section_id: newSec.id,
        label: f.label,
        description: f.description,
        field_type: f.field_type,
        sort_order: f.sort_order,
        is_required: f.is_required,
        options: f.options,
        validation_rules: f.validation_rules,
      }))

      const { error: fErr } = await supabase
        .from('template_fields')
        .insert(fieldRows)

      if (fErr) throw fErr
    }
  }

  return { versionNumber: newNum }
}

// ---------------------------------------------------------------------------
// Group Access
// ---------------------------------------------------------------------------

/** A group with its access status for a specific template. */
export interface GroupAccessRow {
  group_id: string
  group_name: string
  has_access: boolean
}

/**
 * Fetch all active groups with their access status for a template.
 *
 * For each group, `has_access` is true if a `template_group_access` row
 * exists for the template. When `sharing_mode` is `'all'`, every group
 * is treated as having access (no individual access rows are stored).
 * Results are ordered alphabetically by group name.
 */
export async function fetchGroupsWithAccess(
  templateId: string,
  sharingMode?: string,
): Promise<GroupAccessRow[]> {
  // Fetch all active groups
  const { data: groups, error: groupsError } = await supabase
    .from('groups')
    .select('id, name')
    .eq('is_active', true)
    .order('name')

  if (groupsError) throw groupsError

  // When sharing_mode is 'all', every group has access
  if (sharingMode === 'all') {
    return (groups ?? []).map((g) => ({
      group_id: g.id,
      group_name: g.name,
      has_access: true,
    }))
  }

  // Fetch existing access rows for this template
  const { data: accessRows, error: accessError } = await supabase
    .from('template_group_access')
    .select('group_id')
    .eq('template_id', templateId)

  if (accessError) throw accessError

  const accessSet = new Set((accessRows ?? []).map((r) => r.group_id))

  return (groups ?? []).map((g) => ({
    group_id: g.id,
    group_name: g.name,
    has_access: accessSet.has(g.id),
  }))
}

/**
 * Update sharing access for a template.
 *
 * Sets `sharing_mode` to `'restricted'` and replaces all access rows
 * with the provided group IDs. If all active groups are selected, sets
 * `sharing_mode` to `'all'` and clears the access table (optimisation).
 */
export async function updateTemplateAccess(
  templateId: string,
  selectedGroupIds: string[],
  totalActiveGroups: number,
): Promise<void> {
  const allSelected = selectedGroupIds.length === totalActiveGroups

  // Update sharing_mode
  const { error: modeError } = await supabase
    .from('form_templates')
    .update({ sharing_mode: allSelected ? 'all' : 'restricted' })
    .eq('id', templateId)

  if (modeError) throw modeError

  // Delete all existing access rows for this template
  const { error: deleteError } = await supabase
    .from('template_group_access')
    .delete()
    .eq('template_id', templateId)

  if (deleteError) throw deleteError

  // If restricted, insert new access rows
  if (!allSelected && selectedGroupIds.length > 0) {
    const rows = selectedGroupIds.map((group_id) => ({
      template_id: templateId,
      group_id,
    }))

    const { error: insertError } = await supabase
      .from('template_group_access')
      .insert(rows)

    if (insertError) throw insertError
  }
}

/**
 * Fetch the latest version of a template with all sections and fields.
 * Used to load a template into the form builder for editing.
 *
 * For published templates: prefers a draft version (is_latest + status='draft')
 * if one exists, otherwise loads the published latest version.
 */
export async function fetchTemplateForEditing(
  templateId: string,
): Promise<TemplateVersionData> {
  // Fetch the template
  const { data: template, error: tmplError } = await supabase
    .from('form_templates')
    .select('id, name, description, status')
    .eq('id', templateId)
    .single()

  if (tmplError) throw tmplError

  // Fetch the latest version (which is the draft if one exists)
  const { data: version, error: verError } = await supabase
    .from('template_versions')
    .select('id, version_number, status')
    .eq('template_id', templateId)
    .eq('is_latest', true)
    .single()

  if (verError) throw verError

  // Fetch sections ordered by sort_order
  const { data: sections, error: secError } = await supabase
    .from('template_sections')
    .select('id, title, description, sort_order')
    .eq('template_version_id', version.id)
    .order('sort_order')

  if (secError) throw secError

  // Fetch all fields for this version's sections
  const sectionIds = (sections ?? []).map((s) => s.id)
  let allFields: {
    id: string
    template_section_id: string
    label: string
    description: string | null
    field_type: string
    sort_order: number
    is_required: boolean
    options: Json | null
    validation_rules: Json | null
  }[] = []

  if (sectionIds.length > 0) {
    const { data: fields, error: fieldsError } = await supabase
      .from('template_fields')
      .select('id, template_section_id, label, description, field_type, sort_order, is_required, options, validation_rules')
      .in('template_section_id', sectionIds)
      .order('sort_order')

    if (fieldsError) throw fieldsError
    allFields = fields ?? []
  }

  // Group fields by section
  const loadedSections: LoadedSection[] = (sections ?? []).map((s) => ({
    id: s.id,
    title: s.title,
    description: s.description,
    sort_order: s.sort_order,
    fields: allFields
      .filter((f) => f.template_section_id === s.id)
      .map((f) => ({
        id: f.id,
        label: f.label,
        description: f.description,
        field_type: f.field_type,
        sort_order: f.sort_order,
        is_required: f.is_required ?? false,
        options: f.options,
        validation_rules: f.validation_rules,
      })),
  }))

  return {
    template: {
      id: template.id,
      name: template.name,
      description: template.description,
      status: template.status,
    },
    version: {
      id: version.id,
      version_number: version.version_number,
      status: version.status,
    },
    sections: loadedSections,
  }
}

// ---------------------------------------------------------------------------
// Version History
// ---------------------------------------------------------------------------

/**
 * Fetch the published version history for a template, newest first.
 * Optionally filter by a date range.
 */
export async function fetchVersionHistory(
  templateId: string,
  dateRange?: { from?: Date; to?: Date },
): Promise<VersionHistoryRow[]> {
  let query = supabase
    .from('template_versions')
    .select('id, version_number, is_latest, restored_from, status, created_at')
    .eq('template_id', templateId)
    .eq('status', 'published')
    .order('version_number', { ascending: false })

  if (dateRange?.from) {
    query = query.gte('created_at', dateRange.from.toISOString())
  }
  if (dateRange?.to) {
    // Set to end of day for inclusive filtering
    const endOfDay = new Date(dateRange.to)
    endOfDay.setHours(23, 59, 59, 999)
    query = query.lte('created_at', endOfDay.toISOString())
  }

  const { data, error } = await query

  if (error) throw error
  return data ?? []
}

/**
 * Restore a previous version by creating a new published version that
 * deep-copies sections and fields from the source version.
 *
 * Follows the same deep-copy pattern as `createDraftVersion`.
 */
export async function restoreVersion(
  templateId: string,
  sourceVersionId: string,
): Promise<{ versionNumber: number; sourceVersionNumber: number }> {
  const user = await getCurrentAuthUser()

  // Get the source version's number for the return value
  const { data: sourceVer, error: svErr } = await supabase
    .from('template_versions')
    .select('version_number')
    .eq('id', sourceVersionId)
    .single()

  if (svErr) throw svErr

  // Get current latest version to determine new version number
  const { data: current, error: cvErr } = await supabase
    .from('template_versions')
    .select('id, version_number')
    .eq('template_id', templateId)
    .eq('is_latest', true)
    .eq('status', 'published')
    .single()

  if (cvErr) throw cvErr

  // Unset is_latest on current version
  const { error: unErr } = await supabase
    .from('template_versions')
    .update({ is_latest: false })
    .eq('id', current.id)

  if (unErr) throw unErr

  // Create new version as published, with restored_from pointing to source
  const newNum = current.version_number + 1
  const { data: newVer, error: nErr } = await supabase
    .from('template_versions')
    .insert({
      template_id: templateId,
      version_number: newNum,
      is_latest: true,
      status: 'published',
      restored_from: sourceVersionId,
      created_by: user.id,
    })
    .select('id')
    .single()

  if (nErr) throw nErr

  // Deep-copy sections and fields from the source version
  const { data: sections, error: secErr } = await supabase
    .from('template_sections')
    .select('title, description, sort_order, template_fields(label, description, field_type, sort_order, is_required, options, validation_rules)')
    .eq('template_version_id', sourceVersionId)
    .order('sort_order')

  if (secErr) throw secErr

  for (const sec of sections ?? []) {
    const { data: newSec, error: nsErr } = await supabase
      .from('template_sections')
      .insert({
        template_version_id: newVer.id,
        title: sec.title,
        description: sec.description,
        sort_order: sec.sort_order,
      })
      .select('id')
      .single()

    if (nsErr) throw nsErr

    const fields = (sec.template_fields ?? []) as unknown as Array<{
      label: string
      description: string | null
      field_type: string
      sort_order: number
      is_required: boolean
      options: Json | null
      validation_rules: Json | null
    }>

    if (fields.length > 0) {
      const fieldRows = fields.map((f) => ({
        template_section_id: newSec.id,
        label: f.label,
        description: f.description,
        field_type: f.field_type,
        sort_order: f.sort_order,
        is_required: f.is_required,
        options: f.options,
        validation_rules: f.validation_rules,
      }))

      const { error: fErr } = await supabase
        .from('template_fields')
        .insert(fieldRows)

      if (fErr) throw fErr
    }
  }

  return { versionNumber: newNum, sourceVersionNumber: sourceVer.version_number }
}

// ---------------------------------------------------------------------------
// Form Instance helpers
// ---------------------------------------------------------------------------

/**
 * Generate a random 10-char alphanumeric readable_id.
 * Matches the pattern used by the DB cron function.
 */
function generateReadableId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < 10; i++) {
    result += chars[Math.floor(Math.random() * chars.length)]
  }
  return result
}

// ---------------------------------------------------------------------------
// Form Instance types
// ---------------------------------------------------------------------------

/** Simple group row for group selection tables. */
export interface SimpleGroup {
  id: string
  name: string
}

/** A created instance row returned after bulk-creating instances. */
export interface CreatedInstance {
  id: string
  readable_id: string
  group_id: string
  short_url_edit: string | null
}

/** Schedule data loaded for edit / display. */
export interface ScheduleData {
  id: string
  start_date: string
  repeat_interval: string
  repeat_every: number
  days_of_week: string[] | null
  is_active: boolean
  next_run_at: string
  group_ids: string[]
}

/** Input for creating a new instance schedule. */
export interface CreateScheduleInput {
  templateId: string
  startDate: string
  repeatInterval: string
  repeatEvery: number
  daysOfWeek: string[] | null
  groupIds: string[]
}

/** Input for updating an existing instance schedule. */
export interface UpdateScheduleInput {
  scheduleId: string
  startDate: string
  repeatInterval: string
  repeatEvery: number
  daysOfWeek: string[] | null
  groupIds: string[]
}

// ---------------------------------------------------------------------------
// Form Instance queries
// ---------------------------------------------------------------------------

/**
 * Fetch all active groups (id + name) for group selection tables.
 */
export async function fetchActiveGroups(): Promise<SimpleGroup[]> {
  const { data, error } = await supabase
    .from('groups')
    .select('id, name')
    .eq('is_active', true)
    .order('name')

  if (error) throw error
  return data ?? []
}

/**
 * Create one form instance per selected group, using the latest published
 * template version. Returns the created instances.
 */
export async function createFormInstances(
  templateId: string,
  groupIds: string[],
): Promise<CreatedInstance[]> {
  const user = await getCurrentAuthUser()

  // Get latest published version
  const { data: version, error: vErr } = await supabase
    .from('template_versions')
    .select('id')
    .eq('template_id', templateId)
    .eq('status', 'published')
    .order('version_number', { ascending: false })
    .limit(1)
    .single()

  if (vErr || !version) throw vErr ?? new Error('No published version found')

  // Build insert rows — one per group
  const rows = groupIds.map((groupId) => ({
    readable_id: generateReadableId(),
    template_version_id: version.id,
    group_id: groupId,
    created_by: user.id,
  }))

  const { data, error } = await supabase
    .from('form_instances')
    .insert(rows)
    .select('id, readable_id, group_id, short_url_edit')

  if (error) throw error
  return data ?? []
}

// ---------------------------------------------------------------------------
// Schedule queries
// ---------------------------------------------------------------------------

/**
 * Fetch the existing schedule for a template (one-to-one), including group targets.
 * Returns null if no schedule exists.
 */
export async function fetchTemplateSchedule(
  templateId: string,
): Promise<ScheduleData | null> {
  const { data, error } = await supabase
    .from('instance_schedules')
    .select('id, start_date, repeat_interval, repeat_every, days_of_week, is_active, next_run_at')
    .eq('template_id', templateId)
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  // Fetch group targets
  const { data: targets, error: tErr } = await supabase
    .from('schedule_group_targets')
    .select('group_id')
    .eq('schedule_id', data.id)

  if (tErr) throw tErr

  return {
    ...data,
    days_of_week: data.days_of_week as string[] | null,
    group_ids: (targets ?? []).map((t) => t.group_id),
  }
}

/**
 * Create a new instance schedule with group targets.
 */
export async function createInstanceSchedule(
  input: CreateScheduleInput,
): Promise<void> {
  const user = await getCurrentAuthUser()

  const { data: schedule, error: sErr } = await supabase
    .from('instance_schedules')
    .insert({
      template_id: input.templateId,
      start_date: input.startDate,
      repeat_interval: input.repeatInterval,
      repeat_every: input.repeatEvery,
      days_of_week: input.daysOfWeek,
      next_run_at: input.startDate,
      created_by: user.id,
    })
    .select('id')
    .single()

  if (sErr || !schedule) throw sErr ?? new Error('Failed to create schedule')

  // Insert group targets
  if (input.groupIds.length > 0) {
    const targets = input.groupIds.map((groupId) => ({
      schedule_id: schedule.id,
      group_id: groupId,
    }))

    const { error: tErr } = await supabase
      .from('schedule_group_targets')
      .insert(targets)

    if (tErr) throw tErr
  }
}

/**
 * Update an existing instance schedule and replace its group targets.
 */
export async function updateInstanceSchedule(
  input: UpdateScheduleInput,
): Promise<void> {
  const { error: sErr } = await supabase
    .from('instance_schedules')
    .update({
      start_date: input.startDate,
      repeat_interval: input.repeatInterval,
      repeat_every: input.repeatEvery,
      days_of_week: input.daysOfWeek,
      next_run_at: input.startDate,
    })
    .eq('id', input.scheduleId)

  if (sErr) throw sErr

  // Replace group targets: delete all, then re-insert
  const { error: dErr } = await supabase
    .from('schedule_group_targets')
    .delete()
    .eq('schedule_id', input.scheduleId)

  if (dErr) throw dErr

  if (input.groupIds.length > 0) {
    const targets = input.groupIds.map((groupId) => ({
      schedule_id: input.scheduleId,
      group_id: groupId,
    }))

    const { error: tErr } = await supabase
      .from('schedule_group_targets')
      .insert(targets)

    if (tErr) throw tErr
  }
}

/**
 * Delete an instance schedule. CASCADE deletes group targets.
 */
export async function deleteInstanceSchedule(
  scheduleId: string,
): Promise<void> {
  const { error } = await supabase
    .from('instance_schedules')
    .delete()
    .eq('id', scheduleId)

  if (error) throw error
}

// ---------------------------------------------------------------------------
// Instance Page types
// ---------------------------------------------------------------------------

/** Full instance data loaded for the instance page. */
export interface InstancePageData {
  instance: {
    id: string
    readable_id: string
    status: 'pending' | 'submitted'
    group_id: string
    group_name: string
    admin_only_submit: boolean
    created_at: string
    submitted_at: string | null
    submitted_by: string | null
    template_version_id: string
  }
  template: {
    id: string
    name: string
    description: string | null
    version_number: number
  }
  sections: InstanceSection[]
}

export interface InstanceSection {
  id: string
  title: string
  description: string | null
  sort_order: number
  fields: InstanceField[]
}

export interface InstanceField {
  id: string
  label: string
  description: string | null
  field_type: string
  sort_order: number
  is_required: boolean
  options: string[] | null
  validation_rules: Record<string, unknown> | null
}

export interface FieldValue {
  id: string
  template_field_id: string
  value: string | null
  assigned_to: string | null
  assigned_by: string | null
  change_log: ChangeLogEntry[]
  updated_by: string
  updated_at: string
}

export interface ChangeLogEntry {
  old_value: string | null
  new_value: string | null
  changed_by: string
  changed_by_name?: string
  changed_at: string
}

export interface GroupMember {
  id: string
  full_name: string
  role: string
}

// ---------------------------------------------------------------------------
// Instance Page queries
// ---------------------------------------------------------------------------

/**
 * Fetch full instance page data by readable_id.
 * Assembles instance metadata, template info, sections, and fields.
 */
export async function fetchInstanceByReadableId(
  readableId: string,
): Promise<InstancePageData> {
  // 1. Fetch instance with group name
  const { data: instance, error: instErr } = await supabase
    .from('form_instances')
    .select(`
      id,
      readable_id,
      status,
      group_id,
      admin_only_submit,
      created_at,
      submitted_at,
      submitted_by,
      template_version_id,
      groups!form_instances_group_id_fkey ( name )
    `)
    .eq('readable_id', readableId)
    .single()

  if (instErr) throw instErr

  const group = instance.groups as unknown as { name: string } | null

  // 2. Fetch template version with template name/description
  const { data: version, error: verErr } = await supabase
    .from('template_versions')
    .select(`
      id,
      version_number,
      form_templates!template_versions_template_id_fkey ( id, name, description )
    `)
    .eq('id', instance.template_version_id)
    .single()

  if (verErr) throw verErr

  const tmpl = version.form_templates as unknown as {
    id: string
    name: string
    description: string | null
  } | null

  // 3. Fetch sections for this template version
  const { data: sections, error: secErr } = await supabase
    .from('template_sections')
    .select('id, title, description, sort_order')
    .eq('template_version_id', instance.template_version_id)
    .order('sort_order')

  if (secErr) throw secErr

  // 4. Fetch fields for all sections
  const sectionIds = (sections ?? []).map((s) => s.id)
  let allFields: Array<{
    id: string
    template_section_id: string
    label: string
    description: string | null
    field_type: string
    sort_order: number
    is_required: boolean
    options: Json | null
    validation_rules: Json | null
  }> = []

  if (sectionIds.length > 0) {
    const { data: fields, error: fieldsErr } = await supabase
      .from('template_fields')
      .select('id, template_section_id, label, description, field_type, sort_order, is_required, options, validation_rules')
      .in('template_section_id', sectionIds)
      .order('sort_order')

    if (fieldsErr) throw fieldsErr
    allFields = fields ?? []
  }

  // 5. Group fields by section
  const assembledSections: InstanceSection[] = (sections ?? []).map((s) => ({
    id: s.id,
    title: s.title,
    description: s.description,
    sort_order: s.sort_order,
    fields: allFields
      .filter((f) => f.template_section_id === s.id)
      .map((f) => ({
        id: f.id,
        label: f.label,
        description: f.description,
        field_type: f.field_type,
        sort_order: f.sort_order,
        is_required: f.is_required ?? false,
        options: f.options as string[] | null,
        validation_rules: f.validation_rules as Record<string, unknown> | null,
      })),
  }))

  return {
    instance: {
      id: instance.id,
      readable_id: instance.readable_id,
      status: instance.status as 'pending' | 'submitted',
      group_id: instance.group_id,
      group_name: group?.name ?? 'Unknown',
      admin_only_submit: instance.admin_only_submit,
      created_at: instance.created_at,
      submitted_at: instance.submitted_at,
      submitted_by: instance.submitted_by,
      template_version_id: instance.template_version_id,
    },
    template: {
      id: tmpl?.id ?? '',
      name: tmpl?.name ?? 'Unknown',
      description: tmpl?.description ?? null,
      version_number: version.version_number,
    },
    sections: assembledSections,
  }
}

/**
 * Fetch all field values for an instance.
 * Parses the change_log JSONB column to typed array.
 */
export async function fetchFieldValues(
  instanceId: string,
): Promise<FieldValue[]> {
  const { data, error } = await supabase
    .from('field_values')
    .select('id, template_field_id, value, assigned_to, assigned_by, change_log, updated_by, updated_at')
    .eq('form_instance_id', instanceId)

  if (error) throw error

  return (data ?? []).map((row) => ({
    id: row.id,
    template_field_id: row.template_field_id,
    value: row.value,
    assigned_to: row.assigned_to,
    assigned_by: row.assigned_by,
    change_log: (row.change_log ?? []) as unknown as ChangeLogEntry[],
    updated_by: row.updated_by,
    updated_at: row.updated_at,
  }))
}

// ---------------------------------------------------------------------------
// Instance Page mutations
// ---------------------------------------------------------------------------

/**
 * Upsert a field value for an instance.
 * Uses a Postgres function for atomic INSERT ... ON CONFLICT with
 * change_log append, eliminating the read-modify-write race condition.
 */
export async function upsertFieldValue(
  instanceId: string,
  fieldId: string,
  value: string | null,
  oldValue: string | null,
): Promise<FieldValue> {
  const user = await getCurrentAuthUser()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)('upsert_field_value', {
    p_instance_id: instanceId,
    p_field_id: fieldId,
    p_value: value,
    p_old_value: oldValue,
    p_user_id: user.id,
  })
    .single()

  if (error) throw error

  const row = data as unknown as {
    id: string
    template_field_id: string
    value: string | null
    assigned_to: string | null
    assigned_by: string | null
    change_log: unknown
    updated_by: string
    updated_at: string
  }

  return {
    id: row.id,
    template_field_id: row.template_field_id,
    value: row.value,
    assigned_to: row.assigned_to,
    assigned_by: row.assigned_by,
    change_log: (row.change_log ?? []) as unknown as ChangeLogEntry[],
    updated_by: row.updated_by,
    updated_at: row.updated_at,
  }
}

/**
 * Assign (or unassign) a field to a user within an instance.
 * If assignTo is null, clears both assigned_to and assigned_by (unassign).
 * Creates a field_values row with value=null if none exists yet.
 */
export async function assignField(
  instanceId: string,
  fieldId: string,
  assignTo: string | null,
): Promise<void> {
  const user = await getCurrentAuthUser()

  // Check if a field_values row already exists
  const { data: existing, error: findErr } = await supabase
    .from('field_values')
    .select('id')
    .eq('form_instance_id', instanceId)
    .eq('template_field_id', fieldId)
    .maybeSingle()

  if (findErr) throw findErr

  if (existing) {
    // Update existing row
    const { error } = await supabase
      .from('field_values')
      .update({
        assigned_to: assignTo,
        assigned_by: assignTo ? user.id : null,
      })
      .eq('id', existing.id)

    if (error) throw error
    return
  }

  // Create new row with value=null
  const { error } = await supabase
    .from('field_values')
    .insert({
      form_instance_id: instanceId,
      template_field_id: fieldId,
      value: null,
      assigned_to: assignTo,
      assigned_by: assignTo ? user.id : null,
      updated_by: user.id,
    })

  if (error) throw error
}

/**
 * Submit a form instance — sets status to 'submitted' with timestamp.
 */
export async function submitInstance(
  instanceId: string,
): Promise<void> {
  const user = await getCurrentAuthUser()

  const { error } = await supabase
    .from('form_instances')
    .update({
      status: 'submitted',
      submitted_by: user.id,
      submitted_at: new Date().toISOString(),
    })
    .eq('id', instanceId)

  if (error) throw error
}

/**
 * Toggle admin_only_submit on a form instance.
 * Only admin and root_admin can call this (enforced by RLS).
 */
export async function toggleAdminOnlySubmit(
  instanceId: string,
  adminOnly: boolean,
): Promise<void> {
  const { error } = await supabase
    .from('form_instances')
    .update({ admin_only_submit: adminOnly })
    .eq('id', instanceId)

  if (error) throw error
}

// ---------------------------------------------------------------------------
// File upload helpers
// ---------------------------------------------------------------------------

export interface UploadedFile {
  path: string
  name: string
  size: number
}

/**
 * Upload a file to the form-uploads storage bucket.
 * Returns the file metadata for storing in field_values.value.
 */
export async function uploadInstanceFile(
  instanceId: string,
  fieldId: string,
  file: File,
): Promise<UploadedFile> {
  const timestamp = Date.now()
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const storagePath = `${instanceId}/${fieldId}/${timestamp}-${safeName}`

  const { error } = await supabase.storage
    .from('form-uploads')
    .upload(storagePath, file)

  if (error) throw error

  return {
    path: storagePath,
    name: file.name,
    size: file.size,
  }
}

/**
 * Remove a file from the form-uploads storage bucket.
 */
export async function removeInstanceFile(storagePath: string): Promise<void> {
  const { error } = await supabase.storage
    .from('form-uploads')
    .remove([storagePath])

  if (error) throw error
}

/**
 * Get a signed download URL for a file in form-uploads.
 * URL expires in 60 minutes.
 */
export async function getFileDownloadUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from('form-uploads')
    .createSignedUrl(storagePath, 3600)

  if (error) throw error
  return data.signedUrl
}

/**
 * Fetch group members (admin + editor roles) for field assignment.
 * Ordered alphabetically by full_name.
 */
export async function fetchGroupMembers(
  groupId: string,
): Promise<GroupMember[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .eq('group_id', groupId)
    .in('role', ['admin', 'editor'])
    .order('full_name')

  if (error) throw error

  return (data ?? []).map((row) => ({
    id: row.id,
    full_name: row.full_name,
    role: row.role,
  }))
}

// ---------------------------------------------------------------------------
// Fetch published form template fields (for report editor)
// ---------------------------------------------------------------------------

/**
 * Fetch fields from the **published** version of a form template.
 *
 * Unlike `fetchTemplateForEditing` (which may load a draft), this always
 * returns field IDs from the current published version — matching the IDs
 * stored in `field_values` for form instances created against that version.
 *
 * Used by the report editor to ensure formula expressions reference the
 * correct field IDs.
 */
export async function fetchPublishedFormFields(
  formTemplateId: string,
): Promise<LoadedSection[]> {
  // Get the latest published version
  const { data: version, error: vErr } = await supabase
    .from('template_versions')
    .select('id')
    .eq('template_id', formTemplateId)
    .eq('status', 'published')
    .order('version_number', { ascending: false })
    .limit(1)
    .single()

  if (vErr || !version) throw vErr ?? new Error('No published version found')

  // Fetch sections
  const { data: sections, error: secErr } = await supabase
    .from('template_sections')
    .select('id, title, description, sort_order')
    .eq('template_version_id', version.id)
    .order('sort_order')

  if (secErr) throw secErr

  // Fetch fields
  const sectionIds = (sections ?? []).map((s) => s.id)
  let allFields: {
    id: string
    template_section_id: string
    label: string
    description: string | null
    field_type: string
    sort_order: number
    is_required: boolean
    options: Json | null
    validation_rules: Json | null
  }[] = []

  if (sectionIds.length > 0) {
    const { data: fields, error: fieldsErr } = await supabase
      .from('template_fields')
      .select('id, template_section_id, label, description, field_type, sort_order, is_required, options, validation_rules')
      .in('template_section_id', sectionIds)
      .order('sort_order')

    if (fieldsErr) throw fieldsErr
    allFields = fields ?? []
  }

  return (sections ?? []).map((s) => ({
    id: s.id,
    title: s.title,
    description: s.description,
    sort_order: s.sort_order,
    fields: allFields
      .filter((f) => f.template_section_id === s.id)
      .map((f) => ({
        id: f.id,
        label: f.label,
        description: f.description,
        field_type: f.field_type,
        sort_order: f.sort_order,
        is_required: f.is_required ?? false,
        options: f.options,
        validation_rules: f.validation_rules,
      })),
  }))
}
