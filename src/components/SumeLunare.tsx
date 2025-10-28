// src/components/SumeLunare.tsx
/**
 * Modul Sume Lunare - Port complet din sume_lunare.py (2750 linii) cu toate îmbunătățirile
 * 
 * ÎMBUNĂTĂȚIRI ADĂUGATE:
 * 1. ✅ Calcul corect dobândă (suma soldurilor pozitive din toate lunile)
 * 2. ✅ Formatare avansată pentru mobile (evidențiere condițională)
 * 3. ✅ Sincronizare scroll îmbunătățită pentru desktop
 * 4. ✅ Logică completă pentru "!NOU!" și "Neachitat!"
 * 5. ✅ Validări complexe ca în Python
 */

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import Decimal from "decimal.js";
import type { Database } from "sql.js";
import type { DBSet } from "../services/databaseManager";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/buttons";
import { Input } from "./ui/input";
import { ScrollArea } from "./ui/scroll-area";
import { Alert, AlertDescription } from "./ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import {
  Loader2,
  Search,
  X,
  Edit,
  Calculator,
  RotateCcw,
  Info,
  AlertCircle,
  ChevronDown,
  Calendar
} from "lucide-react";
import { Fragment } from "react";

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

const PRAG_ZEROIZARE = new Decimal("0.005");
const RATA_DOBANDA_DEFAULT = new Decimal("0.004");

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
  display: string;
}

// ==========================================
// HELPER FUNCTIONS - DATABASE
// ==========================================

function citesteMembri(dbMembrii: Database, dbLichidati: Database): AutocompleteOption[] {
  try {
    const lichidati = new Set<number>();
    try {
      const resLich = dbLichidati.exec("SELECT nr_fisa FROM lichidati");
      if (resLich.length > 0) {
        resLich[0].values.forEach(row => lichidati.add(row[0] as number));
      }
    } catch {}

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

function esteLichidat(dbLichidati: Database, nr_fisa: number): boolean {
  try {
    const result = dbLichidati.exec(`
      SELECT COUNT(*) as cnt FROM lichidati WHERE nr_fisa = ?
    `, [nr_fisa]);

    return result.length > 0 && (result[0].values[0][0] as number) > 0;
  } catch {
    return false;
  }
}

// ==========================================
// HOOK PENTRU SCROLL SINCRONIZAT
// ==========================================

const useSynchronizedScroll = () => {
  const [scrollElements, setScrollElements] = useState<(HTMLDivElement | null)[]>([]);
  const isScrolling = useRef(false);

  const registerScrollElement = useCallback((element: HTMLDivElement | null, index: number) => {
    if (element) {
      setScrollElements(prev => {
        const newArray = [...prev];
        newArray[index] = element;
        return newArray;
      });
    }
  }, []);

  const handleScroll = useCallback((index: number, event: React.UIEvent<HTMLDivElement>) => {
    if (isScrolling.current) return;
    
    isScrolling.current = true;
    
    const sourceElement = scrollElements[index];
    if (!sourceElement) {
      isScrolling.current = false;
      return;
    }

    const scrollTop = sourceElement.scrollTop;
    const scrollHeight = sourceElement.scrollHeight;
    const clientHeight = sourceElement.clientHeight;

    const scrollPercentage = scrollTop / (scrollHeight - clientHeight);

    scrollElements.forEach((element, i) => {
      if (element && i !== index && element !== sourceElement) {
        const targetScrollTop = scrollPercentage * (element.scrollHeight - element.clientHeight);
        element.scrollTo({
          top: targetScrollTop,
          behavior: 'auto'
        });
      }
    });

    setTimeout(() => {
      isScrolling.current = false;
    }, 10);
  }, [scrollElements]);

  return { registerScrollElement, handleScroll };
};

// ==========================================
// FUNCȚII FORMATARE AVANSATĂ (EXACT CA ÎN PYTHON)
// ==========================================

/**
 * Formatare avansată cu evidențiere condițională (EXACT ca în Python)
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
    // Găsește tranzacția anterioară pentru logică condițională
    const prevTranz = istoric && index !== undefined ? istoric[index + 1] : undefined;

    switch (key) {
      case 'dobanda':
        // Dobândă - evidențiată dacă > 0
        if (tranz.dobanda.greaterThan(0)) {
          return {
            display: formatCurrency(tranz.dobanda),
            className: 'text-purple-600 font-semibold'
          };
        }
        return {
          display: formatCurrency(tranz.dobanda),
          className: 'text-slate-600'
        };

      case 'impr_deb':
        // Împrumut nou - albastru îngroșat (EXACT ca în Python)
        if (tranz.impr_deb.greaterThan(0)) {
          return {
            display: formatCurrency(tranz.impr_deb),
            className: 'text-blue-600 font-bold'
          };
        }
        return {
          display: formatCurrency(tranz.impr_deb),
          className: 'text-slate-600'
        };

      case 'impr_cred':
        // Rata achitată - logică complexă pentru "!NOU!" și "Neachitat!" (EXACT ca în Python)
        if (tranz.impr_cred.equals(0) && tranz.impr_sold.greaterThan(PRAG_ZEROIZARE)) {
          // Verifică dacă este prima lună după contractare
          const isFirstMonthAfterLoan = prevTranz && 
            prevTranz.impr_deb.greaterThan(0);
          
          if (isFirstMonthAfterLoan) {
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
        
        // Achitare completă - verde (EXACT ca în Python)
        if (tranz.impr_cred.greaterThan(0) && tranz.impr_sold.lessThanOrEqualTo(PRAG_ZEROIZARE)) {
          return {
            display: formatCurrency(tranz.impr_cred),
            className: 'text-green-600 font-bold'
          };
        }
        
        return {
          display: formatCurrency(tranz.impr_cred),
          className: 'text-slate-600'
        };

      case 'impr_sold':
        // Sold împrumut - verde dacă achitat (EXACT ca în Python)
        if (tranz.impr_sold.lessThanOrEqualTo(PRAG_ZEROIZARE)) {
          return {
            display: 'Achitat',
            className: 'text-green-600 font-bold'
          };
        }
        
        // Caz special: achitare și împrumut nou în aceeași lună (EXACT ca în Python)
        if (tranz.impr_deb.greaterThan(0) && tranz.impr_cred.greaterThan(0) && prevTranz) {
          const expectedOldSold = prevTranz.impr_sold.minus(tranz.impr_cred);
          if (expectedOldSold.lessThanOrEqualTo(PRAG_ZEROIZARE)) {
            return {
              display: 'Achitat',
              className: 'text-green-600 font-bold'
            };
          }
        }
        
        return {
          display: formatCurrency(tranz.impr_sold),
          className: 'text-blue-700 font-bold'
        };

      case 'luna_an':
        return {
          display: formatLunaAn(tranz.luna, tranz.anul),
          className: 'font-bold text-slate-800'
        };

      case 'dep_deb':
        // Cotizație neachitată - roșu (EXACT ca în Python)
        if (tranz.dep_deb.equals(0) && prevTranz && prevTranz.dep_sold.greaterThan(PRAG_ZEROIZARE)) {
          return {
            display: 'Neachitat!',
            className: 'text-red-600 font-bold'
          };
        }
        return {
          display: formatCurrency(tranz.dep_deb),
          className: 'text-slate-600'
        };

      case 'dep_cred':
        return {
          display: formatCurrency(tranz.dep_cred),
          className: 'text-slate-600'
        };

      case 'dep_sold':
        return {
          display: formatCurrency(tranz.dep_sold),
          className: 'text-purple-700 font-bold'
        };

      default:
        return {
          display: formatCurrency(tranz[key as keyof TranzactieLunara] as Decimal),
          className: 'text-slate-600'
        };
    }
  } catch (error) {
    console.error(`Eroare getFormattedValue pentru key=${key}:`, error, tranz);
    return {
      display: '—',
      className: 'text-red-500'
    };
  }
};

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

  // Hook pentru scroll sincronizat
  const { registerScrollElement, handleScroll } = useSynchronizedScroll();

  // ========================================
  // EFFECTS
  // ========================================

  useEffect(() => {
    const lista = citesteMembri(databases.membrii, databases.lichidati);
    setMembri(lista);
  }, [databases]);

  // ========================================
  // COMPUTED VALUES
  // ========================================

  const filteredMembri = useMemo(() => {
    if (!searchTerm.trim()) return [];

    const term = searchTerm.toLowerCase();
    return membri
      .filter(m =>
        m.nume.toLowerCase().includes(term) ||
        m.nr_fisa.toString().includes(term)
      )
      .slice(0, 10);
  }, [membri, searchTerm]);

  const ultimaTranzactie = istoric.length > 0 ? istoric[0] : null;

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
    console.log("[SumeLunare] Selectare membru:", option);
    setLoading(true);
    setSearchTerm(option.display);
    setShowAutocomplete(false);

    try {
      const info = citesteMembruInfo(databases.membrii, option.nr_fisa);
      console.log("[SumeLunare] Info membru încărcat:", info);

      if (!info) {
        alert(`Nu s-au găsit detalii pentru fișa ${option.nr_fisa}`);
        return;
      }

      setSelectedMembru(info);

      const istoricData = citesteIstoricMembru(databases.depcred, option.nr_fisa);
      console.log("[SumeLunare] Istoric încărcat:", istoricData.length, "tranzacții");
      setIstoric(istoricData);

      if (istoricData.length === 0) {
        alert(`Membrul ${info.nume} nu are istoric financiar înregistrat.`);
      }
    } catch (error) {
      console.error("[SumeLunare] Eroare încărcare membru:", error);
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

    if (ultimaTranzactie.impr_sold.lessThanOrEqualTo(0)) {
      alert("Membrul nu are împrumuturi active. Soldul împrumutului este 0.");
      return;
    }

    try {
      setLoading(true);

      // ✅ CALCUL CORECT: exact ca în Python - cu determinarea intervalului corect
      const dobandaCalculata = calculateDobandaLaZi(istoric, rataDobanda);
      
      if (dobandaCalculata.lessThanOrEqualTo(0)) {
        alert("Nu s-a putut calcula dobânda. Verificați istoricul împrumuturilor.");
        return;
      }

      const dobandaNoua = ultimaTranzactie.dobanda.plus(dobandaCalculata);
      
      // Pregătim tranzacția pentru dialog cu dobânda calculată și achitare completă
      const tranzactieCuDobanda = {
        ...ultimaTranzactie,
        dobanda: dobandaNoua,
        impr_cred: ultimaTranzactie.impr_sold.plus(ultimaTranzactie.impr_cred)
      };
      
      setSelectedTranzactie(tranzactieCuDobanda);
      setDialogOpen(true);
      
      alert(`Dobânda a fost calculată: ${formatCurrency(dobandaCalculata)} RON\n\nDialogul va fi deschis cu dobânda calculată și suma necesară pentru achitarea completă a împrumutului.`);
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
    if (value instanceof Decimal) {
      return value.toFixed(2);
    }
    return new Decimal(value || 0).toFixed(2);
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
        <div className="w-[120px]" />
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
                <span className="font-semibold">Număr Fișă:</span> {selectedMembru.nr_fisa}
              </div>
              <div>
                <span className="font-semibold">Nume:</span> {selectedMembru.nume}
              </div>
              <div>
                <span className="font-semibold">Adresă:</span> {selectedMembru.adresa || "—"}
              </div>
              <div>
                <span className="font-semibold">Data Înscrierii:</span> {selectedMembru.data_inscriere || "—"}
              </div>
              <div>
                <span className="font-semibold">Calitate:</span> {selectedMembru.calitate || "—"}
              </div>
              <div>
                <span className="font-semibold">Cotizație Standard:</span> {formatCurrency(selectedMembru.cotizatie_standard)} RON
              </div>
            </div>

            {/* Butoane Acțiuni */}
            {ultimaTranzactie && !membruLichidat && (
              <div className="flex gap-2 mt-4 pt-4 border-t border-slate-200">
                <Button
                  onClick={handleModificaTranzactie}
                  variant="outline"
                  className="gap-2"
                >
                  <Edit className="w-4 h-4" />
                  Modifică Tranzacție
                </Button>
                <Button
                  onClick={handleAplicaDobanda}
                  variant="outline"
                  className="gap-2"
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
            registerScrollElement={registerScrollElement}
            handleScroll={handleScroll}
            formatCurrency={formatCurrency}
            formatLunaAn={formatLunaAn}
          />
        </div>
      )}

      {/* Istoric Financiar - Mobile (<1024px) */}
      {selectedMembru && istoric.length > 0 && (
        <div className="lg:hidden">
          <MobileHistoryViewEnhanced
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
          onSave={(nouaTranzactie) => {
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

interface DesktopHistoryViewProps {
  istoric: TranzactieLunara[];
  registerScrollElement: (element: HTMLDivElement | null, index: number) => void;
  handleScroll: (index: number, event: React.UIEvent<HTMLDivElement>) => void;
  formatCurrency: (value: Decimal) => string;
  formatLunaAn: (luna: number, anul: number) => string;
}

function DesktopHistoryView({
  istoric,
  registerScrollElement,
  handleScroll,
  formatCurrency,
  formatLunaAn
}: DesktopHistoryViewProps) {
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
        <CardTitle>Istoric Financiar - Scroll Sincronizat</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-8 gap-1">
          {/* Secțiunea Împrumuturi */}
          <div className="col-span-4 border-r-2 border-blue-300 pr-2">
            <div className="text-center font-bold text-blue-800 mb-2 text-sm">
              ÎMPRUMUTURI
            </div>
            <div className="grid grid-cols-4 gap-1">
              {columns.slice(0, 4).map((col, idx) => (
                <div key={col.key} className="flex flex-col">
                  <div className="bg-blue-100 p-2 text-center font-semibold text-xs border border-blue-300 rounded-t">
                    {col.title}
                  </div>
                  <div 
                    className="h-[400px] overflow-auto border border-blue-300 rounded-b bg-white"
                    ref={(el) => registerScrollElement(el, idx)}
                    onScroll={(e) => handleScroll(idx, e)}
                  >
                    <div className="divide-y divide-slate-100">
                      {istoric.map((tranz, i) => {
                        const { display, className } = getFormattedValue(
                          tranz, 
                          col.key, 
                          formatCurrency, 
                          formatLunaAn,
                          istoric,
                          i
                        );
                        
                        return (
                          <div
                            key={`${tranz.anul}-${tranz.luna}-${i}`}
                            className={`p-2 text-center text-sm hover:bg-blue-50 transition-colors ${i % 2 === 0 ? 'bg-slate-50' : 'bg-white'}`}
                          >
                            <span className={className}>{display}</span>
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
          <div className="col-span-1 border-r-2 border-green-300 pr-2">
            <div className="text-center font-bold text-green-800 mb-2 text-sm">
              DATĂ
            </div>
            <div className="flex flex-col">
              <div className="bg-green-100 p-2 text-center font-semibold text-xs border border-green-300 rounded-t">
                {columns[4].title}
              </div>
              <div 
                className="h-[400px] overflow-auto border border-green-300 rounded-b bg-white"
                ref={(el) => registerScrollElement(el, 4)}
                onScroll={(e) => handleScroll(4, e)}
              >
                <div className="divide-y divide-slate-100">
                  {istoric.map((tranz, i) => {
                    const { display, className } = getFormattedValue(
                      tranz, 
                      columns[4].key, 
                      formatCurrency, 
                      formatLunaAn,
                      istoric,
                      i
                    );
                    
                    return (
                      <div
                        key={`${tranz.anul}-${tranz.luna}-${i}`}
                        className={`p-2 text-center text-sm hover:bg-green-50 transition-colors ${i % 2 === 0 ? 'bg-slate-50' : 'bg-white'}`}
                      >
                        <span className={className}>{display}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Secțiunea Depuneri */}
          <div className="col-span-3">
            <div className="text-center font-bold text-purple-800 mb-2 text-sm">
              DEPUNERI
            </div>
            <div className="grid grid-cols-3 gap-1">
              {columns.slice(5, 8).map((col, idx) => (
                <div key={col.key} className="flex flex-col">
                  <div className="bg-purple-100 p-2 text-center font-semibold text-xs border border-purple-300 rounded-t">
                    {col.title}
                  </div>
                  <div 
                    className="h-[400px] overflow-auto border border-purple-300 rounded-b bg-white"
                    ref={(el) => registerScrollElement(el, idx + 5)}
                    onScroll={(e) => handleScroll(idx + 5, e)}
                  >
                    <div className="divide-y divide-slate-100">
                      {istoric.map((tranz, i) => {
                        const { display, className } = getFormattedValue(
                          tranz, 
                          col.key, 
                          formatCurrency, 
                          formatLunaAn,
                          istoric,
                          i
                        );
                        
                        return (
                          <div
                            key={`${tranz.anul}-${tranz.luna}-${i}`}
                            className={`p-2 text-center text-sm hover:bg-purple-50 transition-colors ${i % 2 === 0 ? 'bg-slate-50' : 'bg-white'}`}
                          >
                            <span className={className}>{display}</span>
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
        
        {/* Indicator de sincronizare */}
        <div className="mt-2 text-xs text-slate-500 text-center flex items-center justify-center gap-2">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
          🔄 Scroll sincronizat - derulați orice coloană pentru a sincroniza toate
        </div>
      </CardContent>
    </Card>
  );
}

interface MobileHistoryViewProps {
  istoric: TranzactieLunara[];
  formatCurrency: (value: Decimal) => string;
  formatLunaAn: (luna: number, anul: number) => string;
}

function MobileHistoryViewEnhanced({
  istoric,
  formatCurrency,
  formatLunaAn
}: MobileHistoryViewProps) {
  const [expandedMonth, setExpandedMonth] = useState<number | null>(0);

  // Error boundary pentru debugging Android
  if (!istoric || istoric.length === 0) {
    return (
      <div className="p-4 text-center text-slate-500">
        Nu există istoric financiar pentru acest membru.
      </div>
    );
  }

  try {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-slate-800 px-2">Istoric Financiar</h2>

        {istoric.map((tranz, idx) => {
          const prevTranz = idx < istoric.length - 1 ? istoric[idx + 1] : undefined;

          return (
            <Card key={`${tranz.anul}-${tranz.luna}-${idx}`} className="shadow-lg border-l-4 border-blue-500">
              <CardHeader
                className="pb-3 bg-slate-50 cursor-pointer"
                onClick={() => setExpandedMonth(expandedMonth === idx ? null : idx)}
              >
                <CardTitle className="text-lg flex items-center justify-between">
                  <span className="font-bold text-slate-800 flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-blue-600" />
                    {formatLunaAn(tranz.luna, tranz.anul)}
                  </span>
                  <span className="text-sm font-normal text-slate-500">
                    {MONTHS[tranz.luna - 1]} {tranz.anul}
                  </span>
                </CardTitle>

                {/* Indicator de stare */}
                <div className="flex items-center gap-2 mt-1">
                  {tranz.impr_sold.greaterThan(0) ? (
                    <>
                      <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                      <span className="text-xs text-orange-600 font-semibold">
                        Împrumut Activ: {formatCurrency(tranz.impr_sold)} RON
                      </span>
                    </>
                  ) : (
                    <>
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <span className="text-xs text-green-600 font-semibold">
                        Fără împrumuturi active
                      </span>
                    </>
                  )}
                  <ChevronDown className={`w-4 h-4 transition-transform ${
                    expandedMonth === idx ? 'rotate-180' : ''
                  }`} />
                </div>
            </CardHeader>
            
            {expandedMonth === idx && (
              <CardContent className="space-y-4 pt-0">
                {/* Secțiunea Împrumuturi */}
                <div className="space-y-3">
                  <h3 className="font-bold text-blue-800 border-b border-blue-200 pb-1 flex items-center gap-2">
                    <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                    ÎMPRUMUTURI
                  </h3>
                  
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    {['dobanda', 'impr_deb', 'impr_cred', 'impr_sold'].map((field) => {
                      const { display, className } = getFormattedValue(
                        tranz, 
                        field, 
                        formatCurrency, 
                        formatLunaAn,
                        istoric,
                        idx
                      );
                      const labels = {
                        dobanda: 'Dobândă',
                        impr_deb: 'Împrumut Acordat',
                        impr_cred: 'Rată Achitată', 
                        impr_sold: 'Sold Împrumut'
                      };
                      
                      return (
                        <Fragment key={field}>
                          <div className="font-semibold text-slate-700">
                            {labels[field as keyof typeof labels]}:
                          </div>
                          <div className={`text-right ${className}`}>
                            {display}
                          </div>
                        </Fragment>
                      );
                    })}
                  </div>
                </div>

                {/* Secțiunea Depuneri */}
                <div className="space-y-3">
                  <h3 className="font-bold text-purple-800 border-b border-purple-200 pb-1 flex items-center gap-2">
                    <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                    DEPUNERI
                  </h3>
                  
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    {['dep_deb', 'dep_cred', 'dep_sold'].map((field) => {
                      const { display, className } = getFormattedValue(
                        tranz, 
                        field, 
                        formatCurrency, 
                        formatLunaAn,
                        istoric,
                        idx
                      );
                      const labels = {
                        dep_deb: 'Cotizație',
                        dep_cred: 'Retragere',
                        dep_sold: 'Sold Depuneri'
                      };
                      
                      return (
                        <Fragment key={field}>
                          <div className="font-semibold text-slate-700">
                            {labels[field as keyof typeof labels]}:
                          </div>
                          <div className={`text-right ${className}`}>
                            {display}
                          </div>
                        </Fragment>
                      );
                    })}
                  </div>
                </div>
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
    );
  } catch (error) {
    console.error("Eroare render MobileHistoryViewEnhanced:", error);
    return (
      <div className="p-4">
        <Alert>
          <AlertCircle className="w-4 h-4" />
          <AlertDescription>
            Eroare la afișarea istoricului. Te rog reîncarcă pagina sau contactează suportul.
            <div className="text-xs mt-2 text-slate-600">
              Eroare: {error instanceof Error ? error.message : String(error)}
            </div>
          </AlertDescription>
        </Alert>
      </div>
    );
  }
}

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
  const [formData, setFormData] = useState({
    dobanda: tranzactie.dobanda.toString(),
    impr_deb: tranzactie.impr_deb.toString(),
    impr_cred: tranzactie.impr_cred.toString(),
    dep_deb: tranzactie.dep_deb.toString(),
    dep_cred: tranzactie.dep_cred.toString()
  });

  const [calcImprumut, setCalcImprumut] = useState("");
  const [calcLuni, setCalcLuni] = useState("");
  const [calcRataFixa, setCalcRataFixa] = useState("");
  const [calcOption, setCalcOption] = useState<'luni' | 'rata'>('luni');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCalculeazaRata = () => {
    try {
      if (calcOption === 'luni') {
        const suma = new Decimal(calcImprumut || "0");
        const luni = parseInt(calcLuni || "0");

        if (luni <= 0) {
          alert("Numărul de luni trebuie să fie pozitiv!");
          return;
        }

        const rata = suma.dividedBy(luni);
        setFormData(prev => ({ ...prev, impr_cred: rata.toFixed(2) }));
      } else {
        const suma = new Decimal(calcImprumut || "0");
        const rataFixa = new Decimal(calcRataFixa || "0");

        if (rataFixa.lessThanOrEqualTo(0)) {
          alert("Rata fixă trebuie să fie pozitivă!");
          return;
        }

        if (rataFixa.greaterThan(suma)) {
          alert("Rata fixă nu poate fi mai mare decât suma împrumutului!");
          return;
        }

        const nrRateExact = suma.dividedBy(rataFixa);
        const nrRateIntreg = nrRateExact.ceil();
        const ultimaRata = suma.minus(rataFixa.times(nrRateIntreg.minus(1)));

        let rezultat = `Număr rate: ${nrRateIntreg}`;
        if (!ultimaRata.equals(rataFixa)) {
          rezultat += ` (ultima rată: ${ultimaRata.toFixed(2)} RON)`;
        }

        alert(rezultat);
      }
    } catch (err) {
      alert("Eroare la calcul!");
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    try {
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

      // Actualizare cotizație standard dacă s-a modificat
      if (!dep_deb.equals(membruInfo.cotizatie_standard)) {
        if (confirm(`Doriți să actualizați și cotizația standard de la ${formatCurrency(membruInfo.cotizatie_standard)} la ${formatCurrency(dep_deb)} RON?`)) {
          databases.membrii.run(`
            UPDATE membrii
            SET COTIZATIE_STANDARD = ?
            WHERE NR_FISA = ?
          `, [dep_deb.toNumber(), membruInfo.nr_fisa]);
        }
      }

      // Recalculare lunilor ulterioare
      await recalculeazaLuniUlterioare(
        databases.depcred,
        membruInfo.nr_fisa,
        tranzactie.luna,
        tranzactie.anul,
        rataDobanda
      );

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

          {/* Calculator Rată Îmbunătățit */}
          <Card className="bg-blue-50 border-blue-300">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Calculator className="w-4 h-4" />
                Calculator Rate
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 gap-2">
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
                
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-semibold flex items-center gap-1">
                      <input
                        type="radio"
                        checked={calcOption === 'luni'}
                        onChange={() => setCalcOption('luni')}
                        className="text-blue-600"
                      />
                      Număr Luni:
                    </label>
                    <Input
                      type="number"
                      value={calcLuni}
                      onChange={(e) => setCalcLuni(e.target.value)}
                      placeholder="12"
                      disabled={calcOption !== 'luni'}
                    />
                  </div>
                  
                  <div>
                    <label className="text-xs font-semibold flex items-center gap-1">
                      <input
                        type="radio"
                        checked={calcOption === 'rata'}
                        onChange={() => setCalcOption('rata')}
                        className="text-blue-600"
                      />
                      Rată Fixă:
                    </label>
                    <Input
                      type="number"
                      step="0.01"
                      value={calcRataFixa}
                      onChange={(e) => setCalcRataFixa(e.target.value)}
                      placeholder="0.00"
                      disabled={calcOption !== 'rata'}
                    />
                  </div>
                </div>
                
                <Button onClick={handleCalculeazaRata} className="w-full">
                  Calculează
                </Button>
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
// FUNCȚII BUSINESS LOGIC (EXACT CA ÎN PYTHON)
// ==========================================

/**
 * ✅ CALCUL CORECT al dobânzii (EXACT ca în Python) - cu determinarea intervalului corect
 */
function calculateDobandaLaZi(
  istoric: TranzactieLunara[],
  rataDobanda: Decimal
): Decimal {
  if (!istoric || istoric.length === 0) {
    return new Decimal(0);
  }

  // Sortăm istoricul în ordine crescătoare (ca în Python)
  const istoricSortat = [...istoric].sort((a, b) => {
    if (a.anul !== b.anul) {
      return a.anul - b.anul;
    }
    return a.luna - b.luna;
  });

  // Ultima lună (end) este ultima din istoric
  const end = istoricSortat[istoricSortat.length - 1];
  const end_period_val = end.anul * 100 + end.luna;

  let start_period_val = 0;
  let last_disbursement = null;

  // Găsim ultima lună cu împrumut acordat înainte de end
  for (let i = istoricSortat.length - 1; i >= 0; i--) {
    const t = istoricSortat[i];
    const period_val = t.anul * 100 + t.luna;
    if (period_val <= end_period_val && t.impr_deb.greaterThan(0)) {
      last_disbursement = t;
      break;
    }
  }

  // Dacă nu găsim împrumut, returnăm 0
  if (!last_disbursement) {
    return new Decimal(0);
  }

  const last_disbursement_period_val = last_disbursement.anul * 100 + last_disbursement.luna;

  // Verificăm dacă în luna ultimului împrumut există dobândă > 0
  if (last_disbursement.dobanda.greaterThan(0)) {
    // Caz special: dobândă + împrumut nou în aceeași lună
    start_period_val = last_disbursement_period_val;
  } else {
    // Căutăm ultima lună cu sold zero înainte de ultimul împrumut
    let last_zero = null;
    for (let i = 0; i < istoricSortat.length; i++) {
      const t = istoricSortat[i];
      const period_val = t.anul * 100 + t.luna;
      if (period_val < last_disbursement_period_val && 
          t.impr_sold.lessThanOrEqualTo(new Decimal("0.005"))) {
        last_zero = t;
      }
    }

    if (last_zero) {
      // Determină luna următoare după ultimul sold zero
      let next_luna = last_zero.luna + 1;
      let next_anul = last_zero.anul;
      if (next_luna > 12) {
        next_luna = 1;
        next_anul++;
      }
      start_period_val = next_anul * 100 + next_luna;
    } else {
      // Dacă nu există sold zero, începe de la ultimul împrumut
      start_period_val = last_disbursement_period_val;
    }
  }

  // Sumăm soldurile pozitive din perioada [start_period_val, end_period_val]
  let sumaSolduri = new Decimal(0);
  for (let i = 0; i < istoricSortat.length; i++) {
    const t = istoricSortat[i];
    const period_val = t.anul * 100 + t.luna;
    if (period_val >= start_period_val && period_val <= end_period_val) {
      if (t.impr_sold.greaterThan(0)) {
        sumaSolduri = sumaSolduri.plus(t.impr_sold);
      }
    }
  }

  return sumaSolduri.times(rataDobanda).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

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

    const idxStart = tranzactii.findIndex(
      t => t.anul === anul_start && t.luna === luna_start
    );

    if (idxStart === -1) return;

    for (let i = idxStart + 1; i < tranzactii.length; i++) {
      const tranzPrev = tranzactii[i - 1];
      const tranzCurr = tranzactii[i];

      let sold_impr = tranzPrev.impr_sold
        .plus(tranzCurr.impr_deb)
        .minus(tranzCurr.impr_cred);

      if (sold_impr.lessThan(PRAG_ZEROIZARE)) {
        sold_impr = new Decimal("0");
      }

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

      tranzactii[i].impr_sold = sold_impr;
      tranzactii[i].dep_sold = sold_dep;
    }
  } catch (error) {
    console.error("Eroare recalculare luni ulterioare:", error);
    throw error;
  }
}