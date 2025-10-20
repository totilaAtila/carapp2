// src/logic/finance.ts
import Decimal from "decimal.js";

/**
 * Calculează dobânda lunară simplă.
 * @param principal Suma de bază (ex: 1000)
 * @param rate Rata lunară (ex: 0.004 pentru 0.4%)
 * @returns Dobânda rotunjită la 2 zecimale
 */
export function calcDobanda(principal: number, rate: number): number {
  const dobanda = new Decimal(principal).times(rate);
  return dobanda.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
}

/**
 * Calculează noul sold după adăugarea dobânzii.
 */
export function calcSoldNou(principal: number, rate: number): number {
  const total = new Decimal(principal).plus(calcDobanda(principal, rate));
  return total.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
}

/**
 * Conversie valutară (RON <-> EUR)
 * @param suma Valoarea de convertit
 * @param curs Cursul de schimb (ex: 4.95)
 * @param directie 'RON_EUR' sau 'EUR_RON'
 */
export function convertValuta(
  suma: number,
  curs: number,
  directie: "RON_EUR" | "EUR_RON"
): number {
  const dec = new Decimal(suma);
  const rezultat =
    directie === "RON_EUR"
      ? dec.div(curs)
      : dec.times(curs);
  return rezultat.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
}
