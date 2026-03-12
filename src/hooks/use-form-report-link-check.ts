/**
 * useFormReportLinkCheck — Detects breaking/additive changes between
 * a form template's current fields and the fields referenced by any
 * linked report templates.
 *
 * "Breaking" = a form field referenced by a report was removed or had
 *              its type changed to an incompatible type.
 * "Addition" = new form fields exist that are NOT yet in any linked report.
 *
 * 1-to-many: one form can have many report templates linked to it.
 */
import { useEffect, useState } from 'react'

import { supabase } from '../services/supabase'

import type { BuilderSection } from './use-form-builder'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LinkedReport {
  id: string
  name: string
  referencedFieldIds: Set<string>
}

interface BreakingChange {
  reportName: string
  reportId: string
  fieldLabel: string
  reason: 'removed' | 'type_changed'
}

interface Addition {
  fieldLabel: string
  fieldId: string
}

export interface FormReportLinkCheckResult {
  loading: boolean
  linkedReports: LinkedReport[]
  breakingChanges: BreakingChange[]
  additions: Addition[]
  hasBreakingChanges: boolean
  hasAdditions: boolean
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract all template_field_id references from a report field's config.
 * Covers: dynamic_variable (template_field_id), formula (referenced_fields),
 * table columns (template_field_id per column, formula expressions).
 */
function extractFieldIdsFromConfig(config: Record<string, unknown>): string[] {
  const ids: string[] = []

  if (typeof config.template_field_id === 'string') {
    ids.push(config.template_field_id)
  }

  if (Array.isArray(config.referenced_fields)) {
    for (const id of config.referenced_fields) {
      if (typeof id === 'string') ids.push(id)
    }
  }

  if (Array.isArray(config.columns)) {
    for (const col of config.columns as Record<string, unknown>[]) {
      if (typeof col.template_field_id === 'string') {
        ids.push(col.template_field_id)
      }
      if (typeof col.formula === 'string') {
        const matches = col.formula.matchAll(/[a-f0-9-]{36}/gi)
        for (const m of matches) ids.push(m[0])
      }
    }
  }

  if (typeof config.expression === 'string') {
    const matches = config.expression.matchAll(/[a-f0-9-]{36}/gi)
    for (const m of matches) ids.push(m[0])
  }

  return ids
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useFormReportLinkCheck(
  templateId: string,
  sections: BuilderSection[],
): FormReportLinkCheckResult {
  const [loading, setLoading] = useState(true)
  const [linkedReports, setLinkedReports] = useState<LinkedReport[]>([])

  // Fetch linked reports and their referenced field IDs on mount
  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        // Find all active report templates linked to this form
        const { data: reports, error: rErr } = await supabase
          .from('report_templates')
          .select('id, name')
          .eq('form_template_id', templateId)
          .eq('is_active', true)

        if (rErr || !reports || reports.length === 0) {
          setLinkedReports([])
          return
        }

        const results: LinkedReport[] = []

        for (const report of reports) {
          // Get latest version
          const { data: version } = await supabase
            .from('report_template_versions')
            .select('id')
            .eq('report_template_id', report.id)
            .eq('is_latest', true)
            .single()

          if (!version) continue

          // Get sections for this version
          const { data: rSections } = await supabase
            .from('report_template_sections')
            .select('id')
            .eq('report_template_version_id', version.id)

          const sectionIds = (rSections ?? []).map((s) => s.id)
          if (sectionIds.length === 0) {
            results.push({ id: report.id, name: report.name, referencedFieldIds: new Set() })
            continue
          }

          // Get report fields
          const { data: rFields } = await supabase
            .from('report_template_fields')
            .select('config')
            .in('report_template_section_id', sectionIds)

          // Extract all referenced form field IDs
          const refIds = new Set<string>()
          for (const f of rFields ?? []) {
            const config = (f.config ?? {}) as Record<string, unknown>
            for (const id of extractFieldIdsFromConfig(config)) {
              refIds.add(id)
            }
          }

          results.push({ id: report.id, name: report.name, referencedFieldIds: refIds })
        }

        setLinkedReports(results)
      } catch {
        setLinkedReports([])
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [templateId])

  // Compute breaking changes and additions from current fields vs referenced
  const currentFieldIds = new Set<string>()
  const currentFieldLabels = new Map<string, string>()

  for (const section of sections) {
    for (const field of section.fields) {
      // Fields loaded from DB have IDs starting with a UUID pattern,
      // while new client-only fields have __loaded_ or __client_ prefixes
      if (!field.clientId.startsWith('__')) {
        currentFieldIds.add(field.clientId)
        currentFieldLabels.set(field.clientId, field.label)
      }
    }
  }

  // Detect breaking changes (removed fields referenced by a report)
  const breakingChanges: BreakingChange[] = []
  for (const report of linkedReports) {
    for (const refId of report.referencedFieldIds) {
      if (!currentFieldIds.has(refId)) {
        breakingChanges.push({
          reportName: report.name,
          reportId: report.id,
          fieldLabel: refId, // ID as fallback since label is unknown for removed fields
          reason: 'removed',
        })
      }
    }
  }

  // Detect additions (new fields not in any report)
  const allReferencedIds = new Set<string>()
  for (const report of linkedReports) {
    for (const refId of report.referencedFieldIds) {
      allReferencedIds.add(refId)
    }
  }

  const additions: Addition[] = []
  if (linkedReports.length > 0) {
    for (const [fieldId, fieldLabel] of currentFieldLabels) {
      if (!allReferencedIds.has(fieldId)) {
        additions.push({ fieldLabel, fieldId })
      }
    }
  }

  return {
    loading,
    linkedReports,
    breakingChanges,
    additions,
    hasBreakingChanges: breakingChanges.length > 0,
    hasAdditions: additions.length > 0,
  }
}
