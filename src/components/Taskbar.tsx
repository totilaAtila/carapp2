import { persistDatabases } from '../services/databaseManager';
import type { DBSet } from '../services/databaseManager';
import { Menu, Home, Calendar, BarChart2, Users, UserMinus, Coins, FileText, ArrowLeftRight } from 'lucide-react';
import CurrencyToggle from './CurrencyToggle';

interface Props {
  databases: DBSet;
  onModuleSelect: (moduleId: string) => void;
  onCurrencyChange: (currency: "RON" | "EUR") => void;
  menuOpen: boolean;
  onMenuToggle: () => void;
}

export default function Taskbar({
  databases,
  onModuleSelect,
  onCurrencyChange,
  menuOpen,
  onMenuToggle,
}: Props) {
  // + Statistici în meniu
  const menuItems = [
    { id: "sume-lunare",        icon: BarChart2, label: "Sume lunare" },
    { id: "generare-luna",      icon: Calendar,  label: "Generare lună" },
    { id: "vizualizare-lunara", icon: Home,      label: "Vizualizare lunară" },
    { id: "vizualizare-anuala", icon: BarChart2, label: "Vizualizare anuală" },
    { id: "vizualizare-trimestriala", icon: Calendar, label: "Vizualizare trimestrială" },
    { id: "adauga-membru",      icon: Users,     label: "Adăugare membru" },
    { id: "sterge-membru",      icon: UserMinus, label: "Ștergere membru" },
    { id: "dividende",          icon: Coins,     label: "Dividende" },
    { id: "statistici",         icon: BarChart2, label: "Statistici" },
    { id: "listari",            icon: FileText,  label: "Chitanțe" },
    { id: "conversion",         icon: ArrowLeftRight, label: "Conversie RON→EUR" },
  ];

  function handleModuleClick(moduleId: string) {
    onModuleSelect(moduleId);
    onMenuToggle(); // Închide meniul după selectare
  }

  async function handleSave() {
    try {
      await persistDatabases(databases);
      alert('✔️ Bazele de date au fost salvate cu succes.');
    } catch (err: any) {
      alert('❌ Eroare la salvare: ' + err.message);
    }
  }

  return (
    <>
      {/* Popup Menu - Apare deasupra hamburger-ului */}
      {menuOpen && (
        <>
          {/* Overlay pentru a închide meniul când apeși în afară */}
          <div className="fixed inset-0 z-40" onClick={onMenuToggle} />

          {/* Popup Menu Card */}
          <div
            className="
              fixed bottom-16 left-4 z-50
              bg-slate-900/95 backdrop-blur-md
              text-white rounded-xl shadow-2xl
              border border-slate-700
              w-64 max-h-[500px] overflow-y-auto
              animate-in slide-in-from-bottom-5 duration-200
            "
          >
            {/* Header */}
            <div className="px-4 py-3 border-b border-slate-700">
              <h2 className="font-semibold text-sm text-slate-300">Meniu Aplicație</h2>
            </div>

            {/* Menu Items */}
            <div className="py-2">
              {menuItems.map(({ id, icon: Icon, label }) => (
                <button
                  key={id}
                  onClick={() => handleModuleClick(id)}
                  className="
                    w-full flex items-center gap-3 px-4 py-3
                    hover:bg-slate-700/50 transition-colors
                    text-left text-sm
                  "
                >
                  <Icon className="w-5 h-5 text-slate-400" />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Taskbar - Fixed Bottom */}
      <div
        className="
          fixed bottom-0 left-0 w-full
          bg-slate-800/70 backdrop-blur-md
          text-white text-sm flex justify-between
          items-center px-6 py-2
          border-t border-slate-700 shadow-inner z-50
        "
      >
        {/* Buton hamburger menu - Colțul stânga jos */}
        <button
          onClick={onMenuToggle}
          className={`
            flex items-center gap-2 rounded-xl px-3 py-2 transition-colors
            ${menuOpen ? 'bg-slate-600' : 'bg-slate-700 hover:bg-slate-600'}
          `}
          aria-label="Deschide/închide meniul"
          title="Meniu"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Currency Toggle - Centru */}
        <CurrencyToggle databases={databases} onCurrencyChange={onCurrencyChange} />

        <div className="flex gap-4">
          <button
            onClick={handleSave}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 rounded-xl px-4 py-2 transition-all active:scale-95 shadow-lg"
          >
            Salvează
          </button>
        </div>
      </div>
    </>
  );
}
