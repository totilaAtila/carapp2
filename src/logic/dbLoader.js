/**
 * Verifică dacă un fișier binar este un fișier SQLite valid
 */
export function validateDb(buffer) {
    const u8 = new Uint8Array(buffer);
    const header = new TextDecoder().decode(u8.slice(0, 15));
    return header.startsWith("SQLite format");
}
/**
 * Detectează dacă sistemul se află în modul EUR.
 * Caută fișierul dual_currency.json sau bazele *_EUR.db.
 */
export async function detectDualCurrency(log) {
    try {
        const jsonResp = await fetch("/dual_currency.json", { cache: "no-store" });
        if (jsonResp.ok) {
            const text = await jsonResp.text();
            const data = JSON.parse(text);
            const active = data?.converted || data?.active || data?.eur || data?.use_eur || data?.mode === "EUR";
            if (active) {
                const suffix = data?.suffix ? `_${data.suffix}` : "_EUR";
                log?.(`🔁 Conversie detectată din dual_currency.json → ${suffix}`);
                return { active: true, suffix };
            }
        }
    }
    catch {
        // ignorăm erorile JSON
    }
    const candidates = ["MEMBRII_EUR.db", "DEPCRED_EUR.db"];
    for (const file of candidates) {
        try {
            const resp = await fetch(`/${file}`, { cache: "no-store" });
            if (resp.ok) {
                const buf = await resp.arrayBuffer();
                if (validateDb(buf)) {
                    log?.(`🔁 Fișier ${file} valid → conversie activă.`);
                    return { active: true, suffix: "_EUR" };
                }
                else {
                    log?.(`⚠️ Fișier ${file} găsit dar invalid, ignor conversia.`);
                }
            }
        }
        catch {
            // ignorăm erorile
        }
    }
    log?.("➡️ Nu există baze EUR valide. Se vor folosi fișierele RON.");
    return { active: false, suffix: null };
}
/**
 * Încarcă o bază SQLite (sql.js Database) din directorul public
 */
export async function loadDb(sql, name, suffixHint, log) {
    const base = name.replace(/\.db$/i, "");
    const possibleNames = [];
    if (suffixHint) {
        const s = suffixHint.startsWith("_") ? suffixHint : `_${suffixHint}`;
        possibleNames.push(`${base}${s}.db`);
    }
    possibleNames.push(`${base}.db`);
    for (const n of possibleNames) {
        try {
            const resp = await fetch(`/${n}`, { cache: "no-store" });
            if (!resp.ok)
                continue;
            const buf = await resp.arrayBuffer();
            if (!validateDb(buf)) {
                log?.(`⚠️ ${n} nu este SQLite valid, se ignoră.`);
                continue;
            }
            log?.(`📥 Încarc ${n}`);
            return new sql.Database(new Uint8Array(buf));
        }
        catch (err) {
            log?.(`⚠️ Eroare la încărcarea ${n}: ${err.message}`);
            continue;
        }
    }
    throw new Error(`❌ Nu s-a putut încărca niciuna dintre variantele pentru ${name}.`);
}
/**
 * Încarcă toate bazele de date necesare pentru generare lună
 */
export async function loadAllDbs(sql, suffixHint, log) {
    const membrii = await loadDb(sql, "MEMBRII.db", suffixHint, log);
    const depcred = await loadDb(sql, "DEPCRED.db", suffixHint, log);
    let lichidati;
    let activi;
    try {
        lichidati = await loadDb(sql, "LICHIDATI.db", suffixHint, log);
    }
    catch {
        log?.("ℹ️ Baza LICHIDATI lipsește.");
    }
    try {
        activi = await loadDb(sql, "ACTIVI.db", suffixHint, log);
    }
    catch {
        log?.("ℹ️ Baza ACTIVI lipsește.");
    }
    return { membrii, depcred, lichidati, activi, usedSuffix: suffixHint };
}
/**
 * Obține toate bazele active (detectează automat conversia)
 */
export async function getActiveDatabases(SQL, log) {
    const dual = await detectDualCurrency(log);
    const dbs = await loadAllDbs(SQL, dual.suffix, log);
    dbs.usedSuffix = dual.suffix;
    return dbs;
}
