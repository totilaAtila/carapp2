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
import { Loader2, FileText, Download, Search, Calendar as CalendarIcon, X } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";

import type { DBSet } from "../services/databaseManager";
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
  const currency = databases.activeCurrency || 'RON';

  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [dataAnuala, setDataAnuala] = useState<AnnualMemberData[]>([]);
  const [loading, setLoading] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [noDataFound, setNoDataFound] = useState(false);
  const [dataIncarcate, setDataIncarcate] = useState(false); // Stare pentru date încărcate

  const pushLog = (msg: string) => {
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
    } catch (error) {
      console.error("Eroare la citirea listă ani:", error);
    }
  }, [databases.activeCurrency, databases.hasEuroData]);

  // Funcția de încărcare date la apăsarea butonului "Afișează"
  async function incarcaDate(anul: number) {
    if (loading) return;

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
        setDataIncarcate(true);
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
    } catch (error) {
      console.error("Eroare la încărcarea datelor anuale", error);
      pushLog("");
      pushLog("❌ EROARE la încărcarea datelor anuale:");
      pushLog(`   ${error}`);
      alert(`Eroare la încărcarea datelor: ${error}`);
      setDataIncarcate(false);
    } finally {
      setLoading(false);
    }
  }

  // Căutare prefix - filtrează membrii al căror nume începe cu prefixul
  const dateFiltrate = useMemo(() => {
    if (!searchTerm.trim()) return dataAnuala;
    const term = searchTerm.toLowerCase();
    return dataAnuala.filter(item =>
      item.nume.toLowerCase().startsWith(term) ||
      item.nr_fisa.toString().startsWith(term)
    );
  }, [dataAnuala, searchTerm]);

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

  // Formatare număr în format românesc: separator mii=punct, zecimale=virgulă
  const formatCurrency = (value: Decimal): string => formatNumberRO(value.toNumber());

  const formatNeachitat = (value: Decimal, condition: boolean): string => {
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

      pushLog("🔄 Pas 6/6: Salvare fișier PDF...");

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

      // Creare workbook și worksheet cu ExcelJS
      const workbook = new ExcelJS.Workbook();
      const wsName = `Situatie_${selectedYear}`.substring(0, 31);
      const worksheet = workbook.addWorksheet(wsName);

      pushLog("🔄 Pas 2/4: Pregătire date...");

      // Definire coloane cu width
      worksheet.columns = [
        { header: "Nr. fișă", key: "nr_fisa", width: 10 },
        { header: "Nume prenume", key: "nume", width: 32 },
        { header: "Dobândă", key: "total_dobanda", width: 12 },
        { header: "Rată împrumut", key: "total_impr_cred", width: 16 },
        { header: "Sold împrumut", key: "sold_impr_final", width: 16 },
        { header: "Cotizație", key: "total_dep_deb", width: 16 },
        { header: "Retragere FS", key: "total_dep_cred", width: 16 },
        { header: "Sold depunere", key: "sold_dep_final", width: 16 },
        { header: "Total de plată", key: "total_plata", width: 16 }
      ];

      // Adăugare date
      dateFiltrate.forEach(item => {
        worksheet.addRow({
          nr_fisa: item.nr_fisa,
          nume: item.nume,
          total_dobanda: Number(item.total_dobanda), // Conversie explicită la număr
          total_impr_cred: item.are_neachitat_impr ? "NEACHITAT" : Number(item.total_impr_cred),
          sold_impr_final: Number(item.sold_impr_final),
          total_dep_deb: item.are_neachitat_dep ? "NEACHITAT" : Number(item.total_dep_deb),
          total_dep_cred: Number(item.total_dep_cred),
          sold_dep_final: Number(item.sold_dep_final),
          total_plata: Number(item.total_plata)
        });
      });

      pushLog(`✅ Pregătite ${dateFiltrate.length} rânduri de date`);
      pushLog("🔄 Pas 3/4: Calculare și adăugare rând TOTAL...");

      // Calculare totaluri pentru raportul anual (skip "NEACHITAT" values)
      const totaluri = {
        total_dobanda: dateFiltrate.reduce((sum, item) => sum + Number(item.total_dobanda), 0),
        total_impr_cred: dateFiltrate.reduce((sum, item) => {
          return sum + (item.are_neachitat_impr ? 0 : Number(item.total_impr_cred));
        }, 0),
        sold_impr_final: dateFiltrate.reduce((sum, item) => sum + Number(item.sold_impr_final), 0),
        total_dep_deb: dateFiltrate.reduce((sum, item) => {
          return sum + (item.are_neachitat_dep ? 0 : Number(item.total_dep_deb));
        }, 0),
        total_dep_cred: dateFiltrate.reduce((sum, item) => sum + Number(item.total_dep_cred), 0),
        sold_dep_final: dateFiltrate.reduce((sum, item) => sum + Number(item.sold_dep_final), 0),
        total_plata: dateFiltrate.reduce((sum, item) => sum + Number(item.total_plata), 0)
      };

      // Adăugare rând TOTAL la final (consistent cu Python original)
      const totalRow = worksheet.addRow({
        nr_fisa: "TOTAL:",  // Label în prima coloană
        nume: "",
        total_dobanda: totaluri.total_dobanda,
        total_impr_cred: totaluri.total_impr_cred,
        sold_impr_final: totaluri.sold_impr_final,
        total_dep_deb: totaluri.total_dep_deb,
        total_dep_cred: totaluri.total_dep_cred,
        sold_dep_final: totaluri.sold_dep_final,
        total_plata: totaluri.total_plata
      });

      // Merge primele 2 coloane pentru label TOTAL: (ca în Python - nu există LL-AA în anual)
      const totalRowNumber = totalRow.number;
      worksheet.mergeCells(totalRowNumber, 1, totalRowNumber, 2); // Coloanele A, B

      // Stilizare rând TOTAL (bold + background gri - consistent cu Python)
      totalRow.font = { bold: true };
      totalRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF0F0F0' } // Light gray (ca în Python original)
      };

      pushLog("✅ Rând TOTAL adăugat");
      pushLog("🔄 Pas 4/4: Aplicare formatare și stiluri...");

      // Aplicare format numeric cu 2 zecimale pentru coloanele monetare
      const numericColumns = [3, 4, 5, 6, 7, 8, 9]; // Dobândă până la Total de plată
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber > 1) { // Skip header
          numericColumns.forEach(colNum => {
            const cell = row.getCell(colNum);
            if (typeof cell.value === 'number') {
              cell.numFmt = '#,##0.00';
            }
          });
        }
      });

      // Stilizare header
      const headerRow = worksheet.getRow(1);
      headerRow.font = { bold: true };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFD9E1F2' }
      };

      // Freeze panes
      worksheet.views = [{ state: 'frozen', ySplit: 1 }];

      pushLog("🔄 Pas 4/4: Salvare fișier Excel...");

      // Export ca buffer și descărcare
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });

      const fileName = `Situatie_Anuala_${selectedYear}.xlsx`;
      saveAs(blob, fileName);

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
      {/* Header */}
      <Card>
        <CardHeader className="bg-gradient-to-r from-blue-600 to-blue-700 text-white md:bg-transparent md:text-inherit">
          <CardTitle className="flex items-center gap-2 justify-center md:justify-start">
            📈 Vizualizare Anuală
          </CardTitle>
        </CardHeader>
      </Card>

      {/* Control Panel */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center gap-4 flex-wrap">
            {/* Selector An + Buton Afișează */}
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-slate-700">An:</label>
              <Select
                value={selectedYear ? String(selectedYear) : undefined}
                onValueChange={(value) => setSelectedYear(Number(value))}
                disabled={loading}
              >
                <SelectTrigger className="w-[100px]">
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
              <Button
                onClick={() => selectedYear && incarcaDate(selectedYear)}
                disabled={loading || !selectedYear}
                className="bg-blue-600 hover:bg-blue-700"
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
            </div>

            {/* Butoane Export */}
            <Button
              onClick={exportPDF}
              disabled={loading || dateFiltrate.length === 0}
              className="bg-red-600 hover:bg-red-700 min-h-[44px]"
            >
              <FileText className="w-4 h-4 mr-2" /> PDF
            </Button>

            <Button
              onClick={exportExcel}
              disabled={loading || dateFiltrate.length === 0}
              className="bg-green-600 hover:bg-green-700 min-h-[44px]"
            >
              <Download className="w-4 h-4 mr-2" /> Excel
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Search cu buton X */}
      {dataIncarcate && dataAnuala.length > 0 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            type="text"
            placeholder="Caută prefix nume sau nr. fișă..."
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

      {/* Totaluri */}
      {dataIncarcate && dataAnuala.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-center">
          <div className="rounded-lg bg-blue-50 px-3 py-2">
            <div className="text-xs text-blue-600">Total dobândă</div>
            <div className="text-lg font-semibold text-blue-700">{formatCurrency(totaluri.totalDobanda)} {currency}</div>
          </div>
          <div className="rounded-lg bg-emerald-50 px-3 py-2">
            <div className="text-xs text-emerald-600">Total rate</div>
            <div className="text-lg font-semibold text-emerald-700">{formatCurrency(totaluri.totalImprumut)} {currency}</div>
          </div>
          <div className="rounded-lg bg-purple-50 px-3 py-2">
            <div className="text-xs text-purple-600">Total cotizație</div>
            <div className="text-lg font-semibold text-purple-700">{formatCurrency(totaluri.totalCotizatie)} {currency}</div>
          </div>
          <div className="rounded-lg bg-amber-50 px-3 py-2">
            <div className="text-xs text-amber-600">Total retrageri</div>
            <div className="text-lg font-semibold text-amber-700">{formatCurrency(totaluri.totalRetrageri)} {currency}</div>
          </div>
          <div className="rounded-lg bg-slate-100 px-3 py-2">
            <div className="text-xs text-slate-700">Total general plată</div>
            <div className="text-lg font-semibold text-slate-800">{formatCurrency(totaluri.totalGeneral)} {currency}</div>
          </div>
        </div>
      )}

      <CardContent className="space-y-6 p-0">
        {loading && (
          <div className="flex items-center justify-center py-10 text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Încărcare date anuale...
          </div>
        )}

        {!loading && dataIncarcate && noDataFound && (
          <Alert variant="warning">
            <AlertDescription>
              Nu s-au găsit înregistrări pentru anul selectat. Verificați dacă lunile au fost generate sau selectați alt an.
            </AlertDescription>
          </Alert>
        )}

        {!loading && dataIncarcate && !noDataFound && dateFiltrate.length === 0 && searchTerm && (
          <Alert>
            <AlertDescription>
              Nu există membri al căror nume sau număr fișă începe cu "{searchTerm}".
            </AlertDescription>
          </Alert>
        )}

        {!loading && dataIncarcate && dateFiltrate.length > 0 && (
          <>
            {/* LAYOUT DESKTOP - 9 coloane identice cu Python */}
            <div className="hidden lg:block">
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-100 text-xs uppercase tracking-wide">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-slate-600">Nr. fișă</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-600">Nume prenume</th>
                      <th className="px-4 py-3 text-right font-semibold text-slate-600">Dobândă</th>
                      <th className="px-4 py-3 text-right font-semibold text-slate-600">Rată împrumut</th>
                      <th className="px-4 py-3 text-right font-semibold text-slate-600">Sold împrumut</th>
                      <th className="px-4 py-3 text-right font-semibold text-slate-600">Cotizație</th>
                      <th className="px-4 py-3 text-right font-semibold text-slate-600">Retragere FS</th>
                      <th className="px-4 py-3 text-right font-semibold text-slate-600">Sold depunere</th>
                      <th className="px-4 py-3 text-right font-semibold text-slate-600">Total de plată</th>
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
                        <td className="px-4 py-3 text-right text-blue-600 font-medium">
                          {formatCurrency(item.total_dobanda)}
                        </td>
                        <td className={`px-4 py-3 text-right font-medium ${
                          item.are_neachitat_impr ? "text-red-600 font-bold" : "text-emerald-600"
                        }`}>
                          {formatNeachitat(item.total_impr_cred, item.are_neachitat_impr)}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-700 font-medium">
                          {formatCurrency(item.sold_impr_final)}
                        </td>
                        <td className={`px-4 py-3 text-right font-medium ${
                          item.are_neachitat_dep ? "text-red-600 font-bold" : "text-purple-600"
                        }`}>
                          {formatNeachitat(item.total_dep_deb, item.are_neachitat_dep)}
                        </td>
                        <td className="px-4 py-3 text-right text-amber-600 font-medium">
                          {formatCurrency(item.total_dep_cred)}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-700 font-medium">
                          {formatCurrency(item.sold_dep_final)}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-700">
                          {formatCurrency(item.total_plata)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* LAYOUT MOBIL - Consistent cu VizualizareLunara.tsx */}
            <div className="lg:hidden flex flex-col gap-4 flex-1">
              <div className="mb-2 text-sm text-slate-600 text-center">
                {dateFiltrate.length} / {dataAnuala.length} membri
              </div>
              <ScrollArea className="flex-1">
                <div className="space-y-3 pb-4">
                  {dateFiltrate.map((item, idx) => (
                    <Card
                      key={item.nr_fisa}
                      className="border-l-4"
                      style={{
                        borderLeftColor: idx % 2 === 0 ? "#3b82f6" : "#f97316"
                      }}
                    >
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center justify-between">
                          <span className="line-clamp-2 leading-snug">{item.nume}</span>
                          <span className="text-sm font-normal text-slate-600">
                            #{item.nr_fisa}
                          </span>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2 text-sm leading-relaxed">
                        <div className="grid grid-cols-2 gap-3 sm:gap-4">
                          <div>
                            <div className="text-xs text-slate-700">Dobândă</div>
                            <div className="font-semibold text-blue-600">
                              {formatCurrency(item.total_dobanda)}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-slate-700">Rată împrumut</div>
                            <div className={item.are_neachitat_impr ? "font-bold text-red-600" : "font-semibold text-emerald-600"}>
                              {formatNeachitat(item.total_impr_cred, item.are_neachitat_impr)}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-slate-700">Sold împrumut</div>
                            <div className="font-semibold text-slate-700">
                              {formatCurrency(item.sold_impr_final)}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-slate-700">Cotizație</div>
                            <div className={item.are_neachitat_dep ? "font-bold text-red-600" : "font-semibold text-purple-600"}>
                              {formatNeachitat(item.total_dep_deb, item.are_neachitat_dep)}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-slate-700">Retragere FS</div>
                            <div className="font-semibold text-amber-600">
                              {formatCurrency(item.total_dep_cred)}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-slate-700">Sold depunere</div>
                            <div className="font-semibold text-slate-700">
                              {formatCurrency(item.sold_dep_final)}
                            </div>
                          </div>
                        </div>
                        <div className="pt-2 border-t flex items-center justify-between">
                          <span className="text-xs text-slate-700">Total plătit anual:</span>
                          <span className="text-lg font-bold text-blue-600">
                            {formatCurrency(item.total_plata)} {currency}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </>
        )}

        {/* Mesaj inițial - încă nu s-au încărcat date */}
        {!loading && !dataIncarcate && (
          <Alert>
            <AlertDescription className="text-center">
              Selectați un an și apăsați butonul "Afișează" pentru a vizualiza datele anuale.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>

      {/* Jurnal */}
      {log.length > 0 && (
        <Card className="bg-slate-900 text-slate-100 shadow-lg">
          <CardHeader>
            <CardTitle className="text-lg">📝 Jurnal operațiuni</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-48 pr-4">
              <div className="space-y-1 text-sm font-mono">
                {log.map((line, idx) => (
                  <div key={idx} className="whitespace-pre-wrap">{line}</div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
