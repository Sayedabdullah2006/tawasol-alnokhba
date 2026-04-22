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

export interface MoyasarSource {
  type: 'creditcard' | 'applepay' | 'stcpay' | 'applypay';
  name?: string;
  number?: string;
  cvc?: string;
  month?: number;
  year?: number;
  company?: string;
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
  metadata?: Record<string, any>;
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
  metadata?: Record<string, any>;
  on_completed?: (payment: MoyasarPayment) => void;
  on_failed?: (error: any) => void;
}

export interface MoyasarError {
  type: string;
  code: string;
  message: string;
  source?: string;
}

export interface MoyasarApiResponse<T = any> {
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