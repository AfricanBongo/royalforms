/**
 * Shared types for the report WYSIWYG editor.
 * Re-exports FormulaBlock and FormFieldOption from the old builder hook
 * so they can be used by the new BlockNote custom blocks.
 */

// ---------------------------------------------------------------------------
// Formula block types
// ---------------------------------------------------------------------------

export type FormulaBlock =
  | { kind: 'aggregate'; fn: 'SUM' | 'AVERAGE' | 'MIN' | 'MAX' | 'COUNT' | 'MEDIAN'; fieldId: string }
  | { kind: 'operator'; op: '+' | '-' | '*' | '/' }
  | { kind: 'literal'; value: number }

// ---------------------------------------------------------------------------
// Form field option (from linked form template)
// ---------------------------------------------------------------------------

export interface FormFieldOption {
  id: string
  label: string
  sectionTitle: string
  field_type: string
}
