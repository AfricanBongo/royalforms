import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'

import { createFileRoute } from '@tanstack/react-router'
import { toast } from 'sonner'

import { Avatar, AvatarFallback, AvatarImage } from '../../components/ui/avatar'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '../../components/ui/card'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { useCurrentUser } from '../../hooks/use-current-user'
import { getDefaultAvatarUri } from '../../lib/avatar'
import { mapSupabaseError } from '../../lib/supabase-errors'
import { isValidEmail } from '../../lib/validation'
import { updatePassword, updateUserMetadata } from '../../services/auth'
import {
  deleteAvatar,
  fetchGroupName,
  updateProfile,
  uploadAvatar,
} from '../../services/profiles'
import { supabase } from '../../services/supabase'

export const Route = createFileRoute('/_authenticated/settings')({
  component: SettingsPage,
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']
const MAX_FILE_SIZE = 2 * 1024 * 1024 // 2 MB

function formatRole(role: string): string {
  return role
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

// ---------------------------------------------------------------------------
// SettingsPage
// ---------------------------------------------------------------------------

function SettingsPage() {
  const currentUser = useCurrentUser()

  if (!currentUser) {
    return null
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 p-6">
      <AvatarSection />
      <PersonalInfoSection />
      <EmailSection />
      <PasswordSection />
    </div>
  )
}

// ---------------------------------------------------------------------------
// AvatarSection
// ---------------------------------------------------------------------------

function AvatarSection() {
  const currentUser = useCurrentUser()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [removing, setRemoving] = useState(false)

  const displayName = [currentUser?.firstName, currentUser?.lastName]
    .filter(Boolean)
    .join(' ') || 'User'
  const initials = [currentUser?.firstName, currentUser?.lastName]
    .map((n) => n?.charAt(0).toUpperCase() ?? '')
    .filter(Boolean)
    .join('')
  const avatarSrc = currentUser?.avatarUrl ?? getDefaultAvatarUri(displayName)

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleFileChange = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file || !currentUser) return

      // Reset input so the same file can be re-selected
      e.target.value = ''

      if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
        toast.error('Invalid file type', {
          description: 'Please upload a PNG, JPEG, GIF, or WebP image.',
        })
        return
      }

      if (file.size > MAX_FILE_SIZE) {
        toast.error('File too large', {
          description: 'Please upload an image smaller than 2 MB.',
        })
        return
      }

      setUploading(true)
      try {
        const publicUrl = await uploadAvatar(currentUser.id, file)
        await updateUserMetadata({ avatar_url: publicUrl })
        await updateProfile(currentUser.id, { avatar_url: publicUrl })
        toast.success('Profile picture updated')
      } catch (err: unknown) {
        const error = err as { code?: string; message: string }
        const mapped = mapSupabaseError(error.code, error.message, 'storage', 'upload_file')
        toast.error(mapped.title, { description: mapped.description })
      } finally {
        setUploading(false)
      }
    },
    [currentUser],
  )

  const handleRemove = useCallback(async () => {
    if (!currentUser) return

    setRemoving(true)
    try {
      await deleteAvatar(currentUser.id)
      await updateUserMetadata({ avatar_url: null })
      await updateProfile(currentUser.id, { avatar_url: null })
      toast.success('Profile picture removed')
    } catch (err: unknown) {
      const error = err as { code?: string; message: string }
      const mapped = mapSupabaseError(error.code, error.message, 'storage', 'delete_file')
      toast.error(mapped.title, { description: mapped.description })
    } finally {
      setRemoving(false)
    }
  }, [currentUser])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile Picture</CardTitle>
        <CardDescription>Upload a photo to personalize your account.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-6">
          <Avatar className="size-24">
            <AvatarImage src={avatarSrc} alt={displayName} />
            <AvatarFallback className="text-2xl">{initials || 'U'}</AvatarFallback>
          </Avatar>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => void handleFileChange(e)}
          />
        </div>
      </CardContent>
      <CardFooter className="gap-2">
        <Button
          onClick={handleUploadClick}
          disabled={uploading || removing}
        >
          {uploading ? 'Uploading...' : 'Upload photo'}
        </Button>
        {currentUser?.avatarUrl && (
          <Button
            variant="outline"
            onClick={() => void handleRemove()}
            disabled={uploading || removing}
          >
            {removing ? 'Removing...' : 'Remove photo'}
          </Button>
        )}
      </CardFooter>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// PersonalInfoSection
// ---------------------------------------------------------------------------

function PersonalInfoSection() {
  const currentUser = useCurrentUser()
  const [firstName, setFirstName] = useState(currentUser?.firstName ?? '')
  const [lastName, setLastName] = useState(currentUser?.lastName ?? '')
  const [groupName, setGroupName] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Keep fields in sync if currentUser updates (e.g. after metadata change)
  useEffect(() => {
    if (currentUser) {
      setFirstName(currentUser.firstName)
      setLastName(currentUser.lastName)
    }
  }, [currentUser])

  // Fetch group name on mount
  useEffect(() => {
    async function loadGroupName() {
      if (!currentUser?.groupId) {
        setGroupName(null)
        return
      }
      try {
        const name = await fetchGroupName(currentUser.groupId)
        setGroupName(name)
      } catch {
        setGroupName('Unknown group')
      }
    }
    void loadGroupName()
  }, [currentUser?.groupId])

  const handleSave = useCallback(async () => {
    if (!currentUser) return

    const trimmedFirst = firstName.trim()
    const trimmedLast = lastName.trim()

    if (!trimmedFirst) {
      toast.error('First name required', { description: 'Please enter your first name.' })
      return
    }
    if (!trimmedLast) {
      toast.error('Last name required', { description: 'Please enter your last name.' })
      return
    }

    setSaving(true)
    try {
      const fullName = `${trimmedFirst} ${trimmedLast}`
      await updateUserMetadata({
        first_name: trimmedFirst,
        last_name: trimmedLast,
        full_name: fullName,
      })
      await updateProfile(currentUser.id, {
        full_name: fullName,
        first_name: trimmedFirst,
        last_name: trimmedLast,
      })
      toast.success('Profile updated')
    } catch (err: unknown) {
      const error = err as { code?: string; message: string }
      const mapped = mapSupabaseError(error.code, error.message, 'auth', 'update_profile')
      toast.error(mapped.title, { description: mapped.description })
    } finally {
      setSaving(false)
    }
  }, [currentUser, firstName, lastName])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Personal Information</CardTitle>
        <CardDescription>Update your name and view your account details.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="first-name">First name</Label>
            <Input
              id="first-name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="First name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="last-name">Last name</Label>
            <Input
              id="last-name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Last name"
            />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Role</Label>
            <div>
              <Badge variant="secondary">
                {currentUser ? formatRole(currentUser.role) : '—'}
              </Badge>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Group</Label>
            <p className="text-sm text-muted-foreground">
              {currentUser?.groupId ? (groupName ?? 'Loading...') : 'No group'}
            </p>
          </div>
        </div>
      </CardContent>
      <CardFooter>
        <Button onClick={() => void handleSave()} disabled={saving}>
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </CardFooter>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// EmailSection
// ---------------------------------------------------------------------------

function EmailSection() {
  const currentUser = useCurrentUser()
  const [newEmail, setNewEmail] = useState('')
  const [saving, setSaving] = useState(false)

  const handleUpdateEmail = useCallback(async () => {
    if (!currentUser) return

    const trimmedEmail = newEmail.trim()

    if (!trimmedEmail) {
      toast.error('Email required', { description: 'Please enter a new email address.' })
      return
    }
    if (!isValidEmail(trimmedEmail)) {
      toast.error('Invalid email', { description: 'Please enter a valid email address.' })
      return
    }
    if (trimmedEmail.toLowerCase() === currentUser.email.toLowerCase()) {
      toast.error('Same email', { description: 'The new email is the same as your current email.' })
      return
    }

    setSaving(true)
    try {
      const { error } = await supabase.auth.updateUser({ email: trimmedEmail })
      if (error) throw error
      toast.success(`Confirmation email sent to ${trimmedEmail}`)
      setNewEmail('')
    } catch (err: unknown) {
      const error = err as { code?: string; message: string }
      const mapped = mapSupabaseError(error.code, error.message, 'auth', 'update_profile')
      toast.error(mapped.title, { description: mapped.description })
    } finally {
      setSaving(false)
    }
  }, [currentUser, newEmail])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Email Address</CardTitle>
        <CardDescription>Manage your email address.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Current email</Label>
          <p className="text-sm text-muted-foreground">{currentUser?.email ?? '—'}</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="new-email">New email</Label>
          <Input
            id="new-email"
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="new@example.com"
          />
          <p className="text-xs text-muted-foreground">
            A confirmation link will be sent to both your current and new email addresses. You must confirm from both to complete the change.
          </p>
        </div>
      </CardContent>
      <CardFooter>
        <Button onClick={() => void handleUpdateEmail()} disabled={saving}>
          {saving ? 'Updating...' : 'Update email'}
        </Button>
      </CardFooter>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// PasswordSection
// ---------------------------------------------------------------------------

function PasswordSection() {
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)

  const handleUpdatePassword = useCallback(async () => {
    const trimmedPassword = newPassword.trim()

    if (trimmedPassword.length < 8) {
      toast.error('Password too short', {
        description: 'Password must be at least 8 characters long.',
      })
      return
    }
    if (trimmedPassword !== confirmPassword) {
      toast.error('Passwords do not match', {
        description: 'Please make sure both passwords match.',
      })
      return
    }

    setSaving(true)
    try {
      await updatePassword(trimmedPassword)
      toast.success('Password updated')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err: unknown) {
      const error = err as { code?: string; message: string }
      const mapped = mapSupabaseError(error.code, error.message, 'auth', 'reset_password')
      toast.error(mapped.title, { description: mapped.description })
    } finally {
      setSaving(false)
    }
  }, [newPassword, confirmPassword])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Change Password</CardTitle>
        <CardDescription>Update your password to keep your account secure.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="new-password">New password</Label>
          <Input
            id="new-password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Minimum 8 characters"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm-password">Confirm password</Label>
          <Input
            id="confirm-password"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Re-enter your password"
          />
        </div>
      </CardContent>
      <CardFooter>
        <Button onClick={() => void handleUpdatePassword()} disabled={saving}>
          {saving ? 'Updating...' : 'Update password'}
        </Button>
      </CardFooter>
    </Card>
  )
}
