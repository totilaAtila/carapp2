// src/components/Conversion.tsx
/**
 * Modul Conversie RON → EUR - Conform Regulamentului CE 1103/97
 *
 * SCOP:
 * - ONE-TIME operation pentru tranziția monetară România → EURO (~2030)
 * - Clonare + conversie baze de date RON → EUR
 * - Validare integritate membri + scheme database
 * - Calcul diferențe rotunjire conform legislație UE
 *
 * ALGORITM:
 * - Clonare: DEPCRED, MEMBRII, ACTIVI, INACTIVI, LICHIDATI (exclude CHITANTE)
 * - Conversie monetară: Direct individual per record (ROUND_HALF_UP)
 * - Câmpuri convertite:
 *   • DEPCRED: DOBANDA, IMPR_DEB, IMPR_CRED, IMPR_SOLD, DEP_DEB, DEP_CRED, DEP_SOLD
 *   • MEMBRII: COTIZATIE_STANDARD
 *   • ACTIVI: DEP_SOLD, DIVIDEND
 *
 * LAYOUT:
 * - Desktop: Dual panel (config left + preview/logs right) - identic Python PyQt5
 * - Mobile: Single column responsive
 */

import { useState, useEffect, useRef } from 'react';
import Decimal from 'decimal.js';
import type { DBSet } from '../services/databaseManager';
import { getActiveDB } from '../services/databaseManager';
import initSqlJs from 'sql.js';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/buttons';
import { Input } from './ui/input';
import { ScrollArea } from './ui/scroll-area';
import { Alert, AlertDescription } from './ui/alert';
import {
  AlertCircle,
  Download,
  FileJson,
  Lock,
  Loader2,
  RefreshCw,
  FileText,
  CheckCircle2,
  XCircle,
  CheckSquare,
  Square
} from 'lucide-react';

// Configurare Decimal.js conform CE 1103/97
Decimal.set({
  precision: 20,
  rounding: Decimal.ROUND_HALF_UP
});

interface Props {
  databases: DBSet;
  onBack: () => void;
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  dbName?: string;
}

interface MemberIntegrityResult {
  valid: boolean;
  totalMembrii: number;
  distinctDepcred: number;
  difference: number;
  membersOnlyInMembrii: Array<{ nrFisa: number; numPren: string; problem: string }>;
  membersOnlyInDepcred: Array<{ nrFisa: number; problem: string }>;
  summary: string;
}

interface ConversionStats {
  totalRecords: number;
  convertedRecords: number;
  originalSumRON: Decimal;
  convertedSumEUR: Decimal;
  theoreticalSumEUR: Decimal;
  roundingDifference: Decimal;
}

interface PreviewData {
  cursUzat: number;
  dbStats: Record<string, any>;
  totalRON: number;
  estimatedEUR: number;
  componentsEUR: number;
  estimatedRoundingDiff: number;
  memberIntegrity: MemberIntegrityResult | null;
}

const DEFAULT_CURS = '4.9435';

export default function Conversion({ databases, onBack }: Props) {
  const [cursInput, setCursInput] = useState(DEFAULT_CURS);
  const [utilizator] = useState('Administrator');
  const [previewGenerated, setPreviewGenerated] = useState(false);
  const [validationActive] = useState(true);
  const [euCompliant] = useState(true);

  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [previewText, setPreviewText] = useState('');

  const [isConverting, setIsConverting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');

  const [logs, setLogs] = useState<string[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const [conversionComplete, setConversionComplete] = useState(false);
  const [finalStats, setFinalStats] = useState<any>(null);

  // Check dacă există deja baze EUR
  const hasEURDatabases = !!(
    databases.depcredeur ||
    databases.membriieur ||
    databases.activieur
  );

  useEffect(() => {
    addLog('Modul conversie inițializat - conform Regulamentului CE 1103/97');
    addLog('Metodă: Conversie directă individuală (fără redistribuire proporțională)');

    if (hasEURDatabases) {
      addLog('⚠️ ATENȚIE: Detectate baze de date EUR deja existente!');
      addLog('Conversie deja aplicată. Pentru reconversie, ștergeți bazele EUR și reîncărcați doar RON.');
    }
  }, [hasEURDatabases]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString('ro-RO');
    setLogs(prev => [...prev, `[${timestamp}] ${message}`]);
  };

  const validateCurs = (): Decimal | null => {
    try {
      const curs = new Decimal(cursInput.replace(',', '.'));
      if (curs.lessThanOrEqualTo(0)) {
        alert('Cursul de schimb trebuie să fie pozitiv!');
        return null;
      }
      if (curs.greaterThan(10)) {
        alert('Cursul de schimb pare neobișnuit de mare (>10). Verificați valoarea!');
        return null;
      }
      return curs;
    } catch (error) {
      alert('Cursul de schimb nu este valid! Folosiți format numeric (ex: 4.9435)');
      return null;
    }
  };

  const generatePreview = async () => {
    const curs = validateCurs();
    if (!curs) return;

    if (hasEURDatabases) {
      alert('Nu se poate genera previzualizare: Baze EUR deja există!\n\nȘtergeți bazele EUR și reîncărcați doar RON pentru a genera un preview nou.');
      return;
    }

    addLog(`Generare previzualizare - Curs: ${curs.toFixed(6)} RON/EUR`);
    addLog('Validare integritate membri...');

    try {
      // Validare existență baze
      if (!databases.depcred || !databases.membrii || !databases.activi) {
        throw new Error('Lipsesc baze de date obligatorii! Asigurați-vă că ați încărcat: DEPCRED.db, MEMBRII.db, activi.db');
      }

      // Validare member integrity
      const memberIntegrity = validateMemberIntegrity(
        databases.depcred,
        databases.membrii
      );

      if (!memberIntegrity.valid) {
        addLog('⚠️ DISCREPANȚE detectate între DEPCRED și MEMBRII');
      } else {
        addLog('✅ Integritate membri validată');
      }

      // Colectare statistici
      const dbStats: Record<string, any> = {};
      let totalRON = new Decimal(0);

      // DEPCRED stats
      const depcredDB = getActiveDB(databases, 'depcred');
      if (depcredDB) {
        const result = depcredDB.exec(`
          SELECT
            COUNT(DISTINCT NR_FISA) as membri_distincti,
            COUNT(*) as total_inregistrari,
            COALESCE(SUM(DOBANDA + IMPR_DEB + IMPR_CRED + IMPR_SOLD + DEP_DEB + DEP_CRED + DEP_SOLD), 0) as suma
          FROM DEPCRED
        `);

        if (result.length > 0 && result[0].values.length > 0) {
          const [memDist, totalInreg, suma] = result[0].values[0];
          const sumaDecimal = new Decimal(suma?.toString() || '0');
          totalRON = totalRON.plus(sumaDecimal);

          dbStats['DEPCRED'] = {
            memoriDistincti: memDist,
            totalInregistrari: totalInreg,
            sumaMonetara: sumaDecimal,
            tip: 'monetar_direct_ue'
          };
        }
      }

      // MEMBRII stats
      const membriiDB = getActiveDB(databases, 'membrii');
      if (membriiDB) {
        const result = membriiDB.exec(`
          SELECT
            COUNT(*) as total_membri,
            COALESCE(SUM(COTIZATIE_STANDARD), 0) as suma_cotizatii
          FROM MEMBRII
        `);

        if (result.length > 0 && result[0].values.length > 0) {
          const [totalMembri, sumaCotizatii] = result[0].values[0];
          const sumaDecimal = new Decimal(sumaCotizatii?.toString() || '0');
          totalRON = totalRON.plus(sumaDecimal);

          dbStats['MEMBRII'] = {
            totalMembri: totalMembri,
            sumaMonetara: sumaDecimal,
            tip: 'monetar_direct_ue'
          };
        }
      }

      // ACTIVI stats
      const activiDB = getActiveDB(databases, 'activi');
      if (activiDB) {
        const result = activiDB.exec(`
          SELECT
            COUNT(*) as total_activi,
            COALESCE(SUM(DEP_SOLD + DIVIDEND), 0) as suma_activi
          FROM ACTIVI
        `);

        if (result.length > 0 && result[0].values.length > 0) {
          const [totalActivi, sumaActivi] = result[0].values[0];
          const sumaDecimal = new Decimal(sumaActivi?.toString() || '0');
          totalRON = totalRON.plus(sumaDecimal);

          dbStats['ACTIVI'] = {
            totalActivi: totalActivi,
            sumaMonetara: sumaDecimal,
            tip: 'monetar_direct_ue'
          };
        }
      }

      // INACTIVI stats
      const inactiviDB = getActiveDB(databases, 'inactivi');
      if (inactiviDB) {
        const result = inactiviDB.exec('SELECT COUNT(*) FROM inactivi');
        if (result.length > 0 && result[0].values.length > 0) {
          dbStats['INACTIVI'] = {
            totalInactivi: result[0].values[0][0],
            tip: 'non_monetar'
          };
        }
      }

      // LICHIDATI stats
      const lichidatiDB = getActiveDB(databases, 'lichidati');
      if (lichidatiDB) {
        const result = lichidatiDB.exec('SELECT COUNT(*) FROM lichidati');
        if (result.length > 0 && result[0].values.length > 0) {
          dbStats['LICHIDATI'] = {
            totalLichidati: result[0].values[0][0],
            tip: 'non_monetar'
          };
        }
      }

      // Calcule estimări
      const estimatedEUR = totalRON.div(curs).toDecimalPlaces(2);

      // Sumă componente (fiecare DB convertit separat)
      let componentsEUR = new Decimal(0);
      for (const dbName of ['DEPCRED', 'MEMBRII', 'ACTIVI']) {
        if (dbStats[dbName]) {
          const componentEUR = dbStats[dbName].sumaMonetara
            .div(curs)
            .toDecimalPlaces(2);
          componentsEUR = componentsEUR.plus(componentEUR);
        }
      }

      const estimatedRoundingDiff = componentsEUR.minus(estimatedEUR);

      const preview: PreviewData = {
        cursUzat: parseFloat(curs.toString()),
        dbStats,
        totalRON: parseFloat(totalRON.toString()),
        estimatedEUR: parseFloat(estimatedEUR.toString()),
        componentsEUR: parseFloat(componentsEUR.toString()),
        estimatedRoundingDiff: parseFloat(estimatedRoundingDiff.toString()),
        memberIntegrity
      };

      setPreviewData(preview);
      generatePreviewText(preview);
      setPreviewGenerated(true);

      addLog('✅ Previzualizare generată cu succes');

    } catch (error: any) {
      addLog(`❌ EROARE generare preview: ${error.message}`);
      alert(`Eroare la generarea preview:\n\n${error.message}`);
    }
  };

  const generatePreviewText = (preview: PreviewData) => {
    let text = `PREVIEW CONVERSIE RON → EUR CONFORM REGULAMENTULUI CE 1103/97
${'='.repeat(70)}
Curs de schimb: 1 EUR = ${preview.cursUzat.toFixed(6)} RON
Utilizator: ${utilizator}
Metodă: CONVERSIE DIRECTĂ INDIVIDUALĂ (conform art. 4 Regulament CE 1103/97)

${preview.memberIntegrity?.summary || ''}

IMPACT ESTIMAT PE TOATE BAZELE DE DATE:
${'='.repeat(50)}

BAZE CU CÂMPURI MONETARE - CONVERSIE DIRECTĂ UE:
${'-'.repeat(50)}
DEPCRED:
  - Membri distincți: ${preview.dbStats['DEPCRED']?.memoriDistincti?.toLocaleString('ro-RO') || 0}
  - Total înregistrări: ${preview.dbStats['DEPCRED']?.totalInregistrari?.toLocaleString('ro-RO') || 0}
  - Sumă monetară RON: ${preview.dbStats['DEPCRED']?.sumaMonetara?.toFixed(2) || '0.00'}
  - Metodă: Conversie directă individuală per înregistrare

MEMBRII:
  - Total membri: ${preview.dbStats['MEMBRII']?.totalMembri?.toLocaleString('ro-RO') || 0}
  - Sumă cotizații RON: ${preview.dbStats['MEMBRII']?.sumaMonetara?.toFixed(2) || '0.00'}
  - Metodă: Conversie directă individuală per cotizație

ACTIVI:
  - Membri activi: ${preview.dbStats['ACTIVI']?.totalActivi?.toLocaleString('ro-RO') || 0}
  - Sumă totală RON: ${preview.dbStats['ACTIVI']?.sumaMonetara?.toFixed(2) || '0.00'}
  - Metodă: Conversie directă per câmp monetar

BAZE FĂRĂ CÂMPURI MONETARE - COPIERE DIRECTĂ:
${'-'.repeat(48)}
INACTIVI:
  - Membri inactivi: ${preview.dbStats['INACTIVI']?.totalInactivi?.toLocaleString('ro-RO') || 0}
  - Operațiune: Copiere structură și date

LICHIDATI:
  - Membri lichidați: ${preview.dbStats['LICHIDATI']?.totalLichidati?.toLocaleString('ro-RO') || 0}
  - Operațiune: Copiere structură și date

ANALIZĂ MATEMATICĂ CONFORM UE:
${'-'.repeat(35)}
  - Sumă totală monetară RON: ${preview.totalRON.toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
  - Sumă teoretică EUR (directă): ${preview.estimatedEUR.toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
  - Sumă componente EUR: ${preview.componentsEUR.toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
  - Diferență rotunjire estimată: ${preview.estimatedRoundingDiff >= 0 ? '+' : ''}${preview.estimatedRoundingDiff.toFixed(2)} EUR

EXPLICAȚIE DIFERENȚE ROTUNJIRE:
${'-'.repeat(38)}
Conform Regulamentului CE 1103/97, conversia aplică cursul de schimb
direct la fiecare sumă individuală cu rotunjire la 2 zecimale.
Diferențele de rotunjire rezultate sunt LEGITIME conform legislației UE
și reflectă aplicarea corectă a regulilor tranziției monetare.

Exemplu: 3 sume de câte 10 RON la curs 6.00:
- Conversie directă: 10/6 = 1.67 EUR (×3) = 5.01 EUR total
- Conversie totală: 30/6 = 5.00 EUR total
- Diferență legitimă: +0.01 EUR (din rotunjiri individuale)

FIȘIERE CARE VOR FI CREATE:
${'-'.repeat(30)}
✓ DEPCREDEUR.db (conversie monetară directă UE)
✓ MEMBRIIEUR.db (conversie cotizații directă UE)
✓ activiEUR.db (conversie monetară directă UE)
✓ INACTIVIEUR.db (copiere directă)
✓ LICHIDATIEUR.db (copiere directă)

${'='.repeat(70)}
⚠️ CONVERSIE DEFINITIVĂ - IREVERSIBILĂ!
✓ Fiecare sumă se convertește INDEPENDENT
✓ Respectă principiul continuității instrumentelor legale
✓ Diferențele de rotunjire sunt conforme legislației UE
✓ Bazele de date originale rămân intacte pentru audit
✓ Sistem dual currency complet funcțional
`;

    if (preview.memberIntegrity && !preview.memberIntegrity.valid) {
      text += `\n\n${'🚨'.repeat(10)} ATENȚIE ${'🚨'.repeat(10)}
DISCREPANȚE CRITICE DETECTATE!

Membri cu activitate financiară în DEPCRED.db dar
neînregistrați în MEMBRII.db:
${preview.memberIntegrity.membersOnlyInDepcred.length} cazuri

ACȚIUNE NECESARĂ:
1. Verificați fișele neînregistrate în raportul de export
2. Adăugați membrii lipsă în MEMBRII sau ștergeți din DEPCRED
3. Sau documentați discrepanțele în documentația proiectului
4. Re-rulați validarea după corecții

CONVERSIA POATE CONTINUA dar rezolvarea discrepanțelor
este recomandată pentru integritatea completă a sistemului.
${'='.repeat(70)}
`;
    }

    setPreviewText(text);
  };

  const validateMemberIntegrity = (
    depcredDB: any,
    membriiDB: any
  ): MemberIntegrityResult => {
    const result: MemberIntegrityResult = {
      valid: true,
      totalMembrii: 0,
      distinctDepcred: 0,
      difference: 0,
      membersOnlyInMembrii: [],
      membersOnlyInDepcred: [],
      summary: ''
    };

    try {
      // Get membri din MEMBRII
      const membriiResult = membriiDB.exec(
        'SELECT NR_FISA, NUM_PREN FROM MEMBRII ORDER BY NR_FISA'
      );

      const membriiSet = new Set<number>();
      const membriiDetails = new Map<number, string>();

      if (membriiResult.length > 0) {
        for (const row of membriiResult[0].values) {
          const nrFisa = Number(row[0]);
          const numPren = String(row[1] || '');
          membriiSet.add(nrFisa);
          membriiDetails.set(nrFisa, numPren);
        }
      }

      result.totalMembrii = membriiSet.size;

      // Get membri din DEPCRED
      const depcredResult = depcredDB.exec(
        'SELECT DISTINCT NR_FISA FROM DEPCRED ORDER BY NR_FISA'
      );

      const depcredSet = new Set<number>();

      if (depcredResult.length > 0) {
        for (const row of depcredResult[0].values) {
          depcredSet.add(Number(row[0]));
        }
      }

      result.distinctDepcred = depcredSet.size;
      result.difference = result.totalMembrii - result.distinctDepcred;

      // Membri doar în MEMBRII (fără activitate)
      for (const nrFisa of membriiSet) {
        if (!depcredSet.has(nrFisa)) {
          result.membersOnlyInMembrii.push({
            nrFisa,
            numPren: membriiDetails.get(nrFisa) || 'N/A',
            problem: 'Înregistrat dar fără activitate'
          });
        }
      }

      // Membri doar în DEPCRED (neînregistrați)
      for (const nrFisa of depcredSet) {
        if (!membriiSet.has(nrFisa)) {
          result.membersOnlyInDepcred.push({
            nrFisa,
            problem: 'Activitate fără înregistrare'
          });
          result.valid = false; // CRITIC!
        }
      }

      // Generare summary
      let summary = `VALIDARE INTEGRITATE MEMBRI:\n`;
      summary += `${'═'.repeat(62)}\n`;
      summary += `Total membri în MEMBRII: ${result.totalMembrii}\n`;
      summary += `Membri distincți în DEPCRED: ${result.distinctDepcred}\n`;
      summary += `Diferență: ${result.difference >= 0 ? '+' : ''}${result.difference}\n\n`;

      if (result.difference === 0) {
        summary += `✅ PERFECT: Număr consistent de membri\n`;
      } else {
        summary += `⚠️ DISCREPANȚĂ: ${Math.abs(result.difference)} diferențe\n\n`;

        if (result.membersOnlyInMembrii.length > 0) {
          summary += `📋 MEMBRI FĂRĂ ACTIVITATE (${result.membersOnlyInMembrii.length}):\n`;
          for (const member of result.membersOnlyInMembrii.slice(0, 10)) {
            summary += `   • Fișa ${member.nrFisa}: ${member.numPren}\n`;
          }
          if (result.membersOnlyInMembrii.length > 10) {
            summary += `   ... și încă ${result.membersOnlyInMembrii.length - 10}\n`;
          }
          summary += `\n`;
        }

        if (result.membersOnlyInDepcred.length > 0) {
          summary += `🚨 MEMBRI NEÎNREGISTRAȚI (${result.membersOnlyInDepcred.length}):\n`;
          for (const member of result.membersOnlyInDepcred.slice(0, 10)) {
            summary += `   • Fișa ${member.nrFisa}: NEÎNREGISTRAT\n`;
          }
          if (result.membersOnlyInDepcred.length > 10) {
            summary += `   ... și încă ${result.membersOnlyInDepcred.length - 10}\n`;
          }
          summary += `\n`;
        }
      }

      if (!result.valid) {
        summary += `❌ ACȚIUNE NECESARĂ: Rezolvați discrepanțele\n`;
      } else {
        summary += `✅ STATUS: Validare trecută\n`;
      }

      result.summary = summary;

    } catch (error: any) {
      result.valid = false;
      result.summary = `❌ EROARE validare: ${error.message}`;
    }

    return result;
  };

  const handleReset = () => {
    setCursInput(DEFAULT_CURS);
    setPreviewGenerated(false);
    setPreviewData(null);
    setPreviewText('');
    setConversionComplete(false);
    setFinalStats(null);
    addLog('Formular resetat');
  };

  // ==========================================
  // FUNCȚII DE CONVERSIE
  // ==========================================

  const cloneDatabase = (sourceDB: any, SQL: any): any => {
    const data = sourceDB.export();
    const clonedDB = new SQL.Database(data);
    return clonedDB;
  };

  const convertDEPCRED = async (eurDB: any, curs: Decimal): Promise<ConversionStats> => {
    addLog('Conversie DEPCRED - conform CE 1103/97...');
    setProgress(50);

    const stats: ConversionStats = {
      totalRecords: 0,
      convertedRecords: 0,
      originalSumRON: new Decimal(0),
      convertedSumEUR: new Decimal(0),
      theoreticalSumEUR: new Decimal(0),
      roundingDifference: new Decimal(0)
    };

    try {
      // Count total
      const countResult = eurDB.exec('SELECT COUNT(*) FROM DEPCRED');
      stats.totalRecords = countResult[0]?.values[0]?.[0] || 0;

      // Get all records
      const result = eurDB.exec(`
        SELECT rowid, DOBANDA, IMPR_DEB, IMPR_CRED, IMPR_SOLD,
               DEP_DEB, DEP_CRED, DEP_SOLD
        FROM DEPCRED
        ORDER BY ANUL, LUNA, NR_FISA
      `);

      if (result.length === 0 || !result[0].values) {
        addLog('⚠️ DEPCRED gol - nicio înregistrare de convertit');
        return stats;
      }

      const rows = result[0].values;
      const monetaryFields = ['DOBANDA', 'IMPR_DEB', 'IMPR_CRED', 'IMPR_SOLD', 'DEP_DEB', 'DEP_CRED', 'DEP_SOLD'];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowid = row[0];
        const convertedValues: number[] = [];

        // Convert each monetary field
        for (let j = 0; j < monetaryFields.length; j++) {
          const valRON = new Decimal(row[j + 1]?.toString() || '0');
          const valEUR = valRON.div(curs).toDecimalPlaces(2);

          convertedValues.push(parseFloat(valEUR.toString()));

          stats.originalSumRON = stats.originalSumRON.plus(valRON);
          stats.convertedSumEUR = stats.convertedSumEUR.plus(valEUR);
        }

        // Update record în EUR database
        eurDB.run(`
          UPDATE DEPCRED SET
            DOBANDA = ?, IMPR_DEB = ?, IMPR_CRED = ?, IMPR_SOLD = ?,
            DEP_DEB = ?, DEP_CRED = ?, DEP_SOLD = ?
          WHERE rowid = ?
        `, [...convertedValues, rowid]);

        stats.convertedRecords++;

        // Progress update every 100 records
        if ((i + 1) % 100 === 0) {
          const progressPercent = 50 + Math.floor(((i + 1) / rows.length) * 10);
          setProgress(progressPercent);
          addLog(`DEPCRED: ${i + 1}/${rows.length} înregistrări convertite`);
          await new Promise(resolve => setTimeout(resolve, 0)); // Allow UI update
        }
      }

      stats.theoreticalSumEUR = stats.originalSumRON.div(curs).toDecimalPlaces(2);
      stats.roundingDifference = stats.convertedSumEUR.minus(stats.theoreticalSumEUR);

      setProgress(60);
      addLog(`✓ DEPCRED: ${stats.convertedRecords} înregistrări convertite cu succes`);

    } catch (error: any) {
      addLog(`❌ EROARE conversie DEPCRED: ${error.message}`);
      throw error;
    }

    return stats;
  };

  const convertMEMBRII = async (eurDB: any, curs: Decimal): Promise<ConversionStats> => {
    addLog('Conversie MEMBRII - conform CE 1103/97...');
    setProgress(65);

    const stats: ConversionStats = {
      totalRecords: 0,
      convertedRecords: 0,
      originalSumRON: new Decimal(0),
      convertedSumEUR: new Decimal(0),
      theoreticalSumEUR: new Decimal(0),
      roundingDifference: new Decimal(0)
    };

    try {
      const result = eurDB.exec('SELECT NR_FISA, COTIZATIE_STANDARD FROM MEMBRII');

      if (result.length === 0 || !result[0].values) {
        addLog('⚠️ MEMBRII gol - niciun membru de convertit');
        return stats;
      }

      const members = result[0].values;
      stats.totalRecords = members.length;

      for (let i = 0; i < members.length; i++) {
        const [nrFisa, cotizatieRON] = members[i];
        const valRON = new Decimal(cotizatieRON?.toString() || '0');
        const valEUR = valRON.div(curs).toDecimalPlaces(2);

        eurDB.run(
          'UPDATE MEMBRII SET COTIZATIE_STANDARD = ? WHERE NR_FISA = ?',
          [parseFloat(valEUR.toString()), nrFisa]
        );

        stats.originalSumRON = stats.originalSumRON.plus(valRON);
        stats.convertedSumEUR = stats.convertedSumEUR.plus(valEUR);
        stats.convertedRecords++;

        if ((i + 1) % 100 === 0) {
          addLog(`MEMBRII: ${i + 1}/${members.length} membri convertiți`);
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }

      stats.theoreticalSumEUR = stats.originalSumRON.div(curs).toDecimalPlaces(2);
      stats.roundingDifference = stats.convertedSumEUR.minus(stats.theoreticalSumEUR);

      setProgress(70);
      addLog(`✓ MEMBRII: ${stats.convertedRecords} membri convertiți cu succes`);

    } catch (error: any) {
      addLog(`❌ EROARE conversie MEMBRII: ${error.message}`);
      throw error;
    }

    return stats;
  };

  const convertACTIVI = async (eurDB: any, curs: Decimal): Promise<ConversionStats> => {
    addLog('Conversie ACTIVI - conform CE 1103/97...');
    setProgress(75);

    const stats: ConversionStats = {
      totalRecords: 0,
      convertedRecords: 0,
      originalSumRON: new Decimal(0),
      convertedSumEUR: new Decimal(0),
      theoreticalSumEUR: new Decimal(0),
      roundingDifference: new Decimal(0)
    };

    try {
      const result = eurDB.exec('SELECT NR_FISA, DEP_SOLD, DIVIDEND FROM ACTIVI');

      if (result.length === 0 || !result[0].values) {
        addLog('⚠️ ACTIVI gol - niciun membru activ de convertit');
        return stats;
      }

      const activeMembers = result[0].values;
      stats.totalRecords = activeMembers.length;

      for (let i = 0; i < activeMembers.length; i++) {
        const [nrFisa, depSoldRON, dividendRON] = activeMembers[i];

        const depSoldVal = new Decimal(depSoldRON?.toString() || '0');
        const dividendVal = new Decimal(dividendRON?.toString() || '0');

        const depSoldEUR = depSoldVal.div(curs).toDecimalPlaces(2);
        const dividendEUR = dividendVal.div(curs).toDecimalPlaces(2);

        eurDB.run(`
          UPDATE ACTIVI SET
            DEP_SOLD = ?, DIVIDEND = ?
          WHERE NR_FISA = ?
        `, [
          parseFloat(depSoldEUR.toString()),
          parseFloat(dividendEUR.toString()),
          nrFisa
        ]);

        const sumRON = depSoldVal.plus(dividendVal);
        const sumEUR = depSoldEUR.plus(dividendEUR);

        stats.originalSumRON = stats.originalSumRON.plus(sumRON);
        stats.convertedSumEUR = stats.convertedSumEUR.plus(sumEUR);
        stats.convertedRecords++;

        if ((i + 1) % 50 === 0) {
          addLog(`ACTIVI: ${i + 1}/${activeMembers.length} membri activi convertiți`);
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }

      stats.theoreticalSumEUR = stats.originalSumRON.div(curs).toDecimalPlaces(2);
      stats.roundingDifference = stats.convertedSumEUR.minus(stats.theoreticalSumEUR);

      setProgress(80);
      addLog(`✓ ACTIVI: ${stats.convertedRecords} membri activi convertiți cu succes`);

    } catch (error: any) {
      addLog(`❌ EROARE conversie ACTIVI: ${error.message}`);
      throw error;
    }

    return stats;
  };

  const handleApplyConversion = async () => {
    const curs = validateCurs();
    if (!curs) return;

    if (hasEURDatabases) {
      alert('Nu se poate aplica conversie: Baze EUR deja există!\n\nȘtergeți bazele EUR și reîncărcați doar RON.');
      return;
    }

    if (!previewData || !previewData.memberIntegrity) {
      alert('Generați mai întâi o previzualizare pentru a vedea estimările!');
      return;
    }

    // Warning dacă există discrepanțe
    if (!previewData.memberIntegrity.valid && previewData.memberIntegrity.membersOnlyInDepcred.length > 0) {
      const proceed = confirm(
        `⚠️ ATENȚIE: Detectate ${previewData.memberIntegrity.membersOnlyInDepcred.length} discrepanțe critice!\n\n` +
        `Membri cu activitate financiară dar neînregistrați în MEMBRII.\n\n` +
        `Aceasta poate indica probleme de integritate date.\n\n` +
        `Continuați conversia cu aceste discrepanțe?\n\n` +
        `Recomandare: Exportați raportul și rezolvați înainte de conversie.`
      );

      if (!proceed) {
        addLog('Conversie anulată pentru rezolvare probleme integritate');
        return;
      } else {
        addLog('Conversie continuată cu discrepanțe acceptate');
      }
    }

    const finalConfirm = confirm(
      `⚠️ CONVERSIE DEFINITIVĂ - IREVERSIBILĂ!\n\n` +
      `Confirmați aplicarea conversiei RON → EUR?\n` +
      `Curs: 1 EUR = ${curs.toFixed(6)} RON\n\n` +
      `Se vor crea 5 baze de date EUR:\n` +
      `• DEPCREDEUR.db\n` +
      `• MEMBRIIEUR.db\n` +
      `• activiEUR.db\n` +
      `• INACTIVIEUR.db\n` +
      `• LICHIDATIEUR.db\n\n` +
      `Bazele originale RON rămân intacte pentru audit.`
    );

    if (!finalConfirm) {
      addLog('Conversie anulată de utilizator');
      return;
    }

    setIsConverting(true);
    setProgress(0);

    try {
      addLog(`═══════════════════════════════════════════`);
      addLog(`ÎNCEPERE CONVERSIE DEFINITIVĂ`);
      addLog(`Curs folosit: ${curs.toFixed(6)} RON/EUR`);
      addLog(`Conformă Regulamentului CE 1103/97`);
      addLog(`═══════════════════════════════════════════`);

      setProgress(5);
      addLog('Inițializare SQL.js...');

      // Inițializare SQL.js
      const SQL = await initSqlJs({
        locateFile: (f: string) => `https://sql.js.org/dist/${f}`,
      });

      addLog('✓ SQL.js inițializat cu succes');

      setProgress(7);
      addLog('Validare baze de date...');

      if (!databases.depcred || !databases.membrii || !databases.activi) {
        throw new Error('Lipsesc baze de date obligatorii: DEPCRED, MEMBRII, ACTIVI');
      }

      // Clonare baze
      setProgress(10);
      addLog('Clonare DEPCRED → DEPCREDEUR...');
      const depcredEUR = cloneDatabase(databases.depcred, SQL);

      setProgress(20);
      addLog('Clonare MEMBRII → MEMBRIIEUR...');
      const membriiEUR = cloneDatabase(databases.membrii, SQL);

      setProgress(30);
      addLog('Clonare activi → activiEUR...');
      const activiEUR = cloneDatabase(databases.activi, SQL);

      setProgress(35);
      addLog('Clonare INACTIVI → INACTIVIEUR...');
      const inactiviEUR = databases.inactivi ? cloneDatabase(databases.inactivi, SQL) : null;

      setProgress(40);
      addLog('Clonare LICHIDATI → LICHIDATIEUR...');
      const lichidatiEUR = databases.lichidati ? cloneDatabase(databases.lichidati, SQL) : null;

      setProgress(45);
      addLog('✓ Toate bazele clonate cu succes');

      // Conversie monetară
      const statsDEPCRED = await convertDEPCRED(depcredEUR, curs);
      const statsMEMBRII = await convertMEMBRII(membriiEUR, curs);
      const statsACTIVI = await convertACTIVI(activiEUR, curs);

      // Salvare în databases object
      databases.depcredeur = depcredEUR;
      databases.membriieur = membriiEUR;
      databases.activieur = activiEUR;
      if (inactiviEUR) databases.inactivieur = inactiviEUR;
      if (lichidatiEUR) databases.lichidatieur = lichidatiEUR;

      setProgress(90);
      addLog('Calculare statistici finale...');

      // Statistici finale
      const totalOriginalRON = statsDEPCRED.originalSumRON
        .plus(statsMEMBRII.originalSumRON)
        .plus(statsACTIVI.originalSumRON);

      const totalConvertedEUR = statsDEPCRED.convertedSumEUR
        .plus(statsMEMBRII.convertedSumEUR)
        .plus(statsACTIVI.convertedSumEUR);

      const totalTheoreticalEUR = totalOriginalRON.div(curs).toDecimalPlaces(2);
      const totalRoundingDiff = totalConvertedEUR.minus(totalTheoreticalEUR);

      const finalStatsData = {
        statsDEPCRED,
        statsMEMBRII,
        statsACTIVI,
        totalOriginalRON: parseFloat(totalOriginalRON.toString()),
        totalConvertedEUR: parseFloat(totalConvertedEUR.toString()),
        totalTheoreticalEUR: parseFloat(totalTheoreticalEUR.toString()),
        totalRoundingDiff: parseFloat(totalRoundingDiff.toString()),
        cursUsed: parseFloat(curs.toString()),
        timestamp: new Date().toISOString()
      };

      setFinalStats(finalStatsData);
      setConversionComplete(true);
      setProgress(100);

      addLog(`═══════════════════════════════════════════`);
      addLog(`CONVERSIE COMPLETĂ CU SUCCES!`);
      addLog(`─────────────────────────────────────────`);
      addLog(`STATISTICI FINALE:`);
      addLog(`• Total original RON: ${totalOriginalRON.toFixed(2)}`);
      addLog(`• Total convertit EUR: ${totalConvertedEUR.toFixed(2)}`);
      addLog(`• Total teoretic EUR: ${totalTheoreticalEUR.toFixed(2)}`);
      addLog(`• Diferență rotunjire totală: ${totalRoundingDiff.toFixed(4)} EUR`);
      addLog(`─────────────────────────────────────────`);
      addLog(`Diferențe per bază:`);
      addLog(`• DEPCRED: ${statsDEPCRED.roundingDifference.toFixed(4)} EUR`);
      addLog(`• MEMBRII: ${statsMEMBRII.roundingDifference.toFixed(4)} EUR`);
      addLog(`• ACTIVI: ${statsACTIVI.roundingDifference.toFixed(4)} EUR`);
      addLog(`═══════════════════════════════════════════`);
      addLog(`Bazele EUR sunt disponibile în memorie.`);
      addLog(`Folosiți butoanele de descărcare pentru salvare.`);

      alert(
        `✅ CONVERSIE COMPLETĂ CU SUCCES!\n\n` +
        `Rezultate conversie:\n` +
        `• DEPCRED: ${statsDEPCRED.convertedRecords.toLocaleString()} înregistrări\n` +
        `• MEMBRII: ${statsMEMBRII.convertedRecords.toLocaleString()} membri\n` +
        `• ACTIVI: ${statsACTIVI.convertedRecords.toLocaleString()} membri activi\n\n` +
        `Diferență rotunjire totală: ${totalRoundingDiff.toFixed(4)} EUR\n` +
        `(Conform CE 1103/97 - legitim)\n\n` +
        `Folosiți butoanele de descărcare pentru a salva bazele EUR.`
      );

    } catch (error: any) {
      addLog(`❌ EROARE CRITICĂ: ${error.message}`);
      alert(`Eroare la conversie:\n\n${error.message}\n\nBazele de date rămân nemodificate.`);
    } finally {
      setIsConverting(false);
    }
  };

  const downloadEURDatabase = (dbName: string) => {
    try {
      let db: any = null;
      let fileName = '';

      switch (dbName) {
        case 'depcred':
          db = databases.depcredeur;
          fileName = 'DEPCREDEUR.db';
          break;
        case 'membrii':
          db = databases.membriieur;
          fileName = 'MEMBRIIEUR.db';
          break;
        case 'activi':
          db = databases.activieur;
          fileName = 'activiEUR.db';
          break;
        case 'inactivi':
          db = databases.inactivieur;
          fileName = 'INACTIVIEUR.db';
          break;
        case 'lichidati':
          db = databases.lichidatieur;
          fileName = 'LICHIDATIEUR.db';
          break;
      }

      if (!db) {
        alert(`Baza de date ${fileName} nu este disponibilă!`);
        return;
      }

      const data = db.export();
      const blob = new Blob([data], { type: 'application/x-sqlite3' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      addLog(`✓ Descărcat ${fileName}`);

    } catch (error: any) {
      alert(`Eroare la descărcarea bazei: ${error.message}`);
      addLog(`❌ Eroare descărcare: ${error.message}`);
    }
  };

  const handleExportReport = () => {
    if (!previewData && !finalStats) {
      alert('Nu există date pentru export! Generați o previzualizare sau aplicați conversia.');
      return;
    }

    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      let content = `RAPORT CONVERSIE RON→EUR - CONFORM REGULAMENTULUI CE 1103/97\n`;
      content += `${'='.repeat(80)}\n\n`;
      content += `Generat: ${new Date().toLocaleString('ro-RO')}\n`;
      content += `Utilizator: ${utilizator}\n`;
      content += `Curs folosit: ${cursInput} RON/EUR\n\n`;

      // Preview data
      if (previewData) {
        content += `${'='.repeat(80)}\n`;
        content += `PREVIEW CONVERSIE\n`;
        content += `${'='.repeat(80)}\n`;
        content += previewText;
        content += `\n\n`;
      }

      // Final stats
      if (finalStats) {
        content += `${'='.repeat(80)}\n`;
        content += `REZULTATE FINALE CONVERSIE\n`;
        content += `${'='.repeat(80)}\n`;
        content += `Data conversie: ${new Date(finalStats.timestamp).toLocaleString('ro-RO')}\n`;
        content += `Metodă: Conversie directă individuală (CE 1103/97)\n\n`;

        content += `STATISTICI CONVERSIE:\n`;
        content += `${'-'.repeat(50)}\n`;
        content += `Total original RON: ${finalStats.totalOriginalRON.toLocaleString('ro-RO', { minimumFractionDigits: 2 })}\n`;
        content += `Total convertit EUR: ${finalStats.totalConvertedEUR.toLocaleString('ro-RO', { minimumFractionDigits: 2 })}\n`;
        content += `Total teoretic EUR: ${finalStats.totalTheoreticalEUR.toLocaleString('ro-RO', { minimumFractionDigits: 2 })}\n`;
        content += `Diferență rotunjire totală: ${finalStats.totalRoundingDiff >= 0 ? '+' : ''}${finalStats.totalRoundingDiff.toFixed(4)} EUR\n\n`;

        content += `DIFERENȚE PER BAZĂ (DETALIU):\n`;
        content += `${'-'.repeat(30)}\n`;
        content += `DEPCRED: ${finalStats.statsDEPCRED.roundingDifference.toFixed(4)} EUR\n`;
        content += `MEMBRII: ${finalStats.statsMEMBRII.roundingDifference.toFixed(4)} EUR\n`;
        content += `ACTIVI: ${finalStats.statsACTIVI.roundingDifference.toFixed(4)} EUR\n\n`;

        content += `INTERPRETARE LEGALĂ:\n`;
        content += `${'-'.repeat(25)}\n`;
        content += `Diferențele de rotunjire sunt conforme cu:\n`;
        content += `• Regulamentul CE 1103/97, articolul 4\n`;
        content += `• Principiul continuității instrumentelor legale\n`;
        content += `• Metodologia conversiei directe individuale\n`;
        content += `• Regulile de rotunjire la 2 zecimale\n\n`;
      }

      // Member integrity
      if (previewData?.memberIntegrity) {
        content += `${'='.repeat(80)}\n`;
        content += `RAPORT DETALIAT INTEGRITATE MEMBRI\n`;
        content += `${'='.repeat(80)}\n`;
        content += previewData.memberIntegrity.summary;
        content += `\n`;

        if (previewData.memberIntegrity.membersOnlyInDepcred.length > 0) {
          content += `\n${'='.repeat(50)}\n`;
          content += `MEMBRI CU ACTIVITATE DAR NEÎNREGISTRAȚI:\n`;
          content += `${'-'.repeat(50)}\n`;
          for (const member of previewData.memberIntegrity.membersOnlyInDepcred) {
            content += `Fișa ${member.nrFisa}: NECESITĂ ÎNREGISTRARE ÎN MEMBRII\n`;
          }
        }
      }

      // Logs
      content += `\n\n${'='.repeat(50)}\n`;
      content += `JURNAL OPERAȚIUNI\n`;
      content += `${'='.repeat(50)}\n`;
      content += logs.join('\n');
      content += `\n\nGenerat la: ${new Date().toLocaleString('ro-RO')}\n`;

      // Download
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `raport_conversie_ue_${timestamp}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      addLog(`✓ Raport exportat: raport_conversie_ue_${timestamp}.txt`);
      alert('Raport exportat cu succes!');

    } catch (error: any) {
      alert(`Eroare la export raport:\n${error.message}`);
      addLog(`❌ Eroare export raport: ${error.message}`);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="bg-blue-900 text-white rounded-lg p-4 border-2 border-blue-800">
            <h1 className="text-2xl font-bold text-center">
              CONVERSIE DEFINITIVĂ RON → EUR - CONFORM REGULAMENTULUI CE 1103/97
            </h1>
            <p className="text-center text-sm mt-1 text-blue-200">
              Conversie directă individuală per Regulamentul CE 1103/97
            </p>
          </div>
        </div>

        {/* Warning dacă există EUR */}
        {hasEURDatabases && (
          <Alert className="mb-6 border-yellow-500 bg-yellow-50">
            <Lock className="h-5 w-5 text-yellow-600" />
            <AlertDescription className="ml-2">
              <p className="font-semibold text-yellow-900 mb-1">
                Sistem Dual Currency Deja Activat
              </p>
              <p className="text-sm text-yellow-800">
                Conversia a fost deja aplicată. Butonul de conversie este dezactivat.
                Sistemul operează în modul DUAL CURRENCY (RON + EUR).
                Pentru a reconverti, ștergeți bazele EUR și reîncărcați doar RON.
              </p>
            </AlertDescription>
          </Alert>
        )}

        {/* Layout Desktop: Dual Panel */}
        <div className="hidden lg:grid lg:grid-cols-2 gap-6">
          {/* LEFT PANEL - Config */}
          <div className="space-y-4">
            {renderConfigPanel()}
          </div>

          {/* RIGHT PANEL - Preview + Logs */}
          <div className="space-y-4">
            {renderPreviewPanel()}
            {renderLogsPanel()}
          </div>
        </div>

        {/* Layout Mobile: Single Column */}
        <div className="lg:hidden space-y-4">
          {renderConfigPanel()}
          {renderPreviewPanel()}
          {renderLogsPanel()}
        </div>
      </div>
    </div>
  );

  function renderConfigPanel() {
    return (
      <>
        {/* Parametri Conversie */}
        <Card className="border-2 border-blue-600 shadow-lg">
          <CardHeader>
            <CardTitle className="text-lg">Parametri Conversie</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Curs de schimb RON/EUR (fix)
              </label>
              <Input
                type="text"
                value={cursInput}
                onChange={(e) => setCursInput(e.target.value)}
                disabled={isConverting || hasEURDatabases}
                placeholder="4.9435"
                className="font-mono"
              />
              <p className="text-xs text-gray-500 mt-1">
                (1 EUR = X RON) - Cursul fix oficial pentru conversia RON→EUR
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Utilizator
              </label>
              <Input
                type="text"
                value={utilizator}
                disabled
                className="bg-gray-100"
              />
            </div>

            <div>
              <p className="text-sm text-green-700 font-semibold">
                Metodă: Conversie directă individuală (CE 1103/97)
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Acțiuni */}
        <Card className="border-2 border-green-600">
          <CardHeader>
            <CardTitle className="text-lg">Acțiuni</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                {previewGenerated ? (
                  <CheckSquare className="w-5 h-5 text-green-600" />
                ) : (
                  <Square className="w-5 h-5 text-gray-400" />
                )}
                <label className="text-sm">Preview generat</label>
              </div>

              <div className="flex items-center space-x-2">
                {validationActive ? (
                  <CheckSquare className="w-5 h-5 text-green-600" />
                ) : (
                  <Square className="w-5 h-5 text-gray-400" />
                )}
                <label className="text-sm">Validare strictă UE activă</label>
              </div>

              <div className="flex items-center space-x-2">
                {euCompliant ? (
                  <CheckSquare className="w-5 h-5 text-green-600" />
                ) : (
                  <Square className="w-5 h-5 text-gray-400" />
                )}
                <label className="text-sm">
                  Conversie conform Regulamentului CE 1103/97
                </label>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <Button
                onClick={generatePreview}
                disabled={isConverting || hasEURDatabases}
                className="bg-sky-600 hover:bg-sky-700"
              >
                Previzualizare
              </Button>

              <Button
                onClick={handleApplyConversion}
                disabled={!previewGenerated || isConverting || hasEURDatabases}
                variant="destructive"
                className="bg-green-600 hover:bg-green-700"
              >
                Aplică Conversie
              </Button>

              <Button
                onClick={handleReset}
                disabled={isConverting}
                variant="outline"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Reset
              </Button>

              <Button
                onClick={handleExportReport}
                disabled={!previewGenerated || isConverting}
                className="bg-purple-600 hover:bg-purple-700"
              >
                <FileText className="w-4 h-4 mr-2" />
                Export Raport
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Progress */}
        {isConverting && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Progres Operațiune</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 leading-relaxed">
              <div className="w-full bg-gray-200 rounded-full h-4">
                <div
                  className="bg-green-600 h-4 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
              <p className="text-sm text-gray-600">{progress}% completat</p>
              {statusMessage && (
                <p className="text-sm text-blue-600">{statusMessage}</p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Download EUR Databases */}
        {conversionComplete && (
          <Card className="border-2 border-purple-600">
            <CardHeader>
              <CardTitle className="text-lg">Descarcă Baze de Date EUR</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert className="border-purple-500 bg-purple-50">
                <FileJson className="h-5 w-5 text-purple-600" />
                <AlertDescription className="ml-2">
                  <p className="font-semibold text-purple-900 mb-1">
                    Baze EUR Create Cu Succes
                  </p>
                  <p className="text-sm text-purple-800">
                    Descărcați bazele de date convertite pentru a le salva pe dispozitiv.
                    După descărcare, puteți reîncărca bazele EUR în aplicație pentru a activa dual currency.
                  </p>
                </AlertDescription>
              </Alert>

              <div className="grid grid-cols-1 gap-2">
                <Button
                  onClick={() => downloadEURDatabase('depcred')}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <Download className="w-4 h-4 mr-2" />
                  DEPCREDEUR.db
                </Button>

                <Button
                  onClick={() => downloadEURDatabase('membrii')}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <Download className="w-4 h-4 mr-2" />
                  MEMBRIIEUR.db
                </Button>

                <Button
                  onClick={() => downloadEURDatabase('activi')}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <Download className="w-4 h-4 mr-2" />
                  activiEUR.db
                </Button>

                <Button
                  onClick={() => downloadEURDatabase('inactivi')}
                  className="bg-green-600 hover:bg-green-700"
                  disabled={!databases.inactivieur}
                >
                  <Download className="w-4 h-4 mr-2" />
                  INACTIVIEUR.db
                </Button>

                <Button
                  onClick={() => downloadEURDatabase('lichidati')}
                  className="bg-green-600 hover:bg-green-700"
                  disabled={!databases.lichidatieur}
                >
                  <Download className="w-4 h-4 mr-2" />
                  LICHIDATIEUR.db
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </>
    );
  }

  function renderPreviewPanel() {
    return (
      <Card className="border-2 border-gray-300">
        <CardHeader>
          <CardTitle className="text-lg">Preview Conversie</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px] lg:h-[500px] w-full rounded-md border p-4 bg-gray-50">
            <pre className="text-xs font-mono whitespace-pre-wrap">
              {previewText || 'Generați o previzualizare pentru a vedea estimările conversiei...'}
            </pre>
          </ScrollArea>
        </CardContent>
      </Card>
    );
  }

  function renderLogsPanel() {
    return (
      <Card className="border-2 border-gray-300">
        <CardHeader>
          <CardTitle className="text-lg">Jurnal Operațiuni</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[200px] lg:h-[250px] w-full rounded-md border p-4 bg-gray-900">
            <div className="space-y-1 font-mono text-xs text-green-400">
              {logs.map((log, index) => (
                <div key={index}>{log}</div>
              ))}
              <div ref={logsEndRef} />
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    );
  }
}
