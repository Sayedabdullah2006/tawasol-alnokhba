/**
 * TypeScript types for Moyasar Payment Gateway
 */

export enum PaymentStatus {
  INITIATED = 'initiated',
  PAID = 'paid',
  FAILED = 'failed',
  AUTHORIZED = 'authorized',
  CAPTURED = 'captured',
  REFUNDED = 'refunded',
  PARTIALLY_REFUNDED = 'partially_refunded'
}

export type PaymentMetadataValue = string | number | boolean | null | undefined;
export type PaymentMetadata = Record<string, PaymentMetadataValue>;

export interface MoyasarSource {
  type: 'creditcard' | 'applepay' | 'stcpay' | 'applypay';
  name?: string;
  number?: string;
  cvc?: string;
  month?: number;
  year?: number;
  company?: string;
  reference_number?: string;
  authorization_code?: string;
}

export interface MoyasarPayment {
  id: string;
  status: PaymentStatus;
  amount: number; // in halalas
  fee: number;
  currency: string;
  refunded: number;
  refunded_at?: string;
  captured?: boolean;
  captured_at?: string;
  voided_at?: string;
  description: string;
  amount_format: string;
  fee_format: string;
  refunded_format: string;
  invoice_id?: string;
  ip?: string;
  callback_url: string;
  created_at: string;
  updated_at: string;
  metadata?: PaymentMetadata;
  source: MoyasarSource;
}

export interface MoyasarConfig {
  element: string | HTMLElement;
  amount: number; // in halalas
  currency: 'SAR';
  description: string;
  publishable_api_key: string;
  callback_url: string;
  methods: ('creditcard' | 'applepay')[];
  apple_pay?: {
    label: string;
    validate_merchant_url?: string;
  };
  metadata?: PaymentMetadata;
  on_completed?: (payment: MoyasarPayment) => void;
  on_failed?: (error: MoyasarPaymentFailure) => void;
}

export interface MoyasarPaymentFailure {
  id?: string;
  message?: string;
  type?: string;
  code?: string;
  [key: string]: unknown;
}

export interface MoyasarError {
  type: string;
  code: string;
  message: string;
  source?: string;
}

export interface MoyasarApiResponse<T = unknown> {
  data?: T;
  error?: MoyasarError;
  message?: string;
}

// Window type extension for Moyasar global
declare global {
  interface Window {
    Moyasar?: {
      init(config: MoyasarConfig): void;
    };
  }
}

export {};
