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
 * Validare număr fișă CAR
 */
export function isValidFisaNumber(fisa: number): boolean {
  return Number.isInteger(fisa) && fisa > 0 && fisa < 100000;
}
