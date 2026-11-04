<?php
/**
 * PDF-Werkstatt Pro (v1.0) - Umfassende Hilfedatei & Benutzerhandbuch
 * 100% Offline, kompatibel ab PHP 5.4+
 */
require_once __DIR__ . '/includes/bootstrap.php';
pdfstudio_record_stat('help_view');
$serverInfo = pdfstudio_get_server_info();
?><!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Hilfe &amp; Benutzerhandbuch — PDF-Werkstatt Pro v<?php echo htmlspecialchars(PDFSTUDIO_VERSION, ENT_QUOTES, 'UTF-8'); ?></title>
    <link rel="stylesheet" href="assets/css/desktop.css?v=<?php echo urlencode(PDFSTUDIO_VERSION) . '.' . (int)@filemtime(__DIR__ . '/assets/css/desktop.css'); ?>">
    <style>
        html, body {
            overflow-y: auto !important;
            overflow-x: hidden !important;
            height: auto !important;
            min-height: 100vh;
            scroll-behavior: smooth;
            user-select: text !important;
            background: var(--bg-app);
            color: var(--text-primary);
        }
        .help-topbar {
            position: sticky;
            top: 0;
            z-index: 100;
            background: var(--bg-menubar);
            border-bottom: 1px solid var(--border-subtle);
            padding: 10px 24px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 16px;
            flex-wrap: wrap;
        }
        .help-layout {
            display: grid;
            grid-template-columns: 280px 1fr;
            max-width: 1380px;
            margin: 0 auto;
            gap: 28px;
            padding: 24px 24px 72px;
            align-items: start;
        }
        .help-toc {
            position: sticky;
            top: 72px;
            background: var(--bg-sidebar);
            border: 1px solid var(--border-subtle);
            border-radius: 10px;
            padding: 14px;
            max-height: calc(100vh - 96px);
            overflow-y: auto;
        }
        .help-toc-title {
            font-size: 11.5px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.6px;
            color: var(--text-secondary);
            margin-bottom: 10px;
        }
        .help-toc a {
            display: block;
            padding: 7px 10px;
            border-radius: 6px;
            color: var(--text-primary);
            text-decoration: none;
            font-size: 12.5px;
            margin-bottom: 3px;
            transition: background 0.14s, color 0.14s;
        }
        .help-toc a:hover,
        .help-toc a.active {
            background: var(--accent-soft);
            color: var(--accent-primary);
            font-weight: 600;
        }
        .help-content {
            display: flex;
            flex-direction: column;
            gap: 22px;
        }
        .help-card {
            background: var(--bg-sidebar);
            border: 1px solid var(--border-subtle);
            border-radius: 10px;
            padding: 22px 26px;
            scroll-margin-top: 84px;
        }
        .help-card h2 {
            font-size: 18px;
            font-weight: 700;
            margin-bottom: 10px;
            color: var(--text-primary);
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            padding-bottom: 10px;
            border-bottom: 1px solid var(--border-subtle);
        }
        .help-top-link {
            font-size: 11.5px;
            font-weight: 600;
            color: var(--text-secondary);
            text-decoration: none;
            padding: 3px 8px;
            border-radius: 5px;
            border: 1px solid var(--border-subtle);
            background: var(--bg-card);
            cursor: pointer;
            white-space: nowrap;
        }
        .help-top-link:hover {
            color: var(--accent-primary);
            border-color: var(--accent-primary);
        }
        .help-floating-top {
            position: fixed;
            right: 24px;
            bottom: 24px;
            z-index: 120;
            padding: 8px 14px;
            border-radius: 999px;
            background: var(--accent-primary);
            color: #fff;
            border: none;
            font-weight: 700;
            font-size: 12.5px;
            cursor: pointer;
            box-shadow: var(--shadow-lg);
            display: none;
            align-items: center;
            gap: 6px;
        }
        .help-floating-top.visible {
            display: inline-flex;
        }
        .help-card h3 {
            font-size: 14px;
            font-weight: 700;
            margin: 16px 0 6px;
            color: var(--accent-primary);
        }
        .help-card p, .help-card li {
            font-size: 13px;
            line-height: 1.65;
            color: var(--text-secondary);
        }
        .help-card ul, .help-card ol {
            padding-left: 20px;
            margin: 6px 0 12px;
        }
        .help-card li strong {
            color: var(--text-primary);
        }
        .help-grid-2 {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(290px, 1fr));
            gap: 14px;
            margin-top: 12px;
        }
        .help-feature-box {
            background: var(--bg-card);
            border: 1px solid var(--border-subtle);
            border-radius: 8px;
            padding: 13px 15px;
        }
        .help-feature-box h4 {
            font-size: 13px;
            font-weight: 700;
            color: var(--text-primary);
            margin-bottom: 5px;
        }
        .help-badge {
            display: inline-block;
            padding: 2px 8px;
            font-size: 11px;
            font-weight: 700;
            border-radius: 999px;
            background: var(--accent-soft);
            color: var(--accent-primary);
        }
        .kbd {
            display: inline-block;
            padding: 2px 7px;
            font-family: var(--font-mono);
            font-size: 11.5px;
            background: var(--bg-input);
            border: 1px solid var(--border-strong);
            border-radius: 4px;
            color: var(--text-primary);
        }
        .help-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 10px;
            font-size: 12.5px;
        }
        .help-table th, .help-table td {
            border: 1px solid var(--border-subtle);
            padding: 8px 12px;
            text-align: left;
        }
        .help-table th {
            background: var(--bg-card);
            color: var(--text-primary);
            font-weight: 700;
        }
        @media (max-width: 900px) {
            .help-layout {
                grid-template-columns: 1fr;
            }
            .help-toc {
                position: static;
                max-height: none;
            }
        }
        @media print {
            .help-topbar, .help-toc {
                display: none !important;
            }
            .help-layout {
                grid-template-columns: 1fr;
                padding: 0;
            }
            body {
                background: #fff;
                color: #000;
            }
            .help-card, .help-feature-box {
                border-color: #ccc;
                background: #fff;
                color: #000;
                break-inside: avoid;
            }
        }
    </style>
</head>
<body class="theme-dark">

<header class="help-topbar">
    <div style="display:flex;align-items:center;gap:12px;">
        <div class="app-brand">
            <span class="app-brand-badge">PDF</span>
            <span>PDF-Werkstatt Pro — Benutzerhandbuch &amp; Funktionsreferenz</span>
        </div>
        <span class="help-badge">Version <?php echo htmlspecialchars(PDFSTUDIO_VERSION, ENT_QUOTES, 'UTF-8'); ?> • 100% Offline</span>
    </div>

    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
        <input type="search" id="helpSearchInput" class="form-control" placeholder="🔍 Funktion im Handbuch suchen (z. B. OCR, Auto-Save, Schwärzen, Bates, PDF/UA)…" style="width:320px;">
        <button type="button" class="tool-btn" id="btnHelpThemeToggle">◐ Hell/Dunkel</button>
        <button type="button" class="tool-btn" id="btnHelpPrint">🖨️ Handbuch drucken / Als PDF</button>
        <a href="index.php" class="tool-btn btn-primary" style="text-decoration:none;">← Zurück zu PDF-Werkstatt Pro</a>
    </div>
</header>

<div class="help-layout">
    <!-- TABLE OF CONTENTS -->
    <nav class="help-toc">
        <div class="help-toc-title">Inhaltsverzeichnis</div>
        <a href="#kap1">1. Überblick &amp; Offline-Architektur</a>
        <a href="#kap2">2. Oberfläche, Ribbon &amp; Ansichten</a>
        <a href="#kap3">3. Seiten sortieren, teilen &amp; verbinden</a>
        <a href="#kap4">4. PDF-Editor, Stempel &amp; Signatur</a>
        <a href="#kap5">5. Sicheres Schwärzen &amp; Schutz</a>
        <a href="#kap6">6. Formulare (AcroForms) &amp; Links</a>
        <a href="#kap7">7. Zuschnitt, Bates &amp; Kopf-/Fußzeile</a>
        <a href="#kap8">8. Visueller &amp; Text-PDF-Vergleich</a>
        <a href="#kap9">9. Konverter &amp; Durchsuchbares OCR</a>
        <a href="#kap10">10. Barrierefreiheit (PDF/UA &amp; WCAG)</a>
        <a href="#kap11">11. Automatische 5-Min.-Sicherung</a>
        <a href="#kap12">12. Tastenkombinationen</a>
        <a href="#kap13">13. Sicherheitsarchitektur &amp; Statistik</a>
        <a href="#kap14">14. Installation &amp; Skalierbarkeit</a>
    </nav>

    <!-- MAIN DOCUMENTATION CONTENT -->
    <main class="help-content" id="helpSectionsContainer">

        <!-- KAPITEL 1 -->
        <section class="help-card" id="kap1">
            <h2>1. Überblick &amp; 100 % Offline-Architektur</h2>
            <p>
                <strong>PDF-Werkstatt Pro (Version <?php echo htmlspecialchars(PDFSTUDIO_VERSION, ENT_QUOTES, 'UTF-8'); ?>)</strong> ist eine vollständige Desktop-PDF-Suite für den Browser. Sie vereint sämtliche Werkzeuge zum Organisieren, Bearbeiten, Unterschreiben, Schwärzen, Vergleichen, Konvertieren, Texterkennen (Sandwich-OCR) sowie zur Prüfung und Herstellung der Barrierefreiheit nach <strong>PDF/UA-1 (ISO 14289-1 / PAC 2026)</strong> und <strong>BITV 2.0 / WCAG 2.1</strong>.
            </p>
            <div class="help-grid-2">
                <div class="help-feature-box">
                    <h4>🔒 100 % Offline &amp; Behörden-/Intranet-tauglich</h4>
                    <p>Es werden keinerlei externe Bibliotheken, Schriften oder Skripte aus dem Internet nachgeladen. Alle Engines (PDF-Lib, PDF.js, Tesseract-OCR inklusive deutscher und englischer Sprachmodelle, Mammoth DOCX, SheetJS XLSX, JSZip) liegen lokal im Ordner <code>assets/vendor/</code>.</p>
                </div>
                <div class="help-feature-box">
                    <h4>⚙️ Reiner Webspace-Betrieb ohne Datenbank &amp; ohne Login-Zwang</h4>
                    <p>Die Anwendung benötigt weder Root-Rechte noch Kommandozeilen-Aufrufe (kein <code>shell_exec</code> oder <code>exec</code>), keine Benutzerkonten und keine Datenbank. Alle PDF-Bearbeitungen erfolgen direkt und datenschutzkonform im Arbeitsspeicher des Browsers.</p>
                </div>
            </div>
        </section>

        <!-- KAPITEL 2 -->
        <section class="help-card" id="kap2">
            <h2>2. Arbeitsoberfläche, Ribbon-Menü &amp; Ansichtsmodi</h2>
            <p>Die Oberfläche ist wie eine moderne Desktop-Anwendung in 5 Bereiche gegliedert:</p>
            <ul>
                <li><strong>Fenster-Titelleiste (Zeile 1):</strong> Schnellzugriff (Öffnen, Speichern, Rückgängig), Umschalter für die 3 Hauptansichten (<code>🏠 Start</code>, <code>☷ Seiten-Studio</code>, <code>✎ PDF-Editor</code>), Volltextsuche im PDF (<span class="kbd">Strg</span>+<span class="kbd">F</span>), Seitenleisten-Schalter (<code>◧</code> für die linke Seitenleiste, <code>◨</code> für das rechte Werkzeug-Eigenschaften-Fenster), Vollbild-Schalter (<code>⛶</code>) sowie Hell-/Dunkel-Modus (<code>◐</code>).</li>
                <li><strong>Aufgeräumte Start-Ansicht (<code>🏠 Start</code>):</strong> Zeigt im Hauptbereich bewusst reduziert nur das zentrale Willkommens-Banner mit Anwendungsname, Versionsnummer und dem direkten Button <strong><code>📂 PDF-Datei öffnen</code></strong> (sowie Drag &amp; Drop für PDF- und Bilddateien).</li>
                <li><strong>Ribbon-Kategorienleiste &amp; Werkzeugdeck (Zeile 2 &amp; 3):</strong> 7 übersichtliche Reiter (<code>🏠 Start</code>, <code>✎ Bearbeiten</code>, <code>📑 Seiten</code>, <code>📋 Formulare &amp; Links</code>, <code>🛡️ Layout &amp; Schutz</code>, <code>🔄 Konverter &amp; OCR</code>, <code>♿ Barrierefreiheit</code>) zeigen passend zum gewählten Reiter die beschrifteten Werkzeug-Schaltflächen an. Mit dem Pfeil <code>▴</code> rechts oben lässt sich das Ribbon-Deck bei Bedarf einklappen.</li>
                <li><strong>Multi-Dokument-Tableiste:</strong> Sie können beliebig viele PDF-Dokumente gleichzeitig in Tabs geöffnet halten, zwischen ihnen wechseln oder über <code>⇄ Alle Tabs verbinden</code> zu einer einzigen Akte zusammenführen.</li>
                <li><strong>Linkes Dock, standardmäßig ausgeblendetes Werkzeug-Eigenschaften-Fenster &amp; Statusleiste:</strong> Links befinden sich die Seiten-Miniaturansichten (<code>Seiten</code>) und die dokumentübergreifende <code>Sammelmappe</code>. Das rechte Fenster <strong>„Werkzeug-Eigenschaften“</strong> ist für maximale Arbeitsfläche <strong>standardmäßig ausgeblendet</strong> und kann jederzeit über das Symbol <code>◨</code> oben rechts in der Titelleiste eingeblendet werden. In der unteren Statusleiste sehen und steuern Sie die <strong>automatische 5-Minuten-Sicherung (<code>⏱️ Auto-Save (5 Min.): Aktiv</code>)</strong>.</li>
            </ul>
        </section>

        <!-- KAPITEL 3 -->
        <section class="help-card" id="kap3">
            <h2>3. Seiten organisieren, zusammenfügen, teilen &amp; Sammelmappe</h2>
            <div class="help-grid-2">
                <div class="help-feature-box">
                    <h4>➕ PDFs zusammenfügen (Merge)</h4>
                    <p>Über <strong>Start → Verbinden</strong> oder <strong>Seiten → PDF anfügen</strong> wählen Sie beliebig viele PDF-Dateien aus, passen die Reihenfolge per <code>▲</code> / <code>▼</code> an und kombinieren diese zu einem neuen PDF.</p>
                </div>
                <div class="help-feature-box">
                    <h4>✂️ PDF teilen &amp; Seiten extrahieren (Split)</h4>
                    <p>Über <strong>Start → Teilen</strong> geben Sie Seitenbereiche wie <code>1-3, 5, 8-10</code> an. Sie können die Auswahl als neuen Tab öffnen, direkt als PDF herunterladen oder <strong>jede Seite einzeln als PDF in einem ZIP-Archiv</strong> exportieren.</p>
                </div>
                <div class="help-feature-box">
                    <h4>☷ Seiten-Studio (Drag &amp; Drop Sortierung)</h4>
                    <p>Wechseln Sie oben in das <strong>Seiten-Studio</strong> oder nutzen Sie die linke Seitenleiste: Ziehen Sie Seiten per Maus an eine neue Position, drehen Sie einzelne oder alle Seiten um 90° (<code>⟲</code> / <code>⟳</code>), kehren Sie die Seitenreihenfolge um (<code>⇅</code>), duplizieren Sie Seiten oder fügen Sie leere DIN-A4-Seiten ein.</p>
                </div>
                <div class="help-feature-box">
                    <h4>🗂️ Dokumentübergreifende Sammelmappe</h4>
                    <p>Legen Sie einzelne Seiten aus verschiedenen geöffneten PDF-Tabs per Klick auf <code>+</code> in die <strong>Sammelmappe</strong> (linkes Dock). Mit einem Klick auf <strong>„Neues PDF aus Sammelmappe öffnen“</strong> entsteht daraus ein neues Gesamtdokument.</p>
                </div>
            </div>
        </section>

        <!-- KAPITEL 4 -->
        <section class="help-card" id="kap4">
            <h2>4. Visueller PDF-Editor, Originaltext direkt umschreiben, Stempel &amp; Unterschrift</h2>
            <p>Im Reiter <strong>✎ Bearbeiten</strong> stehen Ihnen folgende interaktive Werkzeuge zur Verfügung:</p>
            <ul>
                <li><strong>↖ Auswahl / Verschieben:</strong> Klicken Sie ein platziertes Element (geänderter Text, neuer Text, Unterschrift, Stempel, Rahmen, Formularfeld) an, um es frei mit der Maus auf der Seite zu verschieben, per <strong>Doppelklick</strong> den Text nachträglich zu ändern oder mit <span class="kbd">Entf</span> zu löschen.</li>
                <li><strong>I✎ Text ändern (Vorhandenen Originaltext im PDF direkt umschreiben):</strong> Sobald Sie dieses Werkzeug aktivieren, erkennt <strong>PDF-Werkstatt Pro</strong> automatisch alle eingebetteten Textzeilen auf der PDF-Seite und hebt sie mit einem feinen blauen Rahmen hervor. Klicken Sie einfach auf eine beliebige Textzeile im PDF: Der vorhandene Originaltext wird automatisch ausgelesen, im Eingabedialog vorausgefüllt und beim Bestätigen passgenau an Ort und Stelle durch Ihren neuen Text ersetzt (oder bei leerer Eingabe rückstandsfrei ausgeblendet). Schriftgröße und Textfarbe werden automatisch erkannt und lassen sich im rechten Werkzeug-Eigenschaften-Fenster (<code>◨</code>) live anpassen!</li>
                <li><strong>T+ Neuer Text:</strong> Klicken Sie auf eine beliebige freie Stelle im Dokument, um neuen Text einzufügen. Schriftgröße und Farbe lassen sich rechts im Werkzeug-Eigenschaften-Fenster (<code>◨</code>) einstellen.</li>
                <li><strong>✒️ Freihand-Stift &amp; 🖍️ Textmarker:</strong> Zeichnen Sie direkt auf der PDF-Seite oder heben Sie Textpassagen farbig halbtransparent hervor.</li>
                <li><strong>▭ Rahmen / Rechteck &amp; 🖼️ Bild einfügen:</strong> Platzieren Sie farbige Hinweisrahmen oder fügen Sie beliebige Bilder (PNG/JPG/WebP, z. B. Logos oder Scans) frei skalier- und verschiebbar auf der Seite ein.</li>
                <li><strong>🏷️ Stempel-Werkzeug:</strong> Wählen Sie im rechten Werkzeug-Eigenschaften-Fenster (<code>◨</code>) einen Stempel (<code>BEZAHLT</code>, <code>GENEHMIGT</code>, <code>VERTRAULICH</code>, <code>ENTWURF</code>, <code>KOPIE</code>, <code>GEPRÜFT</code>, <code>EINGEGANGEN AM [Datum]</code>) und klicken Sie auf die Seite.</li>
                <li><strong>✍️ Unterschrift:</strong> Zeichnen Sie Ihre Signatur mit der Maus/Touchpad oder generieren Sie eine Schreibschrift-Signatur durch Namenseingabe und platzieren Sie diese frei verschiebbar auf der PDF-Seite.</li>
                <li><strong>✔ Fest einbetten:</strong> Solange Sie im Editor arbeiten, bleiben Elemente frei verschiebbar. Beim Download, Drucken oder Klick auf <code>✔ Fest einbetten</code> werden sie dauerhaft in das PDF geschrieben.</li>
            </ul>
        </section>

        <!-- KAPITEL 5 -->
        <section class="help-card" id="kap5">
            <h2>5. Sicheres Schwärzen (Sanitize), Wasserzeichen &amp; Komprimierung</h2>
            <div class="help-grid-2">
                <div class="help-feature-box">
                    <h4>██ Schwärzen &amp; 🛡️ Sicher schwärzen (Sanitize)</h4>
                    <p>
                        <strong>Schritt 1:</strong> Wählen Sie unter <em>Bearbeiten</em> das Werkzeug <code>██ Schwärzen</code> und ziehen Sie schwarze Balken über sensible Textstellen (Personendaten, Aktenzeichen, Kontonummern).<br>
                        <strong>Schritt 2 (Wichtig für Behörden):</strong> Klicken Sie auf <code>🛡️ Sicher schwärzen</code>. Dadurch wird die Seite kryptografisch sauber gerastert, sodass der darunterliegende Textstrom <strong>physisch aus der PDF-Datei gelöscht</strong> wird und nicht mehr per Copy &amp; Paste oder Drittprogrammen auslesbar ist.
                    </p>
                </div>
                <div class="help-feature-box">
                    <h4>💧 Wasserzeichen &amp; 📉 PDF komprimieren</h4>
                    <p>
                        <strong>Wasserzeichen:</strong> Im Reiter <em>Layout &amp; Schutz</em> (bzw. im rechten Eigenschaften-Fenster) bringen Sie diagonale Wasserzeichen mit wählbarer Deckkraft und Schriftgröße auf alle Seiten auf.<br>
                        <strong>Komprimieren:</strong> Verkleinern Sie große PDF-Dateien in 3 Qualitätsstufen (<em>Stark komprimieren 96 DPI</em>, <em>Ausgewogen 140 DPI</em>, <em>Hohe Qualität 200 DPI</em>) inklusive Vorher-/Nachher-Größenvergleich.
                    </p>
                </div>
            </div>
        </section>

        <!-- KAPITEL 6 -->
        <section class="help-card" id="kap6">
            <h2>6. Interaktive Formulare (AcroForms) &amp; Hyperlinks</h2>
            <p>Im Reiter <strong>📋 Formulare &amp; Links</strong> erstellen und bearbeiten Sie echte PDF-Formularfelder nach PDF-Standard:</p>
            <ul>
                <li><strong>🔤 Textfeld (<code>form-text</code>):</strong> Ziehen Sie auf der Seite ein ausfüllbares Textfeld auf und vergeben Sie Feldname sowie optionalen Standardwert.</li>
                <li><strong>☑️ Checkbox (<code>form-check</code>):</strong> Fügt ein anklickbares Kontrollkästchen ein (inkl. Wahl, ob standardmäßig angehakt).</li>
                <li><strong>▾ Dropdown-Auswahlliste (<code>form-select</code>):</strong> Erzeugt ein Auswahlmenü mit frei definierbaren Optionen (kommagetrennt, z. B. <code>Ja, Nein, In Prüfung</code>).</li>
                <li><strong>🔗 Link einfügen (<code>link</code>):</strong> Ziehen Sie einen klickbaren Bereich über beliebige Stellen im PDF, der entweder eine externe Webseite (<code>https://...</code>) öffnet oder direkt zu einer bestimmten Seite im Dokument (z. B. <code>Seite 3</code>) springt.</li>
                <li><strong>🔒 Formular sperren (Flatten):</strong> Wandelt alle ausfüllbaren Formularfelder dauerhaft in statischen Seitentext um, sodass nachträgliche Änderungen durch Empfänger ausgeschlossen sind.</li>
            </ul>
        </section>

        <!-- KAPITEL 7 -->
        <section class="help-card" id="kap7">
            <h2>7. Seiten zuschneiden (Crop), Bates-Nummerierung &amp; Kopf-/Fußzeilen</h2>
            <div class="help-grid-2">
                <div class="help-feature-box">
                    <h4>📐 Seiten zuschneiden (CropBox / MediaBox)</h4>
                    <p>Über <strong>Layout &amp; Schutz → Zuschneiden</strong> geben Sie millimetergenau (in <code>mm</code>) an, wie viel vom oberen, unteren, linken oder rechten Rand auf der aktuellen Seite oder allen Seiten entfernt werden soll (ideal zum Entfernen von Scan-Rändern oder Lochmarken).</p>
                </div>
                <div class="help-feature-box">
                    <h4>🔢 Juristische / Behördliche Bates-Nummerierung</h4>
                    <p>Über <strong>Layout &amp; Schutz → Kopf/Fuß &amp; Bates</strong> versehen Sie Akten mit einer eindeutigen, mehrstelligen Bates-Nummerierung (z. B. Präfix <code>AZ-2026-</code>, Startnummer <code>1</code>, 6 Stellen → <code>AZ-2026-000001</code>). Nach dem Anwenden wird die nächste fortlaufende Startnummer für weitere Dokumente automatisch hochgezählt.</p>
                </div>
            </div>
            <h3>📑 Dreispaltige Kopf- &amp; Fußzeilen</h3>
            <p>
                Im selben Dialog können Sie Kopfzeile (Links, Mitte, Rechts) und Fußzeile (Links, Mitte, Rechts) gleichzeitig auf alle Seiten anwenden. Unterstützte dynamische Platzhalter:
                <code>{page}</code> (aktuelle Seitenzahl), <code>{total}</code> (Gesamtseitenzahl), <code>{date}</code> (Tagesdatum) und <code>{file}</code> (Dateiname).
            </p>
        </section>

        <!-- KAPITEL 8 -->
        <section class="help-card" id="kap8">
            <h2>8. PDF-Vergleich (Visueller Pixel-Diff &amp; Text-Abgleich)</h2>
            <p>
                Über <strong>Start → Vergleichen</strong> öffnen Sie den <strong>PDF-Vergleich</strong>:
            </p>
            <ul>
                <li>Wählen Sie <strong>Dokument A (Basis)</strong> und <strong>Dokument B (Vergleichsdokument)</strong> aus Ihren geöffneten Tabs oder laden Sie eine zweite PDF-Datei dazu.</li>
                <li><strong>Visueller Pixel-Diff:</strong> Beide Dokumente werden nebeneinander dargestellt; in der dritten Spalte werden sämtliche optischen Abweichungen (geänderte Zahlen, verschobene Absätze, hinzugefügte Unterschriften/Stempel) <strong>leuchtend rot hervorgehoben</strong> und prozentual ausgewertet.</li>
                <li><strong>Zeilenweiser Text-Diff:</strong> Darunter zeigt der Text-Abgleich genau an, welche Textzeilen in Dokument B hinzugefügt (grün <code>+</code>) oder gegenüber Dokument A entfernt (rot <code>-</code>) wurden.</li>
            </ul>
        </section>

        <!-- KAPITEL 9 -->
        <section class="help-card" id="kap9">
            <h2>9. Konverter (Office/Bilder) &amp; Durchsuchbares Sandwich-OCR</h2>
            <div class="help-grid-2">
                <div class="help-feature-box">
                    <h4>🔄 Import: Bilder, Word (.docx), Excel (.xlsx), HTML &amp; Text → PDF</h4>
                    <p>
                        Über <strong>Konverter &amp; OCR → Bilder → PDF</strong> wandeln Sie mehrere JPG/PNG/WebP-Fotos in ein mehrseitiges PDF um.<br>
                        Über <strong>Office/Text → PDF</strong> lesen Sie Word-Dokumente (<code>.docx</code>), Excel-/CSV-Tabellen (<code>.xlsx</code>, <code>.xls</code>, <code>.csv</code>), HTML-Dateien oder Markdown/Text komplett offline ein, können den Inhalt vorab prüfen und als PDF-Tab erzeugen.
                    </p>
                </div>
                <div class="help-feature-box">
                    <h4>🔎 Sandwich-OCR: In durchsuchbares PDF umwandeln</h4>
                    <p>
                        Wenn Sie ein gescanntes PDF oder Bild-PDF vorliegen haben, in dem man keinen Text markieren oder suchen kann, klicken Sie im Reiter <strong>Konverter &amp; OCR</strong> auf <strong><code>🔎 Durchsuchbares PDF</code></strong>:<br>
                        Die lokale Offline-OCR-Engine (Deutsch/Englisch) erkennt alle Wörter samt ihren exakten Koordinaten und legt sie als <strong>unsichtbare, durchsuchbare Textebene</strong> passgenau über das Originalbild. Das Aussehen bleibt 1:1 erhalten, aber das PDF ist sofort per <span class="kbd">Strg</span>+<span class="kbd">F</span> durchsuchbar, kopierbar und für Screenreader lesbar!
                    </p>
                </div>
            </div>
        </section>

        <!-- KAPITEL 10 -->
        <section class="help-card" id="kap10">
            <h2>10. Barrierefreiheit (PDF/UA-1, PAC 2026, BITV 2.0 &amp; WCAG 2.1/2.2)</h2>
            <p>
                Im Reiter <strong>♿ Barrierefreiheit</strong> prüfen und reparieren Sie PDF-Dokumente für Screenreader und behördliche Barrierefreiheits-Vorgaben (Matterhorn-Protokoll &amp; WCAG):
            </p>
            <h3>1. 12-Punkte PDF/UA-1- &amp; WCAG-Prüfung (<code>♿ PDF/UA Prüfung</code>)</h3>
            <p>Das System analysiert das Dokument automatisch auf alle 12 Prüfkriterien analog zum PAC-Prüfwerkzeug:</p>
            <ol>
                <li><strong>Dokumenttitel (<code>/Title</code> &amp; XMP <code>dc:title</code>, WCAG 2.4.2):</strong> Aussagekräftiger Titel statt bloßem Dateinamen.</li>
                <li><strong>Fenstertitel-Anzeige (<code>/ViewerPreferences /DisplayDocTitle true</code>, Matterhorn 06-004):</strong> Screenreader lesen den Dokumenttitel statt des Dateipfads vor.</li>
                <li><strong>Dokumentsprache (<code>/Lang</code>, z. B. <code>de-DE</code>, WCAG 3.1.1):</strong> Zwingend erforderlich für die korrekte Sprachausgabe.</li>
                <li><strong>Tagged PDF Status (<code>/MarkInfo /Marked true</code>, Matterhorn 01-001):</strong> Kennzeichnung als strukturiertes Dokument.</li>
                <li><strong>Vollständiger Content-Tagging-Baum (<code>/StructTreeRoot</code>, <code>/ParentTree</code> &amp; <code>MCID</code>s, WCAG 1.3.1 / 1.3.2):</strong> Prüft, ob alle Seiteninhalte über Marked-Content-Sequenzen im Strukturbaum verankert oder als <code>/Artifact</code> deklariert sind.</li>
                <li><strong>PDF/UA-1 Konformitätskennung (<code>pdfuaid:part=1</code>, Matterhorn 06-002):</strong> XMP-Metadaten-Kennung nach ISO 14289-1.</li>
                <li><strong>Auslesbarer Textstrom (Kein ungetaggter Bild-Scan, WCAG 1.4.5):</strong> Prüft, ob echter Text vorhanden ist.</li>
                <li><strong>Schriftarten-Einbettung, <code>/ToUnicode</code> &amp; Glyphen-Breiten (Matterhorn 21-001 bis 21-006):</strong> Prüft vollständige Schrifteinbettung, Unicode-Zuordnung und konsistente <code>/Widths</code>-Metriken.</li>
                <li><strong>Tabellen-Zeilen &amp; Spaltenüberschriften (<code>/TH</code> &amp; <code>/Scope</code>, WCAG 1.3.1):</strong> Prüft semantische Tabellen-Auszeichnung.</li>
                <li><strong>Alternativtexte für Abbildungen (<code>&lt;Figure&gt; /Alt</code> &amp; <code>/BBox</code>, WCAG 1.1.1) &amp; Formularfelder (<code>/TU</code>, WCAG 4.1.2).</strong></li>
                <li><strong>Farbkontrast der Texte (WCAG 1.4.3 — mind. 4,5:1) &amp; Tab-Fokus-Reihenfolge (<code>/Tabs /S</code>, WCAG 2.4.3).</strong></li>
                <li><strong>Lesezeichen / Gliederung (<code>/Outlines</code>, WCAG 2.4.5) &amp; barrierefreier Sicherheitszugriff.</strong></li>
            </ol>
            <h3>2. 1-Klick Auto-Remediation inkl. automatischer Offline-OCR (<code>⚡ Auto-Fix PDF/UA</code>)</h3>
            <p>
                Mit einem Klick auf <strong>„🛠️ Barrierefreiheit jetzt nachrüsten“</strong> behebt PDF-Werkstatt Pro vollautomatisch alle gefundenen Mängel:
                Ist das Dokument ein reiner Bild-Scan ohne Textebene, startet der Auto-Fix <strong>automatisch die lokale Offline-Texterkennung (Tesseract-OCR)</strong>, bettet eine durchsuchbare Textschicht mit PDF/A-konformer TrueType-Schrift (Liberation Sans) ein, hebt zu schwache Textkontraste auf mindestens 4,5:1 an, korrigiert Schriftmetriken (<code>/Widths</code>), setzt <code>/Tabs /S</code> auf allen Seiten und generiert einen vollständigen PDF/UA-1-Strukturbaum (<code>/StructTreeRoot</code>, <code>/ParentTree</code>, <code>/RoleMap</code>, <code>&lt;Figure&gt;</code> mit <code>/Alt</code> und <code>/BBox</code>).
            </p>
            <h3>3. Visueller Tag- &amp; Alternativtext-Editor (<code>H1 Tag</code>, <code>H2 Tag</code>, <code>P Absatz</code>, <code>🖼️ Alt-Text</code>)</h3>
            <p>
                Um Überschriften, Absätze oder Bilder/Grafiken gezielt für blinde Nutzer zu beschreiben, wählen Sie im Reiter <em>Barrierefreiheit</em> das entsprechende Tag-Werkzeug (z. B. <code>🖼️ Alt-Text</code> für eine Grafik/Unterschrift/Stempel), markieren den Bereich auf der Seite und geben den <strong>Alternativtext (<code>/Alt</code>)</strong> ein.
            </p>
            <h3>4. Offiziellen Prüfbericht als PDF exportieren (<code>📄 Prüfbericht PDF</code>)</h3>
            <p>Erzeugt ein druckfertiges Prüfprotokoll mit Prüfergebnis in Prozent, Zeitstempel und Einzelbewertung aller 12 PDF/UA-1- &amp; WCAG-Prüfpunkte zur Ablage in der Akte.</p>
        </section>

        <!-- KAPITEL 11 -->
        <section class="help-card" id="kap11">
            <h2>11. Automatische 5-Minuten-Sicherung (Lokaler Auto-Save)</h2>
            <p>
                <strong>PDF-Werkstatt Pro</strong> schützt Ihre laufende Arbeit vollautomatisch vor Datenverlust (z. B. bei versehentlichem Schließen des Browser-Tabs oder Stromausfall):
            </p>
            <div class="help-grid-2">
                <div class="help-feature-box">
                    <h4>⏱️ Automatischer Snapshot alle 5 Minuten</h4>
                    <p>Solange ein PDF-Dokument geöffnet ist, sichert die Anwendung alle 5 Minuten automatisch den kompletten Arbeitsstand inklusive aller beweglichen Textfelder, Zeichnungen, Unterschriften, Stempel und Barrierefreiheits-Tags lokal in der Browser-Datenbank (<code>IndexedDB</code>).</p>
                </div>
                <div class="help-feature-box">
                    <h4>🔄 1-Klick-Wiederherstellung nach Neustart</h4>
                    <p>Beim nächsten Öffnen von PDF-Werkstatt Pro erkennt die Anwendung automatisch einen vorhandenen Auto-Save-Stand und blendet unten in der Statusleiste den Button <strong><code>🔄 Auto-Save wiederherstellen</code></strong> ein, mit dem Sie nahtlos weiterarbeiten können.</p>
                </div>
            </div>
        </section>

        <!-- KAPITEL 12 -->
        <section class="help-card" id="kap12">
            <h2>12. Wichtige Tastenkombinationen (Shortcuts)</h2>
            <table class="help-table">
                <thead>
                    <tr>
                        <th>Tastenkombination</th>
                        <th>Funktion</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td><span class="kbd">Strg</span> + <span class="kbd">O</span></td>
                        <td>Lokale PDF-Datei(en) öffnen</td>
                    </tr>
                    <tr>
                        <td><span class="kbd">Strg</span> + <span class="kbd">S</span></td>
                        <td>Aktuelles PDF-Dokument speichern / herunterladen</td>
                    </tr>
                    <tr>
                        <td><span class="kbd">Strg</span> + <span class="kbd">F</span></td>
                        <td>Volltextsuche im geöffneten PDF-Dokument starten</td>
                    </tr>
                    <tr>
                        <td><span class="kbd">Strg</span> + <span class="kbd">Z</span></td>
                        <td>Letzte Annotation / Zeichnung auf der aktuellen Seite rückgängig machen</td>
                    </tr>
                    <tr>
                        <td><span class="kbd">Entf</span> (Delete)</td>
                        <td>Aktuell ausgewähltes Element (Textfeld, Stempel, Unterschrift, Formularfeld) löschen</td>
                    </tr>
                    <tr>
                        <td><span class="kbd">F1</span></td>
                        <td>Dieses Benutzerhandbuch / Hilfedatei öffnen</td>
                    </tr>
                    <tr>
                        <td><span class="kbd">F11</span> (oder Button <code>⛶ Vollbild</code>)</td>
                        <td>Vollbildmodus umschalten (blendet Adressleiste, Tabs und Lesezeichenleiste des Browsers komplett aus für maximales Desktop-Feeling)</td>
                    </tr>
                    <tr>
                        <td><strong>Button <code>◨</code> oben rechts</strong></td>
                        <td>Rechtes Fenster „Werkzeug-Eigenschaften“ (standardmäßig ausgeblendet) ein- oder ausblenden</td>
                    </tr>
                    <tr>
                        <td><strong>Rechtsklick auf eine Seite</strong></td>
                        <td>Kontextmenü öffnen (Seite drehen, duplizieren, in Sammelmappe legen, als Einzel-PDF oder PNG exportieren, löschen)</td>
                    </tr>
                </tbody>
            </table>
        </section>

        <!-- KAPITEL 13 -->
        <section class="help-card" id="kap13">
            <h2>13. Sicherheitsarchitektur &amp; Anonyme Nutzungsstatistik</h2>
            <h3>Integrierte Sicherheitsmechanismen (Hardening)</h3>
            <ul>
                <li><strong>100 % Lokale Dokumentenverarbeitung im Browser:</strong> Geöffnete PDF-Akten verbleiben während der gesamten Bearbeitung im Arbeitsspeicher Ihres Browsers und müssen nicht auf fremde Cloud-Server hochgeladen werden.</li>
                <li><strong>Vollständige Verzeichnis-Abschottung (<code>.htaccess</code>):</strong> Direkter HTTP-Zugriff auf <code>config.php</code>, <code>includes/</code> und das gesamte <code>storage/</code>-Verzeichnis ist auf Webserver-Ebene komplett gesperrt (<code>403 Forbidden</code>).</li>
                <li><strong>CSRF-Schutz &amp; Session-Hardening:</strong> Alle API-Aktionen erfordern ein kryptographisches, sitzungsgebundenes <code>X-CSRF-Token</code>. Session-Cookies werden als <code>HttpOnly</code> sowie <code>SameSite=Lax</code> gesetzt.</li>
                <li><strong>Content-Security-Policy (CSP):</strong> Strikte HTTP-Security-Header (<code>default-src 'self'</code>, <code>object-src 'none'</code>, <code>X-Content-Type-Options: nosniff</code>, <code>X-Frame-Options: SAMEORIGIN</code>) unterbinden externe Datenabflüsse und Cross-Site-Scripting (XSS).</li>
            </ul>
            <h3>Anonyme Nutzungsstatistik für den Administrator (<code>storage/nutzungsstatistik.txt</code>)</h3>
            <p>
                Für den Administrator legt die Anwendung automatisch eine fortlaufend aktualisierte, übersichtlich formatierte <strong>Nutzungsstatistik im Verzeichnis <code>storage/</code></strong> ab (durch <code>storage/.htaccess</code> vor öffentlichem Web-Zugriff geschützt, direkt per FTP/SSH oder Dateimanager einsehbar):
            </p>
            <ul>
                <li><strong><code>storage/nutzungsstatistik.txt</code> (Lesbarer Textbericht für den Administrator):</strong> Zeigt auf einen Blick, wie stark das Programm und die einzelnen PDF-Werkzeuge genutzt werden (Sitzungen, Seitenaufrufe, Monatsübersicht und 30-Tage-Tagesverlauf).</li>
                <li><strong><code>storage/nutzungsstatistik.json</code> (Maschinenlesbare Rohdaten):</strong> Enthält alle Zählerstände im JSON-Format für eventuelle eigene Auswertungen.</li>
            </ul>
        </section>

        <!-- KAPITEL 14 -->
        <section class="help-card" id="kap14">
            <h2>14. Installationsanweisung, Systemvoraussetzungen &amp; Skalierbarkeit</h2>
            <p>
                <strong>PDF-Werkstatt Pro</strong> wurde speziell so konstruiert, dass es ohne komplexe Server-Abhängigkeiten auf nahezu jedem Standard-Webspace, Behörden-Intranet-Server oder Linux-/Windows-Host in wenigen Minuten installiert werden kann.
            </p>

            <h3>1. System- &amp; Installationsvoraussetzungen</h3>
            <div class="help-grid-2">
                <div class="help-feature-box">
                    <h4>🖥️ Server-Voraussetzungen (Webspace / Intranet)</h4>
                    <ul>
                        <li><strong>Webserver:</strong> Apache 2.2 / 2.4 (mit <code>.htaccess</code>-Unterstützung), Nginx oder IIS.</li>
                        <li><strong>PHP-Version:</strong> Voll kompatibel ab <strong>PHP 5.4.0</strong> über PHP 7.x bis <strong>PHP 8.4+</strong>.</li>
                        <li><strong>PHP-Erweiterungen:</strong> Nur PHP-Standardmodule (<code>json</code>, <code>session</code>, <code>hash</code>, <code>mbstring</code> optional).</li>
                        <li><strong>Keine Datenbank nötig:</strong> Weder MySQL/MariaDB noch PostgreSQL oder SQLite erforderlich.</li>
                        <li><strong>Keine Systemaufrufe nötig:</strong> Funktioniert komplett <strong>ohne</strong> <code>shell_exec</code>, <code>exec</code>, Ghostscript oder externe CLI-Programme.</li>
                        <li><strong>Festplattenplatz:</strong> ca. <strong>35 MB</strong> für das Programmpaket (inkl. deutscher &amp; englischer Offline-OCR-Sprachdaten sowie TrueType-Schriften für PDF/UA-1).</li>
                    </ul>
                </div>
                <div class="help-feature-box">
                    <h4>🌐 Client-Voraussetzungen (Anwender-PC)</h4>
                    <ul>
                        <li><strong>Browser:</strong> Jeder aktuelle Standard-Browser (Mozilla Firefox, Google Chrome, Microsoft Edge, Apple Safari) mit aktiviertem JavaScript, HTML5 Canvas und WebAssembly (für Offline-OCR).</li>
                        <li><strong>Keine Client-Installation:</strong> Auf den Arbeitsplatzrechnern müssen weder Zusatzprogramme noch Browser-Plugins oder Admin-Rechte installiert werden.</li>
                        <li><strong>100 % Offline-/Intranet-fähig:</strong> Der Arbeitsplatzrechner benötigt keinerlei Verbindung zum öffentlichen Internet.</li>
                    </ul>
                </div>
            </div>

            <h3>2. Schritt-für-Schritt-Installationsanweisung</h3>
            <ol>
                <li>
                    <strong>Dateien auf den Webserver kopieren:</strong><br>
                    Laden Sie das gesamte Programmverzeichnis (z. B. per SFTP/SCP oder Dateimanager) in das gewünschte Webserver-Verzeichnis hoch (z. B. <code>/var/www/html/pdf-werkstatt/</code>). Achten Sie darauf, dass auch die versteckten Schutzdateien <code>.htaccess</code> und <code>storage/.htaccess</code> mit übertragen werden.
                </li>
                <li>
                    <strong>Schreibrechte für das Verzeichnis <code>storage/</code> prüfen:</strong><br>
                    Das Verzeichnis <code>storage/</code> benötigt Schreibrechte für den Webserver-Benutzer (z. B. <code>www-data</code>), damit die anonyme Nutzungsstatistik geschrieben werden kann. Beim ersten Aufruf legt <strong>PDF-Werkstatt Pro</strong> fehlende Unterordner und Schutzdateien automatisch selbst an:
                    <br><code>chmod -R 750 storage/ &amp;&amp; chown -R www-data:www-data storage/</code>
                </li>
                <li>
                    <strong>Fertig — Anwendung im Browser aufrufen:</strong><br>
                    Rufen Sie <code>https://ihr-server.de/pdf-werkstatt/</code> im Browser auf. Die Anwendung ist sofort betriebsbereit.
                </li>
            </ol>

            <h3>3. Skalierbarkeit &amp; Lastverteilung (Wie viele Nutzer verkraftet das System?)</h3>
            <p>
                Durch die reine <strong>Client-Side-Architektur</strong> ist <strong>PDF-Werkstatt Pro</strong> außergewöhnlich hoch skalierbar:
            </p>
            <ul>
                <li>
                    <strong>99,9 % der Rechenlast laufen auf dem PC des Anwenders (Zero-Server-CPU-Load):</strong><br>
                    Sämtliche rechenintensiven PDF-Operationen — das Rendern der Seiten, Zusammenfügen (Merge), Teilen (Split), Komprimieren, sichere Schwärzen (Sanitize), PDF-Vergleich (Pixel-Diff), Barrierefreiheits-Prüfung (PDF/UA-1 &amp; WCAG) und sogar die komplette <strong>optische Texterkennung (Tesseract-OCR)</strong> — werden im Browser des jeweiligen Anwenders ausgeführt. Der Webserver wird dadurch bei der PDF-Bearbeitung <strong>nicht mit CPU- oder RAM-Spitzen belastet</strong>!
                </li>
                <li>
                    <strong>Empfohlene Nutzerzahlen auf einem einzelnen Standard-Webserver:</strong><br>
                    <strong>500 bis 5.000+ gleichzeitige Nutzer</strong> auf einem einzigen Standard-Webserver, da der Server lediglich die Programmdateien und lokalen Sprach-/Schriftpakete ausliefert (per Browser-Cache &amp; GZIP beschleunigt).
                </li>
            </ul>

            <h3>4. Empfohlene Server-Dimensionierung nach Nutzerzahl</h3>
            <table class="help-table">
                <thead>
                    <tr>
                        <th>Ausbaustufe</th>
                        <th>Nutzerzahl (ca.)</th>
                        <th>CPU &amp; Arbeitsspeicher (RAM)</th>
                        <th>Festplatte (Storage)</th>
                        <th>Empfohlener Software-Stack</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td><strong>Stufe S</strong><br>(Abteilung / Kanzlei / kleiner Webspace)</td>
                        <td>bis <strong>100 Nutzer</strong><br>(ca. 20–30 gleichzeitig aktiv)</td>
                        <td><strong>1–2 vCPU-Kerne</strong><br><strong>1 – 2 GB RAM</strong></td>
                        <td><strong>5 GB SSD</strong></td>
                        <td>Standard-Webspace oder kleine Linux-VM, Apache 2.4 + PHP 7.4/8.x</td>
                    </tr>
                    <tr>
                        <td><strong>Stufe M</strong><br>(Behörde / Mittelstand / Dienststelle)</td>
                        <td><strong>500 – 1.000 Nutzer</strong><br>(ca. 100–250 gleichzeitig aktiv)</td>
                        <td><strong>2–4 vCPU-Kerne</strong><br><strong>4 GB RAM</strong></td>
                        <td><strong>10 – 20 GB SSD</strong></td>
                        <td>Debian / Ubuntu / RHEL VM, Apache 2.4 (Event-MPM) oder Nginx + <strong>PHP-FPM</strong> + OPcache</td>
                    </tr>
                    <tr>
                        <td><strong>Stufe L</strong><br>(Großbehörde / Landesbetrieb)</td>
                        <td><strong>2.500 – 5.000+ Nutzer</strong><br>(300–1.000+ gleichzeitig aktiv)</td>
                        <td><strong>4–8 vCPU-Kerne</strong><br><strong>8 GB RAM</strong></td>
                        <td><strong>20 – 50 GB NVMe-SSD</strong></td>
                        <td>Linux-Server mit Apache 2.4 (Event-MPM) / Nginx, <strong>PHP 8.2+ FPM</strong> (OPcache aktiv), 1 Gbit/s LAN-Anbindung</td>
                    </tr>
                </tbody>
            </table>
        </section>

    </main>
</div>

<button type="button" class="help-floating-top" id="btnHelpScrollTop" title="Nach ganz oben scrollen">
    ↑ Nach oben
</button>

<script>
(function () {
    var searchInput = document.getElementById('helpSearchInput');
    var cards = document.querySelectorAll('.help-card');
    var tocLinks = document.querySelectorAll('.help-toc a[href^="#"]');
    var floatingTopBtn = document.getElementById('btnHelpScrollTop');

    // Add a "↑ Nach oben" button to every chapter heading for comfortable navigation
    for (var c = 0; c < cards.length; c++) {
        var h2 = cards[c].querySelector('h2');
        if (h2) {
            var titleText = h2.innerHTML;
            h2.innerHTML = '<span>' + titleText + '</span>';
            var topBtn = document.createElement('button');
            topBtn.type = 'button';
            topBtn.className = 'help-top-link';
            topBtn.textContent = '↑ Nach oben';
            topBtn.addEventListener('click', function () {
                window.scrollTo({ top: 0, behavior: 'smooth' });
            });
            h2.appendChild(topBtn);
        }
    }

    // Smooth scrolling on TOC click without locking or polluting browser Back history
    for (var i = 0; i < tocLinks.length; i++) {
        tocLinks[i].addEventListener('click', function (e) {
            var targetId = this.getAttribute('href');
            if (!targetId || targetId.charAt(0) !== '#') return;
            var targetEl = document.querySelector(targetId);
            if (!targetEl) return;

            e.preventDefault();

            // If a search filter was active and hiding chapters, reset it first so all chapters are visible
            if (searchInput && searchInput.value.trim() !== '') {
                searchInput.value = '';
                for (var j = 0; j < cards.length; j++) {
                    cards[j].style.display = '';
                }
            }

            for (var k = 0; k < tocLinks.length; k++) {
                tocLinks[k].classList.remove('active');
            }
            this.classList.add('active');

            targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    }

    // Highlight active chapter in TOC and toggle floating "Nach oben" button while scrolling
    window.addEventListener('scroll', function () {
        var scrollY = window.scrollY || window.pageYOffset || 0;
        if (floatingTopBtn) {
            if (scrollY > 260) {
                floatingTopBtn.classList.add('visible');
            } else {
                floatingTopBtn.classList.remove('visible');
            }
        }

        var currentId = '';
        for (var m = 0; m < cards.length; m++) {
            if (cards[m].style.display === 'none') continue;
            var rect = cards[m].getBoundingClientRect();
            if (rect.top <= 140) {
                currentId = '#' + cards[m].id;
            }
        }
        if (currentId) {
            for (var n = 0; n < tocLinks.length; n++) {
                if (tocLinks[n].getAttribute('href') === currentId) {
                    tocLinks[n].classList.add('active');
                } else {
                    tocLinks[n].classList.remove('active');
                }
            }
        }
    });

    if (floatingTopBtn) {
        floatingTopBtn.addEventListener('click', function () {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    var themeBtn = document.getElementById('btnHelpThemeToggle');
    if (themeBtn) {
        themeBtn.addEventListener('click', function () {
            document.body.classList.toggle('theme-light');
            document.body.classList.toggle('theme-dark');
        });
    }

    var printBtn = document.getElementById('btnHelpPrint');
    if (printBtn) {
        printBtn.addEventListener('click', function () {
            window.print();
        });
    }

    if (searchInput) {
        searchInput.addEventListener('input', function () {
            var q = searchInput.value.trim().toLowerCase();
            for (var s = 0; s < cards.length; s++) {
                var card = cards[s];
                if (!q || card.textContent.toLowerCase().indexOf(q) !== -1) {
                    card.style.display = '';
                } else {
                    card.style.display = 'none';
                }
            }
        });
    }
})();
</script>
</body>
</html>
