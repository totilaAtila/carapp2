import React, { useState, useEffect, useCallback } from 'react';
import { Button } from './ui/buttons';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Alert, AlertDescription } from './ui/alert';
import { Label } from './ui/label';
import {
  UserX,
  AlertTriangle,
  Trash2,
  Archive,
  CheckSquare,
  Square,
  RefreshCw,
  FileWarning,
  Clock,
  Wallet,
  Database
} from 'lucide-react';
import { getActiveDB, assertCanWrite, type DBSet } from '../services/databaseManager';

interface Props {
  databases: DBSet;
}

interface MembruProblema {
  nrFisa: number;
  numePren: string;
  domiciliul: string;
  tipProblema: string;
  detalii: string;
  ultimaTranzactie?: string; // format: "MM/YYYY"
  soldImprumut?: string;
  soldDepuneri?: string;
}

type TabType = 'inactivi' | 'solduri-zero' | 'neconcordante';

export default function Lichidati({ databases }: Props) {
  const currency = databases.activeCurrency || 'RON';

  // State pentru tab-uri
  const [activeTab, setActiveTab] = useState<TabType>('inactivi');

  // State pentru membri detectați
  const [membriInactivi, setMembriInactivi] = useState<MembruProblema[]>([]);
  const [membriSolduriZero, setMembriSolduriZero] = useState<MembruProblema[]>([]);
  const [membriNeconcordante, setMembriNeconcordante] = useState<MembruProblema[]>([]);

  // State pentru selecție
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // State UI
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [actionType, setActionType] = useState<'lichidare' | 'stergere'>('lichidare');
  const [resetSolduri, setResetSolduri] = useState(false); // Opțiune resetare solduri la lichidare

  // Parametri configurabili
  const [luniInactivitate, setLuniInactivitate] = useState(12); // luni fără tranzacții

  // Scroll la top când se montează componenta
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const pushLog = (msg: string) => {
    setLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ${msg}`]);
  };

  // Funcție pentru detectarea membrilor inactivi
  const detecteazaMembriInactivi = useCallback(() => {
    setLoading(true);
    pushLog("🔍 Începe detectarea membrilor inactivi...");

    try {
      const membriiDB = getActiveDB(databases, 'membrii');
      const depcredDB = getActiveDB(databases, 'depcred');
      const lichidatiDB = getActiveDB(databases, 'lichidati');

      // Obține data curentă
      const now = new Date();
      const anCurent = now.getFullYear();
      const lunaCurenta = now.getMonth() + 1; // 1-12

      // Calculează data limită (X luni în urmă)
      let anLimita = anCurent;
      let lunaLimita = lunaCurenta - luniInactivitate;

      while (lunaLimita <= 0) {
        lunaLimita += 12;
        anLimita -= 1;
      }

      pushLog(`📅 Căutare membri fără tranzacții din ${lunaLimita}/${anLimita}`);

      // Obține toți membrii din MEMBRII
      const membriiQuery = `SELECT NR_FISA, NUM_PREN, DOMICILIUL FROM MEMBRII`;
      const membriiResult = membriiDB.exec(membriiQuery);

      if (membriiResult.length === 0) {
        pushLog("⚠️ Nu există membri în baza de date");
        setMembriInactivi([]);
        setLoading(false);
        return;
      }

      // Obține membri deja lichidați (pentru a-i exclude)
      const lichidatiQuery = `SELECT NR_FISA FROM LICHIDATI`;
      const lichidatiResult = lichidatiDB.exec(lichidatiQuery);
      const lichidatiSet = new Set<number>();

      if (lichidatiResult.length > 0) {
        lichidatiResult[0].values.forEach(row => {
          lichidatiSet.add(row[0] as number);
        });
      }

      const membriProblema: MembruProblema[] = [];

      // Verifică fiecare membru
      for (const row of membriiResult[0].values) {
        const nrFisa = row[0] as number;
        const numePren = row[1] as string;
        const domiciliul = row[2] as string;

        // Skip membri deja lichidați
        if (lichidatiSet.has(nrFisa)) continue;

        // Verifică ultima tranzacție în DEPCRED
        const ultimaTranzQuery = `
          SELECT LUNA, ANUL
          FROM DEPCRED
          WHERE NR_FISA = ${nrFisa}
          ORDER BY ANUL DESC, LUNA DESC
          LIMIT 1
        `;
        const ultimaTranzResult = depcredDB.exec(ultimaTranzQuery);

        if (ultimaTranzResult.length === 0) {
          // Nu există nicio tranzacție - membru fără activitate
          membriProblema.push({
            nrFisa,
            numePren,
            domiciliul,
            tipProblema: 'Fără tranzacții',
            detalii: 'Nicio înregistrare în DEPCRED',
            ultimaTranzactie: 'Niciodată'
          });
          continue;
        }

        const ultimaLuna = ultimaTranzResult[0].values[0][0] as number;
        const ultimulAn = ultimaTranzResult[0].values[0][1] as number;

        // Verifică dacă ultima tranzacție este mai veche decât limita
        const esteInactiv =
          ultimulAn < anLimita ||
          (ultimulAn === anLimita && ultimaLuna < lunaLimita);

        if (esteInactiv) {
          membriProblema.push({
            nrFisa,
            numePren,
            domiciliul,
            tipProblema: 'Inactiv',
            detalii: `Fără activitate de ${luniInactivitate} luni`,
            ultimaTranzactie: `${String(ultimaLuna).padStart(2, '0')}/${ultimulAn}`
          });
        }
      }

      setMembriInactivi(membriProblema);
      pushLog(`✅ Detectați ${membriProblema.length} membri inactivi`);

    } catch (err: any) {
      pushLog(`❌ Eroare: ${err.message}`);
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [databases, luniInactivitate]);

  // Funcție pentru detectarea membrilor cu solduri zero
  const detecteazaMembriSolduriZero = useCallback(() => {
    setLoading(true);
    pushLog("🔍 Începe detectarea membrilor cu solduri zero...");

    try {
      const membriiDB = getActiveDB(databases, 'membrii');
      const depcredDB = getActiveDB(databases, 'depcred');
      const lichidatiDB = getActiveDB(databases, 'lichidati');

      // Obține membri deja lichidați
      const lichidatiQuery = `SELECT NR_FISA FROM LICHIDATI`;
      const lichidatiResult = lichidatiDB.exec(lichidatiQuery);
      const lichidatiSet = new Set<number>();

      if (lichidatiResult.length > 0) {
        lichidatiResult[0].values.forEach(row => {
          lichidatiSet.add(row[0] as number);
        });
      }

      // Obține toți membrii din MEMBRII
      const membriiQuery = `SELECT NR_FISA, NUM_PREN, DOMICILIUL FROM MEMBRII`;
      const membriiResult = membriiDB.exec(membriiQuery);

      if (membriiResult.length === 0) {
        pushLog("⚠️ Nu există membri în baza de date");
        setMembriSolduriZero([]);
        setLoading(false);
        return;
      }

      const membriProblema: MembruProblema[] = [];

      // Verifică fiecare membru
      for (const row of membriiResult[0].values) {
        const nrFisa = row[0] as number;
        const numePren = row[1] as string;
        const domiciliul = row[2] as string;

        // Skip membri deja lichidați
        if (lichidatiSet.has(nrFisa)) continue;

        // Obține ultimele solduri
        const ultimulSoldQuery = `
          SELECT IMPR_SOLD, DEP_SOLD, LUNA, ANUL
          FROM DEPCRED
          WHERE NR_FISA = ${nrFisa}
          ORDER BY ANUL DESC, LUNA DESC
          LIMIT 1
        `;
        const ultimulSoldResult = depcredDB.exec(ultimulSoldQuery);

        if (ultimulSoldResult.length === 0) continue;

        const imprSold = parseFloat(ultimulSoldResult[0].values[0][0] as string) || 0;
        const depSold = parseFloat(ultimulSoldResult[0].values[0][1] as string) || 0;
        const luna = ultimulSoldResult[0].values[0][2] as number;
        const an = ultimulSoldResult[0].values[0][3] as number;

        // Verifică dacă ambele solduri sunt zero (sau foarte apropiate de zero)
        if (Math.abs(imprSold) < 0.01 && Math.abs(depSold) < 0.01) {
          membriProblema.push({
            nrFisa,
            numePren,
            domiciliul,
            tipProblema: 'Solduri zero',
            detalii: 'Ambele solduri (împrumut și depuneri) sunt zero',
            ultimaTranzactie: `${String(luna).padStart(2, '0')}/${an}`,
            soldImprumut: imprSold.toFixed(2),
            soldDepuneri: depSold.toFixed(2)
          });
        }
      }

      setMembriSolduriZero(membriProblema);
      pushLog(`✅ Detectați ${membriProblema.length} membri cu solduri zero`);

    } catch (err: any) {
      pushLog(`❌ Eroare: ${err.message}`);
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [databases]);

  // Funcție pentru detectarea neconcordanțelor între baze
  const detecteazaNeconcordante = useCallback(() => {
    setLoading(true);
    pushLog("🔍 Începe detectarea neconcordanțelor între baze...");

    try {
      const membriiDB = getActiveDB(databases, 'membrii');
      const depcredDB = getActiveDB(databases, 'depcred');

      const membriProblema: MembruProblema[] = [];

      // Cazul 1: Membri în DEPCRED dar nu în MEMBRII
      const nrFiseDepcredQuery = `SELECT DISTINCT NR_FISA FROM DEPCRED`;
      const nrFiseDepcredResult = depcredDB.exec(nrFiseDepcredQuery);

      if (nrFiseDepcredResult.length > 0) {
        for (const row of nrFiseDepcredResult[0].values) {
          const nrFisa = row[0] as number;

          // Verifică dacă există în MEMBRII
          const existaQuery = `SELECT COUNT(*) FROM MEMBRII WHERE NR_FISA = ${nrFisa}`;
          const existaResult = membriiDB.exec(existaQuery);
          const exista = existaResult[0].values[0][0] as number;

          if (exista === 0) {
            // Obține detalii din DEPCRED
            const detaliiQuery = `
              SELECT LUNA, ANUL, IMPR_SOLD, DEP_SOLD
              FROM DEPCRED
              WHERE NR_FISA = ${nrFisa}
              ORDER BY ANUL DESC, LUNA DESC
              LIMIT 1
            `;
            const detaliiResult = depcredDB.exec(detaliiQuery);

            if (detaliiResult.length > 0) {
              const luna = detaliiResult[0].values[0][0] as number;
              const an = detaliiResult[0].values[0][1] as number;
              const imprSold = detaliiResult[0].values[0][2] as string;
              const depSold = detaliiResult[0].values[0][3] as string;

              membriProblema.push({
                nrFisa,
                numePren: `Fișa ${nrFisa}`,
                domiciliul: 'N/A',
                tipProblema: 'În DEPCRED, nu în MEMBRII',
                detalii: 'Tranzacții existente dar fără date personale',
                ultimaTranzactie: `${String(luna).padStart(2, '0')}/${an}`,
                soldImprumut: imprSold,
                soldDepuneri: depSold
              });
            }
          }
        }
      }

      // Cazul 2: Membri în MEMBRII dar fără nicio înregistrare în DEPCRED
      const membriiQuery = `SELECT NR_FISA, NUM_PREN, DOMICILIUL FROM MEMBRII`;
      const membriiResult = membriiDB.exec(membriiQuery);

      if (membriiResult.length > 0) {
        for (const row of membriiResult[0].values) {
          const nrFisa = row[0] as number;
          const numePren = row[1] as string;
          const domiciliul = row[2] as string;

          // Verifică dacă există în DEPCRED
          const existaQuery = `SELECT COUNT(*) FROM DEPCRED WHERE NR_FISA = ${nrFisa}`;
          const existaResult = depcredDB.exec(existaQuery);
          const exista = existaResult[0].values[0][0] as number;

          if (exista === 0) {
            membriProblema.push({
              nrFisa,
              numePren,
              domiciliul,
              tipProblema: 'În MEMBRII, nu în DEPCRED',
              detalii: 'Date personale fără istoric tranzacții',
              ultimaTranzactie: 'Niciodată'
            });
          }
        }
      }

      setMembriNeconcordante(membriProblema);
      pushLog(`✅ Detectate ${membriProblema.length} neconcordanțe`);

    } catch (err: any) {
      pushLog(`❌ Eroare: ${err.message}`);
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [databases]);

  // Funcție pentru detectarea tuturor problemelor
  const detecteazaToateProbleme = useCallback(() => {
    detecteazaMembriInactivi();
    detecteazaMembriSolduriZero();
    detecteazaNeconcordante();
  }, [detecteazaMembriInactivi, detecteazaMembriSolduriZero, detecteazaNeconcordante]);

  // Efect pentru detectare automată la încărcare
  useEffect(() => {
    detecteazaToateProbleme();
  }, [detecteazaToateProbleme]);

  // Funcție pentru toggle selecție
  const toggleSelect = (nrFisa: number) => {
    setSelected(prev => {
      const newSet = new Set(prev);
      if (newSet.has(nrFisa)) {
        newSet.delete(nrFisa);
      } else {
        newSet.add(nrFisa);
      }
      return newSet;
    });
  };

  // Funcție pentru selectare toate
  const selectAll = () => {
    const membri = getCurrentTabMembers();
    setSelected(new Set(membri.map(m => m.nrFisa)));
  };

  // Funcție pentru deselectare toate
  const deselectAll = () => {
    setSelected(new Set());
  };

  // Obține membrii pentru tab-ul curent
  const getCurrentTabMembers = (): MembruProblema[] => {
    switch (activeTab) {
      case 'inactivi':
        return membriInactivi;
      case 'solduri-zero':
        return membriSolduriZero;
      case 'neconcordante':
        return membriNeconcordante;
      default:
        return [];
    }
  };

  // Funcție pentru lichidare în masă
  const handleLichidareInMasa = async () => {
    if (selected.size === 0) {
      pushLog("⚠️ Nu ați selectat niciun membru");
      return;
    }

    setActionType('lichidare');
    setShowConfirmDialog(true);
  };

  // Funcție pentru ștergere în masă
  const handleStergereInMasa = async () => {
    if (selected.size === 0) {
      pushLog("⚠️ Nu ați selectat niciun membru");
      return;
    }

    setActionType('stergere');
    setShowConfirmDialog(true);
  };

  // Confirmă acțiunea
  const confirmaActiune = async () => {
    setShowConfirmDialog(false);
    setLoading(true);

    try {
      assertCanWrite(databases, actionType === 'lichidare' ? 'Lichidare în masă' : 'Ștergere permanentă');

      const membriiDB = getActiveDB(databases, 'membrii');
      const depcredDB = getActiveDB(databases, 'depcred');
      const lichidatiDB = getActiveDB(databases, 'lichidati');
      const activiDB = getActiveDB(databases, 'activi');
      const inactiviDB = getActiveDB(databases, 'inactivi');

      const membriCurenti = getCurrentTabMembers().filter(m => selected.has(m.nrFisa));

      if (actionType === 'lichidare') {
        pushLog(`📝 Marchează ${membriCurenti.length} membri ca lichidați...`);

        for (const membru of membriCurenti) {
          // Opțional: Resetează soldurile în DEPCRED
          if (resetSolduri) {
            // Găsește ultima înregistrare pentru acest membru
            const ultimaInregQuery = `
              SELECT LUNA, ANUL
              FROM DEPCRED
              WHERE NR_FISA = ${membru.nrFisa}
              ORDER BY ANUL DESC, LUNA DESC
              LIMIT 1
            `;
            const ultimaInregResult = depcredDB.exec(ultimaInregQuery);

            if (ultimaInregResult.length > 0) {
              const luna = ultimaInregResult[0].values[0][0] as number;
              const an = ultimaInregResult[0].values[0][1] as number;

              // Resetează soldurile la 0
              const updateQuery = `
                UPDATE DEPCRED
                SET IMPR_SOLD = '0.00', DEP_SOLD = '0.00'
                WHERE NR_FISA = ${membru.nrFisa}
                  AND LUNA = ${luna}
                  AND ANUL = ${an}
              `;
              depcredDB.run(updateQuery);

              pushLog(`💰 Solduri resetate la 0 pentru ${membru.numePren} (${membru.nrFisa})`);
            }
          }

          // Adaugă în LICHIDATI (doar nr_fisa și data_lichidare)
          const insertQuery = `
            INSERT OR REPLACE INTO lichidati (nr_fisa, data_lichidare)
            VALUES (${membru.nrFisa}, '${new Date().toISOString().split('T')[0]}')
          `;
          lichidatiDB.run(insertQuery);

          // Șterge din ACTIVI
          activiDB.run(`DELETE FROM ACTIVI WHERE NR_FISA = ${membru.nrFisa}`);

          // Șterge din INACTIVI
          inactiviDB.run(`DELETE FROM INACTIVI WHERE NR_FISA = ${membru.nrFisa}`);

          pushLog(`✅ Lichidat: ${membru.numePren} (${membru.nrFisa})`);
        }

        pushLog(`✅ Lichidare completă: ${membriCurenti.length} membri`);

      } else if (actionType === 'stergere') {
        pushLog(`🗑️ Ștergere permanentă ${membriCurenti.length} membri...`);

        for (const membru of membriCurenti) {
          // Șterge din toate bazele
          membriiDB.run(`DELETE FROM MEMBRII WHERE NR_FISA = ${membru.nrFisa}`);
          depcredDB.run(`DELETE FROM DEPCRED WHERE NR_FISA = ${membru.nrFisa}`);
          activiDB.run(`DELETE FROM ACTIVI WHERE NR_FISA = ${membru.nrFisa}`);
          inactiviDB.run(`DELETE FROM INACTIVI WHERE NR_FISA = ${membru.nrFisa}`);
          lichidatiDB.run(`DELETE FROM LICHIDATI WHERE NR_FISA = ${membru.nrFisa}`);

          pushLog(`🗑️ Șters: ${membru.numePren} (${membru.nrFisa})`);
        }

        pushLog(`✅ Ștergere completă: ${membriCurenti.length} membri`);
      }

      // Resetează selecția și checkbox-ul
      setSelected(new Set());
      setResetSolduri(false);

      // Re-detectează probleme
      detecteazaToateProbleme();

    } catch (err: any) {
      pushLog(`❌ Eroare: ${err.message}`);
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const membriCurenti = getCurrentTabMembers();
  const totalSelectat = selected.size;

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <Card>
        <CardHeader className="bg-gradient-to-r from-blue-600 to-blue-700 text-white md:bg-transparent md:text-inherit">
          <CardTitle className="flex items-center gap-2">
            <UserX className="h-6 w-6" />
            Lichidare Membri - Detecție Automată
            <span className="text-sm font-normal text-gray-400 md:text-gray-500">({currency})</span>
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Configurare parametri */}
          <div className="flex flex-col md:flex-row gap-4 items-end">
            <div className="flex-1">
              <Label htmlFor="luniInactivitate">Luni de inactivitate (limită)</Label>
              <input
                id="luniInactivitate"
                type="number"
                min="1"
                max="60"
                value={luniInactivitate}
                onChange={(e) => setLuniInactivitate(parseInt(e.target.value) || 12)}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>

            <Button
              onClick={detecteazaToateProbleme}
              disabled={loading}
              className="flex items-center gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Reîmprospătează Detecția
            </Button>
          </div>

          {/* Tab-uri (butoane categorii) */}
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => setActiveTab('inactivi')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                activeTab === 'inactivi'
                  ? 'bg-amber-500 hover:bg-amber-600 text-white'
                  : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
              }`}
            >
              <Clock className="h-4 w-4" />
              Membri Inactivi ({membriInactivi.length})
            </button>

            <button
              onClick={() => setActiveTab('solduri-zero')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                activeTab === 'solduri-zero'
                  ? 'bg-blue-500 hover:bg-blue-600 text-white'
                  : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
              }`}
            >
              <Wallet className="h-4 w-4" />
              Solduri Zero ({membriSolduriZero.length})
            </button>

            <button
              onClick={() => setActiveTab('neconcordante')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                activeTab === 'neconcordante'
                  ? 'bg-rose-500 hover:bg-rose-600 text-white'
                  : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
              }`}
            >
              <Database className="h-4 w-4" />
              Neconcordanțe ({membriNeconcordante.length})
            </button>
          </div>

          {/* Acțiuni selecție */}
          {membriCurenti.length > 0 && (
            <div className="flex flex-wrap gap-2 items-center">
              <Button
                variant="outline"
                size="sm"
                onClick={selectAll}
                className="flex items-center gap-1"
              >
                <CheckSquare className="h-4 w-4" />
                Selectează Tot
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={deselectAll}
                className="flex items-center gap-1"
              >
                <Square className="h-4 w-4" />
                Deselectează Tot
              </Button>

              <div className="flex-1 text-sm text-gray-600">
                {totalSelectat > 0 && `${totalSelectat} selectați`}
              </div>

              {totalSelectat > 0 && (
                <>
                  <Button
                    onClick={handleLichidareInMasa}
                    disabled={loading}
                    className="flex items-center gap-2 bg-orange-600 hover:bg-orange-700"
                  >
                    <Archive className="h-4 w-4" />
                    Marchează ca Lichidați ({totalSelectat})
                  </Button>

                  <Button
                    onClick={handleStergereInMasa}
                    disabled={loading}
                    variant="destructive"
                    className="flex items-center gap-2"
                  >
                    <Trash2 className="h-4 w-4" />
                    Șterge Permanent ({totalSelectat})
                  </Button>
                </>
              )}
            </div>
          )}

          {/* Tabel membri */}
          {membriCurenti.length === 0 ? (
            <Alert>
              <AlertDescription>
                {loading ? (
                  <span className="flex items-center gap-2">
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Se detectează probleme...
                  </span>
                ) : (
                  `✅ Nu există membri cu probleme în categoria "${activeTab}"`
                )}
              </AlertDescription>
            </Alert>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="border p-2 w-12">
                      <input
                        type="checkbox"
                        checked={totalSelectat === membriCurenti.length}
                        onChange={(e) => {
                          if (e.target.checked) {
                            selectAll();
                          } else {
                            deselectAll();
                          }
                        }}
                        className="h-4 w-4"
                      />
                    </th>
                    <th className="border p-2 text-left">Nr. Fișă</th>
                    <th className="border p-2 text-left">Nume și Prenume</th>
                    <th className="border p-2 text-left">Adresă</th>
                    <th className="border p-2 text-left">Tip Problemă</th>
                    <th className="border p-2 text-left">Detalii</th>
                    <th className="border p-2 text-left">Ultima Tranzacție</th>
                    {activeTab === 'solduri-zero' && (
                      <>
                        <th className="border p-2 text-right">Sold Împrumut</th>
                        <th className="border p-2 text-right">Sold Depuneri</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {membriCurenti.map((membru) => (
                    <tr
                      key={membru.nrFisa}
                      className={`hover:bg-gray-50 ${selected.has(membru.nrFisa) ? 'bg-blue-50' : ''}`}
                    >
                      <td className="border p-2">
                        <input
                          type="checkbox"
                          checked={selected.has(membru.nrFisa)}
                          onChange={() => toggleSelect(membru.nrFisa)}
                          className="h-4 w-4"
                        />
                      </td>
                      <td className="border p-2">{membru.nrFisa}</td>
                      <td className="border p-2">{membru.numePren}</td>
                      <td className="border p-2 text-sm">{membru.domiciliul}</td>
                      <td className="border p-2">
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                          <AlertTriangle className="h-3 w-3" />
                          {membru.tipProblema}
                        </span>
                      </td>
                      <td className="border p-2 text-sm text-gray-600">{membru.detalii}</td>
                      <td className="border p-2 text-center">
                        {membru.ultimaTranzactie || 'N/A'}
                      </td>
                      {activeTab === 'solduri-zero' && (
                        <>
                          <td className="border p-2 text-right font-mono">
                            {membru.soldImprumut || '0.00'}
                          </td>
                          <td className="border p-2 text-right font-mono">
                            {membru.soldDepuneri || '0.00'}
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Logs */}
          {logs.length > 0 && (
            <div className="mt-6">
              <Label className="mb-2 block">Jurnal Operațiuni:</Label>
              <div className="bg-gray-900 text-green-400 p-4 rounded font-mono text-sm max-h-64 overflow-y-auto">
                {logs.map((log, i) => (
                  <div key={i}>{log}</div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog confirmare */}
      {showConfirmDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <Card className="max-w-md w-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-red-600">
                <AlertTriangle className="h-6 w-6" />
                Confirmare {actionType === 'lichidare' ? 'Lichidare' : 'Ștergere'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert className="bg-red-50 border-red-200">
                <AlertDescription>
                  {actionType === 'lichidare' ? (
                    <>
                      Sunteți pe cale să <strong>lichidați {selected.size} membri</strong>.
                      <br />
                      Aceștia vor fi mutați în baza LICHIDATI și eliminați din ACTIVI/INACTIVI.
                      <br />
                      <span className="text-gray-600 text-sm mt-2 block">
                        Istoricul din MEMBRII și DEPCRED va fi păstrat pentru audit.
                      </span>
                    </>
                  ) : (
                    <>
                      Sunteți pe cale să <strong>ștergeți permanent {selected.size} membri</strong>.
                      <br />
                      <span className="text-red-600 font-bold">
                        Această acțiune este IREVERSIBILĂ!
                      </span>
                      <br />
                      Toate datele (MEMBRII, DEPCRED, etc.) vor fi eliminate definitiv.
                    </>
                  )}
                </AlertDescription>
              </Alert>

              {/* Checkbox resetare solduri - doar pentru lichidare */}
              {actionType === 'lichidare' && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={resetSolduri}
                      onChange={(e) => setResetSolduri(e.target.checked)}
                      className="mt-1 h-4 w-4"
                    />
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">
                        Setează soldurile finale la 0
                      </div>
                      <div className="text-sm text-gray-600">
                        Resetează IMPR_SOLD și DEP_SOLD la 0.00 în ultima înregistrare DEPCRED.
                        <br />
                        <span className="text-xs italic">
                          Folosește când membrul a achitat toate obligațiile sau i s-a iertat datoria.
                        </span>
                      </div>
                    </div>
                  </label>
                </div>
              )}

              <div className="flex gap-3">
                <Button
                  onClick={() => {
                    setShowConfirmDialog(false);
                    setResetSolduri(false); // Resetează checkbox când se anulează
                  }}
                  variant="outline"
                  className="flex-1"
                >
                  Anulează
                </Button>
                <Button
                  onClick={confirmaActiune}
                  variant="destructive"
                  className="flex-1"
                >
                  {actionType === 'lichidare' ? 'Confirmă Lichidarea' : 'Confirmă Ștergerea'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
