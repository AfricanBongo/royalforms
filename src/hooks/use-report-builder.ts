/**
 * Report builder state management hook.
 *
 * Manages the local state for creating/editing a report template:
 * - Template metadata (name, description, linked form, auto-generate)
 * - Sections with titles, descriptions, and sort order
 * - Fields within sections with type-specific config (formula, dynamic variable, table, static text)
 *
 * State is purely client-side until publish/save is invoked.
 */
import { useCallback, useState } from 'react'

import type {
  CreateReportFieldInput,
  CreateReportSectionInput,
  CreateReportTemplateInput,
  ReportField,
  ReportTemplateDetail,
} from '../services/reports'

// ---------------------------------------------------------------------------
// Field type constants
// ---------------------------------------------------------------------------

const REPORT_FIELD_TYPE = {
  FORMULA: 'formula',
  DYNAMIC_VARIABLE: 'dynamic_variable',
  TABLE: 'table',
  STATIC_TEXT: 'static_text',
} as const
type ReportFieldType = (typeof REPORT_FIELD_TYPE)[keyof typeof REPORT_FIELD_TYPE]

export { REPORT_FIELD_TYPE }
export type { ReportFieldType }

// ---------------------------------------------------------------------------
// Formula block types
// ---------------------------------------------------------------------------

type FormulaBlock =
  | { kind: 'aggregate'; fn: 'SUM' | 'AVERAGE' | 'MIN' | 'MAX' | 'COUNT' | 'MEDIAN'; fieldId: string }
  | { kind: 'operator'; op: '+' | '-' | '*' | '/' }
  | { kind: 'literal'; value: number }

export type { FormulaBlock }

// ---------------------------------------------------------------------------
// Form field option (passed down from linked form template)
// ---------------------------------------------------------------------------

export interface FormFieldOption {
  id: string
  label: string
  sectionTitle: string
  field_type: string
}

// ---------------------------------------------------------------------------
// Builder state types
// ---------------------------------------------------------------------------

export interface ReportBuilderField {
  /** Client-side temp ID for React keys — NOT a database UUID. */
  clientId: string
  label: string
  field_type: ReportFieldType
  sort_order: number
  /** Whether this field is currently being edited (expanded). */
  isEditing: boolean
  // Formula config
  formulaBlocks: FormulaBlock[]
  // Dynamic variable config
  dynamicVariableFieldId: string | null
  // Table config
  tableColumns: { fieldId: string; label: string }[]
  tableGroupBy: boolean
  // Static text config
  staticTextContent: string
}

export interface ReportBuilderSection {
  clientId: string
  title: string
  description: string
  sort_order: number
  fields: ReportBuilderField[]
  /** Index of the field that is currently showing the type picker, or null. */
  insertingAtIndex: number | null
}

export interface ReportBuilderState {
  name: string
  description: string
  abbreviation: string
  linkedFormTemplateId: string | null
  autoGenerate: boolean
  sections: ReportBuilderSection[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let nextId = 0
function makeId(): string {
  nextId += 1
  return `__rbuilder_${nextId}_${Date.now()}`
}

function makeDefaultReportField(sortOrder: number, fieldType: ReportFieldType): ReportBuilderField {
  return {
    clientId: makeId(),
    label: '',
    field_type: fieldType,
    sort_order: sortOrder,
    isEditing: true,
    formulaBlocks: [],
    dynamicVariableFieldId: null,
    tableColumns: [],
    tableGroupBy: false,
    staticTextContent: '',
  }
}

function makeDefaultReportSection(sortOrder: number): ReportBuilderSection {
  return {
    clientId: makeId(),
    title: `Section ${sortOrder}`,
    description: '',
    sort_order: sortOrder,
    fields: [],
    insertingAtIndex: null,
  }
}

// ---------------------------------------------------------------------------
// Initial state builder
// ---------------------------------------------------------------------------

function createInitialState(): ReportBuilderState {
  return {
    name: '',
    description: '',
    abbreviation: '',
    linkedFormTemplateId: null,
    autoGenerate: false,
    sections: [makeDefaultReportSection(1)],
  }
}

// ---------------------------------------------------------------------------
// Expression building from formula blocks
// ---------------------------------------------------------------------------

function buildExpression(blocks: FormulaBlock[]): string {
  return blocks
    .map((block) => {
      switch (block.kind) {
        case 'aggregate':
          return `${block.fn}(${block.fieldId})`
        case 'operator':
          return ` ${block.op} `
        case 'literal':
          return String(block.value)
      }
    })
    .join('')
}

function extractReferencedFields(blocks: FormulaBlock[]): string[] {
  const fieldIds = new Set<string>()
  for (const block of blocks) {
    if (block.kind === 'aggregate') {
      fieldIds.add(block.fieldId)
    }
  }
  return [...fieldIds]
}

// ---------------------------------------------------------------------------
// Config serialization per field type
// ---------------------------------------------------------------------------

function serializeFieldConfig(field: ReportBuilderField): Record<string, unknown> {
  switch (field.field_type) {
    case REPORT_FIELD_TYPE.FORMULA:
      return {
        expression: buildExpression(field.formulaBlocks),
        referenced_fields: extractReferencedFields(field.formulaBlocks),
      }
    case REPORT_FIELD_TYPE.DYNAMIC_VARIABLE:
      return {
        template_field_id: field.dynamicVariableFieldId,
      }
    case REPORT_FIELD_TYPE.TABLE:
      return {
        columns: field.tableColumns.map((col) => ({
          template_field_id: col.fieldId,
          label: col.label,
        })),
        group_by: field.tableGroupBy ? 'group' : null,
      }
    case REPORT_FIELD_TYPE.STATIC_TEXT:
      return {
        content: field.staticTextContent,
        format: 'text',
      }
  }
}

// ---------------------------------------------------------------------------
// Convert ReportTemplateDetail → ReportBuilderState (for editing)
// ---------------------------------------------------------------------------

function parseFormulaBlocks(config: Record<string, unknown>): FormulaBlock[] {
  // Best-effort parse of expression back to blocks.
  // The expression format is: FN(fieldId) op literal ...
  const expression = (config.expression as string) ?? ''
  if (!expression) return []

  const blocks: FormulaBlock[] = []
  // Tokenize: split on spaces but respect function calls
  const regex = /(SUM|AVERAGE|MIN|MAX|COUNT|MEDIAN)\(([^)]+)\)|([+\-*/])|(\d+(?:\.\d+)?)/g
  let match: RegExpExecArray | null

  while ((match = regex.exec(expression)) !== null) {
    if (match[1]) {
      blocks.push({
        kind: 'aggregate',
        fn: match[1] as FormulaBlock & { kind: 'aggregate' } extends { fn: infer F } ? F : never,
        fieldId: match[2],
      })
    } else if (match[3]) {
      blocks.push({
        kind: 'operator',
        op: match[3] as '+' | '-' | '*' | '/',
      })
    } else if (match[4]) {
      blocks.push({
        kind: 'literal',
        value: Number(match[4]),
      })
    }
  }

  return blocks
}

function parseBuilderField(field: ReportField, sortOrder: number): ReportBuilderField {
  const config = field.config ?? {}
  const fieldType = field.field_type as ReportFieldType

  const base: ReportBuilderField = {
    clientId: makeId(),
    label: field.label,
    field_type: fieldType,
    sort_order: sortOrder,
    isEditing: false,
    formulaBlocks: [],
    dynamicVariableFieldId: null,
    tableColumns: [],
    tableGroupBy: false,
    staticTextContent: '',
  }

  switch (fieldType) {
    case REPORT_FIELD_TYPE.FORMULA:
      base.formulaBlocks = parseFormulaBlocks(config)
      break
    case REPORT_FIELD_TYPE.DYNAMIC_VARIABLE:
      base.dynamicVariableFieldId = (config.template_field_id as string) ?? null
      break
    case REPORT_FIELD_TYPE.TABLE: {
      const columns = (config.columns as Array<{ template_field_id: string; label: string }>) ?? []
      base.tableColumns = columns.map((col) => ({
        fieldId: col.template_field_id,
        label: col.label,
      }))
      base.tableGroupBy = config.group_by === 'group'
      break
    }
    case REPORT_FIELD_TYPE.STATIC_TEXT:
      base.staticTextContent = (config.content as string) ?? ''
      break
  }

  return base
}

export function toBuilderState(detail: ReportTemplateDetail): ReportBuilderState {
  return {
    name: detail.name,
    description: detail.description ?? '',
    abbreviation: detail.abbreviation,
    linkedFormTemplateId: detail.form_template_id,
    autoGenerate: detail.auto_generate,
    sections: detail.sections.map((sec, i) => ({
      clientId: makeId(),
      title: sec.title,
      description: sec.description ?? '',
      sort_order: i + 1,
      fields: sec.fields.map((f, fi) => parseBuilderField(f, fi + 1)),
      insertingAtIndex: null,
    })),
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useReportBuilder(initial?: ReportBuilderState) {
  const [state, setState] = useState<ReportBuilderState>(initial ?? createInitialState)

  // -- Template metadata ----------------------------------------------------

  const setName = useCallback((name: string) => {
    setState((s) => ({ ...s, name }))
  }, [])

  const setDescription = useCallback((description: string) => {
    setState((s) => ({ ...s, description }))
  }, [])

  const setAbbreviation = useCallback((abbreviation: string) => {
    setState((s) => ({ ...s, abbreviation }))
  }, [])

  const setLinkedFormTemplateId = useCallback((id: string | null) => {
    setState((s) => ({ ...s, linkedFormTemplateId: id }))
  }, [])

  const setAutoGenerate = useCallback((value: boolean) => {
    setState((s) => ({ ...s, autoGenerate: value }))
  }, [])

  // -- Sections -------------------------------------------------------------

  const addSection = useCallback(() => {
    setState((s) => ({
      ...s,
      sections: [
        ...s.sections,
        makeDefaultReportSection(s.sections.length + 1),
      ],
    }))
  }, [])

  const updateSection = useCallback(
    (clientId: string, updates: { title?: string; description?: string }) => {
      setState((s) => ({
        ...s,
        sections: s.sections.map((sec) =>
          sec.clientId === clientId ? { ...sec, ...updates } : sec,
        ),
      }))
    },
    [],
  )

  const removeSection = useCallback((clientId: string) => {
    setState((s) => {
      const filtered = s.sections.filter((sec) => sec.clientId !== clientId)
      return {
        ...s,
        sections: filtered.map((sec, i) => ({
          ...sec,
          sort_order: i + 1,
          title: sec.title.match(/^Section \d+$/) ? `Section ${i + 1}` : sec.title,
        })),
      }
    })
  }, [])

  // -- Field insertion flow -------------------------------------------------

  const showFieldTypePicker = useCallback(
    (sectionClientId: string, atIndex: number) => {
      setState((s) => ({
        ...s,
        sections: s.sections.map((sec) =>
          sec.clientId === sectionClientId
            ? { ...sec, insertingAtIndex: atIndex }
            : sec,
        ),
      }))
    },
    [],
  )

  const cancelFieldTypePicker = useCallback((sectionClientId: string) => {
    setState((s) => ({
      ...s,
      sections: s.sections.map((sec) =>
        sec.clientId === sectionClientId
          ? { ...sec, insertingAtIndex: null }
          : sec,
      ),
    }))
  }, [])

  const insertField = useCallback(
    (sectionClientId: string, fieldType: ReportFieldType) => {
      setState((s) => ({
        ...s,
        sections: s.sections.map((sec) => {
          if (sec.clientId !== sectionClientId) return sec

          const idx = sec.insertingAtIndex ?? sec.fields.length
          const newField = makeDefaultReportField(idx + 1, fieldType)

          // Collapse any other editing field across this section
          const updatedFields = sec.fields.map((f) => ({ ...f, isEditing: false }))

          // Insert at position
          const before = updatedFields.slice(0, idx)
          const after = updatedFields.slice(idx)
          const allFields = [...before, newField, ...after]

          // Re-number sort_order
          return {
            ...sec,
            insertingAtIndex: null,
            fields: allFields.map((f, i) => ({ ...f, sort_order: i + 1 })),
          }
        }),
      }))
    },
    [],
  )

  // -- Field operations -----------------------------------------------------

  const updateField = useCallback(
    (fieldClientId: string, updates: Partial<ReportBuilderField>) => {
      setState((s) => ({
        ...s,
        sections: s.sections.map((sec) => ({
          ...sec,
          fields: sec.fields.map((f) =>
            f.clientId === fieldClientId ? { ...f, ...updates } : f,
          ),
        })),
      }))
    },
    [],
  )

  const removeField = useCallback((fieldClientId: string) => {
    setState((s) => ({
      ...s,
      sections: s.sections.map((sec) => {
        const filtered = sec.fields.filter((f) => f.clientId !== fieldClientId)
        if (filtered.length === sec.fields.length) return sec
        return {
          ...sec,
          fields: filtered.map((f, i) => ({ ...f, sort_order: i + 1 })),
        }
      }),
    }))
  }, [])

  const duplicateField = useCallback((fieldClientId: string) => {
    setState((s) => ({
      ...s,
      sections: s.sections.map((sec) => {
        const idx = sec.fields.findIndex((f) => f.clientId === fieldClientId)
        if (idx === -1) return sec

        const original = sec.fields[idx]
        const copy: ReportBuilderField = {
          ...original,
          clientId: makeId(),
          label: original.label ? `${original.label} (copy)` : '',
          isEditing: true,
        }

        const newFields = [...sec.fields]
        // Collapse all others
        for (let i = 0; i < newFields.length; i++) {
          newFields[i] = { ...newFields[i], isEditing: false }
        }
        newFields.splice(idx + 1, 0, copy)

        return {
          ...sec,
          fields: newFields.map((f, i) => ({ ...f, sort_order: i + 1 })),
        }
      }),
    }))
  }, [])

  const moveField = useCallback(
    (fieldClientId: string, direction: 'up' | 'down') => {
      setState((s) => ({
        ...s,
        sections: s.sections.map((sec) => {
          const idx = sec.fields.findIndex((f) => f.clientId === fieldClientId)
          if (idx === -1) return sec
          if (direction === 'up' && idx === 0) return sec
          if (direction === 'down' && idx === sec.fields.length - 1) return sec

          const newFields = [...sec.fields]
          const swapIdx = direction === 'up' ? idx - 1 : idx + 1
          ;[newFields[idx], newFields[swapIdx]] = [newFields[swapIdx], newFields[idx]]

          return {
            ...sec,
            fields: newFields.map((f, i) => ({ ...f, sort_order: i + 1 })),
          }
        }),
      }))
    },
    [],
  )

  const setFieldEditing = useCallback(
    (fieldClientId: string, isEditing: boolean) => {
      setState((s) => ({
        ...s,
        sections: s.sections.map((sec) => ({
          ...sec,
          fields: sec.fields.map((f) =>
            f.clientId === fieldClientId
              ? { ...f, isEditing }
              : isEditing
                ? { ...f, isEditing: false } // Collapse others when opening one
                : f,
          ),
        })),
      }))
    },
    [],
  )

  // -- Validation -----------------------------------------------------------

  const validate = useCallback((): { valid: boolean; errors: string[] } => {
    const errors: string[] = []

    if (!state.name.trim()) {
      errors.push('Report name is required.')
    }

    if (!state.linkedFormTemplateId) {
      errors.push('A linked form template must be selected.')
    }

    for (const sec of state.sections) {
      if (!sec.title.trim()) {
        errors.push(`Section ${sec.sort_order} title is required.`)
      }

      for (const field of sec.fields) {
        if (!field.label.trim()) {
          errors.push(
            `Field ${field.sort_order} in "${sec.title}" needs a label.`,
          )
        }

        switch (field.field_type) {
          case REPORT_FIELD_TYPE.FORMULA:
            if (field.formulaBlocks.length === 0) {
              errors.push(
                `Formula field "${field.label || `#${field.sort_order}`}" in "${sec.title}" must have at least one block.`,
              )
            }
            break
          case REPORT_FIELD_TYPE.DYNAMIC_VARIABLE:
            if (!field.dynamicVariableFieldId) {
              errors.push(
                `Dynamic variable field "${field.label || `#${field.sort_order}`}" in "${sec.title}" must reference a form field.`,
              )
            }
            break
          case REPORT_FIELD_TYPE.TABLE:
            if (field.tableColumns.length === 0) {
              errors.push(
                `Table field "${field.label || `#${field.sort_order}`}" in "${sec.title}" must have at least one column.`,
              )
            }
            break
          case REPORT_FIELD_TYPE.STATIC_TEXT:
            // Static text has no required config beyond a label
            break
        }
      }
    }

    return { valid: errors.length === 0, errors }
  }, [state])

  // -- Serialization --------------------------------------------------------

  const toCreateInput = useCallback((): CreateReportTemplateInput => {
    return {
      form_template_id: state.linkedFormTemplateId ?? '',
      name: state.name,
      abbreviation: state.abbreviation,
      description: state.description || null,
      auto_generate: state.autoGenerate,
      sections: state.sections.map((sec): CreateReportSectionInput => ({
        title: sec.title,
        description: sec.description || null,
        sort_order: sec.sort_order,
        fields: sec.fields.map((f): CreateReportFieldInput => ({
          label: f.label,
          field_type: f.field_type,
          sort_order: f.sort_order,
          config: serializeFieldConfig(f),
        })),
      })),
    }
  }, [state])

  return {
    state,
    setState,
    // Metadata
    setName,
    setDescription,
    setAbbreviation,
    setLinkedFormTemplateId,
    setAutoGenerate,
    // Sections
    addSection,
    updateSection,
    removeSection,
    // Field insertion flow
    showFieldTypePicker,
    cancelFieldTypePicker,
    insertField,
    // Field operations
    updateField,
    removeField,
    duplicateField,
    moveField,
    setFieldEditing,
    // Validate / serialize
    validate,
    toCreateInput,
  }
}
