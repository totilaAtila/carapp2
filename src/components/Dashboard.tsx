import type { DBSet } from '../services/databaseManager';

type EuroDbKey = 'membriieur' | 'depcredeur' | 'activieur' | 'inactivieur' | 'lichidatieur';

const EURO_DATABASES: Array<{ key: EuroDbKey; label: string }> = [
  { key: 'membriieur', label: 'MEMBRIIEUR.db' },
  { key: 'depcredeur', label: 'DEPCREDEUR.db' },
  { key: 'activieur', label: 'activiEUR.db' },
  { key: 'inactivieur', label: 'INACTIVIEUR.db' },
  { key: 'lichidatieur', label: 'LICHIDATIEUR.db' },
];

interface Props {
  databases: DBSet;
  onModuleSelect: (module: 'generare-luna' | 'vizualizare-lunara' | 'sume-lunare' | 'adauga-membru' | 'sterge-membru') => void;
  onChangeDatabaseSource: () => void;
}

export default function Dashboard({ databases, onModuleSelect, onChangeDatabaseSource }: Props) {
  const euroStatuses = EURO_DATABASES.map(({ key, label }) => {
    const databaseInstance = databases[key];

    return {
      key,
      label,
      isLoaded: Boolean(databaseInstance),
    };
  });

  const hasAnyEuroDatabase = euroStatuses.some(({ isLoaded }) => isLoaded);
  const hasCompleteEuroSet = euroStatuses.every(({ isLoaded }) => isLoaded);
  const missingEuroDatabases = euroStatuses
    .filter(({ isLoaded }) => !isLoaded)
    .map(({ label }) => label);

  return (
    <div className="min-h-screen bg-slate-100 p-6">
      {/* Header */}
      <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-800">CARapp Petroșani</h1>
            <p className="text-slate-600">Casa de Ajutor Reciproc</p>
          </div>
          <button
            onClick={onChangeDatabaseSource}
            className="bg-slate-600 hover:bg-slate-700 text-white px-4 py-2 rounded-lg transition-colors"
          >
            🔄 Schimbă sursa datelor
          </button>
        </div>
      </div>

      {/* Status baze de date */}
      <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
        <h2 className="text-xl font-bold mb-4">📊 Status Baze de Date</h2>

        {/* Listă baze de date RON */}
        <div className="mb-4">
          <div className="text-sm font-semibold text-slate-700 mb-2">🇷🇴 Baze de date RON (Obligatorii):</div>
          <div className="space-y-2">
            <div className="flex items-center gap-3 p-2 bg-green-50 rounded-lg border border-green-200">
              <div className="text-green-600 text-lg">✓</div>
              <div className="font-medium text-slate-800">MEMBRII.db</div>
              <div className="ml-auto text-xs text-green-700">Încărcat</div>
            </div>
            <div className="flex items-center gap-3 p-2 bg-green-50 rounded-lg border border-green-200">
              <div className="text-green-600 text-lg">✓</div>
              <div className="font-medium text-slate-800">DEPCRED.db</div>
              <div className="ml-auto text-xs text-green-700">Încărcat</div>
            </div>
            <div className="flex items-center gap-3 p-2 bg-green-50 rounded-lg border border-green-200">
              <div className="text-green-600 text-lg">✓</div>
              <div className="font-medium text-slate-800">activi.db</div>
              <div className="ml-auto text-xs text-orange-600">lowercase!</div>
            </div>
            <div className="flex items-center gap-3 p-2 bg-green-50 rounded-lg border border-green-200">
              <div className="text-green-600 text-lg">✓</div>
              <div className="font-medium text-slate-800">INACTIVI.db</div>
              <div className="ml-auto text-xs text-green-700">Încărcat</div>
            </div>
            <div className="flex items-center gap-3 p-2 bg-green-50 rounded-lg border border-green-200">
              <div className="text-green-600 text-lg">✓</div>
              <div className="font-medium text-slate-800">LICHIDATI.db</div>
              <div className="ml-auto text-xs text-green-700">Încărcat</div>
            </div>
            <div className="flex items-center gap-3 p-2 bg-green-50 rounded-lg border border-green-200">
              <div className="text-green-600 text-lg">✓</div>
              <div className="font-medium text-slate-800">CHITANTE.db</div>
              <div className="ml-auto text-xs text-green-700">Încărcat</div>
            </div>
          </div>
        </div>

        {/* Listă baze de date EUR */}
        <div className="mb-4">
          <div className="text-sm font-semibold text-slate-700 mb-2">🇪🇺 Baze de date EUR (Opționale):</div>
          <div className="space-y-2">
            {euroStatuses.map(({ key, label, isLoaded }) => (
              <div
                key={key}
                className={`flex items-center gap-3 p-2 rounded-lg border ${
                  isLoaded
                    ? 'bg-green-50 border-green-200'
                    : 'bg-blue-50 border-blue-200'
                }`}
              >
                <div className={`text-lg ${isLoaded ? 'text-green-600' : 'text-blue-600'}`}>
                  {isLoaded ? '✓' : 'ℹ'}
                </div>
                <div className="font-medium text-slate-800">{label}</div>
                <div className={`ml-auto text-xs ${isLoaded ? 'text-green-700' : 'text-blue-700'}`}>
                  {isLoaded ? 'Încărcat' : 'Nedisponibil'}
                </div>
              </div>
            ))}
            {!hasAnyEuroDatabase && (
              <div className="flex items-center gap-3 p-2 bg-blue-50 rounded-lg border border-blue-200">
                <div className="text-blue-600 text-lg">ℹ</div>
                <div className="text-slate-600 text-sm">Bazele de date EUR nu sunt încărcate (opțional)</div>
              </div>
            )}
            {hasAnyEuroDatabase && !hasCompleteEuroSet && (
              <div className="flex flex-col gap-1 p-2 bg-amber-50 rounded-lg border border-amber-200 text-xs text-amber-700">
                <div className="flex items-center gap-2">
                  <div className="text-amber-500 text-lg">⚠️</div>
                  <span>Setul EUR este incomplet. Verificați fișierele lipsă înainte de a continua.</span>
                </div>
                <div className="pl-7 text-amber-600">
                  Lipsesc: {missingEuroDatabases.join(', ')}
                </div>
              </div>
            )}
          </div>
          <div className="mt-2 p-2 bg-slate-100 rounded-lg text-xs text-slate-600">
            💡 <span className="font-medium">CHITANTE.db</span> este comună pentru RON și EUR
          </div>
        </div>

        {/* Info despre sursa datelor */}
        <div className="p-3 bg-slate-50 rounded-lg text-sm">
          <span className="font-semibold">📁 Sursa datelor:</span> {' '}
          {databases.source === 'filesystem' ? (
            <span className="text-green-700">🗂️ Dosar local (sincronizare automată)</span>
          ) : (
            <span className="text-blue-700">📤 Fișiere încărcate (salvare manuală)</span>
          )}
        </div>
      </div>

      {/* Module */}
      <div className="bg-white rounded-xl shadow-lg p-6">
        <h2 className="text-xl font-bold mb-4">🧩 Module Disponibile</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Generare Lună - Activ */}
          <button
            onClick={() => onModuleSelect('generare-luna')}
            className="bg-gradient-to-br from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white rounded-xl p-6 text-left transition-all transform hover:scale-105 shadow-lg"
          >
            <div className="text-4xl mb-3">📅</div>
            <div className="text-xl font-bold mb-2">Generare Lună</div>
            <div className="text-green-100 text-sm">
              Generează date lunare pentru membri activi
            </div>
            <div className="mt-3 text-xs text-green-200">
              ✅ Activ și funcțional
            </div>
          </button>

          {/* Vizualizare Lunară - Activ */}
          <button
            onClick={() => onModuleSelect('vizualizare-lunara')}
            className="bg-gradient-to-br from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white rounded-xl p-6 text-left transition-all transform hover:scale-105 shadow-lg"
          >
            <div className="text-4xl mb-3">📊</div>
            <div className="text-xl font-bold mb-2">Vizualizare Lunară</div>
            <div className="text-purple-100 text-sm">
              Vizualizare tranzacții lunare cu export PDF/Excel
            </div>
            <div className="mt-3 text-xs text-purple-200">
              ✅ Activ și funcțional
            </div>
          </button>

          {/* Sume Lunare - Activ */}
          <button
            onClick={() => onModuleSelect('sume-lunare')}
            className="bg-gradient-to-br from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-xl p-6 text-left transition-all transform hover:scale-105 shadow-lg"
          >
            <div className="text-4xl mb-3">💰</div>
            <div className="text-xl font-bold mb-2">Sume Lunare</div>
            <div className="text-blue-100 text-sm">
              Gestiune istoric financiar și modificare tranzacții
            </div>
            <div className="mt-3 text-xs text-blue-200">
              ✅ Activ și funcțional
            </div>
          </button>

          {/* Adăugare Membru - Activ */}
          <button
            onClick={() => onModuleSelect('adauga-membru')}
            className="bg-gradient-to-br from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white rounded-xl p-6 text-left transition-all transform hover:scale-105 shadow-lg"
          >
            <div className="text-4xl mb-3">👤</div>
            <div className="text-xl font-bold mb-2">Adăugare Membru</div>
            <div className="text-orange-100 text-sm">
              Adăugare membri noi sau modificare date existente
            </div>
            <div className="mt-3 text-xs text-orange-200">
              ✅ Activ și funcțional
            </div>
          </button>

          {/* Ștergere Membru - Activ */}
          <button
            onClick={() => onModuleSelect('sterge-membru')}
            className="bg-gradient-to-br from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white rounded-xl p-6 text-left transition-all transform hover:scale-105 shadow-lg"
          >
            <div className="text-4xl mb-3">🗑️</div>
            <div className="text-xl font-bold mb-2">Ștergere Membru</div>
            <div className="text-red-100 text-sm">
              Ștergere membri din sistem (acțiune ireversibilă)
            </div>
            <div className="mt-3 text-xs text-red-200">
              ✅ Activ și funcțional
            </div>
          </button>

          {/* Module viitoare - Disabled */}
          <div className="bg-slate-100 border-2 border-dashed border-slate-300 rounded-xl p-6 text-slate-400 cursor-not-allowed">
            <div className="text-4xl mb-3 opacity-50">📊</div>
            <div className="text-xl font-bold mb-2">Vizualizare Anuală</div>
            <div className="text-sm">Rapoarte anuale membri</div>
            <div className="mt-3 text-xs">🔒 În curând...</div>
          </div>

          <div className="bg-slate-100 border-2 border-dashed border-slate-300 rounded-xl p-6 text-slate-400 cursor-not-allowed">
            <div className="text-4xl mb-3 opacity-50">💰</div>
            <div className="text-xl font-bold mb-2">Dividende</div>
            <div className="text-sm">Calcul și distribuire dividende</div>
            <div className="mt-3 text-xs">🔒 În curând...</div>
          </div>

          <div className="bg-slate-100 border-2 border-dashed border-slate-300 rounded-xl p-6 text-slate-400 cursor-not-allowed">
            <div className="text-4xl mb-3 opacity-50">📈</div>
            <div className="text-xl font-bold mb-2">Statistici</div>
            <div className="text-sm">Analize și grafice</div>
            <div className="mt-3 text-xs">🔒 În curând...</div>
          </div>

          <div className="bg-slate-100 border-2 border-dashed border-slate-300 rounded-xl p-6 text-slate-400 cursor-not-allowed">
            <div className="text-4xl mb-3 opacity-50">⚙️</div>
            <div className="text-xl font-bold mb-2">Setări</div>
            <div className="text-sm">Configurare aplicație</div>
            <div className="mt-3 text-xs">🔒 În curând...</div>
          </div>
        </div>
      </div>
    </div>
  );
}