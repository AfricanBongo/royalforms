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
  abbreviation: string
  description: string | null
  sharing_mode: string
  status: string
  is_active: boolean
  created_at: string
  updated_at: string
  latest_version: number
  submitted_count: number
  pending_count: number
}

/** Template detail — same as list row but used on the detail page. */
export type TemplateDetail = TemplateListRow

/** Instance row for the template detail page table. */
export interface InstanceRow {
  id: string
  readable_id: string
  group_name: string
  status: string
  version_number: number
  created_at: string
}

/** Input for creating a new template via the form builder. */
export interface CreateTemplateInput {
  name: string
  abbreviation: string
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
    abbreviation: string
    description: string | null
  }
  version: {
    id: string
    version_number: number
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

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Fetch all form templates visible to the current user (RLS-scoped),
 * with latest version number and instance counts.
 *
 * Uses the `templates_with_stats` view.
 */
export async function fetchTemplates(): Promise<TemplateListRow[]> {
  const { data, error } = await supabase
    .from('templates_with_stats')
    .select('id, name, abbreviation, description, sharing_mode, status, is_active, created_at, updated_at, latest_version, submitted_count, pending_count')
    .order('name')

  if (error) throw error

  // View columns are nullable (Postgres view inference), so coalesce here
  return (data ?? []).map((row) => ({
    id: row.id!,
    name: row.name!,
    abbreviation: row.abbreviation!,
    description: row.description ?? null,
    sharing_mode: row.sharing_mode ?? 'all',
    status: row.status ?? 'draft',
    is_active: row.is_active ?? true,
    created_at: row.created_at!,
    updated_at: row.updated_at!,
    latest_version: row.latest_version ?? 0,
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
    .select('id, name, abbreviation, description, sharing_mode, status, is_active, created_at, updated_at, latest_version, submitted_count, pending_count')
    .eq('id', templateId)
    .single()

  if (error) throw error

  return {
    id: data.id!,
    name: data.name!,
    abbreviation: data.abbreviation!,
    description: data.description ?? null,
    sharing_mode: data.sharing_mode ?? 'all',
    status: data.status ?? 'draft',
    is_active: data.is_active ?? true,
    created_at: data.created_at!,
    updated_at: data.updated_at!,
    latest_version: data.latest_version ?? 0,
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
        group_name: group?.name ?? 'Unknown',
        status: row.status,
        version_number: version?.version_number ?? 0,
        created_at: row.created_at,
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
      abbreviation: input.abbreviation.trim().toLowerCase(),
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
      abbreviation: input.abbreviation.trim().toLowerCase(),
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
    abbreviation: string
    description: string | null
    sections: CreateSectionInput[]
  },
): Promise<void> {
  // Update template metadata
  const { error: updateError } = await supabase
    .from('form_templates')
    .update({
      name: input.name.trim(),
      abbreviation: input.abbreviation.trim().toLowerCase(),
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
 */
export async function publishDraft(templateId: string): Promise<void> {
  const { error } = await supabase
    .from('form_templates')
    .update({ status: 'published' })
    .eq('id', templateId)

  if (error) throw error
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
 * exists for the template. Results are ordered alphabetically by group name.
 */
export async function fetchGroupsWithAccess(
  templateId: string,
): Promise<GroupAccessRow[]> {
  // Fetch all active groups
  const { data: groups, error: groupsError } = await supabase
    .from('groups')
    .select('id, name')
    .eq('is_active', true)
    .order('name')

  if (groupsError) throw groupsError

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
 */
export async function fetchTemplateForEditing(
  templateId: string,
): Promise<TemplateVersionData> {
  // Fetch the template
  const { data: template, error: tmplError } = await supabase
    .from('form_templates')
    .select('id, name, abbreviation, description')
    .eq('id', templateId)
    .single()

  if (tmplError) throw tmplError

  // Fetch the latest version
  const { data: version, error: verError } = await supabase
    .from('template_versions')
    .select('id, version_number')
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
      abbreviation: template.abbreviation,
      description: template.description,
    },
    version: {
      id: version.id,
      version_number: version.version_number,
    },
    sections: loadedSections,
  }
}
