/**
 * Consolidated Supabase error mapping for Auth, Storage, and PostgREST.
 *
 * Maps official error codes to user-friendly titles and descriptions.
 * Sources:
 *   Auth:     https://supabase.com/docs/guides/auth/debugging/error-codes#auth-error-codes-table
 *   Storage:  https://supabase.com/docs/guides/storage/debugging/error-codes#storage-error-codes
 *   PostgREST: https://supabase.com/docs/guides/api/rest/postgrest-error-codes
 *
 * Every error the user can encounter should be as specific as possible so
 * they understand exactly what happened -- never generic "Something went wrong".
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface SupabaseErrorInfo {
  title: string
  description: string
}

/**
 * Which Supabase service the error came from.
 */
export type ErrorService = 'auth' | 'storage' | 'database'

/**
 * What the user was doing when the error occurred.
 * Used only for the fallback message.
 */
export type ErrorContext =
  | 'sign_in'
  | 'forgot_password'
  | 'reset_password'
  | 'invite_accept'
  | 'sign_out'
  | 'update_profile'
  | 'upload_file'
  | 'download_file'
  | 'delete_file'
  | 'create_record'
  | 'read_record'
  | 'update_record'
  | 'delete_record'
  | 'general'

// ---------------------------------------------------------------------------
// Auth error codes
// ---------------------------------------------------------------------------

const AUTH_ERRORS: Record<string, SupabaseErrorInfo> = {
  // Credentials / login
  invalid_credentials: {
    title: 'Incorrect email or password',
    description:
      'The email and password combination you entered does not match any account. Please double-check your credentials and try again.',
  },

  // Email
  email_not_confirmed: {
    title: 'Email not verified',
    description:
      'Your email address has not been verified yet. Please check your inbox for the verification email and click the link to confirm your account.',
  },
  email_exists: {
    title: 'Email already registered',
    description:
      'An account with this email address already exists. If this is your email, try signing in instead or resetting your password.',
  },
  email_address_invalid: {
    title: 'Invalid email address',
    description:
      'The email address you entered is not valid or uses an unsupported domain. Please use a different email address.',
  },
  email_address_not_authorized: {
    title: 'Email not authorized',
    description:
      'Emails cannot be sent to this address with the current configuration. Please contact your administrator.',
  },
  email_provider_disabled: {
    title: 'Email sign-in disabled',
    description:
      'Sign-in with email and password is currently disabled on this platform. Please contact your administrator.',
  },
  email_conflict_identity_not_deletable: {
    title: 'Email conflict',
    description:
      'This operation would cause an email conflict with another account. Please contact your administrator for assistance.',
  },

  // User state
  user_not_found: {
    title: 'Account not found',
    description:
      'No account exists with this email address. This is an invite-only platform -- please contact your administrator to request access.',
  },
  user_already_exists: {
    title: 'Account already exists',
    description:
      'An account with this information already exists. If this is your account, try signing in or resetting your password.',
  },
  user_banned: {
    title: 'Account suspended',
    description:
      'Your account has been suspended. Please contact your administrator for more information.',
  },

  // Signup
  signup_disabled: {
    title: 'Registration is disabled',
    description:
      'This platform does not allow self-registration. Please contact your administrator to receive an invite.',
  },

  // Password
  same_password: {
    title: 'Password unchanged',
    description:
      'Your new password cannot be the same as your current password. Please choose a different password.',
  },
  weak_password: {
    title: 'Password too weak',
    description:
      'Your password does not meet the minimum security requirements. It must be at least 6 characters long and include a mix of characters.',
  },
  reauthentication_needed: {
    title: 'Re-authentication required',
    description:
      'You need to verify your identity before changing your password. Please re-enter your current credentials.',
  },
  reauthentication_not_valid: {
    title: 'Verification code incorrect',
    description:
      'The verification code you entered is incorrect. Please request a new code and try again.',
  },

  // Session / token
  session_expired: {
    title: 'Session expired',
    description:
      'Your session has expired due to inactivity. Please sign in again to continue.',
  },
  session_not_found: {
    title: 'Session not found',
    description:
      'Your session is no longer valid. This may happen after signing out from another device. Please sign in again.',
  },
  refresh_token_not_found: {
    title: 'Session expired',
    description:
      'Your session could not be refreshed. Please sign in again.',
  },
  refresh_token_already_used: {
    title: 'Session invalidated',
    description:
      'Your session was invalidated because it was used from multiple places. Please sign in again.',
  },
  bad_jwt: {
    title: 'Invalid session token',
    description:
      'Your session token is invalid or corrupted. Please sign in again.',
  },

  // Rate limiting
  over_request_rate_limit: {
    title: 'Too many requests',
    description:
      'You have made too many requests in a short period. Please wait a few minutes before trying again.',
  },
  over_email_send_rate_limit: {
    title: 'Too many emails sent',
    description:
      'Too many emails have been sent to this address. Please wait a while before requesting another email.',
  },
  over_sms_send_rate_limit: {
    title: 'Too many SMS sent',
    description:
      'Too many SMS messages have been sent to this number. Please wait a while before trying again.',
  },

  // Invite
  invite_not_found: {
    title: 'Invite expired or already used',
    description:
      'This invite link has expired or has already been used. Please contact your administrator to request a new invite.',
  },

  // PKCE / OAuth
  flow_state_expired: {
    title: 'Sign-in link expired',
    description:
      'This sign-in link has expired. Please request a new one and try again.',
  },
  flow_state_not_found: {
    title: 'Sign-in link invalid',
    description:
      'This sign-in link is no longer valid. Please request a new one and try again.',
  },
  bad_code_verifier: {
    title: 'Authentication error',
    description:
      'An internal authentication error occurred. Please try signing in again from the beginning.',
  },
  bad_oauth_callback: {
    title: 'Authentication callback error',
    description:
      'The authentication provider returned an incomplete response. Please try signing in again.',
  },
  bad_oauth_state: {
    title: 'Authentication state error',
    description:
      'The authentication state was corrupted. Please try signing in again from the beginning.',
  },

  // CAPTCHA
  captcha_failed: {
    title: 'CAPTCHA verification failed',
    description:
      'The CAPTCHA challenge could not be verified. Please try again.',
  },

  // Validation
  validation_failed: {
    title: 'Invalid input',
    description:
      'The information you provided is not in the expected format. Please check your input and try again.',
  },
  bad_json: {
    title: 'Invalid request',
    description:
      'The request could not be processed due to a formatting error. Please try again.',
  },

  // OTP
  otp_expired: {
    title: 'Verification code expired',
    description:
      'Your verification code has expired. Please request a new one and try again.',
  },
  otp_disabled: {
    title: 'Magic links disabled',
    description:
      'Sign-in with magic links is not enabled on this platform. Please use your email and password instead.',
  },

  // Conflict
  conflict: {
    title: 'Request conflict',
    description:
      'Your request conflicted with another operation. This can happen with simultaneous requests. Please wait a moment and try again.',
  },

  // Server
  unexpected_failure: {
    title: 'Server error',
    description:
      'The authentication service encountered an unexpected error. Please try again later or contact your administrator if the problem persists.',
  },
  request_timeout: {
    title: 'Request timed out',
    description:
      'The server took too long to respond. Please check your internet connection and try again.',
  },

  // Authorization
  no_authorization: {
    title: 'Not authenticated',
    description:
      'This action requires you to be signed in. Please sign in and try again.',
  },
  not_admin: {
    title: 'Insufficient permissions',
    description:
      'You do not have administrator permissions to perform this action.',
  },
  insufficient_aal: {
    title: 'Additional verification required',
    description:
      'This action requires a higher level of authentication. Please complete the additional verification step.',
  },

  // Identity
  identity_already_exists: {
    title: 'Identity already linked',
    description:
      'This identity is already linked to a user account.',
  },
  identity_not_found: {
    title: 'Identity not found',
    description:
      'The identity you are trying to access no longer exists.',
  },
  single_identity_not_deletable: {
    title: 'Cannot remove last identity',
    description:
      'Every account must have at least one identity. You cannot remove your only sign-in method.',
  },
  manual_linking_disabled: {
    title: 'Identity linking disabled',
    description:
      'Linking identities is not enabled on this platform.',
  },

  // Provider
  provider_disabled: {
    title: 'Sign-in method disabled',
    description:
      'This sign-in method is currently disabled. Please use a different method or contact your administrator.',
  },
  provider_email_needs_verification: {
    title: 'Email verification required',
    description:
      'Your sign-in provider did not verify your email address. A verification email has been sent -- please check your inbox.',
  },

  // Phone (minimal -- we don't use phone auth, but covering for completeness)
  phone_exists: {
    title: 'Phone number already registered',
    description: 'An account with this phone number already exists.',
  },
  phone_not_confirmed: {
    title: 'Phone not verified',
    description: 'Your phone number has not been verified yet.',
  },
  phone_provider_disabled: {
    title: 'Phone sign-in disabled',
    description: 'Phone-based sign-in is not enabled on this platform.',
  },

  // Anonymous
  anonymous_provider_disabled: {
    title: 'Anonymous sign-in disabled',
    description: 'Anonymous sign-in is not enabled on this platform.',
  },

  // SSO / SAML (minimal)
  sso_provider_not_found: {
    title: 'SSO provider not found',
    description: 'The single sign-on provider could not be found. Please check with your administrator.',
  },
  saml_provider_disabled: {
    title: 'SAML sign-in disabled',
    description: 'SAML-based sign-in is not enabled on this platform.',
  },

  // MFA (minimal)
  mfa_verification_failed: {
    title: 'Verification failed',
    description: 'The multi-factor authentication code you entered is incorrect. Please try again.',
  },
  mfa_challenge_expired: {
    title: 'MFA challenge expired',
    description: 'The verification challenge has expired. Please request a new code.',
  },
  mfa_factor_not_found: {
    title: 'MFA factor not found',
    description: 'The multi-factor authentication method no longer exists.',
  },
  too_many_enrolled_mfa_factors: {
    title: 'Too many MFA factors',
    description: 'You have reached the maximum number of multi-factor authentication methods.',
  },
}

// ---------------------------------------------------------------------------
// Storage error codes
// ---------------------------------------------------------------------------

const STORAGE_ERRORS: Record<string, SupabaseErrorInfo> = {
  NoSuchBucket: {
    title: 'Storage bucket not found',
    description:
      'The specified storage bucket does not exist or you do not have permission to access it.',
  },
  NoSuchKey: {
    title: 'File not found',
    description:
      'The specified file does not exist or you do not have permission to access it.',
  },
  NoSuchUpload: {
    title: 'Upload not found',
    description:
      'The upload session does not exist or was previously cancelled.',
  },
  InvalidJWT: {
    title: 'Authentication expired',
    description:
      'Your session has expired or is invalid. Please sign in again.',
  },
  InvalidRequest: {
    title: 'Invalid request',
    description:
      'The request is not properly formed. Please check the file and try again.',
  },
  TenantNotFound: {
    title: 'Service unavailable',
    description:
      'The storage service encountered a configuration error. Please contact your administrator.',
  },
  EntityTooLarge: {
    title: 'File too large',
    description:
      'The file you are trying to upload exceeds the maximum allowed size. Please reduce the file size and try again.',
  },
  InternalError: {
    title: 'Storage server error',
    description:
      'The storage service encountered an internal error. Please try again later.',
  },
  ResourceAlreadyExists: {
    title: 'File already exists',
    description:
      'A file with this name already exists. Please rename the file or overwrite the existing one.',
  },
  InvalidBucketName: {
    title: 'Invalid bucket name',
    description:
      'The bucket name contains invalid characters or does not follow naming conventions.',
  },
  InvalidKey: {
    title: 'Invalid file path',
    description:
      'The file path contains invalid characters or does not follow naming conventions.',
  },
  InvalidRange: {
    title: 'Invalid file range',
    description:
      'The requested byte range is outside the file boundaries.',
  },
  InvalidMimeType: {
    title: 'Invalid file type',
    description:
      'The file type is not supported. Please use a supported file format.',
  },
  InvalidUploadId: {
    title: 'Invalid upload session',
    description:
      'The upload session is invalid or has expired. Please start a new upload.',
  },
  KeyAlreadyExists: {
    title: 'File already exists',
    description:
      'A file with this name already exists at the specified path.',
  },
  BucketAlreadyExists: {
    title: 'Bucket already exists',
    description:
      'A storage bucket with this name already exists.',
  },
  DatabaseTimeout: {
    title: 'Storage timeout',
    description:
      'The storage service timed out. Please try again.',
  },
  InvalidSignature: {
    title: 'Invalid signature',
    description:
      'The request signature is invalid. Please try the operation again.',
  },
  SignatureDoesNotMatch: {
    title: 'Signature mismatch',
    description:
      'The request signature does not match. Please check your credentials.',
  },
  AccessDenied: {
    title: 'Access denied',
    description:
      'You do not have permission to access this resource. Please contact your administrator.',
  },
  ResourceLocked: {
    title: 'Resource locked',
    description:
      'This resource is currently locked by another operation. Please wait and try again.',
  },
  DatabaseError: {
    title: 'Storage database error',
    description:
      'The storage service encountered a database error. Please try again later.',
  },
  MissingContentLength: {
    title: 'Missing file size',
    description:
      'The file size was not included in the upload request. Please try again.',
  },
  MissingParameter: {
    title: 'Missing required information',
    description:
      'A required parameter is missing from the request.',
  },
  InvalidUploadSignature: {
    title: 'Upload signature invalid',
    description:
      'The upload was altered during the process. Please start a new upload.',
  },
  LockTimeout: {
    title: 'Lock timeout',
    description:
      'Could not acquire a lock on the resource. Please wait and try again.',
  },
  S3Error: {
    title: 'Storage backend error',
    description:
      'The storage backend encountered an error. Please try again later.',
  },
  S3InvalidAccessKeyId: {
    title: 'Invalid storage credentials',
    description:
      'The storage access credentials are invalid. Please contact your administrator.',
  },
  S3MaximumCredentialsLimit: {
    title: 'Credentials limit reached',
    description:
      'The maximum number of storage credentials has been reached.',
  },
  InvalidChecksum: {
    title: 'File integrity error',
    description:
      'The uploaded file checksum does not match. The file may have been corrupted during upload. Please try again.',
  },
  MissingPart: {
    title: 'Incomplete upload',
    description:
      'Part of the file is missing. Please try uploading again.',
  },
  SlowDown: {
    title: 'Too many storage requests',
    description:
      'The storage service is being rate-limited. Please wait a moment and try again.',
  },
}

// ---------------------------------------------------------------------------
// PostgREST / Database error codes
//
// PostgREST uses two code formats:
//   - PGRST### for API-level errors
//   - Postgres 5-char codes (e.g. "42501", "23505") for database-level errors
// ---------------------------------------------------------------------------

const DATABASE_ERRORS: Record<string, SupabaseErrorInfo> = {
  // --- Postgres database-level errors ---
  '23503': {
    title: 'Referenced record not found',
    description:
      'This operation references a record that does not exist. Please verify the related data exists before trying again.',
  },
  '23505': {
    title: 'Duplicate record',
    description:
      'A record with this information already exists. Please use different values or update the existing record.',
  },
  '42501': {
    title: 'Permission denied',
    description:
      'You do not have permission to perform this action. Please contact your administrator if you believe this is an error.',
  },
  '42883': {
    title: 'Function not found',
    description:
      'The requested operation could not be found. This may indicate a configuration issue.',
  },
  '42P01': {
    title: 'Table not found',
    description:
      'The requested data source could not be found. This may indicate a configuration issue.',
  },
  '42P17': {
    title: 'Infinite recursion detected',
    description:
      'The operation caused an infinite loop. Please contact your administrator.',
  },
  '25006': {
    title: 'Read-only operation',
    description:
      'This operation is not allowed because the database is in read-only mode.',
  },
  '53400': {
    title: 'Configuration limit exceeded',
    description:
      'A database configuration limit was exceeded. Please contact your administrator.',
  },
  P0001: {
    title: 'Operation failed',
    description:
      'The database rejected this operation. Please check your input and try again.',
  },

  // --- PostgREST API-level errors ---

  // Connection
  PGRST000: {
    title: 'Database connection failed',
    description:
      'Could not connect to the database. The service may be temporarily unavailable. Please try again later.',
  },
  PGRST001: {
    title: 'Database connection error',
    description:
      'An internal error occurred while connecting to the database. Please try again later.',
  },
  PGRST002: {
    title: 'Database schema error',
    description:
      'Could not connect to the database while loading the schema. Please try again later.',
  },
  PGRST003: {
    title: 'Database connection timeout',
    description:
      'The request timed out waiting for a database connection. The service may be under heavy load. Please try again.',
  },

  // Request errors
  PGRST100: {
    title: 'Invalid query parameters',
    description:
      'The query parameters in your request could not be parsed. Please check your filters and try again.',
  },
  PGRST102: {
    title: 'Invalid request body',
    description:
      'The request body is empty or contains malformed data. Please check your input.',
  },
  PGRST103: {
    title: 'Invalid range',
    description:
      'The requested data range is invalid. Please adjust your pagination parameters.',
  },
  PGRST105: {
    title: 'Invalid update request',
    description:
      'The update or upsert request is not properly formed.',
  },
  PGRST116: {
    title: 'Multiple or no results',
    description:
      'Expected a single result but found multiple or none. Please refine your query.',
  },
  PGRST125: {
    title: 'Resource not found',
    description:
      'The requested resource path does not exist.',
  },

  // Schema cache
  PGRST200: {
    title: 'Relationship not found',
    description:
      'The requested relationship between tables could not be found. The database schema may have changed.',
  },
  PGRST202: {
    title: 'Function not found',
    description:
      'The requested database function does not exist or its signature has changed.',
  },
  PGRST204: {
    title: 'Column not found',
    description:
      'The specified column does not exist in the table.',
  },
  PGRST205: {
    title: 'Table not found',
    description:
      'The specified table does not exist or is not exposed to the API.',
  },

  // Auth
  PGRST301: {
    title: 'Invalid authentication token',
    description:
      'Your session token could not be decoded or is invalid. Please sign in again.',
  },
  PGRST302: {
    title: 'Authentication required',
    description:
      'This action requires you to be signed in. Please sign in and try again.',
  },
  PGRST303: {
    title: 'Invalid token claims',
    description:
      'Your session token contains invalid claims. Please sign in again.',
  },
}

// ---------------------------------------------------------------------------
// Context-specific fallback labels
// ---------------------------------------------------------------------------

const CONTEXT_FALLBACK: Record<ErrorContext, { title: string; suffix: string }> = {
  sign_in: {
    title: 'Sign-in failed',
    suffix: 'Please try again or contact your administrator if the problem persists.',
  },
  forgot_password: {
    title: 'Password reset failed',
    suffix: 'Please try again or contact your administrator if the problem persists.',
  },
  reset_password: {
    title: 'Password update failed',
    suffix: 'Please try again or request a new reset link if the problem persists.',
  },
  invite_accept: {
    title: 'Invite acceptance failed',
    suffix: 'Please try again or contact your administrator for a new invite.',
  },
  sign_out: {
    title: 'Sign-out failed',
    suffix: 'Please try again.',
  },
  update_profile: {
    title: 'Profile update failed',
    suffix: 'Please try again or contact your administrator if the problem persists.',
  },
  upload_file: {
    title: 'File upload failed',
    suffix: 'Please try again.',
  },
  download_file: {
    title: 'File download failed',
    suffix: 'Please try again.',
  },
  delete_file: {
    title: 'File deletion failed',
    suffix: 'Please try again.',
  },
  create_record: {
    title: 'Could not create record',
    suffix: 'Please try again or contact your administrator if the problem persists.',
  },
  read_record: {
    title: 'Could not load data',
    suffix: 'Please try again or contact your administrator if the problem persists.',
  },
  update_record: {
    title: 'Could not update record',
    suffix: 'Please try again or contact your administrator if the problem persists.',
  },
  delete_record: {
    title: 'Could not delete record',
    suffix: 'Please try again or contact your administrator if the problem persists.',
  },
  general: {
    title: 'Operation failed',
    suffix: 'Please try again or contact your administrator if the problem persists.',
  },
}

// ---------------------------------------------------------------------------
// Network error detection (not covered by error codes)
// ---------------------------------------------------------------------------

function isNetworkError(message: string): boolean {
  const lower = message.toLowerCase()
  return (
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('network request failed') ||
    lower.includes('econnrefused') ||
    lower.includes('load failed') ||
    lower.includes('net::err_')
  )
}

const NETWORK_ERROR: SupabaseErrorInfo = {
  title: 'Connection failed',
  description:
    'Unable to reach the server. Please check your internet connection and try again.',
}

// ---------------------------------------------------------------------------
// Service-specific map lookup
// ---------------------------------------------------------------------------

const SERVICE_MAPS: Record<ErrorService, Record<string, SupabaseErrorInfo>> = {
  auth: AUTH_ERRORS,
  storage: STORAGE_ERRORS,
  database: DATABASE_ERRORS,
}

// ---------------------------------------------------------------------------
// Postgres error code range matching
//
// Some Postgres errors are matched by prefix (e.g. "08*" -> connection errors).
// We only match ranges that map to user-actionable HTTP statuses.
// ---------------------------------------------------------------------------

function matchPostgresRange(code: string): SupabaseErrorInfo | null {
  const prefix2 = code.slice(0, 2)

  switch (prefix2) {
    case '08':
      return { title: 'Database connection error', description: 'The database is temporarily unavailable. Please try again later.' }
    case '09':
      return { title: 'Database trigger error', description: 'A database trigger encountered an error. Please contact your administrator.' }
    case '0L':
    case '0P':
    case '28':
      return { title: 'Permission denied', description: 'You do not have permission to perform this action.' }
    case '23':
      return { title: 'Data constraint violation', description: 'The data violates a database constraint. Please check your input and try again.' }
    case '25':
    case '2D':
      return { title: 'Transaction error', description: 'A database transaction error occurred. Please try again.' }
    case '40':
      return { title: 'Transaction conflict', description: 'The operation was rolled back due to a conflict. Please try again.' }
    case '53':
      return { title: 'Database overloaded', description: 'The database does not have enough resources to handle this request. Please try again later.' }
    case '54':
      return { title: 'Query too complex', description: 'The requested operation is too complex. Please simplify your request.' }
    case '57':
      return { title: 'Service interrupted', description: 'The database service was interrupted. Please try again later.' }
    default:
      return null
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Maps a Supabase error to a user-friendly title and description.
 *
 * Uses the official `error.code` when available, falls back to message
 * matching for network errors, and provides a context-aware fallback
 * that includes the raw message for debugging.
 *
 * @param code    - The error code (e.g. `error.code` from AuthApiError, Storage, or PostgREST)
 * @param message - The error message string
 * @param service - Which Supabase service produced the error
 * @param context - What the user was doing when the error occurred
 */
export function mapSupabaseError(
  code: string | undefined,
  message: string,
  service: ErrorService,
  context: ErrorContext,
): SupabaseErrorInfo {
  // 1. Try exact code match in the service-specific map
  if (code) {
    const serviceMap = SERVICE_MAPS[service]
    if (serviceMap[code]) {
      return serviceMap[code]
    }

    // 2. For database errors, try Postgres range matching
    if (service === 'database') {
      const rangeMatch = matchPostgresRange(code)
      if (rangeMatch) return rangeMatch
    }
  }

  // 3. Try network error detection (not covered by error codes)
  if (isNetworkError(message)) {
    return NETWORK_ERROR
  }

  // 4. Context-aware fallback with raw message for debugging
  const fallback = CONTEXT_FALLBACK[context]
  return {
    title: fallback.title,
    description: `An unexpected error occurred: ${message}. ${fallback.suffix}`,
  }
}
