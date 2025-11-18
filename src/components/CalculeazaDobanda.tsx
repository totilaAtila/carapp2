// src/components/CalculeazaDobanda.tsx
/**
 * Modul Calculează Dobânda - Doar citire din MEMBRII și DEPCRED
 *
 * FUNCȚIONALITĂȚI:
 * - Calcul read-only al dobânzii pentru un membru și perioadă selectată
 * - Afișare detalii calcul: perioadă utilizată, suma soldurilor, dobândă rezultată
 * - NU scrie în baza de date - doar calculează și afișează
 *
 * LOGICA:
 * - Identifică perioada START (ultima lună cu împrumut sau sold zero)
 * - Sumează toate soldurile pozitive din perioada START-END
 * - Aplică rata dobânzii: dobândă = SUM(solduri) × rata
 */

import { useState, useEffect, useMemo, useRef } from "react";
import Decimal from "decimal.js";
import type { DBSet } from "../services/databaseManager";
import { getActiveDB } from "../services/databaseManager";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { ScrollArea } from "./ui/scroll-area";
import { Alert, AlertDescription } from "./ui/alert";
import { Calculator, Info, X, Calendar, ChevronDown } from "lucide-react";

// Configurare Decimal.js
Decimal.set({ precision: 50, rounding: Decimal.ROUND_HALF_UP });

const MONTHS = [
  "Ianuarie", "Februarie", "Martie", "Aprilie", "Mai", "Iunie",
  "Iulie", "August", "Septembrie", "Octombrie", "Noiembrie", "Decembrie"
];

const PRAG_ZEROIZARE = new Decimal("0.005"); // Sold < 0.005 → 0.00

interface AutocompleteOption {
  nr_fisa: number;
  nume: string;
  display: string; // "Nume (Fișa: 123)"
}

interface TranzactieLunara {
  luna: number;
  anul: number;
  dobanda: Decimal;
  impr_deb: Decimal;
  impr_cred: Decimal;
  impr_sold: Decimal;
  dep_deb: Decimal;
  dep_cred: Decimal;
  dep_sold: Decimal;
}

interface Props {
  databases: DBSet;
  onBack: () => void;
}

interface CalculResult {
  start_period: string;
  end_period: string;
  suma_solduri: string;
  dobanda: string;
  rata_utilizata: string;
  nr_luni: number;
}

/**
 * Citește lista completă de membri pentru autocomplete
 * Citește din DEPCRED pentru a obține doar membrii cu istoric financiar
 */
function citesteMembri(databases: DBSet): AutocompleteOption[] {
  try {
    // Set membri lichidați
    const lichidati = new Set<number>();
    try {
      const resLich = getActiveDB(databases, 'lichidati').exec("SELECT nr_fisa FROM lichidati");
      if (resLich.length > 0) {
        resLich[0].values.forEach(row => lichidati.add(row[0] as number));
      }
    } catch {
      // LICHIDATI.db opțional
    }

    // Citire membri cu istoric în DEPCRED (nu din ACTIVI!)
    const dbDepcred = getActiveDB(databases, 'depcred');
    const resultFise = dbDepcred.exec(`
      SELECT DISTINCT nr_fisa
      FROM depcred
      ORDER BY nr_fisa
    `);

    if (resultFise.length === 0) return [];

    const nrFiseActivi = resultFise[0].values.map(row => row[0] as number);

    // Preia detaliile membrilor din MEMBRII
    const dbMembrii = getActiveDB(databases, 'membrii');
    const membri: AutocompleteOption[] = [];

    for (const nr_fisa of nrFiseActivi) {
      // Excludem lichidați
      if (lichidati.has(nr_fisa)) continue;

      const membruResult = dbMembrii.exec(`
        SELECT NR_FISA, NUM_PREN
        FROM membrii
        WHERE NR_FISA = ?
      `, [nr_fisa]);

      if (membruResult.length > 0 && membruResult[0].values.length > 0) {
        const row = membruResult[0].values[0];
        const nume = (row[1] as string || "").trim();

        membri.push({
          nr_fisa,
          nume,
          display: `${nume} (Fișa: ${nr_fisa})`
        });
      }
    }

    // Sortare după nume
    membri.sort((a, b) => a.nume.localeCompare(b.nume));

    return membri;
  } catch (error) {
    console.error("Eroare citire membri:", error);
    return [];
  }
}

/**
 * Citește istoricul financiar complet pentru un membru
 */
function citesteIstoricMembru(
  databases: DBSet,
  nr_fisa: number
): TranzactieLunara[] {
  try {
    const result = getActiveDB(databases, 'depcred').exec(`
      SELECT luna, anul, dobanda, impr_deb, impr_cred, impr_sold,
             dep_deb, dep_cred, dep_sold
      FROM depcred
      WHERE nr_fisa = ?
      ORDER BY anul DESC, luna DESC
    `, [nr_fisa]);

    if (result.length === 0) return [];

    return result[0].values.map(row => ({
      luna: row[0] as number,
      anul: row[1] as number,
      dobanda: new Decimal(String(row[2] || "0")),
      impr_deb: new Decimal(String(row[3] || "0")),
      impr_cred: new Decimal(String(row[4] || "0")),
      impr_sold: new Decimal(String(row[5] || "0")),
      dep_deb: new Decimal(String(row[6] || "0")),
      dep_cred: new Decimal(String(row[7] || "0")),
      dep_sold: new Decimal(String(row[8] || "0"))
    }));
  } catch (error) {
    console.error(`Eroare citire istoric ${nr_fisa}:`, error);
    return [];
  }
}

/**
 * Formatare monedă (2 zecimale)
 */
const formatCurrency = (value: Decimal): string => {
  return value.toFixed(2);
};

/**
 * Formatare lună-an
 */
const formatLunaAn = (luna: number, anul: number): string => {
  return `${String(luna).padStart(2, '0')}/${anul}`;
};

/**
 * Formatare vizuală condiționată - EXACT ca în SumeLunare
 */
const getFormattedValue = (
  tranz: TranzactieLunara,
  key: string,
  formatCurrency: (value: Decimal) => string,
  formatLunaAn: (luna: number, anul: number) => string,
  istoric?: TranzactieLunara[],
  index?: number
): { display: React.ReactNode; className: string } => {
  try {
    const prevTranz = istoric && index !== undefined && index < istoric.length - 1 ? istoric[index + 1] : undefined;

    switch (key) {
      case 'dobanda':
        return {
          display: formatCurrency(tranz.dobanda),
          className: 'text-slate-800'
        };

      case 'impr_deb':
        if (tranz.impr_deb.greaterThan(0)) {
          return {
            display: formatCurrency(tranz.impr_deb),
            className: 'text-blue-600 font-bold'
          };
        }
        return {
          display: formatCurrency(tranz.impr_deb),
          className: 'text-slate-800'
        };

      case 'impr_cred':
        if (tranz.impr_cred.equals(0) && tranz.impr_sold.greaterThan(PRAG_ZEROIZARE)) {
          if (tranz.impr_deb.greaterThan(0)) {
            return {
              display: formatCurrency(tranz.impr_cred),
              className: 'text-slate-800'
            };
          }
          const prevHadNewLoan = prevTranz && prevTranz.impr_deb.greaterThan(0);
          if (prevHadNewLoan) {
            return {
              display: '!NOU!',
              className: 'text-orange-600 font-bold'
            };
          } else {
            return {
              display: 'Neachitat!',
              className: 'text-red-600 font-bold'
            };
          }
        }
        return {
          display: formatCurrency(tranz.impr_cred),
          className: 'text-slate-800'
        };

      case 'impr_sold':
        if (tranz.dobanda.greaterThan(0)) {
          return {
            display: 'Achitat',
            className: 'text-green-600 font-bold'
          };
        }
        if (tranz.impr_sold.lessThanOrEqualTo(PRAG_ZEROIZARE)) {
          if (tranz.impr_deb.greaterThan(0) && tranz.impr_cred.greaterThan(0) && prevTranz) {
            const soldVechiCalculat = prevTranz.impr_sold.minus(tranz.impr_cred);
            if (soldVechiCalculat.lessThanOrEqualTo(PRAG_ZEROIZARE)) {
              return {
                display: 'Achitat',
                className: 'text-green-600 font-bold'
              };
            }
          }
          if (tranz.impr_cred.greaterThan(0) && prevTranz && prevTranz.impr_sold.greaterThan(PRAG_ZEROIZARE)) {
            return {
              display: 'Achitat',
              className: 'text-green-600 font-bold'
            };
          }
          return {
            display: formatCurrency(tranz.impr_sold),
            className: 'text-slate-800'
          };
        }
        return {
          display: formatCurrency(tranz.impr_sold),
          className: 'text-slate-800'
        };

      case 'luna_an':
        return {
          display: formatLunaAn(tranz.luna, tranz.anul),
          className: 'text-slate-800 font-semibold'
        };

      case 'dep_deb':
        if (tranz.dep_deb.equals(0) && prevTranz && prevTranz.dep_sold.greaterThan(PRAG_ZEROIZARE)) {
          return {
            display: 'Neachitat!',
            className: 'text-red-600 font-bold'
          };
        }
        return {
          display: formatCurrency(tranz.dep_deb),
          className: 'text-slate-800'
        };

      case 'dep_cred':
        return {
          display: formatCurrency(tranz.dep_cred),
          className: 'text-slate-800'
        };

      case 'dep_sold':
        return {
          display: formatCurrency(tranz.dep_sold),
          className: 'text-slate-800'
        };

      default:
        return {
          display: '—',
          className: 'text-slate-800'
        };
    }
  } catch (error) {
    console.error(`Eroare formatare ${key}:`, error);
    return {
      display: 'ERR',
      className: 'text-red-600'
    };
  }
};

/**
 * Funcție utilitar pentru calculul dobânzii (read-only)
 * Extrasă din SumeLunare.tsx - NU modifică baza de date
 */
function calculeazaDobandaLaZi(
  databases: DBSet,
  nr_fisa: number,
  end_luna: number,
  end_anul: number,
  rata_dobanda: Decimal
): { dobanda: Decimal; start_period: number; suma_solduri: Decimal } {
  try {
    const dbDepcred = getActiveDB(databases, 'depcred');
    const end_period_val = end_anul * 100 + end_luna;

    // ========================================
    // PASUL 1: Determină perioada START
    // ========================================

    // 1.1: Găsește ultima lună cu împrumut acordat (impr_deb > 0)
    const resultLastLoan = dbDepcred.exec(`
      SELECT MAX(anul * 100 + luna) as max_period
      FROM depcred
      WHERE nr_fisa = ? AND impr_deb > 0 AND (anul * 100 + luna) <= ?
    `, [nr_fisa, end_period_val]);

    if (resultLastLoan.length === 0 || !resultLastLoan[0].values[0][0]) {
      // Nu există împrumuturi acordate
      return {
        dobanda: new Decimal("0"),
        start_period: 0,
        suma_solduri: new Decimal("0")
      };
    }

    const last_loan_period = resultLastLoan[0].values[0][0] as number;

    // 1.2: Verifică dacă în luna cu ultimul împrumut există dobândă și împrumut nou concomitent
    const resultConcomitent = dbDepcred.exec(`
      SELECT dobanda, impr_deb
      FROM depcred
      WHERE nr_fisa = ? AND (anul * 100 + luna) = ?
    `, [nr_fisa, last_loan_period]);

    let start_period_val = last_loan_period;

    if (resultConcomitent.length > 0 && resultConcomitent[0].values.length > 0) {
      const row = resultConcomitent[0].values[0];
      const dobanda = new Decimal(String(row[0] || "0"));
      const impr_deb = new Decimal(String(row[1] || "0"));

      // Dacă NU există dobândă și împrumut nou concomitent
      if (!(dobanda.greaterThan(0) && impr_deb.greaterThan(0))) {
        // Caută ultima lună cu sold zero (≤ 0.005) ÎNAINTE de ultimul împrumut
        const resultLastZero = dbDepcred.exec(`
          SELECT MAX(anul * 100 + luna) as max_zero_period
          FROM depcred
          WHERE nr_fisa = ?
            AND impr_sold <= 0.005
            AND (anul * 100 + luna) < ?
        `, [nr_fisa, last_loan_period]);

        if (resultLastZero.length > 0 && resultLastZero[0].values[0][0]) {
          start_period_val = resultLastZero[0].values[0][0] as number;
        }
      }
    }

    // ========================================
    // PASUL 2: Sumează TOATE soldurile pozitive din perioada
    // ========================================

    const resultSum = dbDepcred.exec(`
      SELECT SUM(impr_sold) as total_balances
      FROM depcred
      WHERE nr_fisa = ?
        AND (anul * 100 + luna) BETWEEN ? AND ?
        AND impr_sold > 0
    `, [nr_fisa, start_period_val, end_period_val]);

    if (resultSum.length === 0 || !resultSum[0].values[0][0]) {
      return {
        dobanda: new Decimal("0"),
        start_period: start_period_val,
        suma_solduri: new Decimal("0")
      };
    }

    const sum_of_balances = new Decimal(String(resultSum[0].values[0][0]));

    // ========================================
    // PASUL 3: Aplică rata dobânzii
    // ========================================

    const dobanda_calculata = sum_of_balances
      .times(rata_dobanda)
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

    return {
      dobanda: dobanda_calculata,
      start_period: start_period_val,
      suma_solduri: sum_of_balances
    };

  } catch (error) {
    console.error(`Eroare calcul dobândă pentru ${nr_fisa}:`, error);
    throw error;
  }
}

/**
 * Helper pentru formatare lună-an din period value
 */
function formatPeriod(period: number): string {
  const anul = Math.floor(period / 100);
  const luna = period % 100;
  const luniRomana = [
    "Ian", "Feb", "Mar", "Apr", "Mai", "Iun",
    "Iul", "Aug", "Sep", "Oct", "Nov", "Dec"
  ];
  return `${luniRomana[luna - 1]} ${anul}`;
}

/**
 * Calculează numărul de luni între două perioade
 */
function calculeazaNrLuni(start_period: number, end_period: number): number {
  const start_anul = Math.floor(start_period / 100);
  const start_luna = start_period % 100;
  const end_anul = Math.floor(end_period / 100);
  const end_luna = end_period % 100;

  return (end_anul - start_anul) * 12 + (end_luna - start_luna) + 1;
}

export default function CalculeazaDobanda({ databases, onBack }: Props) {
  const [membri, setMembri] = useState<AutocompleteOption[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedMembru, setSelectedMembru] = useState<AutocompleteOption | null>(null);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [istoric, setIstoric] = useState<TranzactieLunara[]>([]);
  const [rataDobanda, setRataDobanda] = useState("0.004");
  const [selectedLuna, setSelectedLuna] = useState<number>(new Date().getMonth() + 1);
  const [selectedAn, setSelectedAn] = useState<number>(new Date().getFullYear());
  const [calculResult, setCalculResult] = useState<CalculResult | null>(null);
  const [error, setError] = useState<string>("");

  // Refs pentru scroll sincronizat (desktop)
  const scrollRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Moneda activă
  const currency = databases.activeCurrency || 'RON';

  // Încarcă lista membri la mount
  useEffect(() => {
    const lista = citesteMembri(databases);
    setMembri(lista);
  }, [databases]);

  // Filtrare autocomplete - PREFIX only (nu substring)
  const filteredMembri = useMemo(() => {
    if (!searchTerm.trim()) return [];

    const term = searchTerm.toLowerCase();
    return membri
      .filter(m =>
        m.nume.toLowerCase().startsWith(term) ||
        m.nr_fisa.toString().startsWith(term)
      )
      .slice(0, 10); // Max 10 rezultate
  }, [membri, searchTerm]);

  // Handler pentru search
  const handleSearch = (value: string) => {
    setSearchTerm(value);
    setShowAutocomplete(value.trim().length > 0);
  };

  // Handler pentru selectare membru din autocomplete
  const handleSelectMembru = (option: AutocompleteOption) => {
    setSelectedMembru(option);
    setSearchTerm(option.display);
    setShowAutocomplete(false);
    setCalculResult(null);
    setError("");

    // Citește istoricul financiar
    const istoricData = citesteIstoricMembru(databases, option.nr_fisa);
    setIstoric(istoricData);

    if (istoricData.length === 0) {
      setError(`Membrul ${option.nume} nu are istoric financiar înregistrat.`);
    }
  };

  // Handler pentru reset
  const handleReset = () => {
    setSearchTerm("");
    setSelectedMembru(null);
    setShowAutocomplete(false);
    setIstoric([]);
    setCalculResult(null);
    setError("");
  };

  // Calculează dobânda
  const handleCalculeaza = () => {
    if (!selectedMembru) {
      setError("Selectați un membru mai întâi");
      return;
    }

    try {
      const rata = new Decimal(rataDobanda);
      if (rata.lessThanOrEqualTo(0)) {
        setError("Rata dobânzii trebuie să fie pozitivă");
        return;
      }

      const result = calculeazaDobandaLaZi(
        databases,
        selectedMembru.nr_fisa,
        selectedLuna,
        selectedAn,
        rata
      );

      const end_period = selectedAn * 100 + selectedLuna;
      const nr_luni = calculeazaNrLuni(result.start_period, end_period);

      setCalculResult({
        start_period: result.start_period > 0 ? formatPeriod(result.start_period) : "N/A",
        end_period: formatPeriod(end_period),
        suma_solduri: result.suma_solduri.toFixed(2),
        dobanda: result.dobanda.toFixed(2),
        rata_utilizata: rata.times(100).toFixed(2) + "%",
        nr_luni: nr_luni
      });
      setError("");

    } catch (err) {
      console.error("Eroare calcul dobândă:", err);
      setError("Eroare la calculul dobânzii. Verificați datele introduse.");
      setCalculResult(null);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4 sm:p-6">
      {/* Header */}
      <div className="max-w-4xl mx-auto mb-6">
        <Card>
          <CardHeader className="bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-t-xl">
            <div className="flex items-center gap-3">
              <Calculator className="w-8 h-8" />
              <CardTitle className="text-2xl">Calculează Dobânda</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            <Alert className="mb-4">
              <Info className="w-4 h-4" />
              <AlertDescription>
                Acest instrument calculează dobânda pentru un membru și perioadă selectată.
                <strong className="block mt-1">NU modifică baza de date - doar citește și afișează rezultatul.</strong>
              </AlertDescription>
            </Alert>

            {/* Selectare Membru */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Caută Membru (Nume sau Nr. Fișă)
                </label>
                <div className="relative">
                  <Input
                    type="text"
                    placeholder="Căutați după nume sau număr fișă..."
                    value={searchTerm}
                    onChange={(e) => handleSearch(e.target.value)}
                    onFocus={() => setShowAutocomplete(searchTerm.trim().length > 0)}
                    className="pr-10"
                  />
                  {searchTerm && (
                    <button
                      onClick={handleReset}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  )}

                  {/* Autocomplete Dropdown */}
                  {showAutocomplete && filteredMembri.length > 0 && (
                    <div className="absolute z-50 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-[300px] overflow-y-auto">
                      {filteredMembri.map((membru) => (
                        <button
                          key={membru.nr_fisa}
                          onClick={() => handleSelectMembru(membru)}
                          className="w-full px-4 py-2 text-left hover:bg-blue-50 border-b border-slate-100 last:border-b-0 transition-colors"
                        >
                          <div className="font-medium text-slate-800">{membru.nume}</div>
                          <div className="text-sm text-slate-500">Fișa: {membru.nr_fisa}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Afișare membru selectat */}
              {selectedMembru && (
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="text-sm font-semibold text-blue-900">Membru selectat:</div>
                  <div className="text-lg font-bold text-blue-700">
                    {selectedMembru.nume}
                  </div>
                  <div className="text-sm text-blue-600">Nr. Fișă: {selectedMembru.nr_fisa}</div>
                </div>
              )}

              {/* Selectare Perioadă */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Luna (sfârșit)
                  </label>
                  <select
                    value={selectedLuna}
                    onChange={(e) => setSelectedLuna(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    {[
                      "Ianuarie", "Februarie", "Martie", "Aprilie", "Mai", "Iunie",
                      "Iulie", "August", "Septembrie", "Octombrie", "Noiembrie", "Decembrie"
                    ].map((luna, idx) => (
                      <option key={idx} value={idx + 1}>{luna}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Anul
                  </label>
                  <Input
                    type="number"
                    value={selectedAn}
                    onChange={(e) => setSelectedAn(Number(e.target.value))}
                    min={2000}
                    max={2100}
                    className="w-full"
                  />
                </div>
              </div>

              {/* Rata Dobânzii */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Rata Dobânzii (decimal, ex: 0.004 = 0.4%)
                </label>
                <Input
                  type="number"
                  value={rataDobanda}
                  onChange={(e) => setRataDobanda(e.target.value)}
                  step="0.001"
                  min="0"
                  className="w-full"
                />
              </div>

              {/* Buton Calculează */}
              <button
                onClick={handleCalculeaza}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white py-3 px-4 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2"
                disabled={!selectedMembru}
              >
                <Calculator className="w-5 h-5" />
                Calculează Dobânda
              </button>

              {/* Erori */}
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {/* Rezultat Calcul */}
              {calculResult && (
                <div className="mt-6 p-6 bg-green-50 border-2 border-green-200 rounded-xl">
                  <h3 className="text-xl font-bold text-green-900 mb-4">Rezultat Calcul</h3>

                  <div className="space-y-3">
                    <div className="flex justify-between py-2 border-b border-green-200">
                      <span className="font-medium text-slate-700">Perioadă utilizată:</span>
                      <span className="font-bold text-slate-900">
                        {calculResult.start_period} → {calculResult.end_period} ({calculResult.nr_luni} luni)
                      </span>
                    </div>

                    <div className="flex justify-between py-2 border-b border-green-200">
                      <span className="font-medium text-slate-700">Suma soldurilor:</span>
                      <span className="font-bold text-slate-900">
                        {calculResult.suma_solduri} {databases.activeCurrency || 'RON'}
                      </span>
                    </div>

                    <div className="flex justify-between py-2 border-b border-green-200">
                      <span className="font-medium text-slate-700">Rată utilizată:</span>
                      <span className="font-bold text-slate-900">{calculResult.rata_utilizata}</span>
                    </div>

                    <div className="flex justify-between py-3 bg-green-100 -mx-2 px-2 rounded-lg mt-2">
                      <span className="font-bold text-green-900 text-lg">Dobândă calculată:</span>
                      <span className="font-bold text-green-700 text-xl">
                        {calculResult.dobanda} {databases.activeCurrency || 'RON'}
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-sm text-blue-800">
                      <strong>Formula:</strong> Dobândă = Suma soldurilor × Rata dobânzii
                    </p>
                    <p className="text-sm text-blue-700 mt-1">
                      {calculResult.suma_solduri} × {calculResult.rata_utilizata} = {calculResult.dobanda} {databases.activeCurrency || 'RON'}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Istoric Financiar - Afișat după selectarea membrului */}
      {selectedMembru && istoric.length > 0 && (
        <div className="max-w-7xl mx-auto">
          <Card>
            <CardHeader className="bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-t-xl">
              <CardTitle className="text-2xl">📊 Istoric Financiar - {selectedMembru.nume}</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="grid grid-cols-[4fr_1fr_3fr] gap-2">
                {/* Secțiunea Împrumuturi */}
                <div className="border-[3px] border-red-500 rounded-lg overflow-hidden bg-gradient-to-b from-red-50 to-red-100">
                  <div className="text-center font-bold text-slate-800 py-2 bg-gradient-to-b from-red-200 to-red-300 border-b-2 border-red-400">
                    Situație Împrumuturi
                  </div>
                  <div className="grid grid-cols-4 gap-px bg-gray-300">
                    {[
                      { title: "Dobândă", key: "dobanda" },
                      { title: "Împrumut", key: "impr_deb" },
                      { title: "Rată Achitată", key: "impr_cred" },
                      { title: "Sold Împrumut", key: "impr_sold" }
                    ].map((col, idx) => (
                      <div key={col.key} className="flex flex-col">
                        <div className="bg-gradient-to-b from-slate-100 to-slate-200 p-2 text-center font-bold text-xs text-slate-800 border-b-2 border-slate-400">
                          {col.title}
                        </div>
                        <div
                          ref={(el) => { scrollRefs.current[idx] = el; }}
                          className="h-[400px] overflow-y-auto bg-white"
                          style={{ scrollbarWidth: 'thin' }}
                        >
                          <div className="divide-y divide-slate-200">
                            {istoric.map((tranz, tranzIdx) => {
                              const { display, className } = getFormattedValue(
                                tranz, col.key, formatCurrency, formatLunaAn, istoric, tranzIdx
                              );
                              return (
                                <div
                                  key={`${tranz.anul}-${tranz.luna}-${tranzIdx}`}
                                  className={`p-2 text-center text-sm hover:bg-blue-50 ${className}`}
                                >
                                  {display}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Secțiunea Dată */}
                <div className="border-[3px] border-slate-500 rounded-lg overflow-hidden bg-gradient-to-b from-slate-50 to-slate-100">
                  <div className="text-center font-bold text-slate-800 py-2 bg-gradient-to-b from-slate-300 to-slate-400 border-b-2 border-slate-500">
                    Dată
                  </div>
                  <div className="flex flex-col">
                    <div className="bg-gradient-to-b from-slate-100 to-slate-200 p-2 text-center font-bold text-xs text-slate-800 border-b-2 border-slate-400">
                      Lună-An
                    </div>
                    <div
                      ref={(el) => { scrollRefs.current[4] = el; }}
                      className="h-[400px] overflow-y-auto bg-white"
                      style={{ scrollbarWidth: 'thin' }}
                    >
                      <div className="divide-y divide-slate-200">
                        {istoric.map((tranz, tranzIdx) => {
                          const { display, className } = getFormattedValue(
                            tranz, 'luna_an', formatCurrency, formatLunaAn, istoric, tranzIdx
                          );
                          return (
                            <div
                              key={`${tranz.anul}-${tranz.luna}-${tranzIdx}`}
                              className={`p-2 text-center text-sm hover:bg-blue-50 ${className}`}
                            >
                              {display}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Secțiunea Depuneri */}
                <div className="border-[3px] border-green-500 rounded-lg overflow-hidden bg-gradient-to-b from-green-50 to-green-100">
                  <div className="text-center font-bold text-slate-800 py-2 bg-gradient-to-b from-green-200 to-green-300 border-b-2 border-green-400">
                    Situație Depuneri
                  </div>
                  <div className="grid grid-cols-3 gap-px bg-gray-300">
                    {[
                      { title: "Cotizație", key: "dep_deb" },
                      { title: "Retragere", key: "dep_cred" },
                      { title: "Sold Depuneri", key: "dep_sold" }
                    ].map((col, idx) => (
                      <div key={col.key} className="flex flex-col">
                        <div className="bg-gradient-to-b from-slate-100 to-slate-200 p-2 text-center font-bold text-xs text-slate-800 border-b-2 border-slate-400">
                          {col.title}
                        </div>
                        <div
                          ref={(el) => { scrollRefs.current[idx + 5] = el; }}
                          className="h-[400px] overflow-y-auto bg-white"
                          style={{ scrollbarWidth: 'thin' }}
                        >
                          <div className="divide-y divide-slate-200">
                            {istoric.map((tranz, tranzIdx) => {
                              const { display, className } = getFormattedValue(
                                tranz, col.key, formatCurrency, formatLunaAn, istoric, tranzIdx
                              );
                              return (
                                <div
                                  key={`${tranz.anul}-${tranz.luna}-${tranzIdx}`}
                                  className={`p-2 text-center text-sm hover:bg-blue-50 ${className}`}
                                >
                                  {display}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Footer cu indicator */}
              <div className="mt-2 text-xs text-slate-700 text-center flex items-center justify-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                📊 Istoric complet - {istoric.length} luni
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
