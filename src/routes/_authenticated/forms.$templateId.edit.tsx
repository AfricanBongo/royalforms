/**
 * /forms/:templateId/edit — Form builder page for editing an existing template.
 *
 * Creates a new version of the template when published (per system design:
 * editing creates new version, existing instances stay on their version).
 *
 * Loads the latest version's sections and fields into the builder state,
 * then uses the same BuilderSection components as the /forms/new page.
 */
import { useEffect, useState } from 'react'

import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { SaveIcon } from 'lucide-react'
import { toast } from 'sonner'

import { BuilderSection } from '../../components/builder-section'
import { Button } from '../../components/ui/button'
import { useFormBuilder, FIELD_TYPE } from '../../hooks/use-form-builder'
import { usePageTitle } from '../../hooks/use-page-title'
import {
  fetchTemplateForEditing,
  createTemplateVersion,
} from '../../services/form-templates'
import { mapSupabaseError } from '../../lib/supabase-errors'

import type { BuilderField, BuilderState, FieldType } from '../../hooks/use-form-builder'
import type { TemplateVersionData } from '../../services/form-templates'

export const Route = createFileRoute('/_authenticated/forms/$templateId/edit')({
  component: EditFormPage,
})

// ---------------------------------------------------------------------------
// Convert loaded data to builder state
// ---------------------------------------------------------------------------

function toBuilderState(data: TemplateVersionData): BuilderState {
  let clientIdCounter = 0
  function makeId(): string {
    clientIdCounter += 1
    return `__loaded_${clientIdCounter}_${Date.now()}`
  }

  return {
    name: data.template.name,
    abbreviation: data.template.abbreviation,
    description: data.template.description ?? '',
    isAbbreviationManual: true,
    sections: data.sections.map((sec) => ({
      clientId: makeId(),
      title: sec.title,
      description: sec.description,
      sort_order: sec.sort_order,
      fields: sec.fields.map((f) => ({
        clientId: makeId(),
        label: f.label,
        description: (f as { description?: string | null }).description ?? '',
        field_type: f.field_type as FieldType,
        sort_order: f.sort_order,
        is_required: f.is_required,
        options:
          (f.field_type === FIELD_TYPE.SELECT || f.field_type === FIELD_TYPE.MULTI_SELECT) &&
          Array.isArray(f.options)
            ? (f.options as string[])
            : [],
        validation_rules:
          f.validation_rules && typeof f.validation_rules === 'object' && !Array.isArray(f.validation_rules)
            ? (f.validation_rules as Record<string, unknown>)
            : null,
        isEditing: false,
      })),
      insertingAtIndex: null,
    })),
  }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function EditFormPage() {
  const { templateId } = Route.useParams()
  const navigate = useNavigate()
  const { setPageTitle, setHeaderActions } = usePageTitle()

  const [loading, setLoading] = useState(true)
  const [isPublishing, setIsPublishing] = useState(false)

  const builder = useFormBuilder()
  const { state } = builder

  // Update breadcrumb dynamically with form name
  useEffect(() => {
    setPageTitle(state.name.trim() || 'Edit Form')
  }, [state.name, setPageTitle])

  // Inject Publish New Version button into the header bar
  useEffect(() => {
    setHeaderActions(
      <Button
        size="sm"
        onClick={handlePublish}
        disabled={isPublishing}
        className="gap-2"
      >
        <SaveIcon className="size-4" />
        {isPublishing ? 'Publishing...' : 'Publish New Version'}
      </Button>,
    )
    return () => {
      setPageTitle(null)
      setHeaderActions(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPublishing, setHeaderActions])

  // Load existing template data
  useEffect(() => {
    async function load() {
      try {
        const data = await fetchTemplateForEditing(templateId)
        const initial = toBuilderState(data)
        builder.setState(initial)
      } catch (err: unknown) {
        const error = err as { code?: string; message: string }
        const mapped = mapSupabaseError(error.code, error.message, 'database', 'read_record')
        toast.error(mapped.title, { description: mapped.description })
      } finally {
        setLoading(false)
      }
    }

    void load()
    // Only load once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId])

  // -------------------------------------------------------------------------
  // Publish new version
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
      await createTemplateVersion(templateId, {
        name: input.name,
        description: input.description,
        sections: input.sections,
      })
      toast.success('New version published successfully!')
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

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading form...</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col items-center overflow-auto bg-muted px-16">
      <div className="flex w-full max-w-[816px] flex-col gap-6 pb-16">
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

          {/* Abbreviation (read-only in edit mode) */}
          <div className="mt-2 flex items-center gap-2">
            <label className="text-sm text-muted-foreground">
              Abbreviation:
            </label>
            <span className="text-sm font-medium">{state.abbreviation}</span>
          </div>
        </div>

        {/* Sections */}
        {state.sections.map((section) => (
          <BuilderSection
            key={section.clientId}
            section={section}
            totalSections={state.sections.length}
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
      </div>
    </div>
  )
}
