import { persistDatabases, loadDatabasesFromUpload } from '../services/databaseManager';
import { Menu } from 'lucide-react';

interface Props {
  databases: any;
  onDatabasesReloaded: (dbs: any) => void;
  onMenuToggle: () => void;
}

export default function Taskbar({ databases, onDatabasesReloaded, onMenuToggle }: Props) {
  async function handleSave() {
    try {
      await persistDatabases(databases);
      alert('✔️ Bazele de date au fost salvate cu succes.');
    } catch (err: any) {
      alert('❌ Eroare la salvare: ' + err.message);
    }
  }

  async function handleReload() {
    try {
      const newDbs = await loadDatabasesFromUpload();
      onDatabasesReloaded(newDbs);
      alert('📤 Bazele de date au fost reîncărcate cu succes.');
    } catch (err: any) {
      alert('❌ Eroare la reîncărcare: ' + err.message);
    }
  }

  return (
    <div
      className="
        fixed bottom-0 left-0 w-full
        bg-slate-800/70 backdrop-blur-md
        text-white text-sm flex justify-between
        items-center px-6 py-2
        border-t border-slate-700 shadow-inner z-50
      "
    >
      {/* Buton meniu lateral: fără textul 'Meniu' */}
      <button
        onClick={onMenuToggle}
        className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 rounded-xl px-3 py-2"
        aria-label="Deschide/închide meniul lateral"
        title="Meniu"
      >
        <Menu className="w-5 h-5" />
      </button>

      <div className="flex gap-4">
        <button
          onClick={handleReload}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 rounded-xl px-4 py-2 transition-all active:scale-95 shadow-lg"
        >
          📤 Reîncarcă
        </button>

        <button
          onClick={handleSave}
          className="flex items-center gap-2 bg-green-600 hover:bg-green-700 rounded-xl px-4 py-2 transition-all active:scale-95 shadow-lg"
        >
          💾 Salvează
        </button>
      </div>
    </div>
  );
}
