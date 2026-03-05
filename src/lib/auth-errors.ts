/**
 * Maps Supabase Auth error messages to user-friendly error titles and descriptions.
 *
 * These should be as specific as possible so the user understands exactly what
 * happened -- never generic "Something went wrong" messages.
 */

interface AuthError {
  title: string
  description: string
}

export function mapSignInError(message: string): AuthError {
  const lower = message.toLowerCase()

  // Invalid email/password combination
  if (lower.includes('invalid login credentials') || lower.includes('invalid_credentials')) {
    return {
      title: 'Incorrect email or password',
      description: 'The email and password combination you entered does not match any account. Please double-check your credentials and try again.',
    }
  }

  // Email not confirmed
  if (lower.includes('email not confirmed') || lower.includes('email_not_confirmed')) {
    return {
      title: 'Email not verified',
      description: 'Your email address has not been verified yet. Please check your inbox for the verification email and click the link to confirm your account.',
    }
  }

  // Too many requests / rate limited
  if (lower.includes('rate limit') || lower.includes('too many requests') || lower.includes('over_request_rate_limit')) {
    return {
      title: 'Too many sign-in attempts',
      description: 'You have made too many sign-in attempts in a short period. Please wait a few minutes before trying again.',
    }
  }

  // User not found (signup disabled, so they can't create an account)
  if (lower.includes('user not found') || lower.includes('user_not_found')) {
    return {
      title: 'Account not found',
      description: 'No account exists with this email address. This is an invite-only platform -- please contact your administrator to request access.',
    }
  }

  // User banned
  if (lower.includes('user_banned') || lower.includes('banned')) {
    return {
      title: 'Account suspended',
      description: 'Your account has been suspended. Please contact your administrator for more information.',
    }
  }

  // Signup disabled (shouldn't normally appear on login, but just in case)
  if (lower.includes('signups not allowed') || lower.includes('signup_disabled')) {
    return {
      title: 'Registration is disabled',
      description: 'This platform does not allow self-registration. Please contact your administrator to receive an invite.',
    }
  }

  // Network / connection errors
  if (lower.includes('fetch') || lower.includes('network') || lower.includes('failed to fetch') || lower.includes('econnrefused')) {
    return {
      title: 'Connection failed',
      description: 'Unable to reach the authentication server. Please check your internet connection and try again.',
    }
  }

  // Validation errors
  if (lower.includes('validation_failed') || lower.includes('provide') && lower.includes('email')) {
    return {
      title: 'Invalid input',
      description: 'Please enter a valid email address and password.',
    }
  }

  // Fallback -- still be as descriptive as possible by including the raw message
  return {
    title: 'Sign-in failed',
    description: `An unexpected error occurred: ${message}. Please try again or contact your administrator if the problem persists.`,
  }
}
