import { getAccessMode } from '../services/databaseManager';
import type { DBSet } from '../services/databaseManager';

interface Props {
  databases: DBSet;
  onCurrencyChange: (currency: "RON" | "EUR") => void;
}

export default function CurrencyToggle({ databases, onCurrencyChange }: Props) {
  const access = getAccessMode(databases);

  // Ascunde toggle dacă nu există baze EUR
  if (!access.showToggle) {
    return null;
  }

  const handleSwitch = (currency: "RON" | "EUR") => {
    if (databases.activeCurrency === currency) return; // Deja pe această monedă
    onCurrencyChange(currency);
  };

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-slate-800/90 rounded-lg border border-slate-600/50 backdrop-blur-sm">
      {/* Label */}
      <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">
        Monedă:
      </span>

      {/* Toggle Buttons */}
      <div className="flex rounded-lg overflow-hidden border border-slate-600">
        <button
          onClick={() => handleSwitch("RON")}
          disabled={databases.activeCurrency === "RON"}
          className={`
            px-4 py-1.5 font-bold text-sm transition-all duration-200
            ${databases.activeCurrency === "RON"
              ? "bg-blue-600 text-white cursor-default shadow-lg shadow-blue-600/50"
              : "bg-slate-700 text-slate-300 hover:bg-slate-600 active:bg-slate-500"
            }
          `}
        >
          RON
        </button>

        <button
          onClick={() => handleSwitch("EUR")}
          disabled={databases.activeCurrency === "EUR"}
          className={`
            px-4 py-1.5 font-bold text-sm transition-all duration-200 border-l border-slate-600
            ${databases.activeCurrency === "EUR"
              ? "bg-green-600 text-white cursor-default shadow-lg shadow-green-600/50"
              : "bg-slate-700 text-slate-300 hover:bg-slate-600 active:bg-slate-500"
            }
          `}
        >
          EUR
        </button>
      </div>

      {/* Status Badge */}
      <div className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-slate-700/50 border border-slate-600/30">
        {access.canWriteRon || access.canWriteEur ? (
          <>
            <span className="text-green-400 text-sm">✅</span>
            <span className="text-xs font-medium text-green-300">Citire + Scriere</span>
          </>
        ) : (
          <>
            <span className="text-orange-400 text-sm">👁️</span>
            <span className="text-xs font-medium text-orange-300">Doar Citire</span>
          </>
        )}
      </div>
    </div>
  );
}
