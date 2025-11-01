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

        if (!newWorker) return;

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
  if (!showUpdate) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-md animate-in slide-in-from-bottom-5">
      <Alert className="bg-blue-600 text-white border-blue-700 shadow-2xl">
        <AlertDescription>
          <div className="flex flex-col gap-3">
            {/* Header cu iconiță și titlu */}
            <div className="flex items-start gap-2">
              <span className="text-2xl">🎉</span>
              <div className="flex-1">
                <p className="font-bold text-lg">Versiune nouă disponibilă!</p>
                <p className="text-sm text-blue-100 mt-1">
                  Actualizează acum pentru ultimele îmbunătățiri și corecții
                </p>
              </div>
            </div>

            {/* Butoane acțiuni */}
            <div className="flex gap-2 mt-2">
              <Button
                onClick={handleUpdate}
                disabled={isUpdating}
                className="flex-1 bg-white text-blue-600 hover:bg-blue-50 font-semibold"
                size="sm"
              >
                {isUpdating ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Actualizare...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Actualizează acum
                  </>
                )}
              </Button>

              <Button
                onClick={handleDismiss}
                disabled={isUpdating}
                variant="outline"
                className="bg-transparent border-white text-white hover:bg-blue-700 hover:border-white"
                size="sm"
              >
                Mai târziu
              </Button>
            </div>

            {/* Info suplimentară */}
            <p className="text-xs text-blue-200 mt-1">
              💡 Actualizarea durează doar câteva secunde
            </p>
          </div>
        </AlertDescription>
      </Alert>
    </div>
  );
}
