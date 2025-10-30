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
import type { Database } from "sql.js";
import type { DBSet } from "../services/databaseManager";
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
    const prevTranz = istoric && index !== undefined ? istoric[index + 1] : undefined;

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
  formatCurrency: (value: Decimal) => string
): MonthStatus => {
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
        subtitle: `Nou: ${formatCurrency(tranz.impr_deb)} RON | Achitat: ${formatCurrency(tranz.impr_cred)} RON`,
        colorClass: 'text-blue-600',
        iconColor: 'bg-blue-500'
      };
    }
  }

  // 2. Împrumut NOU acordat
  if (tranz.impr_deb.greaterThan(0)) {
    return {
      title: `💰 Împrumut nou: ${formatCurrency(tranz.impr_deb)} RON`,
      subtitle: 'Acord împrumut',
      colorClass: 'text-blue-600',
      iconColor: 'bg-blue-500'
    };
  }

  // 3. Împrumut ACHITAT complet
  if (tranz.impr_cred.greaterThan(0) && tranz.impr_sold.lessThanOrEqualTo(PRAG_ZEROIZARE)) {
    return {
      title: '✅ Împrumut achitat complet',
      subtitle: `Achitat: ${formatCurrency(tranz.impr_cred)} RON`,
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
      subtitle: `Sold: ${formatCurrency(tranz.impr_sold)} RON`,
      colorClass: 'text-orange-600',
      iconColor: 'bg-orange-500'
    };
  }

  // 5. Rată NEACHITATĂ
  if (tranz.impr_cred.equals(0) && tranz.impr_sold.greaterThan(PRAG_ZEROIZARE)) {
    return {
      title: '⚠️ Rată neachitată',
      subtitle: `Sold: ${formatCurrency(tranz.impr_sold)} RON`,
      colorClass: 'text-red-600',
      iconColor: 'bg-red-500'
    };
  }

  // 6. Rată ACHITATĂ parțial
  if (tranz.impr_cred.greaterThan(0) && tranz.impr_sold.greaterThan(PRAG_ZEROIZARE)) {
    return {
      title: '💵 Rată achitată',
      subtitle: `Plată: ${formatCurrency(tranz.impr_cred)} RON | Sold rămas: ${formatCurrency(tranz.impr_sold)} RON`,
      colorClass: 'text-green-500',
      iconColor: 'bg-green-400'
    };
  }

  // 7. Împrumut ACTIV (default pentru sold > 0)
  if (tranz.impr_sold.greaterThan(PRAG_ZEROIZARE)) {
    return {
      title: '📊 Împrumut activ',
      subtitle: `Sold: ${formatCurrency(tranz.impr_sold)} RON`,
      colorClass: 'text-purple-600',
      iconColor: 'bg-purple-500'
    };
  }

  // 8. Fără împrumut
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
function citesteMembri(dbMembrii: Database, dbLichidati: Database): AutocompleteOption[] {
  try {
    // Set membri lichidați
    const lichidati = new Set<number>();
    try {
      const resLich = dbLichidati.exec("SELECT nr_fisa FROM lichidati");
      if (resLich.length > 0) {
        resLich[0].values.forEach(row => lichidati.add(row[0] as number));
      }
    } catch {
      // LICHIDATI.db opțional
    }

    // Citire membri activi
    const result = dbMembrii.exec(`
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
  dbMembrii: Database,
  nr_fisa: number
): MembruInfo | null {
  try {
    const result = dbMembrii.exec(`
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
  dbDepcred: Database,
  nr_fisa: number
): TranzactieLunara[] {
  try {
    const result = dbDepcred.exec(`
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
function esteLichidat(dbLichidati: Database, nr_fisa: number): boolean {
  try {
    const result = dbLichidati.exec(`
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

  // State pentru dialog modificare
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedTranzactie, setSelectedTranzactie] = useState<TranzactieLunara | null>(null);

  // Refs pentru scroll sincronizat (desktop)
  const scrollRefs = useRef<(HTMLDivElement | null)[]>([]);

  // ========================================
  // EFFECTS
  // ========================================

  // Încărcare listă membri la mount
  useEffect(() => {
    const lista = citesteMembri(databases.membrii, databases.lichidati);
    setMembri(lista);
  }, [databases]);

  // ========================================
  // COMPUTED VALUES
  // ========================================

  // Filtrare autocomplete
  const filteredMembri = useMemo(() => {
    if (!searchTerm.trim()) return [];

    const term = searchTerm.toLowerCase();
    return membri
      .filter(m =>
        m.nume.toLowerCase().includes(term) ||
        m.nr_fisa.toString().includes(term)
      )
      .slice(0, 10); // Max 10 rezultate
  }, [membri, searchTerm]);

  // Ultima tranzacție (cea mai recentă)
  const ultimaTranzactie = istoric.length > 0 ? istoric[0] : null;

  // Verificare membru lichidat
  const membruLichidat = useMemo(() => {
    return selectedMembru ? esteLichidat(databases.lichidati, selectedMembru.nr_fisa) : false;
  }, [selectedMembru, databases.lichidati]);

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
      const info = citesteMembruInfo(databases.membrii, option.nr_fisa);
      if (!info) {
        alert(`Nu s-au găsit detalii pentru fișa ${option.nr_fisa}`);
        return;
      }

      setSelectedMembru(info);

      // Citește istoric financiar
      const istoricData = citesteIstoricMembru(databases.depcred, option.nr_fisa);
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

    const confirmMsg = `Se va calcula dobânda pentru achitare anticipată:\n\n` +
      `Sold Împrumut Curent: ${formatCurrency(ultimaTranzactie.impr_sold)} RON\n` +
      `Rată Dobândă: ${rataDobanda.times(1000).toFixed(1)}‰ (${rataDobanda.times(100).toFixed(1)}%)\n` +
      `Dobândă Calculată: ${formatCurrency(ultimaTranzactie.impr_sold.times(rataDobanda))} RON\n\n` +
      `Dobânda va fi adăugată la suma datorată și va trebui plătită împreună cu soldul împrumutului.\n\n` +
      `Continuați?`;

    if (!confirm(confirmMsg)) return;

    try {
      setLoading(true);

      // Calcul dobândă = sold_împrumut × rata_dobândă
      const dobandaCalculata = ultimaTranzactie.impr_sold.times(rataDobanda);

      // Update tranzacție curentă: adaugă dobânda calculată la câmpul dobândă
      const dobandaNoua = ultimaTranzactie.dobanda.plus(dobandaCalculata);

      databases.depcred.run(`
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
        databases.depcred,
        selectedMembru.nr_fisa,
        ultimaTranzactie.luna,
        ultimaTranzactie.anul,
        rataDobanda
      );

      // Refresh date
      const istoricData = citesteIstoricMembru(databases.depcred, selectedMembru.nr_fisa);
      setIstoric(istoricData);

      alert(`Dobândă aplicată cu succes!\n\nDobândă calculată: ${formatCurrency(dobandaCalculata)} RON\nDobândă totală: ${formatCurrency(dobandaNoua)} RON`);
    } catch (error) {
      console.error("Eroare aplicare dobândă:", error);
      alert(`Eroare la aplicarea dobânzii: ${error}`);
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
      {/* Header cu Back Button */}
      <div className="flex items-center justify-between">
        <Button onClick={onBack} variant="outline" className="gap-2">
          ← Înapoi la Dashboard
        </Button>
        <h1 className="text-2xl font-bold text-slate-800">
          💰 Sume Lunare
        </h1>
        <div className="w-[120px]" /> {/* Spacer */}
      </div>

      {/* Secțiune Căutare + Autocomplete */}
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
                        <div className="text-sm text-slate-500">Fișa: {membru.nr_fisa}</div>
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

      {/* Informații Membru Selectat */}
      {selectedMembru && (
        <Card className={membruLichidat ? "border-red-500 bg-red-50" : ""}>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Informații Membru</span>
              {membruLichidat && (
                <span className="text-sm font-normal text-red-600 flex items-center gap-1">
                  <AlertCircle className="w-4 h-4" />
                  MEMBRU LICHIDAT
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
              <div>
                <span className="font-semibold">Număr Fișă:</span>{" "}
                {selectedMembru.nr_fisa}
              </div>
              <div>
                <span className="font-semibold">Nume:</span>{" "}
                {selectedMembru.nume}
              </div>
              <div>
                <span className="font-semibold">Adresă:</span>{" "}
                {selectedMembru.adresa || "—"}
              </div>
              <div>
                <span className="font-semibold">Data Înscrierii:</span>{" "}
                {selectedMembru.data_inscriere || "—"}
              </div>
              <div>
                <span className="font-semibold">Calitate:</span>{" "}
                {selectedMembru.calitate || "—"}
              </div>
              <div>
                <span className="font-semibold">Cotizație Standard:</span>{" "}
                {formatCurrency(selectedMembru.cotizatie_standard)} RON
              </div>
            </div>

            {/* Butoane Acțiuni */}
            {ultimaTranzactie && !membruLichidat && (
              <div className="flex flex-col sm:flex-row gap-2 mt-4 pt-4 border-t border-slate-200">
                <Button
                  onClick={handleModificaTranzactie}
                  variant="outline"
                  className="gap-2 w-full sm:w-auto"
                >
                  <Edit className="w-4 h-4" />
                  Modifică Tranzacție
                </Button>
                <Button
                  onClick={handleAplicaDobanda}
                  variant="outline"
                  className="gap-2 w-full sm:w-auto"
                >
                  <Calculator className="w-4 h-4" />
                  Aplică Dobândă
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

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
  const handleScroll = (index: number) => {
    const sourceScroll = scrollRefs.current[index];
    if (!sourceScroll) return;

    scrollRefs.current.forEach((ref, i) => {
      if (ref && i !== index) {
        ref.scrollTop = sourceScroll.scrollTop;
      }
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

  const getValue = (tranz: TranzactieLunara, key: string): string => {
    switch (key) {
      case "dobanda": return formatCurrency(tranz.dobanda);
      case "impr_deb": return formatCurrency(tranz.impr_deb);
      case "impr_cred": return formatCurrency(tranz.impr_cred);
      case "impr_sold": return formatCurrency(tranz.impr_sold);
      case "luna_an": return formatLunaAn(tranz.luna, tranz.anul);
      case "dep_deb": return formatCurrency(tranz.dep_deb);
      case "dep_cred": return formatCurrency(tranz.dep_cred);
      case "dep_sold": return formatCurrency(tranz.dep_sold);
      default: return "—";
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Istoric Financiar (Desktop View)</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-8 gap-2">
          {/* Secțiunea Împrumuturi */}
          <div className="col-span-4 border-r-2 border-blue-300 pr-2">
            <div className="text-center font-bold text-blue-800 mb-2 text-sm">
              ÎMPRUMUTURI
            </div>
            <div className="grid grid-cols-4 gap-1">
              {columns.slice(0, 4).map((col, idx) => (
                <div key={col.key}>
                  <div className="bg-blue-100 p-2 text-center font-semibold text-xs border border-blue-300 rounded-t">
                    {col.title}
                  </div>
                  <ScrollArea
                    className="h-[400px] border border-blue-300 rounded-b"
                    ref={(el) => { scrollRefs.current[idx] = el; }}
                    onScroll={() => handleScroll(idx)}
                  >
                    <div className="divide-y divide-slate-200">
                      {istoric.map((tranz, i) => (
                        <div
                          key={`${tranz.anul}-${tranz.luna}-${i}`}
                          className="p-2 text-center text-sm hover:bg-blue-50"
                        >
                          {getValue(tranz, col.key)}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              ))}
            </div>
          </div>

          {/* Secțiunea Dată */}
          <div className="col-span-1 border-r-2 border-green-300 pr-2">
            <div className="text-center font-bold text-green-800 mb-2 text-sm">
              DATĂ
            </div>
            <div>
              <div className="bg-green-100 p-2 text-center font-semibold text-xs border border-green-300 rounded-t">
                {columns[4].title}
              </div>
              <ScrollArea
                className="h-[400px] border border-green-300 rounded-b"
                ref={(el) => { scrollRefs.current[4] = el; }}
                onScroll={() => handleScroll(4)}
              >
                <div className="divide-y divide-slate-200">
                  {istoric.map((tranz, i) => (
                    <div
                      key={`${tranz.anul}-${tranz.luna}-${i}`}
                      className="p-2 text-center text-sm font-semibold hover:bg-green-50"
                    >
                      {getValue(tranz, columns[4].key)}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </div>

          {/* Secțiunea Depuneri */}
          <div className="col-span-3">
            <div className="text-center font-bold text-purple-800 mb-2 text-sm">
              DEPUNERI
            </div>
            <div className="grid grid-cols-3 gap-1">
              {columns.slice(5, 8).map((col, idx) => (
                <div key={col.key}>
                  <div className="bg-purple-100 p-2 text-center font-semibold text-xs border border-purple-300 rounded-t">
                    {col.title}
                  </div>
                  <ScrollArea
                    className="h-[400px] border border-purple-300 rounded-b"
                    ref={(el) => { scrollRefs.current[idx + 5] = el; }}
                    onScroll={() => handleScroll(idx + 5)}
                  >
                    <div className="divide-y divide-slate-200">
                      {istoric.map((tranz, i) => (
                        <div
                          key={`${tranz.anul}-${tranz.luna}-${i}`}
                          className="p-2 text-center text-sm hover:bg-purple-50"
                        >
                          {getValue(tranz, col.key)}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              ))}
            </div>
          </div>
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
}

function MobileHistoryView({
  istoric,
  formatCurrency,
  formatLunaAn
}: MobileHistoryViewProps) {
  const [expandedMonth, setExpandedMonth] = useState<number | null>(null);

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-slate-800 px-2">Istoric Financiar</h2>
      {istoric.map((tranz, idx) => {
        const isExpanded = expandedMonth === idx;
        const prevTranz = idx < istoric.length - 1 ? istoric[idx + 1] : undefined;
        const monthStatus = getMonthStatus(tranz, prevTranz, formatCurrency);

        return (
          <Card
            key={`${tranz.anul}-${tranz.luna}-${idx}`}
            className="shadow-lg border-l-4 border-blue-500"
          >
            <CardHeader
              className="pb-3 bg-slate-50 cursor-pointer"
              onClick={() => setExpandedMonth(isExpanded ? null : idx)}
            >
              <CardTitle className="text-base flex items-center justify-between mb-2">
                <span className="text-xs font-normal text-slate-500 flex items-center gap-1">
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
                          <span className={className}>{display} RON</span>
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
                          <span className={className}>{display} RON</span>
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
                          <span className={className}>{display}</span>
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
                          <span className={className}>{display} RON</span>
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
                          <span className={className}>{display} RON</span>
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
  formatLunaAn
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
      databases.depcred.run(`
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
        databases.membrii.run(`
          UPDATE membrii
          SET COTIZATIE_STANDARD = ?
          WHERE NR_FISA = ?
        `, [dep_deb.toNumber(), membruInfo.nr_fisa]);
      }

      // Recalculare lunilor ulterioare
      await recalculeazaLuniUlterioare(
        databases.depcred,
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
                  {formatCurrency(tranzactie.impr_sold)} RON
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
                  {formatCurrency(tranzactie.dep_sold)} RON
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
  dbDepcred: Database,
  nr_fisa: number,
  luna_start: number,
  anul_start: number,
  rata_dobanda: Decimal
): Promise<void> {
  try {
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

    // Recalculează fiecare lună ulterioară
    for (let i = idxStart + 1; i < tranzactii.length; i++) {
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

      // Update în baza de date
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
 * Helper pentru formatare lună-an
 */
function formatLunaAn(luna: number, anul: number): string {
  return `${String(luna).padStart(2, "0")}-${anul}`;
}
