/**
 * Auto-save hook for the form builder.
 *
 * Debounces builder state changes and persists them to the database.
 * Handles both new forms (saveDraft -> URL swap) and existing drafts (updateDraft).
 *
 * State machine: idle -> dirty -> saving -> saved -> idle
 * If user edits while saving, queues another save after current completes.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

import type { BuilderState } from './use-form-builder'
import type { CreateTemplateInput } from '../services/form-templates'
import { saveDraft, updateDraft } from '../services/form-templates'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error'

export interface UseAutoSaveOptions {
  /** Template ID, or null for new (not yet persisted) forms. */
  templateId: string | null
  /** Current builder state to watch for changes. */
  builderState: BuilderState
  /** Serialiser — converts builder state to service input format. */
  toCreateInput: () => CreateTemplateInput
}

export interface UseAutoSaveReturn {
  /** Current save status for UI display. */
  saveStatus: SaveStatus
  /** Template ID once persisted (starts as null for new forms). */
  persistedTemplateId: string | null
  /** Flush any pending changes immediately. Returns a promise that resolves when save completes. */
  flush: () => Promise<void>
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEBOUNCE_MS = 3_000
const SAVED_DISPLAY_MS = 2_000

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Serialise the parts of BuilderState that matter for change detection.
 * Strips transient UI fields (isEditing, insertingAtIndex, clientId).
 */
function stateFingerprint(s: BuilderState): string {
  return JSON.stringify({
    name: s.name,
    description: s.description,
    sections: s.sections.map((sec) => ({
      title: sec.title,
      description: sec.description,
      sort_order: sec.sort_order,
      fields: sec.fields.map((f) => ({
        label: f.label,
        description: f.description,
        field_type: f.field_type,
        sort_order: f.sort_order,
        is_required: f.is_required,
        options: f.options,
        validation_rules: f.validation_rules,
      })),
    })),
  })
}

/**
 * A change is "meaningful" when any of these are non-empty after trim:
 * - Form title
 * - Form description
 * - Any field label in any section
 *
 * This prevents creating empty draft records when users visit /forms/new
 * and immediately leave.
 */
function hasMeaningfulContent(s: BuilderState): boolean {
  if (s.name.trim()) return true
  if (s.description.trim()) return true
  for (const sec of s.sections) {
    for (const f of sec.fields) {
      if (f.label.trim()) return true
    }
  }
  return false
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAutoSave({
  templateId,
  builderState,
  toCreateInput,
}: UseAutoSaveOptions): UseAutoSaveReturn {
  // -- Persisted template ID (starts as prop, updated after first save) ------
  const [persistedTemplateId, setPersistedTemplateId] = useState<string | null>(templateId)

  // Sync if parent passes a new templateId (e.g. after URL swap)
  useEffect(() => {
    setPersistedTemplateId(templateId)
  }, [templateId])

  // -- Save status -----------------------------------------------------------
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')

  // -- Refs for debounce / change detection ----------------------------------
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savedDisplayTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevFingerprint = useRef<string | null>(null)
  const isInitialRender = useRef(true)
  const isSaving = useRef(false)
  const dirtyWhileSaving = useRef(false)
  const persistedIdRef = useRef<string | null>(persistedTemplateId)

  // Keep ref in sync with state
  useEffect(() => {
    persistedIdRef.current = persistedTemplateId
  }, [persistedTemplateId])

  // Latest toCreateInput ref to avoid stale closures
  const toCreateInputRef = useRef(toCreateInput)
  useEffect(() => {
    toCreateInputRef.current = toCreateInput
  }, [toCreateInput])

  // -- Core save function (via ref to allow self-scheduling) -----------------
  const performSaveRef = useRef<() => Promise<void>>(async () => {})

  useEffect(() => {
    performSaveRef.current = async () => {
      if (isSaving.current) {
        dirtyWhileSaving.current = true
        return
      }

      isSaving.current = true
      setSaveStatus('saving')

      try {
        const input = toCreateInputRef.current()

        if (persistedIdRef.current === null) {
          // First save — create the draft
          const newId = await saveDraft(input)
          setPersistedTemplateId(newId)
          persistedIdRef.current = newId
        } else {
          // Subsequent save — update in-place
          await updateDraft(persistedIdRef.current, {
            name: input.name,
            description: input.description,
            sections: input.sections,
          })
        }

        isSaving.current = false
        setSaveStatus('saved')

        // Clear "saved" indicator after a brief display
        if (savedDisplayTimer.current) clearTimeout(savedDisplayTimer.current)
        savedDisplayTimer.current = setTimeout(() => {
          setSaveStatus((prev) => (prev === 'saved' ? 'idle' : prev))
        }, SAVED_DISPLAY_MS)

        // If user edited while we were saving, queue another save
        if (dirtyWhileSaving.current) {
          dirtyWhileSaving.current = false
          setSaveStatus('dirty')
          debounceTimer.current = setTimeout(() => {
            void performSaveRef.current()
          }, DEBOUNCE_MS)
        }
      } catch (err) {
        console.error('[useAutoSave] Save failed:', err)
        isSaving.current = false
        setSaveStatus('error')
      }
    }
  })

  // Stable function that delegates to the ref
  const triggerSave = useCallback(() => {
    void performSaveRef.current()
  }, [])

  // -- Watch for builder state changes ---------------------------------------
  useEffect(() => {
    const fp = stateFingerprint(builderState)

    // Skip the initial render (loading data is not a change)
    if (isInitialRender.current) {
      isInitialRender.current = false
      prevFingerprint.current = fp
      return
    }

    // No actual change
    if (fp === prevFingerprint.current) return

    prevFingerprint.current = fp

    // Gate: don't persist empty forms
    if (!hasMeaningfulContent(builderState)) return

    // Mark dirty and start/reset debounce timer
    setSaveStatus((prev) => (prev === 'saving' ? prev : 'dirty'))
    if (isSaving.current) {
      dirtyWhileSaving.current = true
      return
    }

    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(triggerSave, DEBOUNCE_MS)
  }, [builderState, triggerSave])

  // -- Flush: immediate save (for publish / navigate) -----------------------
  const flush = useCallback(async () => {
    // Cancel pending debounce
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current)
      debounceTimer.current = null
    }

    // Only save if there are pending changes
    if (!hasMeaningfulContent(builderState)) return

    // Wait for any in-flight save to finish
    if (isSaving.current) {
      await new Promise<void>((resolve) => {
        const check = setInterval(() => {
          if (!isSaving.current) {
            clearInterval(check)
            resolve()
          }
        }, 50)
      })
    }

    // If dirty or pending, save now
    if (dirtyWhileSaving.current) {
      dirtyWhileSaving.current = false
      await performSaveRef.current()
    } else {
      // Check if current state differs from what was last saved
      const fp = stateFingerprint(builderState)
      if (fp !== prevFingerprint.current || persistedIdRef.current === null) {
        await performSaveRef.current()
      }
    }
  }, [builderState])

  // -- Cleanup timers on unmount --------------------------------------------
  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
      if (savedDisplayTimer.current) clearTimeout(savedDisplayTimer.current)
    }
  }, [])

  return {
    saveStatus,
    persistedTemplateId,
    flush,
  }
}
