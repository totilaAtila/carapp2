import { useState, useEffect } from 'react';
import { getAccessMode } from '../services/databaseManager';
import type { DBSet } from '../services/databaseManager';

interface Props {
  databases: DBSet;
  onCurrencyChange: (currency: "RON" | "EUR") => void;
}

export default function CurrencyToggle({ databases, onCurrencyChange }: Props) {
  const access = getAccessMode(databases);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  // Ascunde toggle dacă nu există baze EUR
  if (!access.showToggle) {
    return null;
  }

  const handleSwitch = (currency: "RON" | "EUR") => {
    if (databases.activeCurrency === currency) return; // Deja pe această monedă

    onCurrencyChange(currency);

    // Pregătește mesajul pentru toast
    const newAccess = getAccessMode({ ...databases, activeCurrency: currency });
    const canWrite = currency === "RON" ? newAccess.canWriteRon : newAccess.canWriteEur;

    let message = '';
    if (canWrite) {
      message = `✅ ${currency} - Citire + Scriere`;
    } else {
      message = `👁️ ${currency} - Doar Citire (Arhivă)`;
    }

    setToastMessage(message);
    setShowToast(true);
  };

  // Auto-hide toast după 3 secunde
  useEffect(() => {
    if (showToast) {
      const timer = setTimeout(() => {
        setShowToast(false);
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [showToast]);

  return (
    <>
      {/* Toggle Compact - fără text suplimentar */}
      <div className="flex rounded-lg overflow-hidden border border-slate-600 bg-slate-800/90 backdrop-blur-sm">
        <button
          onClick={() => handleSwitch("RON")}
          disabled={databases.activeCurrency === "RON"}
          className={`
            px-3 py-1.5 text-lg transition-all duration-200
            ${databases.activeCurrency === "RON"
              ? "bg-blue-600 text-white cursor-default shadow-lg shadow-blue-600/50"
              : "bg-slate-700 text-slate-300 hover:bg-slate-600 active:bg-slate-500"
            }
          `}
          aria-label="RON"
        >
          <span role="img" aria-hidden="true">
            🇷🇴
          </span>
          <span className="sr-only">RON</span>
        </button>

        <button
          onClick={() => handleSwitch("EUR")}
          disabled={databases.activeCurrency === "EUR"}
          className={`
            px-3 py-1.5 text-lg transition-all duration-200 border-l border-slate-600
            ${databases.activeCurrency === "EUR"
              ? "bg-green-600 text-white cursor-default shadow-lg shadow-green-600/50"
              : "bg-slate-700 text-slate-300 hover:bg-slate-600 active:bg-slate-500"
            }
          `}
          aria-label="EUR"
        >
          <span role="img" aria-hidden="true">
            🇪🇺
          </span>
          <span className="sr-only">EUR</span>
        </button>
      </div>

      {/* Toast Modal - Informativ 3 secunde */}
      {showToast && (
        <div
          className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 animate-fade-in"
          style={{
            animation: 'fadeInOut 3s ease-in-out'
          }}
        >
          <div className="bg-slate-900/95 backdrop-blur-md border-2 border-slate-600 rounded-lg shadow-2xl px-6 py-3">
            <div className="flex items-center gap-3">
              <div className="text-lg">
                {toastMessage.startsWith('✅') ? '✅' : '👁️'}
              </div>
              <div className="text-sm font-medium text-white whitespace-nowrap">
                {toastMessage.replace(/^(✅|👁️)\s*/, '')}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Keyframes pentru animație */}
      <style>{`
        @keyframes fadeInOut {
          0% {
            opacity: 0;
            transform: translateX(-50%) translateY(10px);
          }
          10% {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
          }
          90% {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
          }
          100% {
            opacity: 0;
            transform: translateX(-50%) translateY(-10px);
          }
        }
      `}</style>
    </>
  );
}
