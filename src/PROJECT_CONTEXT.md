# CARapp_web 2.0 — Context Tehnic al Proiectului

## 🧭 Scopul general

Rescriere completă, în versiune **web**, a aplicației desktop C.A.R. Petroșani (Casa de Ajutor Reciproc).
Scopul: o aplicație care rulează 100 % în browser (fără backend), funcționează offline, permite gestionarea
membrilor, cotizațiilor, împrumuturilor, dividendelor și generarea lunară automată a bazelor de date.

---

## ⚙️ Tehnologii folosite

| Domeniu              | Tehnologie                                                             |
| -------------------- | ---------------------------------------------------------------------- |
| Framework UI         | **React + TypeScript + Vite**                                          |
| Stilizare            | **TailwindCSS** + shadcn/ui (pentru componente moderne)                |
| Baze de date locale  | **sql.js** (SQLite compilat în WebAssembly)                            |
| Calcule financiare   | **decimal.js** (precizie aritmetică exactă)                            |
| Export fișiere       | Blob API + `Save as…` manual (format `.db`, `.pdf`, `.xlsx` în viitor) |
| PDF / Rapoarte       | **pdf-lib** (urmează integrarea)                                       |
| Grafice / Statistici | **Recharts** (urmează integrarea)                                      |
| Deploy               | **Netlify** (static build, fără backend)                               |
| Testare logică       | Vitest (planificat)                                                    |

---

## 📁 Structura proiectului

```
carapp2/
 ├ public/               # Baze de date SQLite (MEMBRII.db, DEPCRED.db etc.)
 ├ src/
 │   ├ logic/
 │   │   ├ finance.ts        # Calcule dobândă și conversie RON↔EUR
 │   │   └ generateMonth.ts  # Portarea completă a generării lunii noi (din generare_luna.py)
 │   ├ App.tsx               # Componentă de test și export manual
 │   ├ index.css             # Include Tailwind
 │   └ main.tsx
 ├ tailwind.config.js
 ├ postcss.config.js
 ├ package.json
 └ PROJECT_CONTEXT.md        # (acest fișier)
```

---

## 🧩 Stadiul actual (19 octombrie 2025)

✅ Mediu complet funcțional (React + Vite + Tailwind + sql.js)
✅ Portare completă a logicii `generare_luna.py` în TypeScript (`generateMonth.ts`)
✅ Aplicația rulează local, generează luna nouă și produce fișier `.db` actualizat
✅ Export „Save as” manual pentru DEPCRED
🟡 Următorul pas: UI complet React care replică fereastra PyQt5 („Generare Lună Nouă”)
⚪ Etape viitoare: rapoarte PDF, module Membri / Lichidați / Activi, design responsive complet

---

## 🧭 Reguli de colaborare și ritm de lucru

1. **Pas-cu-pas:** fiecare etapă este executată, testată, confirmată înainte de următoarea.
2. **Confirmare explicită:** înainte de orice generare sau refactorizare majoră.
3. **Documentare continuă:** fiecare pas semnificativ va fi notat în acest fișier.
4. **Obiectiv UI:** interfață aproape identică cu versiunea PyQt5, dar responsive (desktop/mobil/tabletă).
5. **Limbaj:** toate fișierele, denumirile și comentariile în română, conform convențiilor CAR.

---

## 🧱 Pașii următori planificați

1. Crearea componentei `GenerareLuna.tsx` — UI complet echivalent PyQt5:

   * afișare perioadă curentă / următoare
   * selectare lună
   * butoane principale + extra (ștergere, modificare rată, afișare membri, export log)
   * log live conectat la funcția `generateMonth()`
2. Adaptare design pentru mobil/tabletă (Tailwind responsive).
3. Integrarea `pdf-lib` pentru rapoarte lunare.
4. Migrare logică Membri / Lichidați / Activi.
5. Testare completă, export Netlify.

---

## ✉️ Autor / Mentenanță

Proiect: **CARapp_web 2.0**
Inițiator: *[utilizator ChatGPT – dezvoltator proiect CAR Petroșani]*
Asistent AI: ChatGPT GPT-5
Ultima actualizare: **19 octombrie 2025**
