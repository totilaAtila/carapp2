import sqlite3
from datetime import datetime
from PyQt5.QtWidgets import (
    QWidget, QLabel, QVBoxLayout, QGridLayout, QGroupBox, QHBoxLayout,
    QGraphicsDropShadowEffect, QFrame, QProgressBar, QSizePolicy, QApplication
)
from PyQt5.QtGui import QIcon, QFont, QPixmap, QPainter, QColor, QLinearGradient
from PyQt5.QtCore import Qt, QTimer, QPropertyAnimation, QEasingCurve, QRect, QSize
import sys
import os

if getattr(sys, 'frozen', False):
    BASE_RESOURCE_PATH = os.path.dirname(sys.executable)
else:
    current_script_path = os.path.abspath(__file__)
    ui_directory = os.path.dirname(current_script_path)
    BASE_RESOURCE_PATH = os.path.dirname(ui_directory)

# Definim caile catre bazele de date relative la directorul de resurse
DB_MEMBRII = os.path.join(BASE_RESOURCE_PATH, "MEMBRII.db")
DB_DEPCRED = os.path.join(BASE_RESOURCE_PATH, "DEPCRED.db")
DB_ACTIVI = os.path.join(BASE_RESOURCE_PATH, "ACTIVI.db")
DB_INACTIVI = os.path.join(BASE_RESOURCE_PATH, "INACTIVI.db")
DB_CHITANTE = os.path.join(BASE_RESOURCE_PATH, "CHITANTE.db")
DB_LICHIDATI = os.path.join(BASE_RESOURCE_PATH, "LICHIDATI.db")


def format_number_ro(value, decimals=0):
    """
    Formateaza numar conform standard RO: punct la mii, virgula la zecimale

    Exemple:
        format_number_ro(1020.22, 2) → "1.020,22"
        format_number_ro(552567, 0) → "552.567"
    """
    if decimals > 0:
        # Separa partea intreaga de partea zecimala
        intreg = int(value)
        zecimal = value - intreg

        # Formateaza partea intreaga cu puncte la mii
        intreg_formatted = f"{intreg:,}".replace(',', '.')

        # Formateaza partea zecimala
        zecimal_formatted = f"{zecimal:.{decimals}f}"[2:]  # Sare peste "0."

        return f"{intreg_formatted},{zecimal_formatted}"
    else:
        # Fara zecimale - doar formatare cu puncte la mii
        return f"{int(value):,}".replace(',', '.')


class ModernStatCard(QGroupBox):
    """Card statistic modern cu efecte glossy/transparente și tooltip-uri"""

    def __init__(self, icon_path, title, color, tooltip_text="", multiline=False):
        super().__init__()
        self.color = color
        self.multiline = multiline
        self.tooltip_text = tooltip_text
        self.value_label = None
        self.progress_bar = None
        self._setup_card(icon_path, title)
        self._apply_modern_styling()
        self.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Fixed)

        # Seteaza tooltip-ul pentru intregul card
        if tooltip_text:
            self.setToolTip(tooltip_text)

    def _setup_card(self, icon_path, title):
        """Configureaza structura cardului"""
        layout = QVBoxLayout(self)
        layout.setSpacing(6)
        layout.setContentsMargins(10, 10, 10, 10)

        # Header cu iconita si titlul
        header_layout = QHBoxLayout()
        header_layout.setSpacing(5)

        # Iconita moderna
        icon_label = QLabel()
        icon_full_path = os.path.join(BASE_RESOURCE_PATH, icon_path)
        if os.path.exists(icon_full_path):
            pixmap = QIcon(icon_full_path).pixmap(22, 22)
        else:
            print(f"Warning: Icon not found at {icon_full_path}. Using fallback emoji for '{title}'.")
            icon_emoji = self._get_emoji_for_title(title)
            icon_label.setText(icon_emoji)
            icon_label.setStyleSheet("font-size: 16px;")
            pixmap = None

        if pixmap:
            icon_label.setPixmap(pixmap)
        icon_label.setFixedSize(26, 26)
        icon_label.setAlignment(Qt.AlignCenter)

        # Titlu modern
        title_label = QLabel(title)
        title_label.setStyleSheet(f"""
            font-size: 11px;
            font-weight: bold;
            color: {self.color};
            padding-left: 5px;
        """)

        header_layout.addWidget(icon_label)
        header_layout.addWidget(title_label)
        header_layout.addStretch()

        # Valoarea principala
        self.value_label = QLabel("0")
        self.value_label.setAlignment(Qt.AlignCenter)
        self.value_label.setObjectName("value")

        # Progress bar
        if not self.multiline:
            self.progress_bar = QProgressBar()
            self.progress_bar.setVisible(False)
            self.progress_bar.setFixedHeight(18)
            self.progress_bar.setTextVisible(True)
            self.progress_bar.setAlignment(Qt.AlignCenter)
            self.progress_bar.setStyleSheet(f"""
                QProgressBar {{
                    border: 1px solid rgba(0, 0, 0, 50);
                    border-radius: 9px;
                    background-color: rgba(255, 255, 255, 0.6);
                    text-align: center;
                    color: #2c3e50;
                    font-weight: bold;
                    font-size: 11px;
                }}
                QProgressBar::chunk {{
                    background: qlineargradient(x1:0, y1:0, x2:1, y2:0,
                        stop:0 {self.color}, stop:1 {self._adjust_color_brightness(self.color, 30)});
                    border-radius: 8px;
                    margin: 1px;
                }}
            """)
            layout.addWidget(self.progress_bar)

        layout.addLayout(header_layout)
        layout.addWidget(self.value_label)

        # Shadow effect pentru card
        shadow = QGraphicsDropShadowEffect()
        shadow.setBlurRadius(12)
        shadow.setColor(QColor(0, 0, 0, 30))
        shadow.setOffset(0, 2)
        self.setGraphicsEffect(shadow)

    def _get_emoji_for_title(self, title):
        emoji_map = {
            "Total membri": "👥", "Membri activi": "✅", "Membri inactivi": "❌",
            "Membri cu împrumuturi active": "🏦", "Total depuneri": "💰", "Total cotizații": "📥",
            "Total retrageri": "📤", "Total fonduri": "🛒", "Total împrumuturi": "💳",
            "Cotizații neachitate": "💰", "Rambursări neachitate": "🏦", "Chitanțe": "🧾",
            "Membri cu împrumuturi noi": "🆕", "Împrumuturi acordate": "💵",
            "De stabilit prima rată": "🔔"
        }
        return emoji_map.get(title, "📊")

    def _hex_to_rgba(self, hex_color, alpha):
        hex_color = hex_color.lstrip('#')
        r = int(hex_color[0:2], 16)
        g = int(hex_color[2:4], 16)
        b = int(hex_color[4:6], 16)
        return f"({r}, {g}, {b}, {alpha})"

    def _adjust_color_brightness(self, hex_color, amount):
        """Ajusteaza luminozitatea unei culori hex. amount > 0 pentru mai deschis, < 0 pentru mai inchis."""
        hex_color = hex_color.lstrip('#')
        rgb = tuple(int(hex_color[i:i + 2], 16) for i in (0, 2, 4))
        new_rgb = tuple(max(0, min(255, c + amount)) for c in rgb)
        return f"#{''.join([f'{c:02x}' for c in new_rgb])}"

    def _apply_modern_styling(self):
        value_font_size = "18px" if not self.multiline else "10px"
        label_value_padding = "6px" if not self.multiline else "4px"

        self.setStyleSheet(f"""
            QGroupBox {{
                border: 1px solid rgba(255, 255, 255, 0.7);
                border-radius: 12px;
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 rgba(255, 255, 255, 0.5),
                    stop:1 rgba(230, 235, 245, 0.6));
                margin-top: 8px;
                padding-top: 5px;
                min-height: 110px;
                max-height: 110px;
            }}
            QGroupBox:hover {{
                border: 1px solid rgba{self._hex_to_rgba(self.color, 0.5)};
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 rgba(255, 255, 255, 0.6),
                    stop:1 rgba(240, 245, 255, 0.7));
            }}
            QLabel#value {{
                font-size: {value_font_size};
                font-weight: bold;
                color: {self.color};
                padding: {label_value_padding};
                border-radius: 6px;
                background: rgba(255, 255, 255, 0.3);
                margin: 3px 5px;
            }}
            QGroupBox::title {{
                color: transparent;
            }}
        """)

    def update_value(self, value, max_value=None):
        if isinstance(value, str):
            self.value_label.setText(value)
            if self.multiline:
                self.value_label.setTextFormat(Qt.RichText)
                self.value_label.setAlignment(Qt.AlignCenter)
        else:
            # Format numeric
            if isinstance(value, (int, float)) and value >= 1000:
                formatted_value = format_number_ro(value, 0)
            else:
                formatted_value = str(value)

            self.value_label.setText(formatted_value)
            if self.progress_bar:
                if max_value is not None and max_value > 0:
                    self.progress_bar.setVisible(True)
                    self.progress_bar.setMaximum(max_value)
                    self.progress_bar.setValue(value)
                    self.progress_bar.setFormat(f"{formatted_value} / {max_value}")
                elif value > 0 and max_value is None:
                    self.progress_bar.setVisible(True)
                    self.progress_bar.setMaximum(value)
                    self.progress_bar.setValue(value)
                    self.progress_bar.setFormat(f"{formatted_value}")
                elif (value == 0 and max_value is None) or (max_value is not None and max_value == 0):
                    self.progress_bar.setVisible(True)
                    self.progress_bar.setMaximum(1)
                    self.progress_bar.setValue(0)
                    self.progress_bar.setFormat("0" if max_value is None else "0 / 0")
                else:
                    self.progress_bar.setVisible(True)
                    self.progress_bar.setMaximum(max_value if max_value else 1)
                    self.progress_bar.setValue(0)
                    self.progress_bar.setFormat(f"0 / {max_value if max_value else 0}")


class StatisticiWidget(QWidget):
    """Widget statistici modernizat cu efecte glossy/transparente si tooltip-uri informative"""

    def __init__(self):
        super().__init__()
        self.cards = {}
        self.ultima_luna = None
        self.ultima_anul = None
        self.refresh_timer = QTimer()
        self.refresh_timer.timeout.connect(self.load_data)
        self._setup_ui()
        self.load_data()
        self.refresh_timer.start(30000)

    def _setup_ui(self):
        main_layout = QVBoxLayout(self)
        main_layout.setSpacing(0)
        main_layout.setContentsMargins(0, 0, 0, 0)

        header = self._create_header()
        main_layout.addWidget(header)

        cards_container = QWidget()
        self.cards_layout = QGridLayout(cards_container)
        self.cards_layout.setSpacing(8)
        self.cards_layout.setContentsMargins(12, 8, 12, 12)

        # === GRUP 1: MEMBRI (4 carduri) - Culori albastre ===
        self.cards["total"] = ModernStatCard(
            "icons/users.png", "Total membri", "#2980b9",
            "Numărul total de membri inregistrați în sistem"
        )

        self.cards["activi"] = ModernStatCard(
            "icons/checkmark.png", "Membri activi", "#3498db",
            "Membri cu orice activitate financiară în luna cea mai recentă (depuneri, împrumuturi, cotizații, retrageri sau rate)"
        )

        self.cards["inactivi"] = ModernStatCard(
            "icons/cross.png", "Membri inactivi", "#85c1e9",
            "Membri fără nici o activitate financiară (0 pe toate pozițiile) în luna cea mai recentă"
        )

        self.cards["cu_imprumuturi"] = ModernStatCard(
            "icons/bank.png", "Membri cu împrumuturi active", "#1f618d",
            "Membri cu solduri de împrumuturi > 0 în luna cea mai recentă"
        )

        # === GRUP 2: DEPUNERI & COTIZATII (4 carduri) - Culori verzi ===
        self.cards["sold_total_depuneri"] = ModernStatCard(
            "icons/money.png", "Sold total depuneri", "#27ae60",
            "Suma totală a soldurilor de depuneri din luna cea mai recentă", multiline=True
        )

        self.cards["total_depuneri_cotizatii"] = ModernStatCard(
            "icons/money.png", "Total depuneri (cotizatii)", "#2ecc71",
            "Suma totală a depunerilor/cotizațiilor plătite in luna cea mai recentă", multiline=True
        )

        self.cards["total_retrageri_fs"] = ModernStatCard(
            "icons/money.png", "Total retrageri Fond Social", "#58d68d",
            "Suma totală a retragerilor de fonduri sociale efectuate în luna cea mai recentă", multiline=True
        )

        self.cards["total_dobanda"] = ModernStatCard(
            "icons/bank.png", "Total dobandă", "#186a3b",
            "Suma totală a dobânzilor calculate în luna cea mai recentă", multiline=True
        )

        # === GRUP 3: IMPRUMUTURI & RATE (4 carduri) - Culori rosii/portocalii ===
        self.cards["sold_total_imprumuturi"] = ModernStatCard(
            "icons/bank.png", "Sold total împrumut", "#e74c3c",
            "Suma totală a soldurilor de împrumuturi din luna cea mai recentă", multiline=True
        )

        self.cards["total_rate_achitate"] = ModernStatCard(
            "icons/bank.png", "Total rate achitate", "#d35400",
            "Suma totală a ratelor de împrumut achitate in luna cea mai recentă", multiline=True
        )

        self.cards["total_general_platit"] = ModernStatCard(
            "icons/money.png", "Total general plătit", "#8e44ad",
            "Suma totală generală plătită (dobânda + rate + cotizații) in luna cea mai recentă", multiline=True
        )

        self.cards["imprumuturi_noi"] = ModernStatCard(
            "icons/bank.png", "Membri cu împrumuturi noi", "#c0392b",
            "Membri care au primit împrumuturi noi în luna cea mai recentă", multiline=True
        )

        # === GRUP 4: RESTANTE & ADMINISTRATIVE (4 carduri) - Culori neutre ===
        self.cards["rest_cot"] = ModernStatCard(
            "icons/money.png", "Cotizatii neachitate", "#f39c12",
            "Membri care nu au plătit cotizația în luna cea mai recentă", multiline=True
        )

        self.cards["rest_imp"] = ModernStatCard(
            "icons/bank.png", "Rambursări neachitate", "#8e44ad",
            "Membri cu rate la împrumut neachitate în luna cea mai recentă", multiline=True
        )

        self.cards["chitante"] = ModernStatCard(
            "icons/save.png", "Chitanțe", "#5dade2",
            "Informații despre chitanțele tipărite și gestionate", multiline=True
        )

        self.cards["prima_rata_stabilit"] = ModernStatCard(
            "icons/bank.png", "De stabilit prima rată", "#16a085",
            "Membri la care trebuie stabilită prima rată", multiline=True
        )

        # Layout organizat pe grupuri - 4 randuri x 4 coloane
        # Randul 0: MEMBRI (4 carduri)
        self.cards_layout.addWidget(self.cards["total"], 0, 0)
        self.cards_layout.addWidget(self.cards["activi"], 0, 1)
        self.cards_layout.addWidget(self.cards["inactivi"], 0, 2)
        self.cards_layout.addWidget(self.cards["cu_imprumuturi"], 0, 3)

        # Randul 1: DEPUNERI & COTIZATII (4 carduri)
        self.cards_layout.addWidget(self.cards["sold_total_depuneri"], 1, 0)
        self.cards_layout.addWidget(self.cards["total_depuneri_cotizatii"], 1, 1)
        self.cards_layout.addWidget(self.cards["total_retrageri_fs"], 1, 2)
        self.cards_layout.addWidget(self.cards["total_dobanda"], 1, 3)

        # Randul 2: IMPRUMUTURI & RATE (4 carduri)
        self.cards_layout.addWidget(self.cards["sold_total_imprumuturi"], 2, 0)
        self.cards_layout.addWidget(self.cards["total_rate_achitate"], 2, 1)
        self.cards_layout.addWidget(self.cards["total_general_platit"], 2, 2)
        self.cards_layout.addWidget(self.cards["imprumuturi_noi"], 2, 3)

        # Randul 3: RESTANTE & ADMINISTRATIVE (4 carduri)
        self.cards_layout.addWidget(self.cards["rest_cot"], 3, 0)
        self.cards_layout.addWidget(self.cards["rest_imp"], 3, 1)
        self.cards_layout.addWidget(self.cards["chitante"], 3, 2)
        self.cards_layout.addWidget(self.cards["prima_rata_stabilit"], 3, 3)

        main_layout.addWidget(cards_container)

        self.setStyleSheet("""
            QWidget {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 rgba(235, 240, 248, 255),
                    stop:1 rgba(220, 230, 245, 255));
                font-family: 'Segoe UI', Arial, sans-serif;
            }
            QToolTip {
                background-color: #2c3e50;
                color: white;
                border: 1px solid #34495e;
                border-radius: 6px;
                padding: 8px;
                font-size: 11px;
                font-weight: normal;
            }
        """)

    def _create_header(self):
        header = QFrame()
        header.setFixedHeight(45)
        header.setStyleSheet("""
            QFrame {
                background: qlineargradient(x1:0, y1:0, x2:1, y2:0,
                    stop:0 rgba(60, 125, 200, 220),
                    stop:0.5 rgba(80, 150, 220, 230),
                    stop:1 rgba(60, 125, 200, 220));
                border-radius: 10px;
                margin: 6px;
                padding: 0 10px;
            }
        """)

        layout = QHBoxLayout(header)
        layout.setContentsMargins(15, 0, 15, 0)

        title = QLabel("📊 Statistici C.A.R. Petrosani")
        title.setStyleSheet("""
            font-size: 17px;
            font-weight: bold;
            color: white;
            background: transparent;
            text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.6);
            padding: 3px 0px;
        """)

        self.datetime_label = QLabel()
        self.datetime_label.setStyleSheet("""
            font-size: 11px;
            color: white;
            font-weight: bold;
            background: transparent;
            text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.6);
            padding: 4px 0px;
        """)
        self.datetime_label.setAlignment(Qt.AlignRight | Qt.AlignVCenter)

        # Label pentru afisarea lunii de referinta
        self.reference_month_label = QLabel()
        self.reference_month_label.setStyleSheet("""
            font-size: 10px;
            color: white;
            font-weight: bold;
            background: transparent;
            text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.6);
            padding: 4px 0px;
        """)
        self.reference_month_label.setAlignment(Qt.AlignCenter | Qt.AlignVCenter)

        self.datetime_timer = QTimer()
        self.datetime_timer.timeout.connect(self._update_datetime)
        self.datetime_timer.start(1000)
        self._update_datetime()

        layout.addWidget(title)
        layout.addWidget(self.reference_month_label)
        layout.addStretch()
        layout.addWidget(self.datetime_label)

        shadow = QGraphicsDropShadowEffect()
        shadow.setBlurRadius(12)
        shadow.setColor(QColor(0, 0, 0, 50))
        shadow.setOffset(0, 3)
        header.setGraphicsEffect(shadow)
        return header

    def _update_datetime(self):
        now = datetime.now()
        date_str = now.strftime("%d/%m/%Y")
        time_str = now.strftime("%H:%M:%S")
        self.datetime_label.setText(f"🗓️ {date_str}  ⏰ {time_str}")

    def _get_latest_month_year(self):
        """Gaseste cea mai recenta luna/an disponibila in DEPCRED"""
        try:
            with sqlite3.connect(DB_DEPCRED) as conn:
                c = conn.cursor()
                c.execute("""
                    SELECT MAX(anul * 12 + luna) as ultima_perioada
                    FROM depcred
                """)
                row = c.fetchone()
                if not row or not row[0]:
                    # Fallback la luna curenta daca nu exista date
                    now = datetime.now()
                    return now.month, now.year

                ultima_perioada = row[0]
                ultima_anul = ultima_perioada // 12
                ultima_luna = ultima_perioada % 12
                if ultima_luna == 0:  # Ajustare pentru decembrie
                    ultima_luna = 12
                    ultima_anul -= 1

                return ultima_luna, ultima_anul
        except Exception as e:
            print(f"Eroare la gasirea ultimei luni: {e}")
            now = datetime.now()
            return now.month, now.year

    def load_data(self):
        try:
            # Gasim cea mai recenta luna/an din DEPCRED
            self.ultima_luna, self.ultima_anul = self._get_latest_month_year()

            # Actualizam label-ul cu luna de referinta
            month_names = ["", "Ianuarie", "Februarie", "Martie", "Aprilie", "Mai", "Iunie",
                           "Iulie", "August", "Septembrie", "Octombrie", "Noiembrie", "Decembrie"]
            month_name = month_names[self.ultima_luna] if self.ultima_luna <= 12 else "Necunoscut"
            self.reference_month_label.setText(f"📅 Referinta: {month_name} {self.ultima_anul}")

            # === CALCULELE PENTRU MEMBRI ===
            total_membri = self._count(DB_MEMBRII, "membrii")
            membri_activi = self._count_membri_activi()
            membri_inactivi = self._count_membri_inactivi()
            membri_cu_imprumuturi = self._count_membri_cu_imprumuturi()

            # === CALCULELE PENTRU SUME FINANCIARE ===
            sold_total_depuneri = self._sum_from_depcred("dep_sold")
            total_depuneri_cotizatii = self._sum_from_depcred("dep_deb")
            total_retrageri_fs = self._sum_from_depcred("dep_cred")
            total_dobanda = self._sum_from_depcred("dobanda")
            sold_total_imprumuturi = self._sum_from_depcred("impr_sold")
            total_rate_achitate = self._sum_from_depcred("impr_cred")
            total_general_platit = total_dobanda + total_rate_achitate + total_depuneri_cotizatii

            # === Membri cu imprumuturi noi ===
            membri_imprumuturi_noi = self._count_membri_imprumuturi_noi()

            # === Membri cu prima rata de stabilit ===
            membri_prima_rata = self._count_membri_prima_rata()

            # === CALCULELE PENTRU RESTANTE ===
            restante_cot = self._count_cotizatii_neachitate()
            restante_imp = self._count_rambursari_neachitate()

            # === CHITANTE ===
            info_ch = self._get_chitante_info()

            # === POPULAREA CARDURILOR ===

            # Grup 1: MEMBRI
            self.cards["total"].update_value(total_membri, total_membri)
            self.cards["activi"].update_value(membri_activi, total_membri)
            self.cards["inactivi"].update_value(membri_inactivi, total_membri)
            self.cards["cu_imprumuturi"].update_value(membri_cu_imprumuturi, total_membri)

            # Grup 2: DEPUNERI & COTIZATII (format text pentru sume mari)
            self.cards["sold_total_depuneri"].update_value(
                f"<div style='text-align: center;'><b style='color: #27ae60; font-size: 15px;'>{format_number_ro(sold_total_depuneri, 0)}</b></div>")

            self.cards["total_depuneri_cotizatii"].update_value(
                f"<div style='text-align: center;'><b style='color: #2ecc71; font-size: 15px;'>{format_number_ro(total_depuneri_cotizatii, 0)}</b></div>")

            self.cards["total_retrageri_fs"].update_value(
                f"<div style='text-align: center;'><b style='color: #58d68d; font-size: 15px;'>{format_number_ro(total_retrageri_fs, 0)}</b></div>")

            self.cards["total_dobanda"].update_value(
                f"<div style='text-align: center;'><b style='color: #186a3b; font-size: 15px;'>{format_number_ro(total_dobanda, 2)}</b></div>")

            # Grup 3: IMPRUMUTURI & RATE
            self.cards["sold_total_imprumuturi"].update_value(
                f"<div style='text-align: center;'><b style='color: #e74c3c; font-size: 15px;'>{format_number_ro(sold_total_imprumuturi, 0)}</b></div>")

            self.cards["total_rate_achitate"].update_value(
                f"<div style='text-align: center;'><b style='color: #d35400; font-size: 15px;'>{format_number_ro(total_rate_achitate, 2)}</b></div>")

            self.cards["total_general_platit"].update_value(
                f"<div style='text-align: center;'><b style='color: #8e44ad; font-size: 15px;'>{format_number_ro(total_general_platit, 2)}</b></div>")

            # Card membri cu imprumuturi noi
            imprumuturi_noi_text = f"<div style='text-align: center;'><b style='color: #c0392b; font-size: 15px;'>{membri_imprumuturi_noi}</b><br><span style='color: #555; font-size: 9px;'>membri</span></div>"
            self.cards["imprumuturi_noi"].update_value(imprumuturi_noi_text)

            # Grup 4: RESTANTE & ADMINISTRATIVE
            rest_cot_text = f"<div style='text-align: center;'><b style='color: #f39c12; font-size: 15px;'>{restante_cot}</b><br><span style='color: #555; font-size: 9px;'>membri</span></div>"
            rest_imp_text = f"<div style='text-align: center;'><b style='color: #8e44ad; font-size: 15px;'>{restante_imp}</b><br><span style='color: #555; font-size: 9px;'>neachitate</span></div>"

            self.cards["rest_cot"].update_value(rest_cot_text)
            self.cards["rest_imp"].update_value(rest_imp_text)
            self.cards["chitante"].update_value(info_ch)

            # Card membri cu prima rata de stabilit
            prima_rata_color = "#16a085" if membri_prima_rata > 0 else "#95a5a6"
            prima_rata_text = f"<div style='text-align: center;'><b style='color: {prima_rata_color}; font-size: 15px;'>{membri_prima_rata}</b><br><span style='color: #555; font-size: 9px;'>membri</span></div>"
            self.cards["prima_rata_stabilit"].update_value(prima_rata_text)

        except Exception as err:
            print(f"❌ [Statistici] Eroare la incarcarea datelor: {err}")
            for card_obj in self.cards.values():
                error_message = "<div style='text-align: center; color: #c0392b; font-size: 10px;'>❌ Eroare</div>"
                if card_obj.multiline:
                    card_obj.update_value(error_message)
                else:
                    card_obj.update_value("N/A")
                    if card_obj.progress_bar:
                        card_obj.progress_bar.setVisible(True)
                        card_obj.progress_bar.setFormat("Eroare")
                        card_obj.progress_bar.setMaximum(1)
                        card_obj.progress_bar.setValue(0)

    def _count_membri_activi(self):
        """Membri cu orice activitate financiara in luna cea mai recenta"""
        try:
            with sqlite3.connect(DB_DEPCRED) as conn:
                c = conn.cursor()
                c.execute("""
                    SELECT COUNT(DISTINCT nr_fisa)
                    FROM depcred
                    WHERE anul = ? AND luna = ? 
                    AND (dep_sold > 0 OR impr_sold > 0 OR dep_deb > 0 OR dep_cred > 0 OR impr_deb > 0 OR impr_cred > 0)
                """, (self.ultima_anul, self.ultima_luna))
                result = c.fetchone()
                return result[0] if result else 0
        except Exception as e:
            print(f"Eroare calcul membri activi: {e}")
            return 0

    def _count_membri_inactivi(self):
        """
        Membri inactivi = membri din MEMBRII.db care NU au activitate financiara
        in luna cea mai recenta. Logica complexa pentru validare.
        """
        try:
            # Pas 1: Obtinem toti membrii din MEMBRII.db
            with sqlite3.connect(DB_MEMBRII) as conn_m:
                c_m = conn_m.cursor()
                c_m.execute("SELECT DISTINCT NR_FISA FROM membrii")
                toti_membrii = {row[0] for row in c_m.fetchall()}

            if not toti_membrii:
                return 0

            # Pas 2: Obtinem membrii activi din DEPCRED pentru luna curenta
            with sqlite3.connect(DB_DEPCRED) as conn_d:
                c_d = conn_d.cursor()

                # Membri cu orice activitate financiara in luna curenta
                c_d.execute("""
                    SELECT DISTINCT nr_fisa
                    FROM depcred
                    WHERE anul = ? AND luna = ? 
                    AND (dep_sold > 0 OR impr_sold > 0 OR dep_deb > 0 OR dep_cred > 0 OR impr_deb > 0 OR impr_cred > 0)
                """, (self.ultima_anul, self.ultima_luna))

                membri_activi = {row[0] for row in c_d.fetchall()}

            # Pas 3: Calculam membrii inactivi
            membri_inactivi = toti_membrii - membri_activi
            count_inactivi = len(membri_inactivi)

            # Pas 4: Verificare pentru debugging
            total_membri = len(toti_membrii)
            count_activi = len(membri_activi)
            calculat_simplu = total_membri - count_activi

            if count_inactivi != calculat_simplu:
                print(f"⚠️ ATENTIE: Discrepanta in calculul membrilor inactivi!")
                print(f"   Total membri: {total_membri}")
                print(f"   Membri activi: {count_activi}")
                print(f"   Inactivi (calcul complex): {count_inactivi}")
                print(f"   Inactivi (calcul simplu): {calculat_simplu}")
                print(f"   Diferenta: {abs(count_inactivi - calculat_simplu)}")

                # Debugging suplimentar - membri care lipsesc din calculul simplu
                if count_inactivi != calculat_simplu:
                    print(f"   Membri cu probleme: {len(toti_membrii & membri_activi) - count_activi}")

            return count_inactivi

        except Exception as e:
            print(f"❌ Eroare calcul membri inactivi (complex): {e}")
            # Fallback la calculul simplu in caz de eroare
            try:
                total_membri = self._count(DB_MEMBRII, "membrii")
                membri_activi = self._count_membri_activi()
                return max(0, total_membri - membri_activi)
            except:
                return 0

    def _count_membri_cu_imprumuturi(self):
        """Membri cu solduri de imprumuturi > 0 in luna cea mai recenta"""
        try:
            with sqlite3.connect(DB_DEPCRED) as conn:
                c = conn.cursor()
                c.execute("""
                    SELECT COUNT(DISTINCT nr_fisa)
                    FROM depcred
                    WHERE anul = ? AND luna = ? AND impr_sold > 0
                """, (self.ultima_anul, self.ultima_luna))
                result = c.fetchone()
                return result[0] if result else 0
        except Exception as e:
            print(f"Eroare calcul membri cu imprumuturi active: {e}")
            return 0

    def _count_membri_imprumuturi_noi(self):
        """
        Membri care au primit imprumuturi noi in luna SURSA (ultima_luna, ultima_anul).
        Criteriu: IMPR_DEB > 0 in luna cea mai recenta
        """
        try:
            with sqlite3.connect(DB_DEPCRED) as conn:
                c = conn.cursor()
                c.execute("""
                    SELECT COUNT(DISTINCT nr_fisa)
                    FROM depcred
                    WHERE anul = ? AND luna = ? AND impr_deb > 0
                """, (self.ultima_anul, self.ultima_luna))
                result = c.fetchone()
                return result[0] if result else 0
        except Exception as e:
            print(f"Eroare calcul membri cu imprumuturi noi: {e}")
            return 0

    def _count_membri_prima_rata(self):
        """
        Detecteaza membrii care trebuie sa stabileasca prima rata.
        Logica identica cu marcarea "!NOU!" din sume_lunare.py si imprumuturi_noi.py

        Returns:
            int: Numarul de membri detectati
        """
        try:
            # Calculam luna sursa (luna anterioara lunii tinta)
            luna_tinta = self.ultima_luna
            anul_tinta = self.ultima_anul

            if luna_tinta == 1:
                luna_sursa = 12
                anul_sursa = anul_tinta - 1
            else:
                luna_sursa = luna_tinta - 1
                anul_sursa = anul_tinta

            with sqlite3.connect(DB_DEPCRED) as conn:
                c = conn.cursor()

                # Query complex cu JOIN pentru detectare
                c.execute("""
                    SELECT COUNT(DISTINCT tinta.nr_fisa)
                    FROM depcred AS tinta
                    INNER JOIN depcred AS sursa 
                        ON tinta.nr_fisa = sursa.nr_fisa
                        AND sursa.luna = ? AND sursa.anul = ?
                    WHERE 
                        tinta.luna = ? AND tinta.anul = ?
                        AND sursa.impr_deb > 0
                        AND tinta.impr_sold > 0.005
                        AND (tinta.impr_cred = 0 OR tinta.impr_cred IS NULL)
                        AND (tinta.impr_deb = 0 OR tinta.impr_deb IS NULL)
                """, (luna_sursa, anul_sursa, luna_tinta, anul_tinta))

                result = c.fetchone()
                count = result[0] if result else 0

                print(f"✓ Membri cu prima rata de stabilit: {count}")
                print(f"  Luna sursa: {luna_sursa}/{anul_sursa}")
                print(f"  Luna tinta: {luna_tinta}/{anul_tinta}")

                return count

        except Exception as e:
            print(f"Eroare calcul membri cu prima rata de stabilit: {e}")
            import traceback
            traceback.print_exc()
            return 0

    def _sum_from_depcred(self, column_name):
        """Calculeaza suma unei coloane din DEPCRED pentru luna cea mai recenta"""
        try:
            with sqlite3.connect(DB_DEPCRED) as conn:
                c = conn.cursor()
                c.execute(f"""
                    SELECT COALESCE(SUM({column_name}), 0)
                    FROM depcred
                    WHERE anul = ? AND luna = ?
                """, (self.ultima_anul, self.ultima_luna))
                result = c.fetchone()
                return result[0] if result else 0
        except Exception as e:
            print(f"Eroare calcul suma {column_name}: {e}")
            return 0

    def _count_cotizatii_neachitate(self):
        """Membri care nu au platit cotizatia in luna cea mai recenta"""
        try:
            with sqlite3.connect(DB_DEPCRED) as conn:
                c = conn.cursor()
                c.execute("""
                    SELECT COUNT(DISTINCT nr_fisa)
                    FROM depcred
                    WHERE anul = ? AND luna = ? AND dep_deb <= 0
                """, (self.ultima_anul, self.ultima_luna))
                result = c.fetchone()
                return result[0] if result else 0
        except Exception as e:
            print(f"Eroare calcul cotizatii neachitate: {e}")
            return 0

    def _count_rambursari_neachitate(self):
        """Membri cu rate neachitate in luna cea mai recenta"""
        try:
            with sqlite3.connect(DB_DEPCRED) as conn:
                c = conn.cursor()
                c.execute("""
                    SELECT COUNT(DISTINCT nr_fisa)
                    FROM depcred
                    WHERE anul = ? AND luna = ? AND impr_cred <= 0 AND impr_sold > 0
                """, (self.ultima_anul, self.ultima_luna))
                result = c.fetchone()
                return result[0] if result else 0
        except Exception as e:
            print(f"Eroare calcul rambursari neachitate: {e}")
            return 0

    def _get_chitante_info(self):
        """Obtine informatiile despre chitante"""
        try:
            with sqlite3.connect(DB_CHITANTE) as conn:
                c = conn.cursor()
                c.execute("SELECT STARTCH_PR, STARTCH_AC FROM chitante ORDER BY ROWID DESC LIMIT 1")
                row = c.fetchone()
                if row:
                    pr, ac = row
                    tiparite = ac - pr if ac >= pr else 0
                    return (
                        f"<div style='text-align: center; line-height: 1.3;'>"
                        f"<span style='color: #007bff; font-size: 10px; font-weight:bold;'>Precedent:</span> <span style='color: #2c3e50; font-size: 10px;'>{pr}</span><br>"
                        f"<span style='color: #007bff; font-size: 10px; font-weight:bold;'>Curent:</span> <span style='color: #2c3e50; font-size: 10px;'>{ac}</span><br>"
                        f"<b style='color: #28a745; font-size: 11px;'>Tiparite: {tiparite}</b>"
                        f"</div>"
                    )
                else:
                    return "<div style='text-align: center; color: #555; font-size: 10px;'>🚫 Nu exista date</div>"
        except sqlite3.Error as e:
            print(f"Eroare SQLite (CHITANTE): {e}")
            return "<div style='text-align: center; color: #c0392b; font-size: 10px;'>❌ Eroare DB</div>"

    def _count(self, db_path: str, table: str):
        try:
            with sqlite3.connect(db_path) as conn:
                c = conn.cursor()
                c.execute(f"SELECT COUNT(*) FROM {table}")
                return r[0] if (r := c.fetchone()) else 0
        except Exception as e:
            print(f"⚠️ Eroare la numararea din {db_path} (tabel: {table}): {e}")
            return 0

    def showEvent(self, event):
        super().showEvent(event)
        self.load_data()

    def closeEvent(self, event):
        if hasattr(self, 'refresh_timer'):
            self.refresh_timer.stop()
        if hasattr(self, 'datetime_timer'):
            self.datetime_timer.stop()
        super().closeEvent(event)

    def resizeEvent(self, event):
        super().resizeEvent(event)


# Pentru testare independenta
if __name__ == "__main__":
    import sys

    app = QApplication(sys.argv)

    # Creare DB-uri dummy pentru testare daca nu exista
    test_dbs = [
        (DB_MEMBRII, """CREATE TABLE IF NOT EXISTS membrii (
            NR_FISA INTEGER PRIMARY KEY, 
            NUM_PREN TEXT, 
            DOMICILIUL TEXT, 
            CALITATEA TEXT, 
            DATA_INSCR TEXT
        )""", [(1, 'Test Membru 1', 'Adresa 1', 'Membru', '01-01-2024'),
               (2, 'Test Membru 2', 'Adresa 2', 'Membru', '02-01-2024')]),

        (DB_DEPCRED, """CREATE TABLE IF NOT EXISTS depcred (
            nr_fisa INTEGER, luna INTEGER, anul INTEGER,
            dobanda REAL, impr_deb REAL, impr_cred REAL, impr_sold REAL,
            dep_deb REAL, dep_cred REAL, dep_sold REAL, prima INTEGER
        )""", [(1, 12, 2024, 0, 0, 0, 0, 100, 0, 1500, 0),
               (2, 12, 2024, 0, 1000, 0, 1000, 200, 50, 2000, 0)]),

        (DB_CHITANTE, """CREATE TABLE IF NOT EXISTS chitante (
            STARTCH_PR INTEGER, STARTCH_AC INTEGER
        )""", [(1000, 1250)])
    ]

    for db_path, create_sql, sample_data in test_dbs:
        try:
            with sqlite3.connect(db_path) as conn:
                conn.execute(create_sql)
                # Insereaza date de test doar daca tabelul este gol
                table_name = create_sql.split()[5]  # Extrage numele tabelului
                cursor = conn.cursor()
                cursor.execute(f"SELECT COUNT(*) FROM {table_name}")
                if cursor.fetchone()[0] == 0:
                    if table_name == "membrii":
                        conn.executemany("INSERT INTO membrii VALUES (?, ?, ?, ?, ?)", sample_data)
                    elif table_name == "depcred":
                        conn.executemany("INSERT INTO depcred VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", sample_data)
                    elif table_name == "chitante":
                        conn.executemany("INSERT INTO chitante VALUES (?, ?)", sample_data)
                conn.commit()
                print(f"✅ {db_path} initializat cu succes")
        except Exception as e:
            print(f"❌ Eroare initializare {db_path}: {e}")

    widget = StatisticiWidget()
    widget.setWindowTitle("Test Statistici C.A.R. - Versiunea Rafinata")
    widget.setMinimumSize(1200, 600)
    widget.show()

    sys.exit(app.exec_())