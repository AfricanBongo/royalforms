import {
  type ChangeEvent,
  type SubmitEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'

import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import type { User } from '@supabase/supabase-js'
import {
  CheckIcon,
  Loader2Icon,
  LockIcon,
  MailIcon,
} from 'lucide-react'
import { toast } from 'sonner'

import { Avatar, AvatarFallback, AvatarImage } from '../../components/ui/avatar'
import { Button } from '../../components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../../components/ui/card'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '../../components/ui/input-group'
import { getSession, verifyInviteOtp, updatePassword, updateUserMetadata } from '../../services/auth'
import { supabase } from '../../services/supabase'
import { fetchGroupName, uploadAvatar, updateProfile } from '../../services/profiles'
import { mapSupabaseError } from '../../lib/supabase-errors'
import { getDefaultAvatarUri } from '../../lib/avatar'
import type { UserRole } from '../../types/auth'

export const Route = createFileRoute('/invite/accept')({
  beforeLoad: ({ context }) => {
    if (context.setup.isSetupComplete === false) {
      throw redirect({ to: '/setup' })
    }
  },
  component: InviteAcceptPage,
})

type Step = 'verifying' | 'create-account' | 'onboarding' | 'thank-you'
type ButtonState = 'idle' | 'loading' | 'success'

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

function InviteAcceptPage() {
  const navigate = useNavigate()

  const [step, setStep] = useState<Step>('verifying')
  const [user, setUser] = useState<User | null>(null)
  const [error, setError] = useState<string | null>(null)

  const resolveStepFromUser = useCallback((sessionUser: User) => {
    setUser(sessionUser)
    const meta = sessionUser.user_metadata
    if (meta.first_name && meta.last_name) {
      setStep('thank-you')
    } else if (meta.onboarding_password_set) {
      setStep('onboarding')
    } else {
      setStep('create-account')
    }
  }, [])

  // Verify the invite token from URL on mount
  useEffect(() => {
    async function verifyInviteToken() {
      const params = new URLSearchParams(window.location.search)
      const tokenHash = params.get('token_hash')
      const type = params.get('type')

      // Flow A: token_hash in query params (custom email template flow)
      if (tokenHash && type === 'invite') {
        // Sign out any existing session first so verifyOtp establishes
        // the invited user's session, not the current user's.
        await supabase.auth.signOut()

        try {
          const verifiedUser = await verifyInviteOtp(tokenHash)
          setUser(verifiedUser)
          setStep('create-account')
        } catch (err: unknown) {
          const error = err as { message?: string }
          setError(
            error.message ??
            'Could not verify the invite link. It may have expired. Please contact your administrator for a new invite.'
          )
          return
        }
        // Clean the URL of token params
        window.history.replaceState({}, '', window.location.pathname)
        return
      }

      // Flow B: hash fragment redirect (default Supabase invite flow)
      // The supabase-js client auto-detects #access_token in the URL and
      // establishes a session. We must NOT clear the hash before the client
      // has finished processing it. Instead, wait for getSession() to pick
      // up the session from the hash, then clean the URL afterwards.
      const hash = window.location.hash
      if (hash && hash.includes('access_token')) {
        // Sign out any existing session first so the hash fragment tokens
        // (which belong to the invited user) take precedence.
        await supabase.auth.signOut()

        // getSession() detects the hash fragment, exchanges it for a
        // session, and stores it. After this call the session is established.
        const session = await getSession()
        // Now safe to clean the hash from the URL.
        window.history.replaceState({}, '', window.location.pathname)

        if (session?.user) {
          resolveStepFromUser(session.user)
          return
        }

        setError('This invite link is invalid or has expired. Please contact your administrator for a new invite.')
        return
      }

      // Flow C: no token at all — check for existing session
      // (e.g. they refreshed the page after verifying)
      const session = await getSession()
      if (session?.user) {
        resolveStepFromUser(session.user)
        return
      }

      setError('This invite link is invalid or has expired. Please contact your administrator for a new invite.')
    }

    void verifyInviteToken()
  }, [resolveStepFromUser])

  if (error) {
    return <ErrorScreen message={error} />
  }

  if (step === 'verifying') {
    return <VerifyingScreen />
  }

  if (step === 'create-account' && user) {
    return (
      <CreateAccountStep
        user={user}
        onComplete={() => setStep('onboarding')}
      />
    )
  }

  if (step === 'onboarding' && user) {
    return (
      <OnboardingStep
        user={user}
        onComplete={(updatedUser) => {
          setUser(updatedUser)
          setStep('thank-you')
        }}
      />
    )
  }

  if (step === 'thank-you') {
    return (
      <ThankYouStep
        onStart={() => void navigate({ to: '/' })}
      />
    )
  }

  return null
}

// ---------------------------------------------------------------------------
// Verifying screen (loading state)
// ---------------------------------------------------------------------------

function VerifyingScreen() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6">
      <Loader2Icon className="size-8 animate-spin text-muted-foreground" />
      <p className="text-sm text-muted-foreground">Verifying your invite...</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Error screen
// ---------------------------------------------------------------------------

function ErrorScreen({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-background px-6">
      <h1 className="text-center text-[30px] font-semibold leading-[30px] tracking-[-1px] text-foreground">
        RoyalHouse Reporting Dashboard
      </h1>
      <Card className="w-full min-w-[280px] max-w-[400px]">
        <CardHeader>
          <CardTitle className="text-base">Invite link invalid</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{message}</p>
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 1: Create Account
// ---------------------------------------------------------------------------

function CreateAccountStep({
  user,
  onComplete,
}: {
  user: User
  onComplete: () => void
}) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [buttonState, setButtonState] = useState<ButtonState>('idle')

  const isDisabled = buttonState === 'loading' || buttonState === 'success'
  const email = user.email ?? ''

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()

    if (!password.trim()) {
      toast.error('Missing password', {
        description: 'Please enter a password for your account.',
      })
      return
    }

    if (password.length < 8) {
      toast.error('Password too short', {
        description: 'Your password must be at least 8 characters long.',
      })
      return
    }

    if (password !== confirmPassword) {
      toast.error('Passwords do not match', {
        description:
          'The password and confirmation password you entered are different. Please make sure they match.',
      })
      return
    }

    setButtonState('loading')

    try {
      await updatePassword(password, { onboarding_password_set: true })
    } catch (err: unknown) {
      setButtonState('idle')
      const error = err as { code?: string; message: string }
      const mapped = mapSupabaseError(error.code, error.message, 'auth', 'invite_accept')
      toast.error(mapped.title, { description: mapped.description })
      return
    }

    // Mark invite as completed in the profiles table
    try {
      await updateProfile(user.id, { invite_status: 'completed' })
    } catch {
      // Non-critical: invite_status update failed but password is set
      console.error('Failed to update invite_status to completed')
    }

    setButtonState('success')

    setTimeout(() => {
      onComplete()
    }, 800)
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-background px-6">
      <h1 className="text-center text-[30px] font-semibold leading-[30px] tracking-[-1px] text-foreground">
        RoyalHouse Reporting Dashboard
      </h1>

      <Card className="w-full min-w-[280px] max-w-[400px]">
        <CardHeader>
          <CardTitle className="text-base">Create your account</CardTitle>
          <p className="text-sm text-muted-foreground">
            Enter your desired credentials below to create your account
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <Label htmlFor="email">Email</Label>
              <InputGroup className="opacity-50">
                <InputGroupAddon>
                  <MailIcon />
                </InputGroupAddon>
                <InputGroupInput
                  id="email"
                  type="email"
                  value={email}
                  readOnly
                  disabled
                />
              </InputGroup>
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor="password">Password</Label>
              <InputGroup>
                <InputGroupAddon>
                  <LockIcon />
                </InputGroupAddon>
                <InputGroupInput
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isDisabled}
                />
              </InputGroup>
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor="confirm-password">Confirm Password</Label>
              <InputGroup>
                <InputGroupAddon>
                  <LockIcon />
                </InputGroupAddon>
                <InputGroupInput
                  id="confirm-password"
                  type="password"
                  placeholder="Confirm your password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={isDisabled}
                />
              </InputGroup>
            </div>

            <Button
              type="submit"
              disabled={isDisabled}
              className={
                buttonState === 'success'
                  ? 'bg-green-600 hover:bg-green-600 text-white'
                  : ''
              }
            >
              {buttonState === 'loading' && (
                <>
                  <Loader2Icon className="size-4 animate-spin" />
                  Creating account
                </>
              )}
              {buttonState === 'success' && (
                <>
                  <CheckIcon className="size-4" />
                  Account created
                </>
              )}
              {buttonState === 'idle' && 'Create account'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 2: Onboarding
// ---------------------------------------------------------------------------

function OnboardingStep({
  user,
  onComplete,
}: {
  user: User
  onComplete: (updatedUser: User) => void
}) {
  const meta = user.user_metadata
  const role = (meta.role as UserRole) ?? 'viewer'
  const groupId = meta.group_id as string | null

  const [groupName, setGroupName] = useState('your group')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [buttonState, setButtonState] = useState<ButtonState>('idle')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Fetch group name via service
  useEffect(() => {
    if (!groupId) return

    async function loadGroupName() {
      try {
        const name = await fetchGroupName(groupId!)
        if (name) setGroupName(name)
      } catch {
        // Non-critical: keep default 'your group'
      }
    }

    void loadGroupName()
  }, [groupId])

  const isDisabled = buttonState === 'loading' || buttonState === 'success'

  // Compute initials for fallback
  const initials = [firstName, lastName]
    .map((n) => n.trim().charAt(0).toUpperCase())
    .filter(Boolean)
    .join('')

  const handleFileChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    const validTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']
    if (!validTypes.includes(file.type)) {
      toast.error('Invalid file type', {
        description: 'Please upload a PNG, JPEG, GIF, or WebP image.',
      })
      return
    }

    // Validate file size (2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast.error('File too large', {
        description: 'Your profile picture must be under 2MB.',
      })
      return
    }

    setAvatarFile(file)

    // Create local preview
    const reader = new FileReader()
    reader.onload = (ev) => {
      setAvatarPreview(ev.target?.result as string)
    }
    reader.readAsDataURL(file)
  }, [])

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()

    if (!firstName.trim() || !lastName.trim()) {
      toast.error('Missing information', {
        description: 'Please enter both your first name and last name.',
      })
      return
    }

    setButtonState('loading')

    let avatarUrl: string | null = null

    // Upload avatar if one was selected
    if (avatarFile) {
      try {
        avatarUrl = await uploadAvatar(user.id, avatarFile)
      } catch (err: unknown) {
        setButtonState('idle')
        const error = err as { message: string }
        const mapped = mapSupabaseError(
          error.message,
          error.message,
          'storage',
          'upload_file',
        )
        toast.error(mapped.title, { description: mapped.description })
        return
      }
    }

    // Update user metadata with first_name, last_name, avatar_url
    let updatedUser
    try {
      updatedUser = await updateUserMetadata({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        full_name: `${firstName.trim()} ${lastName.trim()}`,
        ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
      })
    } catch (err: unknown) {
      setButtonState('idle')
      const error = err as { code?: string; message: string }
      const mapped = mapSupabaseError(
        error.code,
        error.message,
        'auth',
        'update_profile',
      )
      toast.error(mapped.title, { description: mapped.description })
      return
    }

    // Update the profiles table with full_name
    try {
      await updateProfile(user.id, {
        full_name: `${firstName.trim()} ${lastName.trim()}`,
      })
    } catch {
      // Non-critical: profile sync failed but auth metadata is updated
      console.error('Profile table update failed')
    }

    setButtonState('success')

    setTimeout(() => {
      onComplete(updatedUser)
    }, 800)
  }

  // Format role for display
  const roleLabel = role === 'root_admin' ? 'Root Admin' : role.charAt(0).toUpperCase() + role.slice(1)
  const articlePrefix = ['admin', 'editor'].includes(role) ? 'an' : 'a'

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6">
      <div className="flex w-full min-w-[400px] max-w-[620px] flex-col gap-8">
        {/* Header */}
        <div className="flex flex-col gap-1">
          <p className="text-[30px] font-semibold leading-[30px] tracking-[-1px] text-muted-foreground">
            Welcome to
          </p>
          <h1 className="text-[48px] font-semibold leading-[48px] tracking-[-1.5px] text-foreground">
            RoyalHouse Reporting Dashboard
          </h1>
        </div>

        {/* Role + group info */}
        <p className="text-[20px] font-semibold leading-[24px] text-foreground">
          You are part of{' '}
          <span className="text-muted-foreground underline">{groupName}</span>
          {` as ${articlePrefix} ${roleLabel}`}
        </p>

        {/* Card */}
        <Card className="w-full min-w-[400px] max-w-[620px]">
          <CardHeader>
            <CardTitle className="text-base">Edit your personal information</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="flex flex-col gap-8">
              <div className="flex items-center gap-10">
                {/* Avatar section */}
                <div className="flex flex-col items-center gap-2">
                  <Avatar className="size-[72px]">
                    <AvatarImage
                      src={avatarPreview ?? getDefaultAvatarUri([firstName, lastName].filter(Boolean).join(' ') || user.email || 'user')}
                      alt="Profile picture"
                    />
                    <AvatarFallback className="text-lg">
                      {initials || 'CN'}
                    </AvatarFallback>
                  </Avatar>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/gif,image/webp"
                    className="hidden"
                    onChange={handleFileChange}
                    disabled={isDisabled}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isDisabled}
                  >
                    Upload
                  </Button>
                </div>

                {/* Name fields */}
                <div className="flex flex-1 flex-col gap-4">
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="first-name">First Name</Label>
                    <Input
                      id="first-name"
                      type="text"
                      placeholder="Jane"
                      autoComplete="given-name"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      disabled={isDisabled}
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <Label htmlFor="last-name">Last Name</Label>
                    <Input
                      id="last-name"
                      type="text"
                      placeholder="Doe"
                      autoComplete="family-name"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      disabled={isDisabled}
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <Button
                  type="submit"
                  disabled={isDisabled}
                  className={
                    buttonState === 'success'
                      ? 'bg-green-600 hover:bg-green-600 text-white'
                      : ''
                  }
                >
                  {buttonState === 'loading' && (
                    <>
                      <Loader2Icon className="size-4 animate-spin" />
                      Saving
                    </>
                  )}
                  {buttonState === 'success' && (
                    <>
                      <CheckIcon className="size-4" />
                      Saved
                    </>
                  )}
                  {buttonState === 'idle' && 'Save & continue'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 3: Thank You
// ---------------------------------------------------------------------------

function ThankYouStep({ onStart }: { onStart: () => void }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6">
      <div className="flex w-full min-w-[400px] max-w-[620px] flex-col gap-4">
        <h1 className="text-[48px] font-semibold leading-[48px] tracking-[-1.5px] text-foreground">
          Thank you!
        </h1>
        <p className="text-lg leading-[27px] text-foreground">
          You can now start using the RoyalHouse Reporting Dashboard and filling in forms. If you have any issues please reach out to the administrator as listed in your invitation email.
        </p>
        <div>
          <Button onClick={onStart}>Start</Button>
        </div>
      </div>
    </div>
  )
}
