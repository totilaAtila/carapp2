// src/components/VizualizareLunara.tsx
/**
 * Modul Vizualizare Lunară - Port complet din vizualizare_lunara.py
 *
 * LOGICĂ BUSINESS:
 * - Afișare date financiare lunare din DEPCRED cu join pe MEMBRII
 * - Tabel sortabil cu 10 coloane (desktop) sau carduri (mobile)
 * - Calcul automat "Total de plată" = dobândă + rată împrumut + cotizație
 * - Marcare "NEACHITAT" în roșu pentru rate/cotizații neachitate
 * - Export PDF (landscape A4) și Excel (.xlsx)
 * - Totaluri lunare cu opțiune copiere în clipboard
 *
 * UI:
 * - Desktop (≥1024px): Tabel sortabil 10 coloane, butoane inline
 * - Mobile (<1024px): Search autocomplete + carduri scrollabile
 */

import { useState, useEffect, useMemo } from "react";
import Decimal from "decimal.js";
import type { DBSet } from "../services/databaseManager";
import { getActiveDB } from "../services/databaseManager";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/buttons";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { ScrollArea } from "./ui/scroll-area";
import { Input } from "./ui/input";
import { Alert, AlertDescription } from "./ui/alert";
import {
  Loader2,
  FileText,
  Download,
  Calculator,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Search,
  X
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { DejaVuSansNormal, DejaVuSansBold } from "../utils/dejavu-fonts";

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

interface Props {
  databases: DBSet;
  onBack: () => void;
}

interface MembruLunar {
  nr_fisa: number;
  nume: string;
  dobanda: Decimal;
  impr_cred: Decimal;
  impr_sold: Decimal;
  dep_deb: Decimal;
  dep_cred: Decimal;
  dep_sold: Decimal;
  total_plata: Decimal;
  neachitat_impr: boolean; // Flag pentru rată împrumut neachitată
  neachitat_dep: boolean;  // Flag pentru cotizație neachitată
}

interface Totaluri {
  total_dobanda: Decimal;
  total_impr_cred: Decimal;
  total_impr_sold: Decimal;
  total_dep_deb: Decimal;
  total_dep_cred: Decimal;
  total_dep_sold: Decimal;
  total_general_plata: Decimal;
}

type SortColumn = keyof MembruLunar;
type SortOrder = "asc" | "desc";

// ==========================================
// HELPER FUNCTIONS
// ==========================================

/**
 * Citește datele lunare din DEPCRED cu JOIN pe MEMBRII
 */
function citesteDataLunara(
  databases: DBSet,
  luna: number,
  anul: number,
  onLog: (msg: string) => void
): MembruLunar[] {
  try {
    onLog(`📊 Citire date pentru ${String(luna).padStart(2, "0")}-${anul}...`);

    // Query SQL identic cu Python
    const result = getActiveDB(databases, 'depcred').exec(`
      SELECT
        d.NR_FISA,
        d.DOBANDA,
        d.IMPR_CRED,
        d.IMPR_SOLD,
        d.DEP_DEB,
        d.DEP_CRED,
        d.DEP_SOLD
      FROM depcred d
      WHERE d.LUNA = ? AND d.ANUL = ?
      ORDER BY d.NR_FISA
    `, [luna, anul]);

    if (result.length === 0 || result[0].values.length === 0) {
      onLog("⚠️ Nu există date pentru luna selectată");
      return [];
    }

    // Preluare nume din MEMBRII
    const membriMap = new Map<number, string>();
    try {
      const membriResult = getActiveDB(databases, 'membrii').exec(`SELECT NR_FISA, NUM_PREN FROM membrii`);
      if (membriResult.length > 0) {
        membriResult[0].values.forEach(row => {
          membriMap.set(row[0] as number, row[1] as string);
        });
      }
    } catch (error) {
      onLog("⚠️ Eroare citire MEMBRII.db - se folosesc valori default");
    }

    // Procesare date
    const membri: MembruLunar[] = result[0].values.map(row => {
      const nr_fisa = row[0] as number;
      const dobanda = new Decimal(String(row[1] || "0"));
      const impr_cred = new Decimal(String(row[2] || "0"));
      const impr_sold = new Decimal(String(row[3] || "0"));
      const dep_deb = new Decimal(String(row[4] || "0"));
      const dep_cred = new Decimal(String(row[5] || "0"));
      const dep_sold = new Decimal(String(row[6] || "0"));

      // Logică "NEACHITAT" identică cu Python
      const neachitat_impr = impr_sold.greaterThan(0) && impr_cred.equals(0);
      const neachitat_dep = dep_sold.greaterThan(0) && dep_deb.equals(0);

      // Calcul total de plată
      const total_plata = dobanda.plus(impr_cred).plus(dep_deb);

      return {
        nr_fisa,
        nume: membriMap.get(nr_fisa) || "Nume negăsit",
        dobanda,
        impr_cred,
        impr_sold,
        dep_deb,
        dep_cred,
        dep_sold,
        total_plata,
        neachitat_impr,
        neachitat_dep
      };
    });

    onLog(`✅ Încărcate ${membri.length} înregistrări`);
    return membri;

  } catch (error) {
    onLog(`❌ Eroare citire date: ${error}`);
    throw error;
  }
}

/**
 * Calculează totalurile pentru luna curentă
 */
function calculeazaTotaluri(membri: MembruLunar[]): Totaluri {
  return {
    total_dobanda: membri.reduce((sum, m) => sum.plus(m.dobanda), new Decimal(0)),
    total_impr_cred: membri.reduce((sum, m) => sum.plus(m.impr_cred), new Decimal(0)),
    total_impr_sold: membri.reduce((sum, m) => sum.plus(m.impr_sold), new Decimal(0)),
    total_dep_deb: membri.reduce((sum, m) => sum.plus(m.dep_deb), new Decimal(0)),
    total_dep_cred: membri.reduce((sum, m) => sum.plus(m.dep_cred), new Decimal(0)),
    total_dep_sold: membri.reduce((sum, m) => sum.plus(m.dep_sold), new Decimal(0)),
    total_general_plata: membri.reduce((sum, m) => sum.plus(m.total_plata), new Decimal(0))
  };
}

/**
 * Sortează membrii după coloana specificată
 */
function sorteazaMembri(
  membri: MembruLunar[],
  column: SortColumn,
  order: SortOrder
): MembruLunar[] {
  return [...membri].sort((a, b) => {
    let valA = a[column];
    let valB = b[column];

    // Comparare specială pentru Decimal
    if (valA instanceof Decimal && valB instanceof Decimal) {
      const cmp = valA.comparedTo(valB);
      return order === "asc" ? cmp : -cmp;
    }

    // Comparare pentru string (nume)
    if (typeof valA === "string" && typeof valB === "string") {
      const cmp = valA.toLowerCase().localeCompare(valB.toLowerCase());
      return order === "asc" ? cmp : -cmp;
    }

    // Comparare pentru number
    if (typeof valA === "number" && typeof valB === "number") {
      return order === "asc" ? valA - valB : valB - valA;
    }

    return 0;
  });
}

// ==========================================
// COMPONENTA PRINCIPALĂ
// ==========================================

export default function VizualizareLunara({ databases, onBack }: Props) {
  // State
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const currency = databases.activeCurrency || 'RON';

  const [lunaSelectata, setLunaSelectata] = useState<number>(currentMonth);
  const [anSelectat, setAnSelectat] = useState<number>(currentYear);
  const [dateLunare, setDateLunare] = useState<MembruLunar[]>([]);
  const [loading, setLoading] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [sortColumn, setSortColumn] = useState<SortColumn>("nume");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");
  const [searchTerm, setSearchTerm] = useState("");
  const [noDataFound, setNoDataFound] = useState(false); // Flag pentru lună inexistentă

  const pushLog = (msg: string) => {
    setLog(prev => [...prev, msg]);
  };

  const clearLog = () => {
    setLog([]);
  };

  // Scroll la top când se montează componenta (pentru mobile)
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // ========================================
  // COMPUTED VALUES
  // ========================================

  // Date sortate
  const dateSortate = useMemo(() => {
    return sorteazaMembri(dateLunare, sortColumn, sortOrder);
  }, [dateLunare, sortColumn, sortOrder]);

  // Date filtrate după search
  const dateFiltrate = useMemo(() => {
    if (!searchTerm.trim()) return dateSortate;

    const term = searchTerm.toLowerCase();
    return dateSortate.filter(m =>
      m.nume.toLowerCase().includes(term) ||
      m.nr_fisa.toString().includes(term)
    );
  }, [dateSortate, searchTerm]);

  // Totaluri
  const totaluri = useMemo(() => {
    return calculeazaTotaluri(dateLunare);
  }, [dateLunare]);

  // ========================================
  // HANDLER FUNCTIONS
  // ========================================

  const handleAfiseaza = async () => {
    if (loading) return;

    setLoading(true);
    clearLog();
    setDateLunare([]);
    setNoDataFound(false); // Reset flag

    pushLog("=".repeat(60));
    pushLog(`🔍 ÎNCĂRCARE DATE LUNARE - ${MONTHS[lunaSelectata - 1].toUpperCase()} ${anSelectat}`);
    pushLog("=".repeat(60));
    pushLog("");

    try {
      const membri = citesteDataLunara(
        databases,
        lunaSelectata,
        anSelectat,
        pushLog
      );

      setDateLunare(membri);

      if (membri.length > 0) {
        pushLog("");
        pushLog("✅ Date încărcate cu succes!");
        pushLog(`📊 Total înregistrări: ${membri.length}`);
        setNoDataFound(false);
      } else {
        // LUNĂ INEXISTENTĂ - Mesaj clar
        pushLog("");
        pushLog("=".repeat(60));
        pushLog("⚠️ LUNĂ INEXISTENTĂ ÎN BAZA DE DATE");
        pushLog("=".repeat(60));
        pushLog("");
        pushLog(`❌ Luna ${MONTHS[lunaSelectata - 1]} ${anSelectat} nu există în DEPCRED.db`);
        pushLog("");
        pushLog("📋 Posibile cauze:");
        pushLog("   • Luna nu a fost încă generată în modulul 'Generare lună'");
        pushLog("   • Ați selectat o lună viitoare care nu există");
        pushLog("   • Baza de date nu conține date pentru această perioadă");
        pushLog("");
        pushLog("💡 Soluție:");
        pushLog("   • Generați luna în modulul 'Generare lună'");
        pushLog("   • SAU selectați o lună existentă din baza de date");
        pushLog("=".repeat(60));
        setNoDataFound(true);
      }

    } catch (error) {
      pushLog("");
      pushLog("❌ EROARE la încărcarea datelor:");
      pushLog(`   ${error}`);
      setNoDataFound(false);
    } finally {
      setLoading(false);
    }
  };

  const handleAfiseazaTotaluri = () => {
    if (dateLunare.length === 0) {
      alert("Nu există date afișate pentru a calcula totalurile.");
      return;
    }

    const mesaj = `Totaluri financiare pentru ${MONTHS[lunaSelectata - 1]} ${anSelectat}

- Total dobândă: ${totaluri.total_dobanda.toFixed(2)} ${currency}
- Total rate achitate (împrumuturi): ${totaluri.total_impr_cred.toFixed(2)} ${currency}
- Sold total împrumut: ${totaluri.total_impr_sold.toFixed(2)} ${currency}
- Total depuneri (cotizații): ${totaluri.total_dep_deb.toFixed(2)} ${currency}
- Total retrageri FS: ${totaluri.total_dep_cred.toFixed(2)} ${currency}
- Sold total depuneri: ${totaluri.total_dep_sold.toFixed(2)} ${currency}
-------------------------------------------
- Total general plătit: ${totaluri.total_general_plata.toFixed(2)} ${currency}`;

    const confirmare = window.confirm(
      mesaj + "\n\n" + "Apăsați OK pentru a copia în clipboard, Cancel pentru a închide."
    );

    if (confirmare) {
      navigator.clipboard.writeText(mesaj);
      pushLog("📋 Totaluri copiate în clipboard");
    }
  };

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      // Toggle order dacă aceeași coloană
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      // Coloană nouă → default ascending
      setSortColumn(column);
      setSortOrder("asc");
    }
  };

  const handleExportPDF = async () => {
    if (dateLunare.length === 0) {
      alert("Nu există date de exportat. Afișați mai întâi luna dorită.");
      return;
    }

    pushLog("");
    pushLog("=".repeat(60));
    pushLog("📄 EXPORT PDF ÎN CURS...");
    pushLog("=".repeat(60));

    try {
      pushLog("🔄 Pas 1/5: Inițializare document PDF (landscape A4)...");

      // Creare PDF landscape
      const doc = new jsPDF({
        orientation: "landscape",
        unit: "pt",
        format: "a4"
      });

      pushLog("✅ Document creat");
      pushLog("🔄 Pas 2/5: Înregistrare fonturi DejaVu Sans (suport diacritice)...");

      // Înregistrare fonturi DejaVu Sans pentru diacritice românești
      doc.addFileToVFS("DejaVuSans-normal.ttf", DejaVuSansNormal);
      doc.addFont("DejaVuSans-normal.ttf", "DejaVuSans", "normal");

      doc.addFileToVFS("DejaVuSans-bold.ttf", DejaVuSansBold);
      doc.addFont("DejaVuSans-bold.ttf", "DejaVuSans", "bold");

      // Setează DejaVu ca font default
      doc.setFont("DejaVuSans", "normal");

      pushLog("✅ Fonturi DejaVu Sans înregistrate (suport ă, î, ș, ț, â)");
      pushLog("🔄 Pas 3/5: Pregătire date tabel...");

      // Titlu
      const luna_text = MONTHS[lunaSelectata - 1];
      const title = `Situație financiară lunară - ${luna_text} ${anSelectat}`;

      // Header tabel
      const headers = [
        ["LL-AA", "Nr. fișă", "Nume\nprenume", "Dobândă", "Rată\nîmprumut",
         "Sold\nîmprumut", "Cotizație", "Retragere\nFS", "Sold\ndepunere", "Total\nde plată"]
      ];

      // Date tabel (folosim dateSortate pentru a respecta sortarea curentă)
      const tableData = dateSortate.map(m => {
        return [
          `${String(lunaSelectata).padStart(2, "0")}-${anSelectat}`,
          m.nr_fisa.toString(),
          m.nume,
          formatCurrency(m.dobanda),
          m.neachitat_impr ? "NEACHITAT" : formatCurrency(m.impr_cred),
          formatCurrency(m.impr_sold),
          m.neachitat_dep ? "NEACHITAT" : formatCurrency(m.dep_deb),
          formatCurrency(m.dep_cred),
          formatCurrency(m.dep_sold),
          formatCurrency(m.total_plata)
        ];
      });

      pushLog(`✅ Pregătite ${tableData.length} rânduri de date`);
      pushLog("🔄 Pas 4/5: Generare tabel cu autoTable...");

      // Generare tabel cu autoTable (replică logica Python)
      autoTable(doc, {
        head: headers,
        body: tableData,
        startY: 20,
        margin: { top: 15, left: 15, right: 15, bottom: 15 },
        styles: {
          fontSize: 9,
          cellPadding: 2,
          font: "DejaVuSans", // Folosește DejaVu Sans pentru diacritice
          fontStyle: "normal"
        },
        headStyles: {
          fillColor: [220, 232, 255], // #dce8ff
          textColor: [0, 0, 0],
          fontStyle: "bold",
          halign: "center",
          fontSize: 10
        },
        columnStyles: {
          0: { halign: "center", cellWidth: 40 },  // LL-AA
          1: { halign: "center", cellWidth: 50 },  // Nr. fișă
          2: { halign: "left", cellWidth: 160 },   // Nume prenume
          3: { halign: "right", cellWidth: 60 },   // Dobândă
          4: { halign: "right", cellWidth: 72 },   // Rată împrumut
          5: { halign: "right", cellWidth: 72 },   // Sold împrumut
          6: { halign: "right", cellWidth: 72 },   // Cotizație
          7: { halign: "right", cellWidth: 72 },   // Retragere FS
          8: { halign: "right", cellWidth: 72 },   // Sold depunere
          9: { halign: "right", cellWidth: 80, fontStyle: "bold" } // 
        },
        alternateRowStyles: {
          fillColor: [232, 244, 255] // #e8f4ff (albastru deschis)
        },
        didParseCell: (data) => {
          // Marcare "NEACHITAT" în roșu
          if (data.section === "body" && data.cell.raw === "NEACHITAT") {
            data.cell.styles.textColor = [255, 0, 0];
            data.cell.styles.fontStyle = "bold";
          }
        },
        didDrawPage: (data) => {
          // Adaugă titlu pe fiecare pagină
          doc.setFont("DejaVuSans", "bold");
          doc.setFontSize(14);
          doc.text(title, doc.internal.pageSize.getWidth() / 2, 10, { align: "center" });
          doc.setFont("DejaVuSans", "normal");
        }
      });

      pushLog("✅ Tabel generat cu succes (cu fonturi DejaVu Sans)");
      pushLog("🔄 Pas 5/5: Salvare fișier PDF...");

      // Salvare PDF
      const fileName = `Situatie_Lunara_${luna_text}_${anSelectat}.pdf`;
      doc.save(fileName);

      pushLog("✅ PDF salvat cu succes!");
      pushLog("");
      pushLog("=".repeat(60));
      pushLog("✅ EXPORT PDF FINALIZAT!");
      pushLog("=".repeat(60));
      pushLog(`📄 Nume fișier: ${fileName}`);
      pushLog(`📊 Total pagini: ${doc.getNumberOfPages()}`);
      pushLog(`📦 Total înregistrări: ${tableData.length}`);
      pushLog("");

    } catch (error) {
      pushLog("");
      pushLog("❌ EROARE la generarea PDF:");
      pushLog(`   ${error}`);
      alert(`Eroare la generarea PDF: ${error}`);
    }
  };

  const handleExportExcel = async () => {
    if (dateLunare.length === 0) {
      alert("Nu există date de exportat. Afișați mai întâi luna dorită.");
      return;
    }

    pushLog("");
    pushLog("=".repeat(60));
    pushLog("📊 EXPORT EXCEL ÎN CURS...");
    pushLog("=".repeat(60));

    try {
      pushLog("🔄 Pas 1/5: Creare workbook Excel...");

      // Creare workbook și worksheet
      const wb = XLSX.utils.book_new();
      const luna_text = MONTHS[lunaSelectata - 1];
      const wsName = `Situatie_${luna_text}_${anSelectat}`.substring(0, 31); // Excel limit

      pushLog("✅ Workbook creat");
      pushLog("🔄 Pas 2/5: Pregătire date...");

      // Header
      const headers = [
        "LL-AA", "Nr. fișă", "Nume prenume", "Dobândă", "Rată împrumut",
        "Sold împrumut", "Cotizație", "Retragere FS", "Sold depunere", "Total de plată"
      ];

      // Date (folosim dateSortate pentru a respecta sortarea)
      const excelData: (string | number)[][] = [headers];

      dateSortate.forEach(m => {
        const row: (string | number)[] = [
          `${String(lunaSelectata).padStart(2, "0")}-${anSelectat}`,
          m.nr_fisa,
          m.nume,
          Number(formatCurrency(m.dobanda)),
          m.neachitat_impr ? "NEACHITAT" : Number(formatCurrency(m.impr_cred)),
          Number(formatCurrency(m.impr_sold)),
          m.neachitat_dep ? "NEACHITAT" : Number(formatCurrency(m.dep_deb)),
          Number(formatCurrency(m.dep_cred)),
          Number(formatCurrency(m.dep_sold)),
          Number(formatCurrency(m.total_plata))
        ];
        excelData.push(row);
      });

      pushLog(`✅ Pregătite ${excelData.length - 1} rânduri de date`);
      pushLog("🔄 Pas 3/5: Creare worksheet...");

      // Creare worksheet
      const ws = XLSX.utils.aoa_to_sheet(excelData);

      pushLog("✅ Worksheet creat");
      pushLog("🔄 Pas 4/5: Aplicare stiluri și formatare...");

      // Setare lățimi coloane
      ws["!cols"] = [
        { wch: 10 }, // LL-AA
        { wch: 10 }, // Nr. fișă
        { wch: 28 }, // Nume
        { wch: 12 }, // Dobândă
        { wch: 15 }, // Rată împrumut
        { wch: 15 }, // Sold împrumut
        { wch: 15 }, // Cotizație
        { wch: 15 }, // Retragere FS
        { wch: 15 }, // Sold depunere
        { wch: 15 }  // Total de plată
      ];

      // Freeze panes (fixare header)
      ws["!freeze"] = { xSplit: 0, ySplit: 1 };

      pushLog("✅ Formatare aplicată");
      pushLog("🔄 Pas 5/5: Salvare fișier Excel...");

      // Adăugare worksheet la workbook
      XLSX.utils.book_append_sheet(wb, ws, wsName);

      // Salvare fișier
      const fileName = `Situatie_Lunara_${luna_text}_${anSelectat}.xlsx`;
      XLSX.writeFile(wb, fileName);

      pushLog("✅ Excel salvat cu succes!");
      pushLog("");
      pushLog("=".repeat(60));
      pushLog("✅ EXPORT EXCEL FINALIZAT!");
      pushLog("=".repeat(60));
      pushLog(`📄 Nume fișier: ${fileName}`);
      pushLog(`📊 Total înregistrări: ${excelData.length - 1}`);
      pushLog(`📋 Format: XLSX (Excel 2007+)`);
      pushLog("");
      pushLog("✅ COMPATIBILITATE:");
      pushLog("   • Microsoft Excel 2007+");
      pushLog("   • LibreOffice Calc");
      pushLog("   • Google Sheets");
      pushLog("");

    } catch (error) {
      pushLog("");
      pushLog("❌ EROARE la generarea Excel:");
      pushLog(`   ${error}`);
      alert(`Eroare la generarea Excel: ${error}`);
    }
  };

  // ========================================
  // RENDER HELPERS
  // ========================================

  const renderSortIcon = (column: SortColumn) => {
    if (sortColumn !== column) {
      return <ArrowUpDown className="w-4 h-4 ml-1 opacity-30" />;
    }
    return sortOrder === "asc"
      ? <ArrowUp className="w-4 h-4 ml-1" />
      : <ArrowDown className="w-4 h-4 ml-1" />;
  };

  const formatCurrency = (value: Decimal): string => {
    return value.toFixed(2);
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
          📊 Vizualizare Lunară
        </h1>
        <div className="w-[120px]" /> {/* Spacer pentru centrare */}
      </div>

      {/* ========================================
          DESKTOP LAYOUT (≥1024px)
          ======================================== */}
      <div className="hidden lg:flex lg:flex-col gap-4 flex-1">
        {/* Control Panel Desktop */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-center gap-4 flex-wrap">
              {/* Selector Luna */}
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-slate-700">Luna:</label>
                <Select
                  value={lunaSelectata.toString()}
                  onValueChange={(val) => setLunaSelectata(parseInt(val))}
                  disabled={loading}
                >
                  <SelectTrigger className="w-[150px]">
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

              {/* Selector An */}
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-slate-700">An:</label>
                <Select
                  value={anSelectat.toString()}
                  onValueChange={(val) => setAnSelectat(parseInt(val))}
                  disabled={loading}
                >
                  <SelectTrigger className="w-[100px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 30 }, (_, i) => {
                      const an = currentYear - 25 + i;
                      return (
                        <SelectItem key={an} value={an.toString()}>
                          {an}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              {/* Butoane */}
              <Button
                onClick={handleAfiseaza}
                disabled={loading}
                className="bg-blue-600 hover:bg-blue-700 min-h-[44px]"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Se încarcă...
                  </>
                ) : (
                  <>
                    <FileText className="w-4 h-4 mr-2" />
                    Afișează
                  </>
                )}
              </Button>

              <Button
                onClick={handleAfiseazaTotaluri}
                disabled={dateLunare.length === 0}
                className="bg-purple-600 hover:bg-purple-700 min-h-[44px]"
              >
                <Calculator className="w-4 h-4 mr-2" />
                Afișare total luna
              </Button>

              <Button
                onClick={handleExportPDF}
                disabled={dateLunare.length === 0}
                className="bg-red-600 hover:bg-red-700 min-h-[44px]"
              >
                <Download className="w-4 h-4 mr-2" />
                Exportă PDF
              </Button>

              <Button
                onClick={handleExportExcel}
                disabled={dateLunare.length === 0}
                className="bg-green-600 hover:bg-green-700 min-h-[44px]"
              >
                <Download className="w-4 h-4 mr-2" />
                Exportă Excel
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Tabel Desktop */}
        {dateLunare.length > 0 && (
          <Card className="flex-1 flex flex-col">
            <CardHeader>
              <CardTitle className="text-base flex items-center justify-between">
                <span>Date lunare - {MONTHS[lunaSelectata - 1]} {anSelectat}</span>
                <span className="text-sm font-normal text-slate-600">
                  {dateLunare.length} înregistrări
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col min-h-0">
              <ScrollArea className="flex-1">
                <table className="w-full border-collapse text-sm">
                  <thead className="bg-slate-100 sticky top-0">
                    <tr>
                      <th className="border p-2 text-center cursor-pointer hover:bg-slate-200" onClick={() => handleSort("nr_fisa")}>
                        <div className="flex items-center justify-center">
                          LL-AA {renderSortIcon("nr_fisa")}
                        </div>
                      </th>
                      <th className="border p-2 text-center cursor-pointer hover:bg-slate-200" onClick={() => handleSort("nr_fisa")}>
                        <div className="flex items-center justify-center">
                          Nr. fișă {renderSortIcon("nr_fisa")}
                        </div>
                      </th>
                      <th className="border p-2 text-left cursor-pointer hover:bg-slate-200" onClick={() => handleSort("nume")}>
                        <div className="flex items-center">
                          Nume prenume {renderSortIcon("nume")}
                        </div>
                      </th>
                      <th className="border p-2 text-right cursor-pointer hover:bg-slate-200" onClick={() => handleSort("dobanda")}>
                        <div className="flex items-center justify-end">
                          Dobândă {renderSortIcon("dobanda")}
                        </div>
                      </th>
                      <th className="border p-2 text-right cursor-pointer hover:bg-slate-200" onClick={() => handleSort("impr_cred")}>
                        <div className="flex items-center justify-end">
                          Rată împrumut {renderSortIcon("impr_cred")}
                        </div>
                      </th>
                      <th className="border p-2 text-right cursor-pointer hover:bg-slate-200" onClick={() => handleSort("impr_sold")}>
                        <div className="flex items-center justify-end">
                          Sold împrumut {renderSortIcon("impr_sold")}
                        </div>
                      </th>
                      <th className="border p-2 text-right cursor-pointer hover:bg-slate-200" onClick={() => handleSort("dep_deb")}>
                        <div className="flex items-center justify-end">
                          Cotizație {renderSortIcon("dep_deb")}
                        </div>
                      </th>
                      <th className="border p-2 text-right cursor-pointer hover:bg-slate-200" onClick={() => handleSort("dep_cred")}>
                        <div className="flex items-center justify-end">
                          Retragere FS {renderSortIcon("dep_cred")}
                        </div>
                      </th>
                      <th className="border p-2 text-right cursor-pointer hover:bg-slate-200" onClick={() => handleSort("dep_sold")}>
                        <div className="flex items-center justify-end">
                          Sold depunere {renderSortIcon("dep_sold")}
                        </div>
                      </th>
                      <th className="border p-2 text-right cursor-pointer hover:bg-slate-200" onClick={() => handleSort("total_plata")}>
                        <div className="flex items-center justify-end">
                          Total de plată {renderSortIcon("total_plata")}
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {dateSortate.map((membru, idx) => (
                      <tr
                        key={`${membru.nr_fisa}-${idx}`}
                        className={idx % 2 === 0 ? "bg-blue-50" : "bg-orange-50"}
                      >
                        <td className="border p-2 text-center">
                          {String(lunaSelectata).padStart(2, "0")}-{anSelectat}
                        </td>
                        <td className="border p-2 text-center">{membru.nr_fisa}</td>
                        <td className="border p-2">{membru.nume}</td>
                        <td className="border p-2 text-right">{formatCurrency(membru.dobanda)}</td>
                        <td className={`border p-2 text-right ${membru.neachitat_impr ? "text-red-600 font-bold" : ""}`}>
                          {membru.neachitat_impr ? "NEACHITAT" : formatCurrency(membru.impr_cred)}
                        </td>
                        <td className="border p-2 text-right">{formatCurrency(membru.impr_sold)}</td>
                        <td className={`border p-2 text-right ${membru.neachitat_dep ? "text-red-600 font-bold" : ""}`}>
                          {membru.neachitat_dep ? "NEACHITAT" : formatCurrency(membru.dep_deb)}
                        </td>
                        <td className="border p-2 text-right">{formatCurrency(membru.dep_cred)}</td>
                        <td className="border p-2 text-right">{formatCurrency(membru.dep_sold)}</td>
                        <td className="border p-2 text-right font-semibold">{formatCurrency(membru.total_plata)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollArea>
            </CardContent>
          </Card>
        )}

        {/* Jurnal Desktop */}
        {log.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Jurnal Operațiuni
                </span>
                <Button variant="outline" size="sm" onClick={clearLog}>
                  <X className="w-4 h-4" />
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[150px]">
                <pre className="text-xs font-mono whitespace-pre-wrap text-slate-700">
                  {log.join("\n")}
                </pre>
              </ScrollArea>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ========================================
          MOBILE LAYOUT (<1024px)
          ======================================== */}
      <div className="lg:hidden flex flex-col gap-4 flex-1">
        {/* Control Panel Mobile */}
        <Card>
          <CardContent className="pt-4 space-y-3">
            {/* Selectoare */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700">Luna:</label>
                <Select
                  value={lunaSelectata.toString()}
                  onValueChange={(val) => setLunaSelectata(parseInt(val))}
                  disabled={loading}
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

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700">An:</label>
                <Select
                  value={anSelectat.toString()}
                  onValueChange={(val) => setAnSelectat(parseInt(val))}
                  disabled={loading}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 30 }, (_, i) => {
                      const an = currentYear - 25 + i;
                      return (
                        <SelectItem key={an} value={an.toString()}>
                          {an}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Butoane */}
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <Button
                onClick={handleAfiseaza}
                disabled={loading}
                className="bg-blue-600 hover:bg-blue-700 min-h-[44px]"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <FileText className="w-4 h-4" />
                )}
                <span className="ml-2">Afișează</span>
              </Button>

              <Button
                onClick={handleAfiseazaTotaluri}
                disabled={dateLunare.length === 0}
                className="bg-purple-600 hover:bg-purple-700 min-h-[44px]"
              >
                <Calculator className="w-4 h-4" />
                <span className="ml-2">Totaluri</span>
              </Button>

              <Button
                onClick={handleExportPDF}
                disabled={dateLunare.length === 0}
                className="bg-red-600 hover:bg-red-700 min-h-[44px]"
              >
                <Download className="w-4 h-4" />
                <span className="ml-2">PDF</span>
              </Button>

              <Button
                onClick={handleExportExcel}
                disabled={dateLunare.length === 0}
                className="bg-green-600 hover:bg-green-700 min-h-[44px]"
              >
                <Download className="w-4 h-4" />
                <span className="ml-2">Excel</span>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Search Mobile */}
        {dateLunare.length > 0 && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              type="text"
              placeholder="Caută după nume sau nr. fișă..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-10"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute right-3 top-1/2 transform -translate-y-1/2"
              >
                <X className="w-4 h-4 text-slate-400 hover:text-slate-600" />
              </button>
            )}
          </div>
        )}

        {/* Carduri Mobile */}
        {dateLunare.length > 0 && (
          <div className="flex-1 flex flex-col min-h-0">
            <div className="mb-2 text-sm text-slate-600 text-center">
              {dateFiltrate.length} / {dateLunare.length} înregistrări
            </div>
            <ScrollArea className="flex-1">
              <div className="space-y-3 pb-4">
                {dateFiltrate.map((membru, idx) => (
                  <Card
                    key={`${membru.nr_fisa}-${idx}`}
                    className="border-l-4"
                    style={{
                      borderLeftColor: idx % 2 === 0 ? "#3b82f6" : "#f97316"
                    }}
                  >
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center justify-between">
                        <span className="line-clamp-2 leading-snug">{membru.nume}</span>
                        <span className="text-sm font-normal text-slate-600">
                          #{membru.nr_fisa}
                        </span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm leading-relaxed">
                      <div className="grid grid-cols-2 gap-3 sm:gap-4">
                        <div>
                          <div className="text-xs text-slate-500">Dobândă</div>
                          <div className="font-semibold">{formatCurrency(membru.dobanda)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-500">Rată împrumut</div>
                          <div className={membru.neachitat_impr ? "font-bold text-red-600" : "font-semibold"}>
                            {membru.neachitat_impr ? "NEACHITAT" : formatCurrency(membru.impr_cred)}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-500">Sold împrumut</div>
                          <div className="font-semibold">{formatCurrency(membru.impr_sold)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-500">Cotizație</div>
                          <div className={membru.neachitat_dep ? "font-bold text-red-600" : "font-semibold"}>
                            {membru.neachitat_dep ? "NEACHITAT" : formatCurrency(membru.dep_deb)}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-500">Retragere FS</div>
                          <div className="font-semibold">{formatCurrency(membru.dep_cred)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-500">Sold depunere</div>
                          <div className="font-semibold">{formatCurrency(membru.dep_sold)}</div>
                        </div>
                      </div>
                      <div className="pt-2 border-t flex items-center justify-between">
                        <span className="text-xs text-slate-500">Total de plată:</span>
                        <span className="text-lg font-bold text-blue-600">
                          {formatCurrency(membru.total_plata)} {currency}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Empty state */}
        {dateLunare.length === 0 && !loading && (
          <Alert className={noDataFound ? "bg-red-50 border-red-300" : ""}>
            <AlertDescription className="text-center">
              {noDataFound ? (
                <div className="space-y-3">
                  <p className="text-lg font-bold text-red-700">
                    ⚠️ LUNĂ INEXISTENTĂ ÎN BAZA DE DATE
                  </p>
                  <p className="text-red-600">
                    Luna <strong>{MONTHS[lunaSelectata - 1]} {anSelectat}</strong> nu există în DEPCRED.db
                  </p>
                  <div className="text-left text-sm text-slate-700 mt-4 space-y-2">
                    <p className="font-semibold">📋 Posibile cauze:</p>
                    <ul className="list-disc list-inside pl-4 space-y-1">
                      <li>Luna nu a fost încă generată în modulul "Generare lună"</li>
                      <li>Ați selectat o lună viitoare care nu există</li>
                      <li>Baza de date nu conține date pentru această perioadă</li>
                    </ul>
                    <p className="font-semibold mt-4">💡 Soluție:</p>
                    <ul className="list-disc list-inside pl-4 space-y-1">
                      <li>Generați luna în modulul "Generare lună"</li>
                      <li>SAU selectați o lună existentă din baza de date</li>
                    </ul>
                  </div>
                </div>
              ) : (
                "Selectați luna și anul, apoi apăsați butonul \"Afișează\" pentru a vizualiza datele."
              )}
            </AlertDescription>
          </Alert>
        )}
      </div>
    </div>
  );
}
