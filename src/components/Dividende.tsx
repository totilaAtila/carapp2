import { useState, useEffect } from 'react';
import { ArrowLeft, Calculator, Upload, FileDown, Trash2, AlertCircle } from 'lucide-react';
import Decimal from 'decimal.js';
import type { DBSet } from '../services/databaseManager';
import { getActiveDB, assertCanWrite } from '../services/databaseManager';

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

export default function Dividende({ databases, onBack }: Props) {
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [profitInput, setProfitInput] = useState<string>('');
  const [memberBenefits, setMemberBenefits] = useState<MemberBenefit[]>([]);
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [calculating, setCalculating] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [exporting, setExporting] = useState(false);

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

      // Calculate member balances
      const membersQuery = `
        SELECT
          NR_FISA,
          SUM(DEP_SOLD) as SUMA_SOLDURI_LUNARE,
          MAX(CASE WHEN LUNA = 12 THEN DEP_SOLD ELSE 0 END) as SOLD_DECEMBRIE
        FROM DEPCRED
        WHERE ANUL = ${selectedYear} AND DEP_SOLD > 0
        GROUP BY NR_FISA
        HAVING SUM(DEP_SOLD) > 0
      `;

      const membersResult = depcredDB.exec(membersQuery);

      if (membersResult.length === 0 || membersResult[0].values.length === 0) {
        alert(`Nu s-au găsit membri cu solduri pozitive în ${selectedYear}.`);
        setCalculating(false);
        return;
      }

      // Calculate S_total
      let S_total = new Decimal(0);
      const membersData: MemberBenefit[] = [];

      const missingNames: number[] = [];

      for (const row of membersResult[0].values) {
        const nrFisa = row[0] as number;
        const sumaSolduri = new Decimal(String(row[1]));
        const soldDecembrie = new Decimal(String(row[2]));
        const storedName = memberNameMap.get(nrFisa);
        if (!storedName) {
          missingNames.push(nrFisa);
        }
        const numPren = storedName ?? `Fișa ${nrFisa}`;

        S_total = S_total.plus(sumaSolduri);

        membersData.push({
          nrFisa,
          numPren,
          depSoldDec: soldDecembrie,
          sumaSolduriLunare: sumaSolduri,
          beneficiu: new Decimal(0)
        });
      }

      if (S_total.lte(0)) {
        alert('Suma totală a soldurilor este zero sau negativă.');
        setCalculating(false);
        return;
      }

      // Clear and populate ACTIVI
      activiDB.run("DELETE FROM ACTIVI");

      // Calculate benefits: B = (P / S_total) × S_member
      const calculatedMembers: MemberBenefit[] = [];

      for (const member of membersData) {
        const beneficiu = profitP
          .div(S_total)
          .mul(member.sumaSolduriLunare)
          .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

        member.beneficiu = beneficiu;
        calculatedMembers.push(member);

        // Insert into ACTIVI
        activiDB.run(
          `INSERT INTO ACTIVI (NR_FISA, NUM_PREN, DEP_SOLD, DIVIDEND) VALUES (?, ?, ?, ?)`,
          [member.nrFisa, member.numPren, member.depSoldDec.toNumber(), beneficiu.toNumber()]
        );
      }

      setMemberBenefits(calculatedMembers);

      alert(
        `S-au identificat ${calculatedMembers.length} membri.\n` +
        `Suma totală a soldurilor: ${S_total.toFixed(2)} lei.`
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
      <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <button
              onClick={onBack}
              className="flex items-center gap-2 px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded-lg transition-colors"
            >
              <ArrowLeft size={20} />
              Înapoi
            </button>
            <h1 className="text-3xl font-bold text-slate-800">💰 Dividende (Beneficii Anuale)</h1>
          </div>
        </div>

        <p className="text-slate-600">
          Calcul și distribuire beneficii anuale conform formulei: <strong>B = (P / S_total) × S_membru</strong>
        </p>
      </div>

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
              Profit total (P) pentru anul selectat (RON):
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
            * Doar membrii cu solduri pozitive în toate cele 12 luni ale anului sunt eligibili pentru beneficii.
          </p>
        </div>
      </div>
    </div>
  );
}
