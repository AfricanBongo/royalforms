import { type SubmitEvent, useState } from 'react'

import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { CheckIcon, Loader2Icon, LockIcon } from 'lucide-react'
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
import { updatePassword } from '../services/auth'
import { mapSupabaseError } from '../lib/supabase-errors'

export const Route = createFileRoute('/reset-password')({
  component: ResetPasswordPage,
})

type ButtonState = 'idle' | 'loading' | 'success'

function ResetPasswordPage() {
  const navigate = useNavigate()

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [buttonState, setButtonState] = useState<ButtonState>('idle')

  const isDisabled = buttonState === 'loading' || buttonState === 'success'

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()

    if (!password.trim()) {
      toast.error('Missing password', {
        description: 'Please enter a new password.',
      })
      return
    }

    if (password.length < 6) {
      toast.error('Password too short', {
        description: 'Your password must be at least 6 characters long.',
      })
      return
    }

    if (password !== confirmPassword) {
      toast.error('Passwords do not match', {
        description: 'The password and confirmation password you entered are different. Please make sure they match.',
      })
      return
    }

    setButtonState('loading')

    try {
      await updatePassword(password)
    } catch (err: unknown) {
      setButtonState('idle')
      const error = err as { code?: string; message: string }
      const mapped = mapSupabaseError(error.code, error.message, 'auth', 'reset_password')
      toast.error(mapped.title, { description: mapped.description })
      return
    }

    setButtonState('success')

    setTimeout(() => {
      void navigate({ to: '/login' })
    }, 1500)
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-background px-6">
      <h1 className="text-center text-[30px] font-semibold leading-[30px] tracking-[-1px] text-foreground">
        RoyalHouse Reporting Dashboard
      </h1>

      <Card className="w-full min-w-[280px] max-w-[400px]">
        <CardHeader>
          <CardTitle className="text-base">Set a new password</CardTitle>
          <CardDescription>
            {buttonState === 'success'
              ? 'Your password has been updated. Redirecting you to sign in...'
              : 'Enter your new password below. It must be at least 6 characters long.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {buttonState === 'success' ? (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                <CheckIcon className="size-4 shrink-0" />
                <span>Your password has been updated successfully.</span>
              </div>
              <Link to="/login">
                <Button variant="outline" className="w-full">
                  Go to sign in
                </Button>
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <Label htmlFor="password">New password</Label>
                <InputGroup>
                  <InputGroupAddon>
                    <LockIcon />
                  </InputGroupAddon>
                  <InputGroupInput
                    id="password"
                    type="password"
                    placeholder="Enter new password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isDisabled}
                  />
                </InputGroup>
              </div>

              <div className="flex flex-col gap-1">
                <Label htmlFor="confirm-password">Confirm password</Label>
                <InputGroup>
                  <InputGroupAddon>
                    <LockIcon />
                  </InputGroupAddon>
                  <InputGroupInput
                    id="confirm-password"
                    type="password"
                    placeholder="Confirm new password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={isDisabled}
                  />
                </InputGroup>
              </div>

              <Button type="submit" disabled={isDisabled}>
                {buttonState === 'loading' && (
                  <>
                    <Loader2Icon className="size-4 animate-spin" />
                    Updating password
                  </>
                )}
                {buttonState === 'idle' && 'Update password'}
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
