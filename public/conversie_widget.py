"""
Widget pentru Conversie RON→EUR DEFINITIVĂ prin clonare baze de date
CONFORM REGULAMENTULUI CE 1103/97 - Conversie directă individuală
"""
import sys
import sqlite3
import shutil
import json
import os
from pathlib import Path
from PyQt5.QtWidgets import (
    QApplication, QWidget, QVBoxLayout, QHBoxLayout, QFormLayout,
    QLabel, QPushButton, QLineEdit, QSpinBox, QTextEdit, QGroupBox,
    QSizePolicy, QFrame, QProgressBar, QMessageBox,
    QSpacerItem, QGridLayout, QCheckBox
)
from PyQt5.QtCore import Qt, QThread, pyqtSignal
from PyQt5.QtGui import QFont, QDoubleValidator
from decimal import Decimal, ROUND_HALF_UP, InvalidOperation
from datetime import datetime

# Import pentru file locking compatibil cross-platform
if sys.platform == "win32":
    import msvcrt
else:
    try:
        import fcntl
    except ImportError:
        fcntl = None

class ValidationError(Exception):
    """Excepție personalizată pentru erori de validare critice"""
    pass

class SchemaError(Exception):
    """Excepție pentru erori de structură a bazei de date"""
    pass

class ConversionStoppedException(Exception):
    """Excepție pentru oprirea conversiei din cauza erorilor critice"""
    pass


class MemberIntegrityValidator:
    """Validator pentru integritatea datelor între bazele MEMBRII și DEPCRED"""

    @staticmethod
    def validate_member_consistency(depcred_path: Path, membrii_path: Path) -> dict:
        """
        Validează consistența membrilor între DEPCRED și MEMBRII
        Returnează raport detaliat cu discrepanțele identificate
        """
        result = {
            "valid": True,
            "total_membrii": 0,
            "distinct_depcred": 0,
            "difference": 0,
            "members_only_in_membrii": [],
            "members_only_in_depcred": [],
            "missing_from_membrii": [],
            "missing_from_depcred": [],
            "inconsistent_data": [],
            "summary": ""
        }

        try:
            # Obține lista membrilor din MEMBRII
            with sqlite3.connect(membrii_path) as conn_membrii:
                cursor = conn_membrii.cursor()
                cursor.execute("SELECT NR_FISA, NUM_PREN FROM MEMBRII ORDER BY NR_FISA")
                membrii_records = cursor.fetchall()

                result["total_membrii"] = len(membrii_records)
                membrii_set = {record[0] for record in membrii_records}
                membrii_details = {record[0]: record[1] for record in membrii_records}

            # Obține lista membrilor distincți din DEPCRED
            with sqlite3.connect(depcred_path) as conn_depcred:
                cursor = conn_depcred.cursor()
                cursor.execute("SELECT DISTINCT NR_FISA FROM DEPCRED ORDER BY NR_FISA")
                depcred_records = cursor.fetchall()

                result["distinct_depcred"] = len(depcred_records)
                depcred_set = {record[0] for record in depcred_records}

            # Calculează diferența
            result["difference"] = result["total_membrii"] - result["distinct_depcred"]

            # Identifică discrepanțele
            members_only_in_membrii = membrii_set - depcred_set
            members_only_in_depcred = depcred_set - membrii_set

            # Populează datele pentru membri care lipsesc
            for nr_fisa in members_only_in_membrii:
                result["members_only_in_membrii"].append({
                    "nr_fisa": nr_fisa,
                    "num_pren": membrii_details.get(nr_fisa, "N/A"),
                    "problem": "Membru înregistrat în MEMBRII dar fără activitate în DEPCRED"
                })

            for nr_fisa in members_only_in_depcred:
                result["members_only_in_depcred"].append({
                    "nr_fisa": nr_fisa,
                    "problem": "Activitate în DEPCRED dar membru neînregistrat în MEMBRII"
                })

            # Determină validitatea generală
            if members_only_in_depcred:
                result["valid"] = False
                result["missing_from_membrii"] = result["members_only_in_depcred"]

            if members_only_in_membrii:
                result["missing_from_depcred"] = result["members_only_in_membrii"]

            # Generează rezumatul
            result["summary"] = MemberIntegrityValidator._generate_summary(result)

        except Exception as e:
            result["valid"] = False
            result["error"] = f"Eroare la validarea integrității membrilor: {str(e)}"

        return result

    @staticmethod
    def _generate_summary(result: dict) -> str:
        """Generează rezumatul validării integrității"""
        summary = f"VALIDARE INTEGRITATE MEMBRI:\n"
        summary += f"╔══════════════════════════════════════════════════════════════════════════════╗\n"
        summary += f"Total membri în MEMBRII: {result['total_membrii']}\n"
        summary += f"Membri distincți în DEPCRED: {result['distinct_depcred']}\n"
        summary += f"Diferența: {result['difference']:+d}\n\n"

        if result["difference"] == 0:
            summary += "✅ PERFECT: Numărul membrilor este consistent între baze\n"
        else:
            summary += f"⚠️ DISCREPANȚĂ DETECTATĂ: {abs(result['difference'])} diferențe\n\n"

            if result["members_only_in_membrii"]:
                summary += f"📋 MEMBRI FĂRĂ ACTIVITATE ({len(result['members_only_in_membrii'])}):\n"
                summary += f"   Membri înregistrați în MEMBRII dar fără înregistrări în DEPCRED:\n"
                for member in result["members_only_in_membrii"][:10]:  # Limitează la primii 10
                    summary += f"   • Fișa {member['nr_fisa']}: {member['num_pren']}\n"
                if len(result["members_only_in_membrii"]) > 10:
                    summary += f"   ... și încă {len(result['members_only_in_membrii']) - 10} membri\n"
                summary += "\n"

            if result["members_only_in_depcred"]:
                summary += f"🚨 MEMBRI NEÎNREGISTRAȚI ({len(result['members_only_in_depcred'])}):\n"
                summary += f"   Activitate financiară fără înregistrare în MEMBRII dar existenți in DEPCRED!:\n"
                for member in result["members_only_in_depcred"][:10]:
                    summary += f"   • Fișa {member['nr_fisa']}: MEMBRU NEÎNREGISTRAT\n"
                if len(result["members_only_in_depcred"]) > 10:
                    summary += f"   ... și încă {len(result['members_only_in_depcred']) - 10} membri\n"
                summary += "\n"

        if not result["valid"]:
            summary += "❌ ACȚIUNE NECESARĂ: Rezolvați discrepanțele înainte de conversie\n"
        else:
            summary += "✅ STATUS: Validare trecută, conversia poate continua\n"

        return summary

class DatabaseSchemaValidator:
    """Validator pentru structura bazelor de date"""

    # Schema așteptată pentru fiecare bază de date
    EXPECTED_SCHEMAS = {
        'DEPCRED': {
            'table': 'DEPCRED',
            'required_columns': ['NR_FISA', 'LUNA', 'ANUL', 'DOBANDA', 'IMPR_DEB',
                                 'IMPR_CRED', 'IMPR_SOLD', 'DEP_DEB', 'DEP_CRED', 'DEP_SOLD', 'PRIMA']
        },
        'MEMBRII': {
            'table': 'MEMBRII',
            'required_columns': ['NR_FISA', 'NUM_PREN', 'DOMICILIUL', 'CALITATEA', 'DATA_INSCR', 'COTIZATIE_STANDARD']
        },
        'ACTIVI': {
            'table': 'ACTIVI',
            'required_columns': ['NR_FISA', 'NUM_PREN', 'DEP_SOLD', 'DIVIDEND']
        },
        'INACTIVI': {
            'table': 'inactivi',  # Notă: numele tabelei este cu literă mică
            'required_columns': ['nr_fisa', 'num_pren', 'lipsa_luni']
        },
        'LICHIDATI': {
            'table': 'lichidati',  # Notă: numele tabelei este cu literă mică
            'required_columns': ['nr_fisa', 'data_lichidare']
        }
    }

    @classmethod
    def validate_database_schema(cls, db_path: Path, db_name: str) -> dict:
        """Validează schema unei baze de date"""
        validation_result = {
            'valid': True,
            'errors': [],
            'warnings': [],
            'db_name': db_name,
            'db_path': str(db_path)
        }

        if not db_path.exists():
            validation_result['valid'] = False
            validation_result['errors'].append(f"Fișierul bazei de date {db_path.name} nu există")
            return validation_result

        if db_path.stat().st_size == 0:
            validation_result['valid'] = False
            validation_result['errors'].append(f"Fișierul bazei de date {db_path.name} este gol")
            return validation_result

        expected_schema = cls.EXPECTED_SCHEMAS.get(db_name)
        if not expected_schema:
            return validation_result

        try:
            with sqlite3.connect(db_path) as conn:
                cursor = conn.cursor()

                # Verifică dacă tabela principală există
                cursor.execute("""
                    SELECT name FROM sqlite_master 
                    WHERE type='table' AND name=?
                """, (expected_schema['table'],))

                if not cursor.fetchone():
                    validation_result['valid'] = False
                    validation_result['errors'].append(
                        f"Tabela '{expected_schema['table']}' nu există în baza de date {db_name}"
                    )
                    return validation_result

                # Verifică coloanele existente
                cursor.execute(f"PRAGMA table_info({expected_schema['table']})")
                existing_columns = [row[1] for row in cursor.fetchall()]

                missing_columns = []
                for required_col in expected_schema['required_columns']:
                    if required_col not in existing_columns:
                        missing_columns.append(required_col)

                if missing_columns:
                    validation_result['valid'] = False
                    validation_result['errors'].append(
                        f"Coloanele lipsă în tabela '{expected_schema['table']}': {', '.join(missing_columns)}"
                    )

                # Verifică dacă tabela are date
                cursor.execute(f"SELECT COUNT(*) FROM {expected_schema['table']}")
                row_count = cursor.fetchone()[0]

                if row_count == 0:
                    validation_result['warnings'].append(
                        f"Tabela '{expected_schema['table']}' nu conține date"
                    )
                else:
                    validation_result['row_count'] = row_count

        except sqlite3.Error as e:
            validation_result['valid'] = False
            validation_result['errors'].append(f"Eroare SQLite la validarea {db_name}: {str(e)}")
        except Exception as e:
            validation_result['valid'] = False
            validation_result['errors'].append(f"Eroare neașteptată la validarea {db_name}: {str(e)}")

        return validation_result

class FileLockManager:
    """Manager pentru blocarea exclusivă a fișierelor pe durata conversiei"""

    def __init__(self):
        self.locks = {}
        self.lock_files = {}

    def acquire_lock(self, file_path):
        """Obține lock exclusiv pe fișier - compatibil Windows și Linux"""
        lock_file_path = f"{file_path}.lock"

        try:
            if sys.platform == "win32":
                # Implementare Windows folosind msvcrt
                lock_file = open(lock_file_path, 'w')
                try:
                    msvcrt.locking(lock_file.fileno(), msvcrt.LK_NBLCK, 1)
                    self.locks[str(file_path)] = lock_file
                    self.lock_files[str(file_path)] = lock_file_path
                    return True
                except (OSError, IOError):
                    lock_file.close()
                    try:
                        os.unlink(lock_file_path)
                    except:
                        pass
                    return False
            else:
                # Implementare Unix/Linux folosind fcntl
                if fcntl is None:
                    print("ATENȚIE: File locking nu este disponibil pe acest sistem")
                    return True

                lock_file = open(lock_file_path, 'w')
                try:
                    fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                    self.locks[str(file_path)] = lock_file
                    self.lock_files[str(file_path)] = lock_file_path
                    return True
                except (IOError, OSError):
                    lock_file.close()
                    try:
                        os.unlink(lock_file_path)
                    except:
                        pass
                    return False

        except Exception as e:
            print(f"Eroare la obținerea lock-ului pentru {file_path}: {e}")
            return False

    def release_all_locks(self):
        """Eliberează toate lock-urile"""
        for file_path, lock_file in self.locks.items():
            try:
                if sys.platform == "win32":
                    msvcrt.locking(lock_file.fileno(), msvcrt.LK_UNLCK, 1)
                else:
                    if fcntl is not None:
                        fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)

                lock_file.close()

                # Șterge fișierul de lock
                lock_file_path = self.lock_files.get(file_path)
                if lock_file_path and os.path.exists(lock_file_path):
                    os.unlink(lock_file_path)

            except Exception as e:
                print(f"Eroare la eliberarea lock-ului pentru {file_path}: {e}")

        self.locks.clear()
        self.lock_files.clear()

class ConversieWorker(QThread):
    """Thread worker pentru aplicarea conversiei DEFINITIVE în background - TOATE BAZELE"""
    progress_update = pyqtSignal(int, str)
    conversion_completed = pyqtSignal(dict)
    conversion_error = pyqtSignal(str)

    def __init__(self, curs_ron_eur: Decimal, utilizator: str = "Administrator"):
        super().__init__()
        self.curs_ron_eur = curs_ron_eur
        self.utilizator = utilizator
        self.raport_erori = []
        self.file_lock_manager = FileLockManager()
        self.validation_errors = []

    def _validate_numeric_field(self, value, field_name: str, allow_zero: bool = True) -> Decimal:
        """Validează și convertește o valoare numerică"""
        if value is None:
            if allow_zero:
                return Decimal('0.00')
            else:
                raise ValidationError(f"Valoare NULL neașteptată în câmpul {field_name}")

        try:
            decimal_value = Decimal(str(value))
            if decimal_value < 0 and field_name in ['COTIZATIE_STANDARD', 'DEP_SOLD']:
                raise ValidationError(f"Valoare negativă nevalidă: {decimal_value}")
            return decimal_value
        except (ValueError, InvalidOperation):
            raise ValidationError(f"Valoarea '{value}' nu poate fi convertită în număr")

    def _validate_all_database_schemas(self, db_paths: dict) -> bool:
        """Validează schema tuturor bazelor de date înainte de conversie"""
        self.progress_update.emit(5, "VALIDARE SCHEMĂ: Verificarea structurii tuturor bazelor de date...")

        schema_errors = []

        for db_key, db_path in db_paths.items():
            db_name = db_key.upper()
            validation_result = DatabaseSchemaValidator.validate_database_schema(db_path, db_name)

            if not validation_result['valid']:
                schema_errors.extend([f"{db_name}: {error}" for error in validation_result['errors']])

            row_count = validation_result.get('row_count', 0)
            self.progress_update.emit(7,
                f"Schema {db_name}: {'✓ Validă' if validation_result['valid'] else '✗ Invalidă'} ({row_count} înregistrări)")

        if schema_errors:
            error_summary = f"ERORI CRITICE DE SCHEMĂ detectate:\n" + "\n".join(schema_errors)
            self.conversion_error.emit(error_summary)
            return False

        self.progress_update.emit(10, "VALIDARE SCHEMĂ COMPLETATĂ: Toate bazele de date au structura corectă")
        return True

    def _comprehensive_data_validation(self, db_paths: dict) -> bool:
        """Validare comprehensivă a tuturor datelor înainte de conversie"""
        self.progress_update.emit(15, "VALIDARE COMPREHENSIVĂ: Verificarea integrității datelor...")
        self.validation_errors = []

        # Validare DEPCRED - TOATE ÎNREGISTRĂRILE
        try:
            with sqlite3.connect(db_paths['depcred']) as conn:
                cursor = conn.cursor()

                cursor.execute("""
                    SELECT NR_FISA, LUNA, ANUL, DOBANDA, IMPR_DEB, IMPR_CRED, 
                           IMPR_SOLD, DEP_DEB, DEP_CRED, DEP_SOLD
                    FROM DEPCRED 
                    ORDER BY ANUL, LUNA, NR_FISA
                """)

                records = cursor.fetchall()
                campuri_monetare = ['DOBANDA', 'IMPR_DEB', 'IMPR_CRED', 'IMPR_SOLD',
                                  'DEP_DEB', 'DEP_CRED', 'DEP_SOLD']

                for record in records:
                    nr_fisa = record[0]
                    for i, camp_name in enumerate(campuri_monetare):
                        try:
                            self._validate_numeric_field(record[i + 3], camp_name, allow_zero=True)
                        except ValidationError as e:
                            self.validation_errors.append({
                                "baza": "DEPCRED",
                                "nr_fisa": nr_fisa,
                                "camp": camp_name,
                                "eroare": str(e)
                            })
                            self.conversion_error.emit(f"Date invalide în DEPCRED: Fișa {nr_fisa}, {camp_name}")
                            return False

                self.progress_update.emit(20, f"VALIDARE DEPCRED: {len(records)} înregistrări verificate")

        except Exception as e:
            self.conversion_error.emit(f"Eroare critică la validarea DEPCRED: {str(e)}")
            return False

        # Validare MEMBRII - TOATE ÎNREGISTRĂRILE
        try:
            with sqlite3.connect(db_paths['membrii']) as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT NR_FISA, COTIZATIE_STANDARD FROM MEMBRII")

                members = cursor.fetchall()
                for nr_fisa, cotizatie in members:
                    try:
                        self._validate_numeric_field(cotizatie, 'COTIZATIE_STANDARD', allow_zero=True)
                    except ValidationError as e:
                        self.validation_errors.append({
                            "baza": "MEMBRII",
                            "nr_fisa": nr_fisa,
                            "camp": "COTIZATIE_STANDARD",
                            "eroare": str(e)
                        })
                        self.conversion_error.emit(f"Date invalide în MEMBRII: Fișa {nr_fisa}, COTIZATIE_STANDARD")
                        return False

                self.progress_update.emit(25, f"VALIDARE MEMBRII: {len(members)} membri verificați")

        except Exception as e:
            self.conversion_error.emit(f"Eroare critică la validarea MEMBRII: {str(e)}")
            return False

        # Validare ACTIVI - TOATE ÎNREGISTRĂRILE
        try:
            with sqlite3.connect(db_paths['activi']) as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT NR_FISA, DEP_SOLD, DIVIDEND, BENEFICIU FROM ACTIVI")

                activi_records = cursor.fetchall()
                campuri_monetare_activi = ['DEP_SOLD', 'DIVIDEND', 'BENEFICIU']

                for record in activi_records:
                    nr_fisa = record[0]
                    for i, camp_name in enumerate(campuri_monetare_activi):
                        try:
                            self._validate_numeric_field(record[i + 1], camp_name, allow_zero=True)
                        except ValidationError as e:
                            self.validation_errors.append({
                                "baza": "ACTIVI",
                                "nr_fisa": nr_fisa,
                                "camp": camp_name,
                                "eroare": str(e)
                            })
                            self.conversion_error.emit(f"Date invalide în ACTIVI: Fișa {nr_fisa}, {camp_name}")
                            return False

                self.progress_update.emit(30, f"VALIDARE ACTIVI: {len(activi_records)} membri activi verificați")

        except Exception as e:
            self.conversion_error.emit(f"Eroare critică la validarea ACTIVI: {str(e)}")
            return False

        if self.validation_errors:
            error_summary = f"Detectate {len(self.validation_errors)} erori critice care opresc conversia"
            self.conversion_error.emit(error_summary)
            return False

        self.progress_update.emit(35, "VALIDARE DATELOR COMPLETATĂ: Toate datele sunt valide pentru conversie")
        return True

    def _acquire_all_locks(self, db_paths: dict) -> bool:
        """Obține lock-uri exclusive pe toate bazele de date"""
        self.progress_update.emit(40, "Obținere lock-uri exclusive pe toate bazele de date...")

        for file_path in db_paths.values():
            if not self.file_lock_manager.acquire_lock(file_path):
                self.file_lock_manager.release_all_locks()
                self.conversion_error.emit(f"Nu s-a putut obține lock exclusiv pe {file_path}. "
                                         f"Verificați că aplicația principală nu folosește bazele de date.")
                return False

        self.progress_update.emit(45, f"Lock-uri exclusive obținute pe {len(db_paths)} fișiere")
        return True

    def _convert_depcred_eu_compliant(self, db_path: Path, curs: Decimal) -> dict:
        """
        Convertește DEPCRED conform Regulamentului CE 1103/97 - CONVERSIE DIRECTĂ INDIVIDUALĂ
        Fiecare înregistrare se convertește independent, fără distribuție proporțională
        """
        rezultat = {
            "success": True,
            "total_inregistrari": 0,
            "inregistrari_convertite": 0,
            "suma_originala_ron": Decimal("0.00"),
            "suma_rezultat_eur": Decimal("0.00"),
            "suma_teoretica_eur": Decimal("0.00"),
            "diferenta_rotunjire": Decimal("0.00"),
            "campuri_procesate": ["DOBANDA", "IMPR_DEB", "IMPR_CRED", "IMPR_SOLD",
                                 "DEP_DEB", "DEP_CRED", "DEP_SOLD"]
        }

        try:
            with sqlite3.connect(db_path) as conn:
                cursor = conn.cursor()

                cursor.execute("SELECT COUNT(*) FROM DEPCRED")
                rezultat["total_inregistrari"] = cursor.fetchone()[0]

                cursor.execute("""
                    SELECT rowid, NR_FISA, LUNA, ANUL, DOBANDA, IMPR_DEB, IMPR_CRED, 
                           IMPR_SOLD, DEP_DEB, DEP_CRED, DEP_SOLD
                    FROM DEPCRED 
                    ORDER BY ANUL, LUNA, NR_FISA
                """)

                rows = cursor.fetchall()

                # CONVERSIE DIRECTĂ CONFORM UE - FIECARE ÎNREGISTRARE INDEPENDENT
                for row in rows:
                    rowid = row[0]
                    nr_fisa = row[1]
                    converted_values = []

                    for i, field_name in enumerate(rezultat["campuri_procesate"]):
                        # Obține valoarea RON
                        val_ron = self._validate_numeric_field(row[i + 4], field_name, allow_zero=True)

                        # CONVERSIE DIRECTĂ - CONFORM REGULAMENTULUI CE 1103/97
                        val_eur = (val_ron / curs).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

                        converted_values.append(float(val_eur))

                        # Acumulează pentru statistici
                        rezultat["suma_originala_ron"] += val_ron
                        rezultat["suma_rezultat_eur"] += val_eur

                    # Actualizează înregistrarea în baza de date
                    cursor.execute("""
                        UPDATE DEPCRED SET 
                            DOBANDA = ?, IMPR_DEB = ?, IMPR_CRED = ?, IMPR_SOLD = ?,
                            DEP_DEB = ?, DEP_CRED = ?, DEP_SOLD = ?
                        WHERE rowid = ?
                    """, (*converted_values, rowid))

                    rezultat["inregistrari_convertite"] += 1

                    if rezultat["inregistrari_convertite"] % 100 == 0:
                        progress = 50 + int(rezultat["inregistrari_convertite"] / len(rows) * 10)
                        self.progress_update.emit(progress,
                            f"DEPCRED: {rezultat['inregistrari_convertite']}/{len(rows)} înregistrări (conversie UE)...")

                # Calculează diferența de rotunjire (legitimă conform UE)
                rezultat["suma_teoretica_eur"] = (rezultat["suma_originala_ron"] / curs).quantize(
                    Decimal('0.01'), rounding=ROUND_HALF_UP)
                rezultat["diferenta_rotunjire"] = rezultat["suma_rezultat_eur"] - rezultat["suma_teoretica_eur"]

                conn.commit()

        except Exception as e:
            rezultat["success"] = False
            self.conversion_error.emit(f"Eroare critică conversie DEPCRED: {str(e)}")

        return rezultat

    def _convert_membrii_eu_compliant(self, db_path: Path, curs: Decimal) -> dict:
        """
        Convertește MEMBRII conform Regulamentului CE 1103/97 - CONVERSIE DIRECTĂ INDIVIDUALĂ
        Fiecare cotizație se convertește independent
        """
        rezultat = {
            "success": True,
            "total_membri": 0,
            "membri_convertiti": 0,
            "suma_originala_ron": Decimal("0.00"),
            "suma_rezultat_eur": Decimal("0.00"),
            "suma_teoretica_eur": Decimal("0.00"),
            "diferenta_rotunjire": Decimal("0.00")
        }

        try:
            with sqlite3.connect(db_path) as conn:
                cursor = conn.cursor()

                cursor.execute("SELECT COUNT(*) FROM MEMBRII")
                rezultat["total_membri"] = cursor.fetchone()[0]

                cursor.execute("SELECT NR_FISA, COTIZATIE_STANDARD FROM MEMBRII")
                membri = cursor.fetchall()

                # CONVERSIE DIRECTĂ CONFORM UE - FIECARE MEMBRU INDEPENDENT
                for nr_fisa, cotizatie_ron in membri:
                    # Validează valoarea
                    ron = self._validate_numeric_field(cotizatie_ron, "COTIZATIE_STANDARD", allow_zero=True)

                    # CONVERSIE DIRECTĂ - CONFORM REGULAMENTULUI CE 1103/97
                    eur = (ron / curs).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

                    # Actualizează în baza de date
                    cursor.execute("UPDATE MEMBRII SET COTIZATIE_STANDARD = ? WHERE NR_FISA = ?",
                                 (float(eur), nr_fisa))

                    # Acumulează pentru statistici
                    rezultat["suma_originala_ron"] += ron
                    rezultat["suma_rezultat_eur"] += eur
                    rezultat["membri_convertiti"] += 1

                    if rezultat["membri_convertiti"] % 100 == 0:
                        progress = 60 + int(rezultat["membri_convertiti"] / len(membri) * 10)
                        self.progress_update.emit(progress,
                            f"MEMBRII: {rezultat['membri_convertiti']}/{len(membri)} membri (conversie UE)...")

                # Calculează diferența de rotunjire (legitimă conform UE)
                rezultat["suma_teoretica_eur"] = (rezultat["suma_originala_ron"] / curs).quantize(
                    Decimal('0.01'), rounding=ROUND_HALF_UP)
                rezultat["diferenta_rotunjire"] = rezultat["suma_rezultat_eur"] - rezultat["suma_teoretica_eur"]

                conn.commit()

        except Exception as e:
            rezultat["success"] = False
            self.conversion_error.emit(f"Eroare critică conversie MEMBRII: {str(e)}")

        return rezultat

    def _convert_activi_eu_compliant(self, db_path: Path, curs: Decimal) -> dict:
        """
        Convertește ACTIVI conform Regulamentului CE 1103/97 - CONVERSIE DIRECTĂ INDIVIDUALĂ
        """
        rezultat = {
            "success": True,
            "total_activi": 0,
            "activi_convertiti": 0,
            "suma_originala_ron": Decimal("0.00"),
            "suma_rezultat_eur": Decimal("0.00"),
            "suma_teoretica_eur": Decimal("0.00"),
            "diferenta_rotunjire": Decimal("0.00"),
            "campuri_procesate": ["DEP_SOLD", "DIVIDEND", "BENEFICIU"]
        }

        try:
            with sqlite3.connect(db_path) as conn:
                cursor = conn.cursor()

                cursor.execute("SELECT COUNT(*) FROM ACTIVI")
                rezultat["total_activi"] = cursor.fetchone()[0]

                cursor.execute("SELECT NR_FISA, DEP_SOLD, DIVIDEND, BENEFICIU FROM ACTIVI")
                activi = cursor.fetchall()

                # CONVERSIE DIRECTĂ CONFORM UE - FIECARE MEMBRU ACTIV INDEPENDENT
                for nr_fisa, dep_sold, dividend, beneficiu in activi:
                    # Validează și convertește fiecare câmp individual
                    dep_sold_ron = self._validate_numeric_field(dep_sold, "DEP_SOLD", allow_zero=True)
                    dividend_ron = self._validate_numeric_field(dividend, "DIVIDEND", allow_zero=True)
                    beneficiu_ron = self._validate_numeric_field(beneficiu, "BENEFICIU", allow_zero=True)

                    # CONVERSIE DIRECTĂ - CONFORM REGULAMENTULUI CE 1103/97
                    dep_sold_eur = (dep_sold_ron / curs).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
                    dividend_eur = (dividend_ron / curs).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
                    beneficiu_eur = (beneficiu_ron / curs).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

                    # Actualizează în baza de date
                    cursor.execute("""
                        UPDATE ACTIVI SET 
                            DEP_SOLD = ?, DIVIDEND = ?, BENEFICIU = ?
                        WHERE NR_FISA = ?
                    """, (float(dep_sold_eur), float(dividend_eur), float(beneficiu_eur), nr_fisa))

                    # Acumulează pentru statistici
                    suma_ron_membru = dep_sold_ron + dividend_ron + beneficiu_ron
                    suma_eur_membru = dep_sold_eur + dividend_eur + beneficiu_eur

                    rezultat["suma_originala_ron"] += suma_ron_membru
                    rezultat["suma_rezultat_eur"] += suma_eur_membru
                    rezultat["activi_convertiti"] += 1

                    if rezultat["activi_convertiti"] % 50 == 0:
                        progress = 70 + int(rezultat["activi_convertiti"] / len(activi) * 10)
                        self.progress_update.emit(progress,
                            f"ACTIVI: {rezultat['activi_convertiti']}/{len(activi)} membri activi (conversie UE)...")

                # Calculează diferența de rotunjire (legitimă conform UE)
                rezultat["suma_teoretica_eur"] = (rezultat["suma_originala_ron"] / curs).quantize(
                    Decimal('0.01'), rounding=ROUND_HALF_UP)
                rezultat["diferenta_rotunjire"] = rezultat["suma_rezultat_eur"] - rezultat["suma_teoretica_eur"]

                conn.commit()

        except Exception as e:
            rezultat["success"] = False
            self.conversion_error.emit(f"Eroare critică conversie ACTIVI: {str(e)}")

        return rezultat

    def _clone_database_direct(self, source_path: Path, dest_path: Path, db_name: str) -> dict:
        """Clonează direct bazele de date fără conversie monetară"""
        rezultat = {
            "success": True,
            "db_name": db_name,
            "source_size": 0,
            "dest_size": 0,
            "records_count": 0
        }

        try:
            # Verifică sursa
            if not source_path.exists():
                raise FileNotFoundError(f"Fișierul sursă {source_path} nu există")

            rezultat["source_size"] = source_path.stat().st_size

            # Clonare directă
            shutil.copy2(source_path, dest_path)

            # Verifică destinația
            if not dest_path.exists():
                raise Exception(f"Clonarea a eșuat pentru {dest_path}")

            rezultat["dest_size"] = dest_path.stat().st_size

            # Numără înregistrările pentru statistică
            with sqlite3.connect(dest_path) as conn:
                cursor = conn.cursor()
                table_name = DatabaseSchemaValidator.EXPECTED_SCHEMAS[db_name]['table']
                cursor.execute(f"SELECT COUNT(*) FROM {table_name}")
                rezultat["records_count"] = cursor.fetchone()[0]

        except Exception as e:
            rezultat["success"] = False
            self.conversion_error.emit(f"Eroare critică la clonarea {db_name}: {str(e)}")

        return rezultat

    def run(self):
        """Execută conversia definitivă conform UE - CONVERSIE DIRECTĂ INDIVIDUALĂ"""
        self.raport_erori = []
        self.validation_errors = []

        try:
            # Define paths - TOATE CELE 5 BAZE
            base_path = Path(__file__).resolve().parent if not getattr(sys, 'frozen', False) else Path(sys.executable).parent

            # Bazele de date originale
            db_paths = {
                'depcred': base_path / "DEPCRED.db",
                'membrii': base_path / "MEMBRII.db",
                'activi': base_path / "activi.db",
                'inactivi': base_path / "INACTIVI.db",
                'lichidati': base_path / "LICHIDATI.db"
            }

            # Bazele de date clonate (EUR)
            db_paths_eur = {
                'depcred': base_path / "DEPCREDEUR.db",
                'membrii': base_path / "MEMBRIIEUR.db",
                'activi': base_path / "activiEUR.db",
                'inactivi': base_path / "INACTIVIEUR.db",
                'lichidati': base_path / "LICHIDATIEUR.db"
            }

            # ETAPA 1: Validare schemă baze de date
            if not self._validate_all_database_schemas(db_paths):
                return

            # ETAPA 2: Validare comprehensivă
            if not self._comprehensive_data_validation(db_paths):
                return

            # ETAPA 3: Obținere lock-uri exclusive
            if not self._acquire_all_locks(db_paths):
                return

            # ETAPA 4: Clonare baze de date
            self.progress_update.emit(48, "Clonare toate bazele de date...")

            for (sursa_key, sursa), (dest_key, destinatie) in zip(db_paths.items(), db_paths_eur.items()):
                self.progress_update.emit(49, f"Clonare {sursa.name} -> {destinatie.name}...")
                shutil.copy2(sursa, destinatie)
                if not destinatie.exists() or destinatie.stat().st_size == 0:
                    raise Exception(f"EROARE CLONARE: Fișierul {destinatie.name} nu a fost creat corect")

            # ETAPA 5: Conversie DEPCRED (conversie EU conformă)
            self.progress_update.emit(50, "Conversie DEPCRED - conform Regulamentului CE 1103/97...")
            rezultat_depcred = self._convert_depcred_eu_compliant(db_paths_eur['depcred'], self.curs_ron_eur)
            if not rezultat_depcred['success']:
                raise ConversionStoppedException("Conversie DEPCRED oprită din cauza erorilor")

            # ETAPA 6: Conversie MEMBRII (conversie EU conformă)
            self.progress_update.emit(60, "Conversie MEMBRII - conform Regulamentului CE 1103/97...")
            rezultat_membrii = self._convert_membrii_eu_compliant(db_paths_eur['membrii'], self.curs_ron_eur)
            if not rezultat_membrii['success']:
                raise ConversionStoppedException("Conversie MEMBRII oprită din cauza erorilor")

            # ETAPA 7: Conversie ACTIVI (conversie EU conformă)
            self.progress_update.emit(70, "Conversie ACTIVI - conform Regulamentului CE 1103/97...")
            rezultat_activi = self._convert_activi_eu_compliant(db_paths_eur['activi'], self.curs_ron_eur)
            if not rezultat_activi['success']:
                raise ConversionStoppedException("Conversie ACTIVI oprită din cauza erorilor")

            # ETAPA 8: Clonare INACTIVI (clonare directă)
            self.progress_update.emit(80, "Clonare INACTIVI - copiere directă...")
            rezultat_inactivi = self._clone_database_direct(
                db_paths['inactivi'], db_paths_eur['inactivi'], 'INACTIVI'
            )
            if not rezultat_inactivi['success']:
                raise ConversionStoppedException("Clonare INACTIVI oprită din cauza erorilor")

            # ETAPA 9: Clonare LICHIDATI (clonare directă)
            self.progress_update.emit(85, "Clonare LICHIDATI - copiere directă...")
            rezultat_lichidati = self._clone_database_direct(
                db_paths['lichidati'], db_paths_eur['lichidati'], 'LICHIDATI'
            )
            if not rezultat_lichidati['success']:
                raise ConversionStoppedException("Clonare LICHIDATI oprită din cauza erorilor")

            # ETAPA 10: Calcularea diferențelor de rotunjire finale
            self.progress_update.emit(90, "Calcularea diferențelor de rotunjire conform UE...")

            suma_totala_ron = (rezultat_depcred['suma_originala_ron'] +
                             rezultat_membrii['suma_originala_ron'] +
                             rezultat_activi['suma_originala_ron'])

            suma_totala_eur = (rezultat_depcred['suma_rezultat_eur'] +
                             rezultat_membrii['suma_rezultat_eur'] +
                             rezultat_activi['suma_rezultat_eur'])

            suma_teoretica_totala = (suma_totala_ron / self.curs_ron_eur).quantize(
                Decimal('0.01'), ROUND_HALF_UP)

            diferenta_rotunjire_totala = suma_totala_eur - suma_teoretica_totala

            # ETAPA 11: Salvare configurație
            self._save_conversion_status()

            self.progress_update.emit(100, "Conversie definitivă completată conform UE - TOATE BAZELE!")

            rezultat = {
                "success": True,
                "rezultat_depcred": rezultat_depcred,
                "rezultat_membrii": rezultat_membrii,
                "rezultat_activi": rezultat_activi,
                "rezultat_inactivi": rezultat_inactivi,
                "rezultat_lichidati": rezultat_lichidati,
                "rezumat_final": {
                    "suma_originala_ron": float(suma_totala_ron),
                    "suma_rezultat_eur": float(suma_totala_eur),
                    "suma_teoretica_eur": float(suma_teoretica_totala),
                    "diferenta_rotunjire_totala": float(diferenta_rotunjire_totala),
                    "diferenta_depcred": float(rezultat_depcred['diferenta_rotunjire']),
                    "diferenta_membrii": float(rezultat_membrii['diferenta_rotunjire']),
                    "diferenta_activi": float(rezultat_activi['diferenta_rotunjire'])
                },
                "curs_folosit": float(self.curs_ron_eur),
                "utilizator": self.utilizator,
                "timestamp_finalizare": datetime.now().isoformat(),
                "metoda_conversie": "Directă individuală conform Regulamentului CE 1103/97",
                "fisiere_create": {
                    "depcred_eur": str(db_paths_eur['depcred']),
                    "membrii_eur": str(db_paths_eur['membrii']),
                    "activi_eur": str(db_paths_eur['activi']),
                    "inactivi_eur": str(db_paths_eur['inactivi']),
                    "lichidati_eur": str(db_paths_eur['lichidati'])
                }
            }

            self.conversion_completed.emit(rezultat)

        except ConversionStoppedException as e:
            self.conversion_error.emit(f"CONVERSIE OPRITĂ: {str(e)}")
        except Exception as e:
            self.conversion_error.emit(f"EROARE CRITICĂ: {str(e)}")
        finally:
            self.file_lock_manager.release_all_locks()

    def _save_conversion_status(self):
        """Salvează statusul conversiei într-un fișier"""
        base_path = Path(__file__).resolve().parent if not getattr(sys, 'frozen', False) else Path(sys.executable).parent
        status_file = base_path / "dual_currency.json"

        status = {
            "conversie_aplicata": True,
            "data_conversie": datetime.now().isoformat(),
            "curs_folosit": float(self.curs_ron_eur),
            "utilizator": self.utilizator,
            "metoda_conversie": "Directă individuală conform Regulamentului CE 1103/97",
            "baze_convertite": ["DEPCRED", "MEMBRII", "ACTIVI", "INACTIVI", "LICHIDATI"]
        }

        with open(status_file, 'w', encoding='utf-8') as f:
            json.dump(status, f, indent=4, ensure_ascii=False)


class ConversieWidget(QWidget):
    """Widget autonom pentru conversia RON→EUR DEFINITIVĂ conform UE - TOATE BAZELE"""

    def __init__(self, parent=None):
        super().__init__(parent)
        self.preview_data = None
        self.conversie_worker = None
        self.final_results = None
        self.member_integrity_data = None
        self.initUI()
        self.aplicare_stiluri()

    def initUI(self):
        """Inițializează interfața"""
        main_layout = QVBoxLayout(self)
        main_layout.setContentsMargins(15, 15, 15, 15)
        main_layout.setSpacing(10)

        # Titlu
        title_label = QLabel("CONVERSIE RON→EUR DEFINITIVĂ - CONFORM UE")
        title_label.setAlignment(Qt.AlignCenter)
        title_label.setObjectName("titleLabel")
        main_layout.addWidget(title_label)

        # Layout principal cu 2 coloane
        panels_layout = QHBoxLayout()
        panels_layout.setSpacing(15)

        # Panou stâng - Configurare
        left_panel = self.create_config_panel()
        panels_layout.addWidget(left_panel, 1)

        # Panou drept - Preview și Jurnal
        right_panel = self.create_preview_panel()
        panels_layout.addWidget(right_panel, 1)

        main_layout.addLayout(panels_layout)

    def create_config_panel(self):
        """Creează panoul de configurare"""
        config_widget = QWidget()
        config_layout = QVBoxLayout(config_widget)
        config_layout.setSpacing(10)

        # Status sistem
        status_check = self._check_system_status()
        if status_check != "ready":
            warning_label = QLabel(f"⚠️ {status_check}")
            warning_label.setObjectName("warningLabel")
            config_layout.addWidget(warning_label)

        # Parametri conversie
        params_group = QGroupBox("Parametri Conversie")
        params_group.setObjectName("paramsGroup")
        params_layout = QFormLayout(params_group)
        params_layout.setSpacing(8)

        self.curs_input = QLineEdit()
        self.curs_input.setPlaceholderText("4.9435")
        self.curs_input.setText("4.9435")
        self.curs_input.setValidator(QDoubleValidator(0.0001, 10.0, 6))
        self.curs_input.setObjectName("cursInput")
        params_layout.addRow("Curs RON/EUR:", self.curs_input)

        curs_info = QLabel("(1 EUR = X RON)")
        curs_info.setObjectName("cursInfo")
        params_layout.addRow("", curs_info)

        self.utilizator_input = QLineEdit()
        self.utilizator_input.setText("Administrator")
        self.utilizator_input.setObjectName("utilizatorInput")
        params_layout.addRow("Utilizator:", self.utilizator_input)

        metoda_info = QLabel("Metodă: Conversie directă individuală (CE 1103/97)")
        metoda_info.setObjectName("metodaInfo")
        params_layout.addRow("", metoda_info)

        config_layout.addWidget(params_group)

        # Acțiuni
        actions_group = QGroupBox("Acțiuni")
        actions_group.setObjectName("actionsGroup")
        actions_layout = QVBoxLayout(actions_group)

        # Checkbox-uri informative
        self.check_preview = QCheckBox("Preview generat")
        self.check_preview.setEnabled(False)
        actions_layout.addWidget(self.check_preview)

        self.check_validare = QCheckBox("Validare strictă UE activă")
        self.check_validare.setChecked(True)
        self.check_validare.setEnabled(False)
        actions_layout.addWidget(self.check_validare)

        self.check_eu_compliant = QCheckBox("Conversie conform Regulamentului CE 1103/97")
        self.check_eu_compliant.setChecked(True)
        self.check_eu_compliant.setEnabled(False)
        actions_layout.addWidget(self.check_eu_compliant)

        # Butoane
        buttons_grid = QGridLayout()
        buttons_grid.setSpacing(8)

        self.btn_preview = QPushButton("Generare Preview")
        self.btn_preview.setObjectName("btnPreview")
        self.btn_preview.clicked.connect(self.genereaza_preview)
        buttons_grid.addWidget(self.btn_preview, 0, 0)

        self.btn_aplica = QPushButton("APLICĂ CONVERSIE")
        self.btn_aplica.setObjectName("btnAplica")
        self.btn_aplica.setEnabled(False)
        self.btn_aplica.clicked.connect(self.aplica_conversie)
        buttons_grid.addWidget(self.btn_aplica, 0, 1)

        self.btn_reset = QPushButton("Reset")
        self.btn_reset.setObjectName("btnReset")
        self.btn_reset.clicked.connect(self.reset_form)
        buttons_grid.addWidget(self.btn_reset, 1, 0)

        self.btn_export = QPushButton("Export Raport")
        self.btn_export.setObjectName("btnExport")
        self.btn_export.setEnabled(False)
        self.btn_export.clicked.connect(self.export_raport)
        buttons_grid.addWidget(self.btn_export, 1, 1)

        actions_layout.addLayout(buttons_grid)
        config_layout.addWidget(actions_group)

        # Progres
        progress_group = QGroupBox("Progres Operații")
        progress_layout = QVBoxLayout(progress_group)

        self.progress_bar = QProgressBar()
        self.progress_bar.setVisible(False)
        progress_layout.addWidget(self.progress_bar)

        self.status_label = QLabel("")
        self.status_label.setWordWrap(True)
        progress_layout.addWidget(self.status_label)

        config_layout.addWidget(progress_group)

        config_layout.addStretch()

        return config_widget

    def create_preview_panel(self):
        """Creează panoul de preview"""
        preview_widget = QWidget()
        preview_layout = QVBoxLayout(preview_widget)
        preview_layout.setSpacing(10)

        # Preview (70% din spațiu)
        preview_group = QGroupBox("Previzualizare Conversie")
        preview_group_layout = QVBoxLayout(preview_group)

        self.preview_text = QTextEdit()
        self.preview_text.setReadOnly(True)
        preview_group_layout.addWidget(self.preview_text)

        preview_layout.addWidget(preview_group, 7)  # 70% weight

        # Jurnal (30% din spațiu)
        jurnal_group = QGroupBox("Jurnal Operații")
        jurnal_layout = QVBoxLayout(jurnal_group)

        self.jurnal_text = QTextEdit()
        self.jurnal_text.setReadOnly(True)
        self.jurnal_text.setMinimumHeight(150)  # Minimă rezonabilă

        # Mesajele inițiale
        self.adauga_in_jurnal("Widget inițializat - conversie conform Regulamentului CE 1103/97")
        self.adauga_in_jurnal("Metodă: Conversie directă individuală (fără distribuție proporțională)")

        jurnal_layout.addWidget(self.jurnal_text)
        preview_layout.addWidget(jurnal_group, 3)  # 30% weight

        return preview_widget

    def _check_system_status(self):
        """Verifică starea sistemului"""
        base_path = Path(__file__).resolve().parent if not getattr(sys, 'frozen', False) else Path(sys.executable).parent

        # Verifică dacă conversia a fost deja aplicată
        status_file = base_path / "dual_currency.json"
        if status_file.exists():
            try:
                with open(status_file, 'r', encoding='utf-8') as f:
                    status = json.load(f)
                    if status.get('conversie_aplicata'):
                        return f"Conversia a fost aplicată la {status.get('data_conversie', 'N/A')}"
            except:
                pass

        # Verifică dacă bazele EUR există deja
        eur_dbs = ["DEPCREDEUR.db", "MEMBRIIEUR.db", "activiEUR.db", "INACTIVIEUR.db", "LICHIDATIEUR.db"]
        existing = [db for db in eur_dbs if (base_path / db).exists()]

        if existing:
            return f"Bazele EUR există deja: {', '.join(existing)}"

        return "ready"

    def genereaza_preview(self):
        """Generează preview cu validare integritate membri pentru toate bazele"""
        if not self.valideaza_input():
            return

        curs_text = self.curs_input.text().replace(',', '.')

        try:
            curs_decimal = Decimal(curs_text)
        except Exception as e:
            QMessageBox.warning(self, "Eroare", f"Cursul de schimb nu este valid: {e}")
            return

        self.adauga_in_jurnal(f"Preview generat - Curs: {curs_decimal:.6f} (conform UE)")
        self.adauga_in_jurnal("Validare integritate membri în curs...")

        try:
            base_path = Path(__file__).resolve().parent if not getattr(sys, 'frozen', False) else Path(
                sys.executable).parent

            # Verifică toate bazele de date
            db_files = {
                "DEPCRED": base_path / "DEPCRED.db",
                "MEMBRII": base_path / "MEMBRII.db",
                "ACTIVI": base_path / "activi.db",
                "INACTIVI": base_path / "INACTIVI.db",
                "LICHIDATI": base_path / "LICHIDATI.db"
            }

            missing_dbs = [name for name, path in db_files.items() if not path.exists()]
            if missing_dbs:
                raise FileNotFoundError(f"Bazele de date lipsesc: {', '.join(missing_dbs)}")

            # VALIDARE INTEGRITATE MEMBRI
            self.member_integrity_data = MemberIntegrityValidator.validate_member_consistency(
                db_files["DEPCRED"], db_files["MEMBRII"]
            )

            if not self.member_integrity_data["valid"]:
                self.adauga_in_jurnal("⚠️ DISCREPANȚE CRITICE detectate în integritatea membrilor")
            else:
                self.adauga_in_jurnal("✅ Integritate membri validată cu succes")

            # Colectează statistici pentru toate bazele
            db_stats = {}
            suma_totala_monetara = Decimal("0.00")

            for db_name, db_path in db_files.items():
                with sqlite3.connect(db_path) as conn:
                    cursor = conn.cursor()

                    if db_name == "DEPCRED":
                        cursor.execute("""
                            SELECT COUNT(DISTINCT NR_FISA), COUNT(*),
                                   COALESCE(SUM(DOBANDA + IMPR_DEB + IMPR_CRED + IMPR_SOLD + 
                                               DEP_DEB + DEP_CRED + DEP_SOLD), 0)
                            FROM DEPCRED
                        """)
                        membri_distincti, total_inreg, suma = cursor.fetchone()
                        suma_decimal = Decimal(str(suma or '0.00'))
                        suma_totala_monetara += suma_decimal

                        db_stats[db_name] = {
                            "membri_distincti": membri_distincti or 0,
                            "total_inregistrari": total_inreg or 0,
                            "suma_monetara": suma_decimal,
                            "tip": "monetar_direct_ue"
                        }

                    elif db_name == "MEMBRII":
                        cursor.execute("SELECT COUNT(*), COALESCE(SUM(COTIZATIE_STANDARD), 0) FROM MEMBRII")
                        total_membri, suma_cotizatii = cursor.fetchone()
                        suma_decimal = Decimal(str(suma_cotizatii or '0.00'))
                        suma_totala_monetara += suma_decimal

                        db_stats[db_name] = {
                            "total_membri": total_membri or 0,
                            "suma_monetara": suma_decimal,
                            "tip": "monetar_direct_ue"
                        }

                    elif db_name == "ACTIVI":
                        cursor.execute("""
                            SELECT COUNT(*), 
                                   COALESCE(SUM(DEP_SOLD + DIVIDEND + BENEFICIU), 0)
                            FROM ACTIVI
                        """)
                        total_activi, suma_activi = cursor.fetchone()
                        suma_decimal = Decimal(str(suma_activi or '0.00'))
                        suma_totala_monetara += suma_decimal

                        db_stats[db_name] = {
                            "total_activi": total_activi or 0,
                            "suma_monetara": suma_decimal,
                            "tip": "monetar_direct_ue"
                        }

                    elif db_name == "INACTIVI":
                        cursor.execute("SELECT COUNT(*) FROM inactivi")
                        total_inactivi = cursor.fetchone()[0]

                        db_stats[db_name] = {
                            "total_inactivi": total_inactivi or 0,
                            "tip": "non_monetar"
                        }

                    elif db_name == "LICHIDATI":
                        cursor.execute("SELECT COUNT(*) FROM lichidati")
                        total_lichidati = cursor.fetchone()[0]

                        db_stats[db_name] = {
                            "total_lichidati": total_lichidati or 0,
                            "tip": "non_monetar"
                        }

            # Calculează estimarea pentru conversie directă UE
            suma_estimata_eur = (suma_totala_monetara / curs_decimal).quantize(
                Decimal('0.01'), rounding=ROUND_HALF_UP)

            # Calculează fiecare sumă individual pentru a estima diferența de rotunjire
            suma_componente_eur = Decimal('0.00')
            for db_name in ['DEPCRED', 'MEMBRII', 'ACTIVI']:
                if db_name in db_stats:
                    suma_componenta = (db_stats[db_name]['suma_monetara'] / curs_decimal).quantize(
                        Decimal('0.01'), rounding=ROUND_HALF_UP)
                    suma_componente_eur += suma_componenta

            diferenta_estimata_rotunjire = suma_componente_eur - suma_estimata_eur

            self.preview_data = {
                'curs_folosit': float(curs_decimal),
                'db_stats': db_stats,
                'suma_totala_ron': float(suma_totala_monetara),
                'suma_estimata_eur': float(suma_estimata_eur),
                'suma_componente_eur': float(suma_componente_eur),
                'diferenta_estimata_rotunjire': float(diferenta_estimata_rotunjire),
                'member_integrity': self.member_integrity_data
            }

            # Generează textul de preview cu explicații UE
            preview_text = f"""PREVIEW CONVERSIE RON → EUR CONFORM REGULAMENTULUI CE 1103/97
{'=' * 70}
Curs folosit: 1 EUR = {self.preview_data['curs_folosit']:.6f} RON
Utilizator: {self.utilizator_input.text()}
Metodă conversie: DIRECTĂ INDIVIDUALĂ (conform art. 4 din Regulamentul CE 1103/97)

{self.member_integrity_data['summary']}

IMPACTUL ESTIMAT PE TOATE BAZELE DE DATE:
{'=' * 50}

BAZE CU CÂMPURI MONETARE - CONVERSIE DIRECTĂ UE:
{'─' * 50}
DEPCRED:
  - Membri distincți: {db_stats['DEPCRED']['membri_distincti']:,}
  - Total înregistrări: {db_stats['DEPCRED']['total_inregistrari']:,}
  - Sumă monetară RON: {db_stats['DEPCRED']['suma_monetara']:,.2f}
  - Metodă: Conversie directă individuală pentru fiecare înregistrare

MEMBRII:
  - Total membri: {db_stats['MEMBRII']['total_membri']:,}
  - Sumă cotizații RON: {db_stats['MEMBRII']['suma_monetara']:,.2f}
  - Metodă: Conversie directă individuală pentru fiecare cotizație

ACTIVI:
  - Total membri activi: {db_stats['ACTIVI']['total_activi']:,}
  - Sumă totală RON: {db_stats['ACTIVI']['suma_monetara']:,.2f}
  - Metodă: Conversie directă individuală pentru fiecare câmp monetar

BAZE FĂRĂ CÂMPURI MONETARE - COPIERE DIRECTĂ:
{'─' * 48}
INACTIVI:
  - Total membri inactivi: {db_stats['INACTIVI']['total_inactivi']:,}
  - Operațiune: Copiere structură și date (fără conversie)

LICHIDATI:
  - Total membri lichidați: {db_stats['LICHIDATI']['total_lichidati']:,}
  - Operațiune: Copiere structură și date (fără conversie)

ANALIZA MATEMATICĂ CONFORM UE:
{'─' * 35}
  - Sumă totală monetară RON: {self.preview_data['suma_totala_ron']:,.2f}
  - Sumă teoretică EUR (direct): {self.preview_data['suma_estimata_eur']:,.2f}
  - Sumă componentelor EUR: {self.preview_data['suma_componente_eur']:,.2f}
  - Diferența de rotunjire estimată: {self.preview_data['diferenta_estimata_rotunjire']:+.2f} EUR

EXPLICAȚIE DIFERENȚE DE ROTUNJIRE:
{'─' * 38}
Conform Regulamentului CE 1103/97, conversia se face prin aplicarea directă
a cursului de schimb pentru fiecare sumă individuală, cu rotunjirea la 2 zecimale.
Diferențele de rotunjire rezultate sunt LEGITIME și reflectă aplicarea corectă
a legislației europene pentru tranziția monetară.

Exemplu: 3 sume de 10 RON la cursul 6.00:
- Conversie directă: 10/6 = 1.67 EUR (×3) = 5.01 EUR total
- Conversie totală: 30/6 = 5.00 EUR total
- Diferență legitimă: +0.01 EUR (din rotunjirea individuală)

FIȘIERE CARE VOR FI CREATE:
{'─' * 30}
✓ DEPCREDEUR.db (conversie monetară directă UE)
✓ MEMBRIIEUR.db (conversie cotizații directă UE)
✓ activiEUR.db (conversie monetară directă UE)
✓ INACTIVIEUR.db (copiere directă)
✓ LICHIDATIEUR.db (copiere directă)

{'=' * 70}
⚠️ CONVERSIE DEFINITIVĂ - IREVERSIBILĂ!
✓ Fiecare sumă se convertește INDEPENDENT
✓ Respectă principiul continuității instrumentelor juridice
✓ Diferențele de rotunjire sunt conforme legislației UE
✓ Bazele originale rămân intacte pentru audit
✓ Sistem dual currency complet funcțional
"""

            # Adaugă avertisment pentru discrepanțe critice
            if not self.member_integrity_data["valid"]:
                preview_text += f"""
{'🚨' * 10} ATENȚIE {'🚨' * 10}
DISCREPANȚE CRITICE DETECTATE!

Membri cu activitate financiară în DEPCRED.db, dar neînregistrați în MEMBRII.db:
{len(self.member_integrity_data['members_only_in_depcred'])} cazuri

ACȚIUNE NECESARĂ:
1. Verificați fișele neînregistrate din raportul de export
2. Adăugați membrii lipsă în baza MEMBRII sau ștergeți înregistrările din DEPCRED
3. Sau explicați discrepanțele în documentația proiectului
4. Re-executați validarea după corecții

CONVERSIA POATE CONTINUA dar se recomandă rezolvarea discrepanțelor
pentru integritatea completă a sistemului.
{'=' * 70}
"""

            self.preview_text.setText(preview_text)
            self.check_preview.setChecked(True)
            self.btn_aplica.setEnabled(True)
            self.btn_export.setEnabled(True)

        except Exception as e:
            QMessageBox.critical(self, "Eroare", f"Eroare la generarea preview-ului:\n{e}")
            self.adauga_in_jurnal(f"EROARE Preview: {e}")

    def aplica_conversie(self):
        """Aplică conversia cu validare suplimentară pentru integritate"""
        # Verifică dacă există discrepanțe critice
        if (self.member_integrity_data and
                not self.member_integrity_data["valid"] and
                self.member_integrity_data["members_only_in_depcred"]):

            reply = QMessageBox.question(
                self,
                'Discrepanțe Critice Detectate',
                f'Atenție! Au fost detectați {len(self.member_integrity_data["members_only_in_depcred"])} '
                f'membri cu activitate financiară dar neînregistrați în MEMBRII.\n\n'
                f'Aceasta poate indica probleme de integritate a datelor.\n\n'
                f'Doriți să continuați conversia cu aceste discrepanțe?\n\n'
                f'Recomandare: Exportați raportul și rezolvați discrepanțele înainte de conversie.',
                QMessageBox.Yes | QMessageBox.No,
                QMessageBox.No
            )

            if reply != QMessageBox.Yes:
                self.adauga_in_jurnal("Conversie anulată pentru rezolvarea discrepanțelor de integritate")
                return
            else:
                self.adauga_in_jurnal("Conversie continuată cu discrepanțe de integritate acceptate")

        # Validează input-urile
        if not self.valideaza_input():
            return

        # Dezactivează butoanele pe durata conversiei
        self.btn_aplica.setEnabled(False)
        self.btn_preview.setEnabled(False)
        self.progress_bar.setVisible(True)
        self.progress_bar.setValue(0)

        # Pregătește worker-ul de conversie
        curs_text = self.curs_input.text().replace(',', '.')
        curs_decimal = Decimal(curs_text)
        utilizator = self.utilizator_input.text().strip()

        self.conversie_worker = ConversieWorker(curs_decimal, utilizator)

        # Conectează semnalele worker-ului
        self.conversie_worker.progress_update.connect(self.update_progress)
        self.conversie_worker.conversion_completed.connect(self.conversie_completata)
        self.conversie_worker.conversion_error.connect(self.conversie_eroare)

        # Pornește conversia
        self.conversie_worker.start()
        self.adauga_in_jurnal("Conversie definitivă pornită - conform Regulamentului CE 1103/97...")

    def update_progress(self, value: int, message: str):
        """Actualizează progresul"""
        self.progress_bar.setValue(value)
        self.status_label.setText(message)
        self.adauga_in_jurnal(message)

    def conversie_completata(self, rezultat: dict):
        """Handler pentru conversie completată"""
        self.progress_bar.setVisible(False)
        self.status_label.setText("Conversie completată conform UE - TOATE BAZELE!")
        self.final_results = rezultat

        depcred_conv = rezultat.get('rezultat_depcred', {}).get('inregistrari_convertite', 0)
        membrii_conv = rezultat.get('rezultat_membrii', {}).get('membri_convertiti', 0)
        activi_conv = rezultat.get('rezultat_activi', {}).get('activi_convertiti', 0)
        inactivi_records = rezultat.get('rezultat_inactivi', {}).get('records_count', 0)
        lichidati_records = rezultat.get('rezultat_lichidati', {}).get('records_count', 0)

        rezumat = rezultat.get('rezumat_final', {})

        mesaj = (f"Conversie definitivă aplicată cu succes conform UE!\n\n"
                f"REZULTATE CONVERSIE DIRECTĂ:\n"
                f"• DEPCRED: {depcred_conv:,} înregistrări convertite\n"
                f"• MEMBRII: {membrii_conv:,} membri convertiți\n"
                f"• ACTIVI: {activi_conv:,} membri activi convertiți\n\n"
                f"REZULTATE CLONARE:\n"
                f"• INACTIVI: {inactivi_records:,} înregistrări clonate\n"
                f"• LICHIDATI: {lichidati_records:,} înregistrări clonate\n\n"
                f"ANALIZA DIFERENȚELOR DE ROTUNJIRE:\n"
                f"• Sumă originală RON: {rezumat.get('suma_originala_ron', 0):,.2f}\n"
                f"• Sumă rezultat EUR: {rezumat.get('suma_rezultat_eur', 0):,.2f}\n"
                f"• Sumă teoretică EUR: {rezumat.get('suma_teoretica_eur', 0):,.2f}\n"
                f"• Diferența totală rotunjire: {rezumat.get('diferenta_rotunjire_totala', 0):+.2f} EUR\n\n"
                f"DETALII DIFERENȚE PE BAZE:\n"
                f"• DEPCRED: {rezumat.get('diferenta_depcred', 0):+.4f} EUR\n"
                f"• MEMBRII: {rezumat.get('diferenta_membrii', 0):+.4f} EUR\n"
                f"• ACTIVI: {rezumat.get('diferenta_activi', 0):+.4f} EUR\n\n"
                f"Fișiere create:\n"
                f"• DEPCREDEUR.db\n"
                f"• MEMBRIIEUR.db\n"
                f"• activiEUR.db\n"
                f"• INACTIVIEUR.db\n"
                f"• LICHIDATIEUR.db\n\n"
                f"IMPORTANT: Diferențele de rotunjire sunt LEGITIME\n"
                f"și rezultă din aplicarea corectă a legislației UE.\n\n"
                f"Sistemul EURO este acum complet funcțional! Reporniți aplicația.")

        QMessageBox.information(self, 'Conversie Completă', mesaj)

        self.btn_aplica.setEnabled(True)
        self.btn_preview.setEnabled(True)

    def conversie_eroare(self, error_message: str):
        """Handler pentru erori"""
        self.progress_bar.setVisible(False)
        self.status_label.setText("Conversie oprită!")

        QMessageBox.critical(
            self,
            'Eroare Conversie',
            f"Conversia a fost oprită:\n\n{error_message}\n\n"
            f"Bazele de date rămân nemodificate."
        )

        self.adauga_in_jurnal(f"EROARE: {error_message}")

        self.btn_aplica.setEnabled(True)
        self.btn_preview.setEnabled(True)

    def reset_form(self):
        """Resetează formularul"""
        self.curs_input.setText("4.9435")
        self.utilizator_input.setText("Administrator")
        self.preview_text.clear()
        self.check_preview.setChecked(False)
        self.btn_aplica.setEnabled(False)
        self.btn_export.setEnabled(False)
        self.status_label.setText("")
        self.preview_data = None
        self.final_results = None
        self.adauga_in_jurnal("Formular resetat")

    def export_raport(self):
        """Export îmbunătățit cu raportul de integritate membri și diferențe rotunjire"""
        if not self.final_results and not self.preview_data:
            QMessageBox.warning(self, "Avertizare", "Nu există date de exportat!")
            return

        try:
            base_path = Path(__file__).resolve().parent if not getattr(sys, 'frozen', False) else Path(
                sys.executable).parent
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')

            export_file = base_path / f"raport_conversie_ue_compliant_{timestamp}.txt"
            content = f"RAPORT CONVERSIE RON→EUR - CONFORM REGULAMENTULUI CE 1103/97\n{'=' * 80}\n\n"
            content += self.preview_text.toPlainText()

            # Adaugă rezultatele finale dacă conversia a fost completată
            if self.final_results:
                content += f"\n\n{'=' * 80}\n"
                content += "REZULTATE FINALE CONVERSIE\n"
                content += f"{'=' * 80}\n"

                rezumat = self.final_results.get('rezumat_final', {})
                content += f"Metodă aplicată: {self.final_results.get('metoda_conversie', 'N/A')}\n"
                content += f"Data finalizării: {self.final_results.get('timestamp_finalizare', 'N/A')}\n"
                content += f"Curs folosit: {self.final_results.get('curs_folosit', 0):.6f}\n\n"

                content += f"ANALIZA FINALĂ DIFERENȚELOR DE ROTUNJIRE:\n"
                content += f"{'─' * 45}\n"
                content += f"Sumă originală RON: {rezumat.get('suma_originala_ron', 0):,.2f}\n"
                content += f"Sumă rezultat EUR: {rezumat.get('suma_rezultat_eur', 0):,.2f}\n"
                content += f"Sumă teoretică EUR: {rezumat.get('suma_teoretica_eur', 0):,.2f}\n"
                content += f"Diferența totală: {rezumat.get('diferenta_rotunjire_totala', 0):+.4f} EUR\n\n"

                content += f"DIFERENȚE PE BAZE (DETALIU):\n"
                content += f"{'─' * 30}\n"
                content += f"DEPCRED: {rezumat.get('diferenta_depcred', 0):+.4f} EUR\n"
                content += f"MEMBRII: {rezumat.get('diferenta_membrii', 0):+.4f} EUR\n"
                content += f"ACTIVI: {rezumat.get('diferenta_activi', 0):+.4f} EUR\n\n"

                content += f"INTERPRETAREA JURIDICĂ:\n"
                content += f"{'─' * 25}\n"
                content += f"Diferențele de rotunjire sunt conforme cu:\n"
                content += f"• Regulamentul CE 1103/97, art. 4\n"
                content += f"• Principiul continuității instrumentelor juridice\n"
                content += f"• Metodologia de conversie directă individuală\n"
                content += f"• Regulile de rotunjire la 2 zecimale\n\n"

            # Adaugă raportul detaliat de integritate membri
            if self.member_integrity_data:
                content += f"\n\n{'=' * 80}\n"
                content += "RAPORT DETALIAT INTEGRITATE MEMBRI\n"
                content += f"{'=' * 80}\n"

                integrity = self.member_integrity_data
                content += f"Status validare: {'VALIDĂ' if integrity['valid'] else 'INVALIDĂ'}\n"
                content += f"Total membri MEMBRII: {integrity['total_membrii']}\n"
                content += f"Membri distincți DEPCRED: {integrity['distinct_depcred']}\n"
                content += f"Diferența: {integrity['difference']:+d}\n\n"

                if integrity["members_only_in_membrii"]:
                    content += f"MEMBRI FĂRĂ ACTIVITATE FINANCIARĂ ({len(integrity['members_only_in_membrii'])}):\n"
                    content += f"{'─' * 60}\n"
                    for member in integrity["members_only_in_membrii"]:
                        content += f"Fișa {member['nr_fisa']}: {member['num_pren']}\n"
                    content += f"\n"

                if integrity["members_only_in_depcred"]:
                    content += f"MEMBRI CU ACTIVITATE DAR NEÎNREGISTRAȚI ({len(integrity['members_only_in_depcred'])}):\n"
                    content += f"{'─' * 60}\n"
                    for member in integrity["members_only_in_depcred"]:
                        content += f"Fișa {member['nr_fisa']}: NECESITĂ ÎNREGISTRARE ÎN MEMBRII\n"
                    content += f"\n"

                content += f"RECOMANDĂRI:\n"
                content += f"{'─' * 20}\n"
                if not integrity["valid"]:
                    content += f"1. Adăugați membrii lipsă în baza MEMBRII\n"
                    content += f"2. Verificați validitatea fișelor cu activitate financiară\n"
                    content += f"3. Documentați explicațiile pentru discrepanțe legitime\n"
                    content += f"4. Re-executați validarea după corecții\n"
                else:
                    content += f"✅ Integritatea membrilor este validă\n"
                    content += f"✅ Conversia a procedat în siguranță\n"

            content += f"\n\n{'=' * 50}\n"
            content += "JURNAL OPERAȚIUNI\n"
            content += f"{'=' * 50}\n"
            content += self.jurnal_text.toPlainText()
            content += f"\n\nGenerat la: {datetime.now().isoformat()}\n"

            with open(export_file, 'w', encoding='utf-8') as f:
                f.write(content)

            # Export suplimentar pentru discrepanțe (dacă există)
            exported_files = [export_file.name]
            if self.member_integrity_data and not self.member_integrity_data["valid"]:
                discrepancy_file = base_path / f"discrepante_membri_{timestamp}.csv"
                with open(discrepancy_file, 'w', encoding='utf-8') as f:
                    f.write("Tip_Discrepanta,Nr_Fisa,Nume_Prenume,Problema\n")

                    for member in self.member_integrity_data["members_only_in_membrii"]:
                        f.write(
                            f"Fara_Activitate,{member['nr_fisa']},\"{member['num_pren']}\",Membru fara activitate financiara\n")

                    for member in self.member_integrity_data["members_only_in_depcred"]:
                        f.write(f"Neregistrat,{member['nr_fisa']},NECUNOSCUT,Activitate financiara fara inregistrare\n")

                exported_files.append(discrepancy_file.name)

            QMessageBox.information(
                self,
                'Export Completat',
                f'Rapoarte exportate:\n' + '\n'.join([f'• {file}' for file in exported_files])
            )

            self.adauga_in_jurnal(f"Raport exportat: {export_file.name}")

        except Exception as e:
            QMessageBox.warning(self, 'Eroare Export', f'Eroare la export:\n{e}')

    def valideaza_input(self):
        """Validează input-urile"""
        curs_text = self.curs_input.text().strip()
        if not curs_text:
            QMessageBox.warning(self, "Eroare", "Introduceți cursul de schimb!")
            return False

        try:
            curs = Decimal(curs_text.replace(',', '.'))
            if curs <= 0 or curs > 10:
                QMessageBox.warning(self, "Eroare", "Cursul trebuie să fie între 0 și 10!")
                return False
        except Exception:
            QMessageBox.warning(self, "Eroare", "Cursul de schimb nu este valid!")
            return False

        if not self.utilizator_input.text().strip():
            self.utilizator_input.setText("Administrator")

        return True

    def adauga_in_jurnal(self, mesaj: str):
        """Adaugă mesaj în jurnal"""
        timestamp = datetime.now().strftime("%H:%M:%S")
        self.jurnal_text.append(f"[{timestamp}] {mesaj}")
        cursor = self.jurnal_text.textCursor()
        cursor.movePosition(cursor.End)
        self.jurnal_text.setTextCursor(cursor)

    def aplicare_stiluri(self):
        """Aplică stiluri CSS"""
        style = """
        QWidget {
            font-family: 'Segoe UI', Arial, sans-serif;
            font-size: 10pt;
        }
        #titleLabel {
            font-size: 16pt;
            font-weight: bold;
            color: #1e3a8a;
            padding: 10px;
            border: 2px solid #1e3a8a;
            border-radius: 5px;
            background-color: #eff6ff;
        }
        #warningLabel {
            background-color: #f8d7da;
            color: #721c24;
            padding: 8px;
            border: 1px solid #f5c6cb;
            border-radius: 4px;
            font-weight: bold;
        }
        QGroupBox {
            font-weight: bold;
            border: 2px solid #bdc3c7;
            border-radius: 5px;
            margin-top: 10px;
            padding-top: 10px;
        }
        QGroupBox::title {
            subcontrol-origin: margin;
            left: 10px;
            padding: 0 5px 0 5px;
        }
        #paramsGroup {
            border-color: #1e3a8a;
        }
        #actionsGroup {
            border-color: #059669;
        }
        QPushButton {
            border: none;
            border-radius: 4px;
            padding: 8px;
            font-weight: bold;
            min-height: 30px;
        }
        #btnPreview {
            background-color: #0ea5e9;
            color: white;
        }
        #btnPreview:hover {
            background-color: #0284c7;
        }
        #btnAplica {
            background-color: #059669;
            color: white;
        }
        #btnAplica:hover {
            background-color: #047857;
        }
        #btnAplica:disabled {
            background-color: #95a5a6;
        }
        #btnReset {
            background-color: #5d6d7e;
            color: white;
        }
        #btnExport {
            background-color: #7c3aed;
            color: white;
        }
        QTextEdit {
            border: 1px solid #bdc3c7;
            border-radius: 4px;
            background-color: #f8f9fa;
            font-family: 'Consolas', 'Courier New', monospace;
            font-size: 9pt;
        }
        QLineEdit {
            padding: 5px;
            border: 1px solid #bdc3c7;
            border-radius: 3px;
        }
        QProgressBar {
            border: 1px solid #bdc3c7;
            border-radius: 3px;
            text-align: center;
        }
        QProgressBar::chunk {
            background-color: #059669;
            border-radius: 2px;
        }
        #cursInfo {
            color: #7f8c8d;
            font-style: italic;
            font-size: 9pt;
        }
        #metodaInfo {
            color: #059669;
            font-weight: bold;
            font-size: 9pt;
        }
        """
        self.setStyleSheet(style)


if __name__ == '__main__':
    app = QApplication(sys.argv)
    widget = ConversieWidget()
    widget.setWindowTitle("Conversie RON→EUR Definitivă - Conform Regulamentului CE 1103/97")
    widget.setMinimumSize(1000, 700)
    widget.show()
    sys.exit(app.exec_())