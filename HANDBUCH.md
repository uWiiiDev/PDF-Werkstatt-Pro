# PDF-Werkstatt Pro — Benutzerhandbuch & Funktionsreferenz

**Version:** 1.0  
**Architektur:** 100 % Offline (keine externen CDN-Abhängigkeiten), kompatibel ab **PHP 5.4+** bis **PHP 8.4+** auf reinem Webspace (ohne `shell_exec` oder Datenbankzwang).

---

## 1. Überblick & Systemarchitektur

**PDF-Werkstatt Pro (v1.0)** ist eine vollständige Desktop-PDF-Suite im Browser. Alle PDF-, Konvertierungs-, Barrierefreiheits- und OCR-Engines sind lokal im Verzeichnis `assets/vendor/` eingebunden:
- **PDF-Manipulation & Formulare:** `pdf-lib.min.js`
- **PDF-Rendering & Textanalyse:** `pdf.min.js` & `pdf.worker.min.js`
- **Offline-OCR (Texterkennung & Sandwich-PDF):** `tesseract.min.js`, WebAssembly-Rechenkerne sowie die deutschen (`deu.traineddata.gz`) und englischen (`eng.traineddata.gz`) Sprachpakete
- **Office-Konverter:** `mammoth.browser.min.js` (Word `.docx`) & `xlsx.full.min.js` (Excel `.xlsx`/`.xls`/`.csv`)
- **Archivierung:** `jszip.min.js`

---

## 2. Arbeitsoberfläche, Ribbon-Menü & Ansichtsmodi

Die Anwendung gliedert sich in fünf Bereiche:
1. **Fenster-Titelleiste (Zeile 1):**
   - Schnellzugriff (`📂 Öffnen`, `💾 Speichern`, `↶ Rückgängig`)
   - Umschalter zwischen den 3 Arbeitsansichten:
     - `⊞ Alle Tools` (Übersichts-Dashboard aller Werkzeuge)
     - `☷ Seiten-Studio` (Großflächiger Drag-&-Drop-Seitensortierer)
     - `✎ PDF-Editor` (Visueller Seiten-, Formular- & Tag-Editor)
   - `👤 Konto / Login` (Persönlicher Tresor & Vorlagen), `● PHP Offline-Status`, Seitenleisten-Schalter (`◧`, `◨`), `◐` Hell-/Dunkel-Design, `❓` Hilfe sowie `▴` Ribbon ein-/ausklappen.
2. **Ribbon-Kategorienleiste (Zeile 2):**
   - `🏠 Start` | `✎ Bearbeiten` | `📑 Seiten` | `📋 Formulare & Links` | `🛡️ Layout & Schutz` | `🔄 Konverter & OCR` | `♿ Barrierefreiheit`
3. **Ribbon-Werkzeugdeck (Zeile 3):**
   - Zeigt die zum gewählten Reiter gehörenden Werkzeuge übersichtlich ohne horizontales Scrollen an.
4. **Multi-Dokument-Tableiste:**
   - Beliebig viele PDFs gleichzeitig in Tabs öffnen, wechseln oder über `⇄ Alle Tabs verbinden` zusammenführen.
5. **Linkes Dock (`Seiten`, `Sammelmappe`, `☁️ Tresor`) & Rechter Inspektor:**
   - Links verwalten Sie Seitenminiaturen, die dokumentübergreifende Sammelmappe und gespeicherte Tresor-Dokumente. Rechts steuern Sie Werkzeugeigenschaften, Wasserzeichen, Komprimierung, Metadaten, Sandwich-OCR und Barrierefreiheit.

---

## 3. Seiten organisieren, zusammenfügen, teilen & Sammelmappe

- **PDF zusammenfügen (`➕ Verbinden`):** Mehrere PDF-Dateien auswählen und an das aktuelle Dokument anhängen oder zu einem neuen PDF verbinden.
- **PDF teilen & extrahieren (`✂️ Teilen`):** Seitenbereiche (z. B. `1-3, 5, 8-10`) definieren und entweder als neuen Tab öffnen, als PDF herunterladen oder **jede Seite einzeln als PDF in einem ZIP-Archiv** speichern.
- **Seiten sortieren, drehen, duplizieren & löschen (`☷ Seiten-Studio` / Reiter `📑 Seiten`):** Seiten per Drag & Drop umsortieren, um 90° nach links/rechts drehen (`⟲` / `⟳`), Reihenfolge umkehren (`⇅`), aktuelle Seite duplizieren (`⧉`), als Einzel-PDF auskoppeln oder leere DIN-A4-Seiten einfügen.
- **Sammelmappe (`🗂️`):** Einzelne Seiten aus verschiedenen geöffneten Dokument-Tabs sammeln und per Klick auf *„Neues PDF aus Sammelmappe öffnen“* zu einer neuen Datei zusammenstellen.

---

## 4. Visueller PDF-Editor, Originaltext direkt umschreiben, Stempel & Unterschrift

Im Reiter **`✎ Bearbeiten`** stehen folgende Werkzeuge bereit:
- **`↖ Auswahl`:** Platzierte Elemente anklicken, frei mit der Maus verschieben, per Doppelklick bearbeiten oder mit `Entf` löschen.
- **`I✎ Text ändern` (Originaltext im PDF direkt umschreiben):** Erkennt automatisch alle eingebetteten Textzeilen im PDF und markiert sie mit einem feinen blauen Rahmen. Ein Klick auf eine beliebige Textzeile liest den vorhandenen Originaltext samt Position und Schriftgröße automatisch aus, blendet den alten Text an dieser Stelle sauber aus und ersetzt ihn passgenau durch Ihren neuen Text (Schriftgröße und Farbe rechts im Inspektor live anpassbar).
- **`T+ Neuer Text`:** Freitext mit wählbarer Schriftgröße und Farbe an beliebiger freier Stelle auf der Seite platzieren.
- **`✒️ Stift` & `🖍️ Marker`:** Freihand-Zeichnungen und halbtransparente Textmarker-Hervorhebungen.
- **`▭ Rahmen` & `🖼️ Bild`:** Farbige Rechteck-Rahmen zeichnen oder Bilddateien (PNG/JPG/WebP) auf der Seite einfügen.
- **`🏷️ Stempel`:** Behörden- und Büro-Stempel (`BEZAHLT`, `GENEHMIGT`, `VERTRAULICH`, `ENTWURF`, `KOPIE`, `GEPRÜFT`, `EINGEGANGEN AM [Datum]`) sowie eigene Stempel aus dem persönlichen Konto-Tresor platzieren.
- **`✍️ Signatur`:** Eigenhändige Unterschrift per Maus/Finger zeichnen oder als Schreibschrift generieren und im **persönlichen Unterschriften-Tresor** für die 1-Klick-Wiederverwendung speichern.
- **`✔ Einbetten`:** Schreibt alle beweglichen Annotationen fest in die PDF-Datenstruktur.

---

## 5. Sicheres Schwärzen (Sanitize), Wasserzeichen & Komprimierung

- **Schwärzen (`██ Schwärzen`) & Sicherheits-Bereinigung (`🛡️ Sicher schwärzen`):**
  1. Mit `██ Schwärzen` schwarze Balken über vertrauliche Stellen ziehen.
  2. Auf `🛡️ Sicher schwärzen` klicken: Die Seiten werden hochauflösend gerastert neu aufgebaut, sodass der **darunterliegende Textstrom physisch aus der PDF-Datei entfernt** wird und nicht mehr herauskopiert oder extrahiert werden kann.
- **Wasserzeichen (`💧 Wasserzeichen`):** Diagonales Text-Wasserzeichen mit frei wählbarer Deckkraft (`0.05–1.0`) und Schriftgröße auf alle Seiten anwenden.
- **PDF komprimieren (`📉 Komprimieren`):** Dateigröße über drei Profile reduzieren (*96 DPI Stark*, *140 DPI Ausgewogen*, *200 DPI Druckqualität*) inklusive Vorher-/Nachher-Anzeige.
- **Metadaten (`🏷️ Metadaten`):** Titel, Autor und Betreff/Stichwörter im PDF-Info-Dictionary setzen.

---

## 6. Interaktive Formulare (AcroForms) & Hyperlinks

Im Reiter **`📋 Formulare & Links`**:
- **`🔤 Textfeld`:** Ziehen Sie ein ausfüllbares PDF-Textfeld (`PDFTextField`) auf.
- **`☑️ Checkbox`:** Erstellt ein interaktives Kontrollkästchen (`PDFCheckBox`).
- **`▾ Dropdown`:** Erstellt eine Auswahlliste (`PDFDropdown`) mit frei definierbaren Optionen.
- **`🔗 Link`:** Erzeugt klickbare Hyperlinks auf externe URLs (`https://...`) oder interne Seitensprünge (`Seite X`).
- **`🔒 Formular sperren (Flatten)`:** Verschmilzt alle ausgefüllten Formularfelder dauerhaft und unveränderbar mit dem Seitenhintergrund.

---

## 7. Seiten zuschneiden (Crop), Bates-Nummerierung & Kopf-/Fußzeilen

Im Reiter **`🛡️ Layout & Schutz`**:
- **`📐 Zuschneiden (Crop)`:** Schneidet Seitenränder (Oben, Unten, Links, Rechts in Millimetern) auf der aktuellen Seite oder allen Seiten zu (`CropBox` / `MediaBox`).
- **`📑 Kopf/Fuß & Bates`:**
  - **Bates-Nummerierung:** Fügt juristische/behördliche Aktenzeichen-Nummern (z. B. `AZ-2026-000001`) oben rechts auf allen Seiten ein. Bei angemeldetem Benutzerkonto wird der **nächste freie Zählerstand automatisch im Profil gespeichert**.
  - **3-spaltige Kopf- & Fußzeilen:** Gleichzeitiges Beschriften von Kopfzeile (Links, Mitte, Rechts) und Fußzeile (Links, Mitte, Rechts) mit den Platzhaltern `{page}`, `{total}`, `{date}` und `{file}`.

---

## 8. PDF-Vergleich (Visueller Pixel-Diff & Text-Abgleich)

Über **`🏠 Start → ⚖️ Vergleichen`** (oder aus der Versionshistorie im Tresor):
- Vergleicht zwei PDF-Dokumente (Dokument A und Dokument B) nebeneinander.
- **Visueller Pixel-Diff:** Markiert jede optische Abweichung in einer dritten Vorschauspalte rot und berechnet den prozentualen Abweichungsgrad.
- **Text-Diff:** Zeigt zeilenweise alle hinzugefügten (`+`) und entfernten (`-`) Textpassagen an.

---

## 9. Konverter (Office/Bilder) & Durchsuchbares Sandwich-OCR

Im Reiter **`🔄 Konverter & OCR`**:
- **`🖼️ Bilder → PDF`:** Wandelt JPG-, PNG- und WebP-Bilder in ein PDF-Dokument um.
- **`📝 Office/Text → PDF`:** Konvertiert Word (`.docx`), Excel/Tabellen (`.xlsx`, `.xls`, `.csv`), HTML (`.html`) sowie Markdown/Text (`.md`, `.txt`) komplett offline in ein mehrseitiges PDF.
- **`📷 Seite → PNG` / `🗂️ Alle → ZIP` / `📄 PDF → Text`:** Exportiert Seiten als Einzelbild, als komplettes Bilder-ZIP-Archiv oder als Textdatei (`.txt`).
- **`🔎 Durchsuchbares PDF (Sandwich-OCR)`:**
  - Analysiert gescannte PDFs oder Bilder offline mit **Tesseract OCR** (`deu`, `eng`, `deu+eng`).
  - Bettet jedes erkannte Wort an seinen **exakten Bildkoordinaten (`Bounding Box`)** als unsichtbare, durchsuchbare Textebene in das PDF ein.
  - Das optische Erscheinungsbild des Scans bleibt 1:1 erhalten, während der Text im PDF mit `Strg+F` durchsucht, mit der Maus markiert/kopiert und von Screenreadern (PDF/UA) vorgelesen werden kann.

---

## 10. Barrierefreiheit (PDF/UA-1, BITV 2.0 & WCAG 2.1)

Im Reiter **`♿ Barrierefreiheit`**:
1. **`♿ PDF/UA Prüfung` (10-Punkte-Audit):**
   Prüft Dokumenttitel (`/Title` & `dc:title`), `DisplayDocTitle`, Dokumentsprache (`/Lang`), Tagged-Status (`/Marked true`), Strukturbaum (`/StructTreeRoot`), PDF/UA-XMP-Kennung (`pdfuaid:part=1`), auslesbaren Textstrom, Schriftressourcen (`/Font`), Lesezeichen (`/Outlines`) und Screenreader-Zugriffsfreigabe.
2. **`⚡ Auto-Fix PDF/UA` (1-Klick Reparatur):**
   Rüstet alle fehlenden Metadaten, `ViewerPreferences`, Sprache, `MarkInfo`, XMP-PDF/UA-Streams, Lesezeichen und den logischen Basis-Strukturbaum (`/StructTreeRoot`) automatisch im PDF nach.
3. **Visueller Tag- & Alternativtext-Editor (`H1 Tag`, `H2 Tag`, `P Absatz`, `🖼️ Alt-Text`):**
   Markieren Sie Überschriften, Absätze oder Abbildungen direkt auf der Seite und hinterlegen Sie für Grafiken/Stempel/Unterschriften einen **Alternativtext (`/Alt`)**, der für blinde Nutzer direkt in die PDF-Struktur-Elemente eingebettet wird.
4. **`📄 Prüfbericht PDF`:**
   Erstellt ein mehrseitiges PDF-Prüfprotokoll über alle 10 Barrierefreiheits-Kriterien.

---

## 11. Optionales Benutzerkonto, Projekt-Tresor, Versionen & E-Mail-Freigaben

Über **`👤 Mein Konto`** (oder oben rechts in der Titelleiste):
1. **Persönlicher Datei- & Projekt-Tresor (`☁️ Im Tresor speichern`):**
   Speichert neben der fertigen PDF-Datei auch den **editierbaren Projektstand (`.proj.json` + `.raw`)**. Über **`✎ Weiterbearbeiten`** im linken Dock (`☁️ Tresor`) können alle Textfelder, Stempel, Unterschriften und Tags später nahtlos weiter verschoben und bearbeitet werden.
2. **Automatische Versionshistorie (`🕒`):**
   Vor jedem Überschreiben im Tresor wird automatisch eine nummerierte Vorversion (`Version 1`, `Version 2`, …) archiviert, die jederzeit als Tab geöffnet oder mit einem Klick im **PDF-Diff** mit dem aktuellen Stand verglichen werden kann.
3. **Persönlicher Unterschriften- & Stempel-Tresor:**
   Eigene Signaturen, Paraphen und individuelle Stempel dauerhaft im Konto speichern.
4. **Profil-Vorlagen & fortlaufender Bates-Zähler:**
   Standard-Autor, Dienststelle, Sprache, Wasserzeichen, Fußzeilen und der fortlaufende Bates-Zähler werden automatisch vorbelegt und weitergezählt.
5. **geteilte Freigabe-Links per E-Mail (`✉️ Per E-Mail teilen`):**
   Erzeugt sichere Freigabe-Links (`index.php?share=<token>`) mit wählbarer Gültigkeit und Berechtigung (*Nur Lesen* oder *Im Editor öffnen & gegenzeichnen*) und versendet die Einladung per E-Mail bzw. über das lokale Mail-Programm (`mailto:`).
6. **Passwort ändern, Abmelden, Passwort zurücksetzen & Konto löschen:**
   - Sobald ein Benutzer angemeldet ist, erscheinen oben rechts in der Titelleiste (und im Konto-Dialog) direkte Schaltflächen für **`🔑 Passwort`** und **`🚪 Abmelden`**.
   - Im Bereich *„1. Passwort ändern“* des Benutzerkontos kann das Passwort jederzeit unter Angabe des aktuellen Passworts und eines neuen Passworts (mindestens 8 Zeichen) geändert werden.
   - Über den Link *„Passwort vergessen? Zurücksetzungs-Link per E-Mail anfordern“* im Anmeldefenster wird ein 60 Minuten gültiger Einmal-Link an die hinterlegte E-Mail-Adresse gesendet.
   - Im Bereich *„4. Benutzerkonto & Tresor dauerhaft löschen“* kann jeder angemeldete Benutzer sein eigenes Konto nach Bestätigung mit seinem aktuellen Passwort jederzeit selbstständig und unwiderruflich löschen (inkl. aller Tresor-PDFs, Versionen, Unterschriften, Stempel und Freigaben).
7. **Automatische 5-Minuten-Sicherung (Auto-Save):**
   - **PDF-Werkstatt Pro** sichert das aktuell geöffnete Dokument inklusive aller beweglichen Annotationen automatisch **alle 5 Minuten** im Hintergrund (im persönlichen Server-Tresor bei angemeldeten Kontoinhabern sowie lokal im Browser-IndexedDB-Speicher). In der unteren Statusleiste zeigt `⏱️ Auto-Save (5 Min.): Aktiv` jederzeit den letzten Sicherungszeitpunkt an.

---

## 12. Tastenkombinationen

| Tastenkombination | Funktion |
| :--- | :--- |
| `Strg + O` | Lokale PDF-Datei(en) öffnen |
| `Strg + S` | Aktuelles PDF speichern / herunterladen |
| `Strg + Z` | Letzte Annotation auf der aktuellen Seite rückgängig machen |
| `Entf` (`Delete`) | Ausgewähltes Element (Text, Stempel, Unterschrift, Formularfeld) löschen |
| `F1` | Benutzerhandbuch (`hilfe.php`) öffnen |
| `F11` (oder `⛶ Vollbild`) | Vollbildmodus ein-/ausschalten (blendet Browser-Elemente komplett aus) |

---

## 13. Administrator-Konfiguration (`config.php`) & Sicherheitsarchitektur

In der zentralen Datei **`config.php`** im Hauptverzeichnis kann der Administrator den SMTP-Server, die Absenderadresse, das Speicherplatz-Kontingent pro Konto sowie den Brute-Force-Schutz konfigurieren:

| Parameter in `config.php` | Standardwert | Beschreibung |
| :--- | :--- | :--- |
| `mail_from_address` | `'noreply@pdf-werkstatt.local'` | Offizielle **Absender-E-Mail-Adresse** für Passwort-Resets und Freigabe-Links |
| `mail_from_name` | `'PDF-Werkstatt Pro'` | Angezeigter **Absendername** in ausgehenden E-Mails |
| `mail_transport` | `'mail'` | `'smtp'` (direkter SMTP-Socket-Versand ab PHP 5.4+) oder `'mail'` (PHP `mail()`) |
| `smtp_host` / `smtp_port` | `''` / `587` | Hostname / IP und Port (`25`, `465`, `587`) des **SMTP-Servers** |
| `smtp_encryption` | `'tls'` | `'tls'` (STARTTLS), `'ssl'` (SMTPS) oder `'none'` |
| `smtp_auth` / `smtp_username` / `smtp_password` | `true` / `''` / `''` | SMTP-Benutzername und Passwort für `AUTH LOGIN` |
| `user_quota_mb` | `250` | Maximale **Speichergröße in MB** pro angemeldetem Kontobesitzer (`0` = unbegrenzt) |
| `public_quota_mb` | `100` | Maximale Speichergröße in MB für den öffentlichen Gast-Tresor |
| `include_versions_in_quota` | `true` | Ob automatische Dateiversionen (`versions/`) auf das Kontingent angerechnet werden |
| `max_login_attempts` / `login_lockout_seconds` | `8` / `300` | Brute-Force-Sperre nach 8 Fehlversuchen für 300 Sekunden |

### Nutzungsstatistik im Verzeichnis (`storage/nutzungsstatistik.txt` & `storage/nutzungsstatistik.json`)

Für den Administrator pflegt **PDF-Werkstatt Pro** vollautomatisch eine Nutzungsstatistik im geschützten Verzeichnis `storage/`:
- **`storage/nutzungsstatistik.txt`:** Direkt im Texteditor lesbarer Administrator-Bericht mit:
  1. **Benutzerkonten & Anmeldungen (Personen-Statistik):** Anzahl registrierter Kontoinhaber, erfolgreiche Anmeldungen (Logins) gesamt, fehlgeschlagene Anmeldeversuche, Passwort-Zurücksetzungen, Tresor-Gesamtbelegung sowie eine **Tabelle aller registrierten Konten** (Benutzername, Anzeigename, Organisation, Registrierungsdatum, letzter Login, Login-Anzahl, Tresor-Dateien & Speicherverbrauch).
  2. **Allgemeine Programmnutzung & Aufrufe:** Gestartete Arbeitssitzungen (Sessions), Aufrufe der Hauptanwendung (`index.php`), Aufrufe des Benutzerhandbuchs (`hilfe.php`) und Gesamtzahl ausgeführter PDF-Werkzeug-Aktionen.
  3. **Genutzte PDF-Werkzeuge & Funktionen im Detail:** Einzelzähler für PDF öffnen, herunterladen, verbinden, teilen, komprimieren, Sandwich-OCR, Seiten-OCR, Konverter, PDF/UA-Prüfung, PDF/UA Auto-Fix, Schwärzung (Sanitize), Bates/Kopf-/Fußzeilen, PDF-Vergleich, Unterschriften, Tresor-Speicherungen und E-Mail-Freigaben.
  4. **Monatsübersicht (`YYYY-MM`) & Tagesverlauf (letzte 30 Tage):** Zeitliche Entwicklung von Sitzungen, Seitenaufrufen, Logins, Neuregistrierungen und Werkzeug-Aktionen.
- **`storage/nutzungsstatistik.json`:** Strukturierte JSON-Rohdaten derselben Statistik.

---

## 14. Installationsanweisung, Systemvoraussetzungen & Skalierbarkeit

### 1. System- & Installationsvoraussetzungen
- **Webserver:** Apache 2.2 / 2.4 (mit `.htaccess`-Unterstützung), Nginx oder IIS
- **PHP-Version:** Voll kompatibel ab **PHP 5.4.0** über PHP 7.x bis **PHP 8.4+**
- **PHP-Erweiterungen:** Nur PHP-Standardmodule (`json`, `session`, `hash`, `mbstring` optional)
- **Keine Datenbank & keine Shell-Befehle erforderlich:** Funktioniert komplett ohne MySQL/PostgreSQL/SQLite und ohne `shell_exec`, `exec` oder Ghostscript
- **Speicherplatz:** ca. **35 MB** für das Programmpaket (inkl. deutscher & englischer Offline-OCR-Sprachdaten) zuzüglich Speicherplatz für die Benutzer-Tresore in `storage/`
- **Client-Browser:** Jeder moderne Browser (Firefox, Chrome, Edge, Safari) ohne Zusatzplugins und 100 % ohne Internetverbindung (Intranet/Air-Gapped-tauglich)

### 2. Schritt-für-Schritt-Installationsanweisung
1. **Programmdateien hochladen:** Kopieren Sie den gesamten Ordner auf Ihren Webserver (z. B. `/var/www/html/pdf-werkstatt/`), inklusive der versteckten Dateien `.htaccess` und `storage/.htaccess`.
2. **Schreibrechte für `storage/` setzen:** Stellen Sie sicher, dass der Webserver-Benutzer (z. B. `www-data`) Schreibrechte auf das Verzeichnis `storage/` besitzt (`chmod -R 750 storage/ && chown -R www-data:www-data storage/`). Fehlende Unterordner legt die Anwendung beim ersten Start automatisch an.
3. **Optional Upload-Limits prüfen (`php.ini`):** Für große mehrhundertseitige PDF-Akten empfehlen sich `upload_max_filesize = 64M`, `post_max_size = 64M` und `memory_limit = 256M`.
4. **Konfiguration (`config.php`) anpassen:** Tragen Sie optional Ihren SMTP-Mailserver (`smtp_host`, `mail_from_address`) sowie das gewünschte Kontingent (`user_quota_mb`) ein.
5. **Starten:** Rufen Sie die URL im Browser auf — **PDF-Werkstatt Pro** ist sofort einsatzbereit.

### 3. Skalierbarkeit & Lastverteilung
- **99 % Client-Side-Rechenleistung (Zero-Server-CPU-Load):** Sämtliche rechenintensiven Aufgaben (PDF-Rendering, Merge/Split, Komprimierung, sichere Schwärzung, visueller PDF-Vergleich, PDF/UA-Prüfung und **Tesseract-OCR**) laufen direkt im Browser des jeweiligen Anwender-PCs. Der Server wird bei der PDF-Bearbeitung weder durch CPU- noch durch RAM-Spitzen belastet.
- **Nutzerkapazität auf einem Standard-Webserver:**
  - **500 bis 5.000+ gleichzeitige Anwender** bei der PDF-Bearbeitung (Editor, OCR, Konverter, PDF/UA), da der Server hierbei nur statische Programmdateien ausliefert.
  - **500 bis 2.500 registrierte Tresor-Konten** (bzw. 100–300 gleichzeitig im Tresor speichernde Nutzer) ohne Datenbank-Overhead dank atomarer Dateisperren (`LOCK_EX`) und sofortiger Session-Freigabe (`session_write_close()`).

### 4. Empfohlene Server-Dimensionierung nach Nutzerzahl

| Ausbaustufe | Nutzerzahl (ca.) | CPU & RAM | Festplatte (Storage) | Empfohlener Software-Stack |
| :--- | :--- | :--- | :--- | :--- |
| **Stufe S** *(Abteilung / Kanzlei)* | bis **100 Nutzer** *(20–30 gleichzeitig)* | **2 vCPU**, **2–4 GB RAM** | **40–60 GB SSD** | Standard-Webspace oder kleine VM, Apache 2.4 + PHP 7.4/8.x |
| **Stufe M** *(Behörde / Mittelstand)* | **500 – 1.000 Nutzer** *(100–250 gleichzeitig)* | **4 vCPU**, **8 GB RAM** | **250–500 GB NVMe-SSD** | Linux-VM (Debian/Ubuntu/RHEL), Apache 2.4 / Nginx + **PHP-FPM** (`pm.max_children = 50`) + OPcache |
| **Stufe L** *(Großbehörde / Landesbetrieb)* | **2.500 – 5.000+ Nutzer** *(300–1.000+ gleichzeitig)* | **8 vCPU**, **16 GB RAM** | **1–2 TB Enterprise NVMe-SSD** | Linux-Server, Apache 2.4 (Event-MPM) / Nginx, **PHP 8.2+ FPM** (`pm.max_children = 120`, OPcache), 1 Gbit/s LAN |





