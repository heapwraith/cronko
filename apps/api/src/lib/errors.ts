export const ErrorCode = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  NOT_FOUND: "NOT_FOUND",
  UNAUTHORIZED: "UNAUTHORIZED",
  RATE_LIMITED: "RATE_LIMITED",
  PAYLOAD_TOO_LARGE: "PAYLOAD_TOO_LARGE",
  CONFLICT: "CONFLICT",
  INTERNAL_ERROR: "INTERNAL_ERROR",
  CSRF_INVALID: "CSRF_INVALID",
} as const

export type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode]

export class AppError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: ErrorCodeType,
    public details?: unknown,
  ) {
    super(message)
    this.name = "AppError"
  }
}

export function errorResponse(
  message: string,
  code: ErrorCodeType,
  _status: number,
  requestId?: string,
) {
  return {
    error: message,
    code,
    ...(requestId ? { requestId } : {}),
  }
}
