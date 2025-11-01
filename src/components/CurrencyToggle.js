import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useEffect } from 'react';
import { getAccessMode } from '../services/databaseManager';
export default function CurrencyToggle({ databases, onCurrencyChange }) {
    const access = getAccessMode(databases);
    const [showToast, setShowToast] = useState(false);
    const [toastMessage, setToastMessage] = useState('');
    // Ascunde toggle dacă nu există baze EUR
    if (!access.showToggle) {
        return null;
    }
    const handleSwitch = (currency) => {
        if (databases.activeCurrency === currency)
            return; // Deja pe această monedă
        onCurrencyChange(currency);
        // Pregătește mesajul pentru toast
        const newAccess = getAccessMode({ ...databases, activeCurrency: currency });
        const canWrite = currency === "RON" ? newAccess.canWriteRon : newAccess.canWriteEur;
        let message = '';
        if (canWrite) {
            message = `✅ ${currency} - Citire + Scriere`;
        }
        else {
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
    return (_jsxs(_Fragment, { children: [_jsxs("div", { className: "flex rounded-lg overflow-hidden border border-slate-600 bg-slate-800/90 backdrop-blur-sm", children: [_jsx("button", { onClick: () => handleSwitch("RON"), disabled: databases.activeCurrency === "RON", className: `
            px-4 py-1.5 font-bold text-sm transition-all duration-200
            ${databases.activeCurrency === "RON"
                            ? "bg-blue-600 text-white cursor-default shadow-lg shadow-blue-600/50"
                            : "bg-slate-700 text-slate-300 hover:bg-slate-600 active:bg-slate-500"}
          `, children: "RON" }), _jsx("button", { onClick: () => handleSwitch("EUR"), disabled: databases.activeCurrency === "EUR", className: `
            px-4 py-1.5 font-bold text-sm transition-all duration-200 border-l border-slate-600
            ${databases.activeCurrency === "EUR"
                            ? "bg-green-600 text-white cursor-default shadow-lg shadow-green-600/50"
                            : "bg-slate-700 text-slate-300 hover:bg-slate-600 active:bg-slate-500"}
          `, children: "EUR" })] }), showToast && (_jsx("div", { className: "fixed bottom-20 left-1/2 -translate-x-1/2 z-50 animate-fade-in", style: {
                    animation: 'fadeInOut 3s ease-in-out'
                }, children: _jsx("div", { className: "bg-slate-900/95 backdrop-blur-md border-2 border-slate-600 rounded-lg shadow-2xl px-6 py-3", children: _jsxs("div", { className: "flex items-center gap-3", children: [_jsx("div", { className: "text-lg", children: toastMessage.startsWith('✅') ? '✅' : '👁️' }), _jsx("div", { className: "text-sm font-medium text-white whitespace-nowrap", children: toastMessage.replace(/^(✅|👁️)\s*/, '') })] }) }) })), _jsx("style", { children: `
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
      ` })] }));
}
