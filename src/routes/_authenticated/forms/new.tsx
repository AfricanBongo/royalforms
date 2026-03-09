/**
 * /forms/new — Form builder page for creating a new form template.
 *
 * Layout matches the Figma "New Form" screens:
 * - Header: breadcrumb "Forms > New Form" + Publish button (right)
 * - Body: bg-muted, centred content (max-w-[816px])
 *   - Form title/description card (white, top, no top-rounding)
 *   - Section cards (white, rounded-lg) with fields inside
 *
 * The header bar from the authenticated layout already shows breadcrumbs,
 * but the form builder has its OWN header inside the content area (the Figma
 * shows the Publish button in the header). We use usePageTitle to set the
 * breadcrumb label.
 */
import { useEffect, useState } from 'react'

import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { SaveIcon } from 'lucide-react'
import { toast } from 'sonner'

import { BuilderSection } from '../../../components/builder-section'
import { Button } from '../../../components/ui/button'
import { ScrollArea } from '../../../components/ui/scroll-area'
import { useFormBuilder } from '../../../hooks/use-form-builder'
import { usePageTitle } from '../../../hooks/use-page-title'
import { createTemplate } from '../../../services/form-templates'
import { mapSupabaseError } from '../../../lib/supabase-errors'

import type { BuilderField, FieldType } from '../../../hooks/use-form-builder'

export const Route = createFileRoute('/_authenticated/forms/new')({
  component: NewFormPage,
})

function NewFormPage() {
  const navigate = useNavigate()
  const { setPageTitle } = usePageTitle()

  const [isPublishing, setIsPublishing] = useState(false)

  const builder = useFormBuilder()
  const { state } = builder

  // Update breadcrumb: show form name when typed, fall back to "New Form"
  useEffect(() => {
    setPageTitle(state.name.trim() || 'New Form')
    return () => setPageTitle(null)
  }, [state.name, setPageTitle])

  // -------------------------------------------------------------------------
  // Publish
  // -------------------------------------------------------------------------

  async function handlePublish() {
    const errors = builder.validate()
    if (errors.length > 0) {
      errors.forEach((msg) => toast.error(msg))
      return
    }

    setIsPublishing(true)
    try {
      const input = builder.toCreateInput()
      const templateId = await createTemplate(input)
      toast.success('Form published successfully!')
      void navigate({ to: '/forms/$templateId', params: { templateId } })
    } catch (err: unknown) {
      const error = err as { code?: string; message: string }
      const mapped = mapSupabaseError(error.code, error.message, 'database', 'create_record')
      toast.error(mapped.title, { description: mapped.description })
    } finally {
      setIsPublishing(false)
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col items-center bg-muted px-16">
        <div className="flex w-full max-w-[816px] flex-1 flex-col gap-6 overflow-clip">
          {/* Form title / description card */}
          <div className="flex flex-col gap-0 rounded-b-lg bg-background px-6 py-4">
            <div className="flex flex-col gap-1">
              <h3
                className="text-2xl font-semibold tracking-tight outline-none empty:before:content-['Form_Title'] empty:before:text-muted-foreground/50"
                contentEditable
                suppressContentEditableWarning
                onBlur={(e) => {
                  const text = e.currentTarget.textContent?.trim() ?? ''
                  builder.setName(text)
                }}
              >
                {state.name}
              </h3>
              <p
                className="text-lg outline-none empty:before:content-['Form_Description'] empty:before:text-muted-foreground/50"
                contentEditable
                suppressContentEditableWarning
                onBlur={(e) => {
                  const text = e.currentTarget.textContent?.trim() ?? ''
                  builder.setDescription(text)
                }}
              >
                {state.description}
              </p>
            </div>

            {/* Abbreviation input */}
            <div className="mt-2 flex items-center gap-2">
              <label className="text-sm text-muted-foreground" htmlFor="abbreviation">
                Abbreviation:
              </label>
              <input
                id="abbreviation"
                type="text"
                value={state.abbreviation}
                onChange={(e) => builder.setAbbreviation(e.target.value)}
                placeholder="e.g. epr"
                className="h-7 w-32 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
            </div>
          </div>

          {/* Sections */}
          {state.sections.map((section) => (
            <BuilderSection
              key={section.clientId}
              section={section}
              onUpdateSection={(updates) =>
                builder.updateSection(section.clientId, updates)
              }
              onRemoveSection={() =>
                builder.removeSection(section.clientId)
              }
              onShowFieldTypePicker={(atIndex) =>
                builder.showFieldTypePicker(section.clientId, atIndex)
              }
              onCancelFieldTypePicker={() =>
                builder.cancelFieldTypePicker(section.clientId)
              }
              onInsertField={(fieldType: FieldType) =>
                builder.insertField(section.clientId, fieldType)
              }
              onAddSection={builder.addSection}
              onUpdateField={(fieldClientId: string, updates: Partial<Omit<BuilderField, 'clientId'>>) =>
                builder.updateField(section.clientId, fieldClientId, updates)
              }
              onRemoveField={(fieldClientId: string) =>
                builder.removeField(section.clientId, fieldClientId)
              }
              onDuplicateField={(fieldClientId: string) =>
                builder.duplicateField(section.clientId, fieldClientId)
              }
              onMoveField={(fieldClientId: string, direction: 'up' | 'down') =>
                builder.moveField(section.clientId, fieldClientId, direction)
              }
              onSetFieldEditing={(fieldClientId: string, editing: boolean) =>
                builder.setFieldEditing(section.clientId, fieldClientId, editing)
              }
              onAddOption={(fieldClientId: string) =>
                builder.addOption(section.clientId, fieldClientId)
              }
              onUpdateOption={(fieldClientId: string, optionIndex: number, value: string) =>
                builder.updateOption(section.clientId, fieldClientId, optionIndex, value)
              }
              onRemoveOption={(fieldClientId: string, optionIndex: number) =>
                builder.removeOption(section.clientId, fieldClientId, optionIndex)
              }
            />
          ))}

          {/* Bottom spacer */}
          <div className="h-16" />
        </div>
      </div>

      {/* Floating publish button (fixed to bottom-right) */}
      <div className="fixed bottom-6 right-6 z-50">
        <Button
          size="lg"
          onClick={handlePublish}
          disabled={isPublishing}
          className="gap-2 shadow-lg"
        >
          <SaveIcon className="size-4" />
          {isPublishing ? 'Publishing...' : 'Publish'}
        </Button>
      </div>
    </ScrollArea>
  )
}
