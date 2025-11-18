import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
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
import { getActiveDB, assertCanWrite } from "../services/databaseManager";
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
// Currency dinamic bazat pe toggle EUR/RON
function getCurrency(databases) {
    return databases.activeCurrency || 'RON';
}
// ==========================================
// HELPER FUNCTIONS - BUSINESS LOGIC
// ==========================================
/**
 * Detectează ultima lună procesată din DEPCRED
 */
function detecteazaUltimaLuna(databases) {
    const db = getActiveDB(databases, 'depcred');
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
    }
    catch (error) {
        console.error("Eroare detectare ultima lună:", error);
        return null;
    }
}
/**
 * Verifică dacă o lună există deja în DEPCRED
 */
function verificaLunaExista(databases, luna, anul) {
    const db = getActiveDB(databases, 'depcred');
    try {
        const result = db.exec(`
      SELECT COUNT(*) as cnt
      FROM depcred
      WHERE luna = ? AND anul = ?
    `, [luna, anul]);
        return result.length > 0 && result[0].values[0][0] > 0;
    }
    catch {
        return false;
    }
}
/**
 * Obține set membri lichidați din LICHIDATI.db
 */
function getMembriLichidati(databases) {
    const lichidati = new Set();
    try {
        const result = getActiveDB(databases, 'lichidati').exec(`SELECT nr_fisa FROM lichidati`);
        if (result.length > 0) {
            result[0].values.forEach(row => lichidati.add(row[0]));
        }
    }
    catch (error) {
        console.warn("LICHIDATI.db nu există sau tabel gol:", error);
    }
    return lichidati;
}
/**
 * Obține lista membri activi (NU lichidați) cu cotizații
 */
function getMembriActivi(databases) {
    const lichidati = getMembriLichidati(databases);
    const membri = [];
    try {
        const result = getActiveDB(databases, 'membrii').exec(`
      SELECT NR_FISA, NUM_PREN, COTIZATIE_STANDARD
      FROM membrii
      ORDER BY NR_FISA
    `);
        if (result.length > 0) {
            result[0].values.forEach(row => {
                const nr_fisa = row[0];
                // Excludem lichidații
                if (lichidati.has(nr_fisa)) {
                    return;
                }
                membri.push({
                    nr_fisa,
                    nume: row[1],
                    cotizatie_standard: new Decimal(String(row[2] || "0"))
                });
            });
        }
    }
    catch (error) {
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
function getSoldSursa(databases, nr_fisa, luna_sursa, anul_sursa) {
    try {
        const db = getActiveDB(databases, 'depcred');
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
    }
    catch (error) {
        console.error(`Eroare citire sold sursă fișa ${nr_fisa}:`, error);
        return null;
    }
}
/**
 * NOTĂ: Dividendele NU se adaugă în GenerareLuna!
 * Workflow corect:
 * 1. Decembrie: GenerareLuna creează ianuarie (fără dividende)
 * 2. Ianuarie: Dividende calculează și transferă beneficii în ianuarie existent
 * 3. Ianuarie: GenerareLuna creează februarie (cu cotizație standard, fără dividende)
 */
/**
 * Calculează dobânda la stingerea completă a împrumutului
 * EXACT ca în Python: _calculeaza_dobanda_la_zi()
 *
 * ALGORITM:
 * 1. Determină perioada START (ultima lună cu impr_deb > 0 sau ultima lună cu sold zero)
 * 2. Sumează TOATE soldurile pozitive din perioada [START, source_period]
 * 3. Aplică rata: dobanda = SUM(solduri) × rata_dobanda
 *
 * IMPORTANT: Se calculează doar dacă:
 * - impr_sold_vechi > 0
 * - impr_sold_nou <= PRAG_ZEROIZARE (stingere completă)
 */
function calculeazaDobandaStingere(databases, nr_fisa, luna_sursa, anul_sursa, rata_dobanda, log) {
    try {
        const db = getActiveDB(databases, 'depcred');
        const source_period_val = anul_sursa * 100 + luna_sursa;
        // ========================================
        // PASUL 1: Determină perioada START
        // ========================================
        // 1.1: Găsește ultima lună cu împrumut acordat (impr_deb > 0)
        const resultLastLoan = db.exec(`
      SELECT MAX(ANUL * 100 + LUNA) as max_period
      FROM depcred
      WHERE NR_FISA = ? AND IMPR_DEB > 0 AND (ANUL * 100 + LUNA) <= ?
    `, [nr_fisa, source_period_val]);
        if (resultLastLoan.length === 0 || !resultLastLoan[0].values[0][0]) {
            // Nu există împrumuturi acordate
            log(`  ↳ Fișa ${nr_fisa}: Nu există istoric împrumuturi`);
            return new Decimal("0");
        }
        const last_loan_period = resultLastLoan[0].values[0][0];
        // 1.2: Verifică dacă în luna cu ultimul împrumut există dobândă și împrumut nou concomitent
        const resultConcomitent = db.exec(`
      SELECT DOBANDA, IMPR_DEB
      FROM depcred
      WHERE NR_FISA = ? AND (ANUL * 100 + LUNA) = ?
    `, [nr_fisa, last_loan_period]);
        let start_period_val = last_loan_period;
        if (resultConcomitent.length > 0 && resultConcomitent[0].values.length > 0) {
            const row = resultConcomitent[0].values[0];
            const dobanda = new Decimal(String(row[0] || "0"));
            const impr_deb = new Decimal(String(row[1] || "0"));
            // Dacă NU există dobândă și împrumut nou concomitent
            if (!(dobanda.greaterThan(0) && impr_deb.greaterThan(0))) {
                // Caută ultima lună cu sold zero (≤ 0.005) ÎNAINTE de ultimul împrumut
                const resultLastZero = db.exec(`
          SELECT MAX(ANUL * 100 + LUNA) as max_zero_period
          FROM depcred
          WHERE NR_FISA = ?
            AND IMPR_SOLD <= 0.005
            AND (ANUL * 100 + LUNA) < ?
        `, [nr_fisa, last_loan_period]);
                if (resultLastZero.length > 0 && resultLastZero[0].values[0][0]) {
                    start_period_val = resultLastZero[0].values[0][0];
                }
            }
        }
        // ========================================
        // PASUL 2: Sumează TOATE soldurile pozitive din perioada
        // ========================================
        const resultSum = db.exec(`
      SELECT SUM(IMPR_SOLD) as total_balances
      FROM depcred
      WHERE NR_FISA = ?
        AND (ANUL * 100 + LUNA) BETWEEN ? AND ?
        AND IMPR_SOLD > 0
    `, [nr_fisa, start_period_val, source_period_val]);
        if (resultSum.length === 0 || !resultSum[0].values[0][0]) {
            return new Decimal("0");
        }
        const sum_of_balances = new Decimal(String(resultSum[0].values[0][0]));
        // ========================================
        // PASUL 3: Aplică rata dobânzii
        // ========================================
        const dobanda = sum_of_balances
            .times(rata_dobanda)
            .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
        const currency = getCurrency(databases);
        log(`  ↳ Dobândă stingere fișa ${nr_fisa}: Perioada ${start_period_val}-${source_period_val}, SUM(${sum_of_balances.toFixed(2)}) × ${rata_dobanda.toFixed(4)} = ${dobanda.toFixed(2)} ${currency}`);
        return dobanda;
    }
    catch (error) {
        console.error(`Eroare calcul dobândă fișa ${nr_fisa}:`, error);
        return new Decimal("0");
    }
}
/**
 * Procesează un membru și returnează înregistrarea pentru luna țintă
 * IMPORTANT: Returnează null dacă membrul nu are date în luna sursă (va fi omis)
 */
function proceseazaMembru(membru, luna_sursa, anul_sursa, luna_tinta, anul_tinta, databases, rata_dobanda, log) {
    const { nr_fisa, nume, cotizatie_standard } = membru;
    // Citire sold sursă
    const sold_sursa = getSoldSursa(databases, nr_fisa, luna_sursa, anul_sursa);
    // COMPORTAMENT CRITIC (conform Python):
    // Dacă membrul NU are date în luna sursă → OMITE (nu procesează)
    // Acest caz apare pentru membri care au încetat activitatea dar nu au depus cerere de retragere
    if (!sold_sursa) {
        return null; // Membru va fi omis din generare
    }
    // Membru existent - aplicăm logica business
    const { impr_sold: impr_sold_vechi, dep_sold: dep_sold_vechi, rata_mostenita } = sold_sursa;
    // Depunere = cotizație standard (dividendele se adaugă separat prin modulul Dividende)
    const dep_deb = cotizatie_standard;
    // Credit depuneri = 0 (nu se procesează retrageri la generare lună)
    const dep_cred = new Decimal("0");
    // Rată împrumut = moștenire din luna sursă (0 dacă a fost împrumut nou)
    // VALIDARE CRITICĂ: Rata nu poate fi mai mare decât soldul (conform Python)
    let impr_cred;
    if (impr_sold_vechi.lessThanOrEqualTo(PRAG_ZEROIZARE)) {
        // Dacă sold foarte mic → nu se moștenește rată
        impr_cred = new Decimal("0");
    }
    else {
        // Rata = min(sold_vechi, rata_moștenită)
        impr_cred = Decimal.min(impr_sold_vechi, rata_mostenita);
    }
    // Calcule intermediare
    let impr_sold_nou = impr_sold_vechi.minus(impr_cred);
    let dobanda = new Decimal("0");
    // Verificare stingere completă împrumut
    if (impr_sold_vechi.greaterThan(0) &&
        impr_sold_nou.lessThanOrEqualTo(PRAG_ZEROIZARE) &&
        impr_cred.greaterThanOrEqualTo(impr_sold_vechi)) {
        dobanda = calculeazaDobandaStingere(databases, nr_fisa, luna_sursa, anul_sursa, rata_dobanda, log);
        impr_sold_nou = new Decimal("0"); // Zeroizare
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
function stergeDate(databases, luna, anul, log) {
    try {
        const db = getActiveDB(databases, 'depcred');
        // Contorizare înainte de ștergere
        const countResult = db.exec(`
      SELECT COUNT(*) as cnt FROM depcred WHERE luna = ? AND anul = ?
    `, [luna, anul]);
        const count = countResult.length > 0 ? countResult[0].values[0][0] : 0;
        db.run(`
      DELETE FROM depcred
      WHERE luna = ? AND anul = ?
    `, [luna, anul]);
        log(`✅ Șterse ${count} înregistrări pentru ${String(luna).padStart(2, "0")}-${anul}`);
    }
    catch (error) {
        log(`❌ Eroare ștergere: ${error}`);
        throw error;
    }
}
/**
 * Inserează înregistrări noi în DEPCRED
 * IMPORTANT: Setează prima = 1 pentru noile înregistrări (conform Python)
 */
function insereazaDate(databases, records, log) {
    try {
        const db = getActiveDB(databases, 'depcred');
        records.forEach(r => {
            db.run(`
        INSERT INTO depcred (
          NR_FISA, LUNA, ANUL,
          DEP_DEB, DEP_CRED, DEP_SOLD,
          IMPR_DEB, IMPR_CRED, IMPR_SOLD,
          DOBANDA, PRIMA
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                r.dobanda.toFixed(2),
                1 // prima = 1 (lună nouă generată)
            ]);
        });
        log(`✅ Inserate ${records.length} înregistrări noi (prima = 1)`);
    }
    catch (error) {
        log(`❌ Eroare inserare: ${error}`);
        throw error;
    }
}
/**
 * Actualizează flag prima = 0 pentru luna sursă (conform Python)
 */
function actualizarePrimaLunaSursa(databases, luna_sursa, anul_sursa, log) {
    try {
        const db = getActiveDB(databases, 'depcred');
        db.run(`
      UPDATE depcred
      SET PRIMA = 0
      WHERE LUNA = ? AND ANUL = ?
    `, [luna_sursa, anul_sursa]);
        log(`✅ Flag prima actualizat (prima = 0) pentru ${String(luna_sursa).padStart(2, "0")}-${anul_sursa}`);
    }
    catch (error) {
        log(`❌ Eroare actualizare prima: ${error}`);
        throw error;
    }
}
// ✅ FUNCȚIE NOUĂ: Helper pentru detectare platformă și cale download
function getDownloadPath() {
    const userAgent = navigator.userAgent.toLowerCase();
    const platform = navigator.platform.toLowerCase();
    if (/android/i.test(userAgent)) {
        return "📱 Android: /storage/emulated/0/Download/ sau Files → Downloads";
    }
    else if (/iphone|ipad|ipod/i.test(userAgent)) {
        return "📱 iOS: Files → On My iPhone → Downloads";
    }
    else if (/mac/i.test(platform)) {
        return "💻 macOS: ~/Downloads/ (Finder → Downloads)";
    }
    else if (/win/i.test(platform)) {
        return "💻 Windows: C:\\Users\\[Username]\\Downloads\\";
    }
    else if (/linux/i.test(platform)) {
        return "💻 Linux: ~/Downloads/ sau ~/Descărcări/";
    }
    else {
        return "📂 Verificați folderul Downloads din browser";
    }
}
// ✅ FUNCȚIE NOUĂ: Helper pentru formatare bytes
function formatBytes(bytes) {
    if (bytes < 1024)
        return `${bytes} B`;
    if (bytes < 1024 * 1024)
        return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
// ==========================================
// COMPONENTA PRINCIPALĂ
// ==========================================
export default function GenerareLuna({ databases, onBack }) {
    // State
    const [perioadaCurenta, setPerioadaCurenta] = useState(null);
    const [perioadaUrmatoare, setPerioadaUrmatoare] = useState(null);
    const [lunaSelectata, setLunaSelectata] = useState(1);
    const [anSelectat, setAnSelectat] = useState(new Date().getFullYear());
    const [rataDobanda, setRataDobanda] = useState(RATA_DOBANDA_DEFAULT);
    const [running, setRunning] = useState(false);
    const [log, setLog] = useState([]);
    const [statistici, setStatistici] = useState(null);
    // const [depcredDbForSave, setDepcredDbForSave] = useState<Database | null>(null); // Not needed with DBSet
    const pushLog = (msg) => {
        setLog(prev => [...prev, msg]);
    };
    const clearLog = () => {
        setLog([]);
    };
    // Scroll la top când se montează componenta (pentru mobile)
    useEffect(() => {
        window.scrollTo(0, 0);
    }, []);
    // Detectare automată perioada la mount
    useEffect(() => {
        const perioada = detecteazaUltimaLuna(databases);
        if (perioada) {
            setPerioadaCurenta(perioada);
            // Calculează următoarea lună logică
            const urmatoare = {
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
        }
        else {
            pushLog("⚠️ Nu s-au găsit date în DEPCRED - posibil prima rulare");
            pushLog("ℹ️ Selectați manual luna și anul pentru generare");
        }
    }, [databases]);
    // ========================================
    // HANDLER FUNCTIONS
    // ========================================
    /**
     * Handler: Actualizare Inactivi
     * Caută gaps în numerele de fișă (numere nealocate între min și max)
     */
    const handleUpdateInactivi = () => {
        if (running)
            return;
        try {
            // Obține toate numerele de fișă din MEMBRII
            const result = getActiveDB(databases, 'membrii').exec(`
        SELECT DISTINCT NR_FISA
        FROM membrii
        WHERE NR_FISA IS NOT NULL
        ORDER BY NR_FISA
      `);
            if (result.length === 0 || result[0].values.length === 0) {
                alert("Nu s-au găsit membri în MEMBRII.db");
                return;
            }
            const numere_alocate = result[0].values.map(row => row[0]);
            const min_nr = Math.min(...numere_alocate);
            const max_nr = Math.max(...numere_alocate);
            // Găsește gaps (numere lipsă)
            const gaps = [];
            for (let nr = min_nr; nr <= max_nr; nr++) {
                if (!numere_alocate.includes(nr)) {
                    gaps.push(nr);
                }
            }
            if (gaps.length === 0) {
                alert(`Nu există numere nealocate între ${min_nr} și ${max_nr}.\n\nToate numerele sunt alocate consecutiv.`);
            }
            else {
                const message = `Numere nealocate găsite: ${gaps.length}\n\n` +
                    `Interval: ${min_nr} - ${max_nr}\n\n` +
                    `Numere lipsă:\n${gaps.slice(0, 50).join(", ")}` +
                    (gaps.length > 50 ? `\n\n... și încă ${gaps.length - 50} numere` : "");
                alert(message);
            }
        }
        catch (error) {
            alert(`Eroare la căutare numere nealocate:\n${error}`);
        }
    };
    /**
     * Handler: Afișează Inactivi (Lichidați)
     * Afișează lista membri lichidați din LICHIDATI.db cu date
     */
    const handleAfiseazaInactivi = () => {
        if (running)
            return;
        try {
            // Citește membri lichidați
            const result = getActiveDB(databases, 'lichidati').exec(`
        SELECT nr_fisa, data_lichidare
        FROM lichidati
        ORDER BY nr_fisa
      `);
            if (result.length === 0 || result[0].values.length === 0) {
                alert("Nu există membri lichidați în LICHIDATI.db");
                return;
            }
            // Cross-reference cu MEMBRII pentru nume
            const lichidati_info = [];
            result[0].values.slice(0, 100).forEach(row => {
                const nr_fisa = row[0];
                const data_lichidare = row[1];
                // Caută nume în MEMBRII
                let nume = "Necunoscut";
                try {
                    const numeResult = getActiveDB(databases, 'membrii').exec(`
            SELECT NUM_PREN FROM membrii WHERE NR_FISA = ?
          `, [nr_fisa]);
                    if (numeResult.length > 0 && numeResult[0].values.length > 0) {
                        nume = numeResult[0].values[0][0];
                    }
                }
                catch {
                    // Ignoră erori la căutare nume
                }
                lichidati_info.push(`${nr_fisa}. ${nume} - Lichidare: ${data_lichidare}`);
            });
            const total = result[0].values.length;
            const message = `📋 MEMBRI LICHIDAȚI (${total} total)\n\n` +
                lichidati_info.join("\n") +
                (total > 100 ? `\n\n... și încă ${total - 100} membri` : "");
            alert(message);
        }
        catch (error) {
            alert(`Eroare la afișare lichidați:\n${error}`);
        }
    };
    /**
     * Handler: Afișează Activi
     * Afișează membri activi cu solduri pentru luna curentă + statistici
     */
    const handleAfiseazaActivi = () => {
        if (running || !perioadaCurenta)
            return;
        const currency = getCurrency(databases);
        try {
            // Query membri activi pentru luna curentă
            const result = getActiveDB(databases, 'depcred').exec(`
        SELECT NR_FISA, DEP_SOLD, IMPR_SOLD
        FROM depcred
        WHERE LUNA = ? AND ANUL = ?
        ORDER BY NR_FISA
      `, [perioadaCurenta.luna, perioadaCurenta.anul]);
            if (result.length === 0 || result[0].values.length === 0) {
                alert(`Nu există date pentru luna ${perioadaCurenta.display}`);
                return;
            }
            // Calculează statistici
            let total_dep = new Decimal("0");
            let total_impr = new Decimal("0");
            let membri_cu_imprumut = 0;
            const membri_info = [];
            result[0].values.slice(0, 50).forEach(row => {
                const nr_fisa = row[0];
                const dep_sold = new Decimal(String(row[1] || "0"));
                const impr_sold = new Decimal(String(row[2] || "0"));
                total_dep = total_dep.plus(dep_sold);
                total_impr = total_impr.plus(impr_sold);
                if (impr_sold.greaterThan(0))
                    membri_cu_imprumut++;
                // Caută nume
                let nume = "Necunoscut";
                try {
                    const numeResult = getActiveDB(databases, 'membrii').exec(`
            SELECT NUM_PREN FROM membrii WHERE NR_FISA = ?
          `, [nr_fisa]);
                    if (numeResult.length > 0 && numeResult[0].values.length > 0) {
                        nume = numeResult[0].values[0][0];
                    }
                }
                catch {
                    // Ignoră
                }
                membri_info.push(`${nr_fisa}. ${nume}\n` +
                    `  Depuneri: ${dep_sold.toFixed(2)} ${currency} | Împrumuturi: ${impr_sold.toFixed(2)} ${currency}`);
            });
            const total_membri = result[0].values.length;
            const message = `📊 MEMBRI ACTIVI - ${perioadaCurenta.display}\n\n` +
                `Total membri: ${total_membri}\n` +
                `Membri cu împrumuturi: ${membri_cu_imprumut}\n\n` +
                `💰 STATISTICI:\n` +
                `Total depuneri: ${total_dep.toFixed(2)} ${currency}\n` +
                `Total împrumuturi: ${total_impr.toFixed(2)} ${currency}\n\n` +
                `📋 PRIMII ${Math.min(50, total_membri)} MEMBRI:\n\n` +
                membri_info.join("\n\n") +
                (total_membri > 50 ? `\n\n... și încă ${total_membri - 50} membri` : "");
            alert(message);
        }
        catch (error) {
            alert(`Eroare la afișare activi:\n${error}`);
        }
    };
    /**
     * Handler: Modifică Rata Dobândă
     * Permite schimbarea ratei dobânzii pentru stingeri împrumuturi
     */
    const handleModificaRata = () => {
        if (running)
            return;
        try {
            // Afișează rata curentă în ‰ (per-mille)
            const rata_curenta_permille = rataDobanda.times(1000).toFixed(1);
            const input = prompt(`Modifică Rata Dobândă la Stingere\n\n` +
                `Rata curentă: ${rata_curenta_permille}‰\n\n` +
                `Introduceți noua rată (‰, între 0 și 1000):`, rata_curenta_permille);
            if (input === null) {
                // User canceled
                return;
            }
            const noua_rata_permille = parseFloat(input);
            // Validare
            if (isNaN(noua_rata_permille)) {
                alert("❌ Eroare: Valoarea introdusă nu este un număr valid!");
                return;
            }
            if (noua_rata_permille < 0) {
                alert("❌ Eroare: Rata nu poate fi negativă!");
                return;
            }
            if (noua_rata_permille > 1000) {
                alert("❌ Eroare: Rata nu poate depăși 1000‰!");
                return;
            }
            // Conversie din ‰ în rată decimală (ex: 4‰ = 0.004)
            const noua_rata_decimal = new Decimal(noua_rata_permille.toString())
                .dividedBy(1000)
                .toDecimalPlaces(6, Decimal.ROUND_HALF_UP);
            // Actualizare state
            setRataDobanda(noua_rata_decimal);
            pushLog("");
            pushLog("=".repeat(60));
            pushLog("✅ RATA DOBÂNDĂ ACTUALIZATĂ");
            pushLog("=".repeat(60));
            pushLog(`   Rată veche: ${rata_curenta_permille}‰`);
            pushLog(`   Rată nouă: ${noua_rata_permille.toFixed(1)}‰`);
            pushLog(`   Valoare decimală: ${noua_rata_decimal.toFixed(6)}`);
            pushLog("");
            pushLog("⚠️ NOTĂ: Rata se aplică la generarea următoarelor luni.");
            pushLog("   Lunile deja generate NU sunt afectate.");
            pushLog("=".repeat(60));
            alert(`✅ Rata actualizată cu succes!\n\n` +
                `Rată nouă: ${noua_rata_permille.toFixed(1)}‰\n\n` +
                `Rata se va aplica la generarea următoarelor luni.`);
        }
        catch (error) {
            alert(`❌ Eroare la modificare rată:\n${error}`);
        }
    };
    /**
     * Handler: Export Log
     * Exportă jurnal ca fișier .txt cu timestamp
     */
    const handleExportLog = () => {
        if (running || log.length === 0)
            return;
        try {
            // Creare conținut fișier
            const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5);
            const header = `JURNAL GENERARE LUNĂ - CAR APPLICATION\n` +
                `========================================\n` +
                `Data export: ${new Date().toLocaleString("ro-RO")}\n` +
                `Perioada curentă: ${perioadaCurenta?.display || "N/A"}\n` +
                `Perioada următoare: ${perioadaUrmatoare?.display || "N/A"}\n` +
                `========================================\n\n`;
            const content = header + log.join("\n");
            // Creare blob și download
            const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
            const fileName = `jurnal_generare_${timestamp}.txt`;
            saveAs(blob, fileName);
            pushLog("");
            pushLog(`✅ Jurnal exportat: ${fileName}`);
            pushLog(`   Mărime: ${formatBytes(blob.size)}`);
            pushLog(`   Locație: ${getDownloadPath()}`);
        }
        catch (error) {
            alert(`Eroare la export jurnal:\n${error}`);
        }
    };
    const handleGenerate = async () => {
        if (running)
            return;
        // VERIFICARE CRITICĂ: Permisiuni de scriere
        // Previne modificarea RON când există date EUR (RON devine arhivă read-only)
        try {
            assertCanWrite(databases, 'Generare lună');
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            pushLog("❌ OPERAȚIUNE BLOCATĂ!");
            pushLog(errorMessage);
            alert(errorMessage);
            return;
        }
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
        if (verificaLunaExista(databases, lunaSelectata, anSelectat)) {
            const confirmare = window.confirm(`Luna ${String(lunaSelectata).padStart(2, "0")}-${anSelectat} există deja în DEPCRED.\n\n` +
                `Doriți să o ștergeți și să o regenerați?`);
            if (!confirmare) {
                pushLog("ℹ️ Operațiune anulată de utilizator");
                return;
            }
            pushLog(`⚠️ Șterg datele existente pentru ${String(lunaSelectata).padStart(2, "0")}-${anSelectat}...`);
            stergeDate(databases, lunaSelectata, anSelectat, pushLog);
        }
        // START GENERARE
        setRunning(true);
        setStatistici(null);
        const currency = getCurrency(databases);
        clearLog();
        pushLog("=".repeat(60));
        pushLog(`🚀 GENERARE LUNĂ ${MONTHS[lunaSelectata - 1].toUpperCase()} ${anSelectat}`);
        pushLog("=".repeat(60));
        pushLog("");
        try {
            // 1. Obține membri activi (exclud lichidații)
            pushLog("📋 Pas 1/4: Detectare membri activi...");
            const membri = getMembriActivi(databases);
            pushLog(`✅ Găsiți ${membri.length} membri activi (fără lichidați)`);
            pushLog("");
            // 2. Procesare membri
            pushLog("⚙️ Pas 2/4: Procesare membri...");
            const records = [];
            let membri_procesati = 0;
            let membri_omisi = 0;
            let membri_noi = 0;
            let total_dobanda = new Decimal("0");
            let imprumuturi_noi = 0;
            for (const membru of membri) {
                const record = proceseazaMembru(membru, perioadaCurenta.luna, perioadaCurenta.anul, lunaSelectata, anSelectat, databases, rataDobanda, pushLog);
                // Membru fără activitate în luna sursă - se omite (conform Python)
                if (!record) {
                    membri_omisi++;
                    pushLog(`  ⚠️ Lipsă date sursă pentru fișa ${membru.nr_fisa} (${membru.nume}) - membru omis`);
                    continue;
                }
                records.push(record);
                membri_procesati++;
                if (record.membru_nou)
                    membri_noi++;
                if (record.dobanda.greaterThan(0))
                    total_dobanda = total_dobanda.plus(record.dobanda);
                // IMPORTANT: Împrumuturi noi se numără din LUNA SURSĂ (nu țintă)!
                // Verificăm dacă membru are impr_deb > 0 în luna sursă
                try {
                    const resultImprSursa = getActiveDB(databases, 'depcred').exec(`
            SELECT IMPR_DEB
            FROM depcred
            WHERE NR_FISA = ? AND LUNA = ? AND ANUL = ?
          `, [membru.nr_fisa, perioadaCurenta.luna, perioadaCurenta.anul]);
                    if (resultImprSursa.length > 0 && resultImprSursa[0].values.length > 0) {
                        const impr_deb_sursa = new Decimal(String(resultImprSursa[0].values[0][0] || "0"));
                        if (impr_deb_sursa.greaterThan(0)) {
                            imprumuturi_noi++;
                        }
                    }
                }
                catch (error) {
                    // Ignoră erori la citire impr_deb sursă
                    console.warn(`Nu s-a putut citi impr_deb pentru fișa ${membru.nr_fisa}:`, error);
                }
            }
            pushLog(`✅ Procesați ${membri_procesati} membri`);
            if (membri_noi > 0)
                pushLog(`  ↳ Membri noi: ${membri_noi}`);
            if (membri_omisi > 0)
                pushLog(`  ⚠️ Omiși (lipsă date sursă): ${membri_omisi}`);
            pushLog("");
            // 3. Salvare în baza de date
            pushLog("💾 Pas 3/4: Salvare date în DEPCRED...");
            insereazaDate(databases, records, pushLog);
            // 3.1. Actualizare flag prima pentru luna sursă (conform Python)
            actualizarePrimaLunaSursa(databases, perioadaCurenta.luna, perioadaCurenta.anul, pushLog);
            pushLog("");
            // 4. Statistici finale
            pushLog("📊 Pas 4/4: Generare statistici...");
            const stats = {
                total_membri: membri.length,
                membri_procesati,
                membri_omisi, // Membri fără date în luna sursă (conform Python)
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
            pushLog(`   • Total membri activi: ${stats.total_membri}`);
            pushLog(`   • Membri procesați: ${stats.membri_procesati}`);
            if (membri_omisi > 0)
                pushLog(`   • Membri omiși (lipsă date sursă): ${stats.membri_omisi}`);
            if (membri_noi > 0)
                pushLog(`   • Membri noi: ${membri_noi}`);
            pushLog(`   • Împrumuturi noi: ${stats.imprumuturi_noi}`);
            pushLog(`   • Dobândă totală: ${stats.total_dobanda.toFixed(2)} ${currency}`);
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
            // setDepcredDbForSave(databases.depcred); // Not needed with DBSet
        }
        catch (error) {
            pushLog("");
            pushLog("❌ EROARE în timpul generării:");
            pushLog(`   ${error}`);
            pushLog("");
            pushLog("🔧 Sugestii:");
            pushLog("   1. Verificați integritatea bazelor de date");
            pushLog("   2. Asigurați-vă că MEMBRII.db și DEPCRED.db sunt valide");
            pushLog("   3. Încercați să reîncărcați aplicația");
        }
        finally {
            setRunning(false);
        }
    };
    const handleDelete = async () => {
        if (running || !perioadaCurenta)
            return;
        // VERIFICARE CRITICĂ: Permisiuni de scriere
        try {
            assertCanWrite(databases, 'Ștergere lună');
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            pushLog("❌ OPERAȚIUNE BLOCATĂ!");
            pushLog(errorMessage);
            alert(errorMessage);
            return;
        }
        const confirmare = window.confirm(`Confirmați ștergerea datelor pentru ${perioadaCurenta.display}?\n\n` +
            `Această operațiune NU poate fi anulată!`);
        if (!confirmare) {
            pushLog("ℹ️ Ștergere anulată de utilizator");
            return;
        }
        setRunning(true);
        pushLog("");
        pushLog("🗑️ Ștergere date...");
        try {
            stergeDate(databases, perioadaCurenta.luna, perioadaCurenta.anul, pushLog);
            pushLog("✅ Ștergere finalizată cu succes");
            // Recalculare perioada
            const noua_perioada = detecteazaUltimaLuna(databases);
            setPerioadaCurenta(noua_perioada);
            if (noua_perioada) {
                const urmatoare = {
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
            // setDepcredDbForSave(null); // Not needed with DBSet
        }
        catch (error) {
            pushLog(`❌ Eroare la ștergere: ${error}`);
        }
        finally {
            setRunning(false);
        }
    };
    // ✅ MODIFICAT: handleSave cu FileSaver.js + Notificări complete
    const handleSave = async () => {
        if (!databases) { // Changed from depcredDbForSave
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
            const data = getActiveDB(databases, 'depcred').export();
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
                const message = `✅ Fișier salvat cu succes!\n\n` +
                    `📄 Nume: ${fileName}\n` +
                    `📏 Mărime: ${formatBytes(blob.size)}\n` +
                    `📅 Perioadă: ${MONTHS[lunaSelectata - 1]} ${anSelectat}\n\n` +
                    `📂 Locație:\n${getDownloadPath()}\n\n` +
                    `✅ Compatibil cu aplicația Python CAR Desktop`;
                alert(message);
            }, 500);
        }
        catch (err) {
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
            alert(`❌ Eroare la salvare bazei de date!\n\n` +
                `Detalii: ${err.message}\n\n` +
                `Verificați log-ul pentru mai multe informații și încercați din nou.`);
        }
    };
    // ========================================
    // RENDER
    // ========================================
    return (_jsxs("div", { className: "w-full h-full flex flex-col gap-4 p-4 bg-slate-50", children: [_jsx(Card, { children: _jsx(CardHeader, { className: "bg-gradient-to-r from-blue-600 to-blue-700 text-white md:bg-transparent md:text-inherit", children: _jsxs(CardTitle, { className: "flex items-center gap-2 justify-center md:justify-start", children: [_jsx(Calendar, { className: "h-6 w-6" }), "\uD83D\uDCC6 Generare Lun\u0103 Nou\u0103"] }) }) }), _jsxs("div", { className: "hidden lg:flex lg:flex-col gap-3 flex-1", children: [_jsxs("div", { className: "flex items-center gap-2 pb-2 border-b border-slate-300", children: [_jsx(Button, { onClick: handleUpdateInactivi, disabled: running, variant: "outline", size: "sm", className: "text-xs", children: "\uD83D\uDD04 Numere nealocate" }), _jsx(Button, { onClick: handleAfiseazaInactivi, disabled: running, variant: "outline", size: "sm", className: "text-xs", children: "\uD83D\uDC65 Afi\u0219eaz\u0103 Inactivi" }), _jsx(Button, { onClick: handleAfiseazaActivi, disabled: running || !perioadaCurenta, variant: "outline", size: "sm", className: "text-xs", children: "\u2705 Afi\u0219eaz\u0103 Activi" }), _jsx("div", { className: "flex-1" }), " ", _jsx(Button, { onClick: handleExportLog, disabled: running || log.length === 0, variant: "outline", size: "sm", className: "text-xs", children: "\uD83D\uDCC4 Export Log" }), _jsxs(Button, { onClick: clearLog, disabled: running || log.length === 0, variant: "outline", size: "sm", className: "text-xs", children: [_jsx(X, { className: "w-3 h-3 mr-1" }), "Clear Log"] })] }), _jsxs("div", { className: "flex items-center gap-8 py-2 px-4 bg-white rounded-lg border border-slate-200", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "text-sm text-slate-600", children: "Ultima lun\u0103:" }), _jsx("span", { className: "text-lg font-bold text-slate-800", children: perioadaCurenta?.display || "N/A" })] }), _jsx("div", { className: "h-6 w-px bg-slate-300" }), " ", _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "text-sm text-slate-600", children: "Urm\u0103toarea:" }), _jsx("span", { className: "text-lg font-bold text-blue-600", children: perioadaUrmatoare?.display || "N/A" })] }), _jsx("div", { className: "h-6 w-px bg-slate-300" }), " ", _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "text-sm text-slate-600", children: "Rat\u0103 dob\u00E2nd\u0103:" }), _jsxs("span", { className: "text-lg font-bold text-slate-800", children: [rataDobanda.times(1000).toFixed(1), "\u2030"] })] })] }), _jsxs("div", { className: "flex items-center gap-3 py-2 px-4 bg-white rounded-lg border border-slate-200", children: [_jsx("label", { className: "text-sm font-medium text-slate-700", children: "Luna:" }), _jsxs(Select, { value: lunaSelectata.toString(), onValueChange: (val) => setLunaSelectata(parseInt(val)), disabled: running, children: [_jsx(SelectTrigger, { className: "w-[180px]", children: _jsx(SelectValue, {}) }), _jsx(SelectContent, { children: MONTHS.map((nume, idx) => (_jsxs(SelectItem, { value: (idx + 1).toString(), children: [String(idx + 1).padStart(2, "0"), " - ", nume] }, idx + 1))) })] }), _jsx("label", { className: "text-sm font-medium text-slate-700 ml-3", children: "Anul:" }), _jsxs(Select, { value: anSelectat.toString(), onValueChange: (val) => setAnSelectat(parseInt(val)), disabled: running, children: [_jsx(SelectTrigger, { className: "w-[100px]", children: _jsx(SelectValue, {}) }), _jsx(SelectContent, { children: Array.from({ length: 5 }, (_, i) => {
                                            const an = (perioadaCurenta?.anul || new Date().getFullYear()) - 1 + i;
                                            return (_jsx(SelectItem, { value: an.toString(), children: an }, an));
                                        }) })] }), _jsx("div", { className: "flex-1" }), " ", _jsx(Button, { onClick: handleGenerate, disabled: running || !perioadaCurenta, className: "bg-green-600 hover:bg-green-700", children: running ? (_jsxs(_Fragment, { children: [_jsx(Loader2, { className: "w-4 h-4 mr-2 animate-spin" }), "Generare..."] })) : (_jsxs(_Fragment, { children: [_jsx(Calendar, { className: "w-4 h-4 mr-2" }), "Genereaz\u0103"] })) }), _jsxs(Button, { onClick: handleDelete, disabled: running || !perioadaCurenta, variant: "destructive", children: [_jsx(Trash2, { className: "w-4 h-4 mr-2" }), "\u0218terge"] }), _jsxs(Button, { onClick: handleModificaRata, disabled: running, className: "bg-yellow-500 hover:bg-yellow-600 text-black", children: [_jsx(Settings, { className: "w-4 h-4 mr-2" }), "Modific\u0103 Rat\u0103"] }), _jsxs(Button, { onClick: handleSave, disabled: !databases, className: "bg-blue-600 hover:bg-blue-700", children: [_jsx(Download, { className: "w-4 h-4 mr-2" }), "Salveaz\u0103"] })] }), _jsxs("div", { className: "flex-1 flex gap-3", children: [_jsxs("div", { className: "flex-1 flex flex-col bg-white rounded-lg border border-slate-200", children: [_jsxs("div", { className: "flex items-center justify-between px-4 py-2 border-b border-slate-200", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx(FileText, { className: "w-4 h-4 text-slate-600" }), _jsx("span", { className: "text-sm font-semibold text-slate-700", children: "Jurnal Opera\u021Biuni" })] }), running && (_jsxs("div", { className: "flex items-center gap-2 text-xs text-yellow-600", children: [_jsx(Loader2, { className: "w-3 h-3 animate-spin" }), _jsx("span", { children: "Procesare \u00EEn curs..." })] }))] }), _jsx(ScrollArea, { className: "flex-1 p-4", children: _jsx("pre", { className: "text-xs font-mono whitespace-pre-wrap text-slate-700", children: log.length === 0
                                                ? "✅ Sistem gata. Selectați luna și apăsați Generează."
                                                : log.join("\n") }) })] }), statistici && (_jsxs("div", { className: "w-[280px] bg-white rounded-lg border border-slate-200 p-4", children: [_jsx("h3", { className: "text-sm font-bold text-slate-700 mb-3 flex items-center gap-2", children: "\uD83D\uDCCA Statistici Generare" }), _jsxs("div", { className: "space-y-2 text-sm", children: [_jsxs("div", { className: "flex justify-between", children: [_jsx("span", { className: "text-slate-600", children: "Total membri:" }), _jsx("span", { className: "font-bold", children: statistici.total_membri })] }), _jsxs("div", { className: "flex justify-between", children: [_jsx("span", { className: "text-slate-600", children: "Procesa\u021Bi:" }), _jsx("span", { className: "font-bold text-green-600", children: statistici.membri_procesati })] }), _jsxs("div", { className: "flex justify-between", children: [_jsx("span", { className: "text-slate-600", children: "F\u0103r\u0103 activitate:" }), _jsx("span", { className: "font-bold text-yellow-600", children: statistici.membri_omisi })] }), _jsxs("div", { className: "flex justify-between", children: [_jsx("span", { className: "text-slate-600", children: "\u00CEmprumuturi:" }), _jsx("span", { className: "font-bold text-blue-600", children: statistici.imprumuturi_noi })] }), _jsxs("div", { className: "flex justify-between pt-2 border-t", children: [_jsx("span", { className: "text-slate-600", children: "Dob\u00E2nd\u0103:" }), _jsxs("span", { className: "font-bold text-purple-600", children: [statistici.total_dobanda.toFixed(2), " ", getCurrency(databases)] })] })] })] }))] })] }), _jsx("div", { className: "lg:hidden flex flex-col gap-4 flex-1", children: _jsxs(Tabs, { defaultValue: "control", className: "flex-1 flex flex-col", children: [_jsxs(TabsList, { className: "grid grid-cols-3 w-full", children: [_jsx(TabsTrigger, { value: "control", children: "\u2699\uFE0F Control" }), _jsx(TabsTrigger, { value: "log", children: "\uD83D\uDCCB Jurnal" }), _jsx(TabsTrigger, { value: "stats", children: "\uD83D\uDCCA Stats" })] }), _jsxs(TabsContent, { value: "control", className: "flex-1 flex flex-col gap-3", children: [_jsx(Card, { children: _jsxs(CardContent, { className: "pt-4 space-y-3", children: [_jsxs("div", { className: "flex justify-between items-center", children: [_jsx("span", { className: "text-sm text-slate-600", children: "Ultima lun\u0103:" }), _jsx("span", { className: "text-lg font-bold", children: perioadaCurenta?.display || "N/A" })] }), _jsxs("div", { className: "flex justify-between items-center", children: [_jsx("span", { className: "text-sm text-slate-600", children: "Urm\u0103toarea:" }), _jsx("span", { className: "text-lg font-bold text-blue-600", children: perioadaUrmatoare?.display || "N/A" })] }), _jsxs("div", { className: "flex justify-between items-center", children: [_jsx("span", { className: "text-sm text-slate-600", children: "Rat\u0103 dob\u00E2nd\u0103:" }), _jsxs("span", { className: "text-lg font-bold", children: [rataDobanda.times(1000).toFixed(1), "\u2030"] })] })] }) }), _jsxs(Card, { children: [_jsx(CardHeader, { className: "pb-3", children: _jsx(CardTitle, { className: "text-sm", children: "Selecta\u021Bi luna:" }) }), _jsxs(CardContent, { className: "space-y-3", children: [_jsxs(Select, { value: lunaSelectata.toString(), onValueChange: (val) => setLunaSelectata(parseInt(val)), disabled: running, children: [_jsx(SelectTrigger, { className: "w-full", children: _jsx(SelectValue, {}) }), _jsx(SelectContent, { children: MONTHS.map((nume, idx) => (_jsxs(SelectItem, { value: (idx + 1).toString(), children: [String(idx + 1).padStart(2, "0"), " - ", nume] }, idx + 1))) })] }), _jsxs(Select, { value: anSelectat.toString(), onValueChange: (val) => setAnSelectat(parseInt(val)), disabled: running, children: [_jsx(SelectTrigger, { className: "w-full", children: _jsx(SelectValue, {}) }), _jsx(SelectContent, { children: Array.from({ length: 5 }, (_, i) => {
                                                                const an = (perioadaCurenta?.anul || new Date().getFullYear()) - 1 + i;
                                                                return (_jsx(SelectItem, { value: an.toString(), children: an }, an));
                                                            }) })] })] })] }), _jsxs("div", { className: "flex flex-col gap-2", children: [_jsx(Button, { onClick: handleGenerate, disabled: running || !perioadaCurenta, className: "w-full bg-green-600 hover:bg-green-700", size: "lg", children: running ? (_jsxs(_Fragment, { children: [_jsx(Loader2, { className: "w-4 h-4 mr-2 animate-spin" }), "Generare \u00EEn curs..."] })) : (_jsxs(_Fragment, { children: [_jsx(Calendar, { className: "w-4 h-4 mr-2" }), "Genereaz\u0103 Lun\u0103 Selectat\u0103"] })) }), _jsxs(Button, { onClick: handleDelete, disabled: running || !perioadaCurenta, variant: "destructive", className: "w-full", size: "lg", children: [_jsx(Trash2, { className: "w-4 h-4 mr-2" }), "\u0218terge Lun\u0103 Selectat\u0103"] }), _jsxs(Button, { onClick: handleModificaRata, disabled: running, className: "w-full bg-yellow-500 hover:bg-yellow-600 text-black", size: "lg", children: [_jsx(Settings, { className: "w-4 h-4 mr-2" }), "Modific\u0103 Rata Dob\u00E2nd\u0103"] })] })] }), _jsx(TabsContent, { value: "log", className: "flex-1", children: _jsxs(Card, { className: "h-full", children: [_jsxs(CardHeader, { className: "flex flex-row items-center justify-between pb-3", children: [_jsx(CardTitle, { className: "text-base", children: "Jurnal Opera\u021Biuni" }), _jsx(Button, { variant: "outline", size: "sm", onClick: clearLog, children: _jsx(X, { className: "w-4 h-4" }) })] }), _jsx(CardContent, { children: _jsx(ScrollArea, { className: "h-[500px] w-full", children: _jsx("pre", { className: "text-xs font-mono whitespace-pre-wrap", children: log.length === 0
                                                    ? "Așteptare operațiuni..."
                                                    : log.join("\n") }) }) })] }) }), _jsx(TabsContent, { value: "stats", className: "flex-1", children: statistici ? (_jsxs("div", { className: "space-y-3", children: [_jsxs(Card, { children: [_jsx(CardHeader, { className: "pb-3", children: _jsx(CardTitle, { className: "text-sm", children: "Total Membri" }) }), _jsx(CardContent, { children: _jsx("p", { className: "text-3xl font-bold", children: statistici.total_membri }) })] }), _jsxs(Card, { children: [_jsx(CardHeader, { className: "pb-3", children: _jsx(CardTitle, { className: "text-sm text-green-700", children: "Membri Procesa\u021Bi" }) }), _jsx(CardContent, { children: _jsx("p", { className: "text-3xl font-bold text-green-600", children: statistici.membri_procesati }) })] }), _jsxs(Card, { children: [_jsx(CardHeader, { className: "pb-3", children: _jsx(CardTitle, { className: "text-sm text-yellow-700", children: "Membri f\u0103r\u0103 activitate" }) }), _jsx(CardContent, { children: _jsx("p", { className: "text-3xl font-bold text-yellow-600", children: statistici.membri_omisi }) })] }), _jsxs(Card, { children: [_jsx(CardHeader, { className: "pb-3", children: _jsx(CardTitle, { className: "text-sm text-blue-700", children: "\u00CEmprumuturi Noi" }) }), _jsx(CardContent, { children: _jsx("p", { className: "text-3xl font-bold text-blue-600", children: statistici.imprumuturi_noi }) })] }), _jsxs(Card, { children: [_jsx(CardHeader, { className: "pb-3", children: _jsx(CardTitle, { className: "text-sm text-purple-700", children: "Dob\u00E2nd\u0103 Total\u0103" }) }), _jsx(CardContent, { children: _jsxs("p", { className: "text-3xl font-bold text-purple-600", children: [statistici.total_dobanda.toFixed(2), " ", getCurrency(databases)] }) })] })] })) : (_jsx(Alert, { children: _jsx(AlertDescription, { children: "Statistici vor fi afi\u0219ate dup\u0103 generarea unei luni." }) })) })] }) })] }));
}
