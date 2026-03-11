import {
  type ChangeEvent,
  type SubmitEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'

import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import {
  BuildingIcon,
  CheckIcon,
  Loader2Icon,
  LockIcon,
  MailIcon,
} from 'lucide-react'
import { toast } from 'sonner'

import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar'
import { Button } from '../components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '../components/ui/input-group'
import { useAuth } from '../hooks/use-auth'
import { useSetup } from '../hooks/use-setup'
import { getDefaultAvatarUri } from '../lib/avatar'
import { mapSupabaseError } from '../lib/supabase-errors'
import { isValidEmail } from '../lib/validation'
import { updateUserMetadata } from '../services/auth'
import { uploadAvatar, updateProfile } from '../services/profiles'
import { bootstrapRootAdmin } from '../services/setup'

export const Route = createFileRoute('/setup')({
  beforeLoad: ({ context }) => {
    // If setup is already complete, redirect to login
    if (context.setup.isSetupComplete === true) {
      throw redirect({ to: '/login' })
    }
  },
  component: SetupPage,
})

type Step = 'org-setup' | 'onboarding' | 'thank-you'
type ButtonState = 'idle' | 'loading' | 'success'

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

function SetupPage() {
  const navigate = useNavigate()
  const setup = useSetup()

  const [step, setStep] = useState<Step>('org-setup')
  // Credentials from step 1 for auto sign-in in step 2
  const [credentials, setCredentials] = useState<{
    email: string
    password: string
  } | null>(null)

  if (step === 'org-setup') {
    return (
      <OrgSetupStep
        onComplete={(email, password) => {
          setCredentials({ email, password })
          setStep('onboarding')
        }}
      />
    )
  }

  if (step === 'onboarding' && credentials) {
    return (
      <OnboardingStep
        email={credentials.email}
        password={credentials.password}
        onComplete={() => setStep('thank-you')}
      />
    )
  }

  if (step === 'thank-you') {
    return (
      <ThankYouStep
        onStart={() => {
          setup.refresh()
          void navigate({ to: '/' })
        }}
      />
    )
  }

  return null
}

// ---------------------------------------------------------------------------
// Step 1: Organization & Credentials
// ---------------------------------------------------------------------------

function OrgSetupStep({
  onComplete,
}: {
  onComplete: (email: string, password: string) => void
}) {
  const [orgName, setOrgName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [buttonState, setButtonState] = useState<ButtonState>('idle')

  const isDisabled = buttonState === 'loading' || buttonState === 'success'

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()

    if (!orgName.trim()) {
      toast.error('Missing organization name', {
        description: 'Please enter a name for your organization.',
      })
      return
    }

    if (!email.trim()) {
      toast.error('Missing email', {
        description: 'Please enter your email address.',
      })
      return
    }

    if (!isValidEmail(email)) {
      toast.error('Invalid email', {
        description: 'Please enter a valid email address.',
      })
      return
    }

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
      await bootstrapRootAdmin({
        email: email.trim(),
        password,
        orgName: orgName.trim(),
      })
    } catch (err: unknown) {
      setButtonState('idle')
      const error = err as { code?: string; message: string }
      const mapped = mapSupabaseError(
        error.code,
        error.message,
        'auth',
        'general',
      )
      toast.error(mapped.title, { description: mapped.description })
      return
    }

    setButtonState('success')

    setTimeout(() => {
      onComplete(email.trim(), password)
    }, 800)
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-background px-6">
      <h1 className="text-center text-[30px] font-semibold leading-[30px] tracking-[-1px] text-foreground">
        RoyalHouse Reporting Dashboard
      </h1>

      <Card className="w-full min-w-[280px] max-w-[400px]">
        <CardHeader>
          <CardTitle className="text-base">Set up your organization</CardTitle>
          <p className="text-sm text-muted-foreground">
            Enter your organization name and root admin credentials to get started
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <Label htmlFor="org-name">Organization Name</Label>
              <InputGroup>
                <InputGroupAddon>
                  <BuildingIcon />
                </InputGroupAddon>
                <InputGroupInput
                  id="org-name"
                  type="text"
                  placeholder="My Organization"
                  autoComplete="organization"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  disabled={isDisabled}
                />
              </InputGroup>
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor="email">Email</Label>
              <InputGroup>
                <InputGroupAddon>
                  <MailIcon />
                </InputGroupAddon>
                <InputGroupInput
                  id="email"
                  type="email"
                  placeholder="jane.doe@gmail.com"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isDisabled}
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
                  Setting up
                </>
              )}
              {buttonState === 'success' && (
                <>
                  <CheckIcon className="size-4" />
                  Setup complete
                </>
              )}
              {buttonState === 'idle' && 'Continue'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 2: Onboarding (Profile)
// ---------------------------------------------------------------------------

function OnboardingStep({
  email,
  password,
  onComplete,
}: {
  email: string
  password: string
  onComplete: () => void
}) {
  const { signIn, user } = useAuth()

  const [isSigningIn, setIsSigningIn] = useState(true)
  const [signInFailed, setSignInFailed] = useState(false)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [buttonState, setButtonState] = useState<ButtonState>('idle')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Auto sign-in on mount
  const signInAttempted = useRef(false)
  useEffect(() => {
    if (signInAttempted.current) return
    signInAttempted.current = true

    async function autoSignIn() {
      const { error } = await signIn(email, password)
      if (error) {
        toast.error('Sign-in failed', { description: error.message })
        setSignInFailed(true)
      }
      setIsSigningIn(false)
    }

    void autoSignIn()
  }, [email, password, signIn])

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

  async function handleRetrySignIn() {
    setSignInFailed(false)
    setIsSigningIn(true)
    const { error } = await signIn(email, password)
    if (error) {
      toast.error('Sign-in failed', { description: error.message })
      setSignInFailed(true)
    }
    setIsSigningIn(false)
  }

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()

    if (!user) {
      toast.error('Not signed in', {
        description: 'Please wait for sign-in to complete.',
      })
      return
    }

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

    // Update user metadata
    try {
      await updateUserMetadata({
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

    // Update profiles table
    try {
      await updateProfile(user.id, {
        full_name: `${firstName.trim()} ${lastName.trim()}`,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
      })
    } catch {
      // Non-critical: profile sync failed but auth metadata is updated
      console.error('Profile table update failed')
    }

    setButtonState('success')

    setTimeout(() => {
      onComplete()
    }, 800)
  }

  // Show loading while signing in
  if (isSigningIn) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6">
        <Loader2Icon className="size-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Signing you in...</p>
      </div>
    )
  }

  // Show retry if sign-in failed
  if (signInFailed) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-background px-6">
        <h1 className="text-center text-[30px] font-semibold leading-[30px] tracking-[-1px] text-foreground">
          RoyalHouse Reporting Dashboard
        </h1>
        <Card className="w-full min-w-[280px] max-w-[400px]">
          <CardHeader>
            <CardTitle className="text-base">Sign-in failed</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              We could not sign you in automatically. Please try again.
            </p>
            <Button onClick={() => void handleRetrySignIn()}>
              Retry sign-in
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

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

        {/* Role info */}
        <p className="text-[20px] font-semibold leading-[24px] text-foreground">
          You are setting up as the{' '}
          <span className="text-muted-foreground">Root Admin</span>
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
                      src={
                        avatarPreview ??
                        getDefaultAvatarUri(
                          [firstName, lastName].filter(Boolean).join(' ') ||
                            email ||
                            'user',
                        )
                      }
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
          Your organization is ready. You can now start using the RoyalHouse
          Reporting Dashboard.
        </p>
        <div>
          <Button onClick={onStart}>Get Started</Button>
        </div>
      </div>
    </div>
  )
}
