import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
// src/components/VizualizareAnuala.tsx
/**
 * Modul Vizualizare Anuală - Port aproape 1:1 din vizualizare_anuala.py
 *
 * MODIFICĂRI PRINCIPALE:
 * - Înlocuire sortare cu căutare prefix (autocomplete progresiv)
 * - Afișare "NEACHITAT" în loc de 0 pentru rate/cotizații cu sold > 0
 * - Layout desktop identic cu Python (9 coloane)
 * - Layout mobil consistent cu VizualizareLunara.tsx
 * - Buton "Afișează" pentru încărcarea datelor
 * - Căsuță căutare cu buton "x" pentru resetare
 * - Text corectat: "Total plătit anual"
 */
import { useEffect, useMemo, useState } from "react";
import Decimal from "decimal.js";
import { Loader2, FileText, Download, Search, X } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { getActiveDB } from "../services/databaseManager";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/buttons";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Input } from "./ui/input";
import { ScrollArea } from "./ui/scroll-area";
import { Alert, AlertDescription } from "./ui/alert";
import { formatNumberRO } from "../lib/utils";
// DejaVu fonts încărcate dinamic la export PDF pentru optimizare bundle
Decimal.set({
    precision: 20,
    rounding: Decimal.ROUND_HALF_UP
});
export default function VizualizareAnuala({ databases, onBack }) {
    const currency = databases.activeCurrency || 'RON';
    const [availableYears, setAvailableYears] = useState([]);
    const [selectedYear, setSelectedYear] = useState(null);
    const [dataAnuala, setDataAnuala] = useState([]);
    const [loading, setLoading] = useState(false);
    const [log, setLog] = useState([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [noDataFound, setNoDataFound] = useState(false);
    const [dataIncarcate, setDataIncarcate] = useState(false); // Stare pentru date încărcate
    const pushLog = (msg) => {
        setLog(prev => [...prev, msg]);
    };
    const clearLog = () => setLog([]);
    // Scroll la top când se montează componenta (pentru mobile)
    useEffect(() => {
        window.scrollTo(0, 0);
    }, []);
    // Încărcare ani disponibili
    useEffect(() => {
        try {
            const depcredDB = getActiveDB(databases, "depcred");
            const result = depcredDB.exec("SELECT DISTINCT ANUL FROM depcred ORDER BY ANUL DESC");
            const years = result[0]?.values.map(row => Number(row[0])) ?? [];
            setAvailableYears(years);
        }
        catch (error) {
            console.error("Eroare la citirea listă ani:", error);
        }
    }, [databases.activeCurrency, databases.hasEuroData]);
    // Funcția de încărcare date la apăsarea butonului "Afișează"
    async function incarcaDate(anul) {
        if (loading)
            return;
        setLoading(true);
        clearLog();
        setNoDataFound(false);
        setDataAnuala([]);
        setDataIncarcate(false);
        pushLog("=".repeat(60));
        pushLog(`🔍 ÎNCĂRCARE DATE ANUALE - ${anul}`);
        pushLog("=".repeat(60));
        pushLog("");
        try {
            const depcredDB = getActiveDB(databases, "depcred");
            const membriDB = getActiveDB(databases, "membrii");
            const membriResult = membriDB.exec("SELECT NR_FISA, NUM_PREN FROM membrii");
            const numeMap = new Map();
            if (membriResult.length > 0) {
                membriResult[0].values.forEach(row => {
                    const nr = Number(row[0]);
                    const nume = String(row[1] ?? "");
                    numeMap.set(nr, nume);
                });
            }
            const dataResult = depcredDB.exec(`SELECT NR_FISA, LUNA, DOBANDA, IMPR_CRED, IMPR_SOLD, DEP_DEB, DEP_CRED, DEP_SOLD
         FROM depcred
         WHERE ANUL = ?
         ORDER BY NR_FISA, LUNA`, [anul]);
            if (dataResult.length === 0 || dataResult[0].values.length === 0) {
                pushLog("");
                pushLog("⚠️ Nu există date pentru anul selectat în DEPCRED.db");
                pushLog("💡 Generați lunile în modulul 'Generare lună' sau selectați alt an.");
                pushLog("");
                setNoDataFound(true);
                setDataAnuala([]);
                setDataIncarcate(true);
                setLoading(false);
                return;
            }
            const map = new Map();
            dataResult[0].values.forEach(row => {
                const nr_fisa = Number(row[0]);
                const luna = Number(row[1]);
                const dobanda = new Decimal(String(row[2] ?? "0"));
                const impr_cred = new Decimal(String(row[3] ?? "0"));
                const impr_sold = new Decimal(String(row[4] ?? "0"));
                const dep_deb = new Decimal(String(row[5] ?? "0"));
                const dep_cred = new Decimal(String(row[6] ?? "0"));
                const dep_sold = new Decimal(String(row[7] ?? "0"));
                const total_plata = dobanda.plus(impr_cred).plus(dep_deb);
                const neachitat_impr = impr_sold.greaterThan(0) && impr_cred.equals(0);
                const neachitat_dep = dep_sold.greaterThan(0) && dep_deb.equals(0);
                if (!map.has(nr_fisa)) {
                    map.set(nr_fisa, {
                        nr_fisa,
                        nume: numeMap.get(nr_fisa) ?? "Nume negăsit",
                        luniActive: 0,
                        luni: [],
                        total_dobanda: new Decimal(0),
                        total_impr_cred: new Decimal(0),
                        total_dep_deb: new Decimal(0),
                        total_dep_cred: new Decimal(0),
                        total_plata: new Decimal(0),
                        sold_impr_final: new Decimal(0),
                        sold_dep_final: new Decimal(0),
                        are_neachitat_impr: false,
                        are_neachitat_dep: false
                    });
                }
                const entry = map.get(nr_fisa);
                entry.luni.push({
                    luna,
                    dobanda,
                    impr_cred,
                    impr_sold,
                    dep_deb,
                    dep_cred,
                    dep_sold,
                    total_plata,
                    neachitat_impr,
                    neachitat_dep
                });
                entry.luniActive += 1;
                entry.total_dobanda = entry.total_dobanda.plus(dobanda);
                entry.total_impr_cred = entry.total_impr_cred.plus(impr_cred);
                entry.total_dep_deb = entry.total_dep_deb.plus(dep_deb);
                entry.total_dep_cred = entry.total_dep_cred.plus(dep_cred);
                entry.total_plata = entry.total_plata.plus(total_plata);
                entry.sold_impr_final = impr_sold;
                entry.sold_dep_final = dep_sold;
                entry.are_neachitat_impr = entry.are_neachitat_impr || neachitat_impr;
                entry.are_neachitat_dep = entry.are_neachitat_dep || neachitat_dep;
            });
            // Sortare inițială după nume (ca în Python)
            const rezultate = Array.from(map.values());
            rezultate.sort((a, b) => a.nume.localeCompare(b.nume, "ro"));
            setDataAnuala(rezultate);
            setDataIncarcate(true);
            pushLog("");
            pushLog("✅ Date anuale încărcate cu succes!");
            pushLog(`📊 Total membri: ${rezultate.length}`);
            pushLog(`📆 An analizat: ${anul}`);
            pushLog("");
        }
        catch (error) {
            console.error("Eroare la încărcarea datelor anuale", error);
            pushLog("");
            pushLog("❌ EROARE la încărcarea datelor anuale:");
            pushLog(`   ${error}`);
            alert(`Eroare la încărcarea datelor: ${error}`);
            setDataIncarcate(false);
        }
        finally {
            setLoading(false);
        }
    }
    // Căutare prefix - filtrează membrii al căror nume începe cu prefixul
    const dateFiltrate = useMemo(() => {
        if (!searchTerm.trim())
            return dataAnuala;
        const term = searchTerm.toLowerCase();
        return dataAnuala.filter(item => item.nume.toLowerCase().startsWith(term) ||
            item.nr_fisa.toString().startsWith(term));
    }, [dataAnuala, searchTerm]);
    const totaluri = useMemo(() => {
        return dataAnuala.reduce((acc, item) => {
            return {
                totalDobanda: acc.totalDobanda.plus(item.total_dobanda),
                totalImprumut: acc.totalImprumut.plus(item.total_impr_cred),
                totalCotizatie: acc.totalCotizatie.plus(item.total_dep_deb),
                totalRetrageri: acc.totalRetrageri.plus(item.total_dep_cred),
                totalGeneral: acc.totalGeneral.plus(item.total_plata)
            };
        }, {
            totalDobanda: new Decimal(0),
            totalImprumut: new Decimal(0),
            totalCotizatie: new Decimal(0),
            totalRetrageri: new Decimal(0),
            totalGeneral: new Decimal(0)
        });
    }, [dataAnuala]);
    // Formatare număr în format românesc: separator mii=punct, zecimale=virgulă
    const formatCurrency = (value) => formatNumberRO(value.toNumber());
    const formatNeachitat = (value, condition) => {
        return condition ? "NEACHITAT" : formatCurrency(value);
    };
    const exportPDF = async () => {
        if (dateFiltrate.length === 0 || !selectedYear) {
            alert("Nu există date de exportat.");
            return;
        }
        pushLog("");
        pushLog("=".repeat(60));
        pushLog("📄 EXPORT PDF ANUAL ÎN CURS...");
        pushLog("=".repeat(60));
        try {
            pushLog("🔄 Pas 1/6: Încărcare fonturi DejaVu Sans (lazy load ~1.9MB)...");
            // Încărcare dinamică fonturi (evită bundle bloat la cold start)
            const { DejaVuSansNormal, DejaVuSansBold } = await import("../utils/dejavu-fonts");
            pushLog("✅ Fonturi încărcate");
            pushLog("🔄 Pas 2/6: Inițializare document PDF (A4 landscape)...");
            const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
            doc.addFileToVFS("DejaVuSans.ttf", DejaVuSansNormal);
            doc.addFileToVFS("DejaVuSans-Bold.ttf", DejaVuSansBold);
            doc.addFont("DejaVuSans.ttf", "DejaVuSans", "normal");
            doc.addFont("DejaVuSans-Bold.ttf", "DejaVuSans", "bold");
            doc.setFont("DejaVuSans", "bold");
            doc.setFontSize(18);
            doc.text(`Situație anuală ${selectedYear}`, 40, 50);
            pushLog("🔄 Pas 3/6: Pregătire date tabel...");
            const head = [[
                    "Nr. fișă",
                    "Nume prenume",
                    "Dobândă",
                    "Rată împrumut",
                    "Sold împrumut",
                    "Cotizație",
                    "Retragere FS",
                    "Sold depunere",
                    "Total de plată"
                ]];
            const body = dateFiltrate.map(item => [
                item.nr_fisa,
                item.nume,
                formatCurrency(item.total_dobanda),
                formatNeachitat(item.total_impr_cred, item.are_neachitat_impr),
                formatCurrency(item.sold_impr_final),
                formatNeachitat(item.total_dep_deb, item.are_neachitat_dep),
                formatCurrency(item.total_dep_cred),
                formatCurrency(item.sold_dep_final),
                formatCurrency(item.total_plata)
            ]);
            pushLog(`✅ Pregătite ${body.length} rânduri de date`);
            pushLog("🔄 Pas 4/6: Generare tabel...");
            autoTable(doc, {
                head,
                body,
                startY: 80,
                styles: {
                    font: "DejaVuSans",
                    fontSize: 9,
                    cellPadding: 6
                },
                headStyles: {
                    fillColor: [59, 130, 246],
                    textColor: [255, 255, 255],
                    fontStyle: "bold"
                },
                columnStyles: {
                    0: { cellWidth: 60 },
                    1: { cellWidth: 170 },
                    2: { cellWidth: 70 },
                    3: { cellWidth: 80 },
                    4: { cellWidth: 80 },
                    5: { cellWidth: 70 },
                    6: { cellWidth: 80 },
                    7: { cellWidth: 80 },
                    8: { cellWidth: 80 }
                },
                didParseCell: data => {
                    if (data.section === "body") {
                        // Colorare roșie pentru "NEACHITAT"
                        if (data.column.index === 3 || data.column.index === 5) {
                            const text = String(data.cell.raw ?? "");
                            if (text === "NEACHITAT") {
                                data.cell.styles.textColor = [220, 38, 38];
                                data.cell.styles.fontStyle = "bold";
                            }
                        }
                    }
                }
            });
            pushLog("🔄 Pas 5/6: Adăugare totaluri...");
            const docWithTable = doc;
            const finalY = docWithTable.lastAutoTable?.finalY ?? 80;
            doc.setFont("DejaVuSans", "bold");
            doc.text(`Total dobândă: ${formatCurrency(totaluri.totalDobanda)} | ` +
                `Total rate: ${formatCurrency(totaluri.totalImprumut)} | ` +
                `Total cotizație: ${formatCurrency(totaluri.totalCotizatie)} | ` +
                `Total retrageri: ${formatCurrency(totaluri.totalRetrageri)} | ` +
                `Total plată: ${formatCurrency(totaluri.totalGeneral)}`, 40, finalY + 30);
            pushLog("🔄 Pas 6/6: Salvare fișier PDF...");
            const fileName = `Situatie_Anuala_${selectedYear}.pdf`;
            doc.save(fileName);
            pushLog("✅ PDF salvat cu succes!");
            pushLog(`📄 Nume fișier: ${fileName}`);
            pushLog("=".repeat(60));
            pushLog("✅ EXPORT PDF FINALIZAT!");
            pushLog("=".repeat(60));
        }
        catch (error) {
            pushLog("❌ EROARE la exportul PDF:");
            pushLog(`   ${error}`);
            alert(`Eroare la export PDF: ${error}`);
        }
    };
    const exportExcel = async () => {
        if (dateFiltrate.length === 0 || !selectedYear) {
            alert("Nu există date de exportat.");
            return;
        }
        pushLog("");
        pushLog("=".repeat(60));
        pushLog("📊 EXPORT EXCEL ANUAL ÎN CURS...");
        pushLog("=".repeat(60));
        try {
            pushLog("🔄 Pas 1/4: Creare workbook...");
            const wb = XLSX.utils.book_new();
            const wsName = `Situatie_${selectedYear}`.substring(0, 31);
            pushLog("🔄 Pas 2/4: Pregătire date...");
            const headers = [
                "Nr. fișă", "Nume prenume", "Dobândă", "Rată împrumut",
                "Sold împrumut", "Cotizație", "Retragere FS", "Sold depunere", "Total de plată"
            ];
            const rows = [headers];
            dateFiltrate.forEach(item => {
                rows.push([
                    item.nr_fisa,
                    item.nume,
                    Number(formatCurrency(item.total_dobanda)),
                    item.are_neachitat_impr ? "NEACHITAT" : Number(formatCurrency(item.total_impr_cred)),
                    Number(formatCurrency(item.sold_impr_final)),
                    item.are_neachitat_dep ? "NEACHITAT" : Number(formatCurrency(item.total_dep_deb)),
                    Number(formatCurrency(item.total_dep_cred)),
                    Number(formatCurrency(item.sold_dep_final)),
                    Number(formatCurrency(item.total_plata))
                ]);
            });
            pushLog(`✅ Pregătite ${rows.length - 1} rânduri de date`);
            pushLog("🔄 Pas 3/4: Creare worksheet...");
            const ws = XLSX.utils.aoa_to_sheet(rows);
            ws["!cols"] = [
                { wch: 10 },
                { wch: 32 },
                { wch: 12 },
                { wch: 16 },
                { wch: 16 },
                { wch: 16 },
                { wch: 16 },
                { wch: 16 },
                { wch: 16 }
            ];
            ws["!freeze"] = { xSplit: 0, ySplit: 1 };
            pushLog("🔄 Pas 4/4: Salvare fișier Excel...");
            XLSX.utils.book_append_sheet(wb, ws, wsName);
            const fileName = `Situatie_Anuala_${selectedYear}.xlsx`;
            XLSX.writeFile(wb, fileName);
            pushLog("✅ Excel salvat cu succes!");
            pushLog(`📄 Nume fișier: ${fileName}`);
            pushLog("=".repeat(60));
            pushLog("✅ EXPORT EXCEL FINALIZAT!");
            pushLog("=".repeat(60));
        }
        catch (error) {
            pushLog("❌ EROARE la exportul Excel:");
            pushLog(`   ${error}`);
            alert(`Eroare la export Excel: ${error}`);
        }
    };
    return (_jsxs("div", { className: "w-full h-full flex flex-col gap-4 p-4 bg-slate-50", children: [_jsx(Card, { children: _jsx(CardHeader, { className: "bg-gradient-to-r from-blue-600 to-blue-700 text-white md:bg-transparent md:text-inherit", children: _jsx(CardTitle, { className: "flex items-center gap-2 justify-center md:justify-start", children: "\uD83D\uDCC8 Vizualizare Anual\u0103" }) }) }), _jsx(Card, { children: _jsx(CardContent, { className: "pt-6", children: _jsxs("div", { className: "flex items-center justify-center gap-4 flex-wrap", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("label", { className: "text-sm font-medium text-slate-700", children: "An:" }), _jsxs(Select, { value: selectedYear ? String(selectedYear) : undefined, onValueChange: (value) => setSelectedYear(Number(value)), disabled: loading, children: [_jsx(SelectTrigger, { className: "w-[100px]", children: _jsx(SelectValue, { placeholder: "Selecteaz\u0103 an" }) }), _jsx(SelectContent, { children: availableYears.map(an => (_jsx(SelectItem, { value: String(an), children: an }, an))) })] }), _jsx(Button, { onClick: () => selectedYear && incarcaDate(selectedYear), disabled: loading || !selectedYear, className: "bg-blue-600 hover:bg-blue-700", children: loading ? (_jsxs(_Fragment, { children: [_jsx(Loader2, { className: "w-4 h-4 mr-2 animate-spin" }), "Se \u00EEncarc\u0103..."] })) : (_jsxs(_Fragment, { children: [_jsx(FileText, { className: "w-4 h-4 mr-2" }), "Afi\u0219eaz\u0103"] })) })] }), _jsxs(Button, { onClick: exportPDF, disabled: loading || dateFiltrate.length === 0, className: "bg-red-600 hover:bg-red-700 min-h-[44px]", children: [_jsx(FileText, { className: "w-4 h-4 mr-2" }), " PDF"] }), _jsxs(Button, { onClick: exportExcel, disabled: loading || dateFiltrate.length === 0, className: "bg-green-600 hover:bg-green-700 min-h-[44px]", children: [_jsx(Download, { className: "w-4 h-4 mr-2" }), " Excel"] })] }) }) }), dataIncarcate && dataAnuala.length > 0 && (_jsxs("div", { className: "relative", children: [_jsx(Search, { className: "absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" }), _jsx(Input, { type: "text", placeholder: "Caut\u0103 prefix nume sau nr. fi\u0219\u0103...", value: searchTerm, onChange: (e) => setSearchTerm(e.target.value), className: "pl-10 pr-10" }), searchTerm && (_jsx("button", { onClick: () => setSearchTerm(""), className: "absolute right-3 top-1/2 transform -translate-y-1/2", children: _jsx(X, { className: "w-4 h-4 text-slate-400 hover:text-slate-600" }) }))] })), dataIncarcate && dataAnuala.length > 0 && (_jsxs("div", { className: "grid grid-cols-2 md:grid-cols-5 gap-3 text-center", children: [_jsxs("div", { className: "rounded-lg bg-blue-50 px-3 py-2", children: [_jsx("div", { className: "text-xs text-blue-600", children: "Total dob\u00E2nd\u0103" }), _jsxs("div", { className: "text-lg font-semibold text-blue-700", children: [formatCurrency(totaluri.totalDobanda), " ", currency] })] }), _jsxs("div", { className: "rounded-lg bg-emerald-50 px-3 py-2", children: [_jsx("div", { className: "text-xs text-emerald-600", children: "Total rate" }), _jsxs("div", { className: "text-lg font-semibold text-emerald-700", children: [formatCurrency(totaluri.totalImprumut), " ", currency] })] }), _jsxs("div", { className: "rounded-lg bg-purple-50 px-3 py-2", children: [_jsx("div", { className: "text-xs text-purple-600", children: "Total cotiza\u021Bie" }), _jsxs("div", { className: "text-lg font-semibold text-purple-700", children: [formatCurrency(totaluri.totalCotizatie), " ", currency] })] }), _jsxs("div", { className: "rounded-lg bg-amber-50 px-3 py-2", children: [_jsx("div", { className: "text-xs text-amber-600", children: "Total retrageri" }), _jsxs("div", { className: "text-lg font-semibold text-amber-700", children: [formatCurrency(totaluri.totalRetrageri), " ", currency] })] }), _jsxs("div", { className: "rounded-lg bg-slate-100 px-3 py-2", children: [_jsx("div", { className: "text-xs text-slate-700", children: "Total general plat\u0103" }), _jsxs("div", { className: "text-lg font-semibold text-slate-800", children: [formatCurrency(totaluri.totalGeneral), " ", currency] })] })] })), _jsxs(CardContent, { className: "space-y-6 p-0", children: [loading && (_jsxs("div", { className: "flex items-center justify-center py-10 text-slate-500", children: [_jsx(Loader2, { className: "w-5 h-5 animate-spin mr-2" }), "\u00CEnc\u0103rcare date anuale..."] })), !loading && dataIncarcate && noDataFound && (_jsx(Alert, { variant: "warning", children: _jsx(AlertDescription, { children: "Nu s-au g\u0103sit \u00EEnregistr\u0103ri pentru anul selectat. Verifica\u021Bi dac\u0103 lunile au fost generate sau selecta\u021Bi alt an." }) })), !loading && dataIncarcate && !noDataFound && dateFiltrate.length === 0 && searchTerm && (_jsx(Alert, { children: _jsxs(AlertDescription, { children: ["Nu exist\u0103 membri al c\u0103ror nume sau num\u0103r fi\u0219\u0103 \u00EEncepe cu \"", searchTerm, "\"."] }) })), !loading && dataIncarcate && dateFiltrate.length > 0 && (_jsxs(_Fragment, { children: [_jsx("div", { className: "hidden lg:block", children: _jsx("div", { className: "overflow-x-auto rounded-xl border border-slate-200", children: _jsxs("table", { className: "min-w-full divide-y divide-slate-200", children: [_jsx("thead", { className: "bg-slate-100 text-xs uppercase tracking-wide", children: _jsxs("tr", { children: [_jsx("th", { className: "px-4 py-3 text-left font-semibold text-slate-600", children: "Nr. fi\u0219\u0103" }), _jsx("th", { className: "px-4 py-3 text-left font-semibold text-slate-600", children: "Nume prenume" }), _jsx("th", { className: "px-4 py-3 text-right font-semibold text-slate-600", children: "Dob\u00E2nd\u0103" }), _jsx("th", { className: "px-4 py-3 text-right font-semibold text-slate-600", children: "Rat\u0103 \u00EEmprumut" }), _jsx("th", { className: "px-4 py-3 text-right font-semibold text-slate-600", children: "Sold \u00EEmprumut" }), _jsx("th", { className: "px-4 py-3 text-right font-semibold text-slate-600", children: "Cotiza\u021Bie" }), _jsx("th", { className: "px-4 py-3 text-right font-semibold text-slate-600", children: "Retragere FS" }), _jsx("th", { className: "px-4 py-3 text-right font-semibold text-slate-600", children: "Sold depunere" }), _jsx("th", { className: "px-4 py-3 text-right font-semibold text-slate-600", children: "Total de plat\u0103" })] }) }), _jsx("tbody", { className: "divide-y divide-slate-100 text-sm", children: dateFiltrate.map(item => (_jsxs("tr", { className: "hover:bg-slate-50", children: [_jsx("td", { className: "px-4 py-3 font-semibold text-slate-700", children: item.nr_fisa }), _jsxs("td", { className: "px-4 py-3 text-slate-700", children: [_jsx("div", { className: "font-medium", children: item.nume }), _jsx("div", { className: "text-xs text-slate-500", children: item.luni.length > 0 && `${item.luni[0].luna.toString().padStart(2, "0")}/${selectedYear} - ${item.luni[item.luni.length - 1].luna.toString().padStart(2, "0")}/${selectedYear}` })] }), _jsx("td", { className: "px-4 py-3 text-right text-blue-600 font-medium", children: formatCurrency(item.total_dobanda) }), _jsx("td", { className: `px-4 py-3 text-right font-medium ${item.are_neachitat_impr ? "text-red-600 font-bold" : "text-emerald-600"}`, children: formatNeachitat(item.total_impr_cred, item.are_neachitat_impr) }), _jsx("td", { className: "px-4 py-3 text-right text-slate-700 font-medium", children: formatCurrency(item.sold_impr_final) }), _jsx("td", { className: `px-4 py-3 text-right font-medium ${item.are_neachitat_dep ? "text-red-600 font-bold" : "text-purple-600"}`, children: formatNeachitat(item.total_dep_deb, item.are_neachitat_dep) }), _jsx("td", { className: "px-4 py-3 text-right text-amber-600 font-medium", children: formatCurrency(item.total_dep_cred) }), _jsx("td", { className: "px-4 py-3 text-right text-slate-700 font-medium", children: formatCurrency(item.sold_dep_final) }), _jsx("td", { className: "px-4 py-3 text-right font-semibold text-slate-700", children: formatCurrency(item.total_plata) })] }, item.nr_fisa))) })] }) }) }), _jsxs("div", { className: "lg:hidden flex flex-col gap-4 flex-1", children: [_jsxs("div", { className: "mb-2 text-sm text-slate-600 text-center", children: [dateFiltrate.length, " / ", dataAnuala.length, " membri"] }), _jsx(ScrollArea, { className: "flex-1", children: _jsx("div", { className: "space-y-3 pb-4", children: dateFiltrate.map((item, idx) => (_jsxs(Card, { className: "border-l-4", style: {
                                                    borderLeftColor: idx % 2 === 0 ? "#3b82f6" : "#f97316"
                                                }, children: [_jsx(CardHeader, { className: "pb-3", children: _jsxs(CardTitle, { className: "text-base flex items-center justify-between", children: [_jsx("span", { className: "line-clamp-2 leading-snug", children: item.nume }), _jsxs("span", { className: "text-sm font-normal text-slate-600", children: ["#", item.nr_fisa] })] }) }), _jsxs(CardContent, { className: "space-y-2 text-sm leading-relaxed", children: [_jsxs("div", { className: "grid grid-cols-2 gap-3 sm:gap-4", children: [_jsxs("div", { children: [_jsx("div", { className: "text-xs text-slate-700", children: "Dob\u00E2nd\u0103" }), _jsx("div", { className: "font-semibold text-blue-600", children: formatCurrency(item.total_dobanda) })] }), _jsxs("div", { children: [_jsx("div", { className: "text-xs text-slate-700", children: "Rat\u0103 \u00EEmprumut" }), _jsx("div", { className: item.are_neachitat_impr ? "font-bold text-red-600" : "font-semibold text-emerald-600", children: formatNeachitat(item.total_impr_cred, item.are_neachitat_impr) })] }), _jsxs("div", { children: [_jsx("div", { className: "text-xs text-slate-700", children: "Sold \u00EEmprumut" }), _jsx("div", { className: "font-semibold text-slate-700", children: formatCurrency(item.sold_impr_final) })] }), _jsxs("div", { children: [_jsx("div", { className: "text-xs text-slate-700", children: "Cotiza\u021Bie" }), _jsx("div", { className: item.are_neachitat_dep ? "font-bold text-red-600" : "font-semibold text-purple-600", children: formatNeachitat(item.total_dep_deb, item.are_neachitat_dep) })] }), _jsxs("div", { children: [_jsx("div", { className: "text-xs text-slate-700", children: "Retragere FS" }), _jsx("div", { className: "font-semibold text-amber-600", children: formatCurrency(item.total_dep_cred) })] }), _jsxs("div", { children: [_jsx("div", { className: "text-xs text-slate-700", children: "Sold depunere" }), _jsx("div", { className: "font-semibold text-slate-700", children: formatCurrency(item.sold_dep_final) })] })] }), _jsxs("div", { className: "pt-2 border-t flex items-center justify-between", children: [_jsx("span", { className: "text-xs text-slate-700", children: "Total pl\u0103tit anual:" }), _jsxs("span", { className: "text-lg font-bold text-blue-600", children: [formatCurrency(item.total_plata), " ", currency] })] })] })] }, item.nr_fisa))) }) })] })] })), !loading && !dataIncarcate && (_jsx(Alert, { children: _jsx(AlertDescription, { className: "text-center", children: "Selecta\u021Bi un an \u0219i ap\u0103sa\u021Bi butonul \"Afi\u0219eaz\u0103\" pentru a vizualiza datele anuale." }) }))] }), log.length > 0 && (_jsxs(Card, { className: "bg-slate-900 text-slate-100 shadow-lg", children: [_jsx(CardHeader, { children: _jsx(CardTitle, { className: "text-lg", children: "\uD83D\uDCDD Jurnal opera\u021Biuni" }) }), _jsx(CardContent, { children: _jsx(ScrollArea, { className: "h-48 pr-4", children: _jsx("div", { className: "space-y-1 text-sm font-mono", children: log.map((line, idx) => (_jsx("div", { className: "whitespace-pre-wrap", children: line }, idx))) }) }) })] }))] }));
}
