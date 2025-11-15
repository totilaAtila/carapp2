// src/components/SumeLunare.tsx
/**
 * Modul Sume Lunare - Port complet din sume_lunare.py (2750 linii)
 *
 * FUNCȚIONALITĂȚI:
 * - Search autocomplete pentru membri (nume + nr fișă)
 * - Afișare istoric financiar complet (toate lunile)
 * - 8 coloane cu scroll sincronizat (desktop)
 * - Dialog modificare tranzacție cu calcul rata/luni
 * - Aplicare dobândă la achitare anticipată împrumut
 * - Recalculare automată lunilor ulterioare după modificări
 * - Salvare modificări în DEPCRED.db cu validări complete
 * - Actualizare cotizație standard în MEMBRII.db
 *
 * LAYOUT:
 * - Desktop (≥1024px): 3 secțiuni (Împrumuturi | Dată | Depuneri) cu 8 coloane
 * - Mobile (<1024px): Carduri per lună + search autocomplete
 *
 * LOGICA BUSINESS (100% din Python):
 * - Validări sold împrumut (nu permite plată > sold)
 * - Validări fond disponibil (nu permite retragere > fond)
 * - Calcul dobândă = SUM(impr_sold) × rata_dobanda
 * - Recalculare solduri: sold_nou = sold_vechi + debit - credit
 * - Ajustare sold < 0.005 → 0.00
 */

import { useState, useEffect, useMemo, useRef } from "react";
import Decimal from "decimal.js";
import type { DBSet } from "../services/databaseManager";
import { getActiveDB, assertCanWrite } from "../services/databaseManager";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/buttons";
import { Input } from "./ui/input";
import { ScrollArea } from "./ui/scroll-area";
import { Alert, AlertDescription } from "./ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import {
  Loader2,
  Search,
  X,
  Edit,
  Calculator,
  RotateCcw,
  Info,
  AlertCircle,
  Calendar,
  ChevronDown
} from "lucide-react";

// Configurare Decimal.js
Decimal.set({
  precision: 20,
  rounding: Decimal.ROUND_HALF_UP
});

// ==========================================
// CONSTANTE ȘI INTERFEȚE
// ==========================================

const MONTHS = [
  "Ianuarie", "Februarie", "Martie", "Aprilie", "Mai", "Iunie",
  "Iulie", "August", "Septembrie", "Octombrie", "Noiembrie", "Decembrie"
];

const PRAG_ZEROIZARE = new Decimal("0.005"); // Sold < 0.005 → 0.00
const RATA_DOBANDA_DEFAULT = new Decimal("0.004"); // 4‰ (4 la mie)

interface Props {
  databases: DBSet;
  onBack: () => void;
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

interface AutocompleteOption {
  nr_fisa: number;
  nume: string;
  display: string; // "Nume (Fișa: 123)"
}

// ==========================================
// FORMATARE VIZUALĂ CONDIȚIONATĂ (EXACT CA ÎN PYTHON)
// ==========================================

const getFormattedValue = (
  tranz: TranzactieLunara,
  key: string,
  formatCurrency: (value: Decimal) => string,
  formatLunaAn: (luna: number, anul: number) => string,
  istoric?: TranzactieLunara[],
  index?: number
): { display: React.ReactNode; className: string } => {
  try {
    // Ordine DESC (cele mai recente primele): index + 1 = luna ANTERIOARĂ cronologic
    const prevTranz = istoric && index !== undefined && index < istoric.length - 1 ? istoric[index + 1] : undefined;

    switch (key) {
      case 'dobanda':
        // Dobândă - mereu negru normal (EXACT ca în Python)
        return {
          display: formatCurrency(tranz.dobanda),
          className: 'text-slate-800'
        };

      case 'impr_deb':
        // Împrumut Nou - blue bold când > 0
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
        // Rată Achitată - logica EXACTĂ din Python
        if (tranz.impr_cred.equals(0) && tranz.impr_sold.greaterThan(PRAG_ZEROIZARE)) {
          // Dacă în luna CURENTĂ s-a acordat împrumut nou -> afișare normală 0.00
          if (tranz.impr_deb.greaterThan(0)) {
            return {
              display: formatCurrency(tranz.impr_cred),
              className: 'text-slate-800'
            };
          }

          // Verificare lună ANTERIOARĂ
          const prevHadNewLoan = prevTranz && prevTranz.impr_deb.greaterThan(0);

          if (prevHadNewLoan) {
            // Luna anterioară a avut împrumut nou -> !NOU! portocaliu bold
            return {
              display: '!NOU!',
              className: 'text-orange-600 font-bold'
            };
          } else {
            // Luna anterioară NU a avut împrumut nou -> Neachitat! roșu bold
            return {
              display: 'Neachitat!',
              className: 'text-red-600 font-bold'
            };
          }
        }

        // Afișare normală cu 2 zecimale
        return {
          display: formatCurrency(tranz.impr_cred),
          className: 'text-slate-800'
        };

      case 'impr_sold':
        // Sold Împrumut - logica EXACTĂ din Python

        // 1. Dacă dobândă > 0 -> Achitat verde bold
        if (tranz.dobanda.greaterThan(0)) {
          return {
            display: 'Achitat',
            className: 'text-green-600 font-bold'
          };
        }

        // 2. Dacă sold ≤ 0.005
        if (tranz.impr_sold.lessThanOrEqualTo(PRAG_ZEROIZARE)) {
          // Cazul special: împrumut nou + rată achitată în aceeași lună
          if (tranz.impr_deb.greaterThan(0) && tranz.impr_cred.greaterThan(0) && prevTranz) {
            const soldVechiCalculat = prevTranz.impr_sold.minus(tranz.impr_cred);
            if (soldVechiCalculat.lessThanOrEqualTo(PRAG_ZEROIZARE)) {
              return {
                display: 'Achitat',
                className: 'text-green-600 font-bold'
              };
            }
          }

          // Caz normal: există rată achitată și sold_precedent > 0.005
          if (tranz.impr_cred.greaterThan(0) && prevTranz && prevTranz.impr_sold.greaterThan(PRAG_ZEROIZARE)) {
            return {
              display: 'Achitat',
              className: 'text-green-600 font-bold'
            };
          }

          // Altfel: 0.00
          return {
            display: formatCurrency(tranz.impr_sold),
            className: 'text-slate-800'
          };
        }

        // 3. Afișare normală cu 2 zecimale (NU bold, NU blue!)
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
        // Cotizație neachitată - roșu bold (EXACT ca în Python)
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
        // Retragere - mereu normal
        return {
          display: formatCurrency(tranz.dep_cred),
          className: 'text-slate-800'
        };

      case 'dep_sold':
        // Sold Depuneri - mereu negru normal (NU purple!)
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

// ==========================================
// HELPER - STARE LUNĂ PENTRU MOBILE
// ==========================================

interface MonthStatus {
  title: string;
  subtitle: string;
  colorClass: string;
  iconColor: string;
}

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

// ==========================================
// HELPER FUNCTIONS - DATABASE
// ==========================================

/**
 * Citește lista completă de membri pentru autocomplete
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

    // Citire membri activi
    const result = getActiveDB(databases, 'membrii').exec(`
      SELECT NR_FISA, NUM_PREN
      FROM membrii
      ORDER BY NUM_PREN
    `);

    if (result.length === 0) return [];

    const membri: AutocompleteOption[] = [];
    result[0].values.forEach(row => {
      const nr_fisa = row[0] as number;
      const nume = (row[1] as string || "").trim();

      // Excludem lichidați
      if (lichidati.has(nr_fisa)) return;

      membri.push({
        nr_fisa,
        nume,
        display: `${nume} (Fișa: ${nr_fisa})`
      });
    });

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
 * Verifică dacă un membru este lichidat
 */
function esteLichidat(databases: DBSet, nr_fisa: number): boolean {
  try {
    const result = getActiveDB(databases, 'lichidati').exec(`
      SELECT COUNT(*) as cnt FROM lichidati WHERE nr_fisa = ?
    `, [nr_fisa]);

    return result.length > 0 && (result[0].values[0][0] as number) > 0;
  } catch {
    return false; // LICHIDATI.db opțional
  }
}

// ==========================================
// COMPONENTA PRINCIPALĂ
// ==========================================

export default function SumeLunare({ databases, onBack }: Props) {
  // State principal
  const [membri, setMembri] = useState<AutocompleteOption[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedMembru, setSelectedMembru] = useState<MembruInfo | null>(null);
  const [istoric, setIstoric] = useState<TranzactieLunara[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [rataDobanda] = useState<Decimal>(RATA_DOBANDA_DEFAULT);

  // Moneda activă pentru afișare
  const currency = databases.activeCurrency;

  // State pentru dialog modificare
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedTranzactie, setSelectedTranzactie] = useState<TranzactieLunara | null>(null);

  // Refs pentru scroll sincronizat (desktop)
  const scrollRefs = useRef<(HTMLDivElement | null)[]>([]);

  // ========================================
  // EFFECTS
  // ========================================

  // Scroll la top când se montează componenta (pentru mobile)
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // Încărcare listă membri la mount
  useEffect(() => {
    const lista = citesteMembri(databases);
    setMembri(lista);
  }, [databases]);

  // ========================================
  // COMPUTED VALUES
  // ========================================

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

  // Ultima tranzacție (cea mai recentă) - cu DESC, prima e la început (index 0)
  const ultimaTranzactie = istoric.length > 0 ? istoric[0] : null;

  // Verificare membru lichidat
  const membruLichidat = useMemo(() => {
    return selectedMembru ? esteLichidat(databases, selectedMembru.nr_fisa) : false;
  }, [selectedMembru, databases]);

  // ========================================
  // HANDLERS
  // ========================================

  const handleSearch = (value: string) => {
    setSearchTerm(value);
    setShowAutocomplete(value.trim().length > 0);
  };

  const handleSelectMembru = async (option: AutocompleteOption) => {
    setLoading(true);
    setSearchTerm(option.display);
    setShowAutocomplete(false);

    try {
      // Citește informații membre
      const info = citesteMembruInfo(databases, option.nr_fisa);
      if (!info) {
        alert(`Nu s-au găsit detalii pentru fișa ${option.nr_fisa}`);
        return;
      }

      setSelectedMembru(info);

      // Citește istoric financiar
      const istoricData = citesteIstoricMembru(databases, option.nr_fisa);
      setIstoric(istoricData);

      if (istoricData.length === 0) {
        alert(`Membrul ${info.nume} nu are istoric financiar înregistrat.`);
      }
    } catch (error) {
      console.error("Eroare încărcare membru:", error);
      alert(`Eroare la încărcarea datelor: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setSearchTerm("");
    setSelectedMembru(null);
    setIstoric([]);
    setShowAutocomplete(false);
  };

  const handleModificaTranzactie = () => {
    if (!ultimaTranzactie) {
      alert("Nu există tranzacții de modificat.");
      return;
    }

    setSelectedTranzactie(ultimaTranzactie);
    setDialogOpen(true);
  };

  const handleAplicaDobanda = async () => {
    if (!ultimaTranzactie || !selectedMembru) {
      alert("Nu există tranzacții pentru aplicarea dobânzii.");
      return;
    }

    // Verificare sold împrumut > 0
    if (ultimaTranzactie.impr_sold.lessThanOrEqualTo(0)) {
      alert("Membrul nu are împrumuturi active. Soldul împrumutului este 0.");
      return;
    }

    try {
      setLoading(true);

      // VERIFICARE PERMISIUNI DE SCRIERE
      assertCanWrite(databases, 'Aplicare dobândă');

      // Calcul dobândă CORECT - EXACT ca în Python
      // Sumează TOATE soldurile pozitive din perioada împrumutului
      const dobandaCalculata = calculeazaDobandaLaZi(
        databases,
        selectedMembru.nr_fisa,
        ultimaTranzactie.luna,
        ultimaTranzactie.anul,
        rataDobanda
      );

      // Verificare dobândă calculată
      if (dobandaCalculata.lessThanOrEqualTo(0)) {
        alert("Nu s-a putut calcula dobânda. Verificați istoricul împrumuturilor.");
        setLoading(false);
        return;
      }

      // Confirmare utilizator
      const confirmMsg = `Se va aplica dobânda pentru achitare anticipată:\n\n` +
        `Sold Împrumut Curent: ${formatCurrency(ultimaTranzactie.impr_sold)} ${currency}\n` +
        `Rată Dobândă: ${rataDobanda.times(1000).toFixed(1)}‰ (${rataDobanda.times(100).toFixed(1)}%)\n` +
        `Dobândă Calculată (suma soldurilor × rată): ${formatCurrency(dobandaCalculata)} ${currency}\n\n` +
        `Dobânda se calculează și se înregistrează în istoric.\n\n` +
        `Continuați?`;

      if (!confirm(confirmMsg)) {
        setLoading(false);
        return;
      }

      // Update tranzacție curentă: adaugă dobânda calculată la câmpul dobândă
      const dobandaNoua = ultimaTranzactie.dobanda.plus(dobandaCalculata);

      getActiveDB(databases, 'depcred').run(`
        UPDATE depcred
        SET dobanda = ?
        WHERE nr_fisa = ? AND luna = ? AND anul = ?
      `, [
        dobandaNoua.toNumber(),
        selectedMembru.nr_fisa,
        ultimaTranzactie.luna,
        ultimaTranzactie.anul
      ]);

      // Recalculare lunilor ulterioare (pentru a propaga modificarea)
      await recalculeazaLuniUlterioare(
        databases,
        selectedMembru.nr_fisa,
        ultimaTranzactie.luna,
        ultimaTranzactie.anul,
        rataDobanda
      );

      // Refresh date
      const istoricData = citesteIstoricMembru(databases, selectedMembru.nr_fisa);
      setIstoric(istoricData);

      alert(`Dobanda a fost aplicata cu succes!`);
    } catch (error) {
      console.error("Eroare aplicare dobândă:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      alert(`Dobanda nu a putut fi procesata pentru ca: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  // ========================================
  // RENDER HELPERS
  // ========================================

  const formatCurrency = (value: Decimal): string => {
    return value.toFixed(2);
  };

  const formatLunaAn = (luna: number, anul: number): string => {
    return `${String(luna).padStart(2, "0")}-${anul}`;
  };

  // ========================================
  // RENDER
  // ========================================

  return (
    <div className="w-full h-full flex flex-col gap-4 p-4 bg-slate-50">
      {/* Header */}
      <Card>
        <CardHeader className="bg-gradient-to-r from-blue-600 to-blue-700 text-white md:bg-transparent md:text-inherit">
          <CardTitle className="flex items-center gap-2 justify-center md:justify-start">
            💰 Sume Lunare
          </CardTitle>
        </CardHeader>
      </Card>

      {/* MOBILE - Secțiune Căutare + Autocomplete (Layout Original) */}
      <div className="lg:hidden">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="w-5 h-5" />
              Căutare Membru
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative">
              <div className="flex gap-2">
                <div className="flex-1 relative">
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
                          <div className="text-sm text-slate-700">Fișa: {membru.nr_fisa}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {selectedMembru && (
                  <Button onClick={handleReset} variant="outline" className="gap-2">
                    <RotateCcw className="w-4 h-4" />
                    Reset
                  </Button>
                )}
              </div>

              {loading && (
                <div className="flex items-center gap-2 mt-2 text-blue-600">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Se încarcă datele...</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Mobile - Informații Membru Card */}
        {selectedMembru && (
          <Card className={`mt-4 ${membruLichidat ? 'border-red-500 bg-red-50' : 'border-blue-500 bg-blue-50'}`}>
            <CardHeader>
              <CardTitle className="text-lg">
                {selectedMembru.nume}
                {membruLichidat && (
                  <span className="ml-2 text-red-600 text-sm font-bold flex items-center gap-1">
                    <AlertCircle className="w-4 h-4" />
                    LICHIDAT
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="font-semibold text-slate-600">Nr. Fișă:</span>
                  <div className="text-slate-800">{selectedMembru.nr_fisa}</div>
                </div>
                <div>
                  <span className="font-semibold text-slate-600">Data Însc.:</span>
                  <div className="text-slate-800">{selectedMembru.data_inscriere || "—"}</div>
                </div>
                <div className="col-span-2">
                  <span className="font-semibold text-slate-600">Adresă:</span>
                  <div className="text-slate-800">{selectedMembru.adresa || "—"}</div>
                </div>
                <div className="col-span-2">
                  <span className="font-semibold text-slate-600">Calitate:</span>
                  <div className="text-slate-800">{selectedMembru.calitate || "—"}</div>
                </div>
              </div>

              {/* Butoane Mobile - Stacked Vertical */}
              <div className="flex flex-col gap-2 pt-2">
                <Button
                  onClick={handleReset}
                  variant="outline"
                  className="w-full"
                >
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Reset
                </Button>
                <Button
                  onClick={handleAplicaDobanda}
                  disabled={!ultimaTranzactie || membruLichidat}
                  className="w-full bg-gradient-to-b from-cyan-500 to-cyan-700"
                >
                  <Calculator className="w-4 h-4 mr-2" />
                  Aplică Dobândă
                </Button>
                <Button
                  onClick={handleModificaTranzactie}
                  disabled={!ultimaTranzactie || membruLichidat}
                  className="w-full bg-gradient-to-b from-yellow-400 to-yellow-600 text-slate-900"
                >
                  <Edit className="w-4 h-4 mr-2" />
                  Modifică Tranzacție
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* DESKTOP - Layout Grid 3x5 cu Autocomplete în Nume */}
      <div className={`hidden lg:block rounded-xl p-4 bg-gradient-to-b ${selectedMembru && membruLichidat ? 'from-red-100 to-red-200 border-[2px] border-red-500' : 'from-blue-50 to-blue-100 border-[2px] border-blue-500'}`}>
        {selectedMembru && membruLichidat && (
          <div className="mb-3 text-center text-red-600 font-bold flex items-center justify-center gap-2">
            <AlertCircle className="w-5 h-5" />
            MEMBRU LICHIDAT
          </div>
        )}

        {/* Grid 3x5 exact ca în Python */}
        <div className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-x-3 gap-y-2 items-center">
          {/* Row 0 */}
          <label className="font-semibold text-slate-700 text-sm">Nume:</label>
          <div className="relative col-span-1">
            <Input
              type="text"
              placeholder="Începeți să tastați numele..."
              value={searchTerm}
              onChange={(e) => handleSearch(e.target.value)}
              onFocus={() => setShowAutocomplete(searchTerm.trim().length > 0)}
              className="bg-white border-[2px] border-blue-300 text-slate-700"
            />

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
          <label className="font-semibold text-slate-700 text-sm">Nr. Fișă:</label>
          <Input
            value={selectedMembru?.nr_fisa || ""}
            readOnly
            className="w-24 bg-white border-[2px] border-blue-300 text-slate-700"
          />
          <Button
            onClick={handleReset}
            className="min-w-[120px] min-h-[35px] bg-gradient-to-b from-red-400 to-red-600 hover:from-red-500 hover:to-red-700 text-white font-semibold border-2 border-red-700 shadow-md"
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Reset
          </Button>

          {/* Row 1 */}
          <label className="font-semibold text-slate-700 text-sm">Adresă:</label>
          <Input
            value={selectedMembru?.adresa || "—"}
            readOnly
            className="col-span-1 bg-white border-[2px] border-blue-300 text-slate-700"
          />
          <label className="font-semibold text-slate-700 text-sm">Data Însc.:</label>
          <Input
            value={selectedMembru?.data_inscriere || "—"}
            readOnly
            className="w-28 bg-white border-[2px] border-blue-300 text-slate-700"
          />
          <Button
            onClick={handleAplicaDobanda}
            disabled={!ultimaTranzactie || membruLichidat}
            className="min-w-[140px] min-h-[35px] bg-gradient-to-b from-cyan-500 to-cyan-700 hover:from-cyan-600 hover:to-cyan-800 text-white font-semibold border-2 border-cyan-800 shadow-md disabled:from-gray-400 disabled:to-gray-500 disabled:border-gray-600"
          >
            <Calculator className="w-4 h-4 mr-2" />
            Aplică Dobândă
          </Button>

          {/* Row 2 */}
          <label className="font-semibold text-slate-700 text-sm">Calitate:</label>
          <Input
            value={selectedMembru?.calitate || "—"}
            readOnly
            className="col-span-1 bg-white border-[2px] border-blue-300 text-slate-700"
          />
          <div className="col-span-2"></div> {/* Spacer */}
          <Button
            onClick={handleModificaTranzactie}
            disabled={!ultimaTranzactie || membruLichidat}
            className="min-w-[140px] min-h-[35px] bg-gradient-to-b from-yellow-400 to-yellow-600 hover:from-yellow-500 hover:to-yellow-700 text-slate-900 font-semibold border-2 border-yellow-700 shadow-md disabled:from-gray-400 disabled:to-gray-500 disabled:border-gray-600 disabled:text-gray-200"
          >
            <Edit className="w-4 h-4 mr-2" />
            Modifică Tranzacție
          </Button>
        </div>
      </div>

      {/* Istoric Financiar - Desktop (≥1024px) */}
      {selectedMembru && istoric.length > 0 && (
        <div className="hidden lg:block">
          <DesktopHistoryView
            istoric={istoric}
            scrollRefs={scrollRefs}
            formatCurrency={formatCurrency}
            formatLunaAn={formatLunaAn}
          />
        </div>
      )}

      {/* Istoric Financiar - Mobile (<1024px) */}
      {selectedMembru && istoric.length > 0 && (
        <div className="lg:hidden">
          <MobileHistoryView
            istoric={istoric}
            formatCurrency={formatCurrency}
            formatLunaAn={formatLunaAn}
            currency={currency}
          />
        </div>
      )}

      {/* Dialog Modificare Tranzacție */}
      {selectedTranzactie && (
        <TransactionDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          tranzactie={selectedTranzactie}
          membruInfo={selectedMembru!}
          databases={databases}
          rataDobanda={rataDobanda}
          formatCurrency={formatCurrency}
          formatLunaAn={formatLunaAn}
          currency={currency}
          onSave={(noualeTranzactie) => {
            // Trigger recalculation și refresh
            handleSelectMembru({ nr_fisa: selectedMembru!.nr_fisa, nume: selectedMembru!.nume, display: "" });
            setDialogOpen(false);
          }}
        />
      )}
    </div>
  );
}

// ==========================================
// COMPONENTE AUXILIARE
// ==========================================

/**
 * Desktop History View - 8 coloane în 3 secțiuni cu scroll sincronizat
 */
interface DesktopHistoryViewProps {
  istoric: TranzactieLunara[];
  scrollRefs: React.MutableRefObject<(HTMLDivElement | null)[]>;
  formatCurrency: (value: Decimal) => string;
  formatLunaAn: (luna: number, anul: number) => string;
}

function DesktopHistoryView({
  istoric,
  scrollRefs,
  formatCurrency,
  formatLunaAn
}: DesktopHistoryViewProps) {
  const isScrollingRef = useRef(false);

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

  const columns = [
    { title: "Dobândă", key: "dobanda", section: "imprumuturi" },
    { title: "Împrumut", key: "impr_deb", section: "imprumuturi" },
    { title: "Rată Achitată", key: "impr_cred", section: "imprumuturi" },
    { title: "Sold Împrumut", key: "impr_sold", section: "imprumuturi" },
    { title: "Lună-An", key: "luna_an", section: "data" },
    { title: "Cotizație", key: "dep_deb", section: "depuneri" },
    { title: "Retragere", key: "dep_cred", section: "depuneri" },
    { title: "Sold Depuneri", key: "dep_sold", section: "depuneri" }
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Istoric Financiar</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-[4fr_1fr_3fr] gap-2">
          {/* Secțiunea Împrumuturi - 40% */}
          <div className="border-[3px] border-red-500 rounded-lg overflow-hidden bg-gradient-to-b from-red-50 to-red-100">
            <div className="text-center font-bold text-slate-800 py-2 bg-gradient-to-b from-red-200 to-red-300 border-b-2 border-red-400">
              Situație Împrumuturi
            </div>
            <div className="grid grid-cols-4 gap-px bg-gray-300">
              {columns.slice(0, 4).map((col, idx) => (
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

          {/* Secțiunea Dată - 10% */}
          <div className="border-[3px] border-slate-500 rounded-lg overflow-hidden bg-gradient-to-b from-slate-50 to-slate-100">
            <div className="text-center font-bold text-slate-800 py-2 bg-gradient-to-b from-slate-300 to-slate-400 border-b-2 border-slate-500">
              Dată
            </div>
            <div className="flex flex-col">
              <div className="bg-gradient-to-b from-slate-100 to-slate-200 p-2 text-center font-bold text-xs text-slate-800 border-b-2 border-slate-400">
                {columns[4].title}
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
                      tranz, columns[4].key, formatCurrency, formatLunaAn, istoric, tranzIdx
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

          {/* Secțiunea Depuneri - 30% */}
          <div className="border-[3px] border-green-600 rounded-lg overflow-hidden bg-gradient-to-b from-green-50 to-green-100">
            <div className="text-center font-bold text-slate-800 py-2 bg-gradient-to-b from-green-200 to-green-300 border-b-2 border-green-500">
              Situație Depuneri
            </div>
            <div className="grid grid-cols-3 gap-px bg-gray-300">
              {columns.slice(5, 8).map((col, idx) => (
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
  );
}

/**
 * Mobile History View - Carduri per lună
 */
interface MobileHistoryViewProps {
  istoric: TranzactieLunara[];
  formatCurrency: (value: Decimal) => string;
  formatLunaAn: (luna: number, anul: number) => string;
  currency: string;
}

function MobileHistoryView({
  istoric,
  formatCurrency,
  formatLunaAn,
  currency
}: MobileHistoryViewProps) {
  // State: Set de indexuri pentru carduri expandate (permite multiple simultan)
  const [expandedMonths, setExpandedMonths] = useState<Set<number>>(new Set());

  // Auto-expand cardurile cu probleme la încărcare
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

  return (
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
  );
}

/**
 * Transaction Dialog - Modificare tranzacție cu calcul rata/luni
 */
interface TransactionDialogProps {
  open: boolean;
  onClose: () => void;
  tranzactie: TranzactieLunara;
  membruInfo: MembruInfo;
  databases: DBSet;
  rataDobanda: Decimal;
  onSave: (tranzactie: TranzactieLunara) => void;
  formatCurrency: (value: Decimal) => string;
  formatLunaAn: (luna: number, anul: number) => string;
  currency: string;
}

function TransactionDialog({
  open,
  onClose,
  tranzactie,
  membruInfo,
  databases,
  rataDobanda,
  onSave,
  formatCurrency,
  formatLunaAn,
  currency
}: TransactionDialogProps) {
  // State pentru formular
  const [formData, setFormData] = useState({
    dobanda: tranzactie.dobanda.toString(),
    impr_deb: tranzactie.impr_deb.toString(),
    impr_cred: tranzactie.impr_cred.toString(),
    dep_deb: tranzactie.dep_deb.toString(),
    dep_cred: tranzactie.dep_cred.toString()
  });

  const [calcImprumut, setCalcImprumut] = useState("");
  const [calcLuni, setCalcLuni] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Calculare rată lunară din împrumut și număr luni
  const handleCalculeazaRata = () => {
    try {
      const suma = new Decimal(calcImprumut || "0");
      const luni = parseInt(calcLuni || "0");

      if (luni <= 0) {
        alert("Numărul de luni trebuie să fie pozitiv!");
        return;
      }

      const rata = suma.dividedBy(luni);
      setFormData(prev => ({ ...prev, impr_cred: rata.toFixed(2) }));
    } catch (err) {
      alert("Eroare la calcularea ratei!");
    }
  };

  // Validări și salvare
  const handleSave = async () => {
    setSaving(true);
    setError(null);

    try {
      // VERIFICARE PERMISIUNI DE SCRIERE
      assertCanWrite(databases, 'Modificare tranzacție');

      // Convertire la Decimal
      const dobanda = new Decimal(formData.dobanda || "0");
      const impr_deb = new Decimal(formData.impr_deb || "0");
      const impr_cred = new Decimal(formData.impr_cred || "0");
      const dep_deb = new Decimal(formData.dep_deb || "0");
      const dep_cred = new Decimal(formData.dep_cred || "0");

      // Validare: rata achitată nu poate fi > sold împrumut
      if (impr_cred.greaterThan(tranzactie.impr_sold)) {
        setError(`Rata achitată (${impr_cred.toFixed(2)}) nu poate fi mai mare decât soldul împrumutului (${tranzactie.impr_sold.toFixed(2)})!`);
        setSaving(false);
        return;
      }

      // Validare: retragere nu poate fi > sold depuneri
      const soldDepuneriCurent = tranzactie.dep_sold;
      if (dep_cred.greaterThan(soldDepuneriCurent)) {
        setError(`Retragerea (${dep_cred.toFixed(2)}) nu poate fi mai mare decât soldul depunerilor (${soldDepuneriCurent.toFixed(2)})!`);
        setSaving(false);
        return;
      }

      // Salvare în baza de date
      getActiveDB(databases, 'depcred').run(`
        UPDATE depcred
        SET dobanda = ?,
            impr_deb = ?,
            impr_cred = ?,
            dep_deb = ?,
            dep_cred = ?
        WHERE nr_fisa = ? AND luna = ? AND anul = ?
      `, [
        dobanda.toNumber(),
        impr_deb.toNumber(),
        impr_cred.toNumber(),
        dep_deb.toNumber(),
        dep_cred.toNumber(),
        membruInfo.nr_fisa,
        tranzactie.luna,
        tranzactie.anul
      ]);

      // Actualizare cotizație standard în MEMBRII.db dacă s-a modificat
      if (!dep_deb.equals(membruInfo.cotizatie_standard)) {
        getActiveDB(databases, 'membrii').run(`
          UPDATE membrii
          SET COTIZATIE_STANDARD = ?
          WHERE NR_FISA = ?
        `, [dep_deb.toNumber(), membruInfo.nr_fisa]);
      }

      // Recalculare lunilor ulterioare
      await recalculeazaLuniUlterioare(
        databases,
        membruInfo.nr_fisa,
        tranzactie.luna,
        tranzactie.anul,
        rataDobanda
      );

      // Success
      onSave({
        ...tranzactie,
        dobanda,
        impr_deb,
        impr_cred,
        dep_deb,
        dep_cred
      });
    } catch (err) {
      console.error("Eroare salvare tranzacție:", err);
      setError(`Eroare la salvare: ${err}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Modificare Tranzacție - {formatLunaAn(tranzactie.luna, tranzactie.anul)}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="w-4 h-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Informații Membru */}
          <div className="bg-slate-50 p-3 rounded text-sm">
            <div className="font-semibold">{membruInfo.nume}</div>
            <div className="text-slate-600">Fișa: {membruInfo.nr_fisa}</div>
          </div>

          {/* Calculator Rată */}
          <Card className="bg-blue-50 border-blue-300">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Calculator className="w-4 h-4" />
                Calculator Rată Lunară
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs font-semibold">Sumă Împrumut:</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={calcImprumut}
                    onChange={(e) => setCalcImprumut(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold">Nr. Luni:</label>
                  <Input
                    type="number"
                    value={calcLuni}
                    onChange={(e) => setCalcLuni(e.target.value)}
                    placeholder="12"
                  />
                </div>
                <div className="flex items-end">
                  <Button onClick={handleCalculeazaRata} className="w-full" size="sm">
                    Calculează
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Formular Modificare */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Împrumuturi */}
            <div className="space-y-3">
              <h3 className="font-semibold text-blue-800 border-b border-blue-300 pb-1">
                ÎMPRUMUTURI
              </h3>

              <div>
                <label className="text-sm font-semibold">Dobândă:</label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.dobanda}
                  onChange={(e) => setFormData(prev => ({ ...prev, dobanda: e.target.value }))}
                />
              </div>

              <div>
                <label className="text-sm font-semibold">Împrumut (Debit):</label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.impr_deb}
                  onChange={(e) => setFormData(prev => ({ ...prev, impr_deb: e.target.value }))}
                />
              </div>

              <div>
                <label className="text-sm font-semibold">Rată Achitată (Credit):</label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.impr_cred}
                  onChange={(e) => setFormData(prev => ({ ...prev, impr_cred: e.target.value }))}
                />
              </div>

              <div className="bg-blue-100 p-2 rounded">
                <div className="text-xs text-slate-600">Sold Împrumut Curent:</div>
                <div className="font-bold text-blue-800">
                  {formatCurrency(tranzactie.impr_sold)} {currency}
                </div>
              </div>
            </div>

            {/* Depuneri */}
            <div className="space-y-3">
              <h3 className="font-semibold text-purple-800 border-b border-purple-300 pb-1">
                DEPUNERI
              </h3>

              <div>
                <label className="text-sm font-semibold">Cotizație (Debit):</label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.dep_deb}
                  onChange={(e) => setFormData(prev => ({ ...prev, dep_deb: e.target.value }))}
                />
              </div>

              <div>
                <label className="text-sm font-semibold">Retragere (Credit):</label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.dep_cred}
                  onChange={(e) => setFormData(prev => ({ ...prev, dep_cred: e.target.value }))}
                />
              </div>

              <div className="bg-purple-100 p-2 rounded">
                <div className="text-xs text-slate-600">Sold Depuneri Curent:</div>
                <div className="font-bold text-purple-800">
                  {formatCurrency(tranzactie.dep_sold)} {currency}
                </div>
              </div>
            </div>
          </div>

          {/* Info Box */}
          <Alert>
            <Info className="w-4 h-4" />
            <AlertDescription className="text-xs">
              Modificările vor declanșa recalcularea automată a tuturor lunilor ulterioare.
              Soldurile vor fi actualizate conform formulei: sold_nou = sold_vechi + debit - credit
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter>
          <Button onClick={onClose} variant="outline" disabled={saving}>
            Anulează
          </Button>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Salvează Modificările
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ==========================================
// FUNCȚII BUSINESS LOGIC
// ==========================================

/**
 * Recalculează soldurile pentru toate lunile ulterioare unei modificări
 */
async function recalculeazaLuniUlterioare(
  databases: DBSet,
  nr_fisa: number,
  luna_start: number,
  anul_start: number,
  rata_dobanda: Decimal
): Promise<void> {
  try {
    const dbDepcred = getActiveDB(databases, 'depcred');

    // Citește toate tranzacțiile pentru acest membru, ordonate cronologic
    const result = dbDepcred.exec(`
      SELECT luna, anul, dobanda, impr_deb, impr_cred, impr_sold, dep_deb, dep_cred, dep_sold
      FROM depcred
      WHERE nr_fisa = ?
      ORDER BY anul ASC, luna ASC
    `, [nr_fisa]);

    if (result.length === 0) return;

    const tranzactii = result[0].values.map(row => ({
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

    // Găsește indexul lunii modificate
    const idxStart = tranzactii.findIndex(
      t => t.anul === anul_start && t.luna === luna_start
    );

    if (idxStart === -1) return;

    // CRITCAL FIX: Recalculează ÎNTÂI luna editată (idxStart),
    // apoi lunile ulterioare (idxStart + 1, idxStart + 2, ...)
    // Fără asta, luna editată păstrează sold-ul vechi și toate lunile ulterioare pornesc de la valori stale!
    for (let i = idxStart; i < tranzactii.length; i++) {
      // Pentru luna editată (i === idxStart), avem nevoie de luna anterioară
      if (i === 0) {
        // Prima lună din istoric - soldurile sunt deja corecte (calculate la adăugare)
        continue;
      }

      const tranzPrev = tranzactii[i - 1];
      const tranzCurr = tranzactii[i];

      // Calcul sold împrumut: sold_vechi + împrumut_nou - rată_achitată
      let sold_impr = tranzPrev.impr_sold
        .plus(tranzCurr.impr_deb)
        .minus(tranzCurr.impr_cred);

      // Zeroizare solduri < 0.005
      if (sold_impr.lessThan(PRAG_ZEROIZARE)) {
        sold_impr = new Decimal("0");
      }

      // Calcul sold depuneri: sold_vechi + cotizație - retragere
      let sold_dep = tranzPrev.dep_sold
        .plus(tranzCurr.dep_deb)
        .minus(tranzCurr.dep_cred);

      if (sold_dep.lessThan(PRAG_ZEROIZARE)) {
        sold_dep = new Decimal("0");
      }

      dbDepcred.run(`
        UPDATE depcred
        SET impr_sold = ?, dep_sold = ?
        WHERE nr_fisa = ? AND luna = ? AND anul = ?
      `, [
        sold_impr.toNumber(),
        sold_dep.toNumber(),
        nr_fisa,
        tranzCurr.luna,
        tranzCurr.anul
      ]);

      // Update în array pentru următoarea iterație
      tranzactii[i].impr_sold = sold_impr;
      tranzactii[i].dep_sold = sold_dep;
    }
  } catch (error) {
    console.error("Eroare recalculare luni ulterioare:", error);
    throw error;
  }
}

/**
 * Calculează dobânda acumulată pentru un împrumut EXACT ca în Python
 *
 * Algoritm:
 * 1. Determină perioada START (ultima lună cu împrumut acordat sau ultima lună cu sold zero)
 * 2. Sumează TOATE soldurile pozitive din perioada [start, end]
 * 3. Aplică rata dobânzii: dobanda = SUM(solduri) × rata
 */
function calculeazaDobandaLaZi(
  databases: DBSet,
  nr_fisa: number,
  end_luna: number,
  end_anul: number,
  rata_dobanda: Decimal
): Decimal {
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
      return new Decimal("0");
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
      return new Decimal("0");
    }

    const sum_of_balances = new Decimal(String(resultSum[0].values[0][0]));

    // ========================================
    // PASUL 3: Aplică rata dobânzii
    // ========================================

    const dobanda_calculata = sum_of_balances
      .times(rata_dobanda)
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

    console.log(`[Calcul Dobândă] Nr.Fișă=${nr_fisa}, Perioada=${start_period_val}-${end_period_val}, Suma Solduri=${sum_of_balances.toFixed(2)}, Dobândă=${dobanda_calculata.toFixed(2)}`);

    return dobanda_calculata;

  } catch (error) {
    console.error(`Eroare calcul dobândă pentru ${nr_fisa}:`, error);
    throw error;
  }
}

/**
 * Helper pentru formatare lună-an
 */
function formatLunaAn(luna: number, anul: number): string {
  return `${String(luna).padStart(2, "0")}-${anul}`;
}
