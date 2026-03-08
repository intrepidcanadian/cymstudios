// Fiat Currency Configuration
// Currency symbols mapping for display

export interface FiatCurrency {
  code: string;
  name: string;
  symbol: string;
  minAmount: number;
  maxAmount: number;
}

export const FIAT_CURRENCIES: FiatCurrency[] = [
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥', minAmount: 2181, maxAmount: 436150 },
  { code: 'TWD', name: 'New Taiwan Dollar', symbol: 'NT$', minAmount: 445, maxAmount: 88830 },
  { code: 'CZK', name: 'Czech Koruna', symbol: 'Kč', minAmount: 324, maxAmount: 64770 },
  { code: 'MXN', name: 'Mexican Peso', symbol: '$', minAmount: 286, maxAmount: 57050 },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$', minAmount: 24, maxAmount: 4650 },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$', minAmount: 21, maxAmount: 4110 },
  { code: 'USD', name: 'US Dollar', symbol: '$', minAmount: 15, maxAmount: 3000 },
  { code: 'EUR', name: 'Euro', symbol: '€', minAmount: 14, maxAmount: 2650 },
  { code: 'GBP', name: 'British Pound', symbol: '£', minAmount: 12, maxAmount: 2240 },
];

// Get currency symbol by code
export function getCurrencySymbol(code: string): string {
  const currency = FIAT_CURRENCIES.find(c => c.code === code);
  return currency?.symbol || '$';
}

// Get currency by code
export function getCurrency(code: string): FiatCurrency | undefined {
  return FIAT_CURRENCIES.find(c => c.code === code);
}

// Get min/max amounts for a currency
export function getCurrencyLimits(code: string): { min: number; max: number } {
  const currency = getCurrency(code);
  return {
    min: currency?.minAmount || 15,
    max: currency?.maxAmount || 3000,
  };
}
