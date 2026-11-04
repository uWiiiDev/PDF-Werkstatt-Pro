# PDF-Werkstatt Pro (v1.0) — 100 % Offline Desktop-PDF-Suite im Browser

**PDF-Werkstatt Pro** ist eine vollständige, datenschutzkonforme **Desktop-PDF-Suite für den Browser** – entwickelt für Behörden, Unternehmen und Selbsthoster. Die gesamte PDF-Verarbeitung, Konvertierung, OCR-Texterkennung und PDF/UA-Barrierefreiheitsprüfung erfolgt **zu 100 % lokal und offline**, ohne externe Cloud-Dienste oder CDNs.

---

## ✨ Hauptfunktionen

* **📑 Seiten organisieren, zusammenführen & teilen:**
  * Mehrere PDFs zusammenführen (`📑 Zusammenführen`) mit frei sortierbarer Dateiliste
  * PDF teilen, Seitenbereiche extrahieren oder alle Seiten einzeln als ZIP exportieren
  * Visuelles **Seiten-Studio (`☷`)** zum Sortieren per Drag & Drop, Drehen (`90°`), Duplizieren, Löschen sowie dokumentübergreifende **Sammelmappe**
* **✎ Visueller PDF-Editor & Inline-Textänderung:**
  * Vorhandenen Originaltext im PDF direkt anklicken und umschreiben (`I✎ Text ändern`)
  * Freitext, Freihand-Stift, Textmarker, Rechtecke, Bilder/Logos und Stempel (`BEZAHLT`, `GENEHMIGT`, `VERTRAULICH` + eigene Tresor-Stempel)
  * **Revisionssicheres Schwärzen (`🛡️ Sanitize`)**: Rastert geschwärzte Seiten physisch neu, sodass darunterliegender Text unwiderruflich aus dem PDF-Datenstrom entfernt wird
* **✍️ Unterschreiben & persönlicher Signatur-Tresor:**
  * Unterschrift per Maus/Touch zeichnen oder als Schreibschrift generieren und im persönlichen Konto-Tresor hinterlegen
* **🔎 Offline Sandwich-OCR (Durchsuchbares PDF):**
  * Integrierte **Tesseract.js Offline-OCR-Engine** (Deutsch `deu` & Englisch `eng` lokal im Paket enthalten)
  * Wandelt gescannte PDFs und Bilder (auch bei gedrehten Scanner-Seiten) in **echte durchsuchbare Sandwich-PDFs** mit unsichtbar hinterlegter Textebene um
  * Integrierte PDF-Volltextsuche (`Strg + F`) mit farbiger Treffer-Markierung
* **♿ Barrierefreiheit nach PDF/UA-1, BITV 2.0 & EN 301 549:**
  * 10-Punkte-Live-Prüfung auf Dokumenttitel (`/Title`), Sprache (`/Lang`), `/DisplayDocTitle`, Tagged PDF (`/MarkInfo`), Strukturbaum (`/StructTreeRoot`), Lesezeichen (`/Outlines`), Tab-Reihenfolge (`/Tabs`) und XMP-Metadaten (`pdfuaid:part=1`)
  * **1-Klick Auto-Remediation (`🛠️ Barrierefreiheit nachrüsten`)** sowie visueller Tag-Editor (`H1`, `H2`, `P`, `Figure` + `/Alt`-Alternativtext)
* **📋 Zusatzwerkzeuge (Acrobat-Pro-Klasse):**
  * Interaktive PDF-Formulare (**AcroForms**: Textfelder, Checkboxen, Dropdowns) & klickbare Hyperlinks
  * **Visueller & textueller PDF-Vergleich (`⚖️ PDF-Diff`)**
  * **Bates-Nummerierung**, 3-spaltige Kopf-/Fußzeilen, Wasserzeichen, Seitenzuschneiden (**CropBox/MediaBox** in mm) & **PDF-Komprimierung** (96 / 140 / 200 DPI)
  * **Office- & Bild-Konverter** (`.docx`, `.xlsx`, `.csv`, `.html`, `.md`, `.txt`, `JPG/PNG/WebP` → PDF)
* **☁️ Optionaler persönlicher Tresor & 5-Minuten-Auto-Save:**
  * Passwortgeschützte Benutzerkonten (mit Selbstlöschungs-Funktion nach DSGVO), automatische Versionshistorie und E-Mail-Freigabelinks

---

## 🖥️ Minimale Systemvoraussetzungen

* **Webserver:** Apache 2.2 / 2.4, Nginx oder Microsoft IIS
* **PHP-Version:** **PHP 5.4.0 / PHP 5.5 bis PHP 8.4+**
* **Datenbank:** **Keine Datenbank erforderlich** (arbeitet dateibasiert im geschützten `storage/`-Verzeichnis)
* **Keine System-Abhängigkeiten:** Kein `shell_exec()`, kein Ghostscript und kein systemweites `tesseract-ocr` auf dem Server nötig

---

## 🚀 Schnellinstallation (Clean Install)

1. Repository auf den Webserver kopieren:
   ```bash
   git clone https://github.com/uWiiiDev/PDF-Werkstatt-Pro.git
   ```
2. Schreibrechte für das `storage/`-Verzeichnis setzen (unter Linux/Apache):
   ```bash
   chmod -R 755 PDF-Werkstatt-Pro
   chmod -R 775 PDF-Werkstatt-Pro/storage
   chown -R www-data:www-data PDF-Werkstatt-Pro/storage
   ```
3. Optional in [`config.php`](config.php) den SMTP-Server und das Speicherplatz-Kontingent (`user_quota_mb`) anpassen.
4. Im Browser aufrufen (`http://ihr-server/PDF-Werkstatt-Pro/`). Zur Systemprüfung steht zusätzlich `diagnose.php` bereit.
