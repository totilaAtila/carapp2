import initSqlJs from "sql.js";

/** Tipul global pentru setul de baze de date */
export interface DBSet {
  membrii: any;
  depcred: any;
  lichidati?: any;
  activi?: any;
  source: "filesystem" | "upload";
  folderHandle?: any;
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
 * Cu fallback automat pentru iOS / browsere incompatibile
 */
export async function loadDatabasesFromFilesystem(): Promise<DBSet> {
  if (!("showDirectoryPicker" in window)) {
    console.warn("⚠️ File System Access API indisponibil — se folosește fallback upload");
    return await loadDatabasesFromUpload();
  }

  try {
    const dirHandle = await (window as any).showDirectoryPicker({
      id: "carapp-db-folder",
      mode: "readwrite",
      startIn: "documents",
    });

    const sql = await initSQL();

    const membrii = await loadDatabaseFile(sql, dirHandle, "MEMBRII.db");
    const depcred = await loadDatabaseFile(sql, dirHandle, "DEPCRED.db");

    let lichidati;
    let activi;

    try {
      lichidati = await loadDatabaseFile(sql, dirHandle, "LICHIDATI.db");
    } catch {
      console.log("ℹ️ LICHIDATI.db nu a fost găsit (opțional)");
    }

    try {
      activi = await loadDatabaseFile(sql, dirHandle, "ACTIVI.db");
    } catch {
      console.log("ℹ️ ACTIVI.db nu a fost găsit (opțional)");
    }

    return {
      membrii,
      depcred,
      lichidati,
      activi,
      source: "filesystem",
      folderHandle: dirHandle,
    };
  } catch (err: any) {
    if (err.name === "AbortError") throw new Error("Selectare anulată de utilizator");
    throw new Error("Eroare la încărcarea bazelor de date: " + err.message);
  }
}

/** Încarcă un fișier .db din directorul selectat */
async function loadDatabaseFile(sql: any, dirHandle: any, fileName: string) {
  const fileHandle = await dirHandle.getFileHandle(fileName);
  const file = await fileHandle.getFile();
  const arrayBuffer = await file.arrayBuffer();
  const u8 = new Uint8Array(arrayBuffer);
  const header = new TextDecoder().decode(u8.slice(0, 15));
  if (!header.startsWith("SQLite format")) {
    throw new Error(`${fileName} nu este o bază de date SQLite validă`);
  }
  return new sql.Database(u8);
}

/** Încarcă baze de date prin upload clasic (compatibil 100% iOS) */
export function loadDatabasesFromUpload(): Promise<DBSet> {
  const input = document.createElement("input");
  input.type = "file";
  input.multiple = true;
  input.accept = ".db,.sqlite,.sqlite3";
  input.style.display = "none";
  document.body.appendChild(input);

  return new Promise(async (resolve, reject) => {
    const sql = await initSQL();

    input.onchange = async (e: Event) => {
      const files = (e.target as HTMLInputElement).files;
      document.body.removeChild(input);

      if (!files || files.length === 0) {
        reject(new Error("Niciun fișier selectat"));
        return;
      }

      try {
        const dbMap = new Map<string, any>();

        for (const file of Array.from(files)) {
          const arrayBuffer = await file.arrayBuffer();
          const u8 = new Uint8Array(arrayBuffer);
          const header = new TextDecoder().decode(u8.slice(0, 15));
          if (!header.startsWith("SQLite format")) {
            console.warn(`${file.name} nu este o bază de date SQLite validă - ignorat`);
            continue;
          }

          const db = new sql.Database(u8);
          const nameLower = file.name.toLowerCase();

          if (nameLower.includes("membrii")) dbMap.set("membrii", db);
          else if (nameLower.includes("depcred")) dbMap.set("depcred", db);
          else if (nameLower.includes("lichidati")) dbMap.set("lichidati", db);
          else if (nameLower.includes("activi")) dbMap.set("activi", db);
        }

        if (!dbMap.has("membrii")) {
          reject(new Error("Lipsește baza de date MEMBRII.db"));
          return;
        }
        if (!dbMap.has("depcred")) {
          reject(new Error("Lipsește baza de date DEPCRED.db"));
          return;
        }

        resolve({
          membrii: dbMap.get("membrii"),
          depcred: dbMap.get("depcred"),
          lichidati: dbMap.get("lichidati"),
          activi: dbMap.get("activi"),
          source: "upload",
        });
      } catch (err: any) {
        reject(new Error("Eroare la procesarea fișierelor: " + err.message));
      }
    };

    input.onclick = () => {
      (input as any).value = null;
    };

    input.click();
  });
}

/** Salvează baza de date în File System sau fallback download (iOS) */
export async function saveDatabaseToFilesystem(dirHandle: any, fileName: string, db: any) {
  try {
    const data = db.export();
    const blob = new Blob([new Uint8Array(data)], { type: "application/x-sqlite3" });

    if ("showSaveFilePicker" in window && dirHandle?.createWritable) {
      const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
      console.log(`✅ ${fileName} salvat cu succes`);
    } else {
      console.warn(`⚠️ File System Access API indisponibil — fallback download pentru ${fileName}`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    }
  } catch (err: any) {
    throw new Error(`Eroare la salvarea ${fileName}: ${err.message}`);
  }
}

/** Download explicit (manual) */
export function downloadDatabase(fileName: string, db: any) {
  const data = db.export();
  const blob = new Blob([new Uint8Array(data)], { type: "application/x-sqlite3" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

/** Salvare globală a tuturor bazelor de date */
export async function persistDatabases(databases: DBSet) {
  try {
    if (!databases) return;

    if (databases.source === "filesystem" && databases.folderHandle) {
      if (databases.membrii)
        await saveDatabaseToFilesystem(databases.folderHandle, "MEMBRII.db", databases.membrii);
      if (databases.depcred)
        await saveDatabaseToFilesystem(databases.folderHandle, "DEPCRED.db", databases.depcred);
      if (databases.lichidati)
        await saveDatabaseToFilesystem(databases.folderHandle, "LICHIDATI.db", databases.lichidati);
      if (databases.activi)
        await saveDatabaseToFilesystem(databases.folderHandle, "ACTIVI.db", databases.activi);
      console.log("✅ Toate bazele au fost salvate direct în sistemul de fișiere");
      return;
    }

    if (databases.source === "upload") {
      if (databases.membrii) downloadDatabase("MEMBRII.db", databases.membrii);
      if (databases.depcred) downloadDatabase("DEPCRED.db", databases.depcred);
      if (databases.lichidati) downloadDatabase("LICHIDATI.db", databases.lichidati);
      if (databases.activi) downloadDatabase("ACTIVI.db", databases.activi);
      console.log("📥 Bazele au fost descărcate local pentru salvare manuală.");
      return;
    }

    console.warn("⚠️ Tip de sursă necunoscut — nicio acțiune efectuată.");
  } catch (err: any) {
    console.error("❌ Eroare la persistarea bazelor de date:", err.message);
    throw err;
  }
    }
