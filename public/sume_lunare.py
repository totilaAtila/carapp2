# sume_lunare.py
# -*- coding: utf-8 -*-
import sys
import os
import sqlite3
import logging
import traceback
from datetime import datetime
import decimal
from decimal import Decimal, ROUND_HALF_UP, ROUND_UP
import json

# Importuri PyQt5 - Grupate
from PyQt5.QtCore import (
    Qt, QStringListModel, QModelIndex, QTimer, QMetaObject, Q_ARG
)
from PyQt5.QtGui import (
    QFont, QColor, QDoubleValidator, QTextCursor, QTextCharFormat, QCursor, QKeySequence, QIntValidator
)
from PyQt5.QtWidgets import (
    QWidget, QLabel, QPushButton, QVBoxLayout, QHBoxLayout, QGroupBox,
    QMessageBox, QLineEdit, QFormLayout, QSpacerItem, QSizePolicy,
    QApplication, QMainWindow, QFrame, QScrollArea, QTextEdit, QGridLayout,
    QCompleter, QDialog, QDialogButtonBox, QInputDialog, QFileDialog,
    QSpinBox, QShortcut
)

from utils import afiseaza_warning, afiseaza_eroare, afiseaza_info, afiseaza_intrebare

# --- Import Utils pentru Threading ---
try:
    from utils import run_task_in_background, WorkerSignals
except ImportError as import_err:
    logging.error(
        f"Eroare import utils: {import_err}. "
        "Recalcularea în background va lipsi."
    )


    # Definim o funcție placeholder dacă utils lipsește

    def run_task_in_background(*args, **kwargs):
        """ Funcție placeholder pentru threading când utils lipsește. """
        logging.error(
            "FATAL: utils.run_task_in_background nu este disponibil!"
        )
        parent = kwargs.get('parent_widget')
        if parent and isinstance(parent, QWidget):
            QMessageBox.critical(
                parent, "Eroare Configurare",
                "Modulul 'utils.py' nu a fost găsit.\n"
                "Recalcularea în background este indisponibilă."
            )
        else:
            print("EROARE CRITICĂ: Modulul utils.py nu a fost găsit!")
        on_error = kwargs.get('on_error')
        if on_error and callable(on_error):
            try:
                error_tuple = (
                    ImportError,
                    ImportError("utils.py lipsă"),
                    traceback.format_exc()
                )
                on_error(error_tuple)
            except Exception as e_sim:
                logging.error(f"Eroare la simularea on_error: {e_sim}")

# --- Configurarea căilor și logging ---
try:
    if getattr(sys, 'frozen', False):
        BASE_RESOURCE_PATH = os.path.dirname(sys.executable)
    else:
        current_script_path = os.path.abspath(__file__)
        ui_directory = os.path.dirname(current_script_path)
        BASE_RESOURCE_PATH = os.path.dirname(ui_directory)

    DB_MEMBRII = os.path.join(BASE_RESOURCE_PATH, "MEMBRII.db")
    DB_DEPCRED = os.path.join(BASE_RESOURCE_PATH, "DEPCRED.db")
    DB_LICHIDATI = os.path.join(BASE_RESOURCE_PATH, "LICHIDATI.db")

    missing_dbs = []
    for db_path in (DB_MEMBRII, DB_DEPCRED, DB_LICHIDATI):
        if not os.path.exists(db_path):
            missing_dbs.append(os.path.basename(db_path))
            print(f"AVERTISMENT: Baza de date nu a fost găsită: {db_path}")

except Exception as e:
    print(f"Eroare critică la configurarea căilor DB: {e}")
    missing_dbs = ["Configurare Căi Eșuată"]
    pass

# Configurare basic logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(filename)s:%(lineno)d - %(message)s'
)

# --- Funcții de Validare (Copiate din validari.py dacă nu sunt importate) ---
# Asigurăm că funcțiile de validare sunt disponibile, fie prin import, fie prin definiții locale


try:
    from ui.validari import verifica_campuri_completate, verifica_format_luna_an, valideaza_numar_real
except ImportError:
    logging.warning("Modulul 'validari' nu a fost găsit. Se folosesc definiții locale simple.")


    def verifica_campuri_completate(widget, campuri, nume_map):
        for camp in campuri:
            if not camp.text().strip():
                nume_camp = nume_map.get(camp, "Necunoscut")
                afiseaza_warning(f"Completați câmpul '{nume_camp}'.", parent=widget)
                camp.setFocus()
                return False
        return True


    def verifica_format_luna_an(widget, camp):
        text_val = camp.text().strip()
        parts = text_val.split('-')
        if len(parts) != 2 or not parts[0].isdigit() or not parts[1].isdigit():
            afiseaza_warning(
                "Introduceți Luna-An în format LL-AAAA (ex: 04-2025).",
                parent=widget
            )
            camp.setFocus()
            return False
        try:
            luna, anul = int(parts[0]), int(parts[1])
            if 1 <= luna <= 12 and 1990 <= anul <= 2100:
                return True
            afiseaza_warning(
                "Luna trebuie să fie între 1-12 și anul între 1990-2100.",
                parent=widget
            )
            camp.setFocus()
            return False
        except ValueError:
            afiseaza_warning(
                "Introduceți numere valide pentru lună și an.",
                parent=widget
            )
            camp.setFocus()
            return False


    def valideaza_numar_real(text_val):
        if text_val is None:
            return False
        try:
            Decimal(text_val.replace(',', '.'))
            return True
        except (InvalidOperation, TypeError):
            return False


def get_config_path():
    """
    Găsește calea corectă către config_dobanda.json
    Funcționează atât în dezvoltare cât și după împachetare
    """
    # Pentru aplicațiile împachetate cu PyInstaller
    if getattr(sys, 'frozen', False):
        # Dacă aplicația este împachetată
        base_path = sys._MEIPASS
        config_path = os.path.join(base_path, 'config_dobanda.json')
        if os.path.exists(config_path):
            return config_path

        # Dacă nu e în bundle, încearcă lângă executabil
        exe_dir = os.path.dirname(sys.executable)
        config_path = os.path.join(exe_dir, 'config_dobanda.json')
        if os.path.exists(config_path):
            return config_path

    # Pentru dezvoltare - suntem în ui/, config-ul e în ../
    script_dir = os.path.dirname(os.path.abspath(__file__))
    parent_dir = os.path.dirname(script_dir)
    config_path = os.path.join(parent_dir, 'config_dobanda.json')

    if os.path.exists(config_path):
        return config_path

    # Fallback - încearcă în directorul curent
    current_dir_config = os.path.join(os.getcwd(), 'config_dobanda.json')
    if os.path.exists(current_dir_config):
        return current_dir_config

    return None


def get_dobanda():
    """
    Citește valoarea dobânzii din config_dobanda.json
    """
    config_path = get_config_path()

    if config_path is None:
        print("Avertisment: config_dobanda.json nu a fost găsit. Se folosește valoarea default.")
        return 0.004  # valoare default în format decimal (4‰)

    try:
        with open(config_path, 'r', encoding='utf-8') as f:
            config = json.load(f)
            dobanda = float(config.get('loan_interest_rate_on_extinction', 0.004))
            print(f"Dobânda încărcată din config: {dobanda * 1000:.1f}‰")
            return dobanda
    except (json.JSONDecodeError, ValueError, KeyError) as e:
        print(f"Eroare la citirea config_dobanda.json: {e}. Se folosește valoarea default.")
        return 0.004


class TranzactieDialog(QDialog):
    """ Dialog modal pentru modificarea tranzacțiilor lunare cu design modern. """

    def __init__(self, parent=None, opening_impr_sold=Decimal('0.00')):
        super().__init__(parent)
        self.opening_impr_sold = opening_impr_sold
        self.setWindowTitle("Adăugare/Modificare Tranzacție Lunară")
        self.setModal(True)
        self.setMinimumWidth(350)  # Lărgim mai mult dialogul

        # Adaugă stilizarea modernă pentru toate butoanele din dialog
        self.setStyleSheet("""
            QDialog {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 #f8f9fa, stop:1 #e9ecef);
                border-radius: 12px;
            }
            QLabel {
                color: #2c3e50;
                font-weight: bold;
                padding: 4px;
            }
            QLineEdit {
                background-color: #ffffff;
                border: 2px solid #b3d1ff;
                border-radius: 6px;
                padding: 6px 10px;
                font-size: 10pt;
            }
            QLineEdit:focus {
                border-color: #4a90e2;
                box-shadow: 0 0 0 2px rgba(74, 144, 226, 0.2);
            }
            QPushButton {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 #4a90e2, stop:1 #357abd);
                border: 2px solid #4a90e2;
                color: white;
                padding: 8px 16px;
                border-radius: 6px;
                min-width: 80px;
                font-weight: bold;
            }
            QPushButton:hover {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 #5ba0f2, stop:1 #4a90e2);
                border-color: #357abd;
            }
            QPushButton:pressed {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 #357abd, stop:1 #2e6ba8);
            }
            QDialogButtonBox QPushButton {
                min-width: 80px;
            }
            QFrame {
                border: 1px solid #dee2e6;
                border-radius: 6px;
                background-color: rgba(255, 255, 255, 0.8);
            }
        """)

        layout = QVBoxLayout(self)
        layout.setSpacing(12)
        layout.setContentsMargins(20, 20, 20, 20)

        form_layout = QFormLayout()
        form_layout.setRowWrapPolicy(QFormLayout.WrapLongRows)
        form_layout.setLabelAlignment(Qt.AlignLeft)
        form_layout.setHorizontalSpacing(15)
        form_layout.setVerticalSpacing(10)

        # Câmpuri existente
        self.luna_an_input = QLineEdit()
        self.luna_an_input.setPlaceholderText("LL-AAAA")
        dobanda_default = get_dobanda() * 1000  # convertim la promile pentru afișare
        self.dobanda_input = QLineEdit(f"{dobanda_default:.2f}")
        self.impr_deb_input = QLineEdit("0.00")
        self.impr_cred_input = QLineEdit("0.00")
        self.dep_deb_input = QLineEdit("0.00")
        self.dep_cred_input = QLineEdit("0.00")

        # Câmpuri pentru calculul automat - opțiuni exclusive
        self.nr_luni_input = QLineEdit("")
        self.rata_fixa_input = QLineEdit("")

        # Validatori
        validator_numar = QDoubleValidator(-9999999.99, 9999999.99, 2, self)
        validator_numar.setNotation(QDoubleValidator.StandardNotation)
        numeric_inputs = (
            self.dobanda_input, self.impr_deb_input, self.impr_cred_input,
            self.dep_deb_input, self.dep_cred_input, self.rata_fixa_input
        )
        for widget in numeric_inputs:
            widget.setValidator(validator_numar)

        # Validator întreg pentru nr_luni
        validator_intreg = QIntValidator(1, 120, self)  # Max 10 ani (120 luni)
        self.nr_luni_input.setValidator(validator_intreg)

        # Câmpurile existente în formular
        form_layout.addRow("Lună-An :", self.luna_an_input)
        form_layout.addRow("Dobândă :", self.dobanda_input)
        form_layout.addRow("Împrumut Acordat :", self.impr_deb_input)
        form_layout.addRow("Plată Împrumut :", self.impr_cred_input)
        form_layout.addRow("Cotizație :", self.dep_deb_input)
        form_layout.addRow("Retragere Fond:", self.dep_cred_input)

        # Separator pentru secțiunea de calcul
        separator = QFrame()
        separator.setFrameShape(QFrame.HLine)
        separator.setFrameShadow(QFrame.Sunken)
        form_layout.addRow(separator)

        # Subsecțiune pentru calculul automat - OPȚIUNI EXCLUSIVE
        form_layout.addRow("<b>Calcul estimativ:</b>", QLabel(""))
        form_layout.addRow("Număr Luni:", self.nr_luni_input)
        form_layout.addRow("SAU Rată Fixă:", self.rata_fixa_input)

        # Buton pentru estimarea rezultatului cu stil modern
        self.btn_calculeaza = QPushButton("Calculează")
        self.btn_calculeaza.clicked.connect(self._calculeaza_estimare)
        form_layout.addRow("", self.btn_calculeaza)

        # Etichetă pentru rezultatul calculului
        self.rezultat_calc_label = QLabel("Rezultat calcul: -")
        self.rezultat_calc_label.setStyleSheet("font-weight: bold; color: #28a745; font-size: 11pt;")
        form_layout.addRow("", self.rezultat_calc_label)

        layout.addLayout(form_layout)

        # Butoane OK/Cancel cu stil îmbunătățit
        self.button_box = QDialogButtonBox(
            QDialogButtonBox.Ok | QDialogButtonBox.Cancel
        )
        self.button_box.accepted.connect(self.accept)
        self.button_box.rejected.connect(self.reject)
        layout.addWidget(self.button_box)

        # Conectare semnale pentru comportament exclusiv
        self.nr_luni_input.textChanged.connect(self._handle_nr_luni_changed)
        self.rata_fixa_input.textChanged.connect(self._handle_rata_fixa_changed)

        self.luna_an_input.setFocus()

    def _handle_nr_luni_changed(self, text):
        """Dezactivează câmpul de rată fixă dacă s-a introdus un număr de luni."""
        if text.strip():
            self.rata_fixa_input.clear()
            self.rata_fixa_input.setEnabled(False)
        else:
            self.rata_fixa_input.setEnabled(True)
        self.rezultat_calc_label.setText("Rezultat calcul: -")

    def _handle_rata_fixa_changed(self, text):
        """Dezactivează câmpul de număr luni dacă s-a introdus o rată fixă."""
        if text.strip():
            self.nr_luni_input.clear()
            self.nr_luni_input.setEnabled(False)
        else:
            self.nr_luni_input.setEnabled(True)
        self.rezultat_calc_label.setText("Rezultat calcul: -")

    def _calculeaza_estimare(self):
        try:
            imprumut_str = self.impr_deb_input.text().strip().replace(',', '.')

            # Verifică dacă există împrumut
            if not imprumut_str or Decimal(imprumut_str) <= Decimal('0'):
                afiseaza_warning("Introduceți suma împrumutului!", self)
                self.impr_deb_input.setFocus()
                return

            imprumut = Decimal(imprumut_str)

            # Verifică care opțiune a fost aleasă
            nr_luni_str = self.nr_luni_input.text().strip()
            rata_fixa_str = self.rata_fixa_input.text().strip().replace(',', '.')

            if nr_luni_str:
                # Opțiunea 1: Calculează rata lunară
                nr_luni = int(nr_luni_str)
                if nr_luni <= 0:
                    afiseaza_warning("Numărul de luni trebuie să fie pozitiv!", self)
                    return

                rata_lunara = (imprumut / Decimal(nr_luni)).quantize(Decimal('0.01'), ROUND_HALF_UP)
                self.rezultat_calc_label.setText(f"Rata lunară: {rata_lunara:.2f} lei")

            elif rata_fixa_str:
                # Opțiunea 2: Calculează numărul de rate
                rata_fixa = Decimal(rata_fixa_str)
                if rata_fixa <= Decimal('0'):
                    afiseaza_warning("Rata fixă trebuie să fie pozitivă!", self)
                    return

                if rata_fixa > imprumut:
                    self.rezultat_calc_label.setText("Rata depășește împrumutul! O singură rată necesară.")
                else:
                    nr_rate_exact = imprumut / rata_fixa
                    nr_rate_intreg = int(nr_rate_exact.quantize(Decimal('1'), ROUND_UP))
                    ultima_rata = imprumut - (rata_fixa * (nr_rate_intreg - 1))

                    if ultima_rata.compare(rata_fixa) == 0:
                        self.rezultat_calc_label.setText(f"Număr rate: {nr_rate_intreg}")
                    else:
                        self.rezultat_calc_label.setText(
                            f"Număr rate: {nr_rate_intreg} (ultima rată: {ultima_rata:.2f} lei)"
                        )
            else:
                afiseaza_warning(
                    "Introduceți fie numărul de luni, fie rata fixă dorită!",
                    self
                )

        except (ValueError, InvalidOperation) as e:
            afiseaza_eroare(f"Eroare la calcul: {str(e)}", self)

    def set_data_for_edit(self, luna, anul, data_existenta):
        """ Pre-populează dialogul pentru editare. """
        self.luna_an_input.setText(f"{luna:02d}-{anul}")
        # Păstrăm luna/anul read-only conform logicii existente
        self.luna_an_input.setReadOnly(True)
        # Folosim .get cu default Decimal pentru siguranță
        self.dobanda_input.setText(
            f"{data_existenta.get('dobanda', Decimal('0.00')):.2f}"
        )
        self.impr_deb_input.setText(
            f"{data_existenta.get('impr_deb', Decimal('0.00')):.2f}"
        )
        self.impr_cred_input.setText(
            f"{data_existenta.get('impr_cred', Decimal('0.00')):.2f}"
        )
        self.dep_deb_input.setText(
            f"{data_existenta.get('dep_deb', Decimal('0.00')):.2f}"
        )
        self.dep_cred_input.setText(
            f"{data_existenta.get('dep_cred', Decimal('0.00')):.2f}"
        )
        self.impr_deb_input.setFocus()

        # Resetăm câmpurile de calcul
        self.nr_luni_input.setText("")
        self.rata_fixa_input.setText("")
        self.rezultat_calc_label.setText("Rezultat calcul: -")

    def get_validated_data(self):
        """ Validează datele și le returnează ca dicționar. """
        input_widgets = {
            "luna_an": self.luna_an_input, "dobanda": self.dobanda_input,
            "impr_deb": self.impr_deb_input, "impr_cred": self.impr_cred_input,
            "dep_deb": self.dep_deb_input, "dep_cred": self.dep_cred_input,
        }
        labels_map = {
            self.luna_an_input: "Lună-An", self.dobanda_input: "Dobândă",
            self.impr_deb_input: "Împrumut Acordat",
            self.impr_cred_input: "Rată Achitată (Plată Împr.)",
            self.dep_deb_input: "Cotizație (Depunere)",
            self.dep_cred_input: "Retragere Fond",
        }

        # Setează 0.00 pentru câmpurile numerice goale
        numeric_widgets_for_zero = [
            self.dobanda_input, self.impr_deb_input, self.impr_cred_input,
            self.dep_deb_input, self.dep_cred_input
        ]
        for camp in numeric_widgets_for_zero:
            if not camp.text().strip():
                camp.setText("0.00")

        # Validare format LL-AAAA (doar la adăugare) - Nu se aplică dacă e read-only
        if not self.luna_an_input.isReadOnly():
            if not verifica_format_luna_an(self, self.luna_an_input):
                return None

        # Validare și conversie numere
        validated_data_decimal = {}
        numeric_widgets_to_validate = [
            self.dobanda_input, self.impr_deb_input, self.impr_cred_input,
            self.dep_deb_input, self.dep_cred_input,
        ]
        for widget in numeric_widgets_to_validate:
            text_val = widget.text().strip().replace(",", ".")
            if not valideaza_numar_real(text_val):
                afiseaza_warning(
                    f"Valoare numerică invalidă pentru '{labels_map[widget]}'.",
                    parent=self
                )
                widget.setFocus()
                widget.selectAll()
                return None
            # Găsește cheia corespunzătoare
            key_name = next(
                (k for k, v in input_widgets.items() if v == widget), None
            )
            if key_name:
                validated_data_decimal[key_name] = Decimal(text_val)

        # Extrage luna și anul (din textul read-only)
        try:
            luna_str, anul_str = self.luna_an_input.text().strip().split("-")
            validated_data_decimal["luna"] = int(luna_str)
            validated_data_decimal["anul"] = int(anul_str)
        except ValueError:
            afiseaza_eroare(
                "Eroare internă la procesarea lunii și anului.", parent=self
            )
            return None

        # Validare plată împrumut > sold
        if validated_data_decimal['impr_cred'] > self.opening_impr_sold:
            # În loc să întrebăm utilizatorul, doar afișăm un mesaj de eroare și nu permitem continuarea
            afiseaza_eroare(
                f"Plata împrumutului ({validated_data_decimal['impr_cred']:.2f}) "
                f"depășește soldul împrumutului ({self.opening_impr_sold:.2f})!\n\n"
                f"Tranzacția nu poate fi procesată. Vă rugăm introduceți o valoare corectă.",
                parent=self
            )
            self.impr_cred_input.setFocus()
            return None

        return validated_data_decimal

    def _proceseaza_si_actualizeaza_tranzactie(self, luna, anul, data_tranzactie):
        """Actualizează tranzacția și declanșează recalcularea."""
        log_prefix = f"Update {self._loaded_nr_fisa}/{luna:02d}-{anul}"
        logging.info(f"{log_prefix}: Procesare...")

        new_dobanda = data_tranzactie['dobanda']
        new_impr_deb = data_tranzactie['impr_deb']
        new_impr_cred = data_tranzactie['impr_cred']
        new_dep_deb = data_tranzactie['dep_deb']
        new_dep_cred = data_tranzactie['dep_cred']

        opening_impr_sold, opening_dep_sold = self._get_opening_balances(
            self._loaded_nr_fisa, luna, anul
        )
        logging.info(
            f"{log_prefix}: Solduri deschidere Impr={opening_impr_sold}, Dep={opening_dep_sold}"
        )

        # Compară dep_deb modificat cu valoarea din ultimul record
        old_dep_deb = self._last_record_data.get('dep_deb', Decimal('0.00'))
        if new_dep_deb != old_dep_deb:
            # Întreabă utilizatorul dacă dorește să actualizeze cotizația standard
            if afiseaza_intrebare(
                    f"Ați modificat cotizația lunară de la {old_dep_deb:.2f} la {new_dep_deb:.2f}.\n\n"
                    f"Doriți să actualizați și cotizația standard pentru lunile viitoare?",
                    titlu="Actualizare Cotizație Standard",
                    parent=self,
                    buton_default=QMessageBox.Yes  # Default la Yes
            ):
                success = self._actualizeaza_cotizatie_standard(self._loaded_nr_fisa, new_dep_deb)
                if success:
                    self.lbl_recalc_status.setText("✓ Cotizație standard actualizată")
                    QTimer.singleShot(3000, lambda: self.lbl_recalc_status.setText(""))
                else:
                    afiseaza_warning(
                        "Nu s-a putut actualiza cotizația standard în baza de date.\n"
                        "Verificați jurnalul de evenimente pentru detalii.",
                        parent=self
                    )

        # Verificare fond disponibil
        available_dep_fund = opening_dep_sold + new_dep_deb
        if new_dep_cred > available_dep_fund:
            afiseaza_eroare(
                f"Retragere ({new_dep_cred:.2f}) > fond disponibil ({available_dep_fund:.2f})! Anulat.",
                parent=self
            )
            logging.warning(f"{log_prefix}: Anulat. Retragere {new_dep_cred} > Disp {available_dep_fund}")
            return

        recalculated_impr_sold = opening_impr_sold + new_impr_deb - new_impr_cred
        recalculated_dep_sold = opening_dep_sold + new_dep_deb - new_dep_cred

        # Ajustăm soldul împrumutului la 0 dacă este foarte aproape de 0
        if recalculated_impr_sold <= Decimal('0.005'):
            recalculated_impr_sold = Decimal('0.00')

        logging.info(
            f"{log_prefix}: Solduri recalculate Impr={recalculated_impr_sold}, Dep={recalculated_dep_sold}"
        )

        # În loc să utilizăm conexiunea la membrii pentru IMPRUMUT_ACTIV,
        # trecem direct la actualizarea tabelei depcred

        # UPDATE pentru tabela depcred
        conn = None
        try:
            conn = sqlite3.connect(DB_DEPCRED)
            cursor = conn.cursor()

            # Actualizăm toate câmpurile relevante
            update_query = """
            UPDATE depcred 
            SET dobanda = ?, impr_deb = ?, impr_cred = ?, impr_sold = ?, 
                dep_deb = ?, dep_cred = ?, dep_sold = ? 
            WHERE nr_fisa = ? AND luna = ? AND anul = ?
            """

            update_params = (
                float(new_dobanda), float(new_impr_deb), float(new_impr_cred),
                float(recalculated_impr_sold), float(new_dep_deb), float(new_dep_cred),
                float(recalculated_dep_sold), self._loaded_nr_fisa, luna, anul
            )

            cursor.execute(update_query, update_params)
            conn.commit()

            logging.info(f"Date actualizate în depcred pentru {self._loaded_nr_fisa}/{luna:02d}-{anul}")

            # Acum reîmprospătăm istoricul pentru a vedea modificările
            self._afiseaza_istoric(self._loaded_nr_fisa)

            # Opțional, declanșează recalcularea lunilor ulterioare
            self._declanseaza_recalculare_ulterioara(self._loaded_nr_fisa, luna, anul)

        except sqlite3.Error as e:
            logging.error(f"Eroare DB la actualizare depcred: {e}", exc_info=True)
            if conn:
                conn.rollback()
            afiseaza_eroare(f"Eroare la actualizarea datelor:\n{e}", parent=self)
        finally:
            if conn:
                conn.close()


# --- Widget Custom pentru Scroll Sincronizat ---
class SyncedTextEdit(QTextEdit):
    """ QTextEdit care sincronizează scroll-ul vertical. """

    def __init__(self, siblings=None, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.siblings = siblings if siblings is not None else []

    def wheelEvent(self, event):
        """ Suprascrie evenimentul de scroll. """
        scrollbar = self.verticalScrollBar()
        can_scroll = scrollbar.minimum() < scrollbar.maximum()

        if not can_scroll:
            event.ignore()
            return

        old_val = scrollbar.value()
        super().wheelEvent(event)
        new_val = scrollbar.value()

        if new_val != old_val:
            for te in self.siblings:
                if te is not self and te.isVisible():
                    sibling_scrollbar = te.verticalScrollBar()
                    if (sibling_scrollbar and
                            sibling_scrollbar.parent() is not None and
                            hasattr(sibling_scrollbar, 'value') and
                            hasattr(sibling_scrollbar, 'setValue') and
                            sibling_scrollbar.minimum() <
                            sibling_scrollbar.maximum() and
                            sibling_scrollbar.value() != new_val):
                        try:
                            sibling_scrollbar.setValue(new_val)
                        except Exception as e_scroll:
                            logging.error(
                                f"Eroare la sincronizare scroll: {e_scroll}"
                            )


# --- Clasa SumeLunareWidget ---
class SumeLunareWidget(QWidget):
    """ Widget principal pentru vizualizarea și modificarea sumelor lunare cu design modern. """

    def __init__(self, parent=None):
        super().__init__(parent)
        self._verificare_activa = False
        self._loaded_nr_fisa = None
        self._last_record_data = {}
        self._coloane_financiare_widgets = []
        self._coloane_financiare_layout_map = {}
        self._update_completer_flag = True
        self.lista_completa_membri = {}
        self.loan_interest_rate_on_demand = Decimal(str(get_dobanda()))
        self._recalculation_running = False

        if 'missing_dbs' in globals() and missing_dbs:
            QTimer.singleShot(0, lambda: afiseaza_eroare(
                "Lipsesc DB esențiale:\n"
                f"- {', '.join(missing_dbs)}\n"
                "Verificați căile.\nFuncționalitate limitată.",
                self
            ))

        self._init_ui()
        self._apply_styles()
        self._connect_signals()
        self.reset_form()
        self._incarca_lista_membri_completer()

    # --- METODE UI ---
    def _init_ui(self):
        """ Inițializează componentele UI cu design modern. """
        self.main_layout = QVBoxLayout(self)
        self.main_layout.setContentsMargins(15, 15, 15, 15)
        self.main_layout.setSpacing(15)

        self._setup_header_frame()
        self._setup_scroll_area_with_financial_columns()
        self._configure_financial_columns()

        # Adăugăm etichetele de status și rate cu design îmbunătățit
        self.bottom_info_layout = QHBoxLayout()

        # Etichetă pentru rata curentă cu design modern
        dobanda_curenta = get_dobanda() * 1000  # convertim la promile
        self.current_rate_label = QLabel(
            f"Rata dobândă la zi: {dobanda_curenta:.1f} ‰")
        self.current_rate_label.setObjectName("lblCurrentRate")
        self.current_rate_label.setStyleSheet("""
            QLabel#lblCurrentRate { 
                color: #17a2b8; 
                font-weight: bold; 
                background: qlineargradient(x1:0, y1:0, x2:1, y2:0,
                    stop:0 rgba(23, 162, 184, 0.1), stop:1 rgba(23, 162, 184, 0.05));
                padding: 6px 12px;
                border-radius: 6px;
                border: 1px solid rgba(23, 162, 184, 0.3);
            }
        """)

        # Etichetă pentru ghidare flux de lucru cu design îmbunătățit
        self.lbl_workflow_hint = QLabel(
            "Flux de lucru pentru achitare anticipată a împrumutului: 1. Aplică Dobândă → 2. Modifică Tranzacție")
        self.lbl_workflow_hint.setObjectName("lblWorkflowHint")
        self.lbl_workflow_hint.setStyleSheet("""
            QLabel#lblWorkflowHint { 
                color: #6c757d; 
                font-style: italic;
                background: rgba(108, 117, 125, 0.05);
                padding: 4px 8px;
                border-radius: 4px;
            }
        """)

        # Etichetă pentru status recalculare cu design modern
        self.lbl_recalc_status = QLabel("")
        self.lbl_recalc_status.setAlignment(Qt.AlignRight)
        self.lbl_recalc_status.setStyleSheet("""
            QLabel { 
                color: #17a2b8; 
                font-weight: bold;
                background: rgba(23, 162, 184, 0.1);
                padding: 4px 10px;
                border-radius: 6px;
                border: 1px solid rgba(23, 162, 184, 0.2);
            }
        """)

        self.bottom_info_layout.addWidget(self.current_rate_label)
        self.bottom_info_layout.addWidget(self.lbl_workflow_hint)
        self.bottom_info_layout.addStretch(1)
        self.bottom_info_layout.addWidget(self.lbl_recalc_status)

        self.main_layout.addLayout(self.bottom_info_layout)

        # Adăugare scurtături pentru butoane
        self._setup_shortcuts()

    def _setup_shortcuts(self):
        """ Configurează scurtăturile pentru butoane. """
        self.reset_button.setShortcut("Escape")  # Reset/Anulare
        self.buton_modifica_tranzactie.setShortcut("F1")  # Modificare/Opțiuni
        self.buton_aplica_dobanda.setShortcut("F5")  # Recalculare dobândă

        self.reset_button.setToolTip("Golește formularul și istoricul (ESC)")
        self.buton_modifica_tranzactie.setToolTip(
            "Modifică tranzacția pentru ultima lună înregistrată (F1)")
        self.buton_aplica_dobanda.setToolTip(
            "Calculează dobânda la zi pentru achitare anticipată (F5)")

    def _setup_header_frame(self):
        """ Creează și configurează frame-ul de header modern. """
        self.header_frame = QFrame()
        self.header_frame.setObjectName("header_frame")
        header_layout = QGridLayout(self.header_frame)
        header_layout.setContentsMargins(15, 12, 15, 12)
        header_layout.setSpacing(12)
        header_layout.setVerticalSpacing(10)

        # Etichete și câmpuri
        self.lbl_nume = QLabel("Nume Prenume:")
        self.txt_nume = QLineEdit()
        self.txt_nume.setPlaceholderText("Căutare după nume...")
        self.lbl_nr_fisa = QLabel("Număr Fișă:")
        self.txt_nr_fisa = QLineEdit()
        self.txt_nr_fisa.setPlaceholderText("Căutare după fișă...")
        self.lbl_adresa = QLabel("Adresa:")
        self.txt_adresa = QLineEdit()
        self.txt_adresa.setReadOnly(True)
        self.lbl_data_insc = QLabel("Data Înscrierii:")
        self.txt_data_insc = QLineEdit()
        self.txt_data_insc.setReadOnly(True)
        self.lbl_calitate = QLabel("Calitatea:")
        self.txt_calitate = QLineEdit()
        self.txt_calitate.setReadOnly(True)

        # Butoane cu design modern îmbunătățit
        self.reset_button = QPushButton("Golește formular")
        self.reset_button.setObjectName("reset_button")
        self.reset_button.setToolTip("Golește formularul și istoricul")

        self.buton_modifica_tranzactie = QPushButton("Modifică Tranzacție")
        self.buton_modifica_tranzactie.setObjectName("buton_modifica")
        self.buton_modifica_tranzactie.setToolTip(
            "Modifică tranzacția pentru ultima lună înregistrată"
        )
        self.buton_modifica_tranzactie.setEnabled(False)

        self.buton_aplica_dobanda = QPushButton("Aplică Dobândă")
        self.buton_aplica_dobanda.setObjectName("buton_dobanda")
        self.buton_aplica_dobanda.setToolTip(
            "Calculează dobânda la zi pentru achitare anticipată"
        )
        self.buton_aplica_dobanda.setEnabled(False)

        # Aliniere verticală (aplicăm o înălțime minimă comună)
        common_min_height = 35
        for w in (self.txt_nume, self.txt_nr_fisa, self.txt_adresa,
                  self.txt_data_insc, self.txt_calitate, self.reset_button,
                  self.buton_aplica_dobanda, self.buton_modifica_tranzactie):
            w.setMinimumHeight(common_min_height)

        # Adăugare în grilă conform schiței
        # Rândul 0
        header_layout.addWidget(self.lbl_nume, 0, 0)
        header_layout.addWidget(self.txt_nume, 0, 1)
        header_layout.addWidget(self.lbl_nr_fisa, 0, 2)
        header_layout.addWidget(self.txt_nr_fisa, 0, 3)
        header_layout.addWidget(self.reset_button, 0, 4)
        # Rândul 1
        header_layout.addWidget(self.lbl_adresa, 1, 0)
        header_layout.addWidget(self.txt_adresa, 1, 1)
        header_layout.addWidget(self.lbl_data_insc, 1, 2)
        header_layout.addWidget(self.txt_data_insc, 1, 3)

        # Butoanele de acțiune pentru împrumut în rândul 1, coloana 4
        button_layout_row1 = QVBoxLayout()
        button_layout_row1.setContentsMargins(0, 0, 0, 0)
        button_layout_row1.setSpacing(6)
        button_layout_row1.addWidget(self.buton_aplica_dobanda)
        header_layout.addLayout(button_layout_row1, 1, 4)

        # Rândul 2
        header_layout.addWidget(self.lbl_calitate, 2, 0)
        header_layout.addWidget(self.txt_calitate, 2, 1)
        # Adăugăm un spacer în coloanele 2 și 3 pentru a împinge butoanele la dreapta
        header_layout.addItem(
            QSpacerItem(10, 10, QSizePolicy.Expanding, QSizePolicy.Minimum),
            2, 2
        )
        header_layout.addItem(
            QSpacerItem(10, 10, QSizePolicy.Expanding, QSizePolicy.Minimum),
            2, 3
        )
        # Plasăm butoanele pe rândul 2, coloana 4
        button_layout_row2 = QVBoxLayout()
        button_layout_row2.setContentsMargins(0, 0, 0, 0)
        button_layout_row2.setSpacing(6)
        button_layout_row2.addWidget(self.buton_modifica_tranzactie)
        header_layout.addLayout(button_layout_row2, 2, 4)

        # Setăm stretch pentru coloane (0-4)
        header_layout.setColumnStretch(1, 3)  # Nume, Adresa, Calitate
        header_layout.setColumnStretch(3, 1)  # Nr Fisa, Data Insc
        # Coloanele 0, 2, 4 au stretch implicit

        self.main_layout.addWidget(self.header_frame)

        # Completer
        self.completer = QCompleter()
        self.completer.setCaseSensitivity(Qt.CaseInsensitive)
        self.completer.setFilterMode(Qt.MatchContains)
        self.completer.setCompletionMode(QCompleter.PopupCompletion)
        self.txt_nume.setCompleter(self.completer)

    def _setup_scroll_area_with_financial_columns(self):
        """ Creează zona scrollabilă și frame-urile pentru secțiuni cu design modern. """
        scroll_container = QWidget()
        scroll_hbox = QHBoxLayout(scroll_container)
        scroll_hbox.setContentsMargins(0, 0, 0, 0)
        scroll_hbox.setSpacing(8)

        self.columns_frame = QFrame()
        self.columns_frame.setObjectName("columns_frame")
        columns_layout = QHBoxLayout(self.columns_frame)
        columns_layout.setContentsMargins(0, 0, 0, 0)
        columns_layout.setSpacing(8)

        # Secțiuni cu design îmbunătățit
        self.loan_section = self._create_financial_section_frame(
            "Situație Împrumuturi", "#e74c3c", "#fff5f5", "#ffcdd2"
        )
        self.date_section = self._create_financial_section_frame(
            "Dată", "#6c757d", "#f8f9fa", "#dee2e6"
        )
        self.deposit_section = self._create_financial_section_frame(
            "Situație Depuneri", "#28a745", "#f8fff8", "#d4edda"
        )

        self.loan_columns_layout = QHBoxLayout()
        self.loan_columns_layout.setContentsMargins(0, 0, 0, 0)
        self.date_columns_layout = QHBoxLayout()
        self.date_columns_layout.setContentsMargins(0, 0, 0, 0)
        self.deposit_columns_layout = QHBoxLayout()
        self.deposit_columns_layout.setContentsMargins(0, 0, 0, 0)

        self.loan_section.layout().addLayout(self.loan_columns_layout)
        self.date_section.layout().addLayout(self.date_columns_layout)
        self.deposit_section.layout().addLayout(self.deposit_columns_layout)

        columns_layout.addWidget(self.loan_section, stretch=4)
        columns_layout.addWidget(self.date_section, stretch=1)
        columns_layout.addWidget(self.deposit_section, stretch=3)

        scroll_hbox.addWidget(self.columns_frame)

        self.scroll_area = QScrollArea()
        self.scroll_area.setWidgetResizable(True)
        self.scroll_area.setWidget(scroll_container)
        self.scroll_area.setHorizontalScrollBarPolicy(Qt.ScrollBarAsNeeded)
        self.scroll_area.setVerticalScrollBarPolicy(Qt.ScrollBarAsNeeded)
        self.scroll_area.setMinimumHeight(250)

        self.main_layout.addWidget(self.scroll_area, stretch=1)

    def _create_financial_section_frame(
            self, title, border_color, bg_color, header_bg_color
    ):
        """ Creează un QFrame stilizat modern pentru o secțiune. """
        section = QFrame()
        section_layout = QVBoxLayout(section)
        section_layout.setContentsMargins(8, 8, 8, 8)
        section_layout.setSpacing(6)

        # Design îmbunătățit cu gradienți
        if "Împrumuturi" in title:
            section.setStyleSheet(f"""
                QFrame {{ 
                    border: 3px solid {border_color}; 
                    border-radius: 12px; 
                    background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                        stop:0 {bg_color}, stop:1 #ffebee); 
                }}
            """)
        elif "Depuneri" in title:
            section.setStyleSheet(f"""
                QFrame {{ 
                    border: 3px solid {border_color}; 
                    border-radius: 12px; 
                    background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                        stop:0 {bg_color}, stop:1 #e8f5e8); 
                }}
            """)
        else:  # Dată
            section.setStyleSheet(f"""
                QFrame {{ 
                    border: 3px solid {border_color}; 
                    border-radius: 12px; 
                    background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                        stop:0 {bg_color}, stop:1 #e9ecef); 
                }}
            """)

        lbl_header = QLabel(title)
        lbl_header.setAlignment(Qt.AlignCenter)
        lbl_header.setMinimumHeight(38)
        if "Împrumuturi" in title:
            lbl_header.setStyleSheet("""
                        QLabel {
                            background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                                stop:0 #ffcdd2, stop:1 #ef9a9a);
                            border: 2px solid #e74c3c;
                            border-radius: 8px;
                            padding: 8px 15px;
                            font-weight: bold;
                            font-size: 11pt;
                            color: #2c3e50;
                            margin-bottom: 6px;
                        }
                    """)
        elif "Depuneri" in title:
            lbl_header.setStyleSheet("""
                        QLabel {
                            background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                                stop:0 #d4edda, stop:1 #a3d977);
                            border: 2px solid #28a745;
                            border-radius: 8px;
                            padding: 8px 15px;
                            font-weight: bold;
                            font-size: 11pt;
                            color: #2c3e50;
                            margin-bottom: 6px;
                        }
                    """)
        else:  # Dată
            lbl_header.setStyleSheet("""
                        QLabel {
                            background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                                stop:0 #dee2e6, stop:1 #adb5bd);
                            border: 2px solid #6c757d;
                            border-radius: 8px;
                            padding: 8px 15px;
                            font-weight: bold;
                            font-size: 11pt;
                            color: #2c3e50;
                            margin-bottom: 6px;
                        }
                    """)
        section_layout.addWidget(lbl_header)
        return section

    def _add_financial_column(
            self, section_layout, column_name, title,
            add_label=True, read_only=True
    ):
        """ Adaugă o coloană financiară cu design modern. """
        text_edit = SyncedTextEdit(siblings=self._coloane_financiare_widgets)
        text_edit.setReadOnly(read_only)
        text_edit.setVerticalScrollBarPolicy(Qt.ScrollBarAlwaysOff)
        text_edit.setHorizontalScrollBarPolicy(Qt.ScrollBarAlwaysOff)
        text_edit.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Expanding)
        text_edit.setMinimumHeight(150)

        font = QFont("Consolas", 10)
        if not font.exactMatch(): font = QFont("Courier New", 10)
        text_edit.setFont(font)

        text_edit.setStyleSheet("""
            QTextEdit {
                border: 2px solid #adb5bd;
                border-top: none; border-radius: 0px;
                border-bottom-left-radius: 8px;
                border-bottom-right-radius: 8px; 
                padding: 6px; 
                background-color: #ffffff; 
                color: #495057;
                selection-background-color: #b3d1ff;
            }
            QTextEdit:read-only {
                background-color: #f8f9fa; 
                color: #6c757d;
            }
            QTextEdit:focus {
                border-color: #4a90e2;
                background-color: #fafbfc;
            }
        """)

        layout = QVBoxLayout()
        layout.setSpacing(0)
        label = None
        if add_label:
            label = QLabel(title)
            label.setAlignment(Qt.AlignCenter)
            label.setFixedHeight(32)
            label.setStyleSheet("""
                QLabel {
                    background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                        stop:0 #f1f3f4, stop:1 #e8eaed);
                    border: 2px solid #adb5bd;
                    border-bottom: none;
                    border-top-left-radius: 8px;
                    border-top-right-radius: 8px; 
                    padding: 6px;
                    font-weight: bold; 
                    font-size: 9pt; 
                    color: #2c3e50;
                }
            """)
            layout.addWidget(label)
        layout.addWidget(text_edit, stretch=1)

        section_layout.addLayout(layout)

        column_data = {"layout": layout, "label": label, "text_edit": text_edit}
        self._coloane_financiare_layout_map[column_name] = column_data
        self._coloane_financiare_widgets.append(text_edit)
        return column_data

    def _configure_financial_columns(self):
        """ Adaugă toate coloanele financiare necesare. """
        self._add_financial_column(self.loan_columns_layout, 'dobanda', "Dobândă")
        self._add_financial_column(self.loan_columns_layout, 'impr_deb', "Împrumut")
        self._add_financial_column(self.loan_columns_layout, 'impr_cred', "Rată Achitată")
        self._add_financial_column(self.loan_columns_layout, 'impr_sold', "Sold Împrumut")
        self._add_financial_column(self.date_columns_layout, 'luna_an', "Lună-An")
        self._add_financial_column(self.deposit_columns_layout, 'dep_deb', "Cotizație")
        self._add_financial_column(self.deposit_columns_layout, 'dep_cred', "Retragere")
        self._add_financial_column(self.deposit_columns_layout, 'dep_sold', "Sold Depuneri")
        for widget in self._coloane_financiare_widgets: widget.setReadOnly(True)

    def _apply_styles(self):
        """ Aplică stilurile CSS moderne centralizate. """
        general_styles = """
            SumeLunareWidget, QWidget {
                font-family: 'Segoe UI', Arial, sans-serif; 
                font-size: 10pt; 
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 #f8f9fa, stop:1 #e9ecef);
            }
            QScrollArea { 
                border: none; 
                background-color: transparent;
            }
            /* ScrollBar modern */
            QScrollBar:vertical {
                border: none; background: rgba(0,0,0,0.1); width: 12px;
                margin: 0; border-radius: 6px;
            }
            QScrollBar::handle:vertical {
                background: rgba(74, 144, 226, 0.7); min-height: 20px; 
                border-radius: 6px; margin: 2px;
            }
            QScrollBar::handle:vertical:hover { 
                background: rgba(74, 144, 226, 0.9); 
            }
            QScrollBar::add-line:vertical, QScrollBar::sub-line:vertical {
                border: none; background: none; height: 0px;
            }
            QScrollBar:horizontal {
                border: none; background: rgba(0,0,0,0.1); height: 12px;
                margin: 0; border-radius: 6px;
            }
            QScrollBar::handle:horizontal {
                background: rgba(74, 144, 226, 0.7); min-width: 20px; 
                border-radius: 6px; margin: 2px;
            }
            QScrollBar::handle:horizontal:hover { 
                background: rgba(74, 144, 226, 0.9); 
            }
            QScrollBar::add-line:horizontal, QScrollBar::sub-line:horizontal {
                border: none; background: none; width: 0px;
            }
            QLineEdit {
                background-color: #ffffff;
                border: 2px solid #b3d1ff;
                border-radius: 6px;
                padding: 6px 10px;
                min-height: 23px;
                font-size: 10pt;
            }
            QLineEdit:focus {
                border-color: #4a90e2;
                box-shadow: 0 0 0 2px rgba(74, 144, 226, 0.2);
            }
            QLineEdit:read-only {
                background-color: #f8f9fa;
                color: #6c757d;
                border-color: #dee2e6;
            }
            QLabel { 
                color: #2c3e50; 
                padding-bottom: 2px; 
                font-weight: bold;
            }
        """

        header_styles = """
            QFrame#header_frame {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 #f8fbff, stop:1 #e7f3ff);
                border: 2px solid #4a90e2;
                border-radius: 10px;
                padding: 10px 15px;
            }
            QFrame#header_frame QLabel {
                font-weight: bold; 
                padding-bottom: 0px; 
                background: none;
                border: none;
                color: #2c3e50;
            }
        """

        button_styles = """
            QPushButton#reset_button {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 #ff6b6b, stop:1 #ee5a52);
                border: 2px solid #e74c3c;
                border-radius: 8px;
                font-size: 10pt; font-weight: bold;
                padding: 8px 16px; color: white; 
                min-width: 120px;
            }
            QPushButton#reset_button:hover {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 #ff7b7b, stop:1 #ff6b6b);
                border-color: #dc3545;
                transform: translateY(-1px);
            }
            QPushButton#reset_button:pressed {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 #ee5a52, stop:1 #e74c3c);
                transform: translateY(0px);
            }

            QPushButton#buton_modifica {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 #ffc107, stop:1 #e0a800);
                border: 2px solid #ffc107;
                border-radius: 8px;
                color: #2c3e50; 
                font-weight: bold;
                padding: 8px 16px;
                min-width: 140px;
            }
            QPushButton#buton_modifica:hover {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 #ffcd39, stop:1 #ffc107);
                border-color: #e0a800;
                transform: translateY(-1px);
            }
            QPushButton#buton_modifica:disabled {
                background-color: #6c757d; 
                color: #cccccc;
                border-color: #6c757d;
            }

            QPushButton#buton_dobanda {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 #17a2b8, stop:1 #138496);
                border: 2px solid #17a2b8;
                border-radius: 8px;
                color: white; 
                font-weight: bold;
                padding: 8px 16px;
                min-width: 140px;
            }
            QPushButton#buton_dobanda:hover {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 #20c9e0, stop:1 #17a2b8);
                border-color: #138496;
                transform: translateY(-1px);
            }
            QPushButton#buton_dobanda:disabled {
                background-color: #6c757d; 
                color: #cccccc;
                border-color: #6c757d;
            }
        """

        self.setStyleSheet(general_styles + header_styles + button_styles)

        # Aplicăm font modern
        font = QFont("Segoe UI", 10)
        self.setFont(font)
        if hasattr(self, 'header_frame'):
            self.header_frame.setStyleSheet(header_styles)

    def _update_completer_model(self, text=None):
        """Actualizează modelul pentru QCompleter."""
        if not hasattr(self, '_update_completer_flag') or not self._update_completer_flag:
            return

        prefix = self.txt_nume.text().strip()
        if len(prefix) < 2:
            self.completer.setModel(None)
            return

        try:
            # Utilizăm lista completă încărcată anterior
            if hasattr(self, 'lista_completa_membri') and self.lista_completa_membri:
                filtered_items = [item for item in self.lista_completa_membri.keys()
                                  if isinstance(item, str) and '(F:' in item and
                                  prefix.lower() in item.lower()]

                model = QStringListModel(sorted(filtered_items))
                self.completer.setModel(model)

                if filtered_items and self.txt_nume.hasFocus() and not self.completer.popup().isVisible():
                    self.completer.complete()
        except Exception as e_compl:
            logging.error(f"Eroare actualizare completer: {e_compl}", exc_info=True)

    def _connect_signals(self):
        """ Conectează semnalele la sloturi. """
        self.txt_nume.textEdited.connect(self._update_completer_model)
        self.completer.activated[str].connect(self._handle_name_selected)
        self.completer.activated[QModelIndex].connect(
            lambda idx: self._handle_name_selected(idx.data())
        )
        self.txt_nume.returnPressed.connect(self._on_return_pressed)
        self.txt_nr_fisa.editingFinished.connect(self._handle_fisa_entered)
        self.reset_button.clicked.connect(self.reset_form)
        self.buton_modifica_tranzactie.clicked.connect(
            self._deschide_dialog_modificare
        )
        self.buton_aplica_dobanda.clicked.connect(self._handle_aplica_dobanda)

    def _actualizeaza_cotizatie_standard(self, nr_fisa, noua_cotizatie):
        """
        Actualizează câmpul COTIZATIE_STANDARD în tabela membrii pentru nr_fisa specificat.
        Această funcție este apelată când utilizatorul modifică manual dep_deb și confirmă
        dorința de a actualiza valoarea standard.

        Args:
            nr_fisa (int): Numărul fișei pentru care se actualizează cotizația standard
            noua_cotizatie (Decimal): Noua valoare pentru cotizația standard

        Returns:
            bool: True dacă actualizarea a reușit, False în caz de eroare
        """
        if not nr_fisa:
            logging.error("Actualizare cotizație standard: nr_fisa invalid")
            return False

        conn = None
        try:
            # Folosim path-ul complet al DB_MEMBRII definit mai sus în modul
            conn = sqlite3.connect(DB_MEMBRII)
            cursor = conn.cursor()

            # Actualizăm cotizație standard în tabela membrii
            cursor.execute(
                "UPDATE membrii SET COTIZATIE_STANDARD = ? WHERE NR_FISA = ?",
                (float(noua_cotizatie), nr_fisa)
            )

            if cursor.rowcount == 0:
                logging.warning(f"Actualizare cotizație standard: Niciun rând afectat pentru fișa {nr_fisa}")
                return False

            conn.commit()
            logging.info(f"Cotizație standard actualizată pentru fișa {nr_fisa}: {noua_cotizatie}")
            return True

        except sqlite3.Error as e:
            logging.error(f"SQLite error la actualizare cotizație standard: {e}", exc_info=True)
            if conn:
                conn.rollback()
            return False
        except Exception as e_gen:
            logging.error(f"Eroare generală la actualizare cotizație standard: {e_gen}", exc_info=True)
            if conn:
                conn.rollback()
            return False
        finally:
            if conn:
                conn.close()

    def _declanseaza_recalculare_ulterioara(self, nr_fisa, luna_modificata, an_modificat):
        """ Verifică și pornește recalcularea în background de la luna modificată încolo. """
        if self._recalculation_running:
            logging.warning("Recalculare deja în curs.")
            self.lbl_recalc_status.setText("Info: Recalculare în desfășurare.")
            QTimer.singleShot(3000,
                              lambda: self.lbl_recalc_status.setText("") if not self._recalculation_running else None)
            return

        # Recalcularea trebuie să înceapă DE LA luna modificată + 1
        start_recalc_luna = luna_modificata + 1
        start_recalc_anul = an_modificat
        if start_recalc_luna > 12:
            start_recalc_luna = 1
            start_recalc_anul += 1

        start_recalc_period_val = start_recalc_anul * 100 + start_recalc_luna

        conn_check = None
        needs_recalc = False
        last_period_val = 0
        try:
            conn_check = sqlite3.connect(f"file:{DB_DEPCRED}?mode=ro", uri=True)
            cursor_check = conn_check.cursor()
            # Găsim ultima lună înregistrată pentru acest membru
            cursor_check.execute("SELECT MAX(anul*100+luna) FROM depcred WHERE nr_fisa = ?", (nr_fisa,))
            last_period_val_res = cursor_check.fetchone()

            if last_period_val_res and last_period_val_res[0] is not None:
                last_period_val = last_period_val_res[0]
                # Recalcularea este necesară dacă luna modificată nu este ultima înregistrată
                if start_recalc_period_val <= last_period_val:
                    needs_recalc = True
                    end_recalc_luna = last_period_val % 100
                    end_recalc_anul = last_period_val // 100
                    logging.info(
                        f"Recalculare necesară {nr_fisa} de la {start_recalc_luna:02d}-{start_recalc_anul} -> {end_recalc_luna:02d}-{end_recalc_anul}")
                else:
                    # Luna modificată este cea mai recentă, nu e necesară recalcularea ulterioară
                    logging.info(
                        f"Luna {luna_modificata:02d}-{an_modificat} este cea mai recentă pentru {nr_fisa}. Recalculare ulterioară nu este necesară.")

            else:
                logging.info(
                    f"Nu s-au găsit înregistrări pentru {nr_fisa} după modificare. Recalculare nu este necesară.")

        except sqlite3.Error as e_check:
            logging.error(f"Eroare DB verificare recalc {nr_fisa}: {e_check}", exc_info=True)
        finally:
            if conn_check:
                conn_check.close()

        if needs_recalc:
            self._recalculation_running = True
            self.setCursor(Qt.WaitCursor)
            self.lbl_recalc_status.setText(f"⏳ Recalculare solduri {nr_fisa}...")
            self.lbl_recalc_status.setStyleSheet("QLabel { color: #17a2b8; font-weight: bold; }")
            self.buton_modifica_tranzactie.setEnabled(False)
            self.buton_aplica_dobanda.setEnabled(False)
            QApplication.processEvents()

            # Apelăm worker-ul de recalculare din această clasă (marcat ca static)
            try:
                run_task_in_background(
                    self,
                    SumeLunareWidget._worker_recalculeaza_luni_ulterioare,
                    nr_fisa,
                    start_recalc_luna,
                    start_recalc_anul,
                    last_period_val,
                    db_depcred_path=DB_DEPCRED,  # Adăugați acest parametru
                    on_finish=self._on_recalculation_finished,
                    on_error=self._on_recalculation_error,
                    on_progress=self._on_recalculation_progress
                )
            except Exception as e_run:
                logging.error(f"Eroare la rularea worker-ului de recalculare: {e_run}", exc_info=True)
                afiseaza_eroare(f"Eroare la inițierea recalculării:\n{e_run}", parent=self)
                self._generation_cleanup()  # Curățăm UI-ul de stare de recalculare
        else:
            # Nu e necesară recalcularea ulterioară, curățăm starea UI
            self._generation_cleanup()

    @staticmethod
    def _worker_recalculeaza_luni_ulterioare(
            nr_fisa, start_luna, start_anul, end_period_val,
            db_depcred_path=None, **kwargs
    ):
        """
        Worker (static) pentru recalcularea lunilor ulterioare după o modificare/inserare.
        Rulează într-un thread separat.
        """
        progress_callback = kwargs.get('progress_callback')

        def report_progress(message):
            logging.info(f"[Recalc {nr_fisa}] {message}")
            if progress_callback:
                try:
                    QMetaObject.invokeMethod(progress_callback, "emit", Qt.QueuedConnection, Q_ARG(str, message))
                except Exception as e_prog:
                    logging.error(f"Eroare emitere progres: {e_prog}")

        conn = None
        current_luna = start_luna
        current_anul = start_anul
        target_period_val = end_period_val

        report_progress(f"--- Recalculare pentru fișa {nr_fisa} de la {start_luna:02d}-{start_anul} ---")

        try:
            # --- Deschidere Conexiune (Read-Write) ---
            report_progress("ℹ️ Deschidere conexiune DB (Recalc)...")
            # Folosim calea absolută pentru siguranță
            # Folosește calea furnizată sau fallback la DB_DEPCRED
            db_path = db_depcred_path if db_depcred_path else DB_DEPCRED
            db_path_abs = os.path.abspath(db_path)
            conn = sqlite3.connect(db_path_abs)
            cursor = conn.cursor()
            report_progress("✅ Conexiune DB deschisă.")

            total_lunii_procesate = 0
            # Iterăm de la luna de start (inclusiv) până la ultima lună înregistrată
            while (current_anul * 100 + current_luna) <= target_period_val:
                period_val = current_anul * 100 + current_luna
                report_progress(f"Recalculare {current_luna:02d}-{current_anul}...")

                # 1. Preluare solduri de la sfârșitul lunii ANTERIOARE
                prev_luna = current_luna - 1 if current_luna > 1 else 12
                prev_anul = current_anul if current_luna > 1 else current_anul - 1

                opening_impr_sold = Decimal('0.00')
                opening_dep_sold = Decimal('0.00')

                if prev_anul > 0:  # Asigurăm că nu căutăm înainte de anul 1
                    cursor.execute(
                        "SELECT impr_sold, dep_sold FROM depcred "
                        "WHERE nr_fisa=? AND luna=? AND anul=?",
                        (nr_fisa, prev_luna, prev_anul)
                    )
                    opening_balances = cursor.fetchone()
                    if opening_balances:
                        opening_impr_sold = Decimal(str(opening_balances[0] or '0.00'))
                        opening_dep_sold = Decimal(str(opening_balances[1] or '0.00'))
                    else:
                        # Dacă luna anterioară lipsește, soldurile de deschidere sunt 0
                        # Acest caz ar trebui să fie rar dacă istoricul e complet,
                        # dar e posibil la început sau după ștergeri.
                        logging.warning(f"[Recalc {nr_fisa}] Lipsă date {prev_luna}-{prev_anul}. Solduri deschidere 0.")
                        opening_impr_sold = Decimal('0.00')
                        opening_dep_sold = Decimal('0.00')

                # 2. Preluare tranzacții (dobanda, impr_deb, impr_cred, dep_deb, dep_cred)
                #    existente pentru luna CURENTĂ din DB
                cursor.execute(
                    "SELECT dobanda, impr_deb, impr_cred, dep_deb, dep_cred FROM depcred "
                    "WHERE nr_fisa=? AND luna=? AND anul=?",
                    (nr_fisa, current_luna, current_anul)
                )
                current_data_row = cursor.fetchone()

                if not current_data_row:
                    # Dacă înregistrarea pentru luna curentă lipsește, nu putem recalcula.
                    # Acest lucru nu ar trebui să se întâmple dacă logica de INSERT/UPDATE
                    # funcționează corect. O să logăm o eroare și o să oprim recalcularea pentru acest membru.
                    report_progress(
                        f"⛔ Eroare: Lipsă înregistrare {current_luna:02d}-{current_anul} pentru fișa {nr_fisa}. Recalculare oprită.")
                    logging.error(f"[Recalc {nr_fisa}] Lipsă înregistrare {current_luna}-{current_anul}.")
                    # Putem alege să continuăm la luna următoare sau să oprim complet.
                    # Pentru siguranță, oprim recalcularea pentru acest membru.
                    raise RuntimeError(f"Înregistrare lipsă pentru recalculare: {current_luna:02d}-{current_anul}")

                existing_dobanda = Decimal(str(current_data_row[0] or '0.00'))
                existing_impr_deb = Decimal(str(current_data_row[1] or '0.00'))
                existing_impr_cred = Decimal(str(current_data_row[2] or '0.00'))
                existing_dep_deb = Decimal(str(current_data_row[3] or '0.00'))
                existing_dep_cred = Decimal(str(current_data_row[4] or '0.00'))

                # 3. Recalculăm soldurile finale pentru luna CURENTĂ
                recalc_impr_sold = opening_impr_sold + existing_impr_deb - existing_impr_cred
                recalc_dep_sold = opening_dep_sold + existing_dep_deb - existing_dep_cred

                # Ajustare sold împrumut la zero dacă este foarte aproape
                if recalc_impr_sold <= Decimal('0.005'):
                    recalc_impr_sold = Decimal("0.00")

                # 4. Actualizăm înregistrarea existentă în DB cu noile solduri
                update_params = {
                    "isold": float(recalc_impr_sold),
                    "dsold": float(recalc_dep_sold),
                    "fisa": nr_fisa,
                    "luna": current_luna,
                    "anul": current_anul
                }
                cursor.execute(
                    "UPDATE depcred SET impr_sold=:isold, dep_sold=:dsold "
                    "WHERE nr_fisa=:fisa AND luna=:luna AND anul=:anul",
                    update_params
                )
                if cursor.rowcount == 0:
                    # Acest lucru nu ar trebui să se întâmple dacă am găsit rândul la pasul 2
                    report_progress(
                        f"⛔ Eroare: UPDATE eșuat pentru {current_luna:02d}-{current_anul} fișa {nr_fisa} (0 rânduri afectate).")
                    logging.error(f"[Recalc {nr_fisa}] UPDATE eșuat {current_luna}-{current_anul}.")
                    raise RuntimeError(f"UPDATE eșuat la recalculare: {current_luna:02d}-{current_anul}")

                total_lunii_procesate += 1

                # 5. Trecem la luna următoare
                current_luna += 1
                if current_luna > 12:
                    current_luna = 1
                    current_anul += 1

            # --- Finalizare ---
            conn.commit()
            report_progress(
                f"✅ Recalculare finalizată. {total_lunii_procesate} luni procesate."
            )
            return True

        except sqlite3.OperationalError as e_op:
            if "database is locked" in str(e_op).lower():
                report_progress(f"⛔ EROARE FATALĂ: Baza de date DEPCRED blocată!")
                logging.error("DB Locked", exc_info=True)
                if conn:
                    conn.rollback()
                raise RuntimeError("Baza de date DEPCRED blocată.") from e_op
            else:
                report_progress(f"⛔ EROARE OPERAȚIONALĂ DB: {e_op}. Rollback.")
                logging.error("Eroare Op SQLite", exc_info=True)
            if conn:
                conn.rollback()
                raise
        except Exception as e_fatal:
            report_progress(f"⛔ EROARE FATALĂ: {e_fatal}. Rollback.")
            logging.error("Eroare fatală worker", exc_info=True)
            if conn:
                conn.rollback()
                raise
        finally:
            if conn:
                conn.close()
            report_progress("ℹ️ Conexiune DB închisă (worker).")

    def _on_recalculation_progress(self, message):
        """ Slot pentru progres recalculare. """
        if self.lbl_recalc_status and self.lbl_recalc_status.isVisible():
            try:
                # Folosim invokeMethod pentru a actualiza UI din alt thread
                QMetaObject.invokeMethod(
                    self.lbl_recalc_status,
                    "setText",
                    Qt.QueuedConnection,
                    Q_ARG(str, f"⏳ {message}")
                )
            except Exception as e:
                logging.error(f"Eroare invokeMethod lbl_recalc_status.setText: {e}")

    def _on_recalculation_error(self, error_tuple):
        """ Slot la eroare recalculare. """
        try:
            exctype, value, tb_str = error_tuple
            error_message = f"{exctype.__name__}: {value}"
            logging.error(f"Eroare worker recalculare: {error_message}\n{tb_str}")
        except Exception as e_parse:
            logging.error(f"Eroare parsare tuplu eroare: {e_parse}")
            error_message = "Eroare necunoscută worker recalculare"

        self._recalculation_running = False
        self.setCursor(Qt.ArrowCursor)
        self.lbl_recalc_status.setText("⛔ Eroare recalculare!")
        self.lbl_recalc_status.setStyleSheet("QLabel { color: red; font-weight: bold; }")
        afiseaza_eroare(f"Eroare recalculare:\n{error_message}\nIstoricul poate fi inconsistent.", parent=self)

        # Reîmprospătăm istoricul afișat (poate fi inconsistent)
        if self._loaded_nr_fisa:
            self._afiseaza_istoric(self._loaded_nr_fisa)

        # Reactivăm butoanele
        is_member_loaded = self._loaded_nr_fisa is not None
        is_not_liquidated = is_member_loaded and not self._check_if_liquidated(self._loaded_nr_fisa)
        self.buton_modifica_tranzactie.setEnabled(is_not_liquidated and self._last_record_data is not None)
        self.buton_aplica_dobanda.setEnabled(
            is_not_liquidated and self._last_record_data.get('impr_sold', Decimal('0.00')) > 0)

    def _generation_cleanup(self):
        """ Curăță starea UI după o operație de generare/recalculare. """
        self._recalculation_running = False
        self.setCursor(Qt.ArrowCursor)
        # Reactivăm butoanele
        is_member_loaded = self._loaded_nr_fisa is not None
        is_not_liquidated = is_member_loaded and not self._check_if_liquidated(self._loaded_nr_fisa)
        self.buton_modifica_tranzactie.setEnabled(is_not_liquidated and self._last_record_data is not None)
        self.buton_aplica_dobanda.setEnabled(
            is_not_liquidated and self._last_record_data.get('impr_sold', Decimal('0.00')) > 0)
        logging.info("Interfața a fost reactivată după operație.")

    def _on_recalculation_finished(self):
        """ Slot la finalizare recalculare. """
        logging.info(f"Recalculare finalizată pentru fișa {self._loaded_nr_fisa}.")
        self._recalculation_running = False
        self.setCursor(Qt.ArrowCursor)
        self.lbl_recalc_status.setText("✅ Recalculare finalizată.")

        # Reîmprospătăm istoricul afișat după recalculare
        if self._loaded_nr_fisa:
            self._afiseaza_istoric(self._loaded_nr_fisa)

        # Reactivăm butoanele
        is_member_loaded = self._loaded_nr_fisa is not None
        is_not_liquidated = is_member_loaded and not self._check_if_liquidated(self._loaded_nr_fisa)
        self.buton_modifica_tranzactie.setEnabled(is_not_liquidated and self._last_record_data is not None)
        self.buton_aplica_dobanda.setEnabled(
            is_not_liquidated and self._last_record_data.get('impr_sold', Decimal('0.00')) > 0)

        QTimer.singleShot(5000, lambda: self.lbl_recalc_status.setText(
            "") if self.lbl_recalc_status and not self._recalculation_running else None)

    # --- METODE DE GESTIONARE STARE și AFISARE ---
    def _handle_aplica_dobanda(self):
        """
        Calculează dobânda la zi pentru achitare anticipată și deschide automat
        dialogul de modificare tranzacție pre-populat. Dobânda se salvează DOAR
        dacă utilizatorul confirmă modificările în dialogul de tranzacție.
        """
        if not self._loaded_nr_fisa:
            afiseaza_warning("Nu este selectat niciun membru.", parent=self)
            return

        if not self._last_record_data:
            afiseaza_warning("Nu s-au încărcat datele financiare.", parent=self)
            return

        # Obține datele necesare din ultimul record
        last_impr_sold = self._last_record_data.get('impr_sold', Decimal('0.00'))
        last_luna = self._last_record_data.get('luna')
        last_anul = self._last_record_data.get('anul')

        # Verifică dacă există un împrumut activ
        if last_impr_sold <= 0:
            afiseaza_info("Membrul nu are împrumut activ.", parent=self)
            return

        if last_luna is None or last_anul is None:
            afiseaza_eroare("Eroare determinare ultimă lună.", parent=self)
            return

        # Dialog de confirmare pentru calcularea dobânzii
        if afiseaza_intrebare(
                f"Calculați dobânda la zi (până la {last_luna:02d}-{last_anul}) pentru {self._loaded_nr_fisa}?\n\n"
                f"Rata aplicată: {get_dobanda() * 1000:.1f} ‰\n\n"
                f"Aceasta va pregăti automat achitarea întregului împrumut.",
                titlu="Confirmare Calcul Dobândă",
                parent=self,
                buton_default=QMessageBox.No
        ):
            try:
                # Calculează dobânda - nu o salvăm încă
                dobanda_calculata = self._calculeaza_dobanda_la_zi(self._loaded_nr_fisa, last_luna, last_anul)

                # Acum deschide automat dialogul de modificare tranzacție
                # Preluăm soldurile de deschidere pentru validare
                opening_impr_sold, _ = self._get_opening_balances(self._loaded_nr_fisa, last_luna, last_anul)

                dialog = TranzactieDialog(parent=self, opening_impr_sold=opening_impr_sold)

                # Preluăm datele existente pentru a le pre-popula în dialog
                data_existenta = dict(self._last_record_data)

                # CORECȚIE: Trebuie să adăugăm și rata curentă (impr_cred) la suma ce trebuie achitată
                # pentru a lichida complet împrumutul și a preveni apariția unui sold nou
                old_impr_cred = self._last_record_data.get('impr_cred', Decimal('0.00'))

                # Actualizăm câmpurile importante - dobânda și rata de achitare
                data_existenta['dobanda'] = dobanda_calculata
                # Adăugăm soldul plus rata curentă pentru a asigura lichidarea completă
                data_existenta['impr_cred'] = last_impr_sold + old_impr_cred

                # Pre-populăm dialogul cu datele modificate
                dialog.set_data_for_edit(last_luna, last_anul, data_existenta)

                # Afișăm un mesaj care explică utilizatorului ce s-a făcut
                afiseaza_info(
                    f"Dobânda calculată: {dobanda_calculata:.2f} lei\n\n"
                    f"Suma totală de achitat pentru lichidare: {(last_impr_sold + old_impr_cred):.2f} lei\n\n"
                    f"Verificați valorile pre-completate în dialog și apăsați OK pentru a confirma achitarea.",
                    parent=self
                )

                # Executăm dialogul - dobânda se va salva DOAR dacă utilizatorul apasă OK
                if dialog.exec_() == QDialog.Accepted:
                    validated_data = dialog.get_validated_data()
                    if validated_data:
                        # Ne asigurăm că luna și anul din datele validate sunt cele corecte
                        validated_data['luna'] = last_luna
                        validated_data['anul'] = last_anul
                        # Aici se face salvarea dobânzii și a celorlalte modificări în baza de date
                        self._proceseaza_si_actualizeaza_tranzactie(last_luna, last_anul, validated_data)
                        logging.info(
                            f"Dobândă și tranzacție actualizate pentru {self._loaded_nr_fisa}/{last_luna:02d}-{last_anul}: {dobanda_calculata:.2f}")

                        # Afișăm un mesaj confirmare că împrumutul a fost lichidat
                        QTimer.singleShot(500, lambda: afiseaza_info(
                            "Împrumutul a fost lichidat cu succes!",
                            parent=self
                        ))
                    else:
                        logging.warning("Validare date dialog modificare eșuată.")
                else:
                    # Utilizatorul a anulat dialogul - nu se salvează nimic
                    afiseaza_info(
                        "Operațiunea a fost anulată. Nu s-a făcut nicio modificare în baza de date.",
                        parent=self
                    )

            except Exception as e:
                logging.error(f"Eroare calcul dobândă {self._loaded_nr_fisa}: {e}", exc_info=True)
                afiseaza_eroare(f"Eroare calcul dobândă:\n{e}", parent=self)

    def _calculeaza_dobanda_la_zi(self, nr_fisa, end_luna, end_anul):
        """ Calculează dobânda acumulată pentru un împrumut. """
        log_prefix = f"Calcul dobândă la zi {nr_fisa}"
        logging.info(f"{log_prefix} -> {end_luna:02d}-{end_anul}")
        conn = None

        try:
            conn = sqlite3.connect(f"file:{DB_DEPCRED}?mode=ro", uri=True)
            cursor = conn.cursor()
            end_period_val = end_anul * 100 + end_luna
            start_period_val = 0

            # Găsește prima lună cu împrumut pentru acest membru (pentru verificări de siguranță)
            cursor.execute("SELECT MIN(anul*100+luna) FROM depcred WHERE nr_fisa = ?", (nr_fisa,))
            first_record = cursor.fetchone()
            if not first_record or not first_record[0]:
                raise ValueError(f"Nu există înregistrări pentru fișa {nr_fisa}")

            first_ever = first_record[0]

            # Găsește ultimul împrumut acordat înainte/în luna curentă
            cursor.execute(
                "SELECT MAX(anul*100+luna) FROM depcred WHERE nr_fisa=? AND impr_deb>0 AND (anul*100+luna <= ?)",
                (nr_fisa, end_period_val))
            last_disbursement_result = cursor.fetchone()
            last_disbursement = last_disbursement_result[0] if last_disbursement_result and last_disbursement_result[
                0] else None

            if last_disbursement:
                # === CAZUL SPECIAL: DOBÂNDĂ + ÎMPRUMUT NOU ÎN ACEEAȘI LUNĂ ===
                # Verifică dacă în luna ultimului împrumut există și dobândă > 0
                cursor.execute(
                    "SELECT dobanda FROM depcred WHERE nr_fisa=? AND anul*100+luna=?",
                    (nr_fisa, last_disbursement)
                )
                dobanda_in_last_disbursement = cursor.fetchone()

                if dobanda_in_last_disbursement and dobanda_in_last_disbursement[0] > 0:
                    # Caz special: dobândă și împrumut nou în aceeași lună
                    # Noul împrumut începe să acumuleze dobândă din această lună
                    start_period_val = last_disbursement
                    logging.info(f"{log_prefix}: Caz special - dobândă + împrumut nou în luna {last_disbursement}")
                else:
                    # === LOGICA CORECTATĂ PENTRU CAZUL NORMAL ===
                    # Găsește ultima lună cu sold zero înaintea ultimului împrumut
                    cursor.execute(
                        "SELECT MAX(anul*100+luna) FROM depcred WHERE nr_fisa=? AND impr_sold <= 0.005 AND (anul*100+luna < ?)",
                        (nr_fisa, last_disbursement))
                    last_zero_result = cursor.fetchone()
                    last_zero = last_zero_result[0] if last_zero_result and last_zero_result[0] else None

                    if last_zero:
                        # Determină luna următoare după ultimul sold zero
                        cy_z, cm_z = divmod(last_zero, 100)
                        start_p_temp = (cy_z + 1) * 100 + 1 if cm_z == 12 else cy_z * 100 + (cm_z + 1)
                        start_period_val = min(start_p_temp, last_disbursement)
                        logging.info(f"{log_prefix}: Start calculat din ultima lună cu sold zero: {start_period_val}")
                    else:
                        # === CORECȚIA LOGICII PROBLEMATICE ===
                        # Dacă nu există lună cu sold zero, folosim direct ultimul împrumut
                        # NU mai căutăm primul împrumut vreodată acordat!
                        start_period_val = last_disbursement
                        logging.info(
                            f"{log_prefix}: Start = ultimul împrumut (nu s-a găsit sold zero anterior): {start_period_val}")
            elif first_ever and first_ever <= end_period_val:
                # Dacă nu există împrumut acordat recent, dar există înregistrări istorice
                start_period_val = first_ever
                logging.info(f"{log_prefix}: Start = prima înregistrare disponibilă: {start_period_val}")
            else:
                raise ValueError(f"Nu s-a putut determina perioada pentru calculul dobânzii fișa {nr_fisa}")

            # Verifică dacă avem o perioadă de start validă
            if not start_period_val or start_period_val > end_period_val:
                raise ValueError(
                    f"Perioadă invalidă pentru calculul dobânzii fișa {nr_fisa}: start={start_period_val}, end={end_period_val}")

            # Calcul dobândă pe baza soldurilor din perioada determinată
            start_year, start_month = divmod(start_period_val, 100)
            logging.info(
                f"{log_prefix}: Calculez dobânda pentru perioada {start_month:02d}-{start_year} → {end_luna:02d}-{end_anul}")

            cursor.execute(
                "SELECT SUM(impr_sold) FROM depcred WHERE nr_fisa=? AND (anul*100+luna BETWEEN ? AND ?) AND impr_sold > 0",
                (nr_fisa, start_period_val, end_period_val))
            sum_balances_res = cursor.fetchone()

            if not sum_balances_res or sum_balances_res[0] is None:
                logging.warning(f"{log_prefix}: Nu există solduri pozitive în perioada specificată")
                return Decimal('0.00')

            sum_of_balances = Decimal(str(sum_balances_res[0] or '0.00'))
            logging.info(f"{log_prefix}: Suma solduri pentru dobândă: {sum_of_balances:.2f}")

            calculated_interest = (sum_of_balances * self.loan_interest_rate_on_demand).quantize(
                Decimal("0.01"), ROUND_HALF_UP)
            logging.info(f"{log_prefix}: Dobândă calculată: {calculated_interest:.2f}")

            return calculated_interest

        except sqlite3.Error as e_sql:
            logging.error(f"{log_prefix}: Eroare SQLite: {e_sql}", exc_info=True)
            raise RuntimeError(f"Eroare bază de date: {e_sql}")
        except ValueError as e_val:
            logging.error(f"{log_prefix}: Eroare valoare: {e_val}")
            raise RuntimeError(f"Eroare la calculul dobânzii: {e_val}")
        except Exception as e_gen:
            logging.error(f"{log_prefix}: Eroare generală: {e_gen}", exc_info=True)
            raise RuntimeError(f"Eroare generală calcul dobândă: {e_gen}")
        finally:
            if conn:
                conn.close()

    def _on_return_pressed(self):
        """ Gestionează Enter în câmpul nume. """
        popup = self.completer.popup()
        if popup.isVisible():
            idx = popup.currentIndex()
            if idx.isValid():
                text = idx.data(Qt.DisplayRole)
                self._handle_name_selected(text)
                return

    def _incarca_lista_membri_completer(self):
        """Încarcă lista membri pentru autocompletare."""
        membri_list = []
        conn = None
        try:
            conn = sqlite3.connect(f"file:{DB_MEMBRII}?mode=ro", uri=True)
            cursor = conn.cursor()
            cursor.execute("SELECT NR_FISA, NUM_PREN FROM membrii ORDER BY NUM_PREN")
            self.lista_completa_membri = {}

            for nr_fisa, nume in cursor.fetchall():
                if nume and nr_fisa is not None:
                    item_text = f"{nume.strip()} (F: {nr_fisa})"
                    membri_list.append(item_text)
                    self.lista_completa_membri[item_text] = nr_fisa
                    self.lista_completa_membri[str(nr_fisa)] = item_text

            model = QStringListModel(sorted(membri_list))
            self.completer.setModel(model)
            logging.info(f"Completer actualizat: {len(membri_list)} membri.")

        except sqlite3.Error as e:
            afiseaza_eroare(f"Eroare încărcare membri:\n{e}", parent=self)
            logging.error(f"Eroare DB completer: {e}", exc_info=True)
        except Exception as e_gen:
            afiseaza_eroare(f"Eroare generală completer:\n{e_gen}", parent=self)
            logging.error(f"Eroare generală completer: {e_gen}", exc_info=True)
        finally:
            if conn:
                conn.close()

    def _handle_name_selected(self, selected_item_text):
        """Gestionează selectarea unui nume din completer."""
        logging.debug(f"Completer Activated: Procesare '{selected_item_text}'")
        try:
            if '(F:' in selected_item_text and selected_item_text.endswith(')'):
                nr_fisa_str = selected_item_text[
                              selected_item_text.rfind('(F:') + 3:-1
                              ].strip()

                if nr_fisa_str.isdigit():
                    nr_fisa = int(nr_fisa_str)
                    self._load_member_data(nr_fisa=nr_fisa, name=selected_item_text)
                    return

            raise ValueError("Format invalid sau nr. fișă lipsă")

        except (ValueError, IndexError, TypeError) as e:
            logging.error(
                f"Nu s-a putut extrage Nr. Fișă din '{selected_item_text}': {e}"
            )
            afiseaza_eroare(
                f"Format invalid pentru selecția '{selected_item_text}'.",
                parent=self
            )
            self.reset_form()

    def _handle_fisa_entered(self):
        """ Gestionează finalizarea editării în câmpul Nr. Fișă. """
        if self._verificare_activa or not self.txt_nr_fisa.isEnabled():
            return

        nr_fisa_str = self.txt_nr_fisa.text().strip()
        if nr_fisa_str.isdigit():
            nr_fisa = int(nr_fisa_str)
            if self._loaded_nr_fisa == nr_fisa:
                return

            if str(nr_fisa) not in self.lista_completa_membri:
                afiseaza_warning(f"Fișa cu numărul {nr_fisa} nu a fost găsită.", parent=self)
                self.reset_form()
                return

            item_text = self.lista_completa_membri.get(str(nr_fisa), f"Nume necunoscut (F: {nr_fisa})")
            self.txt_nume.blockSignals(True)
            self.txt_nume.setText(item_text)
            self.txt_nume.blockSignals(False)
            QTimer.singleShot(0, lambda f=nr_fisa, n=item_text: self._load_member_data(nr_fisa=f, name=n))
        elif nr_fisa_str:
            afiseaza_warning("Nr. fișei trebuie să fie numeric.", parent=self)
            self.txt_nr_fisa.selectAll()
            self.txt_nr_fisa.setFocus()
            self.reset_form()

    def _load_member_data(self, nr_fisa=None, name=None):
        """ Încarcă datele complete pentru un membru. """
        if self._verificare_activa:
            logging.debug("Încărcare deja activă, se ignoră.")
            return

        self._verificare_activa = True
        self._update_completer_flag = False
        self.reset_form_partial()
        load_successful = False
        target_nr_fisa = nr_fisa

        try:
            if target_nr_fisa is None and name and '(F:' in name and name.endswith(')'):
                try:
                    target_nr_fisa = int(name[name.rfind('(F:') + 3:-1].strip())
                except (ValueError, IndexError):
                    logging.error(f"Format nume invalid: {name}")
                    return
            elif target_nr_fisa is None:
                logging.debug("Lipsesc date căutare")
                return

            liquidation_date = self._check_if_liquidated(target_nr_fisa)
            if liquidation_date:
                afiseaza_info(f"Membrul {target_nr_fisa} lichidat la {liquidation_date}.", parent=self)
                nume_lichidat = self._get_name_for_nr_fisa(target_nr_fisa)
                self.txt_nume.blockSignals(True)
                self.txt_nume.setText(f"{nume_lichidat or 'N/A'} (LICHIDAT F: {target_nr_fisa})")
                self.txt_nume.blockSignals(False)
                self.txt_nr_fisa.blockSignals(True)
                self.txt_nr_fisa.setText(str(target_nr_fisa))
                self.txt_nr_fisa.blockSignals(False)
                return

            member_data = self._get_member_data_from_membrii(target_nr_fisa)
            if not member_data:
                afiseaza_warning(f"Fișa {target_nr_fisa} nu există în Membrii.", parent=self)
                self.txt_nume.blockSignals(True)
                self.txt_nume.setText("")
                self.txt_nume.blockSignals(False)
                return

            self._loaded_nr_fisa = target_nr_fisa
            nume_complet = member_data.get("NUM_PREN", "")
            item_text_corect = f"{nume_complet} (F: {self._loaded_nr_fisa})"

            if self.txt_nume.text() != item_text_corect:
                self.txt_nume.blockSignals(True)
                self.txt_nume.setText(item_text_corect)
                self.txt_nume.blockSignals(False)

            if self.txt_nr_fisa.text() != str(self._loaded_nr_fisa):
                self.txt_nr_fisa.blockSignals(True)
                self.txt_nr_fisa.setText(str(self._loaded_nr_fisa))
                self.txt_nr_fisa.blockSignals(False)

            self.txt_adresa.setText(member_data.get("DOMICILIUL", ""))
            self.txt_adresa.setToolTip(self.txt_adresa.text())
            self.txt_calitate.setText(member_data.get("CALITATEA", ""))
            self.txt_calitate.setToolTip(self.txt_calitate.text())
            self.txt_data_insc.setText(member_data.get("DATA_INSCR", ""))
            self.txt_data_insc.setToolTip(self.txt_data_insc.text())
            self.txt_nume.setToolTip(nume_complet)
            self.txt_nr_fisa.setToolTip(str(self._loaded_nr_fisa))

            self._afiseaza_istoric(self._loaded_nr_fisa)
            self.txt_nume.setEnabled(False)
            self.txt_nr_fisa.setEnabled(False)
            load_successful = True
            logging.info(f"Date încărcate: {item_text_corect}")

        except Exception as e:
            logging.error(f"Eroare _load_member_data: {e}", exc_info=True)
            afiseaza_eroare(f"Eroare încărcare date:\n{type(e).__name__}: {str(e)}", parent=self)
            self.reset_form()
        finally:
            self._verificare_activa = False
            if not load_successful:
                QTimer.singleShot(0, lambda: setattr(self, '_update_completer_flag', True))

    def _afiseaza_istoric(self, nr_fisa):
        """ Prelucrează și afișează istoricul financiar cu formatare vizuală avansată. """
        self._clear_financial_history()
        self._last_record_data = {}
        self.buton_modifica_tranzactie.setEnabled(False)
        self.buton_aplica_dobanda.setEnabled(False)

        depcred_data = self._get_member_details(nr_fisa)

        if not depcred_data:
            afiseaza_info(f"Membrul {nr_fisa} nu are istoric.", parent=self)
            return

        # Procesare date în ordinea descrescătoare returnată de SQL cu formatare vizuală
        formatted_lines = {cd["text_edit"]: [] for cd in self._coloane_financiare_layout_map.values() if
                           cd and cd["text_edit"]}
        col_name_to_widget = {name: data["text_edit"] for name, data in self._coloane_financiare_layout_map.items() if
                              data and data["text_edit"]}

        # Inițializare solduri precedente
        sold_impr_prec = Decimal('0.00')
        sold_dep_prec = Decimal('0.00')
        formatted_rows_data = []
        prev_month_data = None

        # IMPORTANT: Salvează primul rând (cel mai recent) în _last_record_data
        if depcred_data and len(depcred_data) > 0:
            last_row = depcred_data[0]  # Primul rând din datele ordonate descrescător
            idx_map = {
                0: 'dobanda', 1: 'impr_deb', 2: 'impr_cred', 3: 'impr_sold',
                4: 'luna', 5: 'anul', 6: 'dep_deb', 7: 'dep_cred', 8: 'dep_sold', 9: 'prima'
            }

            try:
                # Populează _last_record_data cu valorile corecte
                self._last_record_data = {}
                for idx, name in idx_map.items():
                    if idx < len(last_row):
                        if name in ['luna', 'anul', 'prima']:
                            # Păstrează valorile întregi ca întregi
                            self._last_record_data[name] = last_row[idx]
                        else:
                            # Convertește valorile numerice la Decimal
                            try:
                                val = last_row[idx] if last_row[idx] is not None else '0.00'
                                self._last_record_data[name] = Decimal(str(val)).quantize(Decimal('0.01'),
                                                                                          ROUND_HALF_UP)
                            except (InvalidOperation, TypeError):
                                self._last_record_data[name] = Decimal('0.00')
                                logging.warning(f"Valoare invalidă pentru {name}: {last_row[idx]}. Folosit 0.00.")
            except Exception as e:
                logging.error(f"Eroare procesare ultimul record pentru {nr_fisa}: {e}", exc_info=True)
                self._last_record_data = {}

        for i, row in enumerate(depcred_data):  # Parcurgem direct în ordinea descrescătoare
            try:
                # Fundaluri alternate îmbunătățite
                bg_color = "#f8fbff" if i % 2 == 0 else "#f0f7ff"

                # Pentru calculul soldurilor precedente
                if i < len(depcred_data) - 1:
                    next_row = depcred_data[i + 1]
                    sold_impr_prec = Decimal(str(next_row[3] or '0.00'))
                    sold_dep_prec = Decimal(str(next_row[8] or '0.00'))
                else:
                    # Primul rând (cel mai vechi) - soldurile precedente sunt 0
                    sold_impr_prec = Decimal('0.00')
                    sold_dep_prec = Decimal('0.00')

                formatted_row_dict = self._format_istoric_line(row, sold_impr_prec, sold_dep_prec, prev_month_data,
                                                               bg_color)
                formatted_rows_data.append(formatted_row_dict)

                # Actualizare solduri pentru următoarea iterație
                sold_impr_prec = Decimal(str(row[3] or '0.00'))
                sold_dep_prec = Decimal(str(row[8] or '0.00'))
                prev_month_data = {  # Salvare date lună curentă pentru următoarea iterație
                    'dobanda': row[0], 'impr_deb': row[1], 'impr_cred': row[2],
                    'impr_sold': row[3], 'luna': row[4], 'anul': row[5],
                    'dep_deb': row[6], 'dep_cred': row[7], 'dep_sold': row[8]
                }
            except Exception as e:
                logging.error(f"Eroare formatare linie: {e}", exc_info=True)

        # Populare widget-uri cu datele formate
        for formatted_row in formatted_rows_data:
            for col_name, widget in col_name_to_widget.items():
                if widget in formatted_lines:
                    formatted_lines[widget].append(formatted_row.get(col_name, 'N/A'))

        # Setare text în interfață
        for widget, line_list in formatted_lines.items():
            widget.setHtml("".join(line_list))
            widget.verticalScrollBar().setValue(widget.verticalScrollBar().minimum())  # Focus sus

        # Reactivare butoane dacă e cazul
        if not self._check_if_liquidated(nr_fisa) and self._last_record_data:
            self.buton_modifica_tranzactie.setEnabled(True)
            if self._last_record_data.get('impr_sold', Decimal('0.00')) > 0:
                self.buton_aplica_dobanda.setEnabled(True)

    def reset_form(self):
        """ Resetează complet formularul. """
        self._loaded_nr_fisa = None
        self._last_record_data = {}
        self.txt_nume.clear()
        self.txt_nume.setToolTip("")
        self.txt_nume.setEnabled(True)
        self.txt_nr_fisa.clear()
        self.txt_nr_fisa.setToolTip("")
        self.txt_nr_fisa.setEnabled(True)
        self.txt_adresa.clear()
        self.txt_adresa.setToolTip("")
        self.txt_calitate.clear()
        self.txt_calitate.setToolTip("")
        self.txt_data_insc.clear()
        self.txt_data_insc.setToolTip("")
        self._clear_financial_history()
        self.buton_modifica_tranzactie.setEnabled(False)
        self.buton_aplica_dobanda.setEnabled(False)
        self._update_completer_flag = True
        QTimer.singleShot(0,
                          lambda: self.txt_nume.setFocus() if self.txt_nume.isEnabled() else self.txt_nr_fisa.setFocus())

    def reset_form_partial(self):
        """ Resetează doar detaliile și istoricul. """
        self._loaded_nr_fisa = None
        self._last_record_data = {}
        self.txt_adresa.clear()
        self.txt_calitate.clear()
        self.txt_data_insc.clear()
        self._clear_financial_history()
        self.buton_modifica_tranzactie.setEnabled(False)
        self.buton_aplica_dobanda.setEnabled(False)

    def _clear_financial_history(self):
        """ Golește istoricul financiar. """
        for widget in self._coloane_financiare_widgets:
            if widget: widget.clear()

    # --- METODE HELPER DB ---
    @staticmethod
    def _get_name_for_nr_fisa(nr_fisa):
        """Returnează numele pentru un Nr. Fișă."""
        if not nr_fisa:
            return None

        conn = None
        try:
            conn = sqlite3.connect(f"file:{DB_MEMBRII}?mode=ro", uri=True)
            cursor = conn.cursor()
            cursor.execute(
                "SELECT NUM_PREN FROM membrii WHERE NR_FISA = ?", (nr_fisa,)
            )
            row = cursor.fetchone()
            return row[0].strip() if row and row[0] else None
        except sqlite3.Error as e:
            logging.error(f"SQLite error _get_name {nr_fisa}: {e}", exc_info=True)
            return None
        finally:
            if conn:
                conn.close()

    def _get_member_data_from_membrii(self, nr_fisa):
        """Prelucrează datele de bază ale membrului."""
        if not nr_fisa:
            return None

        conn = None
        member_data_result = None

        try:
            conn = sqlite3.connect(f"file:{DB_MEMBRII}?mode=ro", uri=True)
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()
            cur.execute(
                "SELECT NR_FISA, NUM_PREN, CALITATEA, DOMICILIUL, DATA_INSCR, COTIZATIE_STANDARD "
                "FROM membrii WHERE NR_FISA = ?",
                (nr_fisa,)
            )
            row = cur.fetchone()
            if row:
                member_data_result = dict(row)
        except sqlite3.Error as e:
            logging.error(f"SQLite error _get_member_data {nr_fisa}: {e}", exc_info=True)
        finally:
            if conn:
                conn.close()

        return member_data_result

    def _get_member_details(self, nr_fisa):
        """Prelucrează istoricul financiar al membrului."""
        if not nr_fisa:
            return []

        conn = None
        try:
            conn = sqlite3.connect(f"file:{DB_DEPCRED}?mode=ro", uri=True)
            cursor = conn.cursor()
            cursor.execute(
                "SELECT dobanda, impr_deb, impr_cred, impr_sold, luna, anul, "
                "dep_deb, dep_cred, dep_sold, prima "
                "FROM depcred WHERE nr_fisa = ? "
                "ORDER BY anul DESC, luna DESC",
                (nr_fisa,)
            )
            return cursor.fetchall()
        except sqlite3.Error as e:
            logging.error(f"SQLite error _get_member_details {nr_fisa}: {e}", exc_info=True)
            return []
        finally:
            if conn:
                conn.close()

    def _check_if_liquidated(self, nr_fisa):
        """Verifică dacă membrul este lichidat."""
        if not nr_fisa:
            return None
        if not os.path.exists(DB_LICHIDATI):
            logging.warning(f"{DB_LICHIDATI} lipsă.")
            return None

        conn = None
        try:
            conn = sqlite3.connect(f"file:{DB_LICHIDATI}?mode=ro", uri=True)
            cursor = conn.cursor()

            cursor.execute(
                "SELECT data_lichidare FROM lichidati WHERE nr_fisa = ?",
                (nr_fisa,)
            )
            result = cursor.fetchone()
            return result[0] if result else None
        except sqlite3.Error as e:
            logging.error(f"SQLite error _check_if_liquidated {nr_fisa}: {e}", exc_info=True)
            return None
        finally:
            if conn:
                conn.close()

    def _format_istoric_line(self, row_data, sold_impr_prec, sold_dep_prec, prev_month_data=None, bg_color="#ffffff"):
        """Formatează un rând de date pentru afișare HTML cu formatare vizuală avansată."""
        idx_map = {
            0: 'dobanda', 1: 'impr_deb', 2: 'impr_cred', 3: 'impr_sold',
            4: 'luna', 5: 'anul', 6: 'dep_deb', 7: 'dep_cred', 8: 'dep_sold', 9: 'prima'
        }
        vals = {}
        formatted_vals = {}  # Va conține string-urile formatate pentru HTML
        luna_an_log = "??-????"  # Default pentru logging

        try:
            # Funcție helper pentru formatare cu fundal
            def format_with_bg(value_html, bg_color):
                return f'<div style="background-color:{bg_color}; padding:4px; margin:1px 0;">{value_html}</div>'

            # Inițializare `vals` cu datele din rând sau valori default
            for idx, name in idx_map.items():
                if idx < len(row_data) and row_data[idx] is not None:
                    if name in ['luna', 'anul', 'prima']:
                        vals[name] = int(row_data[idx])  # Acestea sunt întregi
                    else:
                        try:
                            vals[name] = Decimal(str(row_data[idx])).quantize(Decimal('0.01'), ROUND_HALF_UP)
                        except InvalidOperation:
                            logging.warning(
                                f"Valoare invalidă pentru {name} în row_data: {row_data[idx]}. Folosit 0.00."
                            )
                            vals[name] = Decimal('0.00')
                else:
                    # Default pentru câmpuri lipsă sau None (mai puțin 'prima' care poate fi None)
                    vals[name] = Decimal('0.00') if name not in ['luna', 'anul', 'prima'] else (
                        None if name == 'prima' else 0
                    )

            # Creare luna_an
            if vals.get('luna') and vals.get('anul'):
                formatted_vals['luna_an'] = format_with_bg(f"{vals['luna']:02d}-{vals['anul']}", bg_color)
                luna_an_log = f"{vals['luna']:02d}-{vals['anul']}"  # Actualizăm pentru logging
            else:
                formatted_vals['luna_an'] = format_with_bg("??-????", bg_color)

            # --- Logica specifică de formatare și colorare ---

            # === FORMATARE DOBÂNDĂ ===
            formatted_vals['dobanda'] = format_with_bg(f"{vals['dobanda']:.2f}", bg_color)

            # === FORMATARE ÎMPRUMUT NOU (ALBASTRU ÎNGROȘAT) ===
            if vals.get('impr_deb', Decimal('0.00')) > Decimal('0.00'):
                formatted_vals['impr_deb'] = format_with_bg(f'<font color="blue"><b>{vals["impr_deb"]:.2f}</b></font>',
                                                            bg_color)
            else:
                formatted_vals['impr_deb'] = format_with_bg(f"{vals['impr_deb']:.2f}", bg_color)

            # === FORMATARE RATĂ ACHITATĂ ===
            if vals.get('impr_cred') == Decimal('0.00') and vals.get('impr_sold', Decimal('1.00')) > Decimal('0.005'):
                # Verifică dacă s-a acordat împrumut nou în luna curentă
                if vals.get('impr_deb', Decimal('0.00')) > Decimal('0.00'):
                    # Luna curentă are împrumut nou - nu se așteaptă plata ratei
                    formatted_vals['impr_cred'] = format_with_bg(f"{vals['impr_cred']:.2f}", bg_color)
                else:
                    # Nu s-a acordat împrumut nou - verificăm luna anterioară
                    current_luna = vals.get('luna')
                    current_anul = vals.get('anul')

                    # Calculăm luna anterioară
                    prev_luna = current_luna - 1 if current_luna > 1 else 12
                    prev_anul = current_anul if current_luna > 1 else current_anul - 1

                    # Verificăm direct în baza de date dacă a existat împrumut în luna anterioară
                    conn = None
                    try:
                        conn = sqlite3.connect(f"file:{DB_DEPCRED}?mode=ro", uri=True)
                        cursor = conn.cursor()
                        cursor.execute(
                            "SELECT impr_deb FROM depcred WHERE nr_fisa = ? AND luna = ? AND anul = ?",
                            (self._loaded_nr_fisa, prev_luna, prev_anul)
                        )
                        prev_row = cursor.fetchone()

                        # Dacă există înregistrare pentru luna anterioară și a avut împrumut nou
                        if prev_row and prev_row[0]:
                            prev_impr_deb = Decimal(str(prev_row[0]))
                            if prev_impr_deb > Decimal('0.00'):
                                # Este luna imediat următoare după contractare - afișăm "!NOU!" (portocaliu)
                                formatted_vals['impr_cred'] = format_with_bg('<font color="orange"><b>!NOU!</b></font>',
                                                                             bg_color)
                            else:
                                # Este o lună ulterioară - afișăm "Neachitat!" (roșu)
                                formatted_vals['impr_cred'] = format_with_bg(
                                    '<font color="red"><b>Neachitat!</b></font>', bg_color)
                        else:
                            # Dacă nu există înregistrare sau nu a avut împrumut nou, afișăm "Neachitat!"
                            formatted_vals['impr_cred'] = format_with_bg('<font color="red"><b>Neachitat!</b></font>',
                                                                         bg_color)
                    except sqlite3.Error:
                        # În caz de eroare, afișăm "Neachitat!" (opțiunea implicită, mai sigură)
                        formatted_vals['impr_cred'] = format_with_bg('<font color="red"><b>Neachitat!</b></font>',
                                                                     bg_color)
                    finally:
                        if conn:
                            conn.close()
            else:
                formatted_vals['impr_cred'] = format_with_bg(f"{vals['impr_cred']:.2f}", bg_color)

            # === FORMATARE SOLD ÎMPRUMUT ===
            # REGULA GENERALĂ: Oricând se aplică dobândă = achitare împrumut anterior
            if vals.get('dobanda', Decimal('0.00')) > Decimal('0.00'):
                formatted_vals['impr_sold'] = format_with_bg('<font color="green"><b>Achitat</b></font>', bg_color)
            elif vals.get('impr_sold', Decimal('1.00')) <= Decimal('0.005'):
                # Pentru cazurile fără dobândă, dar cu sold zero
                if vals.get('impr_deb', Decimal('0.00')) > Decimal('0.00') and vals.get('impr_cred',
                                                                                        Decimal('0.00')) > Decimal(
                        '0.00'):
                    # Cazul special: achitare și nou împrumut în aceeași lună
                    expected_old_sold = sold_impr_prec - vals.get('impr_cred', Decimal('0.00'))
                    if expected_old_sold <= Decimal('0.005'):
                        formatted_vals['impr_sold'] = format_with_bg('<font color="green"><b>Achitat</b></font>',
                                                                     bg_color)
                    else:
                        formatted_vals['impr_sold'] = format_with_bg('0.00', bg_color)
                elif vals.get('impr_cred', Decimal('0.00')) > Decimal('0.00') and sold_impr_prec > Decimal('0.005'):
                    # Achitare normală
                    formatted_vals['impr_sold'] = format_with_bg('<font color="green"><b>Achitat</b></font>', bg_color)
                else:
                    formatted_vals['impr_sold'] = format_with_bg('0.00', bg_color)
            else:
                formatted_vals['impr_sold'] = format_with_bg(f"{vals['impr_sold']:.2f}", bg_color)

            # === FORMATARE COTIZAȚIE NEACHITATĂ ===
            if vals.get('dep_deb') == Decimal('0.00') and sold_dep_prec > Decimal('0.005'):
                formatted_vals['dep_deb'] = format_with_bg('<font color="red"><b>Neachitat!</b></font>', bg_color)
            else:
                formatted_vals['dep_deb'] = format_with_bg(f"{vals['dep_deb']:.2f}", bg_color)

            # === FORMATARE RETRAGERE FOND ===
            formatted_vals['dep_cred'] = format_with_bg(f"{vals['dep_cred']:.2f}", bg_color)

            # === FORMATARE SOLD DEPUNERI ===
            formatted_vals['dep_sold'] = format_with_bg(f"{vals['dep_sold']:.2f}", bg_color)

            # Detectare împrumut nou și achitare împrumut anterior în aceeași lună
            if vals.get('impr_deb', Decimal('0.00')) > Decimal('0.00'):
                # Verifică dacă în aceeași lună s-a plătit și o rată de împrumut
                if vals.get('impr_cred', Decimal('0.00')) > Decimal('0.00'):
                    # Calculează cât s-ar fi datorat după plata ratei, fără împrumutul nou
                    expected_old_sold = sold_impr_prec - vals.get('impr_cred', Decimal('0.00'))

                    # Dacă sold-ul vechi ar fi fost ≤ 0 după rată, înseamnă că s-a lichidat împrumutul anterior
                    if expected_old_sold <= Decimal('0.005'):
                        # Situație specială: achitare împrumut anterior și nou împrumut în aceeași lună
                        formatted_vals['impr_sold'] = format_with_bg('<font color="green"><b>Achitat</b></font>',
                                                                     bg_color)

            return formatted_vals

        except (InvalidOperation, TypeError, ValueError, KeyError) as e_conv:
            logging.error(
                f"Eroare formatare linie istoric ({luna_an_log}): {e_conv}",
                exc_info=True)
            error_dict = {
                'dobanda': format_with_bg('<font color="red">ERR</font>', bg_color),
                'impr_deb': format_with_bg('<font color="red">ERR</font>', bg_color),
                'impr_cred': format_with_bg('<font color="red">ERR</font>', bg_color),
                'impr_sold': format_with_bg('<font color="red">ERR</font>', bg_color),
                'luna_an': format_with_bg('<font color="red">ERR</font>', bg_color),
                'dep_deb': format_with_bg('<font color="red">ERR</font>', bg_color),
                'dep_cred': format_with_bg('<font color="red">ERR</font>', bg_color),
                'dep_sold': format_with_bg('<font color="red">ERR</font>', bg_color)
            }
            return error_dict

    # --- METODE PENTRU MODIFICARE ȘI RECALCULARE ---
    def _deschide_dialog_modificare(self):
        """ Deschide dialogul pentru modificarea unei tranzacții. """
        if not self._loaded_nr_fisa:
            afiseaza_warning("Selectați un membru.", parent=self)
            return

        if not self._last_record_data:
            afiseaza_warning("Nu există date financiare pentru modificare.", parent=self)
            return

        # Extrage luna și anul din ultima înregistrare
        luna_sel = self._last_record_data.get('luna')
        anul_sel = self._last_record_data.get('anul')

        if luna_sel is None or anul_sel is None:
            afiseaza_eroare(
                "Eroare: Nu s-a putut determina luna/anul ultimei tranzacții.",
                parent=self
            )
            return

        # Preluăm soldurile de deschidere pentru validare
        opening_impr_sold, _ = self._get_opening_balances(self._loaded_nr_fisa, luna_sel, anul_sel)

        # Folosește direct datele ultimei înregistrări
        data_existenta = self._last_record_data

        # Verifică dacă există sold de împrumut
        impr_sold = data_existenta.get('impr_sold', Decimal('0.00'))
        if impr_sold > Decimal('0.005'):
            # Afișează un mesaj de atenționare dacă există sold de împrumut
            if not afiseaza_intrebare(
                    f"Există un sold de împrumut de <b>{impr_sold:.2f} lei</b>.\n\n"
                    f"Dacă doriți să achitați <b>anticipat</b> împrumutul, recomandăm să:\n"
                    f"1. Apăsați Cancel pentru a reveni\n"
                    f"2. Utilizați mai întâi <b>Aplică Dobândă</b> pentru a calcula dobânda datorată\n"
                    f"3. Reveniți apoi la Modifică Tranzacție pentru achitare\n\n"
                    f"Doriți să continuați oricum cu modificarea?",
                    titlu="Atenție - Împrumut Activ",
                    parent=self,
                    buton_default=QMessageBox.No
            ):
                return

        dialog = TranzactieDialog(parent=self, opening_impr_sold=opening_impr_sold)
        dialog.set_data_for_edit(luna_sel, anul_sel, data_existenta)

        if dialog.exec_() == QDialog.Accepted:
            validated_data = dialog.get_validated_data()
            if validated_data:
                # Se asigură că luna și anul din datele validate sunt cele corecte
                validated_data['luna'] = luna_sel
                validated_data['anul'] = anul_sel
                self._proceseaza_si_actualizeaza_tranzactie(luna_sel, anul_sel, validated_data)
            else:
                logging.warning("Validare date dialog modificare eșuată.")

    def _get_record_for_month(self, nr_fisa, luna, anul):
        """Prelucrează datele pentru o lună/an specific."""
        conn = None
        record_data = None
        try:
            conn = sqlite3.connect(f"file:{DB_DEPCRED}?mode=ro", uri=True)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute(
                "SELECT * FROM depcred WHERE nr_fisa = ? AND luna = ? AND anul = ?",
                (nr_fisa, luna, anul)
            )
            row = cursor.fetchone()
            if row:
                record_data = {
                    k: Decimal(str(row[k] or '0.00')) if k not in ['nr_fisa', 'luna', 'anul', 'prima', 'id'] else row[k]
                    for k in row.keys()
                }
                logging.info(f"Găsit record {nr_fisa}/{luna}-{anul}")  # Scurtat log
        except sqlite3.Error as e:
            logging.error(f"SQLite error _get_record: {e}", exc_info=True)
            afiseaza_eroare(f"Eroare citire DB {luna}-{anul}:\n{e}", parent=self)
        finally:
            if conn:
                conn.close()
        return record_data

    def _get_opening_balances(self, nr_fisa, luna, anul):
        """Prelucrează soldurile de deschidere."""
        prev_luna = luna - 1 if luna > 1 else 12
        prev_anul = anul if luna > 1 else anul - 1

        if prev_anul <= 0:
            return Decimal('0.00'), Decimal('0.00')

        conn = None
        opening_impr, opening_dep = Decimal('0.00'), Decimal('0.00')
        try:
            conn = sqlite3.connect(f"file:{DB_DEPCRED}?mode=ro", uri=True)
            cursor = conn.cursor()
            cursor.execute(
                "SELECT impr_sold, dep_sold FROM depcred WHERE nr_fisa = ? AND luna = ? AND anul = ?",
                (nr_fisa, prev_luna, prev_anul)
            )
            row = cursor.fetchone()
            if row:
                opening_impr = Decimal(str(row[0] or '0.00'))
                opening_dep = Decimal(str(row[1] or '0.00'))
            else:
                logging.warning(f"Lipsă lună anterioară ({prev_luna}-{prev_anul}) pt {nr_fisa}")
        except sqlite3.Error as e:
            logging.error(f"SQLite error _get_opening: {e}", exc_info=True)
        finally:
            if conn:
                conn.close()

        return opening_impr, opening_dep

    def _proceseaza_si_actualizeaza_tranzactie(self, luna, anul, data_tranzactie):
        """Actualizează tranzacția și declanșează recalcularea."""
        log_prefix = f"Update {self._loaded_nr_fisa}/{luna:02d}-{anul}"
        logging.info(f"{log_prefix}: Procesare...")

        new_dobanda = data_tranzactie['dobanda']
        new_impr_deb = data_tranzactie['impr_deb']
        new_impr_cred = data_tranzactie['impr_cred']
        new_dep_deb = data_tranzactie['dep_deb']
        new_dep_cred = data_tranzactie['dep_cred']

        opening_impr_sold, opening_dep_sold = self._get_opening_balances(
            self._loaded_nr_fisa, luna, anul
        )
        logging.info(
            f"{log_prefix}: Solduri deschidere Impr={opening_impr_sold}, Dep={opening_dep_sold}"
        )

        # Compară dep_deb modificat cu valoarea din ultimul record
        old_dep_deb = self._last_record_data.get('dep_deb', Decimal('0.00'))
        if new_dep_deb != old_dep_deb:
            # Întreabă utilizatorul dacă dorește să actualizeze cotizația standard
            if afiseaza_intrebare(
                    f"Ați modificat cotizația lunară de la {old_dep_deb:.2f} la {new_dep_deb:.2f}.\n\n"
                    f"Doriți să actualizați și cotizația standard pentru lunile viitoare?",
                    titlu="Actualizare Cotizație Standard",
                    parent=self,
                    buton_default=QMessageBox.Yes  # Default la Yes
            ):
                success = self._actualizeaza_cotizatie_standard(self._loaded_nr_fisa, new_dep_deb)
                if success:
                    self.lbl_recalc_status.setText("✓ Cotizație standard actualizată")
                    QTimer.singleShot(3000, lambda: self.lbl_recalc_status.setText(""))
                else:
                    afiseaza_warning(
                        "Nu s-a putut actualiza cotizația standard în baza de date.\n"
                        "Verificați jurnalul de evenimente pentru detalii.",
                        parent=self
                    )

        # Verificare fond disponibil
        available_dep_fund = opening_dep_sold + new_dep_deb
        if new_dep_cred > available_dep_fund:
            afiseaza_eroare(
                f"Retragere ({new_dep_cred:.2f}) > fond disponibil ({available_dep_fund:.2f})! Anulat.",
                parent=self
            )
            logging.warning(f"{log_prefix}: Anulat. Retragere {new_dep_cred} > Disp {available_dep_fund}")
            return

        recalculated_impr_sold = opening_impr_sold + new_impr_deb - new_impr_cred
        recalculated_dep_sold = opening_dep_sold + new_dep_deb - new_dep_cred

        # Ajustăm soldul împrumutului la 0 dacă este foarte aproape de 0
        if recalculated_impr_sold <= Decimal('0.005'):
            recalculated_impr_sold = Decimal('0.00')

        logging.info(
            f"{log_prefix}: Solduri recalculate Impr={recalculated_impr_sold}, Dep={recalculated_dep_sold}"
        )

        # UPDATE pentru tabela depcred
        conn = None
        try:
            conn = sqlite3.connect(DB_DEPCRED)
            cursor = conn.cursor()

            # Actualizăm toate câmpurile relevante
            update_query = """
            UPDATE depcred 
            SET dobanda = ?, impr_deb = ?, impr_cred = ?, impr_sold = ?, 
                dep_deb = ?, dep_cred = ?, dep_sold = ? 
            WHERE nr_fisa = ? AND luna = ? AND anul = ?
            """

            update_params = (
                float(new_dobanda), float(new_impr_deb), float(new_impr_cred),
                float(recalculated_impr_sold), float(new_dep_deb), float(new_dep_cred),
                float(recalculated_dep_sold), self._loaded_nr_fisa, luna, anul
            )

            cursor.execute(update_query, update_params)
            conn.commit()

            logging.info(f"Date actualizate în depcred pentru {self._loaded_nr_fisa}/{luna:02d}-{anul}")

            # Acum reîmprospătăm istoricul pentru a vedea modificările
            self._afiseaza_istoric(self._loaded_nr_fisa)

            # Opțional, declanșează recalcularea lunilor ulterioare
            self._declanseaza_recalculare_ulterioara(self._loaded_nr_fisa, luna, anul)

        except sqlite3.Error as e:
            logging.error(f"Eroare DB la actualizare depcred: {e}", exc_info=True)
            if conn:
                conn.rollback()
            afiseaza_eroare(f"Eroare la actualizarea datelor:\n{e}", parent=self)
        finally:
            if conn:
                conn.close()


# --- Bloc de testare ---
if __name__ == "__main__":
    def initialize_database(db_path, create_sql):
        """ Funcție helper pentru inițializare DB. """
        conn = None
        try:
            conn = sqlite3.connect(db_path)
            cursor = conn.cursor()
            cursor.execute(create_sql)
            conn.commit()
        except sqlite3.Error as e:
            logging.error(f"Eroare inițializare DB {db_path}: {e}")
        finally:
            if conn: conn.close()


    # SQL pentru creare tabele (simplificat)
    create_membrii_sql = """
    CREATE TABLE IF NOT EXISTS membrii (
        NR_FISA INTEGER PRIMARY KEY, NUM_PREN TEXT UNIQUE, DOMICILIUL TEXT,
        CALITATEA TEXT, DATA_INSCR TEXT
    );"""
    create_depcred_sql = """
    CREATE TABLE IF NOT EXISTS depcred (
        id INTEGER PRIMARY KEY AUTOINCREMENT, nr_fisa INTEGER NOT NULL,
        luna INTEGER NOT NULL, anul INTEGER NOT NULL,
        dobanda REAL DEFAULT 0.00, impr_deb REAL DEFAULT 0.00,
        impr_cred REAL DEFAULT 0.00, impr_sold REAL DEFAULT 0.00,
        dep_deb REAL DEFAULT 0.00, dep_cred REAL DEFAULT 0.00,
        dep_sold REAL DEFAULT 0.00, prima INTEGER DEFAULT 0,
        UNIQUE(nr_fisa, anul, luna)
    );"""
    create_lichidati_sql = """
    CREATE TABLE IF NOT EXISTS lichidati (
        nr_fisa INTEGER PRIMARY KEY, data_lichidare TEXT NOT NULL
    );"""

    # Inițializare DB dacă lipsesc
    if not os.path.exists(DB_MEMBRII):
        initialize_database(DB_MEMBRII, create_membrii_sql)
    if not os.path.exists(DB_DEPCRED):
        initialize_database(DB_DEPCRED, create_depcred_sql)
    if not os.path.exists(DB_LICHIDATI):
        initialize_database(DB_LICHIDATI, create_lichidati_sql)

    # Rulare aplicație GUI
    app = QApplication(sys.argv)
    window = QMainWindow()
    widget = SumeLunareWidget()
    window.setCentralWidget(widget)
    window.setWindowTitle("Sume Lunare CAR - Design Modern Îmbunătățit")
    window.resize(1150, 800)
    window.show()
    sys.exit(app.exec_())