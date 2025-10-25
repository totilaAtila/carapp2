import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
/**
 * Funcție helper pentru combinarea claselor Tailwind
 * Folosită de toate componentele shadcn/ui
 */
export function cn(...inputs) {
    return twMerge(clsx(inputs));
}
/**
 * Formatare dată în format românesc
 */
export function formatDate(date, format = "dd.MM.yyyy") {
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
export function formatCurrency(amount, currency = 'RON') {
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
export function isValidFisaNumber(fisa) {
    return Number.isInteger(fisa) && fisa > 0 && fisa < 100000;
}
