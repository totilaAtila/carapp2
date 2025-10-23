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

/** Verifică dacă baza conține tabelele necesare */
function validateDatabaseStructure(db: any, name: string) {
  try {
    const res = db.exec(
      "SELECT name FROM sqlite_master WHERE type='table';"
    );
    const tables = res[0]?.values.flat() || [];
    if (tables.length === 0)
      throw new Error(`${name} nu conține tabele.`);
    if (name.includes("MEMBRII") && !tables.includes("MEMBRII"))
      throw new Error(`Tabelul MEMBRII lipsește din ${name}`);
    if (name.includes("DEPCRED") && !tables.includes("DEPCRED"))
      throw new Error(`Tabelul DEPCRED lipsește din ${name}`);
    console.log(`✅ Structura ${name} validă (${tables.length} tabele).`);
  } catch (e: any) {
    throw new Error(`Eroare structură ${name}: ${e.message}`);
  }
}

/** Încarcă baze de date din File System Access API */
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
    const lichidati = await loadDatabaseFile(sql, dirHandle, "LICHIDATI.db", true);
    const activi = await loadDatabaseFile(sql, dirHandle, "ACTIVI.db", true);

    validateDatabaseStructure(membrii, "MEMBRII.db");
    validateDatabaseStructure(depcred, "DEPCRED.db");

    return {
      membrii,
      depcred,
      lichidati,
      activi,
      source: "filesystem",
      folderHandle: dirHandle,
    };
  } catch (err: any) {
    throw new Error("Eroare la încărcarea bazelor de date: " + err.message);
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

  for await (const entry of dirHandle.values()) {
    if (entry.kind === "file") {
      const name = entry.name.toLowerCase();
      if (
        name === target ||
        name === target.replace(".db", ".sqlite") ||
        name === target.replace(".db", ".sqlite3")
      ) {
        fileHandle = entry;
        break;
      }
    }
  }

  if (!fileHandle) {
    if (optional) {
      console.warn(`ℹ️ ${fileName} nu a fost găsit (opțional).`);
      return null;
    } else {
      throw new Error(`${fileName} nu a fost găsit în directorul selectat.`);
    }
  }

  const file = await fileHandle.getFile();
  const buffer = await file.arrayBuffer();
  const u8 = new Uint8Array(buffer);
  const header = new TextDecoder().decode(u8.slice(0, 15));

  if (!header.startsWith("SQLite format")) {
    throw new Error(`${file.name} nu este o bază de date SQLite validă`);
  }

  const db = new sql.Database(u8);
  console.log(`✅ ${file.name} încărcat (${u8.length} bytes)`);
  return db;
}

/** Încărcare baze prin upload clasic (fallback universal) */
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
          const buf = await file.arrayBuffer();
          const u8 = new Uint8Array(buf);
          const header = new TextDecoder().decode(u8.slice(0, 15));
          if (!header.startsWith("SQLite format")) continue;

          const db = new sql.Database(u8);
          const name = file.name.toLowerCase();

          if (name.includes("membrii")) dbMap.set("membrii", db);
          else if (name.includes("depcred")) dbMap.set("depcred", db);
          else if (name.includes("lichidati")) dbMap.set("lichidati", db);
          else if (name.includes("activi")) dbMap.set("activi", db);
        }

        if (!dbMap.has("membrii") || !dbMap.has("depcred")) {
          reject(new Error("Lipsește MEMBRII.db sau DEPCRED.db"));
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

    input.onclick = () => ((input as any).value = null);
    input.click();
  });
}

/** Salvează o bază de date în fișier */
export async function saveDatabaseToFilesystem(
  dirHandle: any,
  fileName: string,
  db: any
) {
  try {
    if (!db) throw new Error("Obiectul bazei de date este null.");
    const data = db.export();
    const blob = new Blob([new Uint8Array(data)], {
      type: "application/x-sqlite3",
    });

    if ("showSaveFilePicker" in window && dirHandle?.createWritable) {
      const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
      console.log(`✅ ${fileName} salvat cu succes`);
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
      console.log(`✅ ${fileName} descărcat local`);
    }
  } catch (err: any) {
    throw new Error(`Eroare la salvarea ${fileName}: ${err.message}`);
  }
}

/** Download manual */
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

/** Salvare globală */
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
      console.log("✅ Bazele au fost salvate în sistemul de fișiere.");
      return;
    }

    if (databases.source === "upload") {
      if (databases.membrii) downloadDatabase("MEMBRII.db", databases.membrii);
      if (databases.depcred) downloadDatabase("DEPCRED.db", databases.depcred);
      if (databases.lichidati) downloadDatabase("LICHIDATI.db", databases.lichidati);
      if (databases.activi) downloadDatabase("ACTIVI.db", databases.activi);
      console.log("📥 Bazele au fost descărcate pentru salvare manuală.");
      return;
    }

    console.warn("⚠️ Tip sursă necunoscut — fără acțiune.");
  } catch (err: any) {
    console.error("❌ Persistență eșuată:", err.message);
    throw err;
  }
  }
