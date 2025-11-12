import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * Funcție helper pentru combinarea claselor Tailwind
 * Folosită de toate componentele shadcn/ui
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Formatare dată în format românesc
 */
export function formatDate(date: Date | string, format: string = "dd.MM.yyyy"): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  
  return format
    .replace('dd', day)
    .replace('MM', month)
    .replace('yyyy', String(year));
}

/**
 * Formatare valută (RON sau EUR)
 */
export function formatCurrency(amount: number, currency: 'RON' | 'EUR' = 'RON'): string {
  return new Intl.NumberFormat('ro-RO', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Formatare număr în format românesc (fără simbol valută)
 * - Separator mii: . (punct)
 * - Separator zecimale: , (virgulă)
 * - Exemplu: 6.366,34 sau 2.363.034 (pentru decimals=0)
 */
export function formatNumberRO(value: number | string, decimals: number = 2): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;

  if (!Number.isFinite(num)) return decimals > 0 ? '0,00' : '0';

  return new Intl.NumberFormat('ro-RO', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);
}

/**
 * Validare număr fișă CAR
 */
export function isValidFisaNumber(fisa: number): boolean {
  return Number.isInteger(fisa) && fisa > 0 && fisa < 100000;
}
