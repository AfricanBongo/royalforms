/**
 * MemberRequestSheet — side sheet with two tabs:
 *   - Single: create one member request
 *   - Bulk Import: upload CSV, map columns, preview, and submit
 */
import { type ChangeEvent, type SubmitEvent, useRef, useState } from 'react'

import Papa from 'papaparse'
import { toast } from 'sonner'
import { Upload } from 'lucide-react'

import { mapSupabaseError } from '../lib/supabase-errors'
import { isValidEmail } from '../lib/validation'
import {
  addMemberDirectly,
  addMembersBulk,
  createBulkRequests,
  createRequest,
} from '../services/member-requests'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from './ui/sheet'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MemberRequestSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  groupId: string
  isRootAdmin: boolean
  onCreated: () => void
}

type BulkStep = 'upload' | 'mapping' | 'preview' | 'submit'

interface MappedRow {
  email: string
  full_name: string
  proposed_role: string
}

const NONE_SENTINEL = '__none__'

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MemberRequestSheet({
  open,
  onOpenChange,
  groupId,
  isRootAdmin,
  onCreated,
}: MemberRequestSheetProps) {
  // ---- Single tab state ----
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [proposedRole, setProposedRole] = useState('viewer')
  const [submitting, setSubmitting] = useState(false)

  // ---- Bulk tab state ----
  const [bulkStep, setBulkStep] = useState<BulkStep>('upload')
  const [csvHeaders, setCsvHeaders] = useState<string[]>([])
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([])
  const [emailCol, setEmailCol] = useState('')
  const [nameCol, setNameCol] = useState('')
  const [roleCol, setRoleCol] = useState(NONE_SENTINEL)
  const [bulkSubmitting, setBulkSubmitting] = useState(false)
  const [bulkResult, setBulkResult] = useState<{ created: number; failed: number } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ---- Derived ----
  const mappedRows: MappedRow[] = csvRows.map((row) => ({
    email: row[emailCol] ?? '',
    full_name: row[nameCol] ?? '',
    proposed_role: roleCol !== NONE_SENTINEL ? (row[roleCol] ?? 'viewer') : 'viewer',
  }))

  const canAdvanceMapping = emailCol !== '' && nameCol !== ''

  // ---- Handlers ----

  function resetSingleForm() {
    setEmail('')
    setFullName('')
    setProposedRole('viewer')
  }

  function resetBulkForm() {
    setBulkStep('upload')
    setCsvHeaders([])
    setCsvRows([])
    setEmailCol('')
    setNameCol('')
    setRoleCol(NONE_SENTINEL)
    setBulkResult(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      resetSingleForm()
      resetBulkForm()
    }
    onOpenChange(nextOpen)
  }

  async function handleSingleSubmit(e: SubmitEvent) {
    e.preventDefault()

    if (!email.trim() || !fullName.trim()) {
      toast.error('Missing fields', { description: 'Email and full name are required.' })
      return
    }

    if (!isValidEmail(email)) {
      toast.error('Invalid email', { description: 'Please enter a valid email address.' })
      return
    }

    setSubmitting(true)
    try {
      if (isRootAdmin) {
        await addMemberDirectly({
          email: email.trim(),
          full_name: fullName.trim(),
          role: proposedRole,
          group_id: groupId,
        })
        toast.success('Member added', {
          description: `An invite has been sent to ${email.trim()}.`,
        })
      } else {
        await createRequest({
          email: email.trim(),
          full_name: fullName.trim(),
          proposed_role: proposedRole,
          group_id: groupId,
        })
        toast.success('Request created', {
          description: `Member request for ${email.trim()} has been created.`,
        })
      }
      onCreated()
      handleOpenChange(false)
    } catch (err: unknown) {
      const error = err as { code?: string; message: string }
      const mapped = mapSupabaseError(error.code, error.message, 'database', 'create_record')
      toast.error(mapped.title, { description: mapped.description })
    } finally {
      setSubmitting(false)
    }
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete(results) {
        const headers = results.meta.fields ?? []
        if (headers.length === 0) {
          toast.error('Invalid CSV', { description: 'No column headers detected in the file.' })
          return
        }
        setCsvHeaders(headers)
        setCsvRows(results.data)
        setBulkStep('mapping')
      },
      error(err) {
        toast.error('CSV parse error', { description: err.message })
      },
    })
  }

  async function handleBulkSubmit() {
    const validRows = mappedRows.filter(
      (r) => r.email.trim() && r.full_name.trim() && isValidEmail(r.email),
    )
    const skipped = mappedRows.length - validRows.length

    if (validRows.length === 0) {
      toast.error('No valid rows', {
        description: 'All rows are missing required fields or have invalid email addresses.',
      })
      return
    }

    if (skipped > 0) {
      toast.warning(`Skipped ${skipped} row${skipped > 1 ? 's' : ''}`, {
        description: 'Rows with missing fields or invalid emails were excluded.',
      })
    }

    setBulkSubmitting(true)
    setBulkStep('submit')

    try {
      if (isRootAdmin) {
        const result = await addMembersBulk(
          validRows.map((r) => ({
            email: r.email,
            full_name: r.full_name,
            role: r.proposed_role,
          })),
          groupId,
        )
        setBulkResult({ created: result.invited, failed: result.failed })
        toast.success('Import complete', {
          description: `Invited ${result.invited} members. ${result.failed} failed.`,
        })
      } else {
        const result = await createBulkRequests(validRows, groupId)
        setBulkResult(result)
        toast.success('Import complete', {
          description: `Created ${result.created} requests. ${result.failed} failed.`,
        })
      }
      onCreated()
      // Auto-close after brief delay
      setTimeout(() => {
        handleOpenChange(false)
      }, 1500)
    } catch (err: unknown) {
      const error = err as { code?: string; message: string }
      const mapped = mapSupabaseError(error.code, error.message, 'database', 'create_record')
      toast.error(mapped.title, { description: mapped.description })
      // Go back to preview so user can retry
      setBulkStep('preview')
    } finally {
      setBulkSubmitting(false)
    }
  }

  // ---- Render ----

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="min-w-[480px] sm:max-w-[520px] flex flex-col">
        <SheetHeader>
          <SheetTitle>{isRootAdmin ? 'Add Member' : 'Request Member'}</SheetTitle>
          <SheetDescription>
            {isRootAdmin
              ? 'Add members to this group — an invite will be sent immediately'
              : 'Request to add members to this group'}
          </SheetDescription>
        </SheetHeader>

        <Tabs defaultValue="single" className="flex-1 px-4 pb-4">
          <TabsList className="w-full">
            <TabsTrigger value="single" className="flex-1">Single</TabsTrigger>
            <TabsTrigger value="bulk" className="flex-1">Bulk Import</TabsTrigger>
          </TabsList>

          {/* ---------- Single Tab ---------- */}
          <TabsContent value="single">
            <form onSubmit={handleSingleSubmit} className="flex flex-col gap-4 pt-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="req-email">Email</Label>
                <Input
                  id="req-email"
                  type="email"
                  placeholder="member@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={submitting}
                  required
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="req-name">Full Name</Label>
                <Input
                  id="req-name"
                  type="text"
                  placeholder="John Doe"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  disabled={submitting}
                  required
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="req-role">{isRootAdmin ? 'Role' : 'Proposed Role'}</Label>
                <Select value={proposedRole} onValueChange={setProposedRole} disabled={submitting}>
                  <SelectTrigger id="req-role" className="w-full">
                    <SelectValue placeholder="Select a role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="editor">Editor</SelectItem>
                    <SelectItem value="viewer">Viewer</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button type="submit" disabled={submitting} className="mt-2">
                {submitting
                  ? 'Submitting...'
                  : isRootAdmin
                    ? 'Add Member'
                    : 'Request Member'}
              </Button>
            </form>
          </TabsContent>

          {/* ---------- Bulk Import Tab ---------- */}
          <TabsContent value="bulk">
            <div className="flex flex-col gap-4 pt-4">
              {/* Step 1: Upload */}
              {bulkStep === 'upload' && (
                <div className="flex flex-col items-center gap-4">
                  <div
                    className="flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-muted-foreground/25 p-8 transition-colors hover:border-muted-foreground/50"
                    onClick={() => fileInputRef.current?.click()}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click()
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <Upload className="size-8 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      Click to upload a CSV file
                    </p>
                    <p className="text-xs text-muted-foreground/70">
                      .csv files only
                    </p>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </div>
              )}

              {/* Step 2: Column Mapping */}
              {bulkStep === 'mapping' && (
                <div className="flex flex-col gap-4">
                  <p className="text-sm text-muted-foreground">
                    Map your CSV columns to member fields. Detected {csvHeaders.length} columns and {csvRows.length} rows.
                  </p>

                  <div className="flex flex-col gap-2">
                    <Label>Email Column (required)</Label>
                    <Select value={emailCol} onValueChange={setEmailCol}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select column for email" />
                      </SelectTrigger>
                      <SelectContent>
                        {csvHeaders.map((h) => (
                          <SelectItem key={h} value={h}>{h}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex flex-col gap-2">
                    <Label>Full Name Column (required)</Label>
                    <Select value={nameCol} onValueChange={setNameCol}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select column for full name" />
                      </SelectTrigger>
                      <SelectContent>
                        {csvHeaders.map((h) => (
                          <SelectItem key={h} value={h}>{h}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex flex-col gap-2">
                    <Label>Role Column (optional)</Label>
                    <Select value={roleCol} onValueChange={setRoleCol}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select column for role" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE_SENTINEL}>None (default to Viewer)</SelectItem>
                        {csvHeaders.map((h) => (
                          <SelectItem key={h} value={h}>{h}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <Button variant="outline" onClick={resetBulkForm}>
                      Back
                    </Button>
                    <Button
                      onClick={() => setBulkStep('preview')}
                      disabled={!canAdvanceMapping}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}

              {/* Step 3: Preview */}
              {bulkStep === 'preview' && (
                <div className="flex flex-col gap-4">
                  <p className="text-sm font-medium">
                    {mappedRows.length} members to import
                  </p>

                  <div className="max-h-64 overflow-y-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Email</TableHead>
                          <TableHead>Full Name</TableHead>
                          <TableHead>Role</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {mappedRows.map((row, i) => (
                          <TableRow key={i}>
                            <TableCell className="text-xs">{row.email}</TableCell>
                            <TableCell className="text-xs">{row.full_name}</TableCell>
                            <TableCell className="text-xs">{row.proposed_role}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <Button variant="outline" onClick={() => setBulkStep('mapping')}>
                      Back
                    </Button>
                    <Button onClick={handleBulkSubmit}>
                      {isRootAdmin
                        ? `Add ${mappedRows.length} Members`
                        : `Import ${mappedRows.length} Members`}
                    </Button>
                  </div>
                </div>
              )}

              {/* Step 4: Submit / Result */}
              {bulkStep === 'submit' && (
                <div className="flex flex-col items-center gap-4 py-8">
                  {bulkSubmitting && (
                    <p className="text-sm text-muted-foreground">
                      {isRootAdmin ? 'Adding members...' : 'Importing members...'}
                    </p>
                  )}
                  {bulkResult && (
                    <div className="text-center">
                      <p className="text-sm font-medium">
                        {isRootAdmin
                          ? `Invited ${bulkResult.created} members. ${bulkResult.failed} failed.`
                          : `Created ${bulkResult.created} requests. ${bulkResult.failed} failed.`}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  )
}
