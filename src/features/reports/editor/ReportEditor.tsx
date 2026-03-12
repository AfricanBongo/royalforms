/**
 * ReportEditor — wrapper component that composes BlockNote with our
 * custom blocks, slash menu, and Shadcn styling.
 *
 * Provides the FormFieldsContext so custom blocks can access form field data.
 */
import { useMemo } from 'react'

import { filterSuggestionItems } from '@blocknote/core/extensions'
import {
  getDefaultReactSlashMenuItems,
  SuggestionMenuController,
  useCreateBlockNote,
} from '@blocknote/react'
import { BlockNoteView } from '@blocknote/shadcn'

import { FormFieldsContext } from './form-fields-context'
import { reportEditorSchema } from './schema'
import { getReportSlashMenuItems } from './slash-menu-items'
import type { FormFieldOption } from './types'

import '@blocknote/shadcn/style.css'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ReportEditorProps {
  /** Initial content for the editor (from templateDetailToEditorContent). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  initialContent?: any[]
  /** Form fields from the linked form template. */
  formFields: FormFieldOption[]
  /** Called when content changes (for auto-save). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onChange?: (document: any[]) => void
  /** Whether the editor is read-only. */
  editable?: boolean
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ReportEditor({
  initialContent,
  formFields,
  onChange,
  editable = true,
}: ReportEditorProps) {
  const editor = useCreateBlockNote(
    {
      schema: reportEditorSchema,
      initialContent: initialContent?.length ? initialContent : undefined,
    },
    [initialContent],
  )

  const contextValue = useMemo(
    () => ({ formFields }),
    [formFields],
  )

  return (
    <FormFieldsContext.Provider value={contextValue}>
      <BlockNoteView
        editor={editor}
        editable={editable}
        slashMenu={false}
        onChange={() => {
          onChange?.(editor.document as unknown as Record<string, unknown>[])
        }}
        theme="light"
        className="pt-4"
      >
        <SuggestionMenuController
          triggerCharacter="/"
          getItems={async (query) =>
            filterSuggestionItems(
              [
                ...getReportSlashMenuItems(editor),
                ...getDefaultReactSlashMenuItems(editor),
              ],
              query,
            )
          }
        />
      </BlockNoteView>
    </FormFieldsContext.Provider>
  )
}
