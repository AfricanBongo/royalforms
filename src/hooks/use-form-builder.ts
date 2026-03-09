/**
 * Form builder state management hook.
 *
 * Manages the local state for creating/editing a form template:
 * - Template metadata (name, description, abbreviation)
 * - Sections with titles, descriptions, and sort order
 * - Fields within sections with type, label, options, and validation
 *
 * State is purely client-side until publish/save is invoked.
 */
import { useCallback, useState } from 'react'

import type { Json } from '../types/database'

// ---------------------------------------------------------------------------
// Field type constants
// ---------------------------------------------------------------------------

const FIELD_TYPE = {
  TEXT: 'text',
  TEXTAREA: 'textarea',
  NUMBER: 'number',
  DATE: 'date',
  SELECT: 'select',
  MULTI_SELECT: 'multi_select',
  CHECKBOX: 'checkbox',
  RATING: 'rating',
  RANGE: 'range',
  FILE: 'file',
} as const
type FieldType = (typeof FIELD_TYPE)[keyof typeof FIELD_TYPE]

export { FIELD_TYPE }
export type { FieldType }

// ---------------------------------------------------------------------------
// Builder state types
// ---------------------------------------------------------------------------

export interface BuilderField {
  /** Client-side temp ID for React keys — NOT a database UUID. */
  clientId: string
  label: string
  field_type: FieldType
  sort_order: number
  is_required: boolean
  options: string[]
  validation_rules: Record<string, unknown> | null
  /** Whether this field is currently being edited (expanded). */
  isEditing: boolean
}

export interface BuilderSection {
  clientId: string
  title: string
  description: string | null
  sort_order: number
  fields: BuilderField[]
  /** Index of the field that is currently showing the type picker, or null. */
  insertingAtIndex: number | null
}

export interface BuilderState {
  name: string
  abbreviation: string
  description: string
  sections: BuilderSection[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let nextId = 0
function makeId(): string {
  nextId += 1
  return `__builder_${nextId}_${Date.now()}`
}

function makeDefaultField(sortOrder: number, fieldType: FieldType): BuilderField {
  return {
    clientId: makeId(),
    label: '',
    field_type: fieldType,
    sort_order: sortOrder,
    is_required: false,
    options: fieldType === FIELD_TYPE.SELECT || fieldType === FIELD_TYPE.MULTI_SELECT
      ? ['', '']
      : [],
    validation_rules: null,
    isEditing: true,
  }
}

function makeDefaultSection(sortOrder: number): BuilderSection {
  return {
    clientId: makeId(),
    title: `Section ${sortOrder}`,
    description: null,
    sort_order: sortOrder,
    fields: [],
    insertingAtIndex: null,
  }
}

// ---------------------------------------------------------------------------
// Initial state builder
// ---------------------------------------------------------------------------

function createInitialState(): BuilderState {
  return {
    name: '',
    abbreviation: '',
    description: '',
    sections: [makeDefaultSection(1)],
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useFormBuilder(initial?: BuilderState) {
  const [state, setState] = useState<BuilderState>(initial ?? createInitialState)

  // -- Template metadata ----------------------------------------------------

  const setName = useCallback((name: string) => {
    setState((s) => ({ ...s, name }))
  }, [])

  const setAbbreviation = useCallback((abbreviation: string) => {
    setState((s) => ({ ...s, abbreviation }))
  }, [])

  const setDescription = useCallback((description: string) => {
    setState((s) => ({ ...s, description }))
  }, [])

  // -- Sections -------------------------------------------------------------

  const addSection = useCallback(() => {
    setState((s) => ({
      ...s,
      sections: [
        ...s.sections,
        makeDefaultSection(s.sections.length + 1),
      ],
    }))
  }, [])

  const updateSection = useCallback(
    (sectionClientId: string, updates: Partial<Pick<BuilderSection, 'title' | 'description'>>) => {
      setState((s) => ({
        ...s,
        sections: s.sections.map((sec) =>
          sec.clientId === sectionClientId ? { ...sec, ...updates } : sec,
        ),
      }))
    },
    [],
  )

  const removeSection = useCallback((sectionClientId: string) => {
    setState((s) => {
      const filtered = s.sections.filter((sec) => sec.clientId !== sectionClientId)
      // Re-number sort_order
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

  /** Show the field type picker at the given insertion index within a section. */
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

  /** Cancel the field type picker for a section. */
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

  /** Insert a new field of the chosen type at the section's insertingAtIndex. */
  const insertField = useCallback(
    (sectionClientId: string, fieldType: FieldType) => {
      setState((s) => ({
        ...s,
        sections: s.sections.map((sec) => {
          if (sec.clientId !== sectionClientId) return sec

          const idx = sec.insertingAtIndex ?? sec.fields.length
          const newField = makeDefaultField(idx + 1, fieldType)

          // Collapse any other editing field
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
    (
      sectionClientId: string,
      fieldClientId: string,
      updates: Partial<Omit<BuilderField, 'clientId'>>,
    ) => {
      setState((s) => ({
        ...s,
        sections: s.sections.map((sec) =>
          sec.clientId === sectionClientId
            ? {
                ...sec,
                fields: sec.fields.map((f) =>
                  f.clientId === fieldClientId ? { ...f, ...updates } : f,
                ),
              }
            : sec,
        ),
      }))
    },
    [],
  )

  const removeField = useCallback(
    (sectionClientId: string, fieldClientId: string) => {
      setState((s) => ({
        ...s,
        sections: s.sections.map((sec) => {
          if (sec.clientId !== sectionClientId) return sec
          const filtered = sec.fields.filter((f) => f.clientId !== fieldClientId)
          return {
            ...sec,
            fields: filtered.map((f, i) => ({ ...f, sort_order: i + 1 })),
          }
        }),
      }))
    },
    [],
  )

  const duplicateField = useCallback(
    (sectionClientId: string, fieldClientId: string) => {
      setState((s) => ({
        ...s,
        sections: s.sections.map((sec) => {
          if (sec.clientId !== sectionClientId) return sec
          const idx = sec.fields.findIndex((f) => f.clientId === fieldClientId)
          if (idx === -1) return sec

          const original = sec.fields[idx]
          const copy: BuilderField = {
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
    },
    [],
  )

  const moveField = useCallback(
    (sectionClientId: string, fieldClientId: string, direction: 'up' | 'down') => {
      setState((s) => ({
        ...s,
        sections: s.sections.map((sec) => {
          if (sec.clientId !== sectionClientId) return sec
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
    (sectionClientId: string, fieldClientId: string, editing: boolean) => {
      setState((s) => ({
        ...s,
        sections: s.sections.map((sec) =>
          sec.clientId === sectionClientId
            ? {
                ...sec,
                fields: sec.fields.map((f) =>
                  f.clientId === fieldClientId
                    ? { ...f, isEditing: editing }
                    : editing
                      ? { ...f, isEditing: false } // Collapse others when opening one
                      : f,
                ),
              }
            : sec,
        ),
      }))
    },
    [],
  )

  // -- Choice field options -------------------------------------------------

  const addOption = useCallback(
    (sectionClientId: string, fieldClientId: string) => {
      setState((s) => ({
        ...s,
        sections: s.sections.map((sec) =>
          sec.clientId === sectionClientId
            ? {
                ...sec,
                fields: sec.fields.map((f) =>
                  f.clientId === fieldClientId
                    ? { ...f, options: [...f.options, ''] }
                    : f,
                ),
              }
            : sec,
        ),
      }))
    },
    [],
  )

  const updateOption = useCallback(
    (sectionClientId: string, fieldClientId: string, optionIndex: number, value: string) => {
      setState((s) => ({
        ...s,
        sections: s.sections.map((sec) =>
          sec.clientId === sectionClientId
            ? {
                ...sec,
                fields: sec.fields.map((f) => {
                  if (f.clientId !== fieldClientId) return f
                  const newOptions = [...f.options]
                  newOptions[optionIndex] = value
                  return { ...f, options: newOptions }
                }),
              }
            : sec,
        ),
      }))
    },
    [],
  )

  const removeOption = useCallback(
    (sectionClientId: string, fieldClientId: string, optionIndex: number) => {
      setState((s) => ({
        ...s,
        sections: s.sections.map((sec) =>
          sec.clientId === sectionClientId
            ? {
                ...sec,
                fields: sec.fields.map((f) => {
                  if (f.clientId !== fieldClientId) return f
                  const newOptions = f.options.filter((_, i) => i !== optionIndex)
                  return { ...f, options: newOptions }
                }),
              }
            : sec,
        ),
      }))
    },
    [],
  )

  // -- Serialise for publish ------------------------------------------------

  /** Convert builder state to the service input format. */
  const toCreateInput = useCallback((): {
    name: string
    abbreviation: string
    description: string | null
    sections: {
      title: string
      description: string | null
      sort_order: number
      fields: {
        label: string
        field_type: string
        sort_order: number
        is_required: boolean
        options: Json | null
        validation_rules: Json | null
      }[]
    }[]
  } => {
    return {
      name: state.name,
      abbreviation: state.abbreviation,
      description: state.description || null,
      sections: state.sections.map((sec) => ({
        title: sec.title,
        description: sec.description,
        sort_order: sec.sort_order,
        fields: sec.fields.map((f) => ({
          label: f.label,
          field_type: f.field_type,
          sort_order: f.sort_order,
          is_required: f.is_required,
          options:
            f.options.length > 0
              ? (f.options.filter((o) => o.trim() !== '') as unknown as Json)
              : null,
          validation_rules: f.validation_rules as Json | null,
        })),
      })),
    }
  }, [state])

  // -- Validation -----------------------------------------------------------

  /** Check if the form is valid enough to publish. Returns error messages. */
  const validate = useCallback((): string[] => {
    const errors: string[] = []
    if (!state.name.trim()) errors.push('Form title is required.')
    if (!state.abbreviation.trim()) errors.push('Abbreviation is required.')

    for (const sec of state.sections) {
      if (!sec.title.trim()) {
        errors.push(`Section ${sec.sort_order} title is required.`)
      }
      for (const field of sec.fields) {
        if (!field.label.trim()) {
          errors.push(`Field ${field.sort_order} in "${sec.title}" needs a label.`)
        }
        if (
          (field.field_type === FIELD_TYPE.SELECT || field.field_type === FIELD_TYPE.MULTI_SELECT) &&
          field.options.filter((o) => o.trim() !== '').length < 2
        ) {
          errors.push(
            `Choice field "${field.label || `#${field.sort_order}`}" in "${sec.title}" needs at least 2 options.`,
          )
        }
      }
    }

    return errors
  }, [state])

  return {
    state,
    setState,
    // Metadata
    setName,
    setAbbreviation,
    setDescription,
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
    // Choice options
    addOption,
    updateOption,
    removeOption,
    // Serialise / validate
    toCreateInput,
    validate,
  }
}
