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
        w-full h-[60px]
        bg-slate-800/90 backdrop-blur-md
        text-white text-sm 
        flex justify-between items-center 
        px-4 md:px-6
        border-t border-slate-700 
        shadow-lg
      "
    >
      {/* Buton meniu lateral */}
      <button
        onClick={onMenuToggle}
        className="
          flex items-center gap-2 
          bg-slate-700 hover:bg-slate-600 
          rounded-xl px-3 py-2
          transition-all active:scale-95
        "
      >
        <Menu className="w-5 h-5" />
        <span className="hidden sm:inline">Meniu</span>
      </button>

      <div className="flex gap-3">
        <button
          onClick={handleReload}
          className="
            flex items-center gap-2 
            bg-blue-600 hover:bg-blue-700 
            rounded-xl px-4 py-2 
            transition-all active:scale-95 
            shadow-lg
          "
        >
          <span>📤</span>
          <span className="hidden sm:inline">Reîncarcă</span>
        </button>

        <button
          onClick={handleSave}
          className="
            flex items-center gap-2 
            bg-green-600 hover:bg-green-700 
            rounded-xl px-4 py-2 
            transition-all active:scale-95 
            shadow-lg
          "
        >
          <span>💾</span>
          <span className="hidden sm:inline">Salvează</span>
        </button>
      </div>
    </div>
  );
}