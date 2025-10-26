// src/services/databasePersistence.ts
/**
 * Serviciu pentru persistență IndexedDB
 * 
 * IndexedDB este folosit DOAR ca CACHE temporar între sesiuni.
 * La fiecare upload NOU de baze de date, IndexedDB se curăță complet
 * pentru a evita conflicte între versiuni vechi/noi.
 * 
 * SURSA DE ADEVĂR = Fișierele .db uploadate/selectate de user
 * IndexedDB = CACHE pentru confort între refresh-uri
 */

import { openDB, type IDBPDatabase } from 'idb';
import type { Database } from 'sql.js';

// Configurare IndexedDB
const DB_NAME = 'CARappDatabases';
const DB_VERSION = 1;
const STORE_NAME = 'databases';

interface DatabaseRecord {
  name: string;
  data: Uint8Array;
  timestamp: number;
  size: number;
  checksum?: string;
}

/**
 * Deschide conexiunea la IndexedDB
 */
async function getDB(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'name' });
      }
    },
  });
}

/**
 * CRITICĂ: Șterge TOATE bazele de date din IndexedDB
 * 
 * Folosit înainte de fiecare upload NOU pentru a preveni conflicte
 * între versiuni vechi (din IndexedDB) și versiuni noi (din fișiere).
 * 
 * @returns Promise<void>
 */
export async function clearAllPersistedDatabases(): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    
    // Șterge tot din store
    await store.clear();
    await tx.done;
    
    console.log("✅ IndexedDB complet curățat - gata pentru sesiune nouă");
  } catch (error) {
    console.warn("⚠️ Eroare curățare IndexedDB:", error);
    // Nu blocăm aplicația dacă clear eșuează
  }
}

/**
 * Salvează o bază de date în IndexedDB (cache sesiune)
 * 
 * @param db - Instanța sql.js Database
 * @param name - Nume bază (ex: "DEPCRED_2025_10")
 * @returns Promise cu mărimea salvată
 */
export async function persistDatabase(
  db: Database,
  name: string
): Promise<{ success: boolean; size: number }> {
  try {
    const data = db.export();
    const record: DatabaseRecord = {
      name,
      data,
      timestamp: Date.now(),
      size: data.length
    };

    const idb = await getDB();
    const tx = idb.transaction(STORE_NAME, 'readwrite');
    await tx.objectStore(STORE_NAME).put(record);
    await tx.done;

    console.log(`✅ ${name} salvat în IndexedDB (${formatBytes(data.length)})`);
    
    return { success: true, size: data.length };
  } catch (error) {
    console.error(`❌ Eroare salvare ${name} în IndexedDB:`, error);
    return { success: false, size: 0 };
  }
}

/**
 * Încarcă o bază de date din IndexedDB
 * 
 * @param name - Nume bază (ex: "DEPCRED_2025_10")
 * @param sql - Instanța SQL.js
 * @returns Promise cu Database sau null dacă nu există
 */
export async function loadPersistedDatabase(
  name: string,
  sql: any
): Promise<Database | null> {
  try {
    const db = await getDB();
    const record = await db.get(STORE_NAME, name) as DatabaseRecord | undefined;

    if (!record) {
      console.log(`ℹ️ ${name} nu există în IndexedDB`);
      return null;
    }

    // Recreează Database din Uint8Array
    const database = new sql.Database(record.data);
    console.log(`✅ ${name} încărcat din IndexedDB (${formatBytes(record.size)})`);
    
    return database;
  } catch (error) {
    console.error(`❌ Eroare încărcare ${name} din IndexedDB:`, error);
    return null;
  }
}

/**
 * Verifică ce baze există în IndexedDB
 * 
 * @returns Promise cu lista de nume baze găsite
 */
export async function checkPersistedDatabases(): Promise<{
  exists: string[];
  total: number;
}> {
  try {
    const db = await getDB();
    const keys = await db.getAllKeys(STORE_NAME);

    return {
      exists: keys as string[],
      total: keys.length
    };
  } catch (error) {
    console.error("❌ Eroare verificare IndexedDB:", error);
    return { exists: [], total: 0 };
  }
}

/**
 * Șterge o singură bază din IndexedDB
 * 
 * @param name - Nume bază de șters
 */
export async function deletePersistedDatabase(name: string): Promise<void> {
  try {
    const db = await getDB();
    await db.delete(STORE_NAME, name);
    console.log(`✅ ${name} șters din IndexedDB`);
  } catch (error) {
    console.error(`❌ Eroare ștergere ${name} din IndexedDB:`, error);
  }
}

/**
 * Generează nume standardizat pentru bază în IndexedDB
 * 
 * @param base - Baza (ex: "DEPCRED")
 * @param year - An
 * @param month - Lună
 * @returns Nume format (ex: "DEPCRED_2025_10")
 */
export function generateDatabaseName(
  base: string,
  year: number,
  month: number
): string {
  return `${base}_${year}_${String(month).padStart(2, '0')}`;
}

/**
 * Helper pentru formatare bytes
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}