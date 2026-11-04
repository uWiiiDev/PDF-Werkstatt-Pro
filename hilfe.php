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
    <link rel="stylesheet" href="assets/css/desktop.css?v=<?php echo urlencode(PDFSTUDIO_VERSION); ?>">
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
        <a href="#kap10">10. Barrierefreiheit (PDF/UA &amp; BITV)</a>
        <a href="#kap11">11. Benutzerkonto, Tresor &amp; E-Mail-Share</a>
        <a href="#kap12">12. Tastenkombinationen</a>
        <a href="#kap13">13. Admin-Konfiguration (config.php)</a>
        <a href="#kap14">14. Installation &amp; Skalierbarkeit</a>
    </nav>

    <!-- MAIN DOCUMENTATION CONTENT -->
    <main class="help-content" id="helpSectionsContainer">

        <!-- KAPITEL 1 -->
        <section class="help-card" id="kap1">
            <h2>1. Überblick &amp; 100 % Offline-Architektur</h2>
            <p>
                <strong>PDF-Werkstatt Pro (Version <?php echo htmlspecialchars(PDFSTUDIO_VERSION, ENT_QUOTES, 'UTF-8'); ?>)</strong> ist eine vollständige Desktop-PDF-Suite für den Browser. Sie vereint sämtliche Werkzeuge zum Organisieren, Bearbeiten, Unterschreiben, Schwärzen, Vergleichen, Konvertieren, Texterkennen (Sandwich-OCR) sowie zur Prüfung und Herstellung der Barrierefreiheit nach <strong>PDF/UA-1 (ISO 14289-1)</strong> und <strong>BITV 2.0 / WCAG 2.1</strong>.
            </p>
            <div class="help-grid-2">
                <div class="help-feature-box">
                    <h4>🔒 100 % Offline &amp; Behörden-/Intranet-tauglich</h4>
                    <p>Es werden keinerlei externe Bibliotheken, Schriften oder Skripte aus dem Internet nachgeladen. Alle Engines (PDF-Lib, PDF.js, Tesseract-OCR inklusive deutscher und englischer Sprachmodelle, Mammoth DOCX, SheetJS XLSX, JSZip) liegen lokal im Ordner <code>assets/vendor/</code>.</p>
                </div>
                <div class="help-feature-box">
                    <h4>⚙️ Reiner Webspace-Betrieb ohne Datenbank</h4>
                    <p>Die Anwendung benötigt weder Root-Rechte noch Kommandozeilen-Aufrufe (kein <code>shell_exec</code> oder <code>exec</code>) und auch keine Datenbank. Alle Konten, Projekte und Versionen werden dateibasiert im geschützten Verzeichnis <code>storage/</code> verwaltet.</p>
                </div>
            </div>
        </section>

        <!-- KAPITEL 2 -->
        <section class="help-card" id="kap2">
            <h2>2. Arbeitsoberfläche, Ribbon-Menü &amp; Ansichtsmodi</h2>
            <p>Die Oberfläche ist wie eine moderne Desktop-Anwendung in 5 Bereiche gegliedert:</p>
            <ul>
                <li><strong>Fenster-Titelleiste (Zeile 1):</strong> Schnellzugriff (Öffnen, Speichern, Rückgängig), Umschalter für die 3 Hauptansichten (<code>⊞ Alle Tools</code>, <code>☷ Seiten-Studio</code>, <code>✎ PDF-Editor</code>), persönliches Benutzerkonto (<code>👤 Konto / Login</code> sowie bei angemeldeten Benutzern direkte Schaltflächen für <code>🔑 Passwort</code> und <code>🚪 Abmelden</code>), Seitenleisten-Schalter, Vollbild-Schalter (<code>⛶</code>) sowie Hell-/Dunkel-Modus (<code>◐</code>).</li>
                <li><strong>Ribbon-Kategorienleiste (Zeile 2):</strong> 7 übersichtliche Reiter (<code>🏠 Start</code>, <code>✎ Bearbeiten</code>, <code>📑 Seiten</code>, <code>📋 Formulare &amp; Links</code>, <code>🛡️ Layout &amp; Schutz</code>, <code>🔄 Konverter &amp; OCR</code>, <code>♿ Barrierefreiheit</code>).</li>
                <li><strong>Ribbon-Werkzeugdeck (Zeile 3):</strong> Zeigt passend zum gewählten Reiter die beschrifteten Werkzeug-Schaltflächen an. Mit dem Pfeil <code>▴</code> rechts oben lässt sich das Ribbon-Deck bei Bedarf einklappen.</li>
                <li><strong>Multi-Dokument-Tableiste:</strong> Sie können beliebig viele PDF-Dokumente gleichzeitig in Tabs geöffnet halten, zwischen ihnen wechseln oder über <code>⇄ Alle Tabs verbinden</code> zu einer einzigen Akte zusammenführen.</li>
                <li><strong>Linkes Dock, Rechter Inspektor &amp; 5-Minuten-Auto-Save in der Statusleiste:</strong> Links befinden sich die Seiten-Miniaturansichten (<code>Seiten</code>), die dokumentübergreifende <code>Sammelmappe</code> und der persönliche <code>☁️ Tresor</code>. Rechts passen Sie Werkzeugeigenschaften, Wasserzeichen, Komprimierung, Metadaten, Sandwich-OCR und Barrierefreiheit an. In der unteren Statusleiste sehen und steuern Sie die <strong>automatische 5-Minuten-Sicherung (<code>⏱️ Auto-Save (5 Min.): Aktiv</code>)</strong>.</li>
            </ul>
        </section>

        <!-- KAPITEL 3 -->
        <section class="help-card" id="kap3">
            <h2>3. Seiten organisieren, zusammenfügen, teilen &amp; Sammelmappe</h2>
            <div class="help-grid-2">
                <div class="help-feature-box">
                    <h4>➕ PDFs zusammenfügen (Merge)</h4>
                    <p>Über <strong>Start → Verbinden</strong> oder <strong>Seiten → PDF anfügen</strong> wählen Sie beliebig viele PDF-Dateien aus, die sofort an das aktuelle Dokument angehängt oder zu einem neuen PDF kombiniert werden.</p>
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
                <li><strong>I✎ Text ändern (Vorhandenen Originaltext im PDF direkt umschreiben):</strong> Sobald Sie dieses Werkzeug aktivieren, erkennt <strong>PDF-Werkstatt Pro</strong> automatisch alle eingebetteten Textzeilen auf der PDF-Seite und hebt sie mit einem feinen blauen Rahmen hervor. Klicken Sie einfach auf eine beliebige Textzeile im PDF: Der vorhandene Originaltext wird automatisch ausgelesen, im Eingabedialog vorausgefüllt und beim Bestätigen passgenau an Ort und Stelle durch Ihren neuen Text ersetzt (oder bei leerer Eingabe rückstandsfrei ausgeblendet). Schriftgröße und Textfarbe werden automatisch erkannt und lassen sich rechts im Inspektor live anpassen!</li>
                <li><strong>T+ Neuer Text:</strong> Klicken Sie auf eine beliebige freie Stelle im Dokument, um neuen Text einzufügen. Schriftgröße und Farbe lassen sich rechts im Inspektor einstellen.</li>
                <li><strong>✒️ Freihand-Stift &amp; 🖍️ Textmarker:</strong> Zeichnen Sie direkt auf der PDF-Seite oder heben Sie Textpassagen farbig halbtransparent hervor.</li>
                <li><strong>▭ Rahmen / Rechteck &amp; 🖼️ Bild einfügen:</strong> Platzieren Sie farbige Hinweisrahmen oder fügen Sie beliebige Bilder (PNG/JPG/WebP, z. B. Logos oder Scans) frei skalier- und verschiebbar auf der Seite ein.</li>
                <li><strong>🏷️ Stempel-Werkzeug:</strong> Wählen Sie rechts im Inspektor einen Standardstempel (<code>BEZAHLT</code>, <code>GENEHMIGT</code>, <code>VERTRAULICH</code>, <code>ENTWURF</code>, <code>KOPIE</code>, <code>GEPRÜFT</code>, <code>EINGEGANGEN AM [Datum]</code>) oder einen Ihrer persönlichen Stempel aus dem Konto-Tresor und klicken Sie auf die Seite.</li>
                <li><strong>✍️ Unterschrift &amp; Unterschriften-Tresor:</strong> Zeichnen Sie Ihre Signatur mit der Maus/Touchpad oder generieren Sie eine Schreibschrift-Signatur durch Namenseingabe. Über <strong>„⭐ Im Konto-Tresor speichern“</strong> hinterlegen Sie Ihre Unterschriften und Paraphen dauerhaft für die 1-Klick-Wiederverwendung.</li>
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
                        <strong>Wasserzeichen:</strong> Im Reiter <em>Layout &amp; Schutz</em> (bzw. rechts im Inspektor) bringen Sie diagonale Wasserzeichen mit wählbarer Deckkraft und Schriftgröße auf alle Seiten auf.<br>
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
                    <p>Über <strong>Layout &amp; Schutz → Kopf/Fuß &amp; Bates</strong> versehen Sie Akten mit einer eindeutigen, mehrstelligen Bates-Nummerierung (z. B. Präfix <code>AZ-2026-</code>, Startnummer <code>1</code>, 6 Stellen → <code>AZ-2026-000001</code>). Wenn Sie mit einem Benutzerkonto angemeldet sind, <strong>merkt sich das System automatisch den letzten Zählerstand</strong> für das nächste Dokument!</p>
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
                Über <strong>Start → Vergleichen</strong> (oder direkt aus der Versionshistorie im Tresor) öffnen Sie den <strong>PDF-Vergleich</strong>:
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
                        Wenn Sie ein gescanntes PDF oder Bild-PDF vorliegen haben, in dem man keinen Text markieren oder suchen kann, klicken Sie im Reiter <strong>Konverter &amp; OCR</strong> (oder rechts im Inspektor) auf <strong><code>🔎 Durchsuchbares PDF</code></strong>:<br>
                        Die lokale Offline-OCR-Engine (Deutsch/Englisch) erkennt alle Wörter samt ihren exakten Koordinaten und legt sie als <strong>unsichtbare, durchsuchbare Textebene</strong> passgenau über das Originalbild. Das Aussehen bleibt 1:1 erhalten, aber das PDF ist sofort per <span class="kbd">Strg</span>+<span class="kbd">F</span> durchsuchbar, kopierbar und für Screenreader lesbar!
                    </p>
                </div>
            </div>
        </section>

        <!-- KAPITEL 10 -->
        <section class="help-card" id="kap10">
            <h2>10. Barrierefreiheit (PDF/UA-1, BITV 2.0 &amp; WCAG 2.1)</h2>
            <p>
                Im Reiter <strong>♿ Barrierefreiheit</strong> prüfen und reparieren Sie PDF-Dokumente für Screenreader und behördliche Barrierefreiheits-Vorgaben:
            </p>
            <h3>1. 10-Punkte PDF/UA- &amp; BITV-Prüfung (<code>♿ PDF/UA Prüfung</code>)</h3>
            <p>Das System analysiert das Dokument automatisch auf alle 10 Kernkriterien:</p>
            <ol>
                <li><strong>Dokumenttitel (<code>/Title</code> &amp; XMP <code>dc:title</code>):</strong> Aussagekräftiger Titel statt bloßem Dateinamen.</li>
                <li><strong>Fenstertitel-Anzeige (<code>/ViewerPreferences /DisplayDocTitle true</code>):</strong> Screenreader lesen den Dokumenttitel statt des Dateipfads vor.</li>
                <li><strong>Dokumentsprache (<code>/Lang</code>, z. B. <code>de-DE</code>):</strong> Zwingend erforderlich für die korrekte Sprachausgabe.</li>
                <li><strong>Tagged PDF Status (<code>/MarkInfo /Marked true</code>):</strong> Kennzeichnung als strukturiertes Dokument.</li>
                <li><strong>Logischer Strukturbaum (<code>/StructTreeRoot</code>):</strong> Semantische Gliederung für Assistenztechnologien.</li>
                <li><strong>PDF/UA-1 Konformitätskennung (<code>pdfuaid:part=1</code>):</strong> XMP-Metadaten-Kennung nach ISO 14289-1.</li>
                <li><strong>Auslesbarer Textstrom (Kein reiner Bild-Scan):</strong> Prüft, ob echter Text vorhanden ist (falls nicht: per <code>🔎 Durchsuchbares PDF</code> nachrüstbar!).</li>
                <li><strong>Schriftarten-Definition (<code>/Font</code>):</strong> Prüft saubere Zeichenkodierung.</li>
                <li><strong>Lesezeichen / Gliederung (<code>/Outlines</code>):</strong> Sprungmarken zur Seitennavigation.</li>
                <li><strong>Barrierefreier Zugriff (Keine Screenreader-Sperre durch Verschlüsselung).</strong></li>
            </ol>
            <h3>2. 1-Klick Auto-Remediation (<code>⚡ Auto-Fix PDF/UA</code>)</h3>
            <p>
                Mit einem Klick auf <strong>„🛠️ Barrierefreiheit jetzt nachrüsten“</strong> bettet PDF-Werkstatt Pro alle fehlenden Strukturmerkmale (<code>/Title</code>, <code>/DisplayDocTitle true</code>, <code>/Lang</code>, <code>/Marked true</code>, <code>/StructTreeRoot</code>, XMP <code>pdfuaid:part=1</code> sowie Seiten-Lesezeichen <code>/Outlines</code>) automatisch in das PDF ein.
            </p>
            <h3>3. Visueller Tag- &amp; Alternativtext-Editor (<code>H1 Tag</code>, <code>H2 Tag</code>, <code>P Absatz</code>, <code>🖼️ Alt-Text</code>)</h3>
            <p>
                Um Überschriften, Absätze oder Bilder/Grafiken gezielt für blinde Nutzer zu beschreiben, wählen Sie im Reiter <em>Barrierefreiheit</em> das entsprechende Tag-Werkzeug (z. B. <code>🖼️ Alt-Text</code> für eine Grafik/Unterschrift/Stempel), markieren den Bereich auf der Seite und geben den <strong>Alternativtext (<code>/Alt</code>)</strong> ein. Beim Auto-Fix oder Einbetten werden diese Tags inklusive <code>/Alt</code>-Attribut direkt in den PDF-Strukturbaum (<code>/StructTreeRoot</code>) geschrieben.
            </p>
            <h3>4. Offiziellen Prüfbericht als PDF exportieren (<code>📄 Prüfbericht PDF</code>)</h3>
            <p>Erzeugt ein druckfertiges Prüfprotokoll mit Prüfergebnis in Prozent, Zeitstempel und Einzelbewertung aller 10 Prüfpunkte zur Ablage in der Akte.</p>
        </section>

        <!-- KAPITEL 11 -->
        <section class="help-card" id="kap11">
            <h2>11. Optionales Benutzerkonto, Projekt-Tresor, Versionen &amp; E-Mail-Freigaben</h2>
            <p>
                Die Nutzung eines Benutzerkontos ist komplett optional (ohne Login arbeitet die Anwendung im <strong>Gast-Modus</strong>). Ein eigenes Konto über <strong><code>👤 Mein Konto</code></strong> bietet jedoch fünf entscheidende Vorteile:
            </p>
            <div class="help-grid-2">
                <div class="help-feature-box">
                    <h4>1. Editierbare Projekte im persönlichen Tresor</h4>
                    <p>Wenn Sie ein PDF über <code>☁️ Im Tresor speichern</code> ablegen, werden Ihre Textfelder, Stempel, Unterschriften und Tags als <strong>editierbares Projekt</strong> mitgespeichert. Klicken Sie später (oder an einem anderen Arbeitsplatz) im Tresor auf <code>✎ Weiterbearbeiten</code>, können Sie alle Elemente nahtlos weiter verschieben und bearbeiten.</p>
                </div>
                <div class="help-feature-box">
                    <h4>2. Automatische Versionshistorie &amp; 1-Klick Diff</h4>
                    <p>Bei jedem Überschreiben einer Datei im Tresor legt PDF-Werkstatt Pro automatisch eine neue Version (<code>Version 1</code>, <code>Version 2</code> …) an. Über das <code>🕒</code>-Symbol können Sie jeden früheren Stand wiederherstellen oder per Klick direkt im <strong>PDF-Diff</strong> mit der aktuellen Fassung vergleichen.</p>
                </div>
                <div class="help-feature-box">
                    <h4>3. Persönlicher Unterschriften- &amp; Stempel-Tresor</h4>
                    <p>Hinterlegen Sie Ihre gezeichneten Unterschriften, Paraphen und individuellen Stempel (inkl. Wunschfarbe) einmalig in Ihrem Konto und setzen Sie diese künftig mit einem einzigen Klick in jedes Dokument ein.</p>
                </div>
                <div class="help-feature-box">
                    <h4>4. Profil-Vorlagen &amp; fortlaufender Bates-Zähler</h4>
                    <p>Standard-Autor (für PDF/UA), Dienststelle/Abteilung, Standardsprache, Wasserzeichen, Fußzeilen und Ihr persönlicher <strong>Bates-Aktenzeichen-Zähler</strong> werden im Konto gespeichert. Der Bates-Zähler zählt über mehrere Dokumente hinweg automatisch an der letzten Nummer weiter!</p>
                </div>
            </div>
            <h3>5. ✉️ Dokumente per E-Mail-Freigabelink teilen</h3>
            <p>
                Über <strong>Start → Per E-Mail teilen</strong> (oder das <code>✉️</code>-Symbol neben einer Datei im Tresor) können Sie ein Dokument gezielt für Kollegen freigeben:
                Geben Sie die <strong>Empfänger-E-Mail-Adresse</strong>, eine optionale Nachricht, die <strong>Gültigkeitsdauer</strong> (7, 14, 30 Tage oder unbegrenzt) sowie die <strong>Berechtigung</strong> (<em>Nur Lesen &amp; Download</em> oder <em>Im Editor öffnen, kommentieren &amp; gegenzeichnen</em>) an. Der Server versendet die E-Mail direkt bzw. öffnet auf Wunsch Ihr E-Mail-Programm (Outlook/Thunderbird) mit fertig vorausgefülltem Freigabe-Link.
            </p>
            <h3>6. 🔒 Passwort ändern, Abmelden, Passwort zurücksetzen &amp; Konto löschen</h3>
            <p>
                <strong>Angemeldete Benutzer</strong> sehen oben rechts in der Fenster-Titelleiste (sowie im Konto-Dialog) jederzeit direkte Schaltflächen für <strong><code>🔑 Passwort</code></strong> und <strong><code>🚪 Abmelden</code></strong>. Im Bereich <em>„1. Passwort ändern“</em> Ihres Benutzerkontos können Sie durch Eingabe Ihres aktuellen Passworts und eines neuen Passworts (mindestens 8 Zeichen) jederzeit Ihr Passwort ändern.<br>
                <strong>Passwort vergessen?</strong> Klicken Sie im Anmeldefenster auf <strong>„Passwort vergessen? Zurücksetzungs-Link per E-Mail anfordern“</strong>. Das System erzeugt einen <strong>60 Minuten gültigen Einmal-Link (<code>index.php?reset_token=...</code>)</strong> und sendet ihn an Ihre E-Mail-Adresse.<br>
                <strong>Eigenes Konto löschen (DSGVO-konform):</strong> Im Bereich <em>„4. Benutzerkonto &amp; Tresor dauerhaft löschen“</em> innerhalb Ihres Kontos können Sie Ihr Benutzerkonto nach Bestätigung mit Ihrem aktuellen Passwort jederzeit selbstständig und rückstandsfrei löschen (inklusive aller im Tresor gespeicherten PDF-Dokumente, Versionen, Unterschriften, Stempel und aktiven E-Mail-Freigaben).
            </p>
            <h3>7. ⏱️ Automatische 5-Minuten-Sicherung (Auto-Save)</h3>
            <p>
                <strong>PDF-Werkstatt Pro</strong> sichert Ihr geöffnetes Dokument inklusive aller beweglichen Annotationen automatisch <strong>alle 5 Minuten</strong>:
                Sind Sie in Ihrem Benutzerkonto angemeldet, erfolgt die Sicherung automatisch in Ihrem <strong>persönlichen Server-Tresor</strong> sowie zusätzlich lokal im Browser-Speicher (IndexedDB). Im Gast-Modus wird der Stand alle 5 Minuten lokal im Browser gesichert und kann nach einem Neustart über den Button <code>🔄 Auto-Save wiederherstellen</code> in der unteren Statusleiste mit einem Klick geladen werden.
            </p>
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
                        <td><strong>Rechtsklick auf eine Seite</strong></td>
                        <td>Kontextmenü öffnen (Seite drehen, duplizieren, in Sammelmappe legen, als Einzel-PDF oder PNG exportieren, löschen)</td>
                    </tr>
                </tbody>
            </table>
        </section>

        <!-- KAPITEL 13 -->
        <section class="help-card" id="kap13">
            <h2>13. Administrator-Konfiguration (<code>config.php</code>) &amp; Sicherheitsarchitektur</h2>
            <p>
                In der zentralen Konfigurationsdatei <strong><code>config.php</code></strong> im Hauptverzeichnis von PDF-Werkstatt Pro kann der Administrator den E-Mail-/SMTP-Versand, die Absenderadresse, das Speicherplatz-Kontingent pro Konto sowie die Sicherheitsrichtlinien festlegen:
            </p>
            <table class="help-table">
                <thead>
                    <tr>
                        <th>Parameter in <code>config.php</code></th>
                        <th>Standardwert</th>
                        <th>Beschreibung</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td><code>mail_from_address</code></td>
                        <td><code>noreply@pdf-werkstatt.local</code></td>
                        <td>Offizielle <strong>Absender-E-Mail-Adresse</strong> für Passwort-Zurücksetzungs-Mails und Dokumenten-Freigaben.</td>
                    </tr>
                    <tr>
                        <td><code>mail_from_name</code></td>
                        <td><code>PDF-Werkstatt Pro</code></td>
                        <td>Angezeigter <strong>Absendername</strong> in ausgehenden E-Mails.</td>
                    </tr>
                    <tr>
                        <td><code>mail_transport</code></td>
                        <td><code>mail</code></td>
                        <td>Versandart: <code>'smtp'</code> für direkten Versand über den konfigurierten SMTP-Server (ohne externe Bibliotheken ab PHP 5.4+) oder <code>'mail'</code> für den PHP-eigenen <code>mail()</code>-Befehl.</td>
                    </tr>
                    <tr>
                        <td><code>smtp_host</code> / <code>smtp_port</code></td>
                        <td><code>''</code> / <code>587</code></td>
                        <td>Hostname / IP-Adresse und Port (<code>25</code>, <code>465</code> oder <code>587</code>) des <strong>SMTP-Servers</strong>.</td>
                    </tr>
                    <tr>
                        <td><code>smtp_encryption</code></td>
                        <td><code>tls</code></td>
                        <td>Verschlüsselung der SMTP-Verbindung: <code>'tls'</code> (STARTTLS), <code>'ssl'</code> (SMTPS) oder <code>'none'</code>.</td>
                    </tr>
                    <tr>
                        <td><code>smtp_auth</code> / <code>smtp_username</code> / <code>smtp_password</code></td>
                        <td><code>true</code> / <code>''</code> / <code>''</code></td>
                        <td>Zugangsdaten für die SMTP-Authentifizierung (<code>AUTH LOGIN</code>).</td>
                    </tr>
                    <tr>
                        <td><code>user_quota_mb</code></td>
                        <td><code>250</code> (MB)</td>
                        <td>Maximale <strong>Speichergröße in Megabyte (MB)</strong>, die jedem angemeldeten Kontobesitzer in seinem persönlichen Tresor (<code>storage/users/&lt;id&gt;/</code>) zur Verfügung steht (<code>0</code> = unbegrenzt).</td>
                    </tr>
                    <tr>
                        <td><code>public_quota_mb</code></td>
                        <td><code>100</code> (MB)</td>
                        <td>Maximale Speichergröße in Megabyte (MB) für den öffentlichen Gast-Tresor (<code>storage/workspace/</code>).</td>
                    </tr>
                    <tr>
                        <td><code>include_versions_in_quota</code></td>
                        <td><code>true</code></td>
                        <td>Legt fest, ob die automatischen Dateiversionen (<code>versions/</code>) auf das Speicherplatz-Kontingent des Benutzers angerechnet werden.</td>
                    </tr>
                    <tr>
                        <td><code>max_login_attempts</code> / <code>login_lockout_seconds</code></td>
                        <td><code>8</code> / <code>300</code> (Sek.)</td>
                        <td><strong>Brute-Force-Schutz:</strong> Sperrt IP-Adressen nach 8 fehlgeschlagenen Anmelde- oder Token-Versuchen automatisch für 5 Minuten (300 Sekunden).</td>
                    </tr>
                </tbody>
            </table>
            <h3>Integrierte Sicherheitsmechanismen (Hardening)</h3>
            <ul>
                <li><strong>Vollständige Verzeichnis-Abschottung (<code>.htaccess</code>):</strong> Direkter HTTP-Zugriff auf <code>config.php</code>, <code>includes/</code> und das gesamte <code>storage/</code>-Verzeichnis ist auf Webserver-Ebene komplett gesperrt (<code>403 Forbidden</code>). Dateien können ausschließlich über authentifizierte <code>api.php</code>-Aufrufe geladen werden.</li>
                <li><strong>CSRF-Schutz &amp; Session-Hardening:</strong> Alle schreibenden API-Aktionen erfordern ein kryptographisches, sitzungsgebundenes <code>X-CSRF-Token</code>. Bei Anmeldung, Registrierung, Passwortänderung und Abmeldung wird die Session-ID automatisch rotiert (Schutz gegen Session Fixation) und Cookies als <code>HttpOnly</code> sowie <code>SameSite=Lax</code> gesetzt.</li>
                <li><strong>Timing-Safe Kryptographie:</strong> Passwort-Hashes (PBKDF2-HMAC-SHA256 mit 10.000 Iterationen + individuellem 128-Bit-Salt) und Tokens werden mit zeitkonstanten Vergleichen (<code>hash_equals</code>) geprüft, um Timing-Seitenkanalangriffe auszuschließen.</li>
                <li><strong>Content-Security-Policy (CSP):</strong> Strikte HTTP-Security-Header (<code>default-src 'self'</code>, <code>object-src 'none'</code>, <code>X-Content-Type-Options: nosniff</code>, <code>X-Frame-Options: SAMEORIGIN</code>) unterbinden externe Datenabflüsse und Cross-Site-Scripting (XSS).</li>
            </ul>
            <h3>Nutzungsstatistik für den Administrator (<code>storage/nutzungsstatistik.txt</code>)</h3>
            <p>
                Für den Administrator legt die Anwendung automatisch eine fortlaufend aktualisierte, übersichtlich formatierte <strong>Nutzungsstatistik im Verzeichnis <code>storage/</code></strong> ab (durch <code>storage/.htaccess</code> vor öffentlichem Web-Zugriff geschützt, direkt per FTP/SSH oder Dateimanager einsehbar):
            </p>
            <ul>
                <li><strong><code>storage/nutzungsstatistik.txt</code> (Lesbarer Textbericht für den Administrator):</strong> Zeigt auf einen Blick, wie viele Personen ein Benutzerkonto registriert haben, wie oft sich angemeldet wurde (inkl. tabellarischer Konto-Übersicht mit Registrierungsdatum, letztem Login, Login-Anzahl und belegtem Tresor-Speicherplatz) sowie wie stark das Programm und die einzelnen PDF-Werkzeuge genutzt werden (Sitzungen, Seitenaufrufe, Monatsübersicht und 30-Tage-Tagesverlauf).</li>
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
                        <li><strong>Festplattenplatz:</strong> ca. <strong>35 MB</strong> für das Programmpaket (inkl. deutscher &amp; englischer Offline-OCR-Sprachdaten) zuzüglich Speicherplatz für die Benutzer-Tresore in <code>storage/</code>.</li>
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
                    Das Verzeichnis <code>storage/</code> (inklusive der Unterordner <code>storage/users/</code>, <code>storage/workspace/</code>, <code>storage/temp/</code> und <code>storage/ratelimit/</code>) benötigt Schreibrechte für den Webserver-Benutzer (z. B. <code>www-data</code>). Beim ersten Aufruf legt <strong>PDF-Werkstatt Pro</strong> fehlende Unterordner und Schutzdateien automatisch selbst an:
                    <br><code>chmod -R 750 storage/ &amp;&amp; chown -R www-data:www-data storage/</code>
                </li>
                <li>
                    <strong>Optional: PHP-Upload-Limits für sehr große PDF-Akten anpassen (<code>php.ini</code> oder <code>.htaccess</code>):</strong><br>
                    Für das Speichern großer mehrhundertseitiger PDF-Akten im Tresor empfehlen sich folgende PHP-Einstellungen:<br>
                    <code>upload_max_filesize = 64M</code> &nbsp;|&nbsp; <code>post_max_size = 64M</code> &nbsp;|&nbsp; <code>memory_limit = 256M</code>
                </li>
                <li>
                    <strong>Grundkonfiguration in <code>config.php</code> anpassen:</strong><br>
                    Öffnen Sie die Datei <code>config.php</code> im Texteditor und tragen Sie bei Bedarf Ihren SMTP-Mailserver (<code>smtp_host</code>, <code>smtp_port</code>, <code>mail_from_address</code>) sowie das gewünschte Speicherplatz-Kontingent pro Konto (<code>user_quota_mb</code>, Standard: <code>250</code> MB) ein.
                </li>
                <li>
                    <strong>Fertig — Anwendung im Browser aufrufen:</strong><br>
                    Rufen Sie <code>https://ihr-server.de/pdf-werkstatt/</code> im Browser auf. Die Anwendung ist sofort betriebsbereit.
                </li>
            </ol>

            <h3>3. Skalierbarkeit &amp; Lastverteilung (Wie viele Nutzer verkraftet das System?)</h3>
            <p>
                Durch die hybride <strong>Client-Side-Architektur</strong> ist <strong>PDF-Werkstatt Pro</strong> außergewöhnlich hoch skalierbar:
            </p>
            <ul>
                <li>
                    <strong>99 % der Rechenlast laufen auf dem PC des Anwenders (Zero-Server-CPU-Load):</strong><br>
                    Sämtliche rechenintensiven PDF-Operationen — das Rendern der Seiten, Zusammenfügen (Merge), Teilen (Split), Komprimieren, sichere Schwärzen (Sanitize), PDF-Vergleich (Pixel-Diff), Barrierefreiheits-Prüfung (PDF/UA) und sogar die komplette <strong>optische Texterkennung (Tesseract-OCR)</strong> — werden im Browser des jeweiligen Anwenders ausgeführt. Der Webserver wird dadurch bei der PDF-Bearbeitung <strong>nicht mit CPU- oder RAM-Spitzen belastet</strong>!
                </li>
                <li>
                    <strong>Minimale Server-Belastung im laufenden Betrieb:</strong><br>
                    Der PHP-Server wird ausschließlich für kleine, schnelle Datei- und Konto-Operationen angesprochen (Anmeldung, Speichern/Laden aus dem persönlichen Tresor, 5-Minuten-Auto-Save mit sofortiger Session-Sperrfreigabe <code>session_write_close()</code> sowie Dateisperren via <code>LOCK_EX</code>).
                </li>
                <li>
                    <strong>Empfohlene Nutzerzahlen auf einem einzelnen Standard-Webserver:</strong>
                    <ul>
                        <li><strong>Gleichzeitige reine PDF-Bearbeitung (Editor, OCR, Merge, Split, Konverter, PDF/UA):</strong> <strong>500 bis 5.000+ gleichzeitige Nutzer</strong> auf einem einzigen Standard-Webserver, da der Server hierbei nur einmalig die statischen Programmdateien ausliefert (per Browser-Cache &amp; GZIP beschleunigt).</li>
                        <li><strong>Aktive Tresor-Kontoinhaber (mit Login &amp; 5-Minuten-Auto-Save):</strong> Problemlos <strong>500 bis 2.500 registrierte Konten</strong> (bzw. <strong>100–300 gleichzeitig im Tresor speichernde Nutzer</strong>) auf reinem Dateisystem-Speicher (SSD/NVMe) mit minimalem RAM-Bedarf.</li>
                    </ul>
                </li>
                <li>
                    <strong>Speicherplatz-Planung (Storage-Skalierung):</strong><br>
                    Über den Parameter <code>user_quota_mb</code> in <code>config.php</code> lässt sich der maximale Speicherbedarf exakt kalkulieren (Beispiel: 100 aktive Kontoinhaber × 250 MB Kontingent = maximal 25 GB Festplattenplatz im Ordner <code>storage/users/</code>).
                </li>
            </ul>

            <h3>4. Empfohlene Server-Dimensionierung nach Nutzerzahl</h3>
            <p>
                Da die gesamte PDF- und OCR-Berechnung auf den Client-PCs stattfindet, sind für den Server vor allem <strong>schneller SSD-/NVMe-Speicher</strong> (für die Tresor-Dateien) und eine saubere <strong>PHP-FPM-Worker-Konfiguration</strong> entscheidend:
            </p>
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
                        <td><strong>2 vCPU-Kerne</strong><br><strong>2 – 4 GB RAM</strong></td>
                        <td><strong>40 – 60 GB SSD</strong><br>(bei 250 MB Tresor-Quota pro Konto)</td>
                        <td>Standard-Webspace oder kleine Linux-VM, Apache 2.4 + PHP 7.4/8.x</td>
                    </tr>
                    <tr>
                        <td><strong>Stufe M</strong><br>(Behörde / Mittelstand / Dienststelle)</td>
                        <td><strong>500 – 1.000 Nutzer</strong><br>(ca. 100–250 gleichzeitig aktiv)</td>
                        <td><strong>4 vCPU-Kerne</strong><br><strong>8 GB RAM</strong></td>
                        <td><strong>250 – 500 GB NVMe-SSD</strong><br>(RAID 1 / tägliches Backup von <code>storage/</code>)</td>
                        <td>Debian / Ubuntu / RHEL VM, Apache 2.4 (Event-MPM) oder Nginx + <strong>PHP-FPM</strong> (<code>pm.max_children = 50</code>) + OPcache</td>
                    </tr>
                    <tr>
                        <td><strong>Stufe L</strong><br>(Großbehörde / Landesbetrieb)</td>
                        <td><strong>2.500 – 5.000+ Nutzer</strong><br>(300–1.000+ gleichzeitig aktiv)</td>
                        <td><strong>8 vCPU-Kerne</strong><br><strong>16 GB RAM</strong></td>
                        <td><strong>1 – 2 TB Enterprise NVMe-SSD</strong><br>(inkl. Snapshot-Backup für <code>storage/</code>)</td>
                        <td>Linux-Server mit Apache 2.4 (Event-MPM) / Nginx, <strong>PHP 8.2+ FPM</strong> (<code>pm.max_children = 120</code>, OPcache aktiv), 1 Gbit/s LAN-Anbindung</td>
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
