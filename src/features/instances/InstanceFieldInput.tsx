import { useEffect, useRef, useState } from 'react'

import { FileIcon, Loader2Icon, Star, Trash2Icon, UploadCloudIcon } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

import {
  uploadInstanceFile,
  removeInstanceFile,
  getFileDownloadUrl,
} from '../../services/form-templates'
import type { InstanceField, UploadedFile } from '../../services/form-templates'

interface InstanceFieldInputProps {
  field: InstanceField
  value: string | null
  disabled: boolean
  instanceId: string
  onChange: (value: string | null) => void
  onBlur: (valueOverride?: string | null) => void
}

export function InstanceFieldInput({
  field,
  value,
  disabled,
  instanceId,
  onChange,
  onBlur,
}: InstanceFieldInputProps) {
  const rules = field.validation_rules ?? {}

  switch (field.field_type) {
    case 'text':
      return (
        <div className="space-y-1">
          <Input
            value={value ?? ''}
            disabled={disabled}
            maxLength={1000}
            onChange={(e) => onChange(e.target.value || null)}
            onBlur={() => onBlur()}
          />
          <CharacterCounter
            currentLength={(value ?? '').length}
            maxChars={1000}
            threshold={900}
          />
        </div>
      )

    case 'textarea': {
      const taMinLength = rules.min_length != null ? Number(rules.min_length) : undefined
      const taMaxRaw = rules.max_length != null ? Number(rules.max_length) : 2000
      const taMaxLength = Math.min(taMaxRaw, 5000)
      const taThreshold = Math.floor(taMaxLength * 0.9)
      return (
        <div className="space-y-1">
          <Textarea
            value={value ?? ''}
            disabled={disabled}
            maxLength={taMaxLength}
            onChange={(e) => onChange(e.target.value || null)}
            onBlur={() => onBlur()}
          />
          <CharacterCounter
            currentLength={(value ?? '').length}
            minChars={taMinLength}
            maxChars={taMaxLength}
            threshold={taThreshold}
          />
        </div>
      )
    }

    case 'number':
      return (
        <Input
          type="number"
          value={value ?? ''}
          disabled={disabled}
          min={rules.min_value != null ? Number(rules.min_value) : undefined}
          max={rules.max_value != null ? Number(rules.max_value) : undefined}
          onChange={(e) => onChange(e.target.value || null)}
          onBlur={() => onBlur()}
        />
      )

    case 'date':
      return (
        <Input
          type="date"
          value={value ?? ''}
          disabled={disabled}
          min={
            typeof rules.min_date === 'string' ? rules.min_date : undefined
          }
          max={
            typeof rules.max_date === 'string' ? rules.max_date : undefined
          }
          onChange={(e) => onChange(e.target.value || null)}
          onBlur={() => onBlur()}
        />
      )

    case 'select':
      return (
        <Select
          value={value || undefined}
          disabled={disabled}
          onValueChange={(v) => {
            const newValue = v || null
            onChange(newValue)
            onBlur(newValue)
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select an option" />
          </SelectTrigger>
          <SelectContent>
            {(field.options ?? []).length > 0 ? (
              field.options!.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))
            ) : (
              <div className="px-2 py-1.5 text-sm text-muted-foreground">
                No options available
              </div>
            )}
          </SelectContent>
        </Select>
      )

    case 'multi_select':
      return <MultiSelectInput field={field} value={value} disabled={disabled} onChange={onChange} onBlur={onBlur} />

    case 'checkbox':
      return (
        <div className="flex items-center gap-2">
          <Checkbox
            checked={value === 'true'}
            disabled={disabled}
            onCheckedChange={(checked) => {
              const newValue = checked === true ? 'true' : 'false'
              onChange(newValue)
              onBlur(newValue)
            }}
          />
        </div>
      )

    case 'rating':
      return <RatingInput value={value} disabled={disabled} onChange={onChange} onBlur={onBlur} />

    case 'range':
      return <RangeInput rules={rules} value={value} disabled={disabled} onChange={onChange} onBlur={onBlur} />

    case 'file':
      return (
        <FileUploadInput
          field={field}
          value={value}
          disabled={disabled}
          instanceId={instanceId}
          onChange={onChange}
          onBlur={onBlur}
        />
      )

    default:
      return (
        <p className="text-sm text-muted-foreground">
          Unsupported field type
        </p>
      )
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function CharacterCounter({
  currentLength,
  minChars,
  maxChars,
  threshold,
}: {
  currentLength: number
  minChars?: number
  maxChars?: number
  threshold?: number
}) {
  if (minChars == null && maxChars == null) return null

  // Don't show until threshold is reached (if provided)
  if (threshold != null && currentLength < threshold && !(minChars != null && currentLength > 0 && currentLength < minChars)) {
    return null
  }

  const hasTyped = currentLength > 0
  const underMin = minChars != null && currentLength < minChars
  const overMax = maxChars != null && currentLength > maxChars
  const isInvalid = hasTyped && (underMin || overMax)
  const isValid = hasTyped && !isInvalid

  let colorClass = 'text-muted-foreground'
  if (isInvalid) colorClass = 'text-destructive'
  else if (isValid) colorClass = 'text-green-600'

  let label = ''
  if (maxChars != null) {
    label = `${currentLength} / ${maxChars}`
  }
  if (minChars != null && maxChars == null) {
    label = `${currentLength} characters (min ${minChars})`
  }
  if (minChars != null && maxChars != null) {
    label = `${currentLength} / ${maxChars} (min ${minChars})`
  }

  return (
    <p className={`text-xs ${colorClass}`}>
      {label}
    </p>
  )
}

function MultiSelectInput({
  field,
  value,
  disabled,
  onChange,
  onBlur,
}: {
  field: InstanceField
  value: string | null
  disabled: boolean
  onChange: (value: string | null) => void
  onBlur: (valueOverride?: string | null) => void
}) {
  const selected = value ? value.split(',').filter(Boolean) : []

  function toggle(option: string) {
    const next = selected.includes(option)
      ? selected.filter((s) => s !== option)
      : [...selected, option]

    const newValue = next.length > 0 ? next.join(',') : null
    onChange(newValue)
    onBlur(newValue)
  }

  return (
    <div className="flex flex-col gap-2">
      {(field.options ?? []).map((option) => (
        <label
          key={option}
          className="flex items-center gap-2 text-sm"
        >
          <Checkbox
            checked={selected.includes(option)}
            disabled={disabled}
            onCheckedChange={() => toggle(option)}
          />
          {option}
        </label>
      ))}
    </div>
  )
}

function RatingInput({
  value,
  disabled,
  onChange,
  onBlur,
}: {
  value: string | null
  disabled: boolean
  onChange: (value: string | null) => void
  onBlur: (valueOverride?: string | null) => void
}) {
  const current = value != null ? Number(value) : 0

  function handleClick(star: number) {
    if (disabled) return
    const newValue = current === star ? null : String(star)
    onChange(newValue)
    onBlur(newValue)
  }

  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={disabled}
          className="p-0.5 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          onClick={() => handleClick(star)}
        >
          <Star
            className={`size-5 ${
              star <= current
                ? 'fill-yellow-400 text-yellow-400'
                : 'fill-none text-muted-foreground'
            }`}
          />
        </button>
      ))}
    </div>
  )
}

function RangeInput({
  rules,
  value,
  disabled,
  onChange,
  onBlur,
}: {
  rules: Record<string, unknown>
  value: string | null
  disabled: boolean
  onChange: (value: string | null) => void
  onBlur: (valueOverride?: string | null) => void
}) {
  const min = rules.min_value != null ? Number(rules.min_value) : 0
  const max = rules.max_value != null ? Number(rules.max_value) : 100
  const step = rules.step != null ? Number(rules.step) : 1
  const current = value != null ? Number(value) : min

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-muted-foreground w-8 text-right">
        {current}
      </span>
      <Slider
        value={[current]}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onValueChange={(vals) => {
          onChange(String(vals[0]))
        }}
        onValueCommit={() => onBlur()}
        className="flex-1"
      />
    </div>
  )
}

function FileUploadInput({
  field,
  value,
  disabled,
  instanceId,
  onChange,
  onBlur,
}: {
  field: InstanceField
  value: string | null
  disabled: boolean
  instanceId: string
  onChange: (value: string | null) => void
  onBlur: (valueOverride?: string | null) => void
}) {
  const rules = field.validation_rules ?? {}
  const allowMultiple = (rules.allow_multiple as boolean) ?? false
  const acceptedTypes = (rules.accepted_types as string) ?? ''
  const maxSizeMb = (rules.max_size_mb as number) ?? 10

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState<Map<string, { name: string }>>(new Map())

  // Parse current files from value (JSON array of UploadedFile)
  const currentFiles: UploadedFile[] = value ? (() => {
    try { return JSON.parse(value) as UploadedFile[] }
    catch { return [] }
  })() : []

  // Navigation blocker: prevent leaving while uploads are in progress
  useEffect(() => {
    if (uploading.size === 0) return
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [uploading.size])

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files || files.length === 0) return

    // Snapshot files BEFORE resetting input — FileList is a live reference
    // that gets emptied when e.target.value is cleared.
    const fileList = Array.from(files)

    // Reset the input so the same file can be re-selected
    e.target.value = ''

    // Validate file sizes
    for (const file of fileList) {
      if (file.size > maxSizeMb * 1024 * 1024) {
        toast.error(`File "${file.name}" exceeds ${maxSizeMb} MB limit`)
        return
      }
    }

    // If single file mode, replace existing files
    let updatedFiles = allowMultiple ? [...currentFiles] : []

    for (const file of fileList) {
      const tempId = crypto.randomUUID()

      // Track upload
      setUploading((prev) => {
        const next = new Map(prev)
        next.set(tempId, { name: file.name })
        return next
      })

      try {
        const result = await uploadInstanceFile(
          instanceId,
          field.id,
          file,
        )

        updatedFiles = [...updatedFiles, result]

        // Remove from uploading
        setUploading((prev) => {
          const next = new Map(prev)
          next.delete(tempId)
          return next
        })
      } catch (err) {
        console.error('[FileUpload] Upload failed:', err)
        setUploading((prev) => {
          const next = new Map(prev)
          next.delete(tempId)
          return next
        })
        const message = err instanceof Error ? err.message : 'Unknown error'
        toast.error(`Failed to upload "${file.name}"`, { description: message })
        return
      }
    }

    const newValue = updatedFiles.length > 0 ? JSON.stringify(updatedFiles) : null
    onChange(newValue)
    onBlur(newValue)
  }

  async function handleRemove(fileToRemove: UploadedFile) {
    try {
      await removeInstanceFile(fileToRemove.path)
    } catch {
      // File may already be gone — continue with UI update
    }

    const updated = currentFiles.filter((f) => f.path !== fileToRemove.path)
    const newValue = updated.length > 0 ? JSON.stringify(updated) : null
    onChange(newValue)
    onBlur(newValue)
  }

  async function handleDownload(file: UploadedFile) {
    try {
      const url = await getFileDownloadUrl(file.path)
      window.open(url, '_blank')
    } catch {
      toast.error('Failed to generate download link')
    }
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const hasFiles = currentFiles.length > 0
  const isUploading = uploading.size > 0
  const canAddMore = !disabled && (allowMultiple || (!hasFiles && !isUploading))

  return (
    <div className="space-y-2">
      {/* File list */}
      {currentFiles.map((file) => (
        <div
          key={file.path}
          className="flex items-center gap-2 rounded-md border border-border px-3 py-2"
        >
          <FileIcon className="size-4 shrink-0 text-muted-foreground" />
          <button
            type="button"
            className="flex-1 truncate text-left text-sm text-blue-600 hover:underline"
            onClick={() => void handleDownload(file)}
          >
            {file.name}
          </button>
          <span className="shrink-0 text-xs text-muted-foreground">
            {formatFileSize(file.size)}
          </span>
          {!disabled && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-6 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => void handleRemove(file)}
                >
                  <Trash2Icon className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Remove file</TooltipContent>
            </Tooltip>
          )}
        </div>
      ))}

      {/* Uploading indicators */}
      {Array.from(uploading.entries()).map(([id, info]) => (
        <div
          key={id}
          className="flex items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-2"
        >
          <Loader2Icon className="size-4 shrink-0 animate-spin text-muted-foreground" />
          <span className="flex-1 truncate text-sm text-muted-foreground">
            {info.name}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">Uploading...</span>
        </div>
      ))}

      {/* Drop zone / upload button */}
      {canAddMore && (
        <button
          type="button"
          className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-muted-foreground/25 px-4 py-6 text-sm text-muted-foreground transition-colors hover:border-muted-foreground/50 hover:bg-muted/50"
          onClick={() => fileInputRef.current?.click()}
        >
          <UploadCloudIcon className="size-5" />
          <span>Click to upload{allowMultiple ? ' files' : ' a file'}</span>
        </button>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept={acceptedTypes || undefined}
        multiple={allowMultiple}
        onChange={(e) => void handleFileSelect(e)}
      />

      {/* Hint */}
      {canAddMore && (acceptedTypes || maxSizeMb) && (
        <p className="text-xs text-muted-foreground">
          {acceptedTypes && `Accepted: ${acceptedTypes}`}
          {acceptedTypes && maxSizeMb ? ' · ' : ''}
          {maxSizeMb && `Max ${maxSizeMb} MB`}
        </p>
      )}
    </div>
  )
}
