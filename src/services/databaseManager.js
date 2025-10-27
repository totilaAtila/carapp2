// src/services/databaseManager.ts
import initSqlJs from "sql.js";
import { clearAllPersistedDatabases } from './databasePersistence'; // ✅ ADĂUGAT
let SQL = null;
async function initSQL() {
    if (!SQL) {
        SQL = await initSqlJs({
            locateFile: (f) => `https://sql.js.org/dist/${f}`,
        });
    }
    return SQL;
}
/** Verifică structura și tabelele obligatorii dintr-o bază de date */
function validateDatabaseStructure(db, name) {
    try {
        const res = db.exec("SELECT name FROM sqlite_master WHERE type='table';");
        const tables = res[0]?.values.flat() || [];
        if (tables.length === 0) {
            throw new Error(`Baza de date ${name} este goală sau coruptă.`);
        }
        if (name.toLowerCase().includes("membrii") && !tables.includes("MEMBRII")) {
            throw new Error(`Baza de date ${name} există, dar nu conține tabelul „MEMBRII".`);
        }
        if (name.toLowerCase().includes("depcred") && !tables.includes("DEPCRED")) {
            throw new Error(`Baza de date ${name} există, dar nu conține tabelul „DEPCRED".`);
        }
        console.log(`✅ Structura ${name} validă (${tables.length} tabele)`);
    }
    catch (e) {
        throw new Error(e.message);
    }
}
/** Încarcă baze de date din File System Access API */
export async function loadDatabasesFromFilesystem() {
    if (!("showDirectoryPicker" in window)) {
        console.warn("⚠️ File System Access API indisponibil — se folosește fallback upload");
        return await loadDatabasesFromUpload();
    }
    try {
        const dirHandle = await window.showDirectoryPicker({
            id: "carapp-db-folder",
            mode: "readwrite",
            startIn: "documents",
        });
        // ✅ NOU: Clear IndexedDB înainte de încărcare nouă
        console.log("🧹 Curățare IndexedDB pentru sesiune nouă...");
        await clearAllPersistedDatabases();
        console.log("✅ IndexedDB curățat - încărcăm baze fresh");
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
    }
    catch (err) {
        throw new Error(`Eroare la încărcarea bazelor de date: ${err.message}`);
    }
}
/** Încarcă un fișier .db din director (case-insensitive, extensii multiple) */
async function loadDatabaseFile(sql, dirHandle, fileName, optional = false) {
    const target = fileName.toLowerCase();
    let fileHandle = null;
    try {
        for await (const entry of dirHandle.values()) {
            if (entry.kind === "file") {
                const name = entry.name.toLowerCase();
                if (name === target ||
                    name === target.replace(".db", ".sqlite") ||
                    name === target.replace(".db", ".sqlite3")) {
                    fileHandle = entry;
                    break;
                }
            }
        }
        if (!fileHandle) {
            if (optional) {
                console.warn(`ℹ️ ${fileName} nu a fost găsit (opțional).`);
                return null;
            }
            else {
                throw new Error(`Baza de date ${fileName} lipsește din directorul selectat.`);
            }
        }
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
    }
    catch (err) {
        throw new Error(`${fileName}: ${err.message}`);
    }
}
/** Încărcare baze prin upload clasic (fallback universal - iOS compatible) */
export function loadDatabasesFromUpload() {
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
        input.onchange = async (e) => {
            const files = e.target.files;
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
                const dbMap = new Map();
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
                    if (name.includes("membrii"))
                        dbMap.set("membrii", db);
                    else if (name.includes("depcred"))
                        dbMap.set("depcred", db);
                    else if (name.includes("lichidati"))
                        dbMap.set("lichidati", db);
                    else if (name.includes("activi"))
                        dbMap.set("activi", db);
                    console.log(`✅ ${file.name} încărcat cu succes`);
                }
                if (!dbMap.has("membrii") || !dbMap.has("depcred")) {
                    const baseMsg = "Lipsește cel puțin una dintre bazele obligatorii: MEMBRII.db sau DEPCRED.db.";
                    const iosHint = isIOS
                        ? "\n\nPe iPhone/iPad: Asigurați-vă că ați apăsat LUNG pe primul fișier și ați selectat toate fișierele necesare înainte de a apăsa 'Deschide'."
                        : "";
                    reject(new Error(baseMsg + iosHint));
                    return;
                }
                console.log("✅ Validare structură baze de date...");
                validateDatabaseStructure(dbMap.get("membrii"), "MEMBRII.db");
                validateDatabaseStructure(dbMap.get("depcred"), "DEPCRED.db");
                console.log("🎉 Toate bazele de date încărcate cu succes!");
                resolve({
                    membrii: dbMap.get("membrii"),
                    depcred: dbMap.get("depcred"),
                    lichidati: dbMap.get("lichidati"),
                    activi: dbMap.get("activi"),
                    source: "upload",
                });
            }
            catch (err) {
                console.error("❌ Eroare la procesarea fișierelor:", err);
                reject(new Error(`Eroare la procesarea fișierelor: ${err.message}`));
            }
        };
        // iOS Safari: reset value pentru a permite re-select același fișier
        input.onclick = () => (input.value = null);
        // IMPORTANT: Click se face IMEDIAT, fără await-uri înainte (iOS fix)
        input.click();
    });
}
/** Salvează o bază de date în fișier */
export async function saveDatabaseToFilesystem(dirHandle, fileName, db) {
    try {
        if (!db)
            throw new Error("Baza de date nu este încărcată în memorie.");
        const data = db.export();
        const blob = new Blob([new Uint8Array(data)], { type: "application/x-sqlite3" });
        if ("showSaveFilePicker" in window && dirHandle?.createWritable) {
            const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(blob);
            await writable.close();
            console.log(`✅ ${fileName} salvat cu succes`);
        }
        else {
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
    }
    catch (err) {
        throw new Error(`Eroare la salvarea ${fileName}: ${err.message}`);
    }
}
/** Salvare globală */
export async function persistDatabases(databases) {
    try {
        if (!databases)
            return;
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
        }
        else if (databases.source === "upload") {
            if (databases.membrii)
                downloadDatabase("MEMBRII.db", databases.membrii);
            if (databases.depcred)
                downloadDatabase("DEPCRED.db", databases.depcred);
            if (databases.lichidati)
                downloadDatabase("LICHIDATI.db", databases.lichidati);
            if (databases.activi)
                downloadDatabase("ACTIVI.db", databases.activi);
            console.log("📥 Bazele au fost descărcate pentru salvare manuală.");
        }
        else {
            console.warn("⚠️ Tip sursă necunoscut — fără acțiune.");
        }
    }
    catch (err) {
        console.error("❌ Persistență eșuată:", err.message);
        throw err;
    }
}
/** Download manual - compatibil iOS/Safari */
export function downloadDatabase(fileName, db) {
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
