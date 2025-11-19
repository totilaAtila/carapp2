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
import { calculeazaDobandaLaZi, formatPeriod, calculeazaNrLuni } from "../logic/calculeazaDobandaLaZi";

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

interface MonthStatus {
  title: string;
  subtitle: string;
  colorClass: string;
  iconColor: string;
}

interface MembruInfo {
  nr_fisa: number;
  nume: string;
  adresa: string;
  data_inscriere: string;
  calitate: string;
  cotizatie_standard: Decimal;
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
 * Citește informații detaliate despre un membru
 */
function citesteMembruInfo(
  databases: DBSet,
  nr_fisa: number
): MembruInfo | null {
  try {
    const result = getActiveDB(databases, 'membrii').exec(`
      SELECT NR_FISA, NUM_PREN, DOMICILIUL, DATA_INSCR, CALITATEA, COTIZATIE_STANDARD
      FROM membrii
      WHERE NR_FISA = ?
    `, [nr_fisa]);

    if (result.length === 0 || result[0].values.length === 0) {
      return null;
    }

    const row = result[0].values[0];
    return {
      nr_fisa: row[0] as number,
      nume: (row[1] as string || "").trim(),
      adresa: (row[2] as string || "").trim(),
      data_inscriere: (row[3] as string || "").trim(),
      calitate: (row[4] as string || "").trim(),
      cotizatie_standard: new Decimal(String(row[5] || "0"))
    };
  } catch (error) {
    console.error(`Eroare citire membru ${nr_fisa}:`, error);
    return null;
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
 * Helper pentru determinarea statusului lunii (pentru mobile view)
 */
const getMonthStatus = (
  tranz: TranzactieLunara,
  prevTranz: TranzactieLunara | undefined,
  formatCurrency: (value: Decimal) => string,
  currency: string
): MonthStatus => {
  // Helper: Verifică dacă cotizația e neachitată
  const cotizatieNeachitata = tranz.dep_deb.equals(0) && prevTranz && prevTranz.dep_sold.greaterThan(PRAG_ZEROIZARE);
  const cotizatieAlert = cotizatieNeachitata ? ' · ⚠️ Cotizație neachitată!' : '';

  // 1. Împrumut NOU + Achitare vechi (cazul special)
  if (
    tranz.impr_deb.greaterThan(0) &&
    tranz.impr_cred.greaterThan(0) &&
    prevTranz &&
    prevTranz.impr_sold.greaterThan(PRAG_ZEROIZARE)
  ) {
    const soldVechiCalculat = prevTranz.impr_sold.minus(tranz.impr_cred);
    if (soldVechiCalculat.lessThanOrEqualTo(PRAG_ZEROIZARE)) {
      return {
        title: '🔄 Împrumut nou + Achitare vechi',
        subtitle: `Nou: ${formatCurrency(tranz.impr_deb)} ${currency} | Achitat: ${formatCurrency(tranz.impr_cred)} ${currency}${cotizatieAlert}`,
        colorClass: 'text-blue-600',
        iconColor: 'bg-blue-500'
      };
    }
  }

  // 2. Împrumut NOU acordat
  if (tranz.impr_deb.greaterThan(0)) {
    return {
      title: `💰 Împrumut nou: ${formatCurrency(tranz.impr_deb)} ${currency}`,
      subtitle: `Acord împrumut${cotizatieAlert}`,
      colorClass: 'text-blue-600',
      iconColor: 'bg-blue-500'
    };
  }

  // 3. Împrumut ACHITAT complet
  if (tranz.impr_cred.greaterThan(0) && tranz.impr_sold.lessThanOrEqualTo(PRAG_ZEROIZARE)) {
    return {
      title: '✅ Împrumut achitat complet',
      subtitle: `Achitat: ${formatCurrency(tranz.impr_cred)} ${currency}${cotizatieAlert}`,
      colorClass: 'text-green-600',
      iconColor: 'bg-green-500'
    };
  }

  // 4. Stabilește rată (prima lună după contract)
  if (
    tranz.impr_cred.equals(0) &&
    tranz.impr_sold.greaterThan(PRAG_ZEROIZARE) &&
    prevTranz &&
    prevTranz.impr_deb.greaterThan(0)
  ) {
    return {
      title: '🆕 Stabilește rată',
      subtitle: `Sold: ${formatCurrency(tranz.impr_sold)} ${currency}${cotizatieAlert}`,
      colorClass: 'text-orange-600',
      iconColor: 'bg-orange-500'
    };
  }

  // 5. Rată ȘI Cotizație NEACHITATE (cazul cel mai grav - titlu explicit)
  if (
    tranz.impr_cred.equals(0) &&
    tranz.impr_sold.greaterThan(PRAG_ZEROIZARE) &&
    cotizatieNeachitata
  ) {
    return {
      title: '⚠️ Rată și Cotizație neachitate',
      subtitle: `Sold împrumut: ${formatCurrency(tranz.impr_sold)} ${currency} | Sold depuneri: ${formatCurrency(tranz.dep_sold)} ${currency}`,
      colorClass: 'text-red-600',
      iconColor: 'bg-red-500'
    };
  }

  // 6. Rată NEACHITATĂ (doar împrumut)
  if (tranz.impr_cred.equals(0) && tranz.impr_sold.greaterThan(PRAG_ZEROIZARE)) {
    return {
      title: '⚠️ Rată neachitată',
      subtitle: `Sold: ${formatCurrency(tranz.impr_sold)} ${currency}${cotizatieAlert}`,
      colorClass: 'text-red-600',
      iconColor: 'bg-red-500'
    };
  }

  // 7. Rată ACHITATĂ parțial
  if (tranz.impr_cred.greaterThan(0) && tranz.impr_sold.greaterThan(PRAG_ZEROIZARE)) {
    return {
      title: '💵 Rată achitată',
      subtitle: `Plată: ${formatCurrency(tranz.impr_cred)} ${currency} | Sold rămas: ${formatCurrency(tranz.impr_sold)} ${currency}${cotizatieAlert}`,
      colorClass: 'text-green-500',
      iconColor: 'bg-green-400'
    };
  }

  // 8. Împrumut ACTIV (default pentru sold > 0)
  if (tranz.impr_sold.greaterThan(PRAG_ZEROIZARE)) {
    return {
      title: '📊 Împrumut activ',
      subtitle: `Sold: ${formatCurrency(tranz.impr_sold)} ${currency}${cotizatieAlert}`,
      colorClass: 'text-purple-600',
      iconColor: 'bg-purple-500'
    };
  }

  // 9. Cotizație NEACHITATĂ (fără împrumut activ) - deja explicit în titlu
  if (cotizatieNeachitata) {
    return {
      title: '⚠️ Cotizație neachitată',
      subtitle: `Sold depuneri: ${formatCurrency(tranz.dep_sold)} ${currency}`,
      colorClass: 'text-red-600',
      iconColor: 'bg-red-500'
    };
  }

  // 10. Fără împrumut (nu poate avea cotizație neachitată dacă ajunge aici)
  return {
    title: MONTHS[tranz.luna - 1] + ' ' + tranz.anul,
    subtitle: 'Fără împrumuturi active',
    colorClass: 'text-slate-700',
    iconColor: 'bg-green-400'
  };
};

export default function CalculeazaDobanda({ databases, onBack }: Props) {
  const [membri, setMembri] = useState<AutocompleteOption[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedMembru, setSelectedMembru] = useState<AutocompleteOption | null>(null);
  const [membruInfo, setMembruInfo] = useState<MembruInfo | null>(null);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [istoric, setIstoric] = useState<TranzactieLunara[]>([]);
  const [rataDobanda, setRataDobanda] = useState("0.004");
  const [calculResult, setCalculResult] = useState<CalculResult | null>(null);
  const [error, setError] = useState<string>("");

  // State pentru mobile expandable cards
  const [expandedMonths, setExpandedMonths] = useState<Set<number>>(new Set());

  // Refs pentru scroll sincronizat (desktop)
  const scrollRefs = useRef<(HTMLDivElement | null)[]>([]);
  const isScrollingRef = useRef(false);

  // Moneda activă
  const currency = databases.activeCurrency || 'RON';

  // Încarcă lista membri la mount
  useEffect(() => {
    const lista = citesteMembri(databases);
    setMembri(lista);
  }, [databases]);

  // Auto-expand carduri cu probleme (mobile)
  useEffect(() => {
    const carduriCuProbleme = new Set<number>();

    istoric.forEach((tranz, idx) => {
      const prevTranz = idx < istoric.length - 1 ? istoric[idx + 1] : undefined;

      // Verifică dacă are rată neachitată
      const rataNeachitata = tranz.impr_cred.equals(0) && tranz.impr_sold.greaterThan(PRAG_ZEROIZARE);

      // Verifică dacă are cotizație neachitată
      const cotizatieNeachitata = tranz.dep_deb.equals(0) && prevTranz && prevTranz.dep_sold.greaterThan(PRAG_ZEROIZARE);

      // Dacă are oricare problemă, adaugă la set
      if (rataNeachitata || cotizatieNeachitata) {
        carduriCuProbleme.add(idx);
      }
    });

    setExpandedMonths(carduriCuProbleme);
  }, [istoric]);

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

    // Citește informații detaliate membru
    const info = citesteMembruInfo(databases, option.nr_fisa);
    if (!info) {
      setError(`Nu s-au găsit detalii pentru fișa ${option.nr_fisa}`);
      return;
    }
    setMembruInfo(info);

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
    setMembruInfo(null);
    setShowAutocomplete(false);
    setIstoric([]);
    setCalculResult(null);
    setError("");
  };

  // Toggle expand/collapse pentru mobile cards
  const toggleExpand = (idx: number) => {
    setExpandedMonths(prev => {
      const newSet = new Set(prev);
      if (newSet.has(idx)) {
        newSet.delete(idx);
      } else {
        newSet.add(idx);
      }
      return newSet;
    });
  };

  // Scroll sincronizat pentru desktop
  const handleScroll = (sourceIndex: number, event: React.UIEvent<HTMLDivElement>) => {
    if (isScrollingRef.current) return;

    isScrollingRef.current = true;
    const sourceElement = event.currentTarget;
    const scrollTop = sourceElement.scrollTop;

    // Sincronizează cu toate celelalte coloane folosind requestAnimationFrame pentru fluiditate
    requestAnimationFrame(() => {
      scrollRefs.current.forEach((ref, index) => {
        if (ref && index !== sourceIndex) {
          ref.scrollTop = scrollTop;
        }
      });

      // Reset flag după un scurt delay (10ms pentru responsivitate maximă)
      setTimeout(() => {
        isScrollingRef.current = false;
      }, 10);
    });
  };

  // Calculează dobânda pentru ultima tranzacție (AUTOMAT)
  const handleCalculeaza = () => {
    if (!selectedMembru) {
      setError("Selectați un membru mai întâi");
      return;
    }

    if (istoric.length === 0) {
      setError("Membrul selectat nu are istoric financiar");
      return;
    }

    try {
      const rata = new Decimal(rataDobanda);
      if (rata.lessThanOrEqualTo(0)) {
        setError("Rata dobânzii trebuie să fie pozitivă");
        return;
      }

      // Ia AUTOMAT ultima tranzacție (cea mai recentă)
      const ultimaTranzactie = istoric[0];

      // Verificare sold împrumut > 0 (ca în SumeLunare.tsx)
      if (ultimaTranzactie.impr_sold.lessThanOrEqualTo(0)) {
        setError("Membrul nu are împrumuturi active. Soldul împrumutului este 0.");
        setCalculResult(null);
        return;
      }

      const result = calculeazaDobandaLaZi(
        databases,
        selectedMembru.nr_fisa,
        ultimaTranzactie.luna,
        ultimaTranzactie.anul,
        rata
      );

      // Verificare: dacă nu există istoric de împrumuturi (start_period = 0)
      if (result.start_period === 0) {
        setError("Membrul selectat nu are împrumuturi acordate în istoric. Calculul dobânzii nu este aplicabil.");
        setCalculResult(null);
        return;
      }

      const end_period = ultimaTranzactie.anul * 100 + ultimaTranzactie.luna;

      // Găsește prima lună cu sold pozitiv pentru afișare corectă (ca în modulul separat)
      const dbDepcred = getActiveDB(databases, 'depcred');
      const resultFirstPositive = dbDepcred.exec(`
        SELECT MIN(anul * 100 + luna) as first_positive_period
        FROM depcred
        WHERE nr_fisa = ?
          AND (anul * 100 + luna) BETWEEN ? AND ?
          AND impr_sold > 0
      `, [selectedMembru.nr_fisa, result.start_period, end_period]);

      const display_start_period = (resultFirstPositive.length > 0 && resultFirstPositive[0].values[0][0])
        ? resultFirstPositive[0].values[0][0] as number
        : result.start_period;

      const nr_luni = calculeazaNrLuni(display_start_period, end_period);

      setCalculResult({
        start_period: formatPeriod(display_start_period),
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
                Acest instrument calculează dobânda pentru un membru, <strong>automat pentru ultima lună din istoric</strong>.
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

              {/* Afișare date membru selectat */}
              {membruInfo && (
                <div className="p-6 bg-gradient-to-br from-blue-50 to-blue-100 border-2 border-blue-300 rounded-xl shadow-md">
                  <div className="text-sm font-semibold text-blue-900 mb-3 flex items-center gap-2">
                    <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                    Date Membru
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <div className="text-xs font-medium text-blue-700 mb-1">Nume complet:</div>
                      <div className="text-lg font-bold text-blue-900">
                        {membruInfo.nume}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs font-medium text-blue-700 mb-1">Nr. Fișă:</div>
                      <div className="text-lg font-bold text-blue-900">
                        {membruInfo.nr_fisa}
                      </div>
                    </div>

                    <div className="md:col-span-2">
                      <div className="text-xs font-medium text-blue-700 mb-1">Adresă:</div>
                      <div className="text-sm text-slate-800">
                        {membruInfo.adresa || "—"}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs font-medium text-blue-700 mb-1">Data înscrierii:</div>
                      <div className="text-sm text-slate-800">
                        {membruInfo.data_inscriere || "—"}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs font-medium text-blue-700 mb-1">Calitate:</div>
                      <div className="text-sm text-slate-800">
                        {membruInfo.calitate || "—"}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs font-medium text-blue-700 mb-1">Cotizație standard:</div>
                      <div className="text-sm font-semibold text-slate-800">
                        {formatCurrency(membruInfo.cotizatie_standard)} {currency}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs font-medium text-blue-700 mb-1">Istoric financiar:</div>
                      <div className="text-sm font-semibold text-green-700">
                        {istoric.length} luni înregistrate
                      </div>
                    </div>
                  </div>
                </div>
              )}

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
                disabled={!selectedMembru || istoric.length === 0}
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

      {/* Istoric Financiar - DESKTOP VIEW */}
      {selectedMembru && istoric.length > 0 && (
        <div className="max-w-7xl mx-auto hidden lg:block">
          <Card>
            <CardHeader>
              <CardTitle>Istoric Financiar</CardTitle>
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
                          onScroll={(e) => handleScroll(idx, e)}
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
                      onScroll={(e) => handleScroll(4, e)}
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
                              className={`p-2 text-center text-sm font-semibold hover:bg-green-50 ${className}`}
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
                <div className="border-[3px] border-green-600 rounded-lg overflow-hidden bg-gradient-to-b from-green-50 to-green-100">
                  <div className="text-center font-bold text-slate-800 py-2 bg-gradient-to-b from-green-200 to-green-300 border-b-2 border-green-500">
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
                          onScroll={(e) => handleScroll(idx + 5, e)}
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
                                  className={`p-2 text-center text-sm hover:bg-purple-50 ${className}`}
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

              {/* Footer cu indicator scroll sincronizat */}
              <div className="mt-2 text-xs text-slate-700 text-center flex items-center justify-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                🔄 Scroll sincronizat - derulați orice coloană pentru a sincroniza toate
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Istoric Financiar - MOBILE VIEW */}
      {selectedMembru && istoric.length > 0 && (
        <div className="max-w-4xl mx-auto lg:hidden">
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-slate-800 px-2">Istoric Financiar</h2>
            {istoric.map((tranz, idx) => {
              const isExpanded = expandedMonths.has(idx);
              // Ordine DESC (cele mai recente primele): idx + 1 = luna ANTERIOARĂ cronologic
              const prevTranz = idx < istoric.length - 1 ? istoric[idx + 1] : undefined;
              const monthStatus = getMonthStatus(tranz, prevTranz, formatCurrency, currency);

              return (
                <Card
                  key={`${tranz.anul}-${tranz.luna}-${idx}`}
                  className="shadow-lg border-l-4 border-blue-500"
                >
                  <CardHeader
                    className="pb-3 bg-slate-50 cursor-pointer"
                    onClick={() => toggleExpand(idx)}
                  >
                    <CardTitle className="text-base flex items-center justify-between mb-2">
                      <span className="text-xs font-normal text-slate-700 flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        {formatLunaAn(tranz.luna, tranz.anul)} · {MONTHS[tranz.luna - 1]}
                      </span>
                      <ChevronDown
                        className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      />
                    </CardTitle>

                    <div className="flex items-start gap-2">
                      <div className={`w-2 h-2 ${monthStatus.iconColor} rounded-full mt-1.5 flex-shrink-0`}></div>
                      <div className="flex-1 min-w-0">
                        <div className={`font-bold text-base ${monthStatus.colorClass} leading-snug`}>
                          {monthStatus.title}
                        </div>
                        <div className="text-xs text-slate-600 mt-0.5">
                          {monthStatus.subtitle}
                        </div>
                      </div>
                    </div>
                  </CardHeader>

                  {isExpanded && (
                    <CardContent className="space-y-4 pt-4">
                      {/* ÎMPRUMUTURI */}
                      <div className="space-y-3">
                        <h3 className="font-bold text-blue-800 border-b border-blue-200 pb-1 flex items-center gap-2">
                          <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                          ÎMPRUMUTURI
                        </h3>
                        <div className="space-y-2 text-sm">
                          {/* Dobândă */}
                          {(() => {
                            const { display, className } = getFormattedValue(
                              tranz, 'dobanda', formatCurrency, formatLunaAn, istoric, idx
                            );
                            return (
                              <div className="flex justify-between">
                                <span className="font-semibold text-slate-700">Dobândă:</span>
                                <span className={className}>{display} {currency}</span>
                              </div>
                            );
                          })()}

                          {/* Împrumut Acordat */}
                          {(() => {
                            const { display, className } = getFormattedValue(
                              tranz, 'impr_deb', formatCurrency, formatLunaAn, istoric, idx
                            );
                            return (
                              <div className="flex justify-between">
                                <span className="font-semibold text-slate-700">Împrumut Acordat:</span>
                                <span className={className}>{display} {currency}</span>
                              </div>
                            );
                          })()}

                          {/* Rată Achitată */}
                          {(() => {
                            const { display, className } = getFormattedValue(
                              tranz, 'impr_cred', formatCurrency, formatLunaAn, istoric, idx
                            );
                            return (
                              <div className="flex justify-between">
                                <span className="font-semibold text-slate-700">Rată Achitată:</span>
                                <span className={className}>{display}</span>
                              </div>
                            );
                          })()}

                          {/* Sold Împrumut */}
                          {(() => {
                            const { display, className } = getFormattedValue(
                              tranz, 'impr_sold', formatCurrency, formatLunaAn, istoric, idx
                            );
                            return (
                              <div className="flex justify-between">
                                <span className="font-semibold text-slate-700">Sold Împrumut:</span>
                                <span className={className}>{display}</span>
                              </div>
                            );
                          })()}
                        </div>
                      </div>

                      {/* DEPUNERI */}
                      <div className="space-y-3">
                        <h3 className="font-bold text-purple-800 border-b border-purple-200 pb-1 flex items-center gap-2">
                          <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                          DEPUNERI
                        </h3>
                        <div className="space-y-2 text-sm">
                          {/* Cotizație */}
                          {(() => {
                            const { display, className } = getFormattedValue(
                              tranz, 'dep_deb', formatCurrency, formatLunaAn, istoric, idx
                            );
                            return (
                              <div className="flex justify-between">
                                <span className="font-semibold text-slate-700">Cotizație:</span>
                                <span className={className}>{display} {currency}</span>
                              </div>
                            );
                          })()}

                          {/* Retragere */}
                          {(() => {
                            const { display, className } = getFormattedValue(
                              tranz, 'dep_cred', formatCurrency, formatLunaAn, istoric, idx
                            );
                            return (
                              <div className="flex justify-between">
                                <span className="font-semibold text-slate-700">Retragere:</span>
                                <span className={className}>{display} {currency}</span>
                              </div>
                            );
                          })()}

                          {/* Sold Depuneri */}
                          {(() => {
                            const { display, className } = getFormattedValue(
                              tranz, 'dep_sold', formatCurrency, formatLunaAn, istoric, idx
                            );
                            return (
                              <div className="flex justify-between">
                                <span className="font-semibold text-slate-700">Sold Depuneri:</span>
                                <span className={className}>{display} {currency}</span>
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
