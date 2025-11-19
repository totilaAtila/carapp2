import '@testing-library/jest-dom';
import { expect, afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// Cleanup după fiecare test pentru a preveni memory leaks
afterEach(() => {
  cleanup();
});

// Mock pentru File System Access API (nu este disponibil în jsdom)
global.showDirectoryPicker = vi.fn();

// Mock pentru IndexedDB (dacă este nevoie de teste mai avansate)
// jsdom include IndexedDB, dar putem adăuga configurări custom aici

// Mock pentru window.matchMedia (folosit pentru responsive design)
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock pentru service worker (PWA)
Object.defineProperty(navigator, 'serviceWorker', {
  writable: true,
  value: {
    register: vi.fn(() => Promise.resolve()),
    ready: Promise.resolve({
      active: null,
      installing: null,
      waiting: null,
    }),
  },
});

// Configurare Decimal.js pentru toate testele
import Decimal from 'decimal.js';
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

// Export utilities pentru teste
export { expect };
