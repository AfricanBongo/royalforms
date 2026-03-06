import {
  type ChangeEvent,
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'

import { createFileRoute, useNavigate } from '@tanstack/react-router'
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
import { supabase } from '../../services/supabase'
import { mapSupabaseError } from '../../lib/supabase-errors'
import type { UserRole } from '../../types/auth'

export const Route = createFileRoute('/invite/accept')({
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

  // Verify the invite token from URL on mount
  useEffect(() => {
    async function verifyInviteToken() {
      const params = new URLSearchParams(window.location.search)
      const tokenHash = params.get('token_hash')
      const type = params.get('type')

      // If no token params, check if user already has a session
      // (e.g. they refreshed the page after verifying)
      if (!tokenHash || type !== 'invite') {
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.user) {
          setUser(session.user)
          // Determine which step to show based on user state
          const meta = session.user.user_metadata
          if (meta.first_name && meta.last_name) {
            setStep('thank-you')
          } else if (meta.onboarding_password_set) {
            setStep('onboarding')
          } else {
            setStep('create-account')
          }
          return
        }
        setError('This invite link is invalid or has expired. Please contact your administrator for a new invite.')
        return
      }

      // Exchange the token for a session
      const { data, error: verifyError } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: 'invite',
      })

      if (verifyError || !data.user) {
        setError(
          verifyError?.message ??
          'Could not verify the invite link. It may have expired. Please contact your administrator for a new invite.'
        )
        return
      }

      setUser(data.user)
      setStep('create-account')

      // Clean the URL of token params
      window.history.replaceState({}, '', window.location.pathname)
    }

    void verifyInviteToken()
  }, [])

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

  async function handleSubmit(e: FormEvent) {
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

    const { error } = await supabase.auth.updateUser({
      password,
      data: { onboarding_password_set: true },
    })

    if (error) {
      setButtonState('idle')
      const mapped = mapSupabaseError(error.code, error.message, 'auth', 'invite_accept')
      toast.error(mapped.title, { description: mapped.description })
      return
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

  // Fetch group name from database
  useEffect(() => {
    if (!groupId) return

    async function fetchGroupName() {
      const { data } = await supabase
        .from('groups')
        .select('name')
        .eq('id', groupId!)
        .single()

      if (data?.name) {
        setGroupName(data.name)
      }
    }

    void fetchGroupName()
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

  async function handleSubmit(e: FormEvent) {
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
      const ext = avatarFile.name.split('.').pop() ?? 'png'
      const filePath = `${user.id}/avatar.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, avatarFile, { upsert: true })

      if (uploadError) {
        setButtonState('idle')
        const mapped = mapSupabaseError(
          uploadError.message,
          uploadError.message,
          'storage',
          'upload_file',
        )
        toast.error(mapped.title, { description: mapped.description })
        return
      }

      const { data: urlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath)

      avatarUrl = urlData.publicUrl
    }

    // Update user metadata with first_name, last_name, avatar_url
    const { data: updateData, error: updateError } = await supabase.auth.updateUser({
      data: {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        full_name: `${firstName.trim()} ${lastName.trim()}`,
        ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
      },
    })

    if (updateError) {
      setButtonState('idle')
      const mapped = mapSupabaseError(
        updateError.code,
        updateError.message,
        'auth',
        'update_profile',
      )
      toast.error(mapped.title, { description: mapped.description })
      return
    }

    // Update the profiles table with first_name, last_name
    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        full_name: `${firstName.trim()} ${lastName.trim()}`,
      })
      .eq('id', user.id)

    if (profileError) {
      // Non-critical: profile sync failed but auth metadata is updated
      console.error('Profile update failed:', profileError)
    }

    setButtonState('success')

    setTimeout(() => {
      onComplete(updateData.user)
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
                    {avatarPreview ? (
                      <AvatarImage src={avatarPreview} alt="Profile picture" />
                    ) : null}
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
