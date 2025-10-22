import initSqlJs from "sql.js";

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
export async function loadDatabasesFromFilesystem() {
  if (!("showDirectoryPicker" in window)) {
    throw new Error("Browser-ul nu suportă File System Access API");
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
    if (err.name === "AbortError") {
      throw new Error("Selectare anulată de utilizator");
    }
    throw new Error("Eroare la încărcarea bazelor de date: " + err.message);
  }
}

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

/**
 * Încarcă baze de date prin upload clasic (compatibil iOS)
 */
export function loadDatabasesFromUpload() {
  const input = document.createElement("input");
  input.type = "file";
  input.multiple = true;
  input.accept = ".db,.sqlite,.sqlite3";

  // IMPORTANT pentru iOS: adăugăm inputul în DOM și îl eliminăm după
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
      // reset pentru Safari
      (input as any).value = null;
    };

    input.click();
  });
}

/**
 * Salvează bazele înapoi local
 */
export async function saveDatabaseToFilesystem(dirHandle: any, fileName: string, db: any) {
  try {
    const data = db.export();
    const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(new Uint8Array(data));
    await writable.close();
    console.log(`✅ ${fileName} salvat cu succes`);
  } catch (err: any) {
    throw new Error(`Eroare la salvarea ${fileName}: ` + err.message);
  }
}

/**
 * Export prin download (fallback)
 */
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
