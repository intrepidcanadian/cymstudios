// Catalog Types
export interface BrandProduct {
  product_id: number;
  brand_name: string;
  country_name: string | null;
  currency: string | null;
  product_image: string | null;
  value_restrictions: any;
  denominations: any;
  product_description: string | null;
  terms_and_conditions: string | null;
  how_to_use: string | null;
  expiry_and_validity: string | null;
}

// Payment Types
export interface PaymentRequirement {
  maxAmountRequired: string;
  network: string;
  asset: string;
  payTo: string;
  extra: {
    name: string;
    version: string;
  };
}

// Order Types
export interface Order {
  order_id: string;
  product_id: number;
  brand_name: string;
  country_name: string;
  currency: string;
  price: number;
  status: string;
  user_email: string;
  voucher_code?: string;
  voucher_pin?: string;
  voucher_validity_date?: string;
  vouchers?: Array<{
    code: string;
    pin: string;
    validityDate: string;
    voucherCurrency: string;
    faceValue: number;
  }>;
  face_value?: number;
  cost?: number;
  commission?: number;
  voucher_discount_percent?: number;
  voucher_currency?: string;
  base_currency?: string;
  product_name?: string;
  product_image?: string;
  how_to_use?: string;
  terms_and_conditions?: string;
  created_at: string;
  completed_at?: string;
  error_message?: string;
}
