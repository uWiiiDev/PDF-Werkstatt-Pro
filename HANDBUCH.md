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
     - `🏠 Start` (Reduzierte Start-Ansicht mit Anwendungsname, Versionsnummer und `📂 PDF-Datei öffnen`)
     - `☷ Seiten-Studio` (Großflächiger Drag-&-Drop-Seitensortierer)
     - `✎ PDF-Editor` (Visueller Seiten-, Formular- & Tag-Editor)
   - Volltextsuche im PDF (`Strg+F`), `● PHP Offline-Status`, Seitenleisten-Schalter (`◧` für linke Seitenleiste, `◨` für rechtes Werkzeug-Eigenschaften-Fenster), `◐` Hell-/Dunkel-Design, `❓` Hilfe sowie `▴` Ribbon ein-/ausklappen.
2. **Ribbon-Kategorienleiste (Zeile 2):**
   - `🏠 Start` | `✎ Bearbeiten` | `📑 Seiten` | `📋 Formulare & Links` | `🛡️ Layout & Schutz` | `🔄 Konverter & OCR` | `♿ Barrierefreiheit`
3. **Ribbon-Werkzeugdeck (Zeile 3):**
   - Zeigt die zum gewählten Reiter gehörenden Werkzeuge übersichtlich ohne horizontales Scrollen an.
4. **Multi-Dokument-Tableiste:**
   - Beliebig viele PDFs gleichzeitig in Tabs öffnen, wechseln oder über `⇄ Alle Tabs verbinden` zusammenführen.
5. **Linkes Dock (`Seiten`, `Sammelmappe`) & Rechtes Werkzeug-Eigenschaften-Fenster:**
   - Links verwalten Sie Seitenminiaturen und die dokumentübergreifende Sammelmappe. Das rechte Fenster **„Werkzeug-Eigenschaften“** ist für maximale Arbeitsfläche **standardmäßig ausgeblendet** und lässt sich jederzeit über `◨` oben rechts einblenden.

---

## 3. Seiten organisieren, zusammenfügen, teilen & Sammelmappe

- **PDF zusammenfügen (`➕ Verbinden`):** Mehrere PDF-Dateien auswählen, Reihenfolge per `▲` / `▼` anpassen und zu einem neuen PDF verbinden.
- **PDF teilen & extrahieren (`✂️ Teilen`):** Seitenbereiche (z. B. `1-3, 5, 8-10`) definieren und entweder als neuen Tab öffnen, als PDF herunterladen oder **jede Seite einzeln als PDF in einem ZIP-Archiv** speichern.
- **Seiten sortieren, drehen, duplizieren & löschen (`☷ Seiten-Studio` / Reiter `📑 Seiten`):** Seiten per Drag & Drop umsortieren, um 90° nach links/rechts drehen (`⟲` / `⟳`), Reihenfolge umkehren (`⇅`), aktuelle Seite duplizieren (`⧉`), als Einzel-PDF auskoppeln oder leere DIN-A4-Seiten einfügen.
- **Sammelmappe (`🗂️`):** Einzelne Seiten aus verschiedenen geöffneten Dokument-Tabs sammeln und per Klick auf *„Neues PDF aus Sammelmappe öffnen“* zu einer neuen Datei zusammenstellen.

---

## 4. Visueller PDF-Editor, Originaltext direkt umschreiben, Stempel & Unterschrift

Im Reiter **`✎ Bearbeiten`** stehen folgende Werkzeuge bereit:
- **`↖ Auswahl`:** Platzierte Elemente anklicken, frei mit der Maus verschieben, per Doppelklick bearbeiten oder mit `Entf` löschen.
- **`I✎ Text ändern` (Originaltext im PDF direkt umschreiben):** Erkennt automatisch alle eingebetteten Textzeilen im PDF und markiert sie mit einem feinen blauen Rahmen. Ein Klick auf eine beliebige Textzeile liest den vorhandenen Originaltext samt Position und Schriftgröße automatisch aus, blendet den alten Text an dieser Stelle sauber aus und ersetzt ihn passgenau durch Ihren neuen Text (Schriftgröße und Farbe im rechten Eigenschaften-Fenster `◨` live anpassbar).
- **`T+ Neuer Text`:** Freitext mit wählbarer Schriftgröße und Farbe an beliebiger freier Stelle auf der Seite platzieren.
- **`✒️ Stift` & `🖍️ Marker`:** Freihand-Zeichnungen und halbtransparente Textmarker-Hervorhebungen.
- **`▭ Rahmen` & `🖼️ Bild`:** Farbige Rechteck-Rahmen zeichnen oder Bilddateien (PNG/JPG/WebP) auf der Seite einfügen.
- **`🏷️ Stempel`:** Behörden- und Büro-Stempel (`BEZAHLT`, `GENEHMIGT`, `VERTRAULICH`, `ENTWURF`, `KOPIE`, `GEPRÜFT`, `EINGEGANGEN AM [Datum]`) platzieren.
- **`✍️ Signatur`:** Eigenhändige Unterschrift per Maus/Finger zeichnen oder als Schreibschrift generieren und auf der Seite platzieren.
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
  - **Bates-Nummerierung:** Fügt juristische/behördliche Aktenzeichen-Nummern (z. B. `AZ-2026-000001`) oben rechts auf allen Seiten ein.
  - **3-spaltige Kopf- & Fußzeilen:** Gleichzeitiges Beschriften von Kopfzeile (Links, Mitte, Rechts) und Fußzeile (Links, Mitte, Rechts) mit den Platzhaltern `{page}`, `{total}`, `{date}` und `{file}`.

---

## 8. PDF-Vergleich (Visueller Pixel-Diff & Text-Abgleich)

Über **`🏠 Start → ⚖️ Vergleichen`**:
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

## 10. Barrierefreiheit (PDF/UA-1, PAC 2026, BITV 2.0 & WCAG 2.1/2.2)

Im Reiter **`♿ Barrierefreiheit`**:
1. **`♿ PDF/UA Prüfung` (12-Punkte-Audit nach PAC 2026 & WCAG 2.1):**
   Prüft Dokumenttitel (`/Title` & `dc:title`), `DisplayDocTitle`, Dokumentsprache (`/Lang`), Tagged-Status (`/Marked true`), vollständigen Content-Tagging-Baum (`/StructTreeRoot`, `/ParentTree` & `MCID`s), PDF/UA-XMP-Kennung (`pdfuaid:part=1`), auslesbaren Textstrom, Schrifteinbettung inkl. `/ToUnicode` & `/Widths`-Metriken, Tabellen-Kopfzellen (`/TH` & `/Scope`), Alternativtexte für Abbildungen (`<Figure> /Alt` & `/BBox`) und Formularfelder (`/TU`), Text-Farbkontrast (mind. 4,5:1 nach WCAG 1.4.3) & Tab-Reihenfolge (`/Tabs /S`) sowie Lesezeichen (`/Outlines`).
2. **`⚡ Auto-Fix PDF/UA` (1-Klick Reparatur inkl. automatischer Offline-OCR):**
   Rüstet alle fehlenden Metadaten, `ViewerPreferences`, Sprache, `MarkInfo`, XMP-PDF/UA-Streams, TrueType-Schrifteinbettung (Liberation Sans), `/Widths`-Metriken, Mindestkontraste (4,5:1), `/Tabs /S`, Lesezeichen und den vollständigen getaggten Strukturbaum (`/StructTreeRoot` + `MCID`s) automatisch im PDF nach. Bei reinen Bild-Scans führt der Auto-Fix automatisch vorab die lokale Offline-OCR durch.
3. **Visueller Tag- & Alternativtext-Editor (`H1 Tag`, `H2 Tag`, `P Absatz`, `🖼️ Alt-Text`):**
   Markieren Sie Überschriften, Absätze oder Abbildungen direkt auf der Seite und hinterlegen Sie für Grafiken/Stempel/Unterschriften einen **Alternativtext (`/Alt`)**.
4. **`📄 Prüfbericht PDF`:**
   Erstellt ein mehrseitiges PDF-Prüfprotokoll über alle 12 Barrierefreiheits-Kriterien.

---

## 11. Automatische 5-Minuten-Sicherung (Lokaler Auto-Save)

- **PDF-Werkstatt Pro** sichert das aktuell geöffnete Dokument inklusive aller beweglichen Annotationen und Barrierefreiheits-Tags automatisch **alle 5 Minuten** im Hintergrund lokal im Browser (`IndexedDB`).
- In der unteren Statusleiste zeigt `⏱️ Auto-Save (5 Min.): Aktiv` jederzeit den letzten Sicherungszeitpunkt an. Nach einem Neustart kann der Stand über `🔄 Auto-Save wiederherstellen` sofort wieder geladen werden.

---

## 12. Tastenkombinationen

| Tastenkombination | Funktion |
| :--- | :--- |
| `Strg + O` | Lokale PDF-Datei(en) öffnen |
| `Strg + S` | Aktuelles PDF speichern / herunterladen |
| `Strg + F` | Volltextsuche im PDF-Dokument |
| `Strg + Z` | Letzte Annotation auf der aktuellen Seite rückgängig machen |
| `Entf` (`Delete`) | Ausgewähltes Element (Text, Stempel, Unterschrift, Formularfeld) löschen |
| `F1` | Benutzerhandbuch (`hilfe.php`) öffnen |
| `F11` (oder `⛶ Vollbild`) | Vollbildmodus ein-/ausschalten (blendet Browser-Elemente komplett aus) |
| Button `◨` oben rechts | Rechtes Fenster „Werkzeug-Eigenschaften“ (standardmäßig ausgeblendet) ein-/ausblenden |

---

## 13. Sicherheitsarchitektur & Anonyme Nutzungsstatistik

- **100 % Lokale Dokumentenverarbeitung im Browser:** Geöffnete PDF-Akten verbleiben während der gesamten Bearbeitung im Arbeitsspeicher Ihres Browsers.
- **Verzeichnis-Abschottung (`.htaccess`):** Direkter HTTP-Zugriff auf `config.php`, `includes/` und `storage/` ist auf Webserver-Ebene gesperrt (`403 Forbidden`).
- **Anonyme Nutzungsstatistik (`storage/nutzungsstatistik.txt` & `storage/nutzungsstatistik.json`):** Zeigt dem Administrator Sitzungen, Seitenaufrufe und genutzte PDF-Werkzeuge im Zeitverlauf.

---

## 14. Installationsanweisung, Systemvoraussetzungen & Skalierbarkeit

### 1. System- & Installationsvoraussetzungen
- **Webserver:** Apache 2.2 / 2.4 (mit `.htaccess`-Unterstützung), Nginx oder IIS
- **PHP-Version:** Voll kompatibel ab **PHP 5.4.0** über PHP 7.x bis **PHP 8.4+**
- **Keine Datenbank & keine Shell-Befehle erforderlich:** Funktioniert komplett ohne MySQL/PostgreSQL/SQLite und ohne `shell_exec`, `exec` oder Ghostscript
- **Speicherplatz:** ca. **35 MB** für das Programmpaket (inkl. deutscher & englischer Offline-OCR-Sprachdaten sowie TrueType-Schriften)
- **Client-Browser:** Jeder moderne Browser (Firefox, Chrome, Edge, Safari) ohne Zusatzplugins und 100 % ohne Internetverbindung (Intranet/Air-Gapped-tauglich)

### 2. Schritt-für-Schritt-Installationsanweisung
1. **Programmdateien hochladen:** Kopieren Sie den gesamten Ordner auf Ihren Webserver (z. B. `/var/www/html/pdf-werkstatt/`), inklusive `.htaccess` und `storage/.htaccess`.
2. **Schreibrechte für `storage/` setzen:** Stellen Sie sicher, dass der Webserver-Benutzer (z. B. `www-data`) Schreibrechte auf das Verzeichnis `storage/` besitzt (`chmod -R 750 storage/ && chown -R www-data:www-data storage/`).
3. **Starten:** Rufen Sie die URL im Browser auf — **PDF-Werkstatt Pro** ist sofort einsatzbereit.






