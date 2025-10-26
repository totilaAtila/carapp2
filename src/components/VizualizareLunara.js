import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
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
import { useState, useMemo } from "react";
import Decimal from "decimal.js";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/buttons";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { ScrollArea } from "./ui/scroll-area";
import { Input } from "./ui/input";
import { Alert, AlertDescription } from "./ui/alert";
import { Loader2, FileText, Download, Calculator, ArrowUpDown, ArrowUp, ArrowDown, Search, X } from "lucide-react";
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
// ==========================================
// HELPER FUNCTIONS
// ==========================================
/**
 * Citește datele lunare din DEPCRED cu JOIN pe MEMBRII
 */
function citesteDataLunara(dbDepcred, dbMembrii, luna, anul, onLog) {
    try {
        onLog(`📊 Citire date pentru ${String(luna).padStart(2, "0")}-${anul}...`);
        // Query SQL identic cu Python
        const result = dbDepcred.exec(`
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
        const membriMap = new Map();
        try {
            const membriResult = dbMembrii.exec(`SELECT NR_FISA, NUM_PREN FROM membrii`);
            if (membriResult.length > 0) {
                membriResult[0].values.forEach(row => {
                    membriMap.set(row[0], row[1]);
                });
            }
        }
        catch (error) {
            onLog("⚠️ Eroare citire MEMBRII.db - se folosesc valori default");
        }
        // Procesare date
        const membri = result[0].values.map(row => {
            const nr_fisa = row[0];
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
    }
    catch (error) {
        onLog(`❌ Eroare citire date: ${error}`);
        throw error;
    }
}
/**
 * Calculează totalurile pentru luna curentă
 */
function calculeazaTotaluri(membri) {
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
function sorteazaMembri(membri, column, order) {
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
export default function VizualizareLunara({ databases, onBack }) {
    // State
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;
    const [lunaSelectata, setLunaSelectata] = useState(currentMonth);
    const [anSelectat, setAnSelectat] = useState(currentYear);
    const [dateLunare, setDateLunare] = useState([]);
    const [loading, setLoading] = useState(false);
    const [log, setLog] = useState([]);
    const [sortColumn, setSortColumn] = useState("nume");
    const [sortOrder, setSortOrder] = useState("asc");
    const [searchTerm, setSearchTerm] = useState("");
    const pushLog = (msg) => {
        setLog(prev => [...prev, msg]);
    };
    const clearLog = () => {
        setLog([]);
    };
    // ========================================
    // COMPUTED VALUES
    // ========================================
    // Date sortate
    const dateSortate = useMemo(() => {
        return sorteazaMembri(dateLunare, sortColumn, sortOrder);
    }, [dateLunare, sortColumn, sortOrder]);
    // Date filtrate după search
    const dateFiltrate = useMemo(() => {
        if (!searchTerm.trim())
            return dateSortate;
        const term = searchTerm.toLowerCase();
        return dateSortate.filter(m => m.nume.toLowerCase().includes(term) ||
            m.nr_fisa.toString().includes(term));
    }, [dateSortate, searchTerm]);
    // Totaluri
    const totaluri = useMemo(() => {
        return calculeazaTotaluri(dateLunare);
    }, [dateLunare]);
    // ========================================
    // HANDLER FUNCTIONS
    // ========================================
    const handleAfiseaza = async () => {
        if (loading)
            return;
        setLoading(true);
        clearLog();
        setDateLunare([]);
        pushLog("=".repeat(60));
        pushLog(`🔍 ÎNCĂRCARE DATE LUNARE - ${MONTHS[lunaSelectata - 1].toUpperCase()} ${anSelectat}`);
        pushLog("=".repeat(60));
        pushLog("");
        try {
            const membri = citesteDataLunara(databases.depcred, databases.membrii, lunaSelectata, anSelectat, pushLog);
            setDateLunare(membri);
            if (membri.length > 0) {
                pushLog("");
                pushLog("✅ Date încărcate cu succes!");
                pushLog(`📊 Total înregistrări: ${membri.length}`);
            }
        }
        catch (error) {
            pushLog("");
            pushLog("❌ EROARE la încărcarea datelor:");
            pushLog(`   ${error}`);
        }
        finally {
            setLoading(false);
        }
    };
    const handleAfiseazaTotaluri = () => {
        if (dateLunare.length === 0) {
            alert("Nu există date afișate pentru a calcula totalurile.");
            return;
        }
        const mesaj = `Totaluri financiare pentru ${MONTHS[lunaSelectata - 1]} ${anSelectat}

- Total dobândă: ${totaluri.total_dobanda.toFixed(2)} RON
- Total rate achitate (împrumuturi): ${totaluri.total_impr_cred.toFixed(2)} RON
- Sold total împrumut: ${totaluri.total_impr_sold.toFixed(2)} RON
- Total depuneri (cotizații): ${totaluri.total_dep_deb.toFixed(2)} RON
- Total retrageri FS: ${totaluri.total_dep_cred.toFixed(2)} RON
- Sold total depuneri: ${totaluri.total_dep_sold.toFixed(2)} RON
-------------------------------------------
- Total general plătit: ${totaluri.total_general_plata.toFixed(2)} RON`;
        const confirmare = window.confirm(mesaj + "\n\n" + "Apăsați OK pentru a copia în clipboard, Cancel pentru a închide.");
        if (confirmare) {
            navigator.clipboard.writeText(mesaj);
            pushLog("📋 Totaluri copiate în clipboard");
        }
    };
    const handleSort = (column) => {
        if (sortColumn === column) {
            // Toggle order dacă aceeași coloană
            setSortOrder(sortOrder === "asc" ? "desc" : "asc");
        }
        else {
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
                unit: "mm",
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
                    0: { halign: "center", cellWidth: 18 },
                    1: { halign: "center", cellWidth: 18 },
                    2: { halign: "left", cellWidth: 68 },
                    3: { halign: "right", cellWidth: 20 },
                    4: { halign: "right", cellWidth: 22 },
                    5: { halign: "right", cellWidth: 22 },
                    6: { halign: "right", cellWidth: 22 },
                    7: { halign: "right", cellWidth: 22 },
                    8: { halign: "right", cellWidth: 22 },
                    9: { halign: "right", cellWidth: 30, fontStyle: "bold" }
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
        }
        catch (error) {
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
            const excelData = [headers];
            dateSortate.forEach(m => {
                const row = [
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
                { wch: 15 } // Total de plată
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
        }
        catch (error) {
            pushLog("");
            pushLog("❌ EROARE la generarea Excel:");
            pushLog(`   ${error}`);
            alert(`Eroare la generarea Excel: ${error}`);
        }
    };
    // ========================================
    // RENDER HELPERS
    // ========================================
    const renderSortIcon = (column) => {
        if (sortColumn !== column) {
            return _jsx(ArrowUpDown, { className: "w-4 h-4 ml-1 opacity-30" });
        }
        return sortOrder === "asc"
            ? _jsx(ArrowUp, { className: "w-4 h-4 ml-1" })
            : _jsx(ArrowDown, { className: "w-4 h-4 ml-1" });
    };
    const formatCurrency = (value) => {
        return value.toFixed(2);
    };
    // ========================================
    // RENDER
    // ========================================
    return (_jsxs("div", { className: "w-full h-full flex flex-col gap-4 p-4 bg-slate-50", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx(Button, { onClick: onBack, variant: "outline", className: "gap-2", children: "\u2190 \u00CEnapoi la Dashboard" }), _jsx("h1", { className: "text-2xl font-bold text-slate-800", children: "\uD83D\uDCCA Vizualizare Lunar\u0103" }), _jsx("div", { className: "w-[120px]" }), " "] }), _jsxs("div", { className: "hidden lg:flex lg:flex-col gap-4 flex-1", children: [_jsx(Card, { children: _jsx(CardContent, { className: "pt-6", children: _jsxs("div", { className: "flex items-center justify-center gap-4 flex-wrap", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("label", { className: "text-sm font-medium text-slate-700", children: "Luna:" }), _jsxs(Select, { value: lunaSelectata.toString(), onValueChange: (val) => setLunaSelectata(parseInt(val)), disabled: loading, children: [_jsx(SelectTrigger, { className: "w-[150px]", children: _jsx(SelectValue, {}) }), _jsx(SelectContent, { children: MONTHS.map((nume, idx) => (_jsxs(SelectItem, { value: (idx + 1).toString(), children: [String(idx + 1).padStart(2, "0"), " - ", nume] }, idx + 1))) })] })] }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("label", { className: "text-sm font-medium text-slate-700", children: "An:" }), _jsxs(Select, { value: anSelectat.toString(), onValueChange: (val) => setAnSelectat(parseInt(val)), disabled: loading, children: [_jsx(SelectTrigger, { className: "w-[100px]", children: _jsx(SelectValue, {}) }), _jsx(SelectContent, { children: Array.from({ length: 30 }, (_, i) => {
                                                            const an = currentYear - 25 + i;
                                                            return (_jsx(SelectItem, { value: an.toString(), children: an }, an));
                                                        }) })] })] }), _jsx(Button, { onClick: handleAfiseaza, disabled: loading, className: "bg-blue-600 hover:bg-blue-700", children: loading ? (_jsxs(_Fragment, { children: [_jsx(Loader2, { className: "w-4 h-4 mr-2 animate-spin" }), "Se \u00EEncarc\u0103..."] })) : (_jsxs(_Fragment, { children: [_jsx(FileText, { className: "w-4 h-4 mr-2" }), "Afi\u0219eaz\u0103"] })) }), _jsxs(Button, { onClick: handleAfiseazaTotaluri, disabled: dateLunare.length === 0, className: "bg-purple-600 hover:bg-purple-700", children: [_jsx(Calculator, { className: "w-4 h-4 mr-2" }), "Afi\u0219are total luna"] }), _jsxs(Button, { onClick: handleExportPDF, disabled: dateLunare.length === 0, className: "bg-red-600 hover:bg-red-700", children: [_jsx(Download, { className: "w-4 h-4 mr-2" }), "Export\u0103 PDF"] }), _jsxs(Button, { onClick: handleExportExcel, disabled: dateLunare.length === 0, className: "bg-green-600 hover:bg-green-700", children: [_jsx(Download, { className: "w-4 h-4 mr-2" }), "Export\u0103 Excel"] })] }) }) }), dateLunare.length > 0 && (_jsxs(Card, { className: "flex-1 flex flex-col", children: [_jsx(CardHeader, { children: _jsxs(CardTitle, { className: "text-base flex items-center justify-between", children: [_jsxs("span", { children: ["Date lunare - ", MONTHS[lunaSelectata - 1], " ", anSelectat] }), _jsxs("span", { className: "text-sm font-normal text-slate-600", children: [dateLunare.length, " \u00EEnregistr\u0103ri"] })] }) }), _jsx(CardContent, { className: "flex-1 flex flex-col min-h-0", children: _jsx(ScrollArea, { className: "flex-1", children: _jsxs("table", { className: "w-full border-collapse text-sm", children: [_jsx("thead", { className: "bg-slate-100 sticky top-0", children: _jsxs("tr", { children: [_jsx("th", { className: "border p-2 text-center cursor-pointer hover:bg-slate-200", onClick: () => handleSort("nr_fisa"), children: _jsxs("div", { className: "flex items-center justify-center", children: ["LL-AA ", renderSortIcon("nr_fisa")] }) }), _jsx("th", { className: "border p-2 text-center cursor-pointer hover:bg-slate-200", onClick: () => handleSort("nr_fisa"), children: _jsxs("div", { className: "flex items-center justify-center", children: ["Nr. fi\u0219\u0103 ", renderSortIcon("nr_fisa")] }) }), _jsx("th", { className: "border p-2 text-left cursor-pointer hover:bg-slate-200", onClick: () => handleSort("nume"), children: _jsxs("div", { className: "flex items-center", children: ["Nume prenume ", renderSortIcon("nume")] }) }), _jsx("th", { className: "border p-2 text-right cursor-pointer hover:bg-slate-200", onClick: () => handleSort("dobanda"), children: _jsxs("div", { className: "flex items-center justify-end", children: ["Dob\u00E2nd\u0103 ", renderSortIcon("dobanda")] }) }), _jsx("th", { className: "border p-2 text-right cursor-pointer hover:bg-slate-200", onClick: () => handleSort("impr_cred"), children: _jsxs("div", { className: "flex items-center justify-end", children: ["Rat\u0103 \u00EEmprumut ", renderSortIcon("impr_cred")] }) }), _jsx("th", { className: "border p-2 text-right cursor-pointer hover:bg-slate-200", onClick: () => handleSort("impr_sold"), children: _jsxs("div", { className: "flex items-center justify-end", children: ["Sold \u00EEmprumut ", renderSortIcon("impr_sold")] }) }), _jsx("th", { className: "border p-2 text-right cursor-pointer hover:bg-slate-200", onClick: () => handleSort("dep_deb"), children: _jsxs("div", { className: "flex items-center justify-end", children: ["Cotiza\u021Bie ", renderSortIcon("dep_deb")] }) }), _jsx("th", { className: "border p-2 text-right cursor-pointer hover:bg-slate-200", onClick: () => handleSort("dep_cred"), children: _jsxs("div", { className: "flex items-center justify-end", children: ["Retragere FS ", renderSortIcon("dep_cred")] }) }), _jsx("th", { className: "border p-2 text-right cursor-pointer hover:bg-slate-200", onClick: () => handleSort("dep_sold"), children: _jsxs("div", { className: "flex items-center justify-end", children: ["Sold depunere ", renderSortIcon("dep_sold")] }) }), _jsx("th", { className: "border p-2 text-right cursor-pointer hover:bg-slate-200", onClick: () => handleSort("total_plata"), children: _jsxs("div", { className: "flex items-center justify-end", children: ["Total de plat\u0103 ", renderSortIcon("total_plata")] }) })] }) }), _jsx("tbody", { children: dateSortate.map((membru, idx) => (_jsxs("tr", { className: idx % 2 === 0 ? "bg-blue-50" : "bg-orange-50", children: [_jsxs("td", { className: "border p-2 text-center", children: [String(lunaSelectata).padStart(2, "0"), "-", anSelectat] }), _jsx("td", { className: "border p-2 text-center", children: membru.nr_fisa }), _jsx("td", { className: "border p-2", children: membru.nume }), _jsx("td", { className: "border p-2 text-right", children: formatCurrency(membru.dobanda) }), _jsx("td", { className: `border p-2 text-right ${membru.neachitat_impr ? "text-red-600 font-bold" : ""}`, children: membru.neachitat_impr ? "NEACHITAT" : formatCurrency(membru.impr_cred) }), _jsx("td", { className: "border p-2 text-right", children: formatCurrency(membru.impr_sold) }), _jsx("td", { className: `border p-2 text-right ${membru.neachitat_dep ? "text-red-600 font-bold" : ""}`, children: membru.neachitat_dep ? "NEACHITAT" : formatCurrency(membru.dep_deb) }), _jsx("td", { className: "border p-2 text-right", children: formatCurrency(membru.dep_cred) }), _jsx("td", { className: "border p-2 text-right", children: formatCurrency(membru.dep_sold) }), _jsx("td", { className: "border p-2 text-right font-semibold", children: formatCurrency(membru.total_plata) })] }, `${membru.nr_fisa}-${idx}`))) })] }) }) })] })), log.length > 0 && (_jsxs(Card, { children: [_jsx(CardHeader, { children: _jsxs(CardTitle, { className: "text-base flex items-center justify-between", children: [_jsxs("span", { className: "flex items-center gap-2", children: [_jsx(FileText, { className: "w-5 h-5" }), "Jurnal Opera\u021Biuni"] }), _jsx(Button, { variant: "outline", size: "sm", onClick: clearLog, children: _jsx(X, { className: "w-4 h-4" }) })] }) }), _jsx(CardContent, { children: _jsx(ScrollArea, { className: "h-[150px]", children: _jsx("pre", { className: "text-xs font-mono whitespace-pre-wrap text-slate-700", children: log.join("\n") }) }) })] }))] }), _jsxs("div", { className: "lg:hidden flex flex-col gap-4 flex-1", children: [_jsx(Card, { children: _jsxs(CardContent, { className: "pt-4 space-y-3", children: [_jsxs("div", { className: "grid grid-cols-2 gap-3", children: [_jsxs("div", { className: "space-y-1", children: [_jsx("label", { className: "text-xs font-medium text-slate-700", children: "Luna:" }), _jsxs(Select, { value: lunaSelectata.toString(), onValueChange: (val) => setLunaSelectata(parseInt(val)), disabled: loading, children: [_jsx(SelectTrigger, { className: "w-full", children: _jsx(SelectValue, {}) }), _jsx(SelectContent, { children: MONTHS.map((nume, idx) => (_jsxs(SelectItem, { value: (idx + 1).toString(), children: [String(idx + 1).padStart(2, "0"), " - ", nume] }, idx + 1))) })] })] }), _jsxs("div", { className: "space-y-1", children: [_jsx("label", { className: "text-xs font-medium text-slate-700", children: "An:" }), _jsxs(Select, { value: anSelectat.toString(), onValueChange: (val) => setAnSelectat(parseInt(val)), disabled: loading, children: [_jsx(SelectTrigger, { className: "w-full", children: _jsx(SelectValue, {}) }), _jsx(SelectContent, { children: Array.from({ length: 30 }, (_, i) => {
                                                                const an = currentYear - 25 + i;
                                                                return (_jsx(SelectItem, { value: an.toString(), children: an }, an));
                                                            }) })] })] })] }), _jsxs("div", { className: "grid grid-cols-2 gap-2", children: [_jsxs(Button, { onClick: handleAfiseaza, disabled: loading, className: "bg-blue-600 hover:bg-blue-700", children: [loading ? (_jsx(Loader2, { className: "w-4 h-4 animate-spin" })) : (_jsx(FileText, { className: "w-4 h-4" })), _jsx("span", { className: "ml-2", children: "Afi\u0219eaz\u0103" })] }), _jsxs(Button, { onClick: handleAfiseazaTotaluri, disabled: dateLunare.length === 0, className: "bg-purple-600 hover:bg-purple-700", children: [_jsx(Calculator, { className: "w-4 h-4" }), _jsx("span", { className: "ml-2", children: "Totaluri" })] }), _jsxs(Button, { onClick: handleExportPDF, disabled: dateLunare.length === 0, className: "bg-red-600 hover:bg-red-700", children: [_jsx(Download, { className: "w-4 h-4" }), _jsx("span", { className: "ml-2", children: "PDF" })] }), _jsxs(Button, { onClick: handleExportExcel, disabled: dateLunare.length === 0, className: "bg-green-600 hover:bg-green-700", children: [_jsx(Download, { className: "w-4 h-4" }), _jsx("span", { className: "ml-2", children: "Excel" })] })] })] }) }), dateLunare.length > 0 && (_jsxs("div", { className: "relative", children: [_jsx(Search, { className: "absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" }), _jsx(Input, { type: "text", placeholder: "Caut\u0103 dup\u0103 nume sau nr. fi\u0219\u0103...", value: searchTerm, onChange: (e) => setSearchTerm(e.target.value), className: "pl-10 pr-10" }), searchTerm && (_jsx("button", { onClick: () => setSearchTerm(""), className: "absolute right-3 top-1/2 transform -translate-y-1/2", children: _jsx(X, { className: "w-4 h-4 text-slate-400 hover:text-slate-600" }) }))] })), dateLunare.length > 0 && (_jsxs("div", { className: "flex-1 flex flex-col min-h-0", children: [_jsxs("div", { className: "mb-2 text-sm text-slate-600 text-center", children: [dateFiltrate.length, " / ", dateLunare.length, " \u00EEnregistr\u0103ri"] }), _jsx(ScrollArea, { className: "flex-1", children: _jsx("div", { className: "space-y-3 pb-4", children: dateFiltrate.map((membru, idx) => (_jsxs(Card, { className: "border-l-4", style: {
                                            borderLeftColor: idx % 2 === 0 ? "#3b82f6" : "#f97316"
                                        }, children: [_jsx(CardHeader, { className: "pb-3", children: _jsxs(CardTitle, { className: "text-base flex items-center justify-between", children: [_jsx("span", { className: "truncate", children: membru.nume }), _jsxs("span", { className: "text-sm font-normal text-slate-600", children: ["#", membru.nr_fisa] })] }) }), _jsxs(CardContent, { className: "space-y-2 text-sm", children: [_jsxs("div", { className: "grid grid-cols-2 gap-2", children: [_jsxs("div", { children: [_jsx("div", { className: "text-xs text-slate-500", children: "Dob\u00E2nd\u0103" }), _jsx("div", { className: "font-semibold", children: formatCurrency(membru.dobanda) })] }), _jsxs("div", { children: [_jsx("div", { className: "text-xs text-slate-500", children: "Rat\u0103 \u00EEmprumut" }), _jsx("div", { className: membru.neachitat_impr ? "font-bold text-red-600" : "font-semibold", children: membru.neachitat_impr ? "NEACHITAT" : formatCurrency(membru.impr_cred) })] }), _jsxs("div", { children: [_jsx("div", { className: "text-xs text-slate-500", children: "Sold \u00EEmprumut" }), _jsx("div", { className: "font-semibold", children: formatCurrency(membru.impr_sold) })] }), _jsxs("div", { children: [_jsx("div", { className: "text-xs text-slate-500", children: "Cotiza\u021Bie" }), _jsx("div", { className: membru.neachitat_dep ? "font-bold text-red-600" : "font-semibold", children: membru.neachitat_dep ? "NEACHITAT" : formatCurrency(membru.dep_deb) })] }), _jsxs("div", { children: [_jsx("div", { className: "text-xs text-slate-500", children: "Retragere FS" }), _jsx("div", { className: "font-semibold", children: formatCurrency(membru.dep_cred) })] }), _jsxs("div", { children: [_jsx("div", { className: "text-xs text-slate-500", children: "Sold depunere" }), _jsx("div", { className: "font-semibold", children: formatCurrency(membru.dep_sold) })] })] }), _jsxs("div", { className: "pt-2 border-t flex items-center justify-between", children: [_jsx("span", { className: "text-xs text-slate-500", children: "Total de plat\u0103:" }), _jsxs("span", { className: "text-lg font-bold text-blue-600", children: [formatCurrency(membru.total_plata), " RON"] })] })] })] }, `${membru.nr_fisa}-${idx}`))) }) })] })), dateLunare.length === 0 && !loading && (_jsx(Alert, { children: _jsx(AlertDescription, { className: "text-center", children: "Selecta\u021Bi luna \u0219i anul, apoi ap\u0103sa\u021Bi butonul \"Afi\u0219eaz\u0103\" pentru a vizualiza datele." }) }))] })] }));
}
