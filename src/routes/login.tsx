import { type FormEvent, useState } from 'react'

import { createFileRoute, Link, redirect, useNavigate } from '@tanstack/react-router'
import { CheckIcon, Loader2Icon, LockIcon, MailIcon } from 'lucide-react'
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
import { useAuth } from '../hooks/use-auth'
import { mapSupabaseError } from '../lib/supabase-errors'

export const Route = createFileRoute('/login')({
  beforeLoad: ({ context }) => {
    if (context.auth.session) {
      throw redirect({ to: '/' })
    }
  },
  component: LoginPage,
})

type ButtonState = 'idle' | 'loading' | 'success'

function LoginPage() {
  const { signIn } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [buttonState, setButtonState] = useState<ButtonState>('idle')

  const isDisabled = buttonState === 'loading' || buttonState === 'success'

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()

    if (!email.trim() || !password.trim()) {
      toast.error('Missing credentials', {
        description: 'Please enter both your email address and password.',
      })
      return
    }

    setButtonState('loading')

    const { error } = await signIn(email.trim(), password)

    if (error) {
      setButtonState('idle')
      const mapped = mapSupabaseError(error.code, error.message, 'auth', 'sign_in')
      toast.error(mapped.title, { description: mapped.description })
      return
    }

    // Success
    setButtonState('success')

    // Brief delay so the user sees the success state before navigating
    setTimeout(() => {
      void navigate({ to: '/' })
    }, 800)
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-background px-6">
      <h1 className="text-center text-[30px] font-semibold leading-[30px] tracking-[-1px] text-foreground">
        RoyalHouse Reporting Dashboard
      </h1>

      <Card className="w-full min-w-[280px] max-w-[400px]">
        <CardHeader>
          <CardTitle className="text-base">Sign in to your account</CardTitle>
          <CardDescription>
            Enter your credentials below to sign in to your account
          </CardDescription>
        </CardHeader>
        <CardContent>
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
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
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
                  Signing in
                </>
              )}
              {buttonState === 'success' && (
                <>
                  <CheckIcon className="size-4" />
                  Sign in successful
                </>
              )}
              {buttonState === 'idle' && 'Sign in'}
            </Button>

            <Link to="/forgot-password" className="text-center text-sm text-muted-foreground hover:text-foreground">
              Forgot your password?
            </Link>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
