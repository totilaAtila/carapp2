import initSqlJs from "sql.js";
import type { Database } from "sql.js";

export interface DBSet {
  membrii: Database;
  depcred: Database;
  lichidati?: Database;
  activi?: Database;
  source: 'filesystem' | 'upload';
  folderHandle?: FileSystemDirectoryHandle;
}

let SQL: any = null;

async function initSQL() {
  if (!SQL) {
    SQL = await initSqlJs({
      locateFile: (f: string) => `https://sql.js.org/dist/${f}`,
    });
  }
  return SQL;
}

/**
 * Încarcă baze de date din File System Access API
 */
export async function loadDatabasesFromFilesystem(): Promise<DBSet> {
  if (!('showDirectoryPicker' in window)) {
    throw new Error('Browser-ul nu suportă File System Access API');
  }

  try {
    // Selectare dosar
    const dirHandle = await (window as any).showDirectoryPicker({
      id: 'carapp-db-folder',
      mode: 'readwrite',
      startIn: 'documents'
    });

    const sql = await initSQL();

    // Încarcă bazele obligatorii
    const membrii = await loadDatabaseFile(sql, dirHandle, 'MEMBRII.db');
    const depcred = await loadDatabaseFile(sql, dirHandle, 'DEPCRED.db');

    // Încarcă bazele opționale
    let lichidati: Database | undefined;
    let activi: Database | undefined;

    try {
      lichidati = await loadDatabaseFile(sql, dirHandle, 'LICHIDATI.db');
    } catch {
      console.log('ℹ️ LICHIDATI.db nu a fost găsit (opțional)');
    }

    try {
      activi = await loadDatabaseFile(sql, dirHandle, 'ACTIVI.db');
    } catch {
      console.log('ℹ️ ACTIVI.db nu a fost găsit (opțional)');
    }

    return {
      membrii,
      depcred,
      lichidati,
      activi,
      source: 'filesystem',
      folderHandle: dirHandle,
    };
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw new Error('Selectare anulată de utilizator');
    }
    throw new Error('Eroare la încărcarea bazelor de date: ' + (err as Error).message);
  }
}

async function loadDatabaseFile(sql: any, dirHandle: FileSystemDirectoryHandle, fileName: string): Promise<Database> {
  const fileHandle = await dirHandle.getFileHandle(fileName);
  const file = await fileHandle.getFile();
  const arrayBuffer = await file.arrayBuffer();
  const u8 = new Uint8Array(arrayBuffer);

  // Verifică header SQLite
  const header = new TextDecoder().decode(u8.slice(0, 15));
  if (!header.startsWith("SQLite format")) {
    throw new Error(`${fileName} nu este o bază de date SQLite validă`);
  }

  return new sql.Database(u8);
}

/**
 * Salvează o bază de date înapoi în File System
 */
export async function saveDatabaseToFilesystem(
  dirHandle: FileSystemDirectoryHandle,
  fileName: string,
  db: Database
): Promise<void> {
  try {
    const data = db.export();
    const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(new Uint8Array(data));
    await writable.close();
    console.log(`✅ ${fileName} salvat cu succes`);
  } catch (err) {
    throw new Error(`Eroare la salvarea ${fileName}: ` + (err as Error).message);
  }
}

/**
 * Încarcă baze de date prin upload clasic (fallback pentru browsere incompatibile)
 */
export async function loadDatabasesFromUpload(): Promise<DBSet> {
  return new Promise((resolve, reject) => {
    // Creează input file
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '.db,.sqlite,.sqlite3';

    input.onchange = async (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (!files || files.length === 0) {
        reject(new Error('Niciun fișier selectat'));
        return;
      }

      try {
        const sql = await initSQL();
        
        const dbMap = new Map<string, Database>();

        for (const file of Array.from(files)) {
          const arrayBuffer = await file.arrayBuffer();
          const u8 = new Uint8Array(arrayBuffer);

          // Verifică header
          const header = new TextDecoder().decode(u8.slice(0, 15));
          if (!header.startsWith("SQLite format")) {
            console.warn(`${file.name} nu este o bază de date SQLite validă - ignorat`);
            continue;
          }

          const db = new sql.Database(u8);
          
          // Detectează tipul bazei după nume
          const nameLower = file.name.toLowerCase();
          if (nameLower.includes('membrii')) {
            dbMap.set('membrii', db);
          } else if (nameLower.includes('depcred')) {
            dbMap.set('depcred', db);
          } else if (nameLower.includes('lichidati')) {
            dbMap.set('lichidati', db);
          } else if (nameLower.includes('activi')) {
            dbMap.set('activi', db);
          }
        }

        // Verifică bazele obligatorii
        if (!dbMap.has('membrii')) {
          reject(new Error('Lipsește baza de date MEMBRII.db'));
          return;
        }
        if (!dbMap.has('depcred')) {
          reject(new Error('Lipsește baza de date DEPCRED.db'));
          return;
        }

        resolve({
          membrii: dbMap.get('membrii')!,
          depcred: dbMap.get('depcred')!,
          lichidati: dbMap.get('lichidati'),
          activi: dbMap.get('activi'),
          source: 'upload',
        });
      } catch (err) {
        reject(new Error('Eroare la procesarea fișierelor: ' + (err as Error).message));
      }
    };

    input.oncancel = () => {
      reject(new Error('Selectare anulată de utilizator'));
    };

    input.click();
  });
}

/**
 * Salvează o bază de date prin download (pentru upload mode)
 */
export function downloadDatabase(fileName: string, db: Database): void {
  const data = db.export();
  const blob = new Blob([new Uint8Array(data)], { type: "application/x-sqlite3" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}