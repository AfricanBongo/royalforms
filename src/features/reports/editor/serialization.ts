/**
 * Serialization layer for the report WYSIWYG editor.
 *
 * Converts between BlockNote's document model and the service-layer format
 * (`CreateReportTemplateInput`). Two directions:
 *
 * 1. editorToCreateInput — BlockNote document → service format (save)
 * 2. templateDetailToEditorContent — service format → BlockNote document (load)
 */
import type {
  CreateReportFieldInput,
  CreateReportSectionInput,
  CreateReportTemplateInput,
  ReportTemplateDetail,
} from '../../../services/reports'
import type { FormulaBlock } from './types'

// ---------------------------------------------------------------------------
// Types — loosely typed block shapes for serialization
// ---------------------------------------------------------------------------

/** Minimal block shape from BlockNote document. */
interface EditorBlock {
  id: string
  type: string
  props: Record<string, unknown>
  content?: InlineContentItem[] | undefined
  children: EditorBlock[]
}

interface InlineContentItem {
  type: string
  text?: string
  styles?: Record<string, unknown>
  content?: InlineContentItem[]
  href?: string
}

// ---------------------------------------------------------------------------
// Metadata that lives outside the editor (in the page header)
// ---------------------------------------------------------------------------

export interface ReportMetadata {
  name: string
  abbreviation: string
  description: string | null
  linkedFormTemplateId: string
  autoGenerate: boolean
}

// ---------------------------------------------------------------------------
// Helper: extract plain text from inline content
// ---------------------------------------------------------------------------

function inlineContentToText(content: InlineContentItem[] | undefined): string {
  if (!content || content.length === 0) return ''
  return content
    .map((item) => {
      if (item.type === 'text') return item.text ?? ''
      if (item.type === 'link') return inlineContentToText(item.content)
      return ''
    })
    .join('')
}

// ---------------------------------------------------------------------------
// Helper: build expression string from formula blocks
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
// Editor → Service format (save)
// ---------------------------------------------------------------------------

export function editorToCreateInput(
  document: EditorBlock[],
  metadata: ReportMetadata,
): CreateReportTemplateInput {
  const sections: CreateReportSectionInput[] = []
  let currentSection: CreateReportSectionInput | null = null
  let sectionOrder = 0

  for (const block of document) {
    // Heading → new section
    if (block.type === 'heading') {
      sectionOrder++
      const title = inlineContentToText(block.content) || `Section ${sectionOrder}`
      currentSection = {
        title,
        description: null,
        sort_order: sectionOrder,
        fields: [],
      }
      sections.push(currentSection)
      continue
    }

    // Ensure we have a section (auto-create if no heading yet)
    if (!currentSection) {
      sectionOrder++
      currentSection = {
        title: `Section ${sectionOrder}`,
        description: null,
        sort_order: sectionOrder,
        fields: [],
      }
      sections.push(currentSection)
    }

    const fieldOrder = currentSection.fields.length + 1

    // Paragraph → static_text
    if (block.type === 'paragraph') {
      const text = inlineContentToText(block.content)
      if (!text.trim()) continue // Skip empty paragraphs

      const field: CreateReportFieldInput = {
        label: text.substring(0, 100), // Label is first 100 chars
        field_type: 'static_text',
        sort_order: fieldOrder,
        config: {
          content: text,
          format: 'text',
        },
      }
      currentSection.fields.push(field)
      continue
    }

    // Formula block
    if (block.type === 'formula') {
      const formulaBlocksJson = (block.props.formulaBlocks as string) ?? '[]'
      let formulaBlocks: FormulaBlock[] = []
      try {
        formulaBlocks = JSON.parse(formulaBlocksJson) as FormulaBlock[]
      } catch {
        // Invalid JSON, keep empty
      }

      const field: CreateReportFieldInput = {
        label: 'Formula',
        field_type: 'formula',
        sort_order: fieldOrder,
        config: {
          expression: buildExpression(formulaBlocks),
          referenced_fields: extractReferencedFields(formulaBlocks),
        },
      }
      currentSection.fields.push(field)
      continue
    }

    // Dynamic variable block
    if (block.type === 'dynamicVariable') {
      const fieldLabel = (block.props.fieldLabel as string) ?? ''
      const fieldId = (block.props.fieldId as string) ?? ''

      const field: CreateReportFieldInput = {
        label: fieldLabel || 'Dynamic Variable',
        field_type: 'dynamic_variable',
        sort_order: fieldOrder,
        config: {
          template_field_id: fieldId,
        },
      }
      currentSection.fields.push(field)
      continue
    }

    // Data table block
    if (block.type === 'dataTable') {
      const columnsJson = (block.props.columns as string) ?? '[]'
      let rawColumns: Array<Record<string, unknown>> = []
      try {
        rawColumns = JSON.parse(columnsJson) as Array<Record<string, unknown>>
      } catch {
        // Invalid JSON, keep empty
      }
      const groupBy = block.props.groupBy === 'true'

      // Serialize columns — support both field and formula column modes
      const serializedColumns = rawColumns.map((col) => {
        if (col.mode === 'formula') {
          const formulaBlocks = (col.formulaBlocks ?? []) as FormulaBlock[]
          return {
            formula: buildExpression(formulaBlocks),
            label: String(col.label ?? ''),
          }
        }
        // Default: field column (including legacy format without mode)
        return {
          template_field_id: String(col.fieldId ?? ''),
          label: String(col.label ?? ''),
        }
      })

      const field: CreateReportFieldInput = {
        label: 'Data Table',
        field_type: 'table',
        sort_order: fieldOrder,
        config: {
          columns: serializedColumns,
          group_by: groupBy ? 'group' : null,
        },
      }
      currentSection.fields.push(field)
      continue
    }

    // Skip other block types (lists, images, etc.) — not part of report schema
  }

  // If no sections were created at all, add an empty one
  if (sections.length === 0) {
    sections.push({
      title: 'Section 1',
      description: null,
      sort_order: 1,
      fields: [],
    })
  }

  return {
    form_template_id: metadata.linkedFormTemplateId,
    name: metadata.name,
    abbreviation: metadata.abbreviation,
    description: metadata.description,
    auto_generate: metadata.autoGenerate,
    sections,
  }
}

// ---------------------------------------------------------------------------
// Service format → Editor (load)
// ---------------------------------------------------------------------------

/** Parse an expression string back into FormulaBlock array. */
function parseFormulaBlocks(config: Record<string, unknown>): FormulaBlock[] {
  const expression = (config.expression as string) ?? ''
  if (!expression) return []

  const blocks: FormulaBlock[] = []
  const regex = /(SUM|AVERAGE|MIN|MAX|COUNT|MEDIAN)\(([^)]+)\)|([+\-*/])|(\d+(?:\.\d+)?)/g
  let match: RegExpExecArray | null

  while ((match = regex.exec(expression)) !== null) {
    if (match[1]) {
      blocks.push({
        kind: 'aggregate',
        fn: match[1] as 'SUM' | 'AVERAGE' | 'MIN' | 'MAX' | 'COUNT' | 'MEDIAN',
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

/**
 * Convert a ReportTemplateDetail into BlockNote-compatible initial content.
 * Returns an array of partial blocks that can be passed to useCreateBlockNote.
 */
export function templateDetailToEditorContent(
  detail: ReportTemplateDetail,
): EditorBlock[] {
  const blocks: EditorBlock[] = []
  let blockId = 0

  function nextId(): string {
    blockId++
    return `__ser_${blockId}`
  }

  for (const section of detail.sections) {
    // Section heading
    blocks.push({
      id: nextId(),
      type: 'heading',
      props: { level: 2 },
      content: [{ type: 'text', text: section.title }],
      children: [],
    })

    // Section description as paragraph
    if (section.description) {
      blocks.push({
        id: nextId(),
        type: 'paragraph',
        props: {},
        content: [{ type: 'text', text: section.description }],
        children: [],
      })
    }

    // Fields
    for (const field of section.fields) {
      const config = field.config ?? {}

      switch (field.field_type) {
        case 'formula': {
          const formulaBlocks = parseFormulaBlocks(config)
          blocks.push({
            id: nextId(),
            type: 'formula',
            props: {
              formulaBlocks: JSON.stringify(formulaBlocks),
            },
            content: undefined,
            children: [],
          })
          break
        }

        case 'dynamic_variable': {
          const fieldId = (config.template_field_id as string) ?? ''
          // We don't have the field label/section from config alone —
          // the block will resolve it from the FormFieldsContext when rendered.
          blocks.push({
            id: nextId(),
            type: 'dynamicVariable',
            props: {
              fieldId,
              fieldLabel: '', // Will be resolved by the editor
              sectionTitle: '',
            },
            content: undefined,
            children: [],
          })
          break
        }

        case 'table': {
          const rawColumns = (config.columns as Array<Record<string, unknown>>) ?? []
          // Restore columns with mode information
          const columns = rawColumns.map((col) => {
            if (col.formula) {
              // Formula column — parse expression back into blocks
              const formulaBlocks = parseFormulaBlocks({
                expression: col.formula as string,
              })
              return {
                mode: 'formula',
                formulaBlocks,
                label: String(col.label ?? ''),
              }
            }
            // Field column (default)
            return {
              mode: 'field',
              fieldId: String(col.template_field_id ?? ''),
              label: String(col.label ?? ''),
            }
          })
          const groupBy = config.group_by === 'group'

          blocks.push({
            id: nextId(),
            type: 'dataTable',
            props: {
              columns: JSON.stringify(columns),
              groupBy: String(groupBy),
            },
            content: undefined,
            children: [],
          })
          break
        }

        case 'static_text': {
          const content = (config.content as string) ?? field.label
          blocks.push({
            id: nextId(),
            type: 'paragraph',
            props: {},
            content: [{ type: 'text', text: content }],
            children: [],
          })
          break
        }
      }
    }
  }

  // Ensure there's at least one block
  if (blocks.length === 0) {
    blocks.push({
      id: nextId(),
      type: 'paragraph',
      props: {},
      content: [],
      children: [],
    })
  }

  return blocks
}

// ---------------------------------------------------------------------------
// Helper: resolve dynamic variable labels from form fields
// ---------------------------------------------------------------------------

/**
 * After loading editor content, resolve fieldLabel and sectionTitle
 * for dynamicVariable blocks using the form field options.
 */
export function resolveVariableLabels(
  blocks: EditorBlock[],
  formFields: { id: string; label: string; sectionTitle: string }[],
): EditorBlock[] {
  return blocks.map((block) => {
    if (block.type === 'dynamicVariable') {
      const fieldId = block.props.fieldId as string
      const field = formFields.find((f) => f.id === fieldId)
      if (field) {
        return {
          ...block,
          props: {
            ...block.props,
            fieldLabel: field.label,
            sectionTitle: field.sectionTitle,
          },
        }
      }
    }
    return block
  })
}
