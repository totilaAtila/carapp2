# Prompt pentru fix-uri Python dividende.py

Repository: totilaAtila/CARpetrosani
Branch: main (sau creează branch nou pentru fix-uri)
Fișier țintă: ui/dividende.py

## CONTEXT

Am implementat fix-uri critice în versiunea TypeScript (carapp2) și acum trebuie să implementez ACELEAȘI fix-uri în versiunea Python pentru paritate.

**Istoricul:** AI anterior a modificat dividende.py înainte de upload pe GitHub (6 octombrie) și a OMIS validări critice fără anunțare. Acum trebuie să RESTAURĂM logica pierdută.

---

## TASK-URI (2 fix-uri majore)

### 1. FIX: Filtru eligibilitate SOLD_DECEMBRIE > 0

**Locație:** ~linia 283-298 (după "membri_eligibili_raw = cursor_depcred.fetchall()")

**Problema:**
Query-ul SQL actual:
```python
HAVING SUM(d.DEP_SOLD) > 0
```

Permite toți membrii cu sold pozitiv în ANY lună.

**Regula de business corectă:**
Doar membrii cu sold pozitiv în DECEMBRIE sunt eligibili (include cazul special: membri înscriși în decembrie).

**Fix necesar:**
Modifică query-ul să adauge:
```python
HAVING SUM(d.DEP_SOLD) > 0 AND MAX(CASE WHEN d.LUNA = 12 THEN d.DEP_SOLD ELSE 0 END) > 0
```

---

### 2. FIX: Sistem validare membri problematici

**Locație:** Inserează DUPĂ "membri_eligibili_raw = cursor_depcred.fetchall()" (înainte de procesarea lor)

**Implementare:** Sistem comprehensiv cu 4 tipuri de validări:

#### Validări necesare:

**1. Membri în DEPCRED fără corespondent în MEMBRII.db**
   - Query: `SELECT DISTINCT NR_FISA FROM DEPCRED WHERE ANUL = ?`
   - Pentru fiecare: verifică dacă există în MEMBRII.db
   - Mesaj: "Membru există în DEPCRED.db pentru anul {an} dar nu există în MEMBRII.db"
   - **IMPORTANT:** NU verifica invers (MEMBRII fără DEPCRED) deoarece MEMBRII.db este cumulativ și conține membri înscriși în ani viitori

**2. Membri cu PRIMA = 0 în decembrie**
   - Query: `SELECT NR_FISA FROM DEPCRED WHERE ANUL = ? AND LUNA = 12 AND PRIMA = 0`
   - Mesaj: "Membru are câmpul PRIMA = 0 în decembrie {an} (ar trebui să fie 1)"

**3. Membri cu DEP_SOLD = 0 în decembrie**
   - Query: `SELECT NR_FISA FROM DEPCRED WHERE ANUL = ? AND LUNA = 12 AND DEP_SOLD = 0`
   - Mesaj: "Membru are sold depunere = 0 în decembrie {an} (nu este eligibil pentru beneficii)"

**4. Membri eligibili DAR fără ianuarie anul următor**
   - Query: `SELECT NR_FISA FROM DEPCRED WHERE ANUL = ? AND LUNA = 12 AND DEP_SOLD > 0`
   - Pentru fiecare: verifică `SELECT COUNT(*) FROM DEPCRED WHERE NR_FISA = ? AND ANUL = ? AND LUNA = 1`
   - Mesaj: "Membru eligibil pentru beneficii dar nu are înregistrare ianuarie {an+1} (transferul va eșua)"

---

### UI necesar (PyQt5):

**1. QMessageBox inițial:**
   - Titlu: "⚠️ Membri Problematici Detectați"
   - Text: "S-au detectat {N} probleme!\n\nAplicația nu poate continua până când aceste probleme nu sunt rezolvate.\n\nApasă OK pentru a vedea lista detaliată."

**2. QDialog cu:**
   - **QTableWidget** cu 3 coloane: "Nr. fișă", "Nume și prenume", "Problema detectată"
   - Lista scrollable cu toți membrii problematici
   - **QPushButton "Export CSV"**: salvează `Membri_Problematici_{An}.csv`
   - **QPushButton "Închide"**

**3. Blocare:** Funcția de calcul beneficii trebuie să returneze early dacă există probleme (NU permite continuarea)

---

## REFERINȚĂ IMPLEMENTARE TYPESCRIPT

### Validare (liniile 148-245 din Dividende.tsx):

```typescript
// ===============================================
// VALIDARE MEMBRI PROBLEMATICI
// ===============================================
const probleme: ProblematicMember[] = [];

// 1. Verifică membri în DEPCRED (anul selectat) fără corespondent în MEMBRII.db
// IMPORTANT: Nu verificăm invers (MEMBRII fără DEPCRED) deoarece MEMBRII.db este cumulativ
// și conține membri înscriși în ani viitori care nu trebuie să aibă date pentru anul selectat
const depcredMembersQuery = `SELECT DISTINCT NR_FISA FROM DEPCRED WHERE ANUL = ${selectedYear}`;
const depcredMembersResult = depcredDB.exec(depcredMembersQuery);
if (depcredMembersResult.length > 0) {
  for (const row of depcredMembersResult[0].values) {
    const nrFisa = row[0] as number;
    if (!memberNameMap.has(nrFisa)) {
      probleme.push({
        nrFisa,
        numPren: `Fișa ${nrFisa}`,
        problema: `Membru există în DEPCRED.db pentru anul ${selectedYear} dar nu există în MEMBRII.db`
      });
    }
  }
}

// 2. Verifică membri cu PRIMA = 0 în decembrie
const primaCheckQuery = `
  SELECT NR_FISA, PRIMA
  FROM DEPCRED
  WHERE ANUL = ${selectedYear} AND LUNA = 12 AND PRIMA = 0
`;
const primaResult = depcredDB.exec(primaCheckQuery);
if (primaResult.length > 0) {
  for (const row of primaResult[0].values) {
    const nrFisa = row[0] as number;
    const numPren = memberNameMap.get(nrFisa) || `Fișa ${nrFisa}`;
    probleme.push({
      nrFisa,
      numPren,
      problema: `Membru are câmpul PRIMA = 0 în decembrie ${selectedYear} (ar trebui să fie 1)`
    });
  }
}

// 3. Verifică membri cu DEP_SOLD = 0 în decembrie
const soldZeroQuery = `
  SELECT NR_FISA, DEP_SOLD
  FROM DEPCRED
  WHERE ANUL = ${selectedYear} AND LUNA = 12 AND DEP_SOLD = 0
`;
const soldZeroResult = depcredDB.exec(soldZeroQuery);
if (soldZeroResult.length > 0) {
  for (const row of soldZeroResult[0].values) {
    const nrFisa = row[0] as number;
    const numPren = memberNameMap.get(nrFisa) || `Fișa ${nrFisa}`;
    probleme.push({
      nrFisa,
      numPren,
      problema: `Membru are sold depunere = 0 în decembrie ${selectedYear} (nu este eligibil pentru beneficii)`
    });
  }
}

// 4. Verifică membri eligibili pentru dividende DAR fără ianuarie anul următor
const eligibleMembersQuery = `
  SELECT DISTINCT NR_FISA
  FROM DEPCRED
  WHERE ANUL = ${selectedYear} AND LUNA = 12 AND DEP_SOLD > 0
`;
const eligibleResult = depcredDB.exec(eligibleMembersQuery);
if (eligibleResult.length > 0) {
  for (const row of eligibleResult[0].values) {
    const nrFisa = row[0] as number;
    const janCheckQuery = `SELECT COUNT(*) FROM DEPCRED WHERE NR_FISA = ${nrFisa} AND ANUL = ${nextYear} AND LUNA = 1`;
    const janCheckResult = depcredDB.exec(janCheckQuery);
    if (janCheckResult.length === 0 || janCheckResult[0].values[0][0] === 0) {
      const numPren = memberNameMap.get(nrFisa) || `Fișa ${nrFisa}`;
      probleme.push({
        nrFisa,
        numPren,
        problema: `Membru eligibil pentru beneficii dar nu are înregistrare ianuarie ${nextYear} (transferul va eșua)`
      });
    }
  }
}

// Dacă s-au găsit probleme, afișează avertizare și oprește procesarea
if (probleme.length > 0) {
  setProblematicMembers(probleme);
  setCalculating(false);

  alert(
    `⚠️ ATENȚIE: S-au detectat ${probleme.length} probleme!\n\n` +
    `Aplicația nu poate continua până când aceste probleme nu sunt rezolvate.\n\n` +
    `Apasă OK pentru a vedea lista detaliată.`
  );

  setShowProblemsDialog(true);
  return; // STOP - nu permite calcul
}
```

---

### Export CSV (liniile 379-415):

```typescript
const exportProblematicMembers = () => {
  if (problematicMembers.length === 0) {
    alert('Nu există membri problematici pentru export.');
    return;
  }

  try {
    // Create CSV content
    const headers = ['Nr. fișă', 'Nume și prenume', 'Problema detectată'];
    let csvContent = headers.join(',') + '\n';

    for (const member of problematicMembers) {
      const row = [
        member.nrFisa,
        `"${member.numPren}"`,
        `"${member.problema}"`
      ];
      csvContent += row.join(',') + '\n';
    }

    // Create download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Membri_Problematici_${selectedYear}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    alert(`Lista exportată în: Membri_Problematici_${selectedYear}.csv`);
  } catch (error) {
    console.error('Error exporting problematic members:', error);
    alert('Eroare la export: ' + (error as Error).message);
  }
};
```

---

## ECHIVALENT PYTHON NECESAR

### Structura datelor:
```python
# Listă de dicționare pentru membri problematici
membri_problematici = []

# Dicționar membru problematic:
{
    'nr_fisa': int,
    'num_pren': str,
    'problema': str
}
```

### Export CSV Python:
```python
import csv

def export_membri_problematici(membri_problematici, an_selectat):
    """Exportă lista de membri problematici în CSV"""
    file_path = f"Membri_Problematici_{an_selectat}.csv"

    with open(file_path, 'w', newline='', encoding='utf-8-sig') as csvfile:
        writer = csv.writer(csvfile)
        writer.writerow(['Nr. fișă', 'Nume și prenume', 'Problema detectată'])

        for membru in membri_problematici:
            writer.writerow([
                membru['nr_fisa'],
                membru['num_pren'],
                membru['problema']
            ])

    return file_path
```

### Dialog PyQt5:
```python
from PyQt5.QtWidgets import (QDialog, QVBoxLayout, QHBoxLayout,
                              QTableWidget, QTableWidgetItem, QPushButton,
                              QLabel, QMessageBox)

class MembriiProblematiciDialog(QDialog):
    def __init__(self, membri_problematici, an_selectat, parent=None):
        super().__init__(parent)
        self.membri_problematici = membri_problematici
        self.an_selectat = an_selectat
        self.setup_ui()

    def setup_ui(self):
        self.setWindowTitle("⚠️ Membri Problematici Detectați")
        self.setMinimumSize(800, 600)

        layout = QVBoxLayout()

        # Header label
        header = QLabel(f"⚠️ S-au detectat {len(self.membri_problematici)} probleme!")
        header.setStyleSheet("font-weight: bold; font-size: 14px; color: red;")
        layout.addWidget(header)

        # Warning message
        warning = QLabel(
            "Aplicația nu poate continua până când aceste probleme nu sunt rezolvate.\n"
            "Corectați datele în bazele de date MEMBRII.db și DEPCRED.db, apoi încercați din nou."
        )
        layout.addWidget(warning)

        # Table
        table = QTableWidget()
        table.setColumnCount(3)
        table.setHorizontalHeaderLabels(['Nr. fișă', 'Nume și prenume', 'Problema detectată'])
        table.setRowCount(len(self.membri_problematici))

        for idx, membru in enumerate(self.membri_problematici):
            table.setItem(idx, 0, QTableWidgetItem(str(membru['nr_fisa'])))
            table.setItem(idx, 1, QTableWidgetItem(membru['num_pren']))
            table.setItem(idx, 2, QTableWidgetItem(membru['problema']))

        table.resizeColumnsToContents()
        layout.addWidget(table)

        # Buttons
        button_layout = QHBoxLayout()

        export_btn = QPushButton("Export Listă CSV")
        export_btn.clicked.connect(self.export_csv)
        button_layout.addWidget(export_btn)

        close_btn = QPushButton("Închide")
        close_btn.clicked.connect(self.accept)
        button_layout.addWidget(close_btn)

        layout.addLayout(button_layout)
        self.setLayout(layout)

    def export_csv(self):
        try:
            file_path = export_membri_problematici(self.membri_problematici, self.an_selectat)
            QMessageBox.information(self, "Export reușit",
                                    f"Lista exportată în: {file_path}")
        except Exception as e:
            QMessageBox.critical(self, "Eroare", f"Eroare la export: {str(e)}")
```

---

## OUTPUT AȘTEPTAT

1. Branch nou creat (ex: `claude/dividende-validation-fixes`)
2. Modificări în `ui/dividende.py`:
   - Query SQL cu filtru SOLD_DECEMBRIE
   - Funcție validare_membri_problematici()
   - Clasa MembriiProblematiciDialog
   - Funcție export_membri_problematici()
   - Blocare calcul dacă probleme
3. Commit-uri clare cu descrieri
4. Push pe branch
5. (opțional) PR creat

---

## IMPORTANT

- **NU include validarea "MEMBRII fără DEPCRED"** - este problematică pentru recalculări istorice
- Păstrează stilul de cod existent din dividende.py
- Folosește EXACT aceleași mesaje de eroare ca în TypeScript
- Testează că dialog-ul QT se deschide corect
- Verifică că CSV-ul se exportă cu encoding UTF-8-SIG (pentru Excel)
- Funcția de calcul trebuie să returneze EARLY cu `return` dacă există probleme

---

## ÎNCEPE

1. Citește fișierul `ui/dividende.py` pentru a înțelege structura
2. Identifică locația exactă după `membri_eligibili_raw = cursor_depcred.fetchall()`
3. Implementează fix-urile în ordinea de mai sus
4. Testează local (dacă posibil)
5. Creează commit-uri descriptive
6. Push pe branch
