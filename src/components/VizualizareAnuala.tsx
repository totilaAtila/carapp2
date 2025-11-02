// src/components/VizualizareAnuala.tsx
/**
 * Modul Vizualizare Anuală - Port aproape 1:1 din vizualizare_anuala.py
 *
 * FUNCȚIONALITĂȚI PRINCIPALE:
 * - Selectare an și filtrare rapidă membri (nume + nr fișă)
 * - Agregare automată a tuturor lunilor pentru anul selectat
 * - Calcule precise cu Decimal.js (identic cu aplicația desktop)
 * - Detectare situații "NEACHITAT" pentru împrumuturi/depuneri
 * - Export PDF (A4 landscape) și Excel (.xlsx) cu layout profesional
 * - Layout desktop (tabel complet) + layout mobil (carduri compacte)
 */

import { useEffect, useMemo, useState } from "react";
import Decimal from "decimal.js";
import { Loader2, FileText, Download, Search, ArrowUpDown, ArrowUp, ArrowDown, Calendar as CalendarIcon } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

import type { DBSet } from "../services/databaseManager";
import { getActiveDB } from "../services/databaseManager";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/buttons";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Input } from "./ui/input";
import { ScrollArea } from "./ui/scroll-area";
import { Alert, AlertDescription } from "./ui/alert";
import { DejaVuSansBold, DejaVuSansNormal } from "../utils/dejavu-fonts";

Decimal.set({
  precision: 20,
  rounding: Decimal.ROUND_HALF_UP
});

const MONTHS = [
  "Ianuarie", "Februarie", "Martie", "Aprilie", "Mai", "Iunie",
  "Iulie", "August", "Septembrie", "Octombrie", "Noiembrie", "Decembrie"
];

interface Props {
  databases: DBSet;
  onBack: () => void;
}

interface MonthlyEntry {
  luna: number;
  dobanda: Decimal;
  impr_cred: Decimal;
  impr_sold: Decimal;
  dep_deb: Decimal;
  dep_cred: Decimal;
  dep_sold: Decimal;
  total_plata: Decimal;
  neachitat_impr: boolean;
  neachitat_dep: boolean;
}

interface AnnualMemberData {
  nr_fisa: number;
  nume: string;
  luniActive: number;
  luni: MonthlyEntry[];
  total_dobanda: Decimal;
  total_impr_cred: Decimal;
  total_dep_deb: Decimal;
  total_dep_cred: Decimal;
  total_plata: Decimal;
  sold_impr_final: Decimal;
  sold_dep_final: Decimal;
  are_neachitat_impr: boolean;
  are_neachitat_dep: boolean;
}

type SortColumn =
  | "nr_fisa"
  | "nume"
  | "luniActive"
  | "total_dobanda"
  | "total_impr_cred"
  | "total_dep_deb"
  | "total_dep_cred"
  | "total_plata"
  | "sold_impr_final"
  | "sold_dep_final";

type SortOrder = "asc" | "desc";

interface SummaryTotals {
  totalDobanda: Decimal;
  totalImprumut: Decimal;
  totalCotizatie: Decimal;
  totalRetrageri: Decimal;
  totalGeneral: Decimal;
}

type JsPDFWithAutoTable = jsPDF & {
  lastAutoTable?: {
    finalY: number;
  };
};

export default function VizualizareAnuala({ databases, onBack }: Props) {
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [dataAnuala, setDataAnuala] = useState<AnnualMemberData[]>([]);
  const [loading, setLoading] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [sortColumn, setSortColumn] = useState<SortColumn>("nume");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");
  const [searchTerm, setSearchTerm] = useState("");
  const [noDataFound, setNoDataFound] = useState(false);

  const pushLog = (msg: string) => {
    setLog(prev => [...prev, msg]);
  };

  const clearLog = () => setLog([]);

  useEffect(() => {
    try {
      const depcredDB = getActiveDB(databases, "depcred");
      const result = depcredDB.exec("SELECT DISTINCT ANUL FROM depcred ORDER BY ANUL DESC");
      const years = result[0]?.values.map(row => Number(row[0])) ?? [];
      setAvailableYears(years);
      if (!selectedYear && years.length > 0) {
        setSelectedYear(years[0]);
      }
    } catch (error) {
      console.error("Eroare la citirea listă ani:", error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [databases.activeCurrency, databases.hasEuroData]);

  useEffect(() => {
    if (!selectedYear) return;

    void incarcaDate(selectedYear);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYear, databases.activeCurrency, databases.hasEuroData]);

  async function incarcaDate(anul: number) {
    if (loading) return;

    setLoading(true);
    clearLog();
    setNoDataFound(false);
    setDataAnuala([]);

    pushLog("=".repeat(60));
    pushLog(`🔍 ÎNCĂRCARE DATE ANUALE - ${anul}`);
    pushLog("=".repeat(60));
    pushLog("");

    try {
      const depcredDB = getActiveDB(databases, "depcred");
      const membriDB = getActiveDB(databases, "membrii");

      const membriResult = membriDB.exec("SELECT NR_FISA, NUM_PREN FROM membrii");
      const numeMap = new Map<number, string>();
      if (membriResult.length > 0) {
        membriResult[0].values.forEach(row => {
          const nr = Number(row[0]);
          const nume = String(row[1] ?? "");
          numeMap.set(nr, nume);
        });
      }

      const dataResult = depcredDB.exec(
        `SELECT NR_FISA, LUNA, DOBANDA, IMPR_CRED, IMPR_SOLD, DEP_DEB, DEP_CRED, DEP_SOLD
         FROM depcred
         WHERE ANUL = ?
         ORDER BY NR_FISA, LUNA`,
        [anul]
      );

      if (dataResult.length === 0 || dataResult[0].values.length === 0) {
        pushLog("");
        pushLog("⚠️ Nu există date pentru anul selectat în DEPCRED.db");
        pushLog("💡 Generați lunile în modulul 'Generare lună' sau selectați alt an.");
        pushLog("");
        setNoDataFound(true);
        setDataAnuala([]);
        setLoading(false);
        return;
      }

      const map = new Map<number, AnnualMemberData>();

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

        const entry = map.get(nr_fisa)!;
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

      const rezultate = Array.from(map.values());
      setDataAnuala(rezultate);

      pushLog("");
      pushLog("✅ Date anuale încărcate cu succes!");
      pushLog(`📊 Total membri: ${rezultate.length}`);
      pushLog(`📆 An analizat: ${anul}`);
      pushLog("");
    } catch (error) {
      console.error("Eroare la încărcarea datelor anuale", error);
      pushLog("");
      pushLog("❌ EROARE la încărcarea datelor anuale:");
      pushLog(`   ${error}`);
      alert(`Eroare la încărcarea datelor: ${error}`);
    } finally {
      setLoading(false);
    }
  }

  const dateSortate = useMemo(() => {
    const sorted = [...dataAnuala];

    const compare = (a: AnnualMemberData, b: AnnualMemberData) => {
      const factor = sortOrder === "asc" ? 1 : -1;

      switch (sortColumn) {
        case "nr_fisa":
          return (a.nr_fisa - b.nr_fisa) * factor;
        case "nume":
          return a.nume.localeCompare(b.nume, "ro") * factor;
        case "luniActive":
          return (a.luniActive - b.luniActive) * factor;
        case "total_dobanda":
          return a.total_dobanda.comparedTo(b.total_dobanda) * factor;
        case "total_impr_cred":
          return a.total_impr_cred.comparedTo(b.total_impr_cred) * factor;
        case "total_dep_deb":
          return a.total_dep_deb.comparedTo(b.total_dep_deb) * factor;
        case "total_dep_cred":
          return a.total_dep_cred.comparedTo(b.total_dep_cred) * factor;
        case "total_plata":
          return a.total_plata.comparedTo(b.total_plata) * factor;
        case "sold_impr_final":
          return a.sold_impr_final.comparedTo(b.sold_impr_final) * factor;
        case "sold_dep_final":
          return a.sold_dep_final.comparedTo(b.sold_dep_final) * factor;
        default:
          return 0;
      }
    };

    sorted.sort(compare);
    return sorted;
  }, [dataAnuala, sortColumn, sortOrder]);

  const dateFiltrate = useMemo(() => {
    if (!searchTerm.trim()) return dateSortate;
    const term = searchTerm.toLowerCase();
    return dateSortate.filter(item =>
      item.nume.toLowerCase().includes(term) ||
      item.nr_fisa.toString().includes(term)
    );
  }, [dateSortate, searchTerm]);

  const totaluri = useMemo<SummaryTotals>(() => {
    return dataAnuala.reduce<SummaryTotals>((acc, item) => {
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

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortOrder(prev => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortOrder("asc");
    }
  };

  const renderSortIcon = (column: SortColumn) => {
    if (sortColumn !== column) {
      return <ArrowUpDown className="w-4 h-4 ml-1 opacity-30" />;
    }
    return sortOrder === "asc"
      ? <ArrowUp className="w-4 h-4 ml-1" />
      : <ArrowDown className="w-4 h-4 ml-1" />;
  };

  const formatCurrency = (value: Decimal): string => value.toFixed(2);

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
      pushLog("🔄 Pas 1/5: Inițializare document PDF (A4 landscape)...");

      const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
      doc.addFileToVFS("DejaVuSans.ttf", DejaVuSansNormal);
      doc.addFileToVFS("DejaVuSans-Bold.ttf", DejaVuSansBold);
      doc.addFont("DejaVuSans.ttf", "DejaVuSans", "normal");
      doc.addFont("DejaVuSans-Bold.ttf", "DejaVuSans", "bold");
      doc.setFont("DejaVuSans", "bold");
      doc.setFontSize(18);
      doc.text(`Situație anuală ${selectedYear}`, 40, 50);

      pushLog("🔄 Pas 2/5: Pregătire date tabel...");

      const head = [[
        "Nr. fișă",
        "Membru",
        "Luni active",
        "Total dobândă",
        "Rate achitate",
        "Cotizație",
        "Retrageri",
        "Total plată",
        "Sold împrumut (final)",
        "Sold depuneri (final)"
      ]];

      const body = dateFiltrate.map(item => [
        item.nr_fisa,
        item.nume,
        item.luniActive,
        formatCurrency(item.total_dobanda),
        formatCurrency(item.total_impr_cred),
        formatCurrency(item.total_dep_deb),
        formatCurrency(item.total_dep_cred),
        formatCurrency(item.total_plata),
        `${formatCurrency(item.sold_impr_final)}${item.are_neachitat_impr ? " ⚠" : ""}`,
        `${formatCurrency(item.sold_dep_final)}${item.are_neachitat_dep ? " ⚠" : ""}`
      ]);

      pushLog(`✅ Pregătite ${body.length} rânduri de date`);
      pushLog("🔄 Pas 3/5: Generare tabel...");

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
          5: { cellWidth: 80 },
          6: { cellWidth: 80 },
          7: { cellWidth: 80 },
          8: { cellWidth: 90 },
          9: { cellWidth: 90 }
        },
        didParseCell: data => {
          if (data.section === "body" && data.column.index >= 8) {
            const text = String(data.cell.raw ?? "");
            if (text.includes("⚠")) {
              data.cell.styles.textColor = [220, 38, 38];
            }
          }
        }
      });

      pushLog("🔄 Pas 4/5: Adăugare totaluri...");

      const docWithTable = doc as JsPDFWithAutoTable;
      const finalY = docWithTable.lastAutoTable?.finalY ?? 80;
      doc.setFont("DejaVuSans", "bold");
      doc.text(
        `Total dobândă: ${formatCurrency(totaluri.totalDobanda)} | ` +
        `Total rate: ${formatCurrency(totaluri.totalImprumut)} | ` +
        `Total cotizație: ${formatCurrency(totaluri.totalCotizatie)} | ` +
        `Total retrageri: ${formatCurrency(totaluri.totalRetrageri)} | ` +
        `Total plată: ${formatCurrency(totaluri.totalGeneral)}`,
        40,
        finalY + 30
      );

      pushLog("🔄 Pas 5/5: Salvare fișier PDF...");

      const fileName = `Situatie_Anuala_${selectedYear}.pdf`;
      doc.save(fileName);

      pushLog("✅ PDF salvat cu succes!");
      pushLog(`📄 Nume fișier: ${fileName}`);
      pushLog("=".repeat(60));
      pushLog("✅ EXPORT PDF FINALIZAT!");
      pushLog("=".repeat(60));
    } catch (error) {
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
        "Nr. fișă", "Nume", "Luni active",
        "Total dobândă", "Rate achitate", "Cotizație",
        "Retrageri", "Total plată", "Sold împrumut (final)", "Sold depuneri (final)"
      ];

      const rows: (string | number)[][] = [headers];
      dateFiltrate.forEach(item => {
        rows.push([
          item.nr_fisa,
          item.nume,
          item.luniActive,
          Number(formatCurrency(item.total_dobanda)),
          Number(formatCurrency(item.total_impr_cred)),
          Number(formatCurrency(item.total_dep_deb)),
          Number(formatCurrency(item.total_dep_cred)),
          Number(formatCurrency(item.total_plata)),
          Number(formatCurrency(item.sold_impr_final)),
          Number(formatCurrency(item.sold_dep_final))
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
        { wch: 20 },
        { wch: 20 }
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
    } catch (error) {
      pushLog("❌ EROARE la exportul Excel:");
      pushLog(`   ${error}`);
      alert(`Eroare la export Excel: ${error}`);
    }
  };

  return (
    <div className="w-full h-full flex flex-col gap-4 p-4 bg-slate-50">
      <div className="flex items-center justify-between">
        <Button onClick={onBack} variant="outline" className="gap-2">
          ← Înapoi la Dashboard
        </Button>

        <div className="flex items-center gap-3">
          <Select
            value={selectedYear ? String(selectedYear) : undefined}
            onValueChange={(value) => setSelectedYear(Number(value))}
          >
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Selectează an" />
            </SelectTrigger>
            <SelectContent>
              {availableYears.map(an => (
                <SelectItem key={an} value={String(an)}>
                  {an}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="relative w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Caută membru sau nr. fișă"
              className="pl-9"
            />
          </div>

          <Button
            onClick={exportPDF}
            disabled={loading || dateFiltrate.length === 0}
            className="gap-2"
          >
            <FileText className="w-4 h-4" /> PDF
          </Button>

          <Button
            onClick={exportExcel}
            disabled={loading || dateFiltrate.length === 0}
            className="gap-2"
          >
            <Download className="w-4 h-4" /> Excel
          </Button>
        </div>
      </div>

      <Card className="bg-white shadow-lg">
        <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <CardTitle className="text-3xl font-bold text-slate-800 flex items-center gap-2">
              📈 Vizualizare Anuală
              {selectedYear && (
                <span className="text-base font-normal text-slate-500">
                  <CalendarIcon className="w-5 h-5 inline-block mr-1" />
                  {selectedYear}
                </span>
              )}
            </CardTitle>
            <p className="text-slate-500">
              Analiză agregată a tuturor lunilor pentru membrii CAR. Datele sunt citite direct din DEPCRED.db / MEMBRII.db.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 w-full md:w-auto text-center">
            <div className="rounded-lg bg-blue-50 px-3 py-2">
              <div className="text-xs text-blue-600">Total dobândă</div>
              <div className="text-lg font-semibold text-blue-700">{formatCurrency(totaluri.totalDobanda)}</div>
            </div>
            <div className="rounded-lg bg-emerald-50 px-3 py-2">
              <div className="text-xs text-emerald-600">Total rate</div>
              <div className="text-lg font-semibold text-emerald-700">{formatCurrency(totaluri.totalImprumut)}</div>
            </div>
            <div className="rounded-lg bg-purple-50 px-3 py-2">
              <div className="text-xs text-purple-600">Total cotizație</div>
              <div className="text-lg font-semibold text-purple-700">{formatCurrency(totaluri.totalCotizatie)}</div>
            </div>
            <div className="rounded-lg bg-amber-50 px-3 py-2">
              <div className="text-xs text-amber-600">Total retrageri</div>
              <div className="text-lg font-semibold text-amber-700">{formatCurrency(totaluri.totalRetrageri)}</div>
            </div>
            <div className="rounded-lg bg-slate-100 px-3 py-2">
              <div className="text-xs text-slate-500">Total general plată</div>
              <div className="text-lg font-semibold text-slate-800">{formatCurrency(totaluri.totalGeneral)}</div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {loading && (
            <div className="flex items-center justify-center py-10 text-slate-500">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              Încărcare date anuale...
            </div>
          )}

          {!loading && noDataFound && (
            <Alert variant="warning">
              <AlertDescription>
                Nu s-au găsit înregistrări pentru anul selectat. Verificați dacă lunile au fost generate sau selectați alt an.
              </AlertDescription>
            </Alert>
          )}

          {!loading && !noDataFound && dateFiltrate.length === 0 && (
            <Alert>
              <AlertDescription>
                Nu există rezultate care să corespundă căutării "{searchTerm}".
              </AlertDescription>
            </Alert>
          )}

          {!loading && dateFiltrate.length > 0 && (
            <>
              <div className="hidden lg:block">
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-100 text-xs uppercase tracking-wide">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold text-slate-600 cursor-pointer" onClick={() => handleSort("nr_fisa")}>
                          Nr. fișă {renderSortIcon("nr_fisa")}
                        </th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-600 cursor-pointer" onClick={() => handleSort("nume")}>
                          Membru {renderSortIcon("nume")}
                        </th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-600 cursor-pointer" onClick={() => handleSort("luniActive")}>
                          Luni active {renderSortIcon("luniActive")}
                        </th>
                        <th className="px-4 py-3 text-right font-semibold text-slate-600 cursor-pointer" onClick={() => handleSort("total_dobanda")}>
                          Total dobândă {renderSortIcon("total_dobanda")}
                        </th>
                        <th className="px-4 py-3 text-right font-semibold text-slate-600 cursor-pointer" onClick={() => handleSort("total_impr_cred")}>
                          Rate achitate {renderSortIcon("total_impr_cred")}
                        </th>
                        <th className="px-4 py-3 text-right font-semibold text-slate-600 cursor-pointer" onClick={() => handleSort("total_dep_deb")}>
                          Cotizație {renderSortIcon("total_dep_deb")}
                        </th>
                        <th className="px-4 py-3 text-right font-semibold text-slate-600 cursor-pointer" onClick={() => handleSort("total_dep_cred")}>
                          Retrageri {renderSortIcon("total_dep_cred")}
                        </th>
                        <th className="px-4 py-3 text-right font-semibold text-slate-600 cursor-pointer" onClick={() => handleSort("total_plata")}>
                          Total plată {renderSortIcon("total_plata")}
                        </th>
                        <th className="px-4 py-3 text-right font-semibold text-slate-600 cursor-pointer" onClick={() => handleSort("sold_impr_final")}>
                          Sold împrumut (final) {renderSortIcon("sold_impr_final")}
                        </th>
                        <th className="px-4 py-3 text-right font-semibold text-slate-600 cursor-pointer" onClick={() => handleSort("sold_dep_final")}>
                          Sold depuneri (final) {renderSortIcon("sold_dep_final")}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                      {dateFiltrate.map(item => (
                        <tr key={item.nr_fisa} className="hover:bg-slate-50">
                          <td className="px-4 py-3 font-semibold text-slate-700">{item.nr_fisa}</td>
                          <td className="px-4 py-3 text-slate-700">
                            <div className="font-medium">{item.nume}</div>
                            <div className="text-xs text-slate-500">
                              {item.luni.length > 0 && `${item.luni[0].luna.toString().padStart(2, "0")}/${selectedYear} - ${item.luni[item.luni.length - 1].luna.toString().padStart(2, "0")}/${selectedYear}`}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-slate-600">{item.luniActive}</td>
                          <td className="px-4 py-3 text-right text-blue-600 font-medium">{formatCurrency(item.total_dobanda)}</td>
                          <td className="px-4 py-3 text-right text-emerald-600 font-medium">{formatCurrency(item.total_impr_cred)}</td>
                          <td className="px-4 py-3 text-right text-purple-600 font-medium">
                            {item.are_neachitat_dep ? "NEACHITAT" : formatCurrency(item.total_dep_deb)}
                          </td>
                          <td className="px-4 py-3 text-right text-amber-600 font-medium">{formatCurrency(item.total_dep_cred)}</td>
                          <td className="px-4 py-3 text-right font-semibold text-slate-700">{formatCurrency(item.total_plata)}</td>
                          <td className={`px-4 py-3 text-right font-medium ${item.are_neachitat_impr ? "text-red-600" : "text-slate-700"}`}>
                            {formatCurrency(item.sold_impr_final)}
                          </td>
                          <td className={`px-4 py-3 text-right font-medium ${item.are_neachitat_dep ? "text-red-600" : "text-slate-700"}`}>
                            {formatCurrency(item.sold_dep_final)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="lg:hidden space-y-4">
                {dateFiltrate.map(item => (
                  <div key={item.nr_fisa} className="rounded-xl border border-slate-200 bg-white shadow-sm">
                    <div className="px-4 py-3 border-b border-slate-100 flex justify-between items-center">
                      <div>
                        <div className="text-sm font-semibold text-slate-800">{item.nume}</div>
                        <div className="text-xs text-slate-500">Nr. fișă {item.nr_fisa} • {item.luniActive} luni</div>
                      </div>
                      <div className="text-right text-lg font-bold text-slate-700">
                        {formatCurrency(item.total_plata)}
                        <div className="text-xs text-slate-400">Total plată</div>
                      </div>
                    </div>

                    <div className="px-4 py-3 grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <div className="text-xs text-slate-500 uppercase">Total dobândă</div>
                        <div className="text-base font-semibold text-blue-600">{formatCurrency(item.total_dobanda)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-500 uppercase">Rate achitate</div>
                        <div className="text-base font-semibold text-emerald-600">{formatCurrency(item.total_impr_cred)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-500 uppercase">Cotizație</div>
                        <div className={`text-base font-semibold ${item.are_neachitat_dep ? "text-red-600" : "text-purple-600"}`}>
                          {item.are_neachitat_dep ? "NEACHITAT" : formatCurrency(item.total_dep_deb)}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-500 uppercase">Retrageri</div>
                        <div className="text-base font-semibold text-amber-600">{formatCurrency(item.total_dep_cred)}</div>
                      </div>
                    </div>

                    <div className="px-4 py-3 bg-slate-50 grid grid-cols-2 gap-3 text-xs text-slate-600">
                      <div>
                        <div className="font-semibold text-slate-500">Sold împrumut (final)</div>
                        <div className={`text-base font-semibold ${item.are_neachitat_impr ? "text-red-600" : "text-slate-700"}`}>
                          {formatCurrency(item.sold_impr_final)}
                        </div>
                      </div>
                      <div>
                        <div className="font-semibold text-slate-500">Sold depuneri (final)</div>
                        <div className={`text-base font-semibold ${item.are_neachitat_dep ? "text-red-600" : "text-slate-700"}`}>
                          {formatCurrency(item.sold_dep_final)}
                        </div>
                      </div>
                      <div className="col-span-2 text-slate-500">
                        <div className="font-semibold text-slate-600 mb-1">Cronologie lunară</div>
                        <div className="flex flex-wrap gap-2">
                          {item.luni.map(luna => (
                            <span
                              key={`${item.nr_fisa}-${luna.luna}`}
                              className={`px-2 py-1 rounded-full text-xs ${
                                luna.neachitat_impr || luna.neachitat_dep
                                  ? "bg-red-100 text-red-600"
                                  : "bg-slate-200 text-slate-600"
                              }`}
                            >
                              {MONTHS[luna.luna - 1]?.slice(0, 3)} • {formatCurrency(luna.total_plata)}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="bg-slate-900 text-slate-100 shadow-lg">
        <CardHeader>
          <CardTitle className="text-lg">📝 Jurnal operațiuni</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-48 pr-4">
            <div className="space-y-1 text-sm font-mono">
              {log.length === 0 && (
                <div className="text-slate-400">Jurnalul este gol. Afișați un an pentru a începe.</div>
              )}
              {log.map((line, idx) => (
                <div key={idx} className="whitespace-pre-wrap">{line}</div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
