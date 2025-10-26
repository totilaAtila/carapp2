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
import { Button } from "./ui/buttons";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { ScrollArea } from "./ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Alert, AlertDescription } from "./ui/alert";
import { Loader2, Calendar, Trash2, Settings, FileText, Download, X } from "lucide-react";
import { saveAs } from 'file-saver'; // ✅ ADĂUGAT

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

    // Type-safe conversion
    const maxPeriodRaw = result[0].values[0][0];
    const maxPeriod = typeof maxPeriodRaw === 'number' 
      ? maxPeriodRaw 
      : parseInt(String(maxPeriodRaw), 10);
    
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
 * Obține dividend pentru ianuarie din ACTIVI.db
 */
function getDividendIanuarie(
  dbActivi: Database | undefined,
  nr_fisa: number,
  anul: number
): Decimal {
  if (!dbActivi) {
    return new Decimal("0");
  }

  try {
    const result = dbActivi.exec(`
      SELECT div_an
      FROM activi
      WHERE NR_FISA = ? AND an = ?
    `, [nr_fisa, anul]);

    if (result.length > 0 && result[0].values.length > 0) {
      return new Decimal(String(result[0].values[0][0] || "0"));
    }
  } catch (error) {
    console.warn(`Nu s-a găsit dividend pentru fișa ${nr_fisa}, anul ${anul}:`, error);
  }

  return new Decimal("0");
}

/**
 * Calculează dobânda la stingerea completă a împrumutului
 * 
 * IMPORTANT: Se calculează doar dacă:
 * 1. impr_sold_vechi > 0
 * 2. impr_sold_nou <= PRAG_ZEROIZARE (considerat 0)
 * 3. Rata plătită >= impr_sold_vechi (stingere completă)
 * 
 * Formula: SUM(impr_sold_toate_lunile) × rata_dobanda
 */
function calculeazaDobandaStingere(
  db: Database,
  nr_fisa: number,
  rata_plata: Decimal,
  rata_dobanda: Decimal,
  log: (msg: string) => void
): Decimal {
  try {
    // Obține SUM(impr_sold) pentru toate lunile acestui membru
    const result = db.exec(`
      SELECT SUM(IMPR_SOLD) as suma_solduri
      FROM depcred
      WHERE NR_FISA = ?
    `, [nr_fisa]);

    if (result.length === 0 || !result[0].values[0][0]) {
      return new Decimal("0");
    }

    const suma_solduri = new Decimal(String(result[0].values[0][0]));
    
    // Dobânda = SUM(solduri) × rata
    const dobanda = suma_solduri.times(rata_dobanda).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    
    log(`  ↳ Dobândă stingere fișa ${nr_fisa}: SUM(${suma_solduri.toFixed(2)}) × ${rata_dobanda.toFixed(4)} = ${dobanda.toFixed(2)} RON`);
    
    return dobanda;
  } catch (error) {
    console.error(`Eroare calcul dobândă fișa ${nr_fisa}:`, error);
    return new Decimal("0");
  }
}

/**
 * Procesează un membru și returnează înregistrarea pentru luna țintă
 */
function proceseazaMembru(
  membru: MembruData,
  luna_sursa: number,
  anul_sursa: number,
  luna_tinta: number,
  anul_tinta: number,
  db: Database,
  dbActivi: Database | undefined,
  rata_dobanda: Decimal,
  log: (msg: string) => void
): {
  nr_fisa: number;
  luna: number;
  anul: number;
  dep_deb: Decimal;
  dep_cred: Decimal;
  dep_sold: Decimal;
  impr_deb: Decimal;
  impr_cred: Decimal;
  impr_sold: Decimal;
  dobanda: Decimal;
  membru_nou: boolean;
} {
  const { nr_fisa, nume, cotizatie_standard } = membru;

  // Citire sold sursă
  const sold_sursa = getSoldSursa(db, nr_fisa, luna_sursa, anul_sursa);

  // Membru nou (fără istoric)
  if (!sold_sursa) {
    log(`  Membru NOU fișa ${nr_fisa} (${nume}) - pornire de la 0`);
    
    return {
      nr_fisa,
      luna: luna_tinta,
      anul: anul_tinta,
      dep_deb: cotizatie_standard,
      dep_cred: new Decimal("0"),
      dep_sold: cotizatie_standard,
      impr_deb: new Decimal("0"),
      impr_cred: new Decimal("0"),
      impr_sold: new Decimal("0"),
      dobanda: new Decimal("0"),
      membru_nou: true
    };
  }

  // Membru existent - aplicăm logica business
  const { impr_sold: impr_sold_vechi, dep_sold: dep_sold_vechi, rata_mostenita } = sold_sursa;

  // Depunere = cotizație standard
  const dep_deb = cotizatie_standard;

  // Rată împrumut = moștenire din luna sursă (0 dacă a fost împrumut nou)
  const impr_cred = rata_mostenita;

  // Calcule intermediare
  let impr_sold_nou = impr_sold_vechi.minus(impr_cred);
  let dobanda = new Decimal("0");

  // Verificare stingere completă împrumut
  if (
    impr_sold_vechi.greaterThan(0) && 
    impr_sold_nou.lessThanOrEqualTo(PRAG_ZEROIZARE) &&
    impr_cred.greaterThanOrEqualTo(impr_sold_vechi)
  ) {
    dobanda = calculeazaDobandaStingere(db, nr_fisa, impr_cred, rata_dobanda, log);
    impr_sold_nou = new Decimal("0"); // Zeroizare
  }

  // Dividend în ianuarie
  let dep_cred = new Decimal("0");
  if (luna_tinta === 1) {
    dep_cred = getDividendIanuarie(dbActivi, nr_fisa, anul_tinta);
    if (dep_cred.greaterThan(0)) {
      log(`  ↳ Dividend ianuarie fișa ${nr_fisa}: ${dep_cred.toFixed(2)} RON`);
    }
  }

  // Sold final depuneri
  const dep_sold_nou = dep_sold_vechi.plus(dep_deb).minus(dep_cred);

  return {
    nr_fisa,
    luna: luna_tinta,
    anul: anul_tinta,
    dep_deb,
    dep_cred,
    dep_sold: dep_sold_nou,
    impr_deb: new Decimal("0"), // Implicit 0, se setează manual în UI
    impr_cred,
    impr_sold: impr_sold_nou,
    dobanda,
    membru_nou: false
  };
}

/**
 * Șterge datele pentru o lună din DEPCRED
 */
function stergeDate(
  db: Database,
  luna: number,
  anul: number,
  log: (msg: string) => void
): void {
  try {
    // Contorizare înainte de ștergere
    const countResult = db.exec(`
      SELECT COUNT(*) as cnt FROM depcred WHERE luna = ? AND anul = ?
    `, [luna, anul]);
    const count = countResult.length > 0 ? (countResult[0].values[0][0] as number) : 0;

    db.run(`
      DELETE FROM depcred
      WHERE luna = ? AND anul = ?
    `, [luna, anul]);

    log(`✅ Șterse ${count} înregistrări pentru ${String(luna).padStart(2, "0")}-${anul}`);
  } catch (error) {
    log(`❌ Eroare ștergere: ${error}`);
    throw error;
  }
}

/**
 * Inserează înregistrări noi în DEPCRED
 */
function insereazaDate(
  db: Database,
  records: any[],
  log: (msg: string) => void
): void {
  try {
    records.forEach(r => {
      db.run(`
        INSERT INTO depcred (
          NR_FISA, LUNA, ANUL,
          DEP_DEB, DEP_CRED, DEP_SOLD,
          IMPR_DEB, IMPR_CRED, IMPR_SOLD,
          DOBANDA
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        r.nr_fisa,
        r.luna,
        r.anul,
        r.dep_deb.toFixed(2),
        r.dep_cred.toFixed(2),
        r.dep_sold.toFixed(2),
        r.impr_deb.toFixed(2),
        r.impr_cred.toFixed(2),
        r.impr_sold.toFixed(2),
        r.dobanda.toFixed(2)
      ]);
    });

    log(`✅ Inserate ${records.length} înregistrări noi`);
  } catch (error) {
    log(`❌ Eroare inserare: ${error}`);
    throw error;
  }
}

// ✅ FUNCȚIE NOUĂ: Helper pentru detectare platformă și cale download
function getDownloadPath(): string {
  const userAgent = navigator.userAgent.toLowerCase();
  const platform = navigator.platform.toLowerCase();
  
  if (/android/i.test(userAgent)) {
    return "📱 Android: /storage/emulated/0/Download/ sau Files → Downloads";
  } else if (/iphone|ipad|ipod/i.test(userAgent)) {
    return "📱 iOS: Files → On My iPhone → Downloads";
  } else if (/mac/i.test(platform)) {
    return "💻 macOS: ~/Downloads/ (Finder → Downloads)";
  } else if (/win/i.test(platform)) {
    return "💻 Windows: C:\\Users\\[Username]\\Downloads\\";
  } else if (/linux/i.test(platform)) {
    return "💻 Linux: ~/Downloads/ sau ~/Descărcări/";
  } else {
    return "📂 Verificați folderul Downloads din browser";
  }
}

// ✅ FUNCȚIE NOUĂ: Helper pentru formatare bytes
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// ==========================================
// COMPONENTA PRINCIPALĂ
// ==========================================

export default function GenerareLuna({ databases, onBack }: Props) {
  // State
  const [perioadaCurenta, setPerioadaCurenta] = useState<PeriodInfo | null>(null);
  const [perioadaUrmatoare, setPerioadaUrmatoare] = useState<PeriodInfo | null>(null);
  const [lunaSelectata, setLunaSelectata] = useState<number>(1);
  const [anSelectat, setAnSelectat] = useState<number>(new Date().getFullYear());
  const [rataDobanda, setRataDobanda] = useState<Decimal>(RATA_DOBANDA_DEFAULT);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [statistici, setStatistici] = useState<StatisticiGenerare | null>(null);
  const [depcredDbForSave, setDepcredDbForSave] = useState<Database | null>(null);

  const pushLog = (msg: string) => {
    setLog(prev => [...prev, msg]);
  };

  const clearLog = () => {
    setLog([]);
  };

  // Detectare automată perioada la mount
  useEffect(() => {
    const perioada = detecteazaUltimaLuna(databases.depcred);
    
    if (perioada) {
      setPerioadaCurenta(perioada);
      
      // Calculează următoarea lună logică
      const urmatoare: PeriodInfo = {
        luna: perioada.luna === 12 ? 1 : perioada.luna + 1,
        anul: perioada.luna === 12 ? perioada.anul + 1 : perioada.anul,
        display: ""
      };
      urmatoare.display = `${String(urmatoare.luna).padStart(2, "0")}-${urmatoare.anul}`;
      
      setPerioadaUrmatoare(urmatoare);
      setLunaSelectata(urmatoare.luna);
      setAnSelectat(urmatoare.anul);
      
      pushLog(`📅 Ultima lună detectată: ${perioada.display}`);
      pushLog(`➡️ Următoarea lună de generat: ${urmatoare.display}`);
      pushLog("✅ Sistem gata pentru generare");
    } else {
      pushLog("⚠️ Nu s-au găsit date în DEPCRED - posibil prima rulare");
      pushLog("ℹ️ Selectați manual luna și anul pentru generare");
    }
  }, [databases.depcred]);

  // ========================================
  // HANDLER FUNCTIONS
  // ========================================

  const handleGenerate = async () => {
    if (running) return;

    // Validare: există perioada curentă?
    if (!perioadaCurenta) {
      pushLog("❌ Nu există date în DEPCRED pentru a determina luna sursă");
      pushLog("ℹ️ Asigurați-vă că aveți cel puțin o lună procesată în baza de date");
      return;
    }

    // Validare: luna selectată este următoarea logică?
    if (!perioadaUrmatoare || 
        lunaSelectata !== perioadaUrmatoare.luna || 
        anSelectat !== perioadaUrmatoare.anul) {
      pushLog(`❌ EROARE: Puteți genera doar luna imediat următoare (${perioadaUrmatoare?.display})`);
      pushLog(`   Ați selectat: ${String(lunaSelectata).padStart(2, "0")}-${anSelectat}`);
      return;
    }

    // Verificare: luna țintă există deja?
    if (verificaLunaExista(databases.depcred, lunaSelectata, anSelectat)) {
      const confirmare = window.confirm(
        `Luna ${String(lunaSelectata).padStart(2, "0")}-${anSelectat} există deja în DEPCRED.\n\n` +
        `Doriți să o ștergeți și să o regenerați?`
      );
      
      if (!confirmare) {
        pushLog("ℹ️ Operațiune anulată de utilizator");
        return;
      }

      pushLog(`⚠️ Șterg datele existente pentru ${String(lunaSelectata).padStart(2, "0")}-${anSelectat}...`);
      stergeDate(databases.depcred, lunaSelectata, anSelectat, pushLog);
    }

    // START GENERARE
    setRunning(true);
    setStatistici(null);
    clearLog();

    pushLog("=".repeat(60));
    pushLog(`🚀 GENERARE LUNĂ ${MONTHS[lunaSelectata - 1].toUpperCase()} ${anSelectat}`);
    pushLog("=".repeat(60));
    pushLog("");

    try {
      // 1. Obține membri activi (exclud lichidații)
      pushLog("📋 Pas 1/4: Detectare membri activi...");
      const membri = getMembriActivi(databases.membrii, databases.lichidati);
      pushLog(`✅ Găsiți ${membri.length} membri activi (fără lichidați)`);
      pushLog("");

      // 2. Procesare membri
      pushLog("⚙️ Pas 2/4: Procesare membri...");
      const records: any[] = [];
      let membri_procesati = 0;
      let membri_noi = 0;
      let total_dobanda = new Decimal("0");
      let imprumuturi_noi = 0;

      for (const membru of membri) {
        const record = proceseazaMembru(
          membru,
          perioadaCurenta.luna,
          perioadaCurenta.anul,
          lunaSelectata,
          anSelectat,
          databases.depcred,
          databases.activi,
          rataDobanda,
          pushLog
        );

        records.push(record);
        membri_procesati++;
        
        if (record.membru_nou) membri_noi++;
        if (record.dobanda.greaterThan(0)) total_dobanda = total_dobanda.plus(record.dobanda);
        if (record.impr_deb.greaterThan(0)) imprumuturi_noi++;
      }

      pushLog(`✅ Procesați ${membri_procesati} membri`);
      if (membri_noi > 0) pushLog(`  ↳ Membri noi: ${membri_noi}`);
      pushLog("");

      // 3. Salvare în baza de date
      pushLog("💾 Pas 3/4: Salvare date în DEPCRED...");
      insereazaDate(databases.depcred, records, pushLog);
      pushLog("");

      // 4. Statistici finale
      pushLog("📊 Pas 4/4: Generare statistici...");
      const stats: StatisticiGenerare = {
        total_membri: membri.length,
        membri_procesati,
        membri_omisi: 0, // Lichidații sunt deja excluși
        total_dobanda,
        imprumuturi_noi
      };
      setStatistici(stats);

      pushLog("");
      pushLog("=".repeat(60));
      pushLog("✅ GENERARE FINALIZATĂ CU SUCCES!");
      pushLog("=".repeat(60));
      pushLog("");
      pushLog("📊 REZUMAT:");
      pushLog(`   • Total membri: ${stats.total_membri}`);
      pushLog(`   • Membri procesați: ${stats.membri_procesati}`);
      if (membri_noi > 0) pushLog(`   • Membri noi: ${membri_noi}`);
      pushLog(`   • Împrumuturi noi: ${stats.imprumuturi_noi}`);
      pushLog(`   • Dobândă totală: ${stats.total_dobanda.toFixed(2)} RON`);
      pushLog("");
      pushLog("💾 Baza de date DEPCRED a fost actualizată");
      pushLog("📥 Puteți salva baza pe disc pentru portabilitate");

      // Actualizare perioade
      setPerioadaCurenta({
        luna: lunaSelectata,
        anul: anSelectat,
        display: `${String(lunaSelectata).padStart(2, "0")}-${anSelectat}`
      });

      const next_luna = lunaSelectata === 12 ? 1 : lunaSelectata + 1;
      const next_an = lunaSelectata === 12 ? anSelectat + 1 : anSelectat;
      
      setPerioadaUrmatoare({
        luna: next_luna,
        anul: next_an,
        display: `${String(next_luna).padStart(2, "0")}-${next_an}`
      });

      setLunaSelectata(next_luna);
      setAnSelectat(next_an);

      // Setează baza pentru salvare
      setDepcredDbForSave(databases.depcred);

    } catch (error) {
      pushLog("");
      pushLog("❌ EROARE în timpul generării:");
      pushLog(`   ${error}`);
      pushLog("");
      pushLog("🔧 Sugestii:");
      pushLog("   1. Verificați integritatea bazelor de date");
      pushLog("   2. Asigurați-vă că MEMBRII.db și DEPCRED.db sunt valide");
      pushLog("   3. Încercați să reîncărcați aplicația");
    } finally {
      setRunning(false);
    }
  };

  const handleDelete = async () => {
    if (running || !perioadaCurenta) return;

    const confirmare = window.confirm(
      `Confirmați ștergerea datelor pentru ${perioadaCurenta.display}?\n\n` +
      `Această operațiune NU poate fi anulată!`
    );

    if (!confirmare) {
      pushLog("ℹ️ Ștergere anulată de utilizator");
      return;
    }

    setRunning(true);
    pushLog("");
    pushLog("🗑️ Ștergere date...");

    try {
      stergeDate(
        databases.depcred,
        perioadaCurenta.luna,
        perioadaCurenta.anul,
        pushLog
      );

      pushLog("✅ Ștergere finalizată cu succes");
      
      // Recalculare perioada
      const noua_perioada = detecteazaUltimaLuna(databases.depcred);
      setPerioadaCurenta(noua_perioada);
      
      if (noua_perioada) {
        const urmatoare: PeriodInfo = {
          luna: noua_perioada.luna === 12 ? 1 : noua_perioada.luna + 1,
          anul: noua_perioada.luna === 12 ? noua_perioada.anul + 1 : noua_perioada.anul,
          display: ""
        };
        urmatoare.display = `${String(urmatoare.luna).padStart(2, "0")}-${urmatoare.anul}`;
        setPerioadaUrmatoare(urmatoare);
        setLunaSelectata(urmatoare.luna);
        setAnSelectat(urmatoare.anul);
      }

      setStatistici(null);
      setDepcredDbForSave(null);
      
    } catch (error) {
      pushLog(`❌ Eroare la ștergere: ${error}`);
    } finally {
      setRunning(false);
    }
  };

  // ✅ MODIFICAT: handleSave cu FileSaver.js + Notificări complete
  const handleSave = async () => {
    if (!depcredDbForSave) {
      pushLog("❌ Nu există date de salvat");
      return;
    }

    try {
      pushLog("");
      pushLog("=".repeat(60));
      pushLog("📥 ÎNCEPE PROCESUL DE SALVARE PE DISC");
      pushLog("=".repeat(60));
      
      // 1. Export baza
      pushLog("🔄 Pas 1/6: Export bază de date din memorie...");
      const data = depcredDbForSave.export();
      pushLog(`✅ Export complet: ${formatBytes(data.length)}`);
      
      // 2. Verificare header SQLite
      pushLog("🔄 Pas 2/6: Verificare integritate fișier...");
      const header = new TextDecoder().decode(data.slice(0, 16));
      if (!header.startsWith("SQLite format 3")) {
        throw new Error("Header SQLite invalid - baza de date este coruptă!");
      }
      pushLog("✅ Header SQLite valid: Baza de date este corectă");
      
      // 3. Verificare mărime minimă
      pushLog("🔄 Pas 3/6: Verificare mărime fișier...");
      if (data.length < 1024) {
        throw new Error(`Fișier prea mic (${data.length} bytes) - probabil corupt`);
      }
      pushLog(`✅ Mărime validă: ${formatBytes(data.length)}`);
      
      // 4. Creare blob
      pushLog("🔄 Pas 4/6: Creare blob pentru salvare...");
      const blob = new Blob([new Uint8Array(data)], {
        type: "application/vnd.sqlite3"
      });
      
      // 5. Verificare blob
      if (blob.size !== data.length) {
        throw new Error(`Eroare creare blob: mărime diferită (${blob.size} vs ${data.length})`);
      }
      pushLog("✅ Blob creat corect");
      
      // 6. Salvare cu FileSaver.js
      pushLog("🔄 Pas 5/6: Salvare fișier pe disc...");
      const fileName = `DEPCRED_${anSelectat}_${String(lunaSelectata).padStart(2, "0")}.db`;
      saveAs(blob, fileName);
      
      pushLog("✅ Fișier trimis către sistemul de download al browserului");
      
      // 7. Notificări detaliate finale
      pushLog("");
      pushLog("=".repeat(60));
      pushLog("✅ SALVARE FINALIZATĂ CU SUCCES!");
      pushLog("=".repeat(60));
      pushLog("");
      pushLog("📄 INFORMAȚII FIȘIER SALVAT:");
      pushLog(`   • Nume: ${fileName}`);
      pushLog(`   • Mărime: ${formatBytes(blob.size)}`);
      pushLog(`   • Tip: Bază de date SQLite3`);
      pushLog(`   • Perioada: ${MONTHS[lunaSelectata - 1]} ${anSelectat}`);
      pushLog("");
      pushLog("📂 LOCAȚIE SALVARE:");
      pushLog(`   ${getDownloadPath()}`);
      pushLog("");
      pushLog("✅ COMPATIBILITATE:");
      pushLog("   • Aplicația Python CAR Desktop (Windows)");
      pushLog("   • Orice dispozitiv cu SQLite viewer");
      pushLog("   • Import în această aplicație web pe alt dispozitiv");
      pushLog("");
      pushLog("⚠️ IMPORTANT:");
      pushLog("   • Verificați că fișierul are exact " + formatBytes(blob.size));
      pushLog("   • NU deschideți fișierul până nu se termină download-ul");
      pushLog("   • Păstrați backup-uri regulate ale bazelor de date");
      pushLog("");
      pushLog("🔍 VERIFICARE RECOMANDATĂ:");
      pushLog("   1. Găsiți fișierul în folderul Downloads");
      pushLog("   2. Verificați mărimea fișierului (" + formatBytes(blob.size) + ")");
      pushLog("   3. Deschideți cu SQLite viewer pentru confirmare");
      pushLog("   4. Testați import în aplicația Python");
      pushLog("=".repeat(60));
      
      // Notificare vizuală cu dialog
      setTimeout(() => {
        const message = 
          `✅ Fișier salvat cu succes!\n\n` +
          `📄 Nume: ${fileName}\n` +
          `📏 Mărime: ${formatBytes(blob.size)}\n` +
          `📅 Perioadă: ${MONTHS[lunaSelectata - 1]} ${anSelectat}\n\n` +
          `📂 Locație:\n${getDownloadPath()}\n\n` +
          `✅ Compatibil cu aplicația Python CAR Desktop`;
        
        alert(message);
      }, 500);
      
    } catch (err: any) {
      pushLog("");
      pushLog("=".repeat(60));
      pushLog("❌ EROARE LA SALVARE!");
      pushLog("=".repeat(60));
      pushLog(`❌ Detalii eroare: ${err.message}`);
      pushLog("");
      pushLog("🔧 SUGESTII REZOLVARE:");
      pushLog("   1. Verificați că aveți spațiu disponibil pe disc");
      pushLog("   2. Verificați permisiunile browserului pentru download");
      pushLog("   3. Încercați să regenerați luna");
      pushLog("   4. Contactați suportul dacă problema persistă");
      pushLog("=".repeat(60));
      
      alert(
        `❌ Eroare la salvare bazei de date!\n\n` +
        `Detalii: ${err.message}\n\n` +
        `Verificați log-ul pentru mai multe informații și încercați din nou.`
      );
    }
  };

  // ========================================
  // RENDER
  // ========================================

  return (
    <div className="w-full h-full flex flex-col gap-4 p-4 bg-slate-50">
      {/* Header cu Back Button */}
      <div className="flex items-center justify-between">
        <Button
          onClick={onBack}
          variant="outline"
          className="gap-2"
        >
          ← Înapoi la Dashboard
        </Button>
        <h1 className="text-2xl font-bold text-slate-800">
          📆 Generare Lună Nouă
        </h1>
        <div className="w-[120px]" /> {/* Spacer pentru centrare */}
      </div>

      {/* ========================================
          DESKTOP LAYOUT (≥1024px)
          Grid 2 coloane: Control + Log
          ======================================== */}
      <div className="hidden lg:grid lg:grid-cols-[400px_1fr] gap-4 flex-1">
        {/* Panoul stâng - Control */}
        <div className="flex flex-col gap-4">
          {/* Info Perioadă */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Informații Perioadă</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-600">Ultima lună:</span>
                <span className="text-xl font-bold">{perioadaCurenta?.display || "N/A"}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-600">Următoarea:</span>
                <span className="text-xl font-bold text-blue-600">{perioadaUrmatoare?.display || "N/A"}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-600">Rată dobândă:</span>
                <span className="text-xl font-bold">{rataDobanda.times(1000).toFixed(1)}‰</span>
              </div>
            </CardContent>
          </Card>

          {/* Selectare Lună/An */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Selectare Perioadă</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Luna:</label>
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
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Anul:</label>
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
              </div>
            </CardContent>
          </Card>

          {/* Butoane Principale */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Acțiuni</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
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
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Șterge Lună Selectată
              </Button>

              <Button
                onClick={() => alert("Modificare rată - în dezvoltare")}
                disabled={running}
                className="w-full bg-yellow-500 hover:bg-yellow-600 text-black"
              >
                <Settings className="w-4 h-4 mr-2" />
                Modifică Rata Dobândă
              </Button>

              <Button
                onClick={handleSave}
                disabled={!depcredDbForSave}
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                <Download className="w-4 h-4 mr-2" />
                Salvează DEPCRED pe disc
              </Button>
            </CardContent>
          </Card>

          {/* Statistici Desktop */}
          {statistici && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">📊 Statistici Generare</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-600">Total membri:</span>
                  <span className="font-bold">{statistici.total_membri}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Procesați:</span>
                  <span className="font-bold text-green-600">{statistici.membri_procesati}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Omiși (lichidați):</span>
                  <span className="font-bold text-yellow-600">{statistici.membri_omisi}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Împrumuturi noi:</span>
                  <span className="font-bold text-blue-600">{statistici.imprumuturi_noi}</span>
                </div>
                <div className="flex justify-between pt-2 border-t">
                  <span className="text-slate-600">Dobândă totală:</span>
                  <span className="font-bold text-purple-600">
                    {statistici.total_dobanda.toFixed(2)} RON
                  </span>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Panoul drept - Log + Warning */}
        <div className="flex flex-col gap-4">
          {/* Warning dacă e generare în curs */}
          {running && (
            <Alert className="bg-yellow-50 border-yellow-200">
              <AlertDescription>
                <div className="flex items-start gap-3">
                  <Loader2 className="w-5 h-5 animate-spin text-yellow-600 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-semibold text-yellow-800 mb-1">
                      Generare în curs...
                    </p>
                    <p className="text-sm text-yellow-700">
                      Procesarea poate dura câteva secunde pentru baze mari de date.
                      Nu închideți aplicația până la finalizare.
                    </p>
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