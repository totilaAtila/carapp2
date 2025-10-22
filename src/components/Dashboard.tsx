import type { DBSet } from '../services/databaseManager';

interface Props {
  databases: DBSet;
  onModuleSelect: (module: 'generare-luna') => void;
  onChangeDatabaseSource: () => void;
}

export default function Dashboard({ databases, onModuleSelect, onChangeDatabaseSource }: Props) {
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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-green-50 rounded-lg p-4 border border-green-200">
            <div className="text-green-600 text-2xl mb-2">✓</div>
            <div className="font-semibold text-slate-800">MEMBRII</div>
            <div className="text-sm text-slate-600">Încărcat</div>
          </div>
          <div className="bg-green-50 rounded-lg p-4 border border-green-200">
            <div className="text-green-600 text-2xl mb-2">✓</div>
            <div className="font-semibold text-slate-800">DEPCRED</div>
            <div className="text-sm text-slate-600">Încărcat</div>
          </div>
          <div className={`rounded-lg p-4 border ${databases.lichidati ? 'bg-green-50 border-green-200' : 'bg-blue-50 border-blue-200'}`}>
            <div className={`text-2xl mb-2 ${databases.lichidati ? 'text-green-600' : 'text-blue-600'}`}>
              {databases.lichidati ? '✓' : 'ℹ'}
            </div>
            <div className="font-semibold text-slate-800">LICHIDATI</div>
            <div className="text-sm text-slate-600">{databases.lichidati ? 'Încărcat' : 'Opțional'}</div>
          </div>
          <div className={`rounded-lg p-4 border ${databases.activi ? 'bg-green-50 border-green-200' : 'bg-blue-50 border-blue-200'}`}>
            <div className={`text-2xl mb-2 ${databases.activi ? 'text-green-600' : 'text-blue-600'}`}>
              {databases.activi ? '✓' : 'ℹ'}
            </div>
            <div className="font-semibold text-slate-800">ACTIVI</div>
            <div className="text-sm text-slate-600">{databases.activi ? 'Încărcat' : 'Opțional'}</div>
          </div>
        </div>

        {/* Info despre sursa datelor */}
        <div className="mt-4 p-3 bg-slate-50 rounded-lg text-sm">
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

          {/* Module viitoare - Disabled */}
          <div className="bg-slate-100 border-2 border-dashed border-slate-300 rounded-xl p-6 text-slate-400 cursor-not-allowed">
            <div className="text-4xl mb-3 opacity-50">📊</div>
            <div className="text-xl font-bold mb-2">Rapoarte</div>
            <div className="text-sm">Generare rapoarte lunare și anuale</div>
            <div className="mt-3 text-xs">🔒 În curând...</div>
          </div>

          <div className="bg-slate-100 border-2 border-dashed border-slate-300 rounded-xl p-6 text-slate-400 cursor-not-allowed">
            <div className="text-4xl mb-3 opacity-50">💰</div>
            <div className="text-xl font-bold mb-2">Împrumuturi</div>
            <div className="text-sm">Gestiune împrumuturi și rate</div>
            <div className="mt-3 text-xs">🔒 În curând...</div>
          </div>

          <div className="bg-slate-100 border-2 border-dashed border-slate-300 rounded-xl p-6 text-slate-400 cursor-not-allowed">
            <div className="text-4xl mb-3 opacity-50">👥</div>
            <div className="text-xl font-bold mb-2">Membri</div>
            <div className="text-sm">Gestiune membri și cotizații</div>
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