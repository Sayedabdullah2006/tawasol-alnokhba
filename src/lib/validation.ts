// Input validation utilities for API endpoints
// Prevents spam, malicious data, and ensures data quality

export interface ValidationError {
  field: string
  message: string
}

export class ValidationException extends Error {
  public errors: ValidationError[]

  constructor(errors: ValidationError[]) {
    super('Validation failed')
    this.errors = errors
    this.name = 'ValidationException'
  }
}

// Text validation
export function validateText(
  text: string | undefined | null,
  fieldName: string,
  options: {
    required?: boolean
    minLength?: number
    maxLength?: number
    allowEmpty?: boolean
  } = {}
): string | null {
  const {
    required = false,
    minLength = 0,
    maxLength = 1000,
    allowEmpty = false
  } = options

  if (!text || typeof text !== 'string') {
    if (required) {
      throw new ValidationException([{
        field: fieldName,
        message: `${fieldName} مطلوب`
      }])
    }
    return null
  }

  const trimmed = text.trim()

  if (!allowEmpty && trimmed.length === 0) {
    if (required) {
      throw new ValidationException([{
        field: fieldName,
        message: `${fieldName} لا يمكن أن يكون فارغاً`
      }])
    }
    return null
  }

  if (trimmed.length < minLength) {
    throw new ValidationException([{
      field: fieldName,
      message: `${fieldName} يجب أن يحتوي على ${minLength} أحرف على الأقل`
    }])
  }

  if (trimmed.length > maxLength) {
    throw new ValidationException([{
      field: fieldName,
      message: `${fieldName} يجب أن لا يتجاوز ${maxLength} حرف`
    }])
  }

  // Check for suspicious patterns
  if (containsSuspiciousContent(trimmed)) {
    throw new ValidationException([{
      field: fieldName,
      message: `${fieldName} يحتوي على محتوى غير مقبول`
    }])
  }

  return trimmed
}

// Number validation
export function validateNumber(
  value: any,
  fieldName: string,
  options: {
    required?: boolean
    min?: number
    max?: number
    integer?: boolean
  } = {}
): number | null {
  const {
    required = false,
    min = 0,
    max = Number.MAX_SAFE_INTEGER,
    integer = false
  } = options

  if (value === undefined || value === null || value === '') {
    if (required) {
      throw new ValidationException([{
        field: fieldName,
        message: `${fieldName} مطلوب`
      }])
    }
    return null
  }

  const num = Number(value)

  if (isNaN(num) || !isFinite(num)) {
    throw new ValidationException([{
      field: fieldName,
      message: `${fieldName} يجب أن يكون رقم صالح`
    }])
  }

  if (integer && !Number.isInteger(num)) {
    throw new ValidationException([{
      field: fieldName,
      message: `${fieldName} يجب أن يكون رقم صحيح`
    }])
  }

  if (num < min) {
    throw new ValidationException([{
      field: fieldName,
      message: `${fieldName} يجب أن يكون ${min} أو أكثر`
    }])
  }

  if (num > max) {
    throw new ValidationException([{
      field: fieldName,
      message: `${fieldName} يجب أن يكون ${max} أو أقل`
    }])
  }

  return num
}

// Email validation
export function validateEmail(email: string | undefined | null, fieldName: string = 'البريد الإلكتروني'): string | null {
  if (!email) return null

  const trimmed = email.trim().toLowerCase()
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

  if (!emailRegex.test(trimmed)) {
    throw new ValidationException([{
      field: fieldName,
      message: `${fieldName} غير صالح`
    }])
  }

  if (trimmed.length > 254) {
    throw new ValidationException([{
      field: fieldName,
      message: `${fieldName} طويل جداً`
    }])
  }

  return trimmed
}

// Request validation helpers
export function validateRequestId(requestId: any): string {
  if (!requestId || typeof requestId !== 'string') {
    throw new ValidationException([{
      field: 'requestId',
      message: 'معرف الطلب غير صالح'
    }])
  }
  return requestId
}

export function validateRejectionReason(reason: any): string {
  return validateText(reason, 'سبب الرفض', {
    required: true,
    minLength: 10,
    maxLength: 1000
  })!
}

export function validateNegotiationReason(reason: any): string {
  return validateText(reason, 'سبب التفاوض', {
    required: true,
    minLength: 10,
    maxLength: 1000
  })!
}

export function validateProposedPrice(price: any, originalPrice?: number): number | null {
  const validated = validateNumber(price, 'السعر المقترح', {
    required: false,
    min: 0,
    max: 1000000
  })

  if (validated === null) return validated

  // Proposed price should be less than original (otherwise why negotiate?)
  if (originalPrice && validated >= originalPrice) {
    throw new ValidationException([{
      field: 'السعر المقترح',
      message: 'السعر المقترح يجب أن يكون أقل من السعر الأصلي'
    }])
  }

  return validated
}

export function validateDiscountPercentage(percentage: any): number {
  return validateNumber(percentage, 'نسبة الخصم', {
    required: true,
    min: 1,
    max: 100,
    integer: true
  })!
}

export function validatePrice(price: any): number {
  return validateNumber(price, 'السعر', {
    required: true,
    min: 0,
    max: 1000000
  })!
}

export function validateAdminNotes(notes: any): string | null {
  return validateText(notes, 'ملاحظات الإدارة', {
    required: false,
    maxLength: 2000
  })
}

export function validateUserFeedback(feedback: any): string {
  return validateText(feedback, 'ملاحظات العميل', {
    required: true,
    minLength: 5,
    maxLength: 2000
  })!
}

export function validateContent(content: any): string {
  return validateText(content, 'المحتوى المقترح', {
    required: true,
    minLength: 10,
    maxLength: 5000
  })!
}

// Check for suspicious content patterns
function containsSuspiciousContent(text: string): boolean {
  const suspiciousPatterns = [
    // URLs (except whitelisted domains)
    /https?:\/\/(?!(?:instagram\.com|tiktok\.com|linkedin\.com|x\.com|twitter\.com))/i,
    // Excessive special characters
    /[^\w\s\u0600-\u06FF.,!?:()\-"'%#@]{5,}/,
    // Repeated characters (spam detection)
    /(.)\1{10,}/,
    // HTML/Script tags
    /<\s*\/?(?:script|iframe|object|embed|link|meta|style)/i,
    // Email addresses (shouldn't be in feedback/reasons)
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/,
    // Phone numbers (shouldn't be in feedback/reasons)
    /(?:\+966|05)\d{8,9}/
  ]

  return suspiciousPatterns.some(pattern => pattern.test(text))
}

// Helper to format validation errors for API responses
export function formatValidationErrors(errors: ValidationError[]): string {
  if (errors.length === 1) {
    return errors[0].message
  }
  return errors.map(e => e.message).join('، ')
}

// Wrap API handlers with validation error handling
export function withValidation<T extends any[], R>(
  handler: (...args: T) => Promise<R>
) {
  return async (...args: T): Promise<R> => {
    try {
      return await handler(...args)
    } catch (error) {
      if (error instanceof ValidationException) {
        throw error
      }
      throw error
    }
  }
}