import { useState, useEffect } from 'react';
import { Calculator, Upload, FileDown, Trash2, AlertCircle } from 'lucide-react';
import Decimal from 'decimal.js';
import type { DBSet } from '../services/databaseManager';
import { getActiveDB, assertCanWrite } from '../services/databaseManager';
import { Card, CardHeader, CardTitle } from './ui/card';
import { calculateBenefits } from '../logic/calculateBenefits';

// Configure Decimal.js
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

interface Props {
  databases: DBSet;
  onBack: () => void;
}

interface MemberBenefit {
  nrFisa: number;
  numPren: string;
  depSoldDec: Decimal;
  sumaSolduriLunare: Decimal;
  beneficiu: Decimal;
}

interface ProblematicMember {
  nrFisa: number;
  numPren: string;
  problema: string;
}

export default function Dividende({ databases, onBack }: Props) {
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [profitInput, setProfitInput] = useState<string>('');
  const [memberBenefits, setMemberBenefits] = useState<MemberBenefit[]>([]);
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [calculating, setCalculating] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [problematicMembers, setProblematicMembers] = useState<ProblematicMember[]>([]);
  const [showProblemsDialog, setShowProblemsDialog] = useState(false);

  // Obține currency-ul activ din databases
  const currency = databases.activeCurrency || 'RON';

  // Scroll la top când se montează componenta (pentru mobile)
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // Load available years from DEPCRED
  useEffect(() => {
    try {
      const depcredDB = getActiveDB(databases, 'depcred');
      const query = "SELECT DISTINCT ANUL FROM DEPCRED ORDER BY ANUL DESC";
      const result = depcredDB.exec(query);

      if (result.length > 0) {
        const years = result[0].values.map(row => row[0] as number);

        // Add current year and nearby years if not present
        const currentYear = new Date().getFullYear();
        const allYears = new Set(years);
        for (let y = currentYear - 2; y <= currentYear + 2; y++) {
          allYears.add(y);
        }

        const sortedYears = Array.from(allYears).sort((a, b) => b - a);
        setAvailableYears(sortedYears);
      }
    } catch (error) {
      console.error('Error loading years:', error);
    }
  }, [databases]);

  // Clear data when year changes
  useEffect(() => {
    setMemberBenefits([]);
    setProfitInput('');
  }, [selectedYear]);

  const clearActiviData = () => {
    try {
      // Check write permissions
      assertCanWrite(databases, 'Ștergere date ACTIVI');

      const confirmed = window.confirm(
        'Ștergi datele calculate anterior din baza de date "Activi"?'
      );

      if (confirmed) {
        const activiDB = getActiveDB(databases, 'activi');
        activiDB.run("DELETE FROM ACTIVI");
        setMemberBenefits([]);
        alert('Datele anterioare au fost șterse cu succes.');
      }
    } catch (error) {
      console.error('Error clearing ACTIVI:', error);
      alert('Eroare la ștergerea datelor: ' + (error as Error).message);
    }
  };

  const calculateBenefits = () => {
    // Parse profit
    const profitStr = profitInput.replace(',', '.');
    let profitP: Decimal;
    try {
      profitP = profitStr ? new Decimal(profitStr) : new Decimal(0);
    } catch (error) {
      alert('Valoare profit invalidă.');
      return;
    }

    setCalculating(true);

    try {
      // Check write permissions
      assertCanWrite(databases, 'Calcul beneficii');

      // Get active databases
      const depcredDB = getActiveDB(databases, 'depcred');
      const membriiDB = getActiveDB(databases, 'membrii');
      const activiDB = getActiveDB(databases, 'activi');

      // Build a lookup map for member names from MEMBRII.db
      const memberNameMap = new Map<number, string>();
      const membriiResult = membriiDB.exec("SELECT NR_FISA, NUM_PREN FROM MEMBRII");
      if (membriiResult.length > 0) {
        for (const [nrFisa, numPren] of membriiResult[0].values) {
          if (typeof nrFisa === 'number' && typeof numPren === 'string') {
            memberNameMap.set(nrFisa, numPren);
          }
        }
      }

      if (memberNameMap.size === 0) {
        throw new Error('Nu există înregistrări în tabela MEMBRII din MEMBRII.db.');
      }

      // Verify complete data for year (Jan-Dec)
      const monthsQuery = `SELECT DISTINCT LUNA FROM DEPCRED WHERE ANUL = ${selectedYear}`;
      const monthsResult = depcredDB.exec(monthsQuery);

      if (monthsResult.length === 0 || monthsResult[0].values.length < 12) {
        alert(`Lipsesc date pentru unele luni din ${selectedYear}.`);
        setCalculating(false);
        return;
      }

      // Check if January next year exists
      const nextYear = selectedYear + 1;
      const janNextYearQuery = `SELECT COUNT(*) FROM DEPCRED WHERE ANUL = ${nextYear} AND LUNA = 1`;
      const janResult = depcredDB.exec(janNextYearQuery);

      if (janResult.length === 0 || janResult[0].values[0][0] === 0) {
        alert(`Ianuarie ${nextYear} nu există!`);
      }

      // ===============================================
      // VALIDARE MEMBRI PROBLEMATICI
      // ===============================================
      const probleme: ProblematicMember[] = [];

      // 1. Verifică membri în DEPCRED (anul selectat) fără corespondent în MEMBRII.db
      // IMPORTANT: Nu verificăm invers (MEMBRII fără DEPCRED) deoarece MEMBRII.db este cumulativ
      // și conține membri înscriși în ani viitori care nu trebuie să aibă date pentru anul selectat
      const depcredMembersQuery = `SELECT DISTINCT NR_FISA FROM DEPCRED WHERE ANUL = ${selectedYear}`;
      const depcredMembersResult = depcredDB.exec(depcredMembersQuery);
      if (depcredMembersResult.length > 0) {
        for (const row of depcredMembersResult[0].values) {
          const nrFisa = row[0] as number;
          if (!memberNameMap.has(nrFisa)) {
            probleme.push({
              nrFisa,
              numPren: `Fișa ${nrFisa}`,
              problema: `Membru există în DEPCRED.db pentru anul ${selectedYear} dar nu există în MEMBRII.db`
            });
          }
        }
      }

      // 2. Verifică membri problematici (consistent cu GenerareLuna)
      // Regula: Doar cei cu sold > 0.005 în DECEMBRIE primesc beneficii
      // Threshold 0.005 consistent cu PRAG_ZEROIZARE din GenerareLuna
      const PRAG_ZEROIZARE = new Decimal("0.005");

      // Build set of liquidated members (exclude din validare)
      const liquidatedMembers = new Set<number>();
      try {
        const lichidatiDB = getActiveDB(databases, 'lichidati');
        const lichidatiResult = lichidatiDB.exec("SELECT NR_FISA FROM LICHIDATI");
        if (lichidatiResult.length > 0) {
          for (const row of lichidatiResult[0].values) {
            liquidatedMembers.add(row[0] as number);
          }
        }
      } catch (error) {
        // Ignoră eroare dacă nu există LICHIDATI.db
        console.warn('Nu s-a putut accesa LICHIDATI.db:', error);
      }

      // Verifică fiecare membru din MEMBRII.db (care nu e lichidat)
      for (const [nrFisa, numPren] of memberNameMap) {
        // Skip membri lichidați (consistent cu GenerareLuna)
        if (liquidatedMembers.has(nrFisa)) {
          continue;
        }

        // Verifică dacă are activitate în sau înainte de anul selectat
        // IMPORTANT: Exclude membri cu activitate DOAR în viitor (ex: înscriși în 2026 când calculăm 2025)
        const hasActivityQuery = `SELECT COUNT(*) FROM DEPCRED WHERE NR_FISA = ${nrFisa} AND ANUL <= ${selectedYear}`;
        const hasActivityResult = depcredDB.exec(hasActivityQuery);
        const hasActivity = hasActivityResult.length > 0 && hasActivityResult[0].values[0][0] > 0;

        if (!hasActivity) {
          // Membru fără activitate în sau înainte de anul selectat - skip (nu e problemă)
          // Ex: membru înscris în 2026 când calculăm dividende 2025
          continue;
        }

        // Verifică sold decembrie anul selectat (threshold 0.005 ca în GenerareLuna)
        const decemberQuery = `
          SELECT DEP_SOLD FROM DEPCRED
          WHERE NR_FISA = ${nrFisa} AND ANUL = ${selectedYear} AND LUNA = 12
        `;
        const decemberResult = depcredDB.exec(decemberQuery);

        let soldDecembrie = new Decimal("0");
        if (decemberResult.length > 0 && decemberResult[0].values.length > 0) {
          soldDecembrie = new Decimal(String(decemberResult[0].values[0][0] || 0));
        }

        // Dacă sold <= 0.005 în decembrie → membru problematic (nu primește beneficii)
        if (soldDecembrie.lte(PRAG_ZEROIZARE)) {
          // Găsește ultima perioadă cu sold activ (pentru debugging)
          const lastActiveQuery = `
            SELECT ANUL, LUNA, DEP_SOLD
            FROM DEPCRED
            WHERE NR_FISA = ${nrFisa} AND DEP_SOLD > ${PRAG_ZEROIZARE.toString()}
            ORDER BY ANUL DESC, LUNA DESC
            LIMIT 1
          `;
          const lastActiveResult = depcredDB.exec(lastActiveQuery);

          let lastActivePeriod = "";
          if (lastActiveResult.length > 0 && lastActiveResult[0].values.length > 0) {
            const lastAnul = lastActiveResult[0].values[0][0];
            const lastLuna = lastActiveResult[0].values[0][1];
            lastActivePeriod = ` (ultima activitate: ${String(lastLuna).padStart(2, '0')}-${lastAnul})`;
          }

          // Descriere diferențiată
          let descriere: string;
          if (decemberResult.length === 0 || decemberResult[0].values.length === 0) {
            descriere = `Membru nu are înregistrare decembrie ${selectedYear}${lastActivePeriod} - nu este eligibil pentru beneficii`;
          } else {
            descriere = `Membru are sold ${soldDecembrie.toFixed(2)} în decembrie ${selectedYear}${lastActivePeriod} - nu este eligibil pentru beneficii`;
          }

          probleme.push({
            nrFisa,
            numPren,
            problema: descriere
          });
        }
      }

      // 3. Verifică membri eligibili pentru dividende DAR fără ianuarie anul următor
      const eligibleMembersQuery = `
        SELECT DISTINCT NR_FISA
        FROM DEPCRED
        WHERE ANUL = ${selectedYear} AND LUNA = 12 AND DEP_SOLD > 0
      `;
      const eligibleResult = depcredDB.exec(eligibleMembersQuery);
      if (eligibleResult.length > 0) {
        for (const row of eligibleResult[0].values) {
          const nrFisa = row[0] as number;
          const janCheckQuery = `SELECT COUNT(*) FROM DEPCRED WHERE NR_FISA = ${nrFisa} AND ANUL = ${nextYear} AND LUNA = 1`;
          const janCheckResult = depcredDB.exec(janCheckQuery);
          if (janCheckResult.length === 0 || janCheckResult[0].values[0][0] === 0) {
            const numPren = memberNameMap.get(nrFisa) || `Fișa ${nrFisa}`;
            probleme.push({
              nrFisa,
              numPren,
              problema: `Membru eligibil pentru beneficii dar nu are înregistrare ianuarie ${nextYear} (transferul va eșua)`
            });
          }
        }
      }

      // Dacă s-au găsit probleme, afișează avertizare și oprește procesarea
      if (probleme.length > 0) {
        setProblematicMembers(probleme);
        setCalculating(false);

        alert(
          `⚠️ ATENȚIE: S-au detectat ${probleme.length} probleme!\n\n` +
          `Aplicația nu poate continua până când aceste probleme nu sunt rezolvate.\n\n` +
          `Apasă OK pentru a vedea lista detaliată.`
        );

        setShowProblemsDialog(true);
        return;
      }

      // Calculate benefits using extracted business logic
      const result = calculateBenefits(
        membriiDB,
        depcredDB,
        activiDB,
        selectedYear,
        profitP,
        lichidatiDB
      );

      const { members: calculatedMembers, S_total, missingNames } = result;

      setMemberBenefits(calculatedMembers);

      alert(
        `S-au identificat ${calculatedMembers.length} membri.\n` +
        `Suma totală a soldurilor: ${S_total.toFixed(2)} ${currency}.`
      );

      if (missingNames.length > 0) {
        alert(
          'Atenție: nu s-au găsit numele pentru fișele: ' +
          missingNames.join(', ') +
          '. Verifică baza MEMBRII.db.'
        );
      }

    } catch (error) {
      console.error('Error calculating benefits:', error);
      alert('Eroare la calculul beneficiilor: ' + (error as Error).message);
    } finally {
      setCalculating(false);
    }
  };

  const transferBenefits = () => {
    if (memberBenefits.length === 0) {
      alert('Nu există beneficii calculate pentru transfer.');
      return;
    }

    const confirmed = window.confirm(
      `Transferi beneficiul pentru ${selectedYear} la ianuarie ${selectedYear + 1}?`
    );

    if (!confirmed) return;

    setTransferring(true);

    try {
      // Check write permissions
      assertCanWrite(databases, 'Transfer beneficii');

      const depcredDB = getActiveDB(databases, 'depcred');
      const nextYear = selectedYear + 1;
      let countUpdated = 0;
      const errors: string[] = [];

      for (const member of memberBenefits) {
        try {
          // Get current January record
          const query = `
            SELECT DEP_SOLD, DEP_DEB FROM DEPCRED
            WHERE NR_FISA = ${member.nrFisa} AND ANUL = ${nextYear} AND LUNA = 1
          `;
          const result = depcredDB.exec(query);

          if (result.length > 0 && result[0].values.length > 0) {
            const row = result[0].values[0];
            const soldExistent = new Decimal(String(row[0]));
            const depDebExistent = new Decimal(String(row[1] || 0));

            const nouDepDeb = depDebExistent.plus(member.beneficiu);
            const nouDepSold = soldExistent.plus(member.beneficiu);

            // Update record
            depcredDB.run(
              `UPDATE DEPCRED SET DEP_DEB = ?, DEP_SOLD = ? WHERE NR_FISA = ? AND ANUL = ? AND LUNA = 1`,
              [nouDepDeb.toNumber(), nouDepSold.toNumber(), member.nrFisa, nextYear]
            );

            countUpdated++;
          } else {
            errors.push(`Fișa ${member.nrFisa} - lipsește înregistrare ianuarie ${nextYear}`);
          }
        } catch (error) {
          errors.push(`Fișa ${member.nrFisa} - eroare BD (${(error as Error).message})`);
        }
      }

      if (errors.length === 0) {
        alert(`Actualizate ${countUpdated} înregistrări în DEPCRED.db pentru ianuarie ${nextYear}.`);
        setMemberBenefits([]);
      } else {
        alert('Membri neactualizați:\n' + errors.join('\n'));
      }

    } catch (error) {
      console.error('Error transferring benefits:', error);
      alert('Eroare critică la transfer: ' + (error as Error).message);
    } finally {
      setTransferring(false);
    }
  };

  const exportToExcel = async () => {
    if (memberBenefits.length === 0) {
      alert('Nu există date pentru export.');
      return;
    }

    setExporting(true);

    try {
      // Create CSV content
      const headers = [
        'Nr. fișă',
        'Nume și prenume',
        'Sold dec. an calcul',
        'Suma solduri lunare (S membru)',
        'Beneficiu calculat (B)'
      ];

      let csvContent = headers.join(',') + '\n';

      let totalSoldDec = new Decimal(0);
      let totalSumaSolduri = new Decimal(0);
      let totalBeneficiu = new Decimal(0);

      for (const member of memberBenefits) {
        const row = [
          member.nrFisa,
          `"${member.numPren}"`,
          member.depSoldDec.toFixed(2),
          member.sumaSolduriLunare.toFixed(2),
          member.beneficiu.toFixed(2)
        ];
        csvContent += row.join(',') + '\n';

        totalSoldDec = totalSoldDec.plus(member.depSoldDec);
        totalSumaSolduri = totalSumaSolduri.plus(member.sumaSolduriLunare);
        totalBeneficiu = totalBeneficiu.plus(member.beneficiu);
      }

      // Add totals row
      csvContent += `"TOTAL:","",${totalSoldDec.toFixed(2)},${totalSumaSolduri.toFixed(2)},${totalBeneficiu.toFixed(2)}\n`;

      // Create download
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Beneficiu_Anual_${selectedYear}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      alert(`Date exportate în: Beneficiu_Anual_${selectedYear}.csv`);

    } catch (error) {
      console.error('Error exporting:', error);
      alert('Eroare la export: ' + (error as Error).message);
    } finally {
      setExporting(false);
    }
  };

  const exportProblematicMembers = () => {
    if (problematicMembers.length === 0) {
      alert('Nu există membri problematici pentru export.');
      return;
    }

    try {
      // Create CSV content
      const headers = ['Nr. fișă', 'Nume și prenume', 'Problema detectată'];
      let csvContent = headers.join(',') + '\n';

      for (const member of problematicMembers) {
        const row = [
          member.nrFisa,
          `"${member.numPren}"`,
          `"${member.problema}"`
        ];
        csvContent += row.join(',') + '\n';
      }

      // Create download
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Membri_Problematici_${selectedYear}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      alert(`Lista exportată în: Membri_Problematici_${selectedYear}.csv`);
    } catch (error) {
      console.error('Error exporting problematic members:', error);
      alert('Eroare la export: ' + (error as Error).message);
    }
  };

  const hasJanuaryNextYear = () => {
    try {
      const depcredDB = getActiveDB(databases, 'depcred');
      const nextYear = selectedYear + 1;
      const query = `SELECT COUNT(*) FROM DEPCRED WHERE ANUL = ${nextYear} AND LUNA = 1`;
      const result = depcredDB.exec(query);
      return result.length > 0 && result[0].values[0][0] > 0;
    } catch {
      return false;
    }
  };

  const canTransfer = memberBenefits.length > 0 && hasJanuaryNextYear();

  return (
    <div className="min-h-screen bg-slate-100 p-6">
      {/* Header */}
      <Card className="mb-6">
        <CardHeader className="bg-gradient-to-r from-blue-600 to-blue-700 text-white md:bg-white md:text-inherit">
          <CardTitle className="flex items-center gap-2 justify-center md:justify-start text-2xl md:text-3xl">
            💰 Dividende (Beneficii Anuale)
          </CardTitle>
          <p className="text-white md:text-slate-600 mt-2 text-center md:text-left">
            Calcul și distribuire beneficii anuale conform formulei: <strong>B = (P / S_total) × S_membru</strong>
          </p>
        </CardHeader>
      </Card>

      {/* Controls */}
      <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          {/* Year selector */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Selectează anul pentru calculul beneficiului:
            </label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {availableYears.map(year => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </div>

          {/* Profit input */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Profit total (P) pentru anul selectat ({currency}):
            </label>
            <input
              type="text"
              value={profitInput}
              onChange={(e) => setProfitInput(e.target.value)}
              placeholder="0.00"
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-3">
          <button
            onClick={clearActiviData}
            className="flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors"
          >
            <Trash2 size={18} />
            Șterge date calculate anterior
          </button>

          <button
            onClick={calculateBenefits}
            disabled={calculating || !profitInput}
            className="flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
          >
            <Calculator size={18} />
            {calculating ? 'Se calculează...' : 'Calculează beneficiu'}
          </button>

          <button
            onClick={transferBenefits}
            disabled={!canTransfer || transferring}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
          >
            <Upload size={18} />
            {transferring ? 'Se transferă...' : 'Transferă beneficiu la sold'}
          </button>

          <button
            onClick={exportToExcel}
            disabled={memberBenefits.length === 0 || exporting}
            className="flex items-center gap-2 px-4 py-2 bg-purple-500 hover:bg-purple-600 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
          >
            <FileDown size={18} />
            {exporting ? 'Se exportă...' : 'Export calcul în Excel (CSV)'}
          </button>
        </div>

        {/* Warning for missing January next year */}
        {memberBenefits.length > 0 && !hasJanuaryNextYear() && (
          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
            <AlertCircle size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800">
              <strong>Atenție:</strong> Ianuarie {selectedYear + 1} nu există în baza de date.
              Butonul de transfer este dezactivat.
            </p>
          </div>
        )}
      </div>

      {/* Results table */}
      {memberBenefits.length > 0 && (
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h2 className="text-xl font-bold text-slate-800 mb-4">
            📊 Rezultate calcul ({memberBenefits.length} membri)
          </h2>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-blue-100">
                  <th className="border border-slate-300 px-4 py-2 text-center">Nr. fișă</th>
                  <th className="border border-slate-300 px-4 py-2 text-left">Nume și prenume</th>
                  <th className="border border-slate-300 px-4 py-2 text-right">Sold dec. an calcul</th>
                  <th className="border border-slate-300 px-4 py-2 text-right">Suma solduri lunare (S membru)</th>
                  <th className="border border-slate-300 px-4 py-2 text-right">Beneficiu calculat (B)</th>
                </tr>
              </thead>
              <tbody>
                {memberBenefits.map((member, idx) => (
                  <tr key={member.nrFisa} className={idx % 2 === 0 ? 'bg-blue-50' : 'bg-orange-50'}>
                    <td className="border border-slate-300 px-4 py-2 text-center">{member.nrFisa}</td>
                    <td className="border border-slate-300 px-4 py-2">{member.numPren}</td>
                    <td className="border border-slate-300 px-4 py-2 text-right">{member.depSoldDec.toFixed(2)}</td>
                    <td className="border border-slate-300 px-4 py-2 text-right">{member.sumaSolduriLunare.toFixed(2)}</td>
                    <td className="border border-slate-300 px-4 py-2 text-right font-semibold">{member.beneficiu.toFixed(2)}</td>
                  </tr>
                ))}
                {/* Totals row */}
                <tr className="bg-slate-200 font-bold">
                  <td colSpan={2} className="border border-slate-300 px-4 py-2 text-right">TOTAL:</td>
                  <td className="border border-slate-300 px-4 py-2 text-right">
                    {memberBenefits.reduce((sum, m) => sum.plus(m.depSoldDec), new Decimal(0)).toFixed(2)}
                  </td>
                  <td className="border border-slate-300 px-4 py-2 text-right">
                    {memberBenefits.reduce((sum, m) => sum.plus(m.sumaSolduriLunare), new Decimal(0)).toFixed(2)}
                  </td>
                  <td className="border border-slate-300 px-4 py-2 text-right">
                    {memberBenefits.reduce((sum, m) => sum.plus(m.beneficiu), new Decimal(0)).toFixed(2)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Formula explanation */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 mt-6">
        <h3 className="text-lg font-bold text-blue-900 mb-3">📐 Formula de calcul</h3>
        <div className="space-y-2 text-sm text-blue-800">
          <p><strong>B = (P / S_total) × S_membru</strong></p>
          <ul className="list-disc list-inside space-y-1 ml-4">
            <li><strong>P</strong> = Profit total anual (introdus de utilizator)</li>
            <li><strong>S_total</strong> = Suma tuturor soldurilor lunare ale membrilor eligibili</li>
            <li><strong>S_membru</strong> = Suma soldurilor lunare ale unui membru individual</li>
            <li><strong>B</strong> = Beneficiu alocat membrului</li>
          </ul>
          <p className="mt-3 text-xs text-blue-700">
            * Doar membrii cu sold pozitiv în DECEMBRIE sunt eligibili pentru beneficii (indiferent de soldurile din restul anului).
          </p>
        </div>
      </div>

      {/* Dialog membri problematici - Responsive pentru PC și mobil */}
      {showProblemsDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="bg-red-500 text-white px-6 py-4 rounded-t-xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <AlertCircle size={28} />
                <div>
                  <h2 className="text-xl font-bold">⚠️ Membri Problematici Detectați</h2>
                  <p className="text-sm text-red-100">
                    {problematicMembers.length} {problematicMembers.length === 1 ? 'problemă găsită' : 'probleme găsite'}
                  </p>
                </div>
              </div>
            </div>

            {/* Message */}
            <div className="px-6 py-4 bg-red-50 border-b border-red-200">
              <p className="text-sm text-red-800">
                <strong>Aplicația nu poate continua până când aceste probleme nu sunt rezolvate.</strong>
                <br />
                Corectați datele în bazele de date MEMBRII.db și DEPCRED.db, apoi încercați din nou.
              </p>
            </div>

            {/* Scrollable list */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <div className="space-y-3">
                {problematicMembers.map((member, idx) => (
                  <div
                    key={`${member.nrFisa}-${idx}`}
                    className="border border-red-200 rounded-lg p-4 bg-red-50 hover:bg-red-100 transition-colors"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                      <div className="flex items-center gap-2">
                        <span className="bg-red-500 text-white font-bold rounded-full w-8 h-8 flex items-center justify-center text-sm">
                          {idx + 1}
                        </span>
                        <div>
                          <p className="font-semibold text-slate-800">Fișa {member.nrFisa}</p>
                          <p className="text-sm text-slate-600">{member.numPren}</p>
                        </div>
                      </div>
                      <div className="flex-1 sm:ml-4">
                        <p className="text-sm text-red-700 bg-white px-3 py-2 rounded border border-red-300">
                          {member.problema}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer with actions */}
            <div className="px-6 py-4 bg-slate-100 rounded-b-xl border-t border-slate-300 flex flex-col sm:flex-row gap-3">
              <button
                onClick={exportProblematicMembers}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors font-semibold"
              >
                <FileDown size={20} />
                Export Listă CSV
              </button>
              <button
                onClick={() => setShowProblemsDialog(false)}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-slate-600 hover:bg-slate-700 text-white rounded-lg transition-colors font-semibold"
              >
                Închide
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
