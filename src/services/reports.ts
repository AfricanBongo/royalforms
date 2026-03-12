/**
 * Reports service — data access for report templates and instances.
 * Template CRUD uses the Supabase Client SDK (RLS enforced).
 * Report generation and export use Edge Functions.
 */
import { supabase } from './supabase'
import { getCurrentAuthUser } from './auth'

import type { Json } from '../types/database'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Row for the report templates list page. */
export interface ReportTemplateListRow {
  id: string
  name: string
  abbreviation: string
  description: string | null
  is_active: boolean
  auto_generate: boolean
  status: 'draft' | 'published'
  form_template_id: string
  form_template_name: string
  instance_count: number
  latest_version_number: number
  created_at: string
  updated_at: string
}

/** Full report template detail — includes latest version, sections, fields. */
export interface ReportTemplateDetail {
  id: string
  name: string
  abbreviation: string
  description: string | null
  is_active: boolean
  auto_generate: boolean
  status: 'draft' | 'published'
  form_template_id: string
  form_template_name: string
  instance_counter: number
  created_at: string
  updated_at: string
  latest_version: {
    id: string
    version_number: number
    status: 'draft' | 'published'
    created_at: string
  }
  sections: ReportSection[]
}

export interface ReportSection {
  id: string
  title: string
  description: string | null
  sort_order: number
  fields: ReportField[]
}

export interface ReportField {
  id: string
  label: string
  field_type: string
  sort_order: number
  config: Record<string, unknown>
}

/** Version history entry. */
export interface ReportVersionRow {
  id: string
  version_number: number
  is_latest: boolean
  restored_from: string | null
  created_by: string
  created_by_name: string
  created_at: string
}

/** Report instance list row. */
export interface ReportInstanceListRow {
  id: string
  readable_id: string
  status: string
  short_url: string | null
  created_by: string
  created_by_name: string
  created_at: string
}

/** Full report instance detail. */
export interface ReportInstanceDetail {
  id: string
  readable_id: string
  status: string
  error_message: string | null
  short_url: string | null
  data_snapshot: Record<string, unknown> | null
  form_instances_included: string[]
  export_pdf_path: string | null
  export_docx_path: string | null
  report_template_name: string
  version_number: number
  created_at: string
}

/** Input for creating a report template. */
export interface CreateReportTemplateInput {
  form_template_id: string
  name: string
  abbreviation: string
  description: string | null
  auto_generate: boolean
  sections: CreateReportSectionInput[]
}

export interface CreateReportSectionInput {
  title: string
  description: string | null
  sort_order: number
  fields: CreateReportFieldInput[]
}

export interface CreateReportFieldInput {
  label: string
  field_type: string
  sort_order: number
  config: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Fetch all report templates with stats for the list page.
 * Root Admin only (RLS enforces).
 */
export async function fetchReportTemplates(): Promise<ReportTemplateListRow[]> {
  const { data, error } = await supabase
    .from('report_templates')
    .select(`
      id, name, abbreviation, description, is_active, auto_generate, status,
      form_template_id, created_at, updated_at,
      form_templates!inner ( name ),
      report_template_versions ( version_number, is_latest, report_instances ( id ) )
    `)
    .order('created_at', { ascending: false })

  if (error) throw error

  return (data ?? []).map((row) => {
    const ft = row.form_templates as unknown as { name: string }
    const versions = row.report_template_versions as unknown as Array<{
      version_number: number
      is_latest: boolean
      report_instances: Array<{ id: string }>
    }>
    const latestVersion = versions?.find((v) => v.is_latest)
    // Count instances across all versions of this template
    const instanceCount = versions?.reduce(
      (sum, v) => sum + (v.report_instances?.length ?? 0),
      0,
    ) ?? 0

    return {
      id: row.id,
      name: row.name,
      abbreviation: row.abbreviation,
      description: row.description,
      is_active: row.is_active,
      auto_generate: row.auto_generate,
      status: row.status as 'draft' | 'published',
      form_template_id: row.form_template_id,
      form_template_name: ft.name,
      instance_count: instanceCount,
      latest_version_number: latestVersion?.version_number ?? 1,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }
  })
}

/**
 * Fetch a report template by ID with latest version, sections, and fields.
 */
export async function fetchReportTemplateById(
  templateId: string,
): Promise<ReportTemplateDetail> {
  const { data: template, error: tErr } = await supabase
    .from('report_templates')
    .select(`
      id, name, abbreviation, description, is_active, auto_generate, status,
      form_template_id, instance_counter, created_at, updated_at,
      form_templates!inner ( name )
    `)
    .eq('id', templateId)
    .single()

  if (tErr || !template) throw tErr ?? new Error('Report template not found')

  const { data: version, error: vErr } = await supabase
    .from('report_template_versions')
    .select('id, version_number, status, created_at')
    .eq('report_template_id', templateId)
    .eq('is_latest', true)
    .single()

  if (vErr || !version) throw vErr ?? new Error('No version found')

  const { data: sections, error: sErr } = await supabase
    .from('report_template_sections')
    .select('id, title, description, sort_order')
    .eq('report_template_version_id', version.id)
    .order('sort_order')

  if (sErr) throw sErr

  const sectionIds = (sections ?? []).map((s) => s.id)
  const fields: { id: string; report_template_section_id: string; label: string; field_type: string; sort_order: number; config: unknown }[] = []

  if (sectionIds.length > 0) {
    const { data: fieldData, error: fErr } = await supabase
      .from('report_template_fields')
      .select('id, report_template_section_id, label, field_type, sort_order, config')
      .in('report_template_section_id', sectionIds)
      .order('sort_order')

    if (fErr) throw fErr
    fields.push(...(fieldData ?? []))
  }

  const fieldsBySection = new Map<string, ReportField[]>()
  for (const f of fields ?? []) {
    const list = fieldsBySection.get(f.report_template_section_id) ?? []
    list.push({
      id: f.id,
      label: f.label,
      field_type: f.field_type,
      sort_order: f.sort_order,
      config: f.config as Record<string, unknown>,
    })
    fieldsBySection.set(f.report_template_section_id, list)
  }

  const ft = template.form_templates as unknown as { name: string }

  return {
    id: template.id,
    name: template.name,
    abbreviation: template.abbreviation,
    description: template.description,
    is_active: template.is_active,
    auto_generate: template.auto_generate,
    status: template.status as 'draft' | 'published',
    form_template_id: template.form_template_id,
    form_template_name: ft.name,
    instance_counter: template.instance_counter,
    created_at: template.created_at,
    updated_at: template.updated_at,
    latest_version: {
      id: version.id,
      version_number: version.version_number,
      status: version.status as 'draft' | 'published',
      created_at: version.created_at,
    },
    sections: (sections ?? []).map((s) => ({
      id: s.id,
      title: s.title,
      description: s.description,
      sort_order: s.sort_order,
      fields: fieldsBySection.get(s.id) ?? [],
    })),
  }
}

/**
 * Fetch version history for a report template.
 */
export async function fetchReportTemplateVersions(
  templateId: string,
): Promise<ReportVersionRow[]> {
  const { data, error } = await supabase
    .from('report_template_versions')
    .select(`
      id, version_number, is_latest, restored_from, created_by, created_at,
      profiles!inner ( full_name )
    `)
    .eq('report_template_id', templateId)
    .order('version_number', { ascending: false })

  if (error) throw error

  return (data ?? []).map((row) => {
    const profile = row.profiles as unknown as { full_name: string }
    return {
      id: row.id,
      version_number: row.version_number,
      is_latest: row.is_latest,
      restored_from: row.restored_from,
      created_by: row.created_by,
      created_by_name: profile.full_name ?? 'Unknown',
      created_at: row.created_at,
    }
  })
}

/**
 * Fetch report instances, optionally filtered by template.
 */
export async function fetchReportInstances(
  templateId?: string,
): Promise<ReportInstanceListRow[]> {
  let query = supabase
    .from('report_instances')
    .select(`
      id, readable_id, status, short_url, created_by, created_at,
      profiles!inner ( full_name )
    `)
    .order('created_at', { ascending: false })

  if (templateId) {
    // Filter by template through the version relationship
    const { data: versionIds } = await supabase
      .from('report_template_versions')
      .select('id')
      .eq('report_template_id', templateId)

    const ids = (versionIds ?? []).map((v) => v.id)
    if (ids.length === 0) return []
    query = query.in('report_template_version_id', ids)
  }

  const { data, error } = await query

  if (error) throw error

  return (data ?? []).map((row) => {
    const profile = row.profiles as unknown as { full_name: string }
    return {
      id: row.id,
      readable_id: row.readable_id,
      status: row.status,
      short_url: row.short_url,
      created_by: row.created_by,
      created_by_name: profile.full_name ?? 'Unknown',
      created_at: row.created_at,
    }
  })
}

/**
 * Fetch a report instance by ID.
 */
export async function fetchReportInstanceById(
  instanceId: string,
): Promise<ReportInstanceDetail> {
  const { data, error } = await supabase
    .from('report_instances')
    .select(`
      id, readable_id, status, error_message, short_url,
      data_snapshot, form_instances_included,
      export_pdf_path, export_docx_path, created_at,
      report_template_versions!inner (
        version_number,
        report_templates!inner ( name )
      )
    `)
    .eq('id', instanceId)
    .single()

  if (error || !data) throw error ?? new Error('Report instance not found')

  const version = data.report_template_versions as unknown as {
    version_number: number
    report_templates: { name: string }
  }

  return {
    id: data.id,
    readable_id: data.readable_id,
    status: data.status,
    error_message: data.error_message,
    short_url: data.short_url,
    data_snapshot: data.data_snapshot as Record<string, unknown> | null,
    form_instances_included: data.form_instances_included as string[],
    export_pdf_path: data.export_pdf_path,
    export_docx_path: data.export_docx_path,
    report_template_name: version.report_templates.name,
    version_number: version.version_number,
    created_at: data.created_at,
  }
}

/**
 * Fetch a report instance by readable_id (for short URL resolution).
 */
export async function fetchReportInstanceByReadableId(
  readableId: string,
): Promise<ReportInstanceDetail> {
  const { data, error } = await supabase
    .from('report_instances')
    .select(`
      id, readable_id, status, error_message, short_url,
      data_snapshot, form_instances_included,
      export_pdf_path, export_docx_path, created_at,
      report_template_versions!inner (
        version_number,
        report_templates!inner ( name )
      )
    `)
    .eq('readable_id', readableId)
    .single()

  if (error || !data) throw error ?? new Error('Report instance not found')

  const version = data.report_template_versions as unknown as {
    version_number: number
    report_templates: { name: string }
  }

  return {
    id: data.id,
    readable_id: data.readable_id,
    status: data.status,
    error_message: data.error_message,
    short_url: data.short_url,
    data_snapshot: data.data_snapshot as Record<string, unknown> | null,
    form_instances_included: data.form_instances_included as string[],
    export_pdf_path: data.export_pdf_path,
    export_docx_path: data.export_docx_path,
    report_template_name: version.report_templates.name,
    version_number: version.version_number,
    created_at: data.created_at,
  }
}

// ---------------------------------------------------------------------------
// Form Instance Rounds (for Generate Report dialog)
// ---------------------------------------------------------------------------

/** A "round" groups all form instances for the same template created on the same date. */
export interface FormInstanceRound {
  date: string                    // ISO date string (YYYY-MM-DD)
  totalCount: number              // total instances in the round
  submittedCount: number          // submitted instances
  groups: Array<{
    groupId: string
    groupName: string
    formInstanceId: string
    status: 'pending' | 'submitted'
  }>
}

/**
 * Fetch form instances grouped by creation date ("rounds") for a given form template.
 * Used by the Generate Report dialog to let the user pick which round to include.
 */
export async function fetchFormInstanceRounds(
  formTemplateId: string,
): Promise<FormInstanceRound[]> {
  const { data, error } = await supabase
    .from('form_instances')
    .select(`
      id, status, created_at,
      group_id,
      groups!inner ( name ),
      template_versions!inner ( template_id )
    `)
    .eq('template_versions.template_id', formTemplateId)
    .eq('is_archived', false)
    .order('created_at', { ascending: false })

  if (error) throw error

  // Group instances by date (YYYY-MM-DD extracted from created_at)
  const roundMap = new Map<string, FormInstanceRound>()

  for (const row of data ?? []) {
    const dateStr = row.created_at.slice(0, 10) // 'YYYY-MM-DD'
    const group = row.groups as unknown as { name: string }
    const status = row.status as 'pending' | 'submitted'

    let round = roundMap.get(dateStr)
    if (!round) {
      round = {
        date: dateStr,
        totalCount: 0,
        submittedCount: 0,
        groups: [],
      }
      roundMap.set(dateStr, round)
    }

    round.totalCount += 1
    if (status === 'submitted') {
      round.submittedCount += 1
    }

    round.groups.push({
      groupId: row.group_id,
      groupName: group.name,
      formInstanceId: row.id,
      status,
    })
  }

  // Return rounds sorted by date descending (newest first)
  return Array.from(roundMap.values()).sort(
    (a, b) => b.date.localeCompare(a.date),
  )
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/**
 * Create a new report template with version 1, sections, and fields.
 */
export async function createReportTemplate(
  input: CreateReportTemplateInput,
): Promise<string> {
  const user = await getCurrentAuthUser()

  const { data: template, error: tErr } = await supabase
    .from('report_templates')
    .insert({
      form_template_id: input.form_template_id,
      name: input.name,
      abbreviation: input.abbreviation,
      description: input.description,
      auto_generate: input.auto_generate,
      created_by: user.id,
      status: 'published',
    })
    .select('id')
    .single()

  if (tErr || !template) throw tErr ?? new Error('Failed to create report template')

  const { data: version, error: vErr } = await supabase
    .from('report_template_versions')
    .insert({
      report_template_id: template.id,
      version_number: 1,
      is_latest: true,
      created_by: user.id,
      status: 'published',
    })
    .select('id')
    .single()

  if (vErr || !version) throw vErr ?? new Error('Failed to create version')

  for (const section of input.sections) {
    const { data: sectionRow, error: sErr } = await supabase
      .from('report_template_sections')
      .insert({
        report_template_version_id: version.id,
        title: section.title,
        description: section.description,
        sort_order: section.sort_order,
      })
      .select('id')
      .single()

    if (sErr || !sectionRow) throw sErr ?? new Error('Failed to create section')

    if (section.fields.length > 0) {
      const fieldRows = section.fields.map((f) => ({
        report_template_section_id: sectionRow.id,
        label: f.label,
        field_type: f.field_type,
        sort_order: f.sort_order,
        config: f.config as unknown as Json,
      }))

      const { error: fErr } = await supabase
        .from('report_template_fields')
        .insert(fieldRows)

      if (fErr) throw fErr
    }
  }

  return template.id
}

/**
 * Update a report template in-place (no new version).
 * Replaces all sections and fields on the current latest version.
 * Version bumps only happen on explicit publish / restore.
 */
export async function updateReportTemplate(
  templateId: string,
  input: {
    name?: string
    description?: string | null
    abbreviation?: string
    auto_generate?: boolean
    sections: CreateReportSectionInput[]
  },
): Promise<void> {
  const updates: Record<string, unknown> = {}
  if (input.name !== undefined) updates.name = input.name
  if (input.description !== undefined) updates.description = input.description
  if (input.abbreviation !== undefined) updates.abbreviation = input.abbreviation
  if (input.auto_generate !== undefined) updates.auto_generate = input.auto_generate

  if (Object.keys(updates).length > 0) {
    const { error } = await supabase
      .from('report_templates')
      .update(updates)
      .eq('id', templateId)
    if (error) throw error
  }

  // Get the current latest version (we update it in-place)
  const { data: currentVersion, error: cvErr } = await supabase
    .from('report_template_versions')
    .select('id')
    .eq('report_template_id', templateId)
    .eq('is_latest', true)
    .single()

  if (cvErr || !currentVersion) throw cvErr ?? new Error('No current version found')

  // Delete existing sections (fields cascade via FK)
  const { error: delErr } = await supabase
    .from('report_template_sections')
    .delete()
    .eq('report_template_version_id', currentVersion.id)

  if (delErr) throw delErr

  // Re-insert sections and fields
  for (const section of input.sections) {
    const { data: sectionRow, error: sErr } = await supabase
      .from('report_template_sections')
      .insert({
        report_template_version_id: currentVersion.id,
        title: section.title,
        description: section.description,
        sort_order: section.sort_order,
      })
      .select('id')
      .single()

    if (sErr || !sectionRow) throw sErr ?? new Error('Failed to create section')

    if (section.fields.length > 0) {
      const fieldRows = section.fields.map((f) => ({
        report_template_section_id: sectionRow.id,
        label: f.label,
        field_type: f.field_type,
        sort_order: f.sort_order,
        config: f.config as unknown as Json,
      }))

      const { error: fErr } = await supabase
        .from('report_template_fields')
        .insert(fieldRows)

      if (fErr) throw fErr
    }
  }
}

/**
 * Restore a previous version as the new latest version.
 */
export async function restoreReportTemplateVersion(
  templateId: string,
  versionId: string,
): Promise<void> {
  const user = await getCurrentAuthUser()

  const { data: oldSections } = await supabase
    .from('report_template_sections')
    .select('id, title, description, sort_order')
    .eq('report_template_version_id', versionId)
    .order('sort_order')

  const sectionIds = (oldSections ?? []).map((s) => s.id)
  let oldFields: { report_template_section_id: string; label: string; field_type: string; sort_order: number; config: unknown }[] = []

  if (sectionIds.length > 0) {
    const { data: fieldData } = await supabase
      .from('report_template_fields')
      .select('report_template_section_id, label, field_type, sort_order, config')
      .in('report_template_section_id', sectionIds)
      .order('sort_order')

    oldFields = fieldData ?? []
  }

  const { data: currentVersion, error: cvErr } = await supabase
    .from('report_template_versions')
    .select('id, version_number')
    .eq('report_template_id', templateId)
    .eq('is_latest', true)
    .single()

  if (cvErr || !currentVersion) throw cvErr ?? new Error('No current version')

  await supabase
    .from('report_template_versions')
    .update({ is_latest: false })
    .eq('id', currentVersion.id)

  const newVersionNumber = currentVersion.version_number + 1
  const { data: newVersion, error: nvErr } = await supabase
    .from('report_template_versions')
    .insert({
      report_template_id: templateId,
      version_number: newVersionNumber,
      is_latest: true,
      restored_from: versionId,
      created_by: user.id,
    })
    .select('id')
    .single()

  if (nvErr || !newVersion) throw nvErr ?? new Error('Failed to create restored version')

  const fieldsByOldSection = new Map<string, typeof oldFields>()
  for (const f of oldFields ?? []) {
    const list = fieldsByOldSection.get(f.report_template_section_id) ?? []
    list.push(f)
    fieldsByOldSection.set(f.report_template_section_id, list)
  }

  for (const section of oldSections ?? []) {
    const { data: newSection, error: sErr } = await supabase
      .from('report_template_sections')
      .insert({
        report_template_version_id: newVersion.id,
        title: section.title,
        description: section.description,
        sort_order: section.sort_order,
      })
      .select('id')
      .single()

    if (sErr || !newSection) throw sErr ?? new Error('Failed to copy section')

    const sectionFields = fieldsByOldSection.get(section.id) ?? []
    if (sectionFields.length > 0) {
      const fieldRows = sectionFields.map((f) => ({
        report_template_section_id: newSection.id,
        label: f.label,
        field_type: f.field_type,
        sort_order: f.sort_order,
        config: f.config as unknown as Json,
      }))

      const { error: fErr } = await supabase
        .from('report_template_fields')
        .insert(fieldRows)

      if (fErr) throw fErr
    }
  }
}

/**
 * Toggle auto_generate on a report template.
 */
export async function toggleAutoGenerate(
  templateId: string,
  value: boolean,
): Promise<void> {
  const { error } = await supabase
    .from('report_templates')
    .update({ auto_generate: value })
    .eq('id', templateId)

  if (error) throw error
}

/**
 * Soft-delete a report template.
 */
export async function deactivateReportTemplate(
  templateId: string,
): Promise<void> {
  const { error } = await supabase
    .from('report_templates')
    .update({ is_active: false })
    .eq('id', templateId)

  if (error) throw error
}

// ---------------------------------------------------------------------------
// Draft / Published Lifecycle
// ---------------------------------------------------------------------------

/**
 * Create a new report template as a draft with version 1 and no sections.
 * The dialog only collects name + form_template_id; sections are added later.
 */
export async function saveDraftReportTemplate(input: {
  name: string
  abbreviation: string
  form_template_id: string
}): Promise<string> {
  const user = await getCurrentAuthUser()

  const { data: template, error: tErr } = await supabase
    .from('report_templates')
    .insert({
      name: input.name.trim(),
      abbreviation: input.abbreviation.trim(),
      form_template_id: input.form_template_id,
      created_by: user.id,
      status: 'draft',
    })
    .select('id')
    .single()

  if (tErr || !template) throw tErr ?? new Error('Failed to create report template')

  const { error: vErr } = await supabase
    .from('report_template_versions')
    .insert({
      report_template_id: template.id,
      version_number: 1,
      is_latest: true,
      status: 'draft',
      created_by: user.id,
    })

  if (vErr) throw vErr

  return template.id
}

/**
 * Publish a draft report template by setting status to 'published'
 * on both the template and the latest version.
 */
export async function publishReportTemplate(
  templateId: string,
): Promise<void> {
  const { error: tErr } = await supabase
    .from('report_templates')
    .update({ status: 'published' })
    .eq('id', templateId)

  if (tErr) throw tErr

  const { error: vErr } = await supabase
    .from('report_template_versions')
    .update({ status: 'published' })
    .eq('report_template_id', templateId)
    .eq('is_latest', true)

  if (vErr) throw vErr
}

/**
 * Discard a draft report template version.
 * - If version 1 (never published): deactivates the template.
 * - If version > 1 (draft on top of published): deletes the draft version
 *   and restores the previous published version as latest.
 */
export async function discardReportDraft(
  templateId: string,
): Promise<'deactivated' | 'restored'> {
  const { data: latestVer, error: findErr } = await supabase
    .from('report_template_versions')
    .select('id, version_number')
    .eq('report_template_id', templateId)
    .eq('is_latest', true)
    .single()

  if (findErr || !latestVer) throw findErr ?? new Error('No latest version found')

  if (latestVer.version_number === 1) {
    // Never-published draft — deactivate the whole template
    const { error } = await supabase
      .from('report_templates')
      .update({ is_active: false })
      .eq('id', templateId)

    if (error) throw error
    return 'deactivated'
  }

  // Draft on top of published — delete draft version (CASCADE handles sections/fields)
  const { error: delErr } = await supabase
    .from('report_template_versions')
    .delete()
    .eq('id', latestVer.id)

  if (delErr) throw delErr

  // Restore previous version as latest
  const { error: restoreErr } = await supabase
    .from('report_template_versions')
    .update({ is_latest: true })
    .eq('report_template_id', templateId)
    .eq('version_number', latestVer.version_number - 1)

  if (restoreErr) throw restoreErr

  // Set template status back to published
  const { error: statusErr } = await supabase
    .from('report_templates')
    .update({ status: 'published' })
    .eq('id', templateId)

  if (statusErr) throw statusErr

  return 'restored'
}

/**
 * Create a new draft version for a published report template by copying
 * sections/fields from the current published version.
 */
export async function createReportDraftVersion(
  templateId: string,
): Promise<{ versionNumber: number }> {
  const user = await getCurrentAuthUser()

  // Get current published version
  const { data: current, error: cvErr } = await supabase
    .from('report_template_versions')
    .select('id, version_number')
    .eq('report_template_id', templateId)
    .eq('is_latest', true)
    .eq('status', 'published')
    .single()

  if (cvErr || !current) throw cvErr ?? new Error('No published version found')

  // Unset is_latest on current
  const { error: unErr } = await supabase
    .from('report_template_versions')
    .update({ is_latest: false })
    .eq('id', current.id)

  if (unErr) throw unErr

  // Create new draft version
  const newNum = current.version_number + 1
  const { data: newVer, error: nErr } = await supabase
    .from('report_template_versions')
    .insert({
      report_template_id: templateId,
      version_number: newNum,
      is_latest: true,
      status: 'draft',
      created_by: user.id,
    })
    .select('id')
    .single()

  if (nErr || !newVer) throw nErr ?? new Error('Failed to create draft version')

  // Copy sections and fields from the current version
  const { data: sections, error: secErr } = await supabase
    .from('report_template_sections')
    .select('id, title, description, sort_order')
    .eq('report_template_version_id', current.id)
    .order('sort_order')

  if (secErr) throw secErr

  for (const sec of sections ?? []) {
    const { data: newSec, error: nsErr } = await supabase
      .from('report_template_sections')
      .insert({
        report_template_version_id: newVer.id,
        title: sec.title,
        description: sec.description,
        sort_order: sec.sort_order,
      })
      .select('id')
      .single()

    if (nsErr || !newSec) throw nsErr ?? new Error('Failed to copy section')

    const { data: fields, error: fErr } = await supabase
      .from('report_template_fields')
      .select('label, field_type, sort_order, config')
      .eq('report_template_section_id', sec.id)
      .order('sort_order')

    if (fErr) throw fErr

    if (fields && fields.length > 0) {
      const fieldRows = fields.map((f) => ({
        report_template_section_id: newSec.id,
        label: f.label,
        field_type: f.field_type,
        sort_order: f.sort_order,
        config: f.config as unknown as Json,
      }))

      const { error: fiErr } = await supabase
        .from('report_template_fields')
        .insert(fieldRows)

      if (fiErr) throw fiErr
    }
  }

  // Set template status to draft
  const { error: statusErr } = await supabase
    .from('report_templates')
    .update({ status: 'draft' })
    .eq('id', templateId)

  if (statusErr) throw statusErr

  return { versionNumber: newNum }
}

/**
 * Check if a report template name is already taken (case-insensitive).
 * Only considers active templates.
 */
export async function isReportTemplateNameTaken(
  name: string,
): Promise<boolean> {
  const { count, error } = await supabase
    .from('report_templates')
    .select('id', { count: 'exact', head: true })
    .ilike('name', name.trim())
    .eq('is_active', true)

  if (error) throw error
  return (count ?? 0) > 0
}

// ---------------------------------------------------------------------------
// Edge Function callers
// ---------------------------------------------------------------------------

/**
 * Generate a report instance by calling the generate-report Edge Function.
 */
export async function generateReport(
  reportTemplateId: string,
  formInstanceIds: string[],
): Promise<{ report_instance_id: string; readable_id: string }> {
  const { data, error } = await supabase.functions.invoke('generate-report', {
    body: {
      report_template_id: reportTemplateId,
      form_instance_ids: formInstanceIds,
      auto_generated: false,
    },
  })

  if (error) throw error
  if (!data?.success) throw new Error(data?.error ?? 'Failed to generate report')

  return {
    report_instance_id: data.report_instance_id,
    readable_id: data.readable_id,
  }
}

/**
 * Export a report instance as PDF or DOCX.
 * Returns a signed download URL.
 */
export async function exportReport(
  reportInstanceId: string,
  format: 'pdf' | 'docx',
): Promise<string> {
  const { data, error } = await supabase.functions.invoke('export-report', {
    body: {
      report_instance_id: reportInstanceId,
      format,
    },
  })

  if (error) throw error
  if (!data?.success) throw new Error(data?.error ?? 'Failed to export report')

  return data.download_url
}
