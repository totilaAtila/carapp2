// src/components/UpdatePrompt.tsx
/**
 * Componenta UpdatePrompt - Notificare vizuală pentru actualizări PWA
 *
 * FUNCȚIONALITATE:
 * - Detectează automat când există versiune nouă disponibilă
 * - Afișează banner frumos în colțul dreapta-jos
 * - Buton "Actualizează" pentru reload instant
 * - Verificare periodică la fiecare 30 secunde
 * - Se ascunde automat după actualizare
 *
 * DESIGN:
 * - Banner albastru cu text alb
 * - Iconiță 🎉 pentru vizibilitate
 * - Buton alb cu hover effect
 * - Fixed position pentru vizibilitate constantă
 * - Responsive pentru mobile/desktop
 */

import { useEffect, useState } from 'react';
import { Button } from './ui/buttons';
import { Alert, AlertDescription } from './ui/alert';
import { RefreshCw } from 'lucide-react';

export default function UpdatePrompt() {
  const [showUpdate, setShowUpdate] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    // Verifică dacă browser suportă Service Workers
    if (!('serviceWorker' in navigator)) {
      console.log('⚠️ Service Worker nu este suportat de acest browser');
      return;
    }

    // Așteaptă ca Service Worker să fie ready
    navigator.serviceWorker.ready.then(reg => {
      console.log('✅ Service Worker ready, configurez detectare update...');
      setRegistration(reg); // Salvează referința pentru handleUpdate

      // Verifică update la fiecare 30 secunde
      const updateInterval = setInterval(() => {
        reg.update().catch(err => {
          console.log('Eroare verificare update:', err);
        });
      }, 30000); // 30 secunde

      // Event listener pentru update găsit
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
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
      };
    });
  }, []);

  /**
   * Handler pentru butonul "Actualizează"
   * Instruiește worker-ul waiting să preia controlul, apoi reîncarcă pagina
   */
  const handleUpdate = () => {
    if (!registration?.waiting) {
      console.log('⚠️ Nu există service worker waiting - fallback la reload simplu');
      window.location.reload();
      return;
    }

    setIsUpdating(true);
    console.log('🔄 Activare service worker nou...');

    // Ascultă pentru controllerchange - când noul worker preia controlul
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      console.log('✅ Noul service worker a preluat controlul - reload...');
      window.location.reload();
    });

    // Trimite mesaj SKIP_WAITING la worker-ul waiting
    // Acest mesaj instruiește worker-ul să iasă din starea waiting și să devină activ
    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
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
