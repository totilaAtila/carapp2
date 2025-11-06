// src/services/databaseManager.ts
import initSqlJs from "sql.js";
import type { Database } from 'sql.js';
import { clearAllPersistedDatabases } from './databasePersistence';

/** Tipul global pentru setul de baze de date */
export interface DBSet {
  // ========== BAZE RON (Obligatorii) ==========
  membrii: Database;
  depcred: Database;
  activi: Database;        // activi.db (lowercase filename!)
  inactivi: Database;      // INACTIVI.db
  lichidati: Database;     // LICHIDATI.db
  chitante: Database;      // CHITANTE.db - numerotare chitanțe

  // ========== BAZE EUR (Opționale) ==========
  membriieur?: Database;   // MEMBRIIEUR.db
  depcredeur?: Database;   // DEPCREDEUR.db
  activieur?: Database;    // activiEUR.db
  inactivieur?: Database;  // INACTIVIEUR.db
  lichidatieur?: Database; // LICHIDATIEUR.db
  // Notă: CHITANTE.db este comună pentru RON și EUR!

  // ========== CONFIGURARE ==========
  source: "filesystem" | "upload";
  folderHandle?: any;
  activeCurrency: "RON" | "EUR";  // Moneda curentă selectată
  hasEuroData: boolean;            // Există baze EUR încărcate?
  loadedAt: Date;
  lastSaved?: Date;
}

/** Permisiuni acces baze de date */
export interface AccessMode {
  canWriteRon: boolean;
  canWriteEur: boolean;
  canReadRon: boolean;
  canReadEur: boolean;
  showToggle: boolean;
  statusMessage: string;
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

// ========== FUNCȚII HELPER CURRENCY ==========

/**
 * Determină permisiunile bazat pe starea curentă
 */
export function getAccessMode(databases: DBSet): AccessMode {
  const hasEuro = databases.hasEuroData;

  // SCENARIU 1: Doar RON (fără EUR)
  if (!hasEuro) {
    return {
      canWriteRon: true,
      canWriteEur: false,
      canReadRon: true,
      canReadEur: false,
      showToggle: false,
      statusMessage: "Lucru normal în RON"
    };
  }

  // SCENARIU 2: RON + EUR, Toggle pe RON
  if (databases.activeCurrency === "RON") {
    return {
      canWriteRon: false,    // ❌ Blocat după conversie!
      canWriteEur: false,
      canReadRon: true,
      canReadEur: true,
      showToggle: true,
      statusMessage: "👁️ Vizualizare RON (Doar Citire)"
    };
  }

  // SCENARIU 3: RON + EUR, Toggle pe EUR
  return {
    canWriteRon: false,    // ❌ RON e arhivă
    canWriteEur: true,     // ✅ Activ în EUR
    canReadRon: true,
    canReadEur: true,
    showToggle: true,
    statusMessage: "✅ Lucru activ în EUR"
  };
}

/**
 * Returnează baza de date corectă pentru lucru (RON sau EUR)
 */
export function getActiveDB(
  databases: DBSet,
  type: 'membrii' | 'depcred' | 'activi' | 'inactivi' | 'lichidati' | 'chitante'
): Database {
  // CHITANTE.db este comună pentru ambele monede
  if (type === 'chitante') {
    return databases.chitante;
  }

  // Dacă toggle e pe EUR și există baze EUR, folosește EUR
  if (databases.activeCurrency === "EUR" && databases.hasEuroData) {
    const euroMap: Record<string, Database | undefined> = {
      'membrii': databases.membriieur,
      'depcred': databases.depcredeur,
      'activi': databases.activieur,
      'inactivi': databases.inactivieur,
      'lichidati': databases.lichidatieur,
    };

    const euroDB = euroMap[type];
    if (euroDB) return euroDB;
  }

  // Altfel, folosește RON (default)
  return {
    'membrii': databases.membrii,
    'depcred': databases.depcred,
    'activi': databases.activi,
    'inactivi': databases.inactivi,
    'lichidati': databases.lichidati,
  }[type]!;
}

/**
 * Verifică dacă operația de scriere este permisă
 * Aruncă eroare dacă NU e permisă
 */
export function assertCanWrite(databases: DBSet, operationName: string): void {
  const access = getAccessMode(databases);

  const canWrite = databases.activeCurrency === "RON"
    ? access.canWriteRon
    : access.canWriteEur;

  if (!canWrite) {
    throw new Error(
      `❌ Operația "${operationName}" este BLOCATĂ!\n\n` +
      `${access.statusMessage}\n\n` +
      (databases.activeCurrency === "RON" && databases.hasEuroData
        ? `Bazele RON sunt protejate deoarece există date EUR.\n` +
          `Pentru a modifica date, comutați la modul EUR.`
        : `Nu aveți permisiuni de scriere în modul ${databases.activeCurrency}.`
      )
    );
  }
}

// ========== VALIDARE STRUCTURI ==========

/** Verifică structura și tabelele obligatorii dintr-o bază de date */
function validateDatabaseStructure(db: any, name: string) {
  try {
    const res = db.exec("SELECT name FROM sqlite_master WHERE type='table';");
    const tables = res[0]?.values.flat() || [];

    if (tables.length === 0) {
      throw new Error(`Baza de date ${name} este goală sau coruptă.`);
    }

    if (name.toLowerCase().includes("membrii") && !tables.includes("MEMBRII")) {
      throw new Error(
        `Baza de date ${name} există, dar nu conține tabelul „MEMBRII".`
      );
    }

    if (name.toLowerCase().includes("depcred") && !tables.includes("DEPCRED")) {
      throw new Error(
        `Baza de date ${name} există, dar nu conține tabelul „DEPCRED".`
      );
    }

    console.log(`✅ Structura ${name} validă (${tables.length} tabele)`);
  } catch (e: any) {
    throw new Error(e.message);
  }
}

/** Încarcă baze de date din File System Access API */
export async function loadDatabasesFromFilesystem(): Promise<DBSet> {
  if (!("showDirectoryPicker" in window)) {
    console.warn(
      "⚠️ File System Access API indisponibil — se folosește fallback upload"
    );
    return await loadDatabasesFromUpload();
  }

  try {
    const dirHandle = await (window as any).showDirectoryPicker({
      id: "carapp-db-folder",
      mode: "readwrite",
      startIn: "documents",
    });

    console.log("📂 Dosar selectat, verificare permisiuni...");

    // ✅ CRITICAL: Verifică permisiuni explicit (Android fix)
    const permissionStatus = await dirHandle.requestPermission({ mode: 'readwrite' });
    console.log(`🔐 Permisiuni: ${permissionStatus}`);

    if (permissionStatus !== 'granted') {
      throw new Error(
        `Permisiuni refuzate pentru accesul la dosar.\n\n` +
        `Pe Android: Când sunteți întrebat "Allow Chrome to access files", ` +
        `trebuie să selectați "Allow" pentru a continua.\n\n` +
        `Status permisiuni: ${permissionStatus}`
      );
    }

    // ✅ NOU: Clear IndexedDB înainte de încărcare nouă
    console.log("🧹 Curățare IndexedDB pentru sesiune nouă...");
    await clearAllPersistedDatabases();
    console.log("✅ IndexedDB curățat - încărcăm baze fresh");

    const sql = await initSQL();

    // ========== ÎNCĂRCARE BAZE RON (Obligatorii) ==========
    console.log("📂 Încărcare baze RON obligatorii...");
    const membrii = await loadDatabaseFile(sql, dirHandle, "MEMBRII.db", false);
    const depcred = await loadDatabaseFile(sql, dirHandle, "DEPCRED.db", false);
    const activi = await loadDatabaseFile(sql, dirHandle, "activi.db", false); // lowercase!
    const inactivi = await loadDatabaseFile(sql, dirHandle, "INACTIVI.db", false);
    const lichidati = await loadDatabaseFile(sql, dirHandle, "LICHIDATI.db", false);
    const chitante = await loadDatabaseFile(sql, dirHandle, "CHITANTE.db", false);

    // ========== ÎNCĂRCARE BAZE EUR (Opționale) ==========
    console.log("📂 Încărcare baze EUR (opționale)...");
    const membriieur = await loadDatabaseFile(sql, dirHandle, "MEMBRIIEUR.db", true);
    const depcredeur = await loadDatabaseFile(sql, dirHandle, "DEPCREDEUR.db", true);
    const activieur = await loadDatabaseFile(sql, dirHandle, "activiEUR.db", true); // lowercase!
    const inactivieur = await loadDatabaseFile(sql, dirHandle, "INACTIVIEUR.db", true);
    const lichidatieur = await loadDatabaseFile(sql, dirHandle, "LICHIDATIEUR.db", true);

    // Detectare dacă există baze EUR
    const hasEuroData = !!(membriieur && depcredeur && activieur && inactivieur && lichidatieur);

    // ========== VALIDARE STRUCTURI OBLIGATORII ==========
    validateDatabaseStructure(membrii, "MEMBRII.db");
    validateDatabaseStructure(depcred, "DEPCRED.db");
    validateDatabaseStructure(activi, "activi.db");
    validateDatabaseStructure(inactivi, "INACTIVI.db");
    validateDatabaseStructure(lichidati, "LICHIDATI.db");
    validateDatabaseStructure(chitante, "CHITANTE.db");

    console.log(`✅ ${hasEuroData ? '11 baze' : '6 baze'} încărcate cu succes!`);

    return {
      membrii,
      depcred,
      activi,
      inactivi,
      lichidati,
      chitante,
      membriieur,
      depcredeur,
      activieur,
      inactivieur,
      lichidatieur,
      source: "filesystem",
      folderHandle: dirHandle,
      activeCurrency: "RON", // Default la RON
      hasEuroData,
      loadedAt: new Date(),
    };
  } catch (err: any) {
    throw new Error(`Eroare la încărcarea bazelor de date: ${err.message}`);
  }
}

/** Încarcă un fișier .db din director (case-insensitive, extensii multiple) */
async function loadDatabaseFile(
  sql: any,
  dirHandle: any,
  fileName: string,
  optional = false
) {
  const target = fileName.toLowerCase();
  let fileHandle: any = null;

  try {
    console.log(`🔍 Căutare ${fileName}...`);

    // Iterare prin fișiere din dosar
    for await (const entry of dirHandle.values()) {
      if (entry.kind === "file") {
        const name = entry.name.toLowerCase();
        if (
          name === target ||
          name === target.replace(".db", ".sqlite") ||
          name === target.replace(".db", ".sqlite3")
        ) {
          fileHandle = entry;
          console.log(`📄 Găsit: ${entry.name}`);
          break;
        }
      }
    }

    if (!fileHandle) {
      if (optional) {
        console.warn(`ℹ️ ${fileName} nu a fost găsit (opțional).`);
        return null;
      } else {
        throw new Error(`Baza de date ${fileName} lipsește din directorul selectat.`);
      }
    }

    // ✅ Android fix: Verifică permisiuni pentru fișier înainte de citire
    console.log(`🔐 Verificare permisiuni pentru ${fileHandle.name}...`);
    const filePermission = await fileHandle.queryPermission({ mode: 'read' });
    console.log(`🔐 Status permisiuni fișier: ${filePermission}`);

    if (filePermission !== 'granted') {
      const requestResult = await fileHandle.requestPermission({ mode: 'read' });
      if (requestResult !== 'granted') {
        throw new Error(
          `Permisiuni refuzate pentru citirea fișierului ${fileHandle.name}.\n` +
          `Pe Android, asigurați-vă că permiteți accesul la fișiere când sunteți întrebat.`
        );
      }
    }

    console.log(`📖 Citire ${fileHandle.name}...`);
    const file = await fileHandle.getFile();
    const buffer = await file.arrayBuffer();
    const u8 = new Uint8Array(buffer);
    const header = new TextDecoder().decode(u8.slice(0, 15));

    if (!header.startsWith("SQLite format")) {
      throw new Error(`Baza de date ${file.name} există, dar este coruptă.`);
    }

    const db = new sql.Database(u8);
    console.log(`✅ ${file.name} încărcat (${u8.length} bytes)`);
    return db;
  } catch (err: any) {
    console.error(`❌ Eroare la încărcarea ${fileName}:`, err);
    throw new Error(`${fileName}: ${err.message}`);
  }
}

/** Încărcare baze prin upload clasic (fallback universal - iOS compatible) */
export function loadDatabasesFromUpload(): Promise<DBSet> {
  const input = document.createElement("input");
  input.type = "file";
  input.multiple = true;
  // Accept: extensii + MIME types pentru compatibilitate iOS/Safari
  input.accept = ".db,.sqlite,.sqlite3,application/x-sqlite3,application/vnd.sqlite3,application/octet-stream";
  input.style.display = "none";
  document.body.appendChild(input);

  // Detectare iOS pentru mesaje personalizate
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  return new Promise((resolve, reject) => {
    input.onchange = async (e: Event) => {
      const files = (e.target as HTMLInputElement).files;
      document.body.removeChild(input);

      if (!files || files.length === 0) {
        const msg = isIOS
          ? "Nu a fost selectat niciun fișier. Pe iPhone/iPad, apăsați LUNG pe primul fișier pentru a selecta multiple fișiere."
          : "Nu a fost selectat niciun fișier de bază de date.";
        reject(new Error(msg));
        return;
      }

      // Avertizare specială pentru iOS când s-a selectat un singur fișier
      if (isIOS && files.length === 1) {
        console.warn("⚠️ iOS: Doar un fișier selectat. Verificați că ați apăsat LUNG pentru selecție multiplă.");
      }

      try {
        // ✅ IMPORTANT: Clear IndexedDB și init SQL DUPĂ selectare fișiere (iOS fix)
        console.log("🧹 Curățare IndexedDB pentru sesiune nouă...");
        await clearAllPersistedDatabases();
        console.log("✅ IndexedDB curățat");

        console.log("⚙️ Inițializare sql.js...");
        const sql = await initSQL();
        console.log("✅ sql.js inițializat");

        const dbMap = new Map<string, any>();

        console.log(`📂 Procesare ${files.length} fișier(e)...`);
        for (const file of Array.from(files)) {
          console.log(`📄 Citire ${file.name} (${(file.size / 1024).toFixed(2)} KB)...`);
          const buf = await file.arrayBuffer();
          const u8 = new Uint8Array(buf);
          const header = new TextDecoder().decode(u8.slice(0, 15));

          if (!header.startsWith("SQLite format")) {
            console.warn(`❌ ${file.name} nu este un fișier SQLite valid - ignorat`);
            continue;
          }

          console.log(`🔧 Încărcare bază de date ${file.name}...`);
          const db = new sql.Database(u8);
          const name = file.name.toLowerCase();

          const mappingRules: Array<{ key: string; match: (name: string) => boolean }> = [
            { key: "membrii", match: (n) => n.includes("membrii") && !n.includes("eur") },
            { key: "depcred", match: (n) => n.includes("depcred") && !n.includes("eur") },
            { key: "inactivi", match: (n) => n.includes("inactivi") && !n.includes("eur") },
            { key: "activi", match: (n) => n.includes("activi") && !n.includes("eur") },
            { key: "lichidati", match: (n) => n.includes("lichidati") && !n.includes("eur") },
            { key: "chitante", match: (n) => n.includes("chitante") },
            { key: "membriieur", match: (n) => n.includes("membriieur") },
            { key: "depcredeur", match: (n) => n.includes("depcredeur") },
            { key: "inactivieur", match: (n) => n.includes("inactivieur") },
            { key: "activieur", match: (n) => n.includes("activieur") },
            { key: "lichidatieur", match: (n) => n.includes("lichidatieur") },
          ];

          const matchedRule = mappingRules.find((rule) => rule.match(name));
          if (matchedRule) {
            dbMap.set(matchedRule.key, db);
            console.log(`✅ ${file.name} încadrat ca ${matchedRule.key}`);
          } else {
            console.warn(`ℹ️ ${file.name} nu a fost recunoscut - ignorat`);
          }
        }

        // Verificare baze obligatorii
        const requiredBases = ["membrii", "depcred", "activi", "inactivi", "lichidati", "chitante"];
        const missingBases = requiredBases.filter(b => !dbMap.has(b));

        if (missingBases.length > 0) {
          const baseMsg = `Lipsesc bazele obligatorii: ${missingBases.join(", ")}.db\n\nAsigurați-vă că ați selectat toate cele 6 fișiere obligatorii.`;
          const iosHint = isIOS
            ? "\n\nPe iPhone/iPad: Apăsați LUNG pe primul fișier pentru selecție multiplă."
            : "";
          reject(new Error(baseMsg + iosHint));
          return;
        }

        // Detectare baze EUR
        const hasEuroData = !!(
          dbMap.has("membriieur") &&
          dbMap.has("depcredeur") &&
          dbMap.has("activieur") &&
          dbMap.has("inactivieur") &&
          dbMap.has("lichidatieur")
        );

        console.log("✅ Validare structură baze de date...");
        validateDatabaseStructure(dbMap.get("membrii"), "MEMBRII.db");
        validateDatabaseStructure(dbMap.get("depcred"), "DEPCRED.db");
        validateDatabaseStructure(dbMap.get("activi"), "activi.db");
        validateDatabaseStructure(dbMap.get("inactivi"), "INACTIVI.db");
        validateDatabaseStructure(dbMap.get("lichidati"), "LICHIDATI.db");
        validateDatabaseStructure(dbMap.get("chitante"), "CHITANTE.db");

        console.log(`🎉 ${hasEuroData ? '11 baze' : '6 baze'} încărcate cu succes!`);
        resolve({
          membrii: dbMap.get("membrii")!,
          depcred: dbMap.get("depcred")!,
          activi: dbMap.get("activi")!,
          inactivi: dbMap.get("inactivi")!,
          lichidati: dbMap.get("lichidati")!,
          chitante: dbMap.get("chitante")!,
          membriieur: dbMap.get("membriieur"),
          depcredeur: dbMap.get("depcredeur"),
          activieur: dbMap.get("activieur"),
          inactivieur: dbMap.get("inactivieur"),
          lichidatieur: dbMap.get("lichidatieur"),
          source: "upload",
          activeCurrency: "RON",
          hasEuroData,
          loadedAt: new Date(),
        });
      } catch (err: any) {
        console.error("❌ Eroare la procesarea fișierelor:", err);
        reject(new Error(`Eroare la procesarea fișierelor: ${err.message}`));
      }
    };

    // iOS Safari: reset value pentru a permite re-select același fișier
    input.onclick = () => ((input as any).value = null);

    // IMPORTANT: Click se face IMEDIAT, fără await-uri înainte (iOS fix)
    input.click();
  });
}

/** Salvează o bază de date în fișier */
export async function saveDatabaseToFilesystem(dirHandle: any, fileName: string, db: any) {
  try {
    if (!db) throw new Error("Baza de date nu este încărcată în memorie.");
    const data = db.export();
    const blob = new Blob([new Uint8Array(data)], { type: "application/x-sqlite3" });

    if ("showSaveFilePicker" in window && dirHandle?.createWritable) {
      const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
      console.log(`✅ ${fileName} salvat cu succes`);
    } else {
      // Fallback download - compatibil iOS/Safari
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;

      // iOS Safari: adaugă în DOM pentru click sigur
      document.body.appendChild(a);
      a.click();

      // Cleanup cu delay pentru iOS
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);

      console.log(`✅ ${fileName} descărcat local (iOS/Safari compatible)`);
    }
  } catch (err: any) {
    throw new Error(`Eroare la salvarea ${fileName}: ${err.message}`);
  }
}

/** Salvare globală - toate bazele RON + EUR */
export async function persistDatabases(databases: DBSet) {
  try {
    if (!databases) return;

    if (databases.source === "filesystem" && databases.folderHandle) {
      // ========== SALVARE BAZE RON (Obligatorii) ==========
      console.log("💾 Salvare baze RON...");
      await saveDatabaseToFilesystem(databases.folderHandle, "MEMBRII.db", databases.membrii);
      await saveDatabaseToFilesystem(databases.folderHandle, "DEPCRED.db", databases.depcred);
      await saveDatabaseToFilesystem(databases.folderHandle, "activi.db", databases.activi); // lowercase!
      await saveDatabaseToFilesystem(databases.folderHandle, "INACTIVI.db", databases.inactivi);
      await saveDatabaseToFilesystem(databases.folderHandle, "LICHIDATI.db", databases.lichidati);
      await saveDatabaseToFilesystem(databases.folderHandle, "CHITANTE.db", databases.chitante);

      // ========== SALVARE BAZE EUR (dacă există) ==========
      if (databases.hasEuroData) {
        console.log("💾 Salvare baze EUR...");
        if (databases.membriieur)
          await saveDatabaseToFilesystem(databases.folderHandle, "MEMBRIIEUR.db", databases.membriieur);
        if (databases.depcredeur)
          await saveDatabaseToFilesystem(databases.folderHandle, "DEPCREDEUR.db", databases.depcredeur);
        if (databases.activieur)
          await saveDatabaseToFilesystem(databases.folderHandle, "activiEUR.db", databases.activieur);
        if (databases.inactivieur)
          await saveDatabaseToFilesystem(databases.folderHandle, "INACTIVIEUR.db", databases.inactivieur);
        if (databases.lichidatieur)
          await saveDatabaseToFilesystem(databases.folderHandle, "LICHIDATIEUR.db", databases.lichidatieur);
      }

      databases.lastSaved = new Date();
      console.log(`✅ ${databases.hasEuroData ? '11 baze' : '6 baze'} salvate în sistemul de fișiere.`);
    } else if (databases.source === "upload") {
      // ========== DOWNLOAD BAZE RON ==========
      console.log("📥 Download baze RON...");
      downloadDatabase("MEMBRII.db", databases.membrii);
      downloadDatabase("DEPCRED.db", databases.depcred);
      downloadDatabase("activi.db", databases.activi);
      downloadDatabase("INACTIVI.db", databases.inactivi);
      downloadDatabase("LICHIDATI.db", databases.lichidati);
      downloadDatabase("CHITANTE.db", databases.chitante);

      // ========== DOWNLOAD BAZE EUR (dacă există) ==========
      if (databases.hasEuroData) {
        console.log("📥 Download baze EUR...");
        if (databases.membriieur)
          downloadDatabase("MEMBRIIEUR.db", databases.membriieur);
        if (databases.depcredeur)
          downloadDatabase("DEPCREDEUR.db", databases.depcredeur);
        if (databases.activieur)
          downloadDatabase("activiEUR.db", databases.activieur);
        if (databases.inactivieur)
          downloadDatabase("INACTIVIEUR.db", databases.inactivieur);
        if (databases.lichidatieur)
          downloadDatabase("LICHIDATIEUR.db", databases.lichidatieur);
      }

      databases.lastSaved = new Date();
      console.log(`📥 ${databases.hasEuroData ? '11 baze' : '6 baze'} descărcate pentru salvare manuală.`);
    } else {
      console.warn("⚠️ Tip sursă necunoscut — fără acțiune.");
    }
  } catch (err: any) {
    console.error("❌ Persistență eșuată:", err.message);
    throw err;
  }
}

/** Download manual - compatibil iOS/Safari */
export function downloadDatabase(fileName: string, db: any) {
  const data = db.export();
  const blob = new Blob([new Uint8Array(data)], { type: "application/x-sqlite3" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;

  // iOS Safari: adaugă element în DOM pentru click sigur
  document.body.appendChild(a);
  a.click();

  // Cleanup: așteaptă puțin pentru iOS, apoi curăță
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);

  console.log(`📥 ${fileName} - download inițiat (iOS/Safari compatible)`);
}