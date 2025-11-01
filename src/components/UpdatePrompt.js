import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
// src/components/UpdatePrompt.tsx
/**
 * Componenta UpdatePrompt - Notificare vizuală pentru actualizări PWA
 *
 * FUNCȚIONALITATE:
 * - ⚡ Verificare INSTANT la deschidere aplicației
 * - 👀 Verificare când user revine la tab (visibilitychange)
 * - 🎯 Verificare când user revine la fereastră (focus)
 * - 🔄 Verificare periodică la fiecare 10 secunde
 * - 🎉 Afișează banner frumos în colțul dreapta-jos
 * - ✅ Buton "Actualizează acum" pentru reload instant
 * - ⏰ Buton "Mai târziu" pentru amânare
 * - 🔒 Se ascunde automat după actualizare
 *
 * DESIGN:
 * - Banner albastru cu text alb
 * - Iconiță 🎉 pentru vizibilitate
 * - Buton alb cu hover effect
 * - Fixed position pentru vizibilitate constantă
 * - Responsive pentru mobile/desktop
 * - Animație slide-in
 */
import { useEffect, useState } from 'react';
import { Button } from './ui/buttons';
import { Alert, AlertDescription } from './ui/alert';
import { RefreshCw } from 'lucide-react';
export default function UpdatePrompt() {
    const [showUpdate, setShowUpdate] = useState(false);
    const [isUpdating, setIsUpdating] = useState(false);
    useEffect(() => {
        // Verifică dacă browser suportă Service Workers
        if (!('serviceWorker' in navigator)) {
            console.log('⚠️ Service Worker nu este suportat de acest browser');
            return;
        }
        // Așteaptă ca Service Worker să fie ready
        navigator.serviceWorker.ready.then(registration => {
            console.log('✅ Service Worker ready, configurez detectare update...');
            // ============================================
            // 1. VERIFICARE INSTANT LA DESCHIDERE
            // ============================================
            console.log('🔍 Verificare INSTANT pentru update...');
            registration.update().catch(err => {
                console.log('Eroare verificare instant:', err);
            });
            // ============================================
            // 2. VERIFICARE PERIODICĂ (la fiecare 10 secunde)
            // ============================================
            const updateInterval = setInterval(() => {
                console.log('🔍 Verificare periodică pentru update...');
                registration.update().catch(err => {
                    console.log('Eroare verificare update:', err);
                });
            }, 10000); // 10 secunde (mai frecvent decât 30s)
            // ============================================
            // 3. VERIFICARE LA FOCUS (când user revine la tab)
            // ============================================
            const handleVisibilityChange = () => {
                if (document.visibilityState === 'visible') {
                    console.log('👀 Tab vizibil - verificare update...');
                    registration.update().catch(err => {
                        console.log('Eroare verificare la focus:', err);
                    });
                }
            };
            const handleFocus = () => {
                console.log('🎯 Fereastră în focus - verificare update...');
                registration.update().catch(err => {
                    console.log('Eroare verificare la focus:', err);
                });
            };
            document.addEventListener('visibilitychange', handleVisibilityChange);
            window.addEventListener('focus', handleFocus);
            // ============================================
            // 4. EVENT LISTENER pentru update găsit
            // ============================================
            registration.addEventListener('updatefound', () => {
                const newWorker = registration.installing;
                console.log('🔄 Update găsit! Instalare în curs...');
                if (!newWorker)
                    return;
                newWorker.addEventListener('statechange', () => {
                    console.log('Service Worker state:', newWorker.state);
                    // Când noul worker este instalat ȘI există controller vechi
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        console.log('✅ Nouă versiune disponibilă!');
                        setShowUpdate(true);
                    }
                });
            });
            // Cleanup la unmount
            return () => {
                clearInterval(updateInterval);
                document.removeEventListener('visibilitychange', handleVisibilityChange);
                window.removeEventListener('focus', handleFocus);
            };
        });
    }, []);
    /**
     * Handler pentru butonul "Actualizează"
     * Reîncarcă pagina pentru a activa noua versiune
     */
    const handleUpdate = () => {
        setIsUpdating(true);
        console.log('🔄 Utilizator a apăsat Actualizează - reload în curs...');
        // Mic delay pentru feedback vizual
        setTimeout(() => {
            window.location.reload();
        }, 300);
    };
    /**
     * Handler pentru butonul "Mai târziu"
     * Ascunde notificarea (va reapărea la următoarea verificare)
     */
    const handleDismiss = () => {
        setShowUpdate(false);
        console.log('ℹ️ Utilizator a amânat actualizarea');
    };
    // Nu afișa nimic dacă nu există update
    if (!showUpdate)
        return null;
    return (_jsx("div", { className: "fixed bottom-4 right-4 z-50 max-w-md animate-in slide-in-from-bottom-5", children: _jsx(Alert, { className: "bg-blue-600 text-white border-blue-700 shadow-2xl", children: _jsx(AlertDescription, { children: _jsxs("div", { className: "flex flex-col gap-3", children: [_jsxs("div", { className: "flex items-start gap-2", children: [_jsx("span", { className: "text-2xl", children: "\uD83C\uDF89" }), _jsxs("div", { className: "flex-1", children: [_jsx("p", { className: "font-bold text-lg", children: "Versiune nou\u0103 disponibil\u0103!" }), _jsx("p", { className: "text-sm text-blue-100 mt-1", children: "Actualizeaz\u0103 acum pentru ultimele \u00EEmbun\u0103t\u0103\u021Biri \u0219i corec\u021Bii" })] })] }), _jsxs("div", { className: "flex gap-2 mt-2", children: [_jsx(Button, { onClick: handleUpdate, disabled: isUpdating, className: "flex-1 bg-white text-blue-600 hover:bg-blue-50 font-semibold", size: "sm", children: isUpdating ? (_jsxs(_Fragment, { children: [_jsx(RefreshCw, { className: "w-4 h-4 mr-2 animate-spin" }), "Actualizare..."] })) : (_jsxs(_Fragment, { children: [_jsx(RefreshCw, { className: "w-4 h-4 mr-2" }), "Actualizeaz\u0103 acum"] })) }), _jsx(Button, { onClick: handleDismiss, disabled: isUpdating, variant: "outline", className: "bg-transparent border-white text-white hover:bg-blue-700 hover:border-white", size: "sm", children: "Mai t\u00E2rziu" })] }), _jsx("p", { className: "text-xs text-blue-200 mt-1", children: "\uD83D\uDCA1 Actualizarea dureaz\u0103 doar c\u00E2teva secunde" })] }) }) }) }));
}
