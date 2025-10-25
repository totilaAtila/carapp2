// src/components/GenerareLuna.tsx
/**
 * Modul Generare Lună Nouă - Port complet din generare_luna.py
 * 
 * LOGICĂ BUSINESS:
 * - Detectare automată ultima lună procesată din DEPCRED
 * - Validare și excludere membri lichidați (LICHIDATI.db)
 * - Moștenire rată împrumut (doar dacă NU există impr_deb în luna sursă)
 * - Aplicare cotizație standard din MEMBRII
 * - Calcul dobândă la stingerea completă împrumut: SUM(impr_sold) × rata
 * - Dividend în ianuarie (din ACTIVI.db dacă există)
 * - Prag zeroizare împrumut: < 0.005 RON
 * - Rotunjiri: ROUND_HALF_UP conform Regulament CE 1103/97
 * 
 * UI:
 * - Desktop (≥1024px): Layout identic Python (grid, butoane inline)
 * - Mobile (<1024px): Tabs pentru secțiuni, butoane stack
 */

import { useState, useEffect } from "react";
import Decimal from "decimal.js";
import type { Database } from "sql.js";
import type { DBSet } from "../services/databaseManager";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { ScrollArea } from "./ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Alert, AlertDescription } from "./ui/alert";
import { Loader2, Calendar, Trash2, Settings, FileText, Users, Download, X } from "lucide-react";

// Configurare Decimal.js - conform Regulament CE 1103/97
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

const PRAG_ZEROIZARE = new Decimal("0.005"); // Prag sub care împrumutul devine 0
const RATA_DOBANDA_DEFAULT = new Decimal("0.004"); // 4‰ (4 la mie)

interface Props {
  databases: DBSet;
  onBack: () => void;
}

interface PeriodInfo {
  luna: number;
  anul: number;
  display: string;
}

interface MembruData {
  nr_fisa: number;
  nume: string;
  cotizatie_standard: Decimal;
}

interface SoldSursa {
  impr_sold: Decimal;
  dep_sold: Decimal;
  rata_mostenita: Decimal; // Rata plătită în luna sursă
  impr_deb_exista: boolean; // Flag dacă există împrumut nou în luna sursă
}

interface StatisticiGenerare {
  total_membri: number;
  membri_procesati: number;
  membri_omisi: number;
  total_dobanda: Decimal;
  imprumuturi_noi: number;
}

// ==========================================
// HELPER FUNCTIONS - BUSINESS LOGIC
// ==========================================

/**
 * Detectează ultima lună procesată din DEPCRED
 */
function detecteazaUltimaLuna(db: Database): PeriodInfo | null {
  try {
    const result = db.exec(`
      SELECT MAX(anul * 100 + luna) as max_period
      FROM depcred
    `);
    
    if (result.length === 0 || !result[0].values[0][0]) {
      return null;
    }

    const maxPeriod = result[0].values[0][0] as number;
    const anul = Math.floor(maxPeriod / 100);
    const luna = maxPeriod % 100;

    return {
      luna,
      anul,
      display: `${String(luna).padStart(2, "0")}-${anul}`
    };
  } catch (error) {
    console.error("Eroare detectare ultima lună:", error);
    return null;
  }
}

/**
 * Verifică dacă o lună există deja în DEPCRED
 */
function verificaLunaExista(db: Database, luna: number, anul: number): boolean {
  try {
    const result = db.exec(`
      SELECT COUNT(*) as cnt
      FROM depcred
      WHERE luna = ? AND anul = ?
    `, [luna, anul]);
    
    return result.length > 0 && (result[0].values[0][0] as number) > 0;
  } catch {
    return false;
  }
}

/**
 * Obține set membri lichidați din LICHIDATI.db
 */
function getMembriLichidati(db: Database): Set<number> {
  const lichidati = new Set<number>();
  try {
    const result = db.exec(`SELECT nr_fisa FROM lichidati`);
    if (result.length > 0) {
      result[0].values.forEach(row => lichidati.add(row[0] as number));
    }
  } catch (error) {
    console.warn("LICHIDATI.db nu există sau tabel gol:", error);
  }
  return lichidati;
}

/**
 * Obține lista membri activi (NU lichidați) cu cotizații
 */
function getMembriActivi(
  dbMembrii: Database,
  dbLichidati: Database
): MembruData[] {
  const lichidati = getMembriLichidati(dbLichidati);
  const membri: MembruData[] = [];

  try {
    const result = dbMembrii.exec(`
      SELECT NR_FISA, NUM_PREN, COTIZATIE_STANDARD
      FROM membrii
      ORDER BY NR_FISA
    `);

    if (result.length > 0) {
      result[0].values.forEach(row => {
        const nr_fisa = row[0] as number;
        
        // Excludem lichidații
        if (lichidati.has(nr_fisa)) {
          return;
        }

        membri.push({
          nr_fisa,
          nume: row[1] as string,
          cotizatie_standard: new Decimal(String(row[2] || "0"))
        });
      });
    }
  } catch (error) {
    console.error("Eroare citire membri:", error);
  }

  return membri;
}

/**
 * Citește soldurile din luna sursă pentru un membru
 * 
 * LOGICĂ CRITICĂ:
 * - Moștenește rata (impr_cred) DOAR dacă NU există impr_deb în luna sursă
 * - Dacă există împrumut nou → rata devine 0 (se va calcula manual)
 */
function getSoldSursa(
  db: Database,
  nr_fisa: number,
  luna_sursa: number,
  anul_sursa: number
): SoldSursa | null {
  try {
    const result = db.exec(`
      SELECT 
        IMPR_SOLD,
        DEP_SOLD,
        IMPR_CRED,
        IMPR_DEB
      FROM depcred
      WHERE NR_FISA = ? AND LUNA = ? AND ANUL = ?
    `, [nr_fisa, luna_sursa, anul_sursa]);

    if (result.length === 0 || result[0].values.length === 0) {
      return null;
    }

    const row = result[0].values[0];
    const impr_deb = new Decimal(String(row[3] || "0"));
    const impr_deb_exista = impr_deb.greaterThan(0);

    return {
      impr_sold: new Decimal(String(row[0] || "0")),
      dep_sold: new Decimal(String(row[1] || "0")),
      // Moștenire rată: DOAR dacă NU există împrumut nou
      rata_mostenita: impr_deb_exista 
        ? new Decimal("0") 
        : new Decimal(String(row[2] || "0")),
      impr_deb_exista
    };
  } catch (error) {
    console.error(`Eroare citire sold sursă fișa ${nr_fisa}:`, error);
    return null;
  }
}

/**
 * Calculează dobânda la stingerea completă a împrumutului
 * 
 * ALGORITM:
 * 1. Găsește ultima lună cu împrumut nou (MAX luna cu impr_deb > 0)
 * 2. Găsește luna de început (ultima lună cu sold 0 înainte de împrumut)
 * 3. Sumează TOATE soldurile pozitive din intervalul [început...sursă]
 * 4. Dobândă = SUM(solduri) × rata_dobanda
 * 5. Rotunjire: 2 zecimale, ROUND_HALF_UP
 */
function calculeazaDobandaStingere(
  db: Database,
  nr_fisa: number,
  luna_sursa: number,
  anul_sursa: number,
  rata_dobanda: Decimal
): Decimal {
  try {
    const period_sursa = anul_sursa * 100 + luna_sursa;

    // Pas 1: Găsește ultima lună cu împrumut nou
    const resultMaxImprumut = db.exec(`
      SELECT MAX(anul * 100 + luna) as max_period
      FROM depcred
      WHERE NR_FISA = ? 
        AND IMPR_DEB > 0 
        AND (anul * 100 + luna) <= ?
    `, [nr_fisa, period_sursa]);

    if (resultMaxImprumut.length === 0 || !resultMaxImprumut[0].values[0][0]) {
      return new Decimal("0");
    }

    const period_imprumut = resultMaxImprumut[0].values[0][0] as number;

    // Pas 2: Găsește perioada de început (ultima lună cu sold 0)
    const resultStart = db.exec(`
      SELECT MAX(anul * 100 + luna) as start_period
      FROM depcred
      WHERE NR_FISA = ?
        AND IMPR_SOLD <= 0.005
        AND (anul * 100 + luna) < ?
    `, [nr_fisa, period_imprumut]);

    let period_start = 0;
    if (resultStart.length > 0 && resultStart[0].values[0][0]) {
      period_start = resultStart[0].values[0][0] as number;
    }

    // Pas 3: Sumează soldurile pozitive din interval
    const resultSum = db.exec(`
      SELECT SUM(IMPR_SOLD) as total
      FROM depcred
      WHERE NR_FISA = ?
        AND (anul * 100 + luna) BETWEEN ? AND ?
        AND IMPR_SOLD > 0
    `, [nr_fisa, period_start + 1, period_sursa]);

    if (resultSum.length === 0 || !resultSum[0].values[0][0]) {
      return new Decimal("0");
    }

    const suma_solduri = new Decimal(String(resultSum[0].values[0][0]));

    // Pas 4: Calcul dobândă
    const dobanda = suma_solduri.times(rata_dobanda);

    // Pas 5: Rotunjire la 2 zecimale
    return dobanda.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  } catch (error) {
    console.error(`Eroare calcul dobândă fișa ${nr_fisa}:`, error);
    return new Decimal("0");
  }
}

/**
 * Obține dividend pentru membru din ACTIVI.db (doar în ianuarie)
 */
function getDividend(
  dbActivi: Database | null,
  nr_fisa: number,
  luna_tinta: number
): Decimal {
  // Dividend doar în ianuarie
  if (luna_tinta !== 1 || !dbActivi) {
    return new Decimal("0");
  }

  try {
    const result = dbActivi.exec(`
      SELECT DIVIDEND
      FROM activi
      WHERE NR_FISA = ?
    `, [nr_fisa]);

    if (result.length > 0 && result[0].values.length > 0) {
      const dividend = new Decimal(String(result[0].values[0][0] || "0"));
      return dividend.greaterThan(0) ? dividend : new Decimal("0");
    }
  } catch (error) {
    console.warn(`ACTIVI.db absent sau eroare citire dividend fișa ${nr_fisa}`);
  }

  return new Decimal("0");
}

/**
 * Șterge datele unei luni din DEPCRED
 */
function stergeLuna(
  db: Database,
  luna: number,
  anul: number
): boolean {
  try {
    db.run(`
      DELETE FROM depcred
      WHERE LUNA = ? AND ANUL = ?
    `, [luna, anul]);
    return true;
  } catch (error) {
    console.error("Eroare ștergere lună:", error);
    return false;
  }
}

// ==========================================
// COMPONENT PRINCIPAL
// ==========================================

export default function GenerareLuna({ databases, onBack }: Props) {
  // ========================================
  // STATE MANAGEMENT
  // ========================================
  
  const [perioadaCurenta, setPerioadaCurenta] = useState<PeriodInfo | null>(null);
  const [perioadaUrmatoare, setPerioadaUrmatoare] = useState<PeriodInfo | null>(null);
  const [lunaSelectata, setLunaSelectata] = useState<number>(0);
  const [anSelectat, setAnSelectat] = useState<number>(0);
  const [rataDobanda, setRataDobanda] = useState<Decimal>(RATA_DOBANDA_DEFAULT);
  const [log, setLog] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [statistici, setStatistici] = useState<StatisticiGenerare | null>(null);

  // ========================================
  // INIȚIALIZARE - Detectare Perioadă
  // ========================================

  useEffect(() => {
    incarcaPerioadaCurenta();
  }, [databases]);

  useEffect(() => {
    // Calculează și afișează perioada următoare când se schimbă selecția
    if (perioadaCurenta) {
      const next_luna = perioadaCurenta.luna === 12 ? 1 : perioadaCurenta.luna + 1;
      const next_an = perioadaCurenta.luna === 12 ? perioadaCurenta.anul + 1 : perioadaCurenta.anul;
      
      setPerioadaUrmatoare({
        luna: next_luna,
        anul: next_an,
        display: `${String(next_luna).padStart(2, "0")}-${next_an}`
      });

      // Setăm selecția default pe luna următoare
      setLunaSelectata(next_luna);
      setAnSelectat(next_an);
    }
  }, [perioadaCurenta]);

  // ========================================
  // FUNCȚII HELPER UI
  // ========================================

  function pushLog(mesaj: string) {
    setLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${mesaj}`]);
  }

  function clearLog() {
    setLog([]);
    setStatistici(null);
  }

  function incarcaPerioadaCurenta() {
    pushLog("📅 Detectare ultima lună din DEPCRED...");
    
    const perioada = detecteazaUltimaLuna(databases.depcred);
    
    if (perioada) {
      setPerioadaCurenta(perioada);
      pushLog(`✅ Ultima lună procesată: ${perioada.display}`);
      pushLog(`ℹ️  Următoarea lună de generat: ${perioada.luna === 12 ? "01" : String(perioada.luna + 1).padStart(2, "0")}-${perioada.luna === 12 ? perioada.anul + 1 : perioada.anul}`);
    } else {
      pushLog("⚠️  DEPCRED.db este gol - va fi generată prima lună");
      setPerioadaCurenta(null);
    }

    pushLog("✅ Sistem gata pentru generare!");
  }

  // ========================================
  // LOGICA PRINCIPALĂ GENERARE
  // ========================================

  async function handleGenerate() {
    if (running || !lunaSelectata || !anSelectat) return;

    setRunning(true);
    clearLog();
    pushLog("🚀 START GENERARE LUNĂ NOUĂ");
    pushLog(`📅 Lună țintă: ${MONTHS[lunaSelectata - 1]} (${String(lunaSelectata).padStart(2, "0")}-${anSelectat})`);

    try {
      // Validare 1: Verificăm dacă există perioada sursă
      if (!perioadaCurenta) {
        // Prima generare - trebuie să existe date inițiale
        pushLog("❌ EROARE: Nu există date în DEPCRED pentru a prelua solduri sursă");
        pushLog("💡 Pentru prima generare, asigurați-vă că există date inițiale în DEPCRED");
        setRunning(false);
        return;
      }

      // Validare 2: Luna țintă trebuie să fie următoarea lună logică
      if (lunaSelectata !== perioadaUrmatoare?.luna || anSelectat !== perioadaUrmatoare?.anul) {
        pushLog(`❌ EROARE: Puteți genera doar luna următoare: ${perioadaUrmatoare?.display}`);
        pushLog(`   Selecție curentă: ${String(lunaSelectata).padStart(2, "0")}-${anSelectat}`);
        setRunning(false);
        return;
      }

      // Validare 3: Verificăm dacă luna există deja
      const exista = verificaLunaExista(databases.depcred, lunaSelectata, anSelectat);
      if (exista) {
        pushLog(`⚠️  Luna ${String(lunaSelectata).padStart(2, "0")}-${anSelectat} există deja în DEPCRED`);
        pushLog("💡 Folosiți butonul 'Șterge Lună Selectată' pentru a o elimina mai întâi");
        setRunning(false);
        return;
      }

      pushLog(`📖 Luna sursă: ${perioadaCurenta.display}`);
      pushLog("─".repeat(60));

      // Pregătim datele
      const luna_sursa = perioadaCurenta.luna;
      const anul_sursa = perioadaCurenta.anul;
      const luna_tinta = lunaSelectata;
      const anul_tinta = anSelectat;

      // Obținem membri activi (exclude lichidați)
      pushLog("👥 Încărcare listă membri activi...");
      const membri = getMembriActivi(databases.membrii, databases.lichidati);
      pushLog(`✅ Membri activi: ${membri.length}`);

      if (membri.length === 0) {
        pushLog("❌ EROARE: Nu există membri activi de procesat");
        setRunning(false);
        return;
      }

      // Resetăm PRIMA pe luna sursă (pentru a marca împrumuturi noi)
      pushLog("🔄 Resetare flag PRIMA pe luna sursă...");
      databases.depcred.run(`
        UPDATE depcred 
        SET PRIMA = 0 
        WHERE LUNA = ? AND ANUL = ?
      `, [luna_sursa, anul_sursa]);

      // Statistici
      let membri_procesati = 0;
      let membri_omisi = 0;
      let total_dobanda = new Decimal("0");
      let imprumuturi_noi = 0;

      pushLog("─".repeat(60));
      pushLog("📝 PROCESARE MEMBRI:");

      // Procesăm fiecare membru
      for (const membru of membri) {
        const { nr_fisa, nume, cotizatie_standard } = membru;

        // Citim soldurile din luna sursă
        const sold_sursa = getSoldSursa(
          databases.depcred,
          nr_fisa,
          luna_sursa,
          anul_sursa
        );

        if (!sold_sursa) {
          pushLog(`⚠️  Fișa ${nr_fisa} (${nume}) - lipsesc date în luna sursă, OMIS`);
          membri_omisi++;
          continue;
        }

        // Inițializăm tranzacțiile lunii țintă
        let impr_deb_nou = new Decimal("0");
        let impr_cred_nou = sold_sursa.rata_mostenita; // Moștenește rata dacă NU e împrumut nou
        let dep_deb_nou = cotizatie_standard; // Cotizație standard
        let dep_cred_nou = new Decimal("0");

        // Dividend în ianuarie
        if (luna_tinta === 1 && databases.activi) {
          const dividend = getDividend(databases.activi, nr_fisa, luna_tinta);
          if (dividend.greaterThan(0)) {
            dep_cred_nou = dep_cred_nou.plus(dividend);
            pushLog(`   💰 Dividend ianuarie: ${dividend.toFixed(2)} RON`);
          }
        }

        // Plafonare rată la soldul disponibil
        if (impr_cred_nou.greaterThan(sold_sursa.impr_sold)) {
          impr_cred_nou = sold_sursa.impr_sold;
        }

        // Dacă soldul sursă e aproape 0, rata devine 0
        if (sold_sursa.impr_sold.lessThanOrEqualTo(PRAG_ZEROIZARE)) {
          impr_cred_nou = new Decimal("0");
        }

        // Calculăm soldurile noi
        let impr_sold_nou = sold_sursa.impr_sold
          .plus(impr_deb_nou)
          .minus(impr_cred_nou);

        let dep_sold_nou = sold_sursa.dep_sold
          .plus(dep_cred_nou)
          .minus(dep_deb_nou);

        // Aplicăm prag zeroizare împrumut
        if (impr_sold_nou.lessThan(PRAG_ZEROIZARE)) {
          impr_sold_nou = new Decimal("0");
        }

        // Calculăm dobânda la stingere
        let dobanda = new Decimal("0");
        const sold_sursa_pozitiv = sold_sursa.impr_sold.greaterThan(PRAG_ZEROIZARE);
        const sold_nou_zero = impr_sold_nou.equals(0);

        if (sold_sursa_pozitiv && sold_nou_zero) {
          // Împrumutul se stinge ACUM → calculăm dobânda
          dobanda = calculeazaDobandaStingere(
            databases.depcred,
            nr_fisa,
            luna_sursa,
            anul_sursa,
            rataDobanda
          );

          if (dobanda.greaterThan(0)) {
            total_dobanda = total_dobanda.plus(dobanda);
            pushLog(`   💳 Fișa ${nr_fisa} - Dobândă stingere: ${dobanda.toFixed(2)} RON`);
          }
        }

        // Marcăm împrumuturi noi
        if (sold_sursa.impr_deb_exista) {
          imprumuturi_noi++;
        }

        // Inserăm înregistrarea în luna țintă
        databases.depcred.run(`
          INSERT INTO depcred (
            NR_FISA, LUNA, ANUL, DOBANDA,
            IMPR_DEB, IMPR_CRED, IMPR_SOLD,
            DEP_DEB, DEP_CRED, DEP_SOLD,
            PRIMA
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          nr_fisa,
          luna_tinta,
          anul_tinta,
          dobanda.toFixed(2),
          impr_deb_nou.toFixed(2),
          impr_cred_nou.toFixed(2),
          impr_sold_nou.toFixed(2),
          dep_deb_nou.toFixed(2),
          dep_cred_nou.toFixed(2),
          dep_sold_nou.toFixed(2),
          1 // PRIMA = 1 pentru noile înregistrări
        ]);

        membri_procesati++;

        // Log periodic pentru progres
        if (membri_procesati % 20 === 0) {
          pushLog(`   ✓ Procesat ${membri_procesati}/${membri.length} membri...`);
        }
      }

      pushLog("─".repeat(60));
      pushLog("✅ GENERARE FINALIZATĂ CU SUCCES");
      pushLog(`📊 Statistici:`);
      pushLog(`   • Total membri: ${membri.length}`);
      pushLog(`   • Procesați: ${membri_procesati}`);
      pushLog(`   • Omiși: ${membri_omisi}`);
      pushLog(`   • Împrumuturi noi (luna sursă): ${imprumuturi_noi}`);
      pushLog(`   • Dobândă totală calculată: ${total_dobanda.toFixed(2)} RON`);

      setStatistici({
        total_membri: membri.length,
        membri_procesati,
        membri_omisi,
        total_dobanda,
        imprumuturi_noi
      });

      // Reîncărcăm perioada curentă
      setTimeout(() => {
        incarcaPerioadaCurenta();
      }, 500);

    } catch (error) {
      pushLog("❌ EROARE CRITICĂ LA GENERARE:");
      pushLog(`   ${error instanceof Error ? error.message : String(error)}`);
      console.error("Eroare generare:", error);
    } finally {
      setRunning(false);
    }
  }

  // ========================================
  // ȘTERGERE LUNĂ
  // ========================================

  function handleDelete() {
    if (running || !lunaSelectata || !anSelectat) return;

    if (!confirm(`Confirmați ștergerea lunii ${String(lunaSelectata).padStart(2, "0")}-${anSelectat}?\n\nAceastă operațiune NU poate fi anulată!`)) {
      return;
    }

    pushLog(`🗑️  Ștergere lună ${String(lunaSelectata).padStart(2, "0")}-${anSelectat}...`);

    const success = stergeLuna(databases.depcred, lunaSelectata, anSelectat);

    if (success) {
      pushLog("✅ Lună ștearsă cu succes");
      incarcaPerioadaCurenta();
    } else {
      pushLog("❌ Eroare la ștergerea lunii");
    }
  }

  // ========================================
  // UI RENDERING
  // ========================================

  return (
    <div className="flex flex-col h-full gap-4 p-4 lg:p-6">
      {/* Header cu Back Button */}
      <div className="flex items-center gap-4">
        <Button
          variant="outline"
          onClick={onBack}
          disabled={running}
        >
          ← Înapoi la Dashboard
        </Button>
        <h1 className="text-2xl font-bold text-slate-900">
          Generare Lună Nouă
        </h1>
      </div>

      {/* ========================================
          DESKTOP LAYOUT (≥1024px)
          Layout IDENTIC cu Python
          ======================================== */}
      <div className="hidden lg:flex flex-col gap-4 flex-1">
        {/* Info Cards - Perioadă Curentă & Următoare */}
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-600">
                Ultima lună:
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-slate-900">
                {perioadaCurenta?.display || "N/A"}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-600">
                Următoarea lună (selectată):
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-blue-600">
                {perioadaUrmatoare?.display || "N/A"}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-600">
                Rată dobândă lichidare:
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-slate-900">
                {rataDobanda.times(1000).toFixed(1)}‰
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Controale Principale */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-sm font-medium text-slate-700">
                Selectați luna pentru acțiuni:
              </label>

              <Select
                value={lunaSelectata.toString()}
                onValueChange={(val) => setLunaSelectata(parseInt(val))}
                disabled={running}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((nume, idx) => (
                    <SelectItem key={idx + 1} value={(idx + 1).toString()}>
                      {String(idx + 1).padStart(2, "0")} - {nume}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={anSelectat.toString()}
                onValueChange={(val) => setAnSelectat(parseInt(val))}
                disabled={running}
              >
                <SelectTrigger className="w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 5 }, (_, i) => {
                    const an = (perioadaCurenta?.anul || new Date().getFullYear()) - 1 + i;
                    return (
                      <SelectItem key={an} value={an.toString()}>
                        {an}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>

              <div className="flex gap-2 ml-auto">
                <Button
                  onClick={handleGenerate}
                  disabled={running || !perioadaCurenta}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {running ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Generare în curs...
                    </>
                  ) : (
                    <>
                      <Calendar className="w-4 h-4 mr-2" />
                      Generează Lună Selectată
                    </>
                  )}
                </Button>

                <Button
                  onClick={handleDelete}
                  disabled={running || !perioadaCurenta}
                  variant="destructive"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Șterge Lună Selectată
                </Button>

                <Button
                  onClick={() => alert("Modificare rată dobândă - în dezvoltare")}
                  disabled={running}
                  className="bg-yellow-500 hover:bg-yellow-600 text-black"
                >
                  <Settings className="w-4 h-4 mr-2" />
                  Modifică Rata Dobândă
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Butoane Secundare */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={running}
                onClick={() => pushLog("ℹ️  Numere de fișă nealocate - funcție în dezvoltare")}
              >
                Numere de fișă nealocate
              </Button>

              <Button
                variant="outline"
                size="sm"
                disabled={running}
                onClick={() => pushLog("ℹ️  Afișare membri lichidați - funcție în dezvoltare")}
              >
                Afișează membri lichidați
              </Button>

              <Button
                variant="outline"
                size="sm"
                disabled={running}
                onClick={() => pushLog("ℹ️  Afișare membri activi - funcție în dezvoltare")}
              >
                Afișează membri activi
              </Button>

              <div className="flex gap-2 ml-auto">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={running}
                  onClick={() => alert("Export rezumat - în dezvoltare")}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Exportă rezumat
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={clearLog}
                >
                  <X className="w-4 h-4 mr-2" />
                  Șterge log
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Statistici (dacă există) */}
        {statistici && (
          <Alert className="bg-green-50 border-green-200">
            <AlertDescription>
              <div className="grid grid-cols-5 gap-4 text-sm">
                <div>
                  <div className="font-semibold text-slate-700">Total Membri</div>
                  <div className="text-2xl font-bold text-slate-900">{statistici.total_membri}</div>
                </div>
                <div>
                  <div className="font-semibold text-green-700">Procesați</div>
                  <div className="text-2xl font-bold text-green-600">{statistici.membri_procesati}</div>
                </div>
                <div>
                  <div className="font-semibold text-yellow-700">Omiși</div>
                  <div className="text-2xl font-bold text-yellow-600">{statistici.membri_omisi}</div>
                </div>
                <div>
                  <div className="font-semibold text-blue-700">Împrumuturi Noi</div>
                  <div className="text-2xl font-bold text-blue-600">{statistici.imprumuturi_noi}</div>
                </div>
                <div>
                  <div className="font-semibold text-purple-700">Dobândă Totală</div>
                  <div className="text-2xl font-bold text-purple-600">{statistici.total_dobanda.toFixed(2)} RON</div>
                </div>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Log Area */}
        <Card className="flex-1">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Jurnal Operațiuni
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px] w-full">
              <pre className="text-xs font-mono whitespace-pre-wrap text-slate-700">
                {log.length === 0 
                  ? "Așteptare operațiuni..." 
                  : log.join("\n")}
              </pre>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* ========================================
          MOBILE LAYOUT (<1024px)
          Tabs pentru secțiuni
          ======================================== */}
      <div className="lg:hidden flex flex-col gap-4 flex-1">
        <Tabs defaultValue="control" className="flex-1 flex flex-col">
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="control">⚙️ Control</TabsTrigger>
            <TabsTrigger value="log">📋 Jurnal</TabsTrigger>
            <TabsTrigger value="stats">📊 Stats</TabsTrigger>
          </TabsList>

          {/* Tab Control */}
          <TabsContent value="control" className="flex-1 flex flex-col gap-3">
            {/* Info Perioadă */}
            <Card>
              <CardContent className="pt-4 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-600">Ultima lună:</span>
                  <span className="text-lg font-bold">{perioadaCurenta?.display || "N/A"}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-600">Următoarea:</span>
                  <span className="text-lg font-bold text-blue-600">{perioadaUrmatoare?.display || "N/A"}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-600">Rată dobândă:</span>
                  <span className="text-lg font-bold">{rataDobanda.times(1000).toFixed(1)}‰</span>
                </div>
              </CardContent>
            </Card>

            {/* Selectare Lună/An */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Selectați luna:</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Select
                  value={lunaSelectata.toString()}
                  onValueChange={(val) => setLunaSelectata(parseInt(val))}
                  disabled={running}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((nume, idx) => (
                      <SelectItem key={idx + 1} value={(idx + 1).toString()}>
                        {String(idx + 1).padStart(2, "0")} - {nume}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={anSelectat.toString()}
                  onValueChange={(val) => setAnSelectat(parseInt(val))}
                  disabled={running}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 5 }, (_, i) => {
                      const an = (perioadaCurenta?.anul || new Date().getFullYear()) - 1 + i;
                      return (
                        <SelectItem key={an} value={an.toString()}>
                          {an}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            {/* Butoane Principale */}
            <div className="flex flex-col gap-2">
              <Button
                onClick={handleGenerate}
                disabled={running || !perioadaCurenta}
                className="w-full bg-green-600 hover:bg-green-700"
                size="lg"
              >
                {running ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Generare în curs...
                  </>
                ) : (
                  <>
                    <Calendar className="w-4 h-4 mr-2" />
                    Generează Lună Selectată
                  </>
                )}
              </Button>

              <Button
                onClick={handleDelete}
                disabled={running || !perioadaCurenta}
                variant="destructive"
                className="w-full"
                size="lg"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Șterge Lună Selectată
              </Button>

              <Button
                onClick={() => alert("Modificare rată - în dezvoltare")}
                disabled={running}
                className="w-full bg-yellow-500 hover:bg-yellow-600 text-black"
                size="lg"
              >
                <Settings className="w-4 h-4 mr-2" />
                Modifică Rata Dobândă
              </Button>
            </div>
          </TabsContent>

          {/* Tab Jurnal */}
          <TabsContent value="log" className="flex-1">
            <Card className="h-full">
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-base">Jurnal Operațiuni</CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={clearLog}
                >
                  <X className="w-4 h-4" />
                </Button>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px] w-full">
                  <pre className="text-xs font-mono whitespace-pre-wrap">
                    {log.length === 0 
                      ? "Așteptare operațiuni..." 
                      : log.join("\n")}
                  </pre>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab Statistici */}
          <TabsContent value="stats" className="flex-1">
            {statistici ? (
              <div className="space-y-3">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Total Membri</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl font-bold">{statistici.total_membri}</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm text-green-700">Membri Procesați</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl font-bold text-green-600">{statistici.membri_procesati}</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm text-yellow-700">Membri Omiși</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl font-bold text-yellow-600">{statistici.membri_omisi}</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm text-blue-700">Împrumuturi Noi</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl font-bold text-blue-600">{statistici.imprumuturi_noi}</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm text-purple-700">Dobândă Totală</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl font-bold text-purple-600">
                      {statistici.total_dobanda.toFixed(2)} RON
                    </p>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <Alert>
                <AlertDescription>
                  Statistici vor fi afișate după generarea unei luni.
                </AlertDescription>
              </Alert>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
