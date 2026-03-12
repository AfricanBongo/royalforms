import { type SubmitEvent, useState } from 'react'

import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { ArrowLeftIcon, CheckIcon, Loader2Icon, MailIcon } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '../components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../components/ui/card'
import { Label } from '../components/ui/label'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '../components/ui/input-group'
import { resetPassword } from '../services/auth'
import { mapSupabaseError } from '../lib/supabase-errors'
import { isValidEmail } from '../lib/validation'

export const Route = createFileRoute('/forgot-password')({
  beforeLoad: ({ context }) => {
    if (context.setup.isSetupComplete === false) {
      throw redirect({ to: '/setup' })
    }
    if (context.auth.session) {
      throw redirect({ to: '/' })
    }
  },
  component: ForgotPasswordPage,
})

type ButtonState = 'idle' | 'loading' | 'success'

function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [buttonState, setButtonState] = useState<ButtonState>('idle')

  const isDisabled = buttonState === 'loading' || buttonState === 'success'

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()

    if (!email.trim()) {
      toast.error('Missing email address', {
        description: 'Please enter the email address associated with your account.',
      })
      return
    }

    if (!isValidEmail(email)) {
      toast.error('Invalid email', {
        description: 'Please enter a valid email address.',
      })
      return
    }

    setButtonState('loading')

    try {
      await resetPassword(email.trim(), `${window.location.origin}/reset-password`)
    } catch (err: unknown) {
      setButtonState('idle')
      const error = err as { code?: string; message: string }
      const mapped = mapSupabaseError(error.code, error.message, 'auth', 'forgot_password')
      toast.error(mapped.title, { description: mapped.description })
      return
    }

    setButtonState('success')
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-background px-6">
      <h1 className="text-center text-[30px] font-semibold leading-[30px] tracking-[-1px] text-foreground">
        RoyalForms
      </h1>

      <Card className="w-full min-w-[280px] max-w-[400px]">
        <CardHeader>
          <CardTitle className="text-base">Reset your password</CardTitle>
          <CardDescription>
            {buttonState === 'success'
              ? 'Check your inbox for a password reset link. It may take a minute to arrive.'
              : 'Enter your email address and we\'ll send you a link to reset your password'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {buttonState === 'success' ? (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                <CheckIcon className="size-4 shrink-0" />
                <span>
                  If an account exists for <strong>{email}</strong>, you will receive a password reset email shortly.
                </span>
              </div>
              <Link to="/login">
                <Button variant="outline" className="w-full">
                  <ArrowLeftIcon className="size-4" />
                  Back to sign in
                </Button>
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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

              <Button type="submit" disabled={isDisabled}>
                {buttonState === 'loading' && (
                  <>
                    <Loader2Icon className="size-4 animate-spin" />
                    Sending reset link
                  </>
                )}
                {buttonState === 'idle' && 'Send reset link'}
              </Button>

              <Link to="/login" className="text-center text-sm text-muted-foreground hover:text-foreground">
                Back to sign in
              </Link>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
