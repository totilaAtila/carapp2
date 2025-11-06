import { useEffect, useMemo, useRef, useState } from 'react';
import jsPDF from 'jspdf';
import { DejaVuSansNormal, DejaVuSansBold } from '../utils/dejavu-fonts';
import type { DBSet } from '../services/databaseManager';
import { getActiveDB } from '../services/databaseManager';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/buttons';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Input } from './ui/input';

interface Props {
  databases: DBSet;
  onBack: () => void;
}

interface ReceiptRow {
  luna: number;
  anul: number;
  dobanda: number;
  imprumutAchitat: number;
  imprumutSold: number;
  depunere: number;
  retragere: number;
  depuneriSold: number;
  nrFisa: number;
  nume: string;
}

interface Summary {
  totalDobanda: number;
  totalImprumut: number;
  totalDepuneri: number;
  totalRetrageri: number;
  totalGeneral: number;
  totalRows: number;
}

type RawSqlValue = number | string | null | undefined;

const MONTH_OPTIONS = [
  { value: 1, label: '01 - Ianuarie' },
  { value: 2, label: '02 - Februarie' },
  { value: 3, label: '03 - Martie' },
  { value: 4, label: '04 - Aprilie' },
  { value: 5, label: '05 - Mai' },
  { value: 6, label: '06 - Iunie' },
  { value: 7, label: '07 - Iulie' },
  { value: 8, label: '08 - August' },
  { value: 9, label: '09 - Septembrie' },
  { value: 10, label: '10 - Octombrie' },
  { value: 11, label: '11 - Noiembrie' },
  { value: 12, label: '12 - Decembrie' },
];

const RECEIPT_DISPLAY_LIMIT = 500;

function formatCurrency(value: number): string {
  return value.toLocaleString('ro-RO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function safeNumber(value: unknown): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function toStringValue(value: RawSqlValue): string {
  if (value === null || typeof value === 'undefined') {
    return '';
  }
  return String(value);
}

function collectMemberNames(values: RawSqlValue[][]): Map<number, string> {
  const cache = new Map<number, string>();
  for (const row of values) {
    if (!row) continue;
    const nrFisa = safeNumber(row[0]);
    const nume = toStringValue(row[1]);
    if (nrFisa > 0 && nume) {
      cache.set(nrFisa, nume);
    }
  }
  return cache;
}

function mapReceiptRows(rows: RawSqlValue[][], nameCache: Map<number, string>): ReceiptRow[] {
  return rows.map((row) => {
    const nrFisa = safeNumber(row?.[8]);
    return {
      luna: safeNumber(row?.[0]),
      anul: safeNumber(row?.[1]),
      dobanda: safeNumber(row?.[2]),
      imprumutAchitat: safeNumber(row?.[3]),
      imprumutSold: safeNumber(row?.[4]),
      depunere: safeNumber(row?.[5]),
      retragere: safeNumber(row?.[6]),
      depuneriSold: safeNumber(row?.[7]),
      nrFisa,
      nume: nameCache.get(nrFisa) ?? '',
    };
  });
}

function computeSummary(rows: ReceiptRow[]): Summary {
  const totalDobanda = rows.reduce((acc, row) => acc + row.dobanda, 0);
  const totalImprumut = rows.reduce((acc, row) => acc + row.imprumutAchitat, 0);
  const totalDepuneri = rows.reduce((acc, row) => acc + row.depunere, 0);
  const totalRetrageri = rows.reduce((acc, row) => acc + row.retragere, 0);
  const totalGeneral = totalDobanda + totalImprumut + totalDepuneri;

  return {
    totalDobanda,
    totalImprumut,
    totalDepuneri,
    totalRetrageri,
    totalGeneral,
    totalRows: rows.length,
  };
}

function getMonthLabel(monthValue: number): string {
  const option = MONTH_OPTIONS.find((item) => item.value === monthValue);
  if (!option) return `${String(monthValue).padStart(2, '0')}`;
  const parts = option.label.split(' - ');
  return parts.length === 2 ? parts[1] : option.label;
}

export default function Listari({ databases, onBack }: Props) {
  const currentDate = new Date();
  const [selectedMonth, setSelectedMonth] = useState<number>(currentDate.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState<number>(currentDate.getFullYear());
  const [currentReceiptNumber, setCurrentReceiptNumber] = useState<string>('1');
  const [receiptsPerPage, setReceiptsPerPage] = useState<number>(10);
  const [receiptsCount, setReceiptsCount] = useState<number>(0);
  const [previewData, setPreviewData] = useState<ReceiptRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState<boolean>(false);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [progressVisible, setProgressVisible] = useState<boolean>(false);
  const [progressValue, setProgressValue] = useState<number>(0);
  const [progressMessage, setProgressMessage] = useState<string>('');
  const [generatedPdf, setGeneratedPdf] = useState<
    { url: string; fileName: string; blob: Blob } | null
  >(null);
  const [summarySuffix, setSummarySuffix] = useState<string>('');
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [logLines, setLogLines] = useState<string[]>([]);
  const cancelRequestedRef = useRef<boolean>(false);
  const logContainerRef = useRef<HTMLDivElement | null>(null);

  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const years: number[] = [];
    for (let year = 2000; year <= currentYear + 10; year += 1) {
      years.push(year);
    }
    return years;
  }, []);

  const displayRows = useMemo(() => {
    if (previewData.length > 1000) {
      setSummarySuffix(`⚡ Afișare optimizată: prime ${RECEIPT_DISPLAY_LIMIT} din ${previewData.length} chitanțe`);
      return previewData.slice(0, RECEIPT_DISPLAY_LIMIT);
    }
    setSummarySuffix('');
    return previewData;
  }, [previewData]);

  useEffect(() => {
    if (generatedPdf) {
      return () => {
        URL.revokeObjectURL(generatedPdf.url);
      };
    }
    return undefined;
  }, [generatedPdf]);

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logLines]);

  useEffect(() => {
    loadCurrentReceiptNumber();
    updateReceiptCount(selectedMonth, selectedYear);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [databases]);

  useEffect(() => {
    updateReceiptCount(selectedMonth, selectedYear);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMonth, selectedYear]);

  function logMessage(message: string) {
    setLogLines((prev) => [...prev, message]);
  }

  function setProgress(value: number, message: string, visible = true) {
    setProgressVisible(visible);
    setProgressValue(value);
    setProgressMessage(message);
  }

  function resetProgress() {
    setProgressVisible(false);
    setProgressValue(0);
    setProgressMessage('');
  }

  function loadCurrentReceiptNumber() {
    try {
      const result = databases.chitante.exec('SELECT STARTCH_AC FROM CHITANTE LIMIT 1');
      const value = result[0]?.values?.[0]?.[0];
      const numberValue = safeNumber(value);
      setCurrentReceiptNumber(String(numberValue > 0 ? numberValue : 1));
    } catch (error) {
      setCurrentReceiptNumber('1');
      logMessage(`❌ Eroare încărcare număr chitanță: ${error}`);
    }
  }

  function updateReceiptCount(month: number, year: number) {
    try {
      const db = getActiveDB(databases, 'depcred');
      const query = `SELECT COUNT(*) FROM DEPCRED WHERE LUNA = ${month} AND ANUL = ${year}`;
      const result = db.exec(query);
      const count = safeNumber(result[0]?.values?.[0]?.[0]);
      setReceiptsCount(count);
    } catch (error) {
      setReceiptsCount(0);
      logMessage(`❌ Eroare numărare chitanțe: ${error}`);
    }
  }

  async function handlePreview() {
    if (isPreviewLoading || isGenerating) {
      logMessage('⚠️ Actualizare preview deja în curs');
      return;
    }

    setIsPreviewLoading(true);
    setPreviewError(null);
    cancelRequestedRef.current = false;
    setProgress(5, 'Inițializare previzualizare...');

    try {
      const monthLabel = getMonthLabel(selectedMonth);
      logMessage(`🔍 Previzualizare ${monthLabel} ${selectedYear}`);
      setProgress(20, 'Preluare date din baza de date...');

      const depcredDb = getActiveDB(databases, 'depcred');
      const membriiDb = getActiveDB(databases, 'membrii');

      const query = `
        SELECT LUNA, ANUL, DOBANDA, IMPR_CRED, IMPR_SOLD,
               DEP_DEB, DEP_CRED, DEP_SOLD, NR_FISA
        FROM DEPCRED
        WHERE LUNA = ${selectedMonth} AND ANUL = ${selectedYear}
      `;
      const result = depcredDb.exec(query);
      const rows = result[0]?.values ?? [];

      if (rows.length === 0) {
        setPreviewData([]);
        setSummary(null);
        setReceiptsCount(0);
        setProgress(100, 'Nu există chitanțe pentru perioada selectată');
        setTimeout(() => resetProgress(), 800);
        logMessage('ℹ️ Nu există chitanțe pentru perioada selectată');
        return;
      }

      const uniqueFise = Array.from(
        new Set(
          rows
            .map((row) => safeNumber(row[8]))
            .filter((nrFisa) => Number.isFinite(nrFisa) && nrFisa > 0)
        )
      );

      let nameMap = new Map<number, string>();

      if (uniqueFise.length > 0) {
        setProgress(35, 'Preluare nume membri...');
        const inClause = uniqueFise.join(',');
        const membriResult = membriiDb.exec(
          `SELECT NR_FISA, NUM_PREN FROM MEMBRII WHERE NR_FISA IN (${inClause})`
        );
        const membriRows = membriResult[0]?.values ?? [];
        nameMap = collectMemberNames(membriRows as RawSqlValue[][]);
      }

      setProgress(45, `Procesare ${rows.length} înregistrări...`);

      const mappedRows = mapReceiptRows(rows as RawSqlValue[][], nameMap);

      setProgress(65, 'Sortare rezultate...');
      mappedRows.sort((a, b) => a.nume.localeCompare(b.nume, 'ro'));

      const summaryData = computeSummary(mappedRows);

      setSummary(summaryData);
      setPreviewData(mappedRows);
      setReceiptsCount(mappedRows.length);

      setProgress(100, 'Previzualizare completă!');
      setTimeout(() => resetProgress(), 800);
      logMessage(
        `✅ Previzualizare completă: ${mappedRows.length} chitanțe, total ${formatCurrency(summaryData.totalGeneral)} ${databases.activeCurrency}`
      );
    } catch (error) {
      setPreviewData([]);
      setSummary(null);
      setReceiptsCount(0);
      setPreviewError(`Eroare la încărcarea datelor: ${error}`);
      resetProgress();
      logMessage(`❌ Eroare previzualizare: ${error}`);
      alert(`Eroare la previzualizare: ${error}`);
    } finally {
      setIsPreviewLoading(false);
    }
  }

  async function handlePrint() {
    if (previewData.length === 0) {
      alert('Nu există date de tipărit. Apăsați mai întâi pe Preview.');
      return;
    }

    const nrChitantaInitial = safeNumber(currentReceiptNumber);
    if (nrChitantaInitial <= 0) {
      alert('Numărul chitanței trebuie să fie un număr pozitiv.');
      return;
    }

    if (currentReceiptNumber.trim().length >= 8) {
      const resetNumber = window.confirm(
        'Numărul curent al chitanței are 7+ cifre.\n\nApăsați OK pentru a reseta la 1.\nApăsați Anulează pentru a păstra numărul existent.'
      );

      if (resetNumber) {
        const success = resetReceiptNumber();
        if (!success) {
          return;
        }
      } else {
        const continueWithLarge = window.confirm(
          'Doriți să continuați cu numărul mare?\n\nApăsați OK pentru a continua. Apăsați Anulează pentru a renunța la generare.'
        );
        if (!continueWithLarge) {
          logMessage('ℹ️ Generarea a fost anulată de utilizator (număr chitanță mare)');
          return;
        }
      }
    }

    const monthLabel = getMonthLabel(selectedMonth);
    const confirmMessage = `Generați chitanțele pentru ${monthLabel} ${selectedYear}?\n\n` +
      `Număr chitanțe: ${previewData.length}\n` +
      `Număr chitanță inițial: ${currentReceiptNumber.trim()}`;

    if (!window.confirm(confirmMessage)) {
      return;
    }

    // Nu verificăm assertCanWrite - CHITANTE.db este comună pentru RON și EUR
    // Acest modul doar tipărește și scrie în CHITANTE.db (nu modifică date monetare)

    cancelRequestedRef.current = false;
    setIsGenerating(true);
    setProgress(5, 'Inițializare generare PDF...');
    logMessage(`🚀 Generare chitanțe pornită pentru ${monthLabel} ${selectedYear}`);

    try {
      const { blob, fileName, finalNumber } = await generatePdf(previewData, nrChitantaInitial);
      if (cancelRequestedRef.current) {
        throw new Error('cancelled');
      }

      const url = URL.createObjectURL(blob);
      if (generatedPdf) {
        URL.revokeObjectURL(generatedPdf.url);
      }
      setGeneratedPdf({ url, fileName, blob });

      updateChitanteAfterGeneration(nrChitantaInitial, finalNumber);
      loadCurrentReceiptNumber();
      setProgress(100, 'Generare finalizată!');
      setTimeout(() => resetProgress(), 800);
      logMessage(`✅ PDF generat cu succes: ${previewData.length} chitanțe`);
      logMessage(`📁 Fișier pregătit pentru descărcare: ${fileName}`);
    } catch (error: any) {
      if (error?.message === 'cancelled') {
        logMessage('🛑 Generarea a fost anulată de utilizator');
      } else {
        logMessage(`❌ Eroare generare PDF: ${error}`);
        alert(`Eroare la generarea PDF: ${error}`);
      }
      resetProgress();
    } finally {
      setIsGenerating(false);
    }
  }

  async function generatePdf(rows: ReceiptRow[], startNumber: number) {
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    doc.addFileToVFS('DejaVuSans.ttf', DejaVuSansNormal);
    doc.addFont('DejaVuSans.ttf', 'DejaVuSans', 'normal');
    doc.addFileToVFS('DejaVuSans-Bold.ttf', DejaVuSansBold);
    doc.addFont('DejaVuSans-Bold.ttf', 'DejaVuSans', 'bold');

    const perPage = Math.min(15, Math.max(5, receiptsPerPage));
    const pageHeight = doc.internal.pageSize.getHeight();
    const xOffset = 14;
    const rowHeight = 79;

    let currentNumber = startNumber - 1;

    for (let index = 0; index < rows.length; index += 1) {
      if (cancelRequestedRef.current) {
        throw new Error('cancelled');
      }

      const row = rows[index];
      currentNumber += 1;
      const positionInPage = index % perPage;
      const yPosition = pageHeight - 25 - positionInPage * rowHeight;

      drawReceipt(doc, yPosition, currentNumber, row, xOffset);

      // Adaugă pagină nouă după fiecare set complet de perPage chitanțe
      // (exact ca în Python - fără condiție despre ultima chitanță)
      if (positionInPage === perPage - 1) {
        doc.addPage();
      }

      if (index % 5 === 0) {
        const progress = 30 + Math.round(((index + 1) / rows.length) * 50);
        setProgress(progress, `Procesare chitanță ${index + 1}/${rows.length}...`);
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    if (cancelRequestedRef.current) {
      throw new Error('cancelled');
    }

    setProgress(85, 'Adăugare pagină totaluri...');
    doc.addPage();
    drawTotalsPage(doc, rows, selectedMonth, selectedYear);

    if (cancelRequestedRef.current) {
      throw new Error('cancelled');
    }

    setProgress(95, 'Generare fișier PDF...');
    const blob = doc.output('blob');
    const fileName = `chitante_${String(selectedMonth).padStart(2, '0')}_${selectedYear}.pdf`;

    return { blob, fileName, finalNumber: currentNumber };
  }

  function drawReceipt(doc: jsPDF, yPosition: number, chitNumber: number, data: ReceiptRow, xOffset: number) {
    // În jsPDF: Y crește în JOS (opus față de ReportLab din Python)
    // yPosition aici = BOTTOM al chitanței
    // În Python: y_position = TOP al chitanței
    // Trebuie să mapăm corect coordonatele!

    const chenarX1 = 49 + xOffset;
    const chenarX2 = 550 + xOffset;
    const newHeight = 71;
    const chenarY1 = yPosition - newHeight;  // TOP în jsPDF
    const chenarY2 = yPosition;              // BOTTOM în jsPDF

    doc.setLineWidth(2);
    doc.rect(chenarX1, chenarY1, chenarX2 - chenarX1, chenarY2 - chenarY1);

    // Liniile interioare scurte - mapare EXACTĂ din Python
    // Python: cpdf.line(x, y_position - 22, x, y_position - 36)
    //         cpdf.line(x, y_position - 57, x, y_position - 71)
    // În Python, y_position = TOP, deci:
    //   - y_position - 22 = 22 puncte SUB top
    //   - y_position - 36 = 36 puncte SUB top
    // În jsPDF, trebuie: chenarY1 (top) + offset:
    doc.setLineWidth(1);
    [152, 230, 380, 460].forEach((lineX) => {
      // Linia 1: de la 22px sub top la 36px sub top
      doc.line(lineX + xOffset, chenarY1 + 22, lineX + xOffset, chenarY1 + 36);
      // Linia 2: de la 57px sub top la 71px sub top (= bottom)
      doc.line(lineX + xOffset, chenarY1 + 57, lineX + xOffset, chenarY1 + 71);
    });

    doc.setLineWidth(2);
    doc.line(95 + xOffset, chenarY1, 95 + xOffset, chenarY2);
    doc.line(300 + xOffset, chenarY1, 300 + xOffset, chenarY2);
    const middleY = (chenarY1 + chenarY2) / 2;
    doc.line(50 + xOffset, middleY, 550 + xOffset, middleY);

    // Text - mapare din Python
    // Python folosește y_position (TOP), noi folosim yPosition (BOTTOM)
    // Python: y_position - offset = offset SUB top
    // jsPDF: chenarY1 + offset = offset SUB top
    doc.setFont('DejaVuSans', 'bold');
    doc.setFontSize(10);
    doc.text('Chit.', 51 + xOffset, chenarY1 + 16);
    doc.text('N u m e   ș i   p r e n u m e', 130 + xOffset, chenarY1 + 16);

    doc.setFont('DejaVuSans', 'normal');
    doc.text('Semnătură casier', 340 + xOffset, chenarY1 + 16);
    doc.text('LL-AAAA', 51 + xOffset, chenarY1 + 30);
    doc.text('Dobânda', 107 + xOffset, chenarY1 + 30);  // Mutat cu 1px la stânga
    doc.text('Rată împr.', 160 + xOffset, chenarY1 + 30);  // Prescurtat
    doc.text('Sold împr.', 231 + xOffset, chenarY1 + 30);  // Prescurtat
    doc.text('Depun. lun.', 320 + xOffset, chenarY1 + 30);
    doc.text('Retragere FS', 395 + xOffset, chenarY1 + 30);
    doc.text('Sold depuneri', 477 + xOffset, chenarY1 + 30);

    doc.setFont('DejaVuSans', 'bold');
    doc.text(String(chitNumber), 51 + xOffset, chenarY1 + 52);
    doc.text(data.nume, 130 + xOffset, chenarY1 + 52);
    doc.text('Total de plată =', 340 + xOffset, chenarY1 + 52);

    const totalPlata = data.dobanda + data.imprumutAchitat + data.depunere;
    doc.text(`${formatCurrency(totalPlata)} lei`, 434 + xOffset, chenarY1 + 52);

    doc.setFont('DejaVuSans', 'normal');
    doc.text(`${String(data.luna).padStart(2, '0')}-${data.anul}`, 51 + xOffset, chenarY1 + 67);  // Fără spații
    doc.text(formatCurrency(data.dobanda), 120 + xOffset, chenarY1 + 67);
    doc.text(formatCurrency(data.imprumutAchitat), 180 + xOffset, chenarY1 + 67);
    doc.text(formatCurrency(data.imprumutSold), 250 + xOffset, chenarY1 + 67);
    doc.text(formatCurrency(data.depunere), 330 + xOffset, chenarY1 + 67);
    doc.text(formatCurrency(data.retragere), 395 + xOffset, chenarY1 + 67);
    doc.text(formatCurrency(data.depuneriSold), 485 + xOffset, chenarY1 + 67);
  }

  function drawTotalsPage(doc: jsPDF, rows: ReceiptRow[], month: number, year: number) {
    // Desenare la TOP (în loc de bottom ca înainte)
    // yPosition = referință pentru chenar (top al zonei de totaluri)
    const yPosition = 150;  // Începe la 150px de la top

    const totalDobanda = rows.reduce((acc, row) => acc + row.dobanda, 0);
    const totalImprumut = rows.reduce((acc, row) => acc + row.imprumutAchitat, 0);
    const totalDepuneri = rows.reduce((acc, row) => acc + row.depunere, 0);
    const totalRetrageri = rows.reduce((acc, row) => acc + row.retragere, 0);
    const totalGeneral = totalDobanda + totalImprumut + totalDepuneri;

    // Titluri la top
    doc.setFont('DejaVuSans', 'bold');
    doc.setFontSize(14);
    doc.text('SITUAȚIE LUNARĂ', 180, 50);   // 50px de la top
    doc.text(`LUNA ${String(month).padStart(2, '0')} - ANUL ${year}`, 150, 80);  // 80px de la top

    // Chenarul pentru totaluri (150px de la top, înălțime 120)
    doc.setLineWidth(2);
    doc.rect(100, yPosition, 400, 120);
    doc.line(100, yPosition + 60, 500, yPosition + 60);  // Linie orizontală la mijloc
    doc.line(300, yPosition, 300, yPosition + 120);  // Linie verticală

    // Text și valori în chenar
    doc.setFont('DejaVuSans', 'normal');
    doc.setFontSize(10);
    doc.text('Total dobândă:', 120, yPosition + 90);
    doc.text(`${formatCurrency(totalDobanda)} lei`, 220, yPosition + 90);
    doc.text('Total împrumut:', 120, yPosition + 70);
    doc.text(`${formatCurrency(totalImprumut)} lei`, 220, yPosition + 70);
    doc.text('Total depuneri:', 320, yPosition + 90);
    doc.text(`${formatCurrency(totalDepuneri)} lei`, 420, yPosition + 90);
    doc.text('Total retrageri:', 320, yPosition + 70);
    doc.text(`${formatCurrency(totalRetrageri)} lei`, 420, yPosition + 70);

    // Total general
    doc.setFont('DejaVuSans', 'bold');
    doc.setFontSize(12);
    doc.text('TOTAL GENERAL:', 150, yPosition + 30);
    doc.text(`${formatCurrency(totalGeneral)} lei`, 380, yPosition + 30);

    // Footer la bottom
    doc.setFont('DejaVuSans', 'normal');
    doc.setFontSize(8);
    const today = new Date();
    doc.text(`Generat la: ${today.toLocaleDateString('ro-RO')}`, 100, 30);
    doc.text(`Total chitanțe: ${rows.length}`, 400, 30);
  }

  function updateChitanteAfterGeneration(startNumber: number, finalNumber: number) {
    try {
      const result = databases.chitante.exec('SELECT ROWID, STARTCH_AC FROM CHITANTE LIMIT 1');
      const row = result[0]?.values?.[0];

      if (row) {
        const rowId = safeNumber(row[0]);
        const startchAcAnterior = safeNumber(row[1]);
        const startchPr = startNumber === 1 ? 0 : startchAcAnterior;
        databases.chitante.run(`UPDATE CHITANTE SET STARTCH_PR=${startchPr}, STARTCH_AC=${finalNumber} WHERE ROWID=${rowId}`);
        logMessage(`📝 Actualizare CHITANTE: STARTCH_PR=${startchPr}, STARTCH_AC=${finalNumber}`);
      } else {
        const startchPr = startNumber === 1 ? 0 : finalNumber;
        databases.chitante.run(`INSERT INTO CHITANTE (STARTCH_PR, STARTCH_AC) VALUES (${startchPr}, ${finalNumber})`);
        logMessage(`📝 Înregistrare CHITANTE nouă: STARTCH_PR=${startchPr}, STARTCH_AC=${finalNumber}`);
      }
    } catch (error) {
      logMessage(`⚠️ Eroare actualizare CHITANTE.db: ${error}`);
    }
  }

  function resetReceiptNumber(): boolean {
    try {
      const result = databases.chitante.exec('SELECT ROWID FROM CHITANTE LIMIT 1');
      const rowId = result[0]?.values?.[0]?.[0];
      if (rowId !== undefined) {
        databases.chitante.run(`UPDATE CHITANTE SET STARTCH_AC=1 WHERE ROWID=${safeNumber(rowId)}`);
      } else {
        databases.chitante.run('INSERT INTO CHITANTE (STARTCH_PR, STARTCH_AC) VALUES (0, 1)');
      }
      setCurrentReceiptNumber('1');
      logMessage('🔄 Număr chitanță resetat la 1');
      return true;
    } catch (error) {
      alert(`Nu s-a putut reseta numărul chitanței: ${error}`);
      logMessage(`❌ Eroare resetare număr chitanță: ${error}`);
      return false;
    }
  }

  function handleCancel() {
    if (!isGenerating && !isPreviewLoading) {
      return;
    }
    cancelRequestedRef.current = true;
    setIsPreviewLoading(false);
    setIsGenerating(false);
    resetProgress();
    logMessage('🛑 Operație anulată de utilizator');
  }

  function handleResetForm() {
    setSelectedMonth(currentDate.getMonth() + 1);
    setSelectedYear(currentDate.getFullYear());
    setReceiptsPerPage(10);
    setPreviewData([]);
    setSummary(null);
    setPreviewError(null);
    if (generatedPdf) {
      URL.revokeObjectURL(generatedPdf.url);
      setGeneratedPdf(null);
    }
    logMessage('🔄 Formular resetat la valorile implicite');

    if (window.confirm('Resetați și numărul chitanței la 1?')) {
      resetReceiptNumber();
    }

    updateReceiptCount(currentDate.getMonth() + 1, currentDate.getFullYear());
  }

  function handleOpenPdf() {
    if (!generatedPdf) {
      alert('Nu există niciun fișier PDF generat.');
      return;
    }
    window.open(generatedPdf.url, '_blank', 'noopener');
    logMessage(`📂 Deschidere fișier: ${generatedPdf.fileName}`);
  }

  function handleSavePdf() {
    if (!generatedPdf) {
      alert('Nu există niciun fișier PDF generat.');
      return;
    }

    try {
      const { blob, url, fileName } = generatedPdf;
      const navigatorAny = window.navigator as typeof window.navigator & {
        msSaveOrOpenBlob?: (blob: Blob, defaultName?: string) => void;
      };

      if (typeof navigatorAny.msSaveOrOpenBlob === 'function') {
        navigatorAny.msSaveOrOpenBlob(blob, fileName);
        logMessage(`💾 PDF salvat local (Windows API): ${fileName}`);
        return;
      }

      const anchor = document.createElement('a');
      const supportsDownloadAttr = typeof anchor.download !== 'undefined';

      if (supportsDownloadAttr) {
        anchor.href = url;
        anchor.download = fileName;
        anchor.rel = 'noopener';
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        logMessage(`💾 Descărcare PDF inițiată: ${fileName}`);
      } else {
        window.open(url, '_blank', 'noopener');
        logMessage(
          `ℹ️ Browser fără suport download automat. Fișier deschis pentru salvare manuală: ${fileName}`
        );
      }
    } catch (error: any) {
      logMessage(`❌ Eroare la salvarea PDF-ului: ${error}`);
      alert(`Eroare la salvarea PDF-ului: ${error}`);
    }
  }

  function handleSaveLog() {
    if (logLines.length === 0) {
      alert('Jurnalul este gol.');
      return;
    }

    const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15);
    const fileName = `jurnal_chitante_${timestamp}.txt`;
    const content = [
      `Jurnal Chitanțe CAR - Tipărire Lunară ${databases.activeCurrency}`,
      `Generat la: ${new Date().toLocaleDateString('ro-RO')}`,
      '='.repeat(60),
      '',
      ...logLines,
    ].join('\n');

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    logMessage(`💾 Jurnal salvat: ${fileName}`);
  }

  const summaryText = summary
    ? `📊 ${summary.totalRows} chitanțe | 💰 Total general: ${formatCurrency(summary.totalGeneral)} ${databases.activeCurrency}\n` +
      `🔹 Dobândă: ${formatCurrency(summary.totalDobanda)} | Rate: ${formatCurrency(summary.totalImprumut)} | ` +
      `Depuneri: ${formatCurrency(summary.totalDepuneri)} | Retrageri: ${formatCurrency(summary.totalRetrageri)}`
    : '💡 Apăsați \'Preview\' pentru a încărca datele...';

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">
            📄 Chitanțe CAR - Tipărire Lunară {databases.activeCurrency}
          </h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onBack}>
            ← Înapoi la Dashboard
          </Button>
          <Button variant="ghost" onClick={handleResetForm} disabled={isGenerating}>
            🔄 Reset formular
          </Button>
        </div>
      </div>

      {progressVisible && (
        <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-700">{progressMessage}</p>
            <span className="text-xs text-slate-500">{progressValue}%</span>
          </div>
          <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
            <div
              className="h-2 bg-blue-500 transition-all"
              style={{ width: `${progressValue}%` }}
            />
          </div>
          <div className="flex justify-end">
            <Button variant="destructive" size="sm" onClick={handleCancel}>
              🛑 Anulează operația
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-col xl:flex-row gap-4">
        <div className="xl:w-2/5 space-y-4">
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle className="text-lg text-slate-800">📅 Perioada chitanțelor</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600">Luna</label>
                  <Select
                    value={selectedMonth.toString()}
                    onValueChange={(value) => setSelectedMonth(Number(value))}
                    disabled={isPreviewLoading || isGenerating}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MONTH_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value.toString()}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600">Anul</label>
                  <Select
                    value={selectedYear.toString()}
                    onValueChange={(value) => setSelectedYear(Number(value))}
                    disabled={isPreviewLoading || isGenerating}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {yearOptions.map((year) => (
                        <SelectItem key={year} value={year.toString()}>
                          {year}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600">Nr. chitanță curent</label>
                  <Input
                    value={currentReceiptNumber}
                    onChange={(event) => {
                      const value = event.target.value;
                      if (/^\d*$/.test(value)) {
                        setCurrentReceiptNumber(value);
                      }
                    }}
                    disabled={isGenerating}
                    placeholder="Ex: 1001"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600">Nr. chitanțe de tipărit</label>
                  <Input value={receiptsCount.toString()} readOnly className="bg-slate-100" />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600">Chitanțe per pagină</label>
                <Input
                  type="number"
                  min={5}
                  max={15}
                  value={receiptsPerPage}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    if (Number.isFinite(value)) {
                      setReceiptsPerPage(Math.min(15, Math.max(5, value)));
                    }
                  }}
                  disabled={isGenerating}
                />
                <p className="text-xs text-slate-500">Interval permis: 5 - 15 chitanțe pe pagină.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <Button
                  variant="warning"
                  onClick={handlePreview}
                  disabled={isPreviewLoading || isGenerating}
                >
                  {isPreviewLoading ? '⏳ Se încarcă...' : '🔍 Preview'}
                </Button>
                <Button
                  variant="success"
                  onClick={handlePrint}
                  disabled={isPreviewLoading || isGenerating || previewData.length === 0}
                >
                  {isGenerating ? '⏳ Se generează...' : '📄 Generează PDF'}
                </Button>
                <Button variant="secondary" onClick={handleResetForm} disabled={isGenerating}>
                  🔄 Reset
                </Button>
                <Button
                  variant="outline"
                  onClick={handleOpenPdf}
                  disabled={!generatedPdf}
                >
                  📁 Deschide PDF
                </Button>
                <Button variant="outline" onClick={handleSavePdf} disabled={!generatedPdf}>
                  💾 Salvează PDF
                </Button>
              </div>

              {generatedPdf && (
                <div className="rounded-md bg-green-50 border border-green-200 px-3 py-2 text-xs text-green-700 space-y-1">
                  <p>
                    ✅ Ultimul fișier generat: <span className="font-semibold">{generatedPdf.fileName}</span>
                  </p>
                  <p className="text-[11px] text-green-800">
                    💡 Butonul „Salvează PDF” funcționează și offline, atât pe desktop cât și pe mobil.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle className="text-lg text-slate-800">📝 Jurnal</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div
                ref={logContainerRef}
                className="bg-slate-900 text-green-100 rounded-lg p-3 h-40 overflow-y-auto text-xs font-mono"
              >
                {logLines.length === 0 ? (
                  <p className="text-slate-400">Activitatea va fi înregistrată aici...</p>
                ) : (
                  logLines.map((line, index) => (
                    <p key={index} className="leading-relaxed whitespace-pre-wrap">
                      {line}
                    </p>
                  ))
                )}
              </div>
              <div className="flex items-center justify-between">
                <div className="space-x-2">
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      setLogLines([]);
                    }}
                  >
                    🗑️ Golește jurnal
                  </Button>
                  <Button variant="success" size="sm" onClick={handleSaveLog}>
                    💾 Salvează jurnal
                  </Button>
                </div>
                <span className="text-xs text-slate-500">
                  {logLines.length} linii înregistrate
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="xl:flex-1 space-y-4">
          <Card className="shadow-lg h-full">
            <CardHeader>
              <CardTitle className="text-lg text-slate-800 flex items-center justify-between">
                <span>📊 Previzualizare chitanțe</span>
                <span className="text-xs text-slate-500">Afișare ordonată alfabetic</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700 whitespace-pre-line">
                {summaryText}
                {summarySuffix && (
                  <span className="block mt-1 text-xs text-blue-500">{summarySuffix}</span>
                )}
              </div>

              {previewError && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {previewError}
                </div>
              )}

              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="min-w-full divide-y divide-slate-200 text-xs">
                  <thead className="bg-slate-100 text-slate-600 uppercase">
                    <tr>
                      <th className="px-3 py-2 text-left">Nr. Fișă</th>
                      <th className="px-3 py-2 text-left">Nume</th>
                      <th className="px-3 py-2 text-right">Dobândă</th>
                      <th className="px-3 py-2 text-right">Rată Împr.</th>
                      <th className="px-3 py-2 text-right">Sold Împr.</th>
                      <th className="px-3 py-2 text-right">Dep. Lun.</th>
                      <th className="px-3 py-2 text-right">Retr. FS</th>
                      <th className="px-3 py-2 text-right">Sold Dep.</th>
                      <th className="px-3 py-2 text-right">Total Plată</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {displayRows.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-3 py-6 text-center text-slate-500">
                          Nu există date pentru perioada selectată.
                        </td>
                      </tr>
                    ) : (
                      displayRows.map((row, index) => {
                        const totalPlata = row.dobanda + row.imprumutAchitat + row.depunere;
                        return (
                          <tr key={`${row.nrFisa}-${index}`} className="hover:bg-slate-50">
                            <td className="px-3 py-2 font-semibold text-slate-800">{row.nrFisa}</td>
                            <td className="px-3 py-2 text-slate-700">{row.nume}</td>
                            <td className="px-3 py-2 text-right">{formatCurrency(row.dobanda)}</td>
                            <td className="px-3 py-2 text-right">{formatCurrency(row.imprumutAchitat)}</td>
                            <td className="px-3 py-2 text-right">{formatCurrency(row.imprumutSold)}</td>
                            <td className="px-3 py-2 text-right">{formatCurrency(row.depunere)}</td>
                            <td className="px-3 py-2 text-right">{formatCurrency(row.retragere)}</td>
                            <td className="px-3 py-2 text-right">{formatCurrency(row.depuneriSold)}</td>
                            <td className="px-3 py-2 text-right font-semibold text-slate-900">
                              {formatCurrency(totalPlata)}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
