import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from 'react';
import jsPDF from 'jspdf';
import { getActiveDB } from '../services/databaseManager';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/buttons';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Input } from './ui/input';
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
function formatCurrency(value) {
    return value.toLocaleString('ro-RO', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}
function safeNumber(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
}
function toStringValue(value) {
    if (value === null || typeof value === 'undefined') {
        return '';
    }
    return String(value);
}
function collectMemberNames(values) {
    const cache = new Map();
    for (const row of values) {
        if (!row)
            continue;
        const nrFisa = safeNumber(row[0]);
        const nume = toStringValue(row[1]);
        if (nrFisa > 0 && nume) {
            cache.set(nrFisa, nume);
        }
    }
    return cache;
}
function mapReceiptRows(rows, nameCache) {
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
function computeSummary(rows) {
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
function getMonthLabel(monthValue) {
    const option = MONTH_OPTIONS.find((item) => item.value === monthValue);
    if (!option)
        return `${String(monthValue).padStart(2, '0')}`;
    const parts = option.label.split(' - ');
    return parts.length === 2 ? parts[1] : option.label;
}
export default function Listari({ databases, onBack }) {
    const currentDate = new Date();
    const [selectedMonth, setSelectedMonth] = useState(currentDate.getMonth() + 1);
    const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear());
    const [currentReceiptNumber, setCurrentReceiptNumber] = useState('1');
    const [receiptsPerPage, setReceiptsPerPage] = useState(10);
    const [receiptsCount, setReceiptsCount] = useState(0);
    const [previewData, setPreviewData] = useState([]);
    const [summary, setSummary] = useState(null);
    const [isPreviewLoading, setIsPreviewLoading] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [progressVisible, setProgressVisible] = useState(false);
    const [progressValue, setProgressValue] = useState(0);
    const [progressMessage, setProgressMessage] = useState('');
    const [generatedPdf, setGeneratedPdf] = useState(null);
    const [previewError, setPreviewError] = useState(null);
    const [logLines, setLogLines] = useState([]);
    const cancelRequestedRef = useRef(false);
    const logContainerRef = useRef(null);
    const yearOptions = useMemo(() => {
        const currentYear = new Date().getFullYear();
        const years = [];
        for (let year = 2000; year <= currentYear + 10; year += 1) {
            years.push(year);
        }
        return years;
    }, []);
    const { displayRows, summarySuffix } = useMemo(() => {
        if (previewData.length > 1000) {
            return {
                displayRows: previewData.slice(0, RECEIPT_DISPLAY_LIMIT),
                summarySuffix: `⚡ Afișare optimizată: prime ${RECEIPT_DISPLAY_LIMIT} din ${previewData.length} chitanțe`
            };
        }
        return {
            displayRows: previewData,
            summarySuffix: ''
        };
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
    // Scroll la top când se montează componenta (pentru mobile)
    useEffect(() => {
        window.scrollTo(0, 0);
    }, []);
    function logMessage(message) {
        setLogLines((prev) => [...prev, message]);
    }
    function setProgress(value, message, visible = true) {
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
        }
        catch (error) {
            setCurrentReceiptNumber('1');
            logMessage(`❌ Eroare încărcare număr chitanță: ${error}`);
        }
    }
    function updateReceiptCount(month, year) {
        try {
            const db = getActiveDB(databases, 'depcred');
            const query = `SELECT COUNT(*) FROM DEPCRED WHERE LUNA = ${month} AND ANUL = ${year}`;
            const result = db.exec(query);
            const count = safeNumber(result[0]?.values?.[0]?.[0]);
            setReceiptsCount(count);
        }
        catch (error) {
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
            const uniqueFise = Array.from(new Set(rows
                .map((row) => safeNumber(row[8]))
                .filter((nrFisa) => Number.isFinite(nrFisa) && nrFisa > 0)));
            let nameMap = new Map();
            if (uniqueFise.length > 0) {
                setProgress(35, 'Preluare nume membri...');
                const inClause = uniqueFise.join(',');
                const membriResult = membriiDb.exec(`SELECT NR_FISA, NUM_PREN FROM MEMBRII WHERE NR_FISA IN (${inClause})`);
                const membriRows = membriResult[0]?.values ?? [];
                nameMap = collectMemberNames(membriRows);
            }
            setProgress(45, `Procesare ${rows.length} înregistrări...`);
            const mappedRows = mapReceiptRows(rows, nameMap);
            setProgress(65, 'Sortare rezultate...');
            mappedRows.sort((a, b) => a.nume.localeCompare(b.nume, 'ro'));
            const summaryData = computeSummary(mappedRows);
            setSummary(summaryData);
            setPreviewData(mappedRows);
            setReceiptsCount(mappedRows.length);
            setProgress(100, 'Previzualizare completă!');
            setTimeout(() => resetProgress(), 800);
            logMessage(`✅ Previzualizare completă: ${mappedRows.length} chitanțe, total ${formatCurrency(summaryData.totalGeneral)} ${databases.activeCurrency}`);
        }
        catch (error) {
            setPreviewData([]);
            setSummary(null);
            setReceiptsCount(0);
            setPreviewError(`Eroare la încărcarea datelor: ${error}`);
            resetProgress();
            logMessage(`❌ Eroare previzualizare: ${error}`);
            alert(`Eroare la previzualizare: ${error}`);
        }
        finally {
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
            const resetNumber = window.confirm('Numărul curent al chitanței are 7+ cifre.\n\nApăsați OK pentru a reseta la 1.\nApăsați Anulează pentru a păstra numărul existent.');
            if (resetNumber) {
                const success = resetReceiptNumber();
                if (!success) {
                    return;
                }
            }
            else {
                const continueWithLarge = window.confirm('Doriți să continuați cu numărul mare?\n\nApăsați OK pentru a continua. Apăsați Anulează pentru a renunța la generare.');
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
        }
        catch (error) {
            if (error?.message === 'cancelled') {
                logMessage('🛑 Generarea a fost anulată de utilizator');
            }
            else {
                logMessage(`❌ Eroare generare PDF: ${error}`);
                alert(`Eroare la generarea PDF: ${error}`);
            }
            resetProgress();
        }
        finally {
            setIsGenerating(false);
        }
    }
    async function generatePdf(rows, startNumber) {
        // Încărcare dinamică fonturi (evită bundle bloat la cold start)
        const { DejaVuSansNormal, DejaVuSansBold } = await import('../utils/dejavu-fonts');
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
            drawReceipt(doc, yPosition, currentNumber, row, xOffset, databases);
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
        drawTotalsPage(doc, rows, selectedMonth, selectedYear, databases);
        if (cancelRequestedRef.current) {
            throw new Error('cancelled');
        }
        setProgress(95, 'Generare fișier PDF...');
        const blob = doc.output('blob');
        const fileName = `chitante_${String(selectedMonth).padStart(2, '0')}_${selectedYear}.pdf`;
        return { blob, fileName, finalNumber: currentNumber };
    }
    function drawReceipt(doc, yPosition, chitNumber, data, xOffset, databases) {
        // În jsPDF: Y crește în JOS (opus față de ReportLab din Python)
        // yPosition aici = BOTTOM al chitanței
        // În Python: y_position = TOP al chitanței
        // Trebuie să mapăm corect coordonatele!
        const chenarX1 = 49 + xOffset;
        const chenarX2 = 550 + xOffset;
        const newHeight = 71;
        const chenarY1 = yPosition - newHeight; // TOP în jsPDF
        const chenarY2 = yPosition; // BOTTOM în jsPDF
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
        doc.text('Dobânda', 103 + xOffset, chenarY1 + 30); // Mutat cu 1px la stânga
        doc.text('Rată împr.', 160 + xOffset, chenarY1 + 30); // Prescurtat
        doc.text('Sold împr.', 233 + xOffset, chenarY1 + 30); // Prescurtat
        doc.text('Depun. lun.', 319 + xOffset, chenarY1 + 30);
        doc.text('Retragere FS', 390 + xOffset, chenarY1 + 30);
        doc.text('Sold depuneri', 473 + xOffset, chenarY1 + 30);
        doc.setFont('DejaVuSans', 'bold');
        doc.text(String(chitNumber), 51 + xOffset, chenarY1 + 52);
        doc.text(data.nume, 130 + xOffset, chenarY1 + 52);
        doc.text('Total de plată =', 340 + xOffset, chenarY1 + 52);
        const totalPlata = data.dobanda + data.imprumutAchitat + data.depunere;
        doc.text(`${formatCurrency(totalPlata)} ${databases.activeCurrency}`, 434 + xOffset, chenarY1 + 52);
        doc.setFont('DejaVuSans', 'normal');
        doc.text(`${String(data.luna).padStart(2, '0')}-${data.anul}`, 51 + xOffset, chenarY1 + 67); // Fără spații
        doc.text(formatCurrency(data.dobanda), 113 + xOffset, chenarY1 + 67);
        doc.text(formatCurrency(data.imprumutAchitat), 180 + xOffset, chenarY1 + 67);
        doc.text(formatCurrency(data.imprumutSold), 248 + xOffset, chenarY1 + 67);
        doc.text(formatCurrency(data.depunere), 330 + xOffset, chenarY1 + 67);
        doc.text(formatCurrency(data.retragere), 395 + xOffset, chenarY1 + 67);
        doc.text(formatCurrency(data.depuneriSold), 485 + xOffset, chenarY1 + 67);
    }
    function drawTotalsPage(doc, rows, month, year, databases) {
        // Desenare la TOP (în loc de bottom ca înainte)
        // yPosition = referință pentru chenar (top al zonei de totaluri)
        const yPosition = 150; // Începe la 150px de la top
        const totalDobanda = rows.reduce((acc, row) => acc + row.dobanda, 0);
        const totalImprumut = rows.reduce((acc, row) => acc + row.imprumutAchitat, 0);
        const totalDepuneri = rows.reduce((acc, row) => acc + row.depunere, 0);
        const totalRetrageri = rows.reduce((acc, row) => acc + row.retragere, 0);
        const totalGeneral = totalDobanda + totalImprumut + totalDepuneri;
        // Titluri la top
        doc.setFont('DejaVuSans', 'bold');
        doc.setFontSize(14);
        doc.text('SITUAȚIE LUNARĂ', 180, 50); // 50px de la top
        doc.text(`LUNA ${String(month).padStart(2, '0')} - ANUL ${year}`, 150, 80); // 80px de la top
        // Chenarul pentru totaluri (150px de la top, înălțime 120)
        doc.setLineWidth(2);
        doc.rect(100, yPosition, 400, 120);
        doc.line(100, yPosition + 60, 500, yPosition + 60); // Linie orizontală la mijloc
        doc.line(300, yPosition, 300, yPosition + 120); // Linie verticală
        // Text și valori în chenar
        doc.setFont('DejaVuSans', 'normal');
        doc.setFontSize(10);
        doc.text('Total dobândă:', 120, yPosition + 90);
        doc.text(`${formatCurrency(totalDobanda)} ${databases.activeCurrency}`, 220, yPosition + 90);
        doc.text('Total împrumut:', 120, yPosition + 70);
        doc.text(`${formatCurrency(totalImprumut)} ${databases.activeCurrency}`, 220, yPosition + 70);
        doc.text('Total depuneri:', 320, yPosition + 90);
        doc.text(`${formatCurrency(totalDepuneri)} ${databases.activeCurrency}`, 420, yPosition + 90);
        doc.text('Total retrageri:', 320, yPosition + 70);
        doc.text(`${formatCurrency(totalRetrageri)} ${databases.activeCurrency}`, 420, yPosition + 70);
        // Total general
        doc.setFont('DejaVuSans', 'bold');
        doc.setFontSize(12);
        doc.text('TOTAL GENERAL:', 150, yPosition + 30);
        doc.text(`${formatCurrency(totalGeneral)} ${databases.activeCurrency}`, 380, yPosition + 30);
        // Footer la bottom
        doc.setFont('DejaVuSans', 'normal');
        doc.setFontSize(8);
        const today = new Date();
        doc.text(`Generat la: ${today.toLocaleDateString('ro-RO')}`, 100, 30);
        doc.text(`Total chitanțe: ${rows.length}`, 400, 30);
    }
    function updateChitanteAfterGeneration(startNumber, finalNumber) {
        try {
            const result = databases.chitante.exec('SELECT ROWID, STARTCH_AC FROM CHITANTE LIMIT 1');
            const row = result[0]?.values?.[0];
            if (row) {
                const rowId = safeNumber(row[0]);
                const startchAcAnterior = safeNumber(row[1]);
                const startchPr = startNumber === 1 ? 0 : startchAcAnterior;
                databases.chitante.run(`UPDATE CHITANTE SET STARTCH_PR=${startchPr}, STARTCH_AC=${finalNumber} WHERE ROWID=${rowId}`);
                logMessage(`📝 Actualizare CHITANTE: STARTCH_PR=${startchPr}, STARTCH_AC=${finalNumber}`);
            }
            else {
                const startchPr = startNumber === 1 ? 0 : finalNumber;
                databases.chitante.run(`INSERT INTO CHITANTE (STARTCH_PR, STARTCH_AC) VALUES (${startchPr}, ${finalNumber})`);
                logMessage(`📝 Înregistrare CHITANTE nouă: STARTCH_PR=${startchPr}, STARTCH_AC=${finalNumber}`);
            }
        }
        catch (error) {
            logMessage(`⚠️ Eroare actualizare CHITANTE.db: ${error}`);
        }
    }
    function resetReceiptNumber() {
        try {
            const result = databases.chitante.exec('SELECT ROWID FROM CHITANTE LIMIT 1');
            const rowId = result[0]?.values?.[0]?.[0];
            if (rowId !== undefined) {
                databases.chitante.run(`UPDATE CHITANTE SET STARTCH_AC=1 WHERE ROWID=${safeNumber(rowId)}`);
            }
            else {
                databases.chitante.run('INSERT INTO CHITANTE (STARTCH_PR, STARTCH_AC) VALUES (0, 1)');
            }
            setCurrentReceiptNumber('1');
            logMessage('🔄 Număr chitanță resetat la 1');
            return true;
        }
        catch (error) {
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
            const navigatorAny = window.navigator;
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
            }
            else {
                window.open(url, '_blank', 'noopener');
                logMessage(`ℹ️ Browser fără suport download automat. Fișier deschis pentru salvare manuală: ${fileName}`);
            }
        }
        catch (error) {
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
    return (_jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3", children: [_jsx("div", { children: _jsxs("h1", { className: "text-2xl font-bold text-slate-800", children: ["\uD83D\uDCC4 Chitan\u021Be CAR - Tip\u0103rire Lunar\u0103 ", databases.activeCurrency] }) }), _jsxs("div", { className: "flex gap-2", children: [_jsx(Button, { variant: "outline", onClick: onBack, children: "\u2190 \u00CEnapoi la Dashboard" }), _jsx(Button, { variant: "ghost", onClick: handleResetForm, disabled: isGenerating, children: "\uD83D\uDD04 Reset formular" })] })] }), progressVisible && (_jsxs("div", { className: "bg-white border border-slate-200 rounded-lg p-4 shadow-sm space-y-3", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("p", { className: "text-sm font-semibold text-slate-700", children: progressMessage }), _jsxs("span", { className: "text-xs text-slate-500", children: [progressValue, "%"] })] }), _jsx("div", { className: "h-2 bg-slate-200 rounded-full overflow-hidden", children: _jsx("div", { className: "h-2 bg-blue-500 transition-all", style: { width: `${progressValue}%` } }) }), _jsx("div", { className: "flex justify-end", children: _jsx(Button, { variant: "destructive", size: "sm", onClick: handleCancel, children: "\uD83D\uDED1 Anuleaz\u0103 opera\u021Bia" }) })] })), _jsxs("div", { className: "flex flex-col xl:flex-row gap-4", children: [_jsxs("div", { className: "xl:w-2/5 space-y-4", children: [_jsxs(Card, { className: "shadow-lg", children: [_jsx(CardHeader, { children: _jsx(CardTitle, { className: "text-lg text-slate-800", children: "\uD83D\uDCC5 Perioada chitan\u021Belor" }) }), _jsxs(CardContent, { className: "space-y-4", children: [_jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-3", children: [_jsxs("div", { className: "space-y-1", children: [_jsx("label", { className: "text-xs font-semibold text-slate-600", children: "Luna" }), _jsxs(Select, { value: selectedMonth.toString(), onValueChange: (value) => setSelectedMonth(Number(value)), disabled: isPreviewLoading || isGenerating, children: [_jsx(SelectTrigger, { className: "w-full", children: _jsx(SelectValue, {}) }), _jsx(SelectContent, { children: MONTH_OPTIONS.map((option) => (_jsx(SelectItem, { value: option.value.toString(), children: option.label }, option.value))) })] })] }), _jsxs("div", { className: "space-y-1", children: [_jsx("label", { className: "text-xs font-semibold text-slate-600", children: "Anul" }), _jsxs(Select, { value: selectedYear.toString(), onValueChange: (value) => setSelectedYear(Number(value)), disabled: isPreviewLoading || isGenerating, children: [_jsx(SelectTrigger, { className: "w-full", children: _jsx(SelectValue, {}) }), _jsx(SelectContent, { children: yearOptions.map((year) => (_jsx(SelectItem, { value: year.toString(), children: year }, year))) })] })] })] }), _jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-3", children: [_jsxs("div", { className: "space-y-1", children: [_jsx("label", { className: "text-xs font-semibold text-slate-600", children: "Nr. chitan\u021B\u0103 curent" }), _jsx(Input, { value: currentReceiptNumber, onChange: (event) => {
                                                                    const value = event.target.value;
                                                                    if (/^\d*$/.test(value)) {
                                                                        setCurrentReceiptNumber(value);
                                                                    }
                                                                }, disabled: isGenerating, placeholder: "Ex: 1001" })] }), _jsxs("div", { className: "space-y-1", children: [_jsx("label", { className: "text-xs font-semibold text-slate-600", children: "Nr. chitan\u021Be de tip\u0103rit" }), _jsx(Input, { value: receiptsCount.toString(), readOnly: true, className: "bg-slate-100" })] })] }), _jsxs("div", { className: "space-y-1", children: [_jsx("label", { className: "text-xs font-semibold text-slate-600", children: "Chitan\u021Be per pagin\u0103" }), _jsx(Input, { type: "number", min: 5, max: 15, value: receiptsPerPage, onChange: (event) => {
                                                            const value = Number(event.target.value);
                                                            if (Number.isFinite(value)) {
                                                                setReceiptsPerPage(Math.min(15, Math.max(5, value)));
                                                            }
                                                        }, disabled: isGenerating }), _jsx("p", { className: "text-xs text-slate-500", children: "Interval permis: 5 - 15 chitan\u021Be pe pagin\u0103." })] }), _jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-2", children: [_jsx(Button, { variant: "warning", onClick: handlePreview, disabled: isPreviewLoading || isGenerating, children: isPreviewLoading ? '⏳ Se încarcă...' : '🔍 Preview' }), _jsx(Button, { variant: "success", onClick: handlePrint, disabled: isPreviewLoading || isGenerating || previewData.length === 0, children: isGenerating ? '⏳ Se generează...' : '📄 Generează PDF' }), _jsx(Button, { variant: "secondary", onClick: handleResetForm, disabled: isGenerating, children: "\uD83D\uDD04 Reset" }), _jsx(Button, { variant: "outline", onClick: handleOpenPdf, disabled: !generatedPdf, children: "\uD83D\uDCC1 Deschide PDF" }), _jsx(Button, { variant: "outline", onClick: handleSavePdf, disabled: !generatedPdf, children: "\uD83D\uDCBE Salveaz\u0103 PDF" })] }), generatedPdf && (_jsxs("div", { className: "rounded-md bg-green-50 border border-green-200 px-3 py-2 text-xs text-green-700 space-y-1", children: [_jsxs("p", { children: ["\u2705 Ultimul fi\u0219ier generat: ", _jsx("span", { className: "font-semibold", children: generatedPdf.fileName })] }), _jsx("p", { className: "text-[11px] text-green-800", children: "\uD83D\uDCA1 Butonul \u201ESalveaz\u0103 PDF\u201D func\u021Bioneaz\u0103 \u0219i offline, at\u00E2t pe desktop c\u00E2t \u0219i pe mobil." })] }))] })] }), _jsxs(Card, { className: "shadow-lg", children: [_jsx(CardHeader, { children: _jsx(CardTitle, { className: "text-lg text-slate-800", children: "\uD83D\uDCDD Jurnal" }) }), _jsxs(CardContent, { className: "space-y-3", children: [_jsx("div", { ref: logContainerRef, className: "bg-slate-900 text-green-100 rounded-lg p-3 h-40 overflow-y-auto text-xs font-mono", children: logLines.length === 0 ? (_jsx("p", { className: "text-slate-400", children: "Activitatea va fi \u00EEnregistrat\u0103 aici..." })) : (logLines.map((line, index) => (_jsx("p", { className: "leading-relaxed whitespace-pre-wrap", children: line }, index)))) }), _jsxs("div", { className: "flex items-center justify-between", children: [_jsxs("div", { className: "space-x-2", children: [_jsx(Button, { variant: "destructive", size: "sm", onClick: () => {
                                                                    setLogLines([]);
                                                                }, children: "\uD83D\uDDD1\uFE0F Gole\u0219te jurnal" }), _jsx(Button, { variant: "success", size: "sm", onClick: handleSaveLog, children: "\uD83D\uDCBE Salveaz\u0103 jurnal" })] }), _jsxs("span", { className: "text-xs text-slate-500", children: [logLines.length, " linii \u00EEnregistrate"] })] })] })] })] }), _jsx("div", { className: "xl:flex-1 space-y-4", children: _jsxs(Card, { className: "shadow-lg h-full", children: [_jsx(CardHeader, { children: _jsxs(CardTitle, { className: "text-lg text-slate-800 flex items-center justify-between", children: [_jsx("span", { children: "\uD83D\uDCCA Previzualizare chitan\u021Be" }), _jsx("span", { className: "text-xs text-slate-500", children: "Afi\u0219are ordonat\u0103 alfabetic" })] }) }), _jsxs(CardContent, { className: "space-y-3", children: [_jsxs("div", { className: "rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700 whitespace-pre-line", children: [summaryText, summarySuffix && (_jsx("span", { className: "block mt-1 text-xs text-blue-500", children: summarySuffix }))] }), previewError && (_jsx("div", { className: "rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700", children: previewError })), _jsx("div", { className: "overflow-x-auto border border-slate-200 rounded-lg", children: _jsxs("table", { className: "min-w-full divide-y divide-slate-200 text-xs", children: [_jsx("thead", { className: "bg-slate-100 text-slate-600 uppercase", children: _jsxs("tr", { children: [_jsx("th", { className: "px-3 py-2 text-left", children: "Nr. Fi\u0219\u0103" }), _jsx("th", { className: "px-3 py-2 text-left", children: "Nume" }), _jsx("th", { className: "px-3 py-2 text-right", children: "Dob\u00E2nd\u0103" }), _jsx("th", { className: "px-3 py-2 text-right", children: "Rat\u0103 \u00CEmpr." }), _jsx("th", { className: "px-3 py-2 text-right", children: "Sold \u00CEmpr." }), _jsx("th", { className: "px-3 py-2 text-right", children: "Dep. Lun." }), _jsx("th", { className: "px-3 py-2 text-right", children: "Retr. FS" }), _jsx("th", { className: "px-3 py-2 text-right", children: "Sold Dep." }), _jsx("th", { className: "px-3 py-2 text-right", children: "Total Plat\u0103" })] }) }), _jsx("tbody", { className: "divide-y divide-slate-100 bg-white", children: displayRows.length === 0 ? (_jsx("tr", { children: _jsx("td", { colSpan: 9, className: "px-3 py-6 text-center text-slate-500", children: "Nu exist\u0103 date pentru perioada selectat\u0103." }) })) : (displayRows.map((row, index) => {
                                                            const totalPlata = row.dobanda + row.imprumutAchitat + row.depunere;
                                                            return (_jsxs("tr", { className: "hover:bg-slate-50", children: [_jsx("td", { className: "px-3 py-2 font-semibold text-slate-800", children: row.nrFisa }), _jsx("td", { className: "px-3 py-2 text-slate-700", children: row.nume }), _jsx("td", { className: "px-3 py-2 text-right", children: formatCurrency(row.dobanda) }), _jsx("td", { className: "px-3 py-2 text-right", children: formatCurrency(row.imprumutAchitat) }), _jsx("td", { className: "px-3 py-2 text-right", children: formatCurrency(row.imprumutSold) }), _jsx("td", { className: "px-3 py-2 text-right", children: formatCurrency(row.depunere) }), _jsx("td", { className: "px-3 py-2 text-right", children: formatCurrency(row.retragere) }), _jsx("td", { className: "px-3 py-2 text-right", children: formatCurrency(row.depuneriSold) }), _jsx("td", { className: "px-3 py-2 text-right font-semibold text-slate-900", children: formatCurrency(totalPlata) })] }, `${row.nrFisa}-${index}`));
                                                        })) })] }) })] })] }) })] })] }));
}
