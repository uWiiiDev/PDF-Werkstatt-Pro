<?php
/**
 * PDF-Werkstatt Pro (v1.0) - Desktop Web Suite (Main Application Shell)
 * Compatible with PHP 5.4+ up to PHP 8.4+ (Pure Webspace, No shell_exec)
 */
define('PDFSTUDIO_ROOT', __DIR__);
$GLOBALS['PDFSTUDIO_BOOT_OK'] = false;

function pdfstudio_boot_shutdown_check()
{
    if (!empty($GLOBALS['PDFSTUDIO_BOOT_OK'])) {
        return;
    }
    $err = function_exists('error_get_last') ? error_get_last() : null;
    if ($err && in_array((int)$err['type'], array(1, 4, 16, 64, 256), true)) {
        if (!headers_sent()) {
            header('Content-Type: text/html; charset=UTF-8');
        }
        echo '<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><title>PDF-Werkstatt Pro — Server-Diagnose</title></head>';
        echo '<body style="background:#14171f;color:#f1f5f9;font-family:sans-serif;padding:32px;">';
        echo '<div style="max-width:740px;margin:0 auto;background:#1d222e;border:1px solid #ef4444;border-radius:10px;padding:24px;">';
        echo '<h2 style="color:#f87171;margin-top:0;">⚠️ Startfehler auf dem Server erkannt (PHP ' . htmlspecialchars(PHP_VERSION, ENT_QUOTES, 'UTF-8') . ')</h2>';
        echo '<p>Beim Laden der Anwendung ist folgender PHP-Fehler aufgetreten:</p>';
        echo '<pre style="background:#0f1117;padding:14px;border-radius:6px;overflow-x:auto;color:#fbbf24;font-size:13px;">'
           . htmlspecialchars($err['message'] . "\nDatei: " . $err['file'] . ' (Zeile ' . $err['line'] . ')', ENT_QUOTES, 'UTF-8')
           . '</pre>';
        echo '<p style="font-size:13px;color:#94a3b8;line-height:1.6;">'
           . '<strong>Häufigste Ursachen beim Kopieren auf einen Apache-Server:</strong><br>'
           . '1. Die Unterordner <code>includes/</code>, <code>assets/</code> oder <code>storage/</code> wurden nicht mitkopiert oder haben keine Leserechte für Apache (Lösung: <code>chmod -R 755 . &amp;&amp; chmod -R 775 storage/</code>).<br>'
           . '2. Rufen Sie zur genauen Prüfung <a href="diagnose.php" style="color:#60a5fa;">diagnose.php</a> im Browser auf.'
           . '</p></div></body></html>';
    }
}
register_shutdown_function('pdfstudio_boot_shutdown_check');

if (!is_readable(__DIR__ . '/includes/bootstrap.php')) {
    if (!headers_sent()) {
        header('Content-Type: text/html; charset=UTF-8');
    }
    exit('<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><title>PDF-Werkstatt Pro — Installationshinweis</title></head><body style="background:#14171f;color:#f1f5f9;font-family:sans-serif;padding:32px;"><div style="max-width:700px;margin:0 auto;background:#1d222e;border:1px solid #f59e0b;border-radius:10px;padding:24px;"><h2 style="color:#fbbf24;margin-top:0;">⚠️ Datei <code>includes/bootstrap.php</code> fehlt oder ist nicht lesbar</h2><p>Bitte stellen Sie sicher, dass der Unterordner <code>includes/</code> vollständig auf den Server kopiert wurde und Leserechte für den Webserver besitzt (<code>chmod -R 755 .</code>).</p></div></body></html>');
}

require_once __DIR__ . '/includes/bootstrap.php';

$GLOBALS['PDFSTUDIO_BOOT_OK'] = true;
pdfstudio_enforce_app_gatekeeper(false);
pdfstudio_record_stat('pageview');
$serverInfo = pdfstudio_get_server_info();
?><!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>PDF-Werkstatt Pro v<?php echo htmlspecialchars(PDFSTUDIO_VERSION, ENT_QUOTES, 'UTF-8'); ?> — Desktop PDF Suite</title>
    <link rel="stylesheet" href="assets/css/desktop.css?v=<?php echo urlencode(PDFSTUDIO_VERSION) . '.' . (int)@filemtime(__DIR__ . '/assets/css/desktop.css'); ?>">
    <!-- 100% Local Offline Engines (No Internet or CDN required) -->
    <script>
        window.PDFSTUDIO_CSRF_TOKEN = <?php echo json_encode(pdfstudio_get_csrf_token()); ?>;
        window.PDFSTUDIO_VERSION = <?php echo json_encode(PDFSTUDIO_VERSION); ?>;
    </script>
    <script src="assets/vendor/pdf-lib.min.js"></script>
    <script src="assets/vendor/pdf.min.js"></script>
    <script src="assets/vendor/jszip.min.js"></script>
    <script src="assets/vendor/tesseract/tesseract.min.js"></script>
    <script src="assets/vendor/mammoth.browser.min.js"></script>
    <script src="assets/vendor/xlsx.full.min.js"></script>
</head>
<body class="theme-dark">

<div class="desktop-shell" id="desktopShell">

    <!-- ==================================================================
         1. WINDOW TITLEBAR (Row 1 — Brand, View Switcher, System Controls)
         ================================================================== -->
    <header class="titlebar">
        <div class="titlebar-left">
            <div class="app-brand">
                <span class="app-brand-badge">PDF</span>
                <span>PDF-Werkstatt Pro <small style="font-size:10.5px;opacity:0.75;font-weight:600;">v<?php echo htmlspecialchars(PDFSTUDIO_VERSION, ENT_QUOTES, 'UTF-8'); ?></small></span>
            </div>

            <!-- Quick Access Mini Icons -->
            <div class="quick-access-bar">
                <button type="button" class="qa-btn" data-cmd="open-pdf" title="PDF öffnen (Strg+O)">📂</button>
                <button type="button" class="qa-btn" data-cmd="merge-files" title="Mehrere PDF-Dateien zusammenführen">📑</button>
                <button type="button" class="qa-btn" data-cmd="export-pdf" title="PDF speichern / herunterladen (Strg+S)">💾</button>
                <button type="button" class="qa-btn" data-cmd="undo" title="Rückgängig (Strg+Z)">↶</button>
            </div>
        </div>

        <div class="titlebar-center">
            <!-- Compact Workspace Mode Switcher -->
            <div class="mode-switcher">
                <button type="button" class="mode-btn active" id="modeBtnLauncher" data-cmd="view-launcher" title="Startansicht">
                    🏠 Start
                </button>
                <button type="button" class="mode-btn" id="modeBtnOrganizer" data-cmd="view-organizer" title="Seiten-Sortierer">
                    ☷ Seiten-Studio
                </button>
                <button type="button" class="mode-btn" id="modeBtnEditor" data-cmd="view-editor" title="Visueller PDF-Editor">
                    ✎ PDF-Editor
                </button>
            </div>
        </div>

        <div class="titlebar-right">
            <?php if (!empty($_SESSION['pdfstudio_gatekeeper_user']) && (string)pdfstudio_config('auth_mode', 'none') !== 'none'): ?>
                <span style="font-size:11.5px;color:#cbd5e1;padding:0 6px;display:inline-flex;align-items:center;gap:5px;">
                    👤 <?php echo htmlspecialchars((string)$_SESSION['pdfstudio_gatekeeper_user']['display_name'], ENT_QUOTES, 'UTF-8'); ?>
                    <button type="button" class="qa-btn" data-cmd="open-change-password-modal" title="Eigenes Passwort ändern" style="width:22px;height:22px;font-size:11px;padding:0;margin-left:2px;">🔑</button>
                    <a href="index.php?gatekeeper_logout=1" title="Abmelden" style="color:#f87171;text-decoration:none;margin-left:3px;font-weight:700;">⎋</a>
                </span>
            <?php endif; ?>
            <button type="button" class="qa-btn" data-cmd="toggle-left-dock" title="Linke Seitenleiste ein-/ausblenden">◧</button>
            <button type="button" class="qa-btn" data-cmd="toggle-right-dock" title="Werkzeug-Eigenschaften rechts ein-/ausblenden">◨</button>
            <button type="button" class="qa-btn" data-cmd="toggle-theme" title="Dark / Light Theme wechseln">◐</button>
            <button type="button" class="qa-btn" id="btnFullscreenTitlebar" data-cmd="toggle-fullscreen" title="Vollbild-Modus umschalten — Browserelemente ausblenden (F11)">⛶</button>
            <button type="button" class="qa-btn" data-cmd="open-help" title="Benutzerhandbuch &amp; Funktionshilfe öffnen (F1)">❓</button>
            <a href="admin.php" class="qa-btn" title="Administrationsbereich öffnen (LDAP, Benutzer &amp; Systemeinstellungen)" style="text-decoration:none;">⚙️</a>
            <button type="button" class="qa-btn" id="btnToggleRibbonDeck" title="Ribbon-Menü ein-/ausklappen">▴</button>
        </div>
    </header>

    <!-- ==================================================================
         2. DEDICATED RIBBON CATEGORY TAB BAR (Row 2 — Never Scrolls)
         ================================================================== -->
    <nav class="ribbon-tabbar" id="ribbonTabsNav">
        <button type="button" class="ribbon-tab active" data-ribbon="home">🏠 Start</button>
        <button type="button" class="ribbon-tab" data-ribbon="edit">✎ Bearbeiten</button>
        <button type="button" class="ribbon-tab" data-ribbon="pages">📑 Seiten</button>
        <button type="button" class="ribbon-tab" data-ribbon="forms">📋 Formulare &amp; Links</button>
        <button type="button" class="ribbon-tab" data-ribbon="protect">🛡️ Layout &amp; Schutz</button>
        <button type="button" class="ribbon-tab" data-ribbon="convert">🔄 Konverter &amp; OCR</button>
        <button type="button" class="ribbon-tab" data-ribbon="a11y">♿ Barrierefreiheit</button>
    </nav>

    <!-- ==================================================================
         3. DESKTOP RIBBON DECK (Row 3 — Contextual Tool Groups per Tab)
         ================================================================== -->
    <div class="ribbon-deck" id="ribbonDeck">

        <!-- TAB 1: START -->
        <div class="ribbon-pane active" data-ribbon-pane="home">
            <div class="ribbon-section">
                <div class="ribbon-section-body">
                    <button type="button" class="ribbon-btn" data-cmd="open-pdf">
                        <span class="rb-icon">📂</span>
                        <span class="rb-label">Öffnen</span>
                    </button>
                    <button type="button" class="ribbon-btn" data-cmd="new-blank-pdf">
                        <span class="rb-icon">📄</span>
                        <span class="rb-label">Neu (A4)</span>
                    </button>
                </div>
                <div class="ribbon-section-title">Dokument</div>
            </div>

            <div class="ribbon-sep"></div>

            <div class="ribbon-section">
                <div class="ribbon-section-body">
                    <button type="button" class="ribbon-btn" data-cmd="merge-files" title="Mehrere PDF-Dateien oder geöffnete Tabs auswählen, Reihenfolge anpassen und zu einem PDF zusammenführen">
                        <span class="rb-icon">📑</span>
                        <span class="rb-label">Zusammenführen</span>
                    </button>
                    <button type="button" class="ribbon-btn" data-cmd="open-split-modal">
                        <span class="rb-icon">✂️</span>
                        <span class="rb-label">Teilen</span>
                    </button>
                    <button type="button" class="ribbon-btn" data-cmd="open-compress-modal" title="PDF-Dateigröße verkleinern &amp; komprimieren">
                        <span class="rb-icon">📉</span>
                        <span class="rb-label">Komprimieren</span>
                    </button>
                    <button type="button" class="ribbon-btn" data-cmd="open-compare-modal">
                        <span class="rb-icon">⚖️</span>
                        <span class="rb-label">Vergleichen</span>
                    </button>
                    <button type="button" class="ribbon-btn" data-cmd="launch-tool-edit-text" title="Bestehenden PDF-Originaltext direkt anklicken und umschreiben">
                        <span class="rb-icon">I✎</span>
                        <span class="rb-label">Text ändern</span>
                    </button>
                    <button type="button" class="ribbon-btn" data-cmd="open-signature-modal">
                        <span class="rb-icon">✍️</span>
                        <span class="rb-label">Signatur</span>
                    </button>
                    <button type="button" class="ribbon-btn" data-cmd="open-a11y-modal">
                        <span class="rb-icon">♿</span>
                        <span class="rb-label">PDF/UA Check</span>
                    </button>
                    <button type="button" class="ribbon-btn" data-cmd="open-batch-modal" title="Mehrere PDF-Dateien gleichzeitig verarbeiten (z. B. Auto-Fix PDF/UA, Wasserzeichen, Seitenzahlen) und als ZIP herunterladen">
                        <span class="rb-icon">🗂️</span>
                        <span class="rb-label">Stapel-Modus</span>
                    </button>
                    <button type="button" class="ribbon-btn" data-cmd="open-zugferd-modal" title="ZUGFeRD / XRechnung (E-Rechnung) auslesen, prüfen oder XML in PDF einbetten">
                        <span class="rb-icon">🧾</span>
                        <span class="rb-label">E-Rechnung</span>
                    </button>
                    <button type="button" class="ribbon-btn" data-cmd="open-attachments-modal" title="Eingebettete Dateianlagen (PDF-Portfolio) anzeigen, herunterladen oder beliebige Dateien ins PDF einbetten">
                        <span class="rb-icon">📎</span>
                        <span class="rb-label">Anlagen</span>
                    </button>
                    <button type="button" class="ribbon-btn" data-cmd="open-bookmarks-modal" title="Lesezeichen (Outlines) bearbeiten und automatisches Inhaltsverzeichnis-Deckblatt erzeugen">
                        <span class="rb-icon">🔖</span>
                        <span class="rb-label">Lesezeichen</span>
                    </button>
                </div>
                <div class="ribbon-section-title">Direktwerkzeuge</div>
            </div>

            <div class="ribbon-sep"></div>

            <div class="ribbon-section">
                <div class="ribbon-section-body">
                    <button type="button" class="ribbon-btn rb-primary" data-cmd="export-pdf">
                        <span class="rb-icon">💾</span>
                        <span class="rb-label">Download</span>
                    </button>
                    <button type="button" class="ribbon-btn" data-cmd="open-email-modal" title="Aktuelles PDF direkt als E-Mail-Anhang über den konfigurierten SMTP-Server versenden">
                        <span class="rb-icon">📧</span>
                        <span class="rb-label">E-Mail</span>
                    </button>
                    <button type="button" class="ribbon-btn" data-cmd="print-pdf">
                        <span class="rb-icon">🖨️</span>
                        <span class="rb-label">Drucken</span>
                    </button>
                    <button type="button" class="ribbon-btn" id="btnFullscreenRibbon" data-cmd="toggle-fullscreen" title="Vollbild-Modus umschalten — Browser-Adressleiste und Tabs ausblenden (F11)">
                        <span class="rb-icon" id="rbFullscreenIcon">⛶</span>
                        <span class="rb-label" id="rbFullscreenLabel">Vollbild</span>
                    </button>
                    <button type="button" class="ribbon-btn" data-cmd="open-help" title="Ausführliches Benutzerhandbuch mit allen Funktionen öffnen (F1)">
                        <span class="rb-icon">❓</span>
                        <span class="rb-label">Hilfe</span>
                    </button>
                </div>
                <div class="ribbon-section-title">Export, Drucken &amp; Ansicht</div>
            </div>
        </div>

        <!-- TAB 2: BEARBEITEN & SIGNIEREN -->
        <div class="ribbon-pane" data-ribbon-pane="edit" id="editorToolsGroup">
            <div class="ribbon-section">
                <div class="ribbon-section-body">
                    <button type="button" class="ribbon-btn tool-btn active" data-tool="select" title="Elemente auswählen, mit der Maus verschieben oder per Doppelklick bearbeiten">
                        <span class="rb-icon">↖</span>
                        <span class="rb-label">Auswahl</span>
                    </button>
                    <button type="button" class="ribbon-btn tool-btn" data-tool="edit-text" title="Vorhandenen Originaltext im PDF anklicken und direkt umschreiben / ersetzen">
                        <span class="rb-icon"><b>I✎</b></span>
                        <span class="rb-label">Text ändern</span>
                    </button>
                    <button type="button" class="ribbon-btn tool-btn" data-tool="text" title="Neuen Text an beliebiger Stelle einfügen">
                        <span class="rb-icon"><b>T+</b></span>
                        <span class="rb-label">Neuer Text</span>
                    </button>
                    <button type="button" class="ribbon-btn tool-btn" data-tool="pen">
                        <span class="rb-icon">✒️</span>
                        <span class="rb-label">Stift</span>
                    </button>
                    <button type="button" class="ribbon-btn tool-btn" data-tool="highlight">
                        <span class="rb-icon">🖍️</span>
                        <span class="rb-label">Marker</span>
                    </button>
                    <button type="button" class="ribbon-btn tool-btn" data-tool="rect">
                        <span class="rb-icon">▭</span>
                        <span class="rb-label">Rahmen</span>
                    </button>
                </div>
                <div class="ribbon-section-title">Zeichnen &amp; Text</div>
            </div>

            <div class="ribbon-sep"></div>

            <div class="ribbon-section">
                <div class="ribbon-section-body">
                    <button type="button" class="ribbon-btn tool-btn" data-tool="redact">
                        <span class="rb-icon">⬛</span>
                        <span class="rb-label">Schwärzen</span>
                    </button>
                    <button type="button" class="ribbon-btn" data-cmd="open-autoredact-modal" title="Intelligente Mustersuche &amp; Auto-Schwärzung (IBAN, E-Mail, Telefon, Datum, Namen)">
                        <span class="rb-icon">🔍⬛</span>
                        <span class="rb-label">Auto-Schwärzen</span>
                    </button>
                    <button type="button" class="ribbon-btn" data-cmd="sanitize-redactions" title="Geschwärzte Seiten physisch flachrechnen (Text darunter unwiderruflich entfernen)">
                        <span class="rb-icon">🛡️</span>
                        <span class="rb-label">Sanitize</span>
                    </button>
                    <button type="button" class="ribbon-btn tool-btn" data-tool="stamp">
                        <span class="rb-icon">🏷️</span>
                        <span class="rb-label">Stempel</span>
                    </button>
                    <button type="button" class="ribbon-btn" data-cmd="open-signature-modal">
                        <span class="rb-icon">✍️</span>
                        <span class="rb-label">Signatur</span>
                    </button>
                    <button type="button" class="ribbon-btn" data-cmd="insert-image-overlay">
                        <span class="rb-icon">🖼️</span>
                        <span class="rb-label">Bild/Logo</span>
                    </button>
                    <button type="button" class="ribbon-btn" data-cmd="open-qrcode-modal" title="QR-Code (Link, Text, Aktenzeichen) offline erzeugen und auf der PDF-Seite platzieren">
                        <span class="rb-icon">📱</span>
                        <span class="rb-label">QR-Code</span>
                    </button>
                </div>
                <div class="ribbon-section-title">Stempel, Signatur &amp; Schwärzen</div>
            </div>

            <div class="ribbon-sep"></div>

            <div class="ribbon-section">
                <div class="ribbon-section-body">
                    <button type="button" class="ribbon-btn" data-cmd="undo">
                        <span class="rb-icon">↶</span>
                        <span class="rb-label">Zurück</span>
                    </button>
                    <button type="button" class="ribbon-btn" data-cmd="delete-selected-annotation">
                        <span class="rb-icon">🗑</span>
                        <span class="rb-label">Löschen</span>
                    </button>
                    <button type="button" class="ribbon-btn rb-primary" data-cmd="bake-annotations">
                        <span class="rb-icon">✔</span>
                        <span class="rb-label">Einbetten</span>
                    </button>
                </div>
                <div class="ribbon-section-title">Aktionen</div>
            </div>
        </div>

        <!-- TAB 3: SEITEN ORGANISIEREN -->
        <div class="ribbon-pane" data-ribbon-pane="pages">
            <div class="ribbon-section">
                <div class="ribbon-section-body">
                    <button type="button" class="ribbon-btn" data-cmd="view-organizer">
                        <span class="rb-icon">☷</span>
                        <span class="rb-label">Sortieren</span>
                    </button>
                    <button type="button" class="ribbon-btn rb-primary" data-cmd="merge-files" title="Mehrere PDF-Dateien auswählen, Reihenfolge anpassen und zu einem PDF zusammenführen">
                        <span class="rb-icon">📑</span>
                        <span class="rb-label">Zusammenführen</span>
                    </button>
                    <button type="button" class="ribbon-btn" data-cmd="merge-all-tabs" title="Alle aktuell geöffneten PDF-Tabs sofort zu einem Dokument zusammenführen">
                        <span class="rb-icon">⇄</span>
                        <span class="rb-label">Tabs verbinden</span>
                    </button>
                    <button type="button" class="ribbon-btn" data-cmd="open-split-modal">
                        <span class="rb-icon">✂️</span>
                        <span class="rb-label">Teilen</span>
                    </button>
                </div>
                <div class="ribbon-section-title">Zusammenführen &amp; Teilen</div>
            </div>

            <div class="ribbon-sep"></div>

            <div class="ribbon-section">
                <div class="ribbon-section-body">
                    <button type="button" class="ribbon-btn" data-cmd="rotate-left">
                        <span class="rb-icon">⟲</span>
                        <span class="rb-label">Links</span>
                    </button>
                    <button type="button" class="ribbon-btn" data-cmd="rotate-right">
                        <span class="rb-icon">⟳</span>
                        <span class="rb-label">Rechts</span>
                    </button>
                    <button type="button" class="ribbon-btn" data-cmd="rotate-all-right">
                        <span class="rb-icon">🔄</span>
                        <span class="rb-label">Alle 90°</span>
                    </button>
                    <button type="button" class="ribbon-btn" data-cmd="reverse-pages">
                        <span class="rb-icon">⇅</span>
                        <span class="rb-label">Umkehren</span>
                    </button>
                    <button type="button" class="ribbon-btn" data-cmd="open-crop-modal">
                        <span class="rb-icon">📐</span>
                        <span class="rb-label">Zuschneiden</span>
                    </button>
                    <button type="button" class="ribbon-btn" data-cmd="open-nup-modal" title="Mehrseiten-Drucklayout (2-auf-1, 4-auf-1) oder Faltbroschüre erzeugen">
                        <span class="rb-icon">📖</span>
                        <span class="rb-label">Broschüre / N-up</span>
                    </button>
                </div>
                <div class="ribbon-section-title">Geometrie &amp; Zuschnitt</div>
            </div>

            <div class="ribbon-sep"></div>

            <div class="ribbon-section">
                <div class="ribbon-section-body">
                    <button type="button" class="ribbon-btn" data-cmd="add-blank-page">
                        <span class="rb-icon">📄+</span>
                        <span class="rb-label">Leere S.</span>
                    </button>
                    <button type="button" class="ribbon-btn" data-cmd="duplicate-page">
                        <span class="rb-icon">📋</span>
                        <span class="rb-label">Klonen</span>
                    </button>
                    <button type="button" class="ribbon-btn" data-cmd="add-current-to-tray">
                        <span class="rb-icon">🗂️</span>
                        <span class="rb-label">Mappe +</span>
                    </button>
                    <button type="button" class="ribbon-btn" data-cmd="delete-page">
                        <span class="rb-icon">🗑️</span>
                        <span class="rb-label">Löschen</span>
                    </button>
                    <button type="button" class="ribbon-btn" data-cmd="open-bookmarks-modal" title="Lesezeichen (Outlines) bearbeiten und automatisches Inhaltsverzeichnis als erste Seite einfügen">
                        <span class="rb-icon">🔖</span>
                        <span class="rb-label">Lesezeichen / IHV</span>
                    </button>
                </div>
                <div class="ribbon-section-title">Seitenverwaltung</div>
            </div>
        </div>

        <!-- TAB 4: FORMULARE (ACROFORMS), LINKS & VERGLEICH -->
        <div class="ribbon-pane" data-ribbon-pane="forms">
            <div class="ribbon-section">
                <div class="ribbon-section-body">
                    <button type="button" class="ribbon-btn tool-btn" data-tool="form-text" title="Interaktives AcroForm-Textfeld auf der Seite platzieren">
                        <span class="rb-icon">⌨️</span>
                        <span class="rb-label">Textfeld</span>
                    </button>
                    <button type="button" class="ribbon-btn tool-btn" data-tool="form-check" title="Interaktive AcroForm-Checkbox platzieren">
                        <span class="rb-icon">☑️</span>
                        <span class="rb-label">Checkbox</span>
                    </button>
                    <button type="button" class="ribbon-btn tool-btn" data-tool="form-select" title="Interaktives AcroForm-Dropdown-Menü platzieren">
                        <span class="rb-icon">▾</span>
                        <span class="rb-label">Dropdown</span>
                    </button>
                    <button type="button" class="ribbon-btn" data-cmd="flatten-form" title="Alle Formularfelder dauerhaft in festen Text umwandeln">
                        <span class="rb-icon">🔒</span>
                        <span class="rb-label">Sperren</span>
                    </button>
                    <button type="button" class="ribbon-btn rb-primary" data-cmd="open-mailmerge-modal" title="Formulardaten nach CSV/JSON exportieren oder PDF-Formular per CSV-Tabelle als Serienbrief befüllen">
                        <span class="rb-icon">📊</span>
                        <span class="rb-label">Serienbrief / CSV</span>
                    </button>
                </div>
                <div class="ribbon-section-title">Interaktive PDF-Formulare (AcroForms)</div>
            </div>

            <div class="ribbon-sep"></div>

            <div class="ribbon-section">
                <div class="ribbon-section-body">
                    <button type="button" class="ribbon-btn tool-btn" data-tool="link" title="Klickbaren Web-Link oder internen Seitensprung auf der Seite anlegen">
                        <span class="rb-icon">🔗</span>
                        <span class="rb-label">Link / Sprung</span>
                    </button>
                    <button type="button" class="ribbon-btn" data-cmd="open-qrcode-modal" title="QR-Code offline erzeugen und auf der PDF-Seite platzieren">
                        <span class="rb-icon">📱</span>
                        <span class="rb-label">QR-Code</span>
                    </button>
                </div>
                <div class="ribbon-section-title">Hyperlinks &amp; QR</div>
            </div>

            <div class="ribbon-sep"></div>

            <div class="ribbon-section">
                <div class="ribbon-section-body">
                    <button type="button" class="ribbon-btn rb-primary" data-cmd="open-compare-modal">
                        <span class="rb-icon">⚖️</span>
                        <span class="rb-label">PDF-Vergleich</span>
                    </button>
                    <button type="button" class="ribbon-btn" data-cmd="open-zugferd-modal" title="ZUGFeRD 2.x / Factur-X / XRechnung prüfen, auslesen oder XML einbetten">
                        <span class="rb-icon">🧾</span>
                        <span class="rb-label">E-Rechnung</span>
                    </button>
                    <button type="button" class="ribbon-btn" data-cmd="open-attachments-modal" title="Eingebettete Dateianlagen (PDF-Portfolio) verwalten oder Dateien ins PDF einbetten">
                        <span class="rb-icon">📎</span>
                        <span class="rb-label">Anlagen</span>
                    </button>
                </div>
                <div class="ribbon-section-title">Vergleich, Anlagen &amp; E-Rechnung</div>
            </div>
        </div>

        <!-- TAB 5: LAYOUT, BATES, WASSERZEICHEN & KOMPRIMIEREN -->
        <div class="ribbon-pane" data-ribbon-pane="protect">
            <div class="ribbon-section">
                <div class="ribbon-section-body">
                    <button type="button" class="ribbon-btn" data-cmd="open-crop-modal">
                        <span class="rb-icon">📐</span>
                        <span class="rb-label">Zuschneiden</span>
                    </button>
                    <button type="button" class="ribbon-btn" data-cmd="open-nup-modal" title="2 oder 4 Seiten auf ein Blatt setzen oder Faltbroschüre erstellen">
                        <span class="rb-icon">📖</span>
                        <span class="rb-label">Broschüre / N-up</span>
                    </button>
                    <button type="button" class="ribbon-btn" data-cmd="open-bates-modal">
                        <span class="rb-icon">📑</span>
                        <span class="rb-label">Kopf/Fuß &amp; Bates</span>
                    </button>
                    <button type="button" class="ribbon-btn" data-cmd="apply-watermark">
                        <span class="rb-icon">💧</span>
                        <span class="rb-label">Wasserzeichen</span>
                    </button>
                    <button type="button" class="ribbon-btn" data-cmd="apply-page-numbers">
                        <span class="rb-icon">🔢</span>
                        <span class="rb-label">Seitenzahlen</span>
                    </button>
                </div>
                <div class="ribbon-section-title">Seitenlayout, Bates &amp; Stempelung</div>
            </div>

            <div class="ribbon-sep"></div>

            <div class="ribbon-section">
                <div class="ribbon-section-body">
                    <button type="button" class="ribbon-btn rb-primary" data-cmd="open-compress-modal" title="PDF komprimieren &amp; Dateigröße verkleinern">
                        <span class="rb-icon">📉</span>
                        <span class="rb-label">PDF komprimieren</span>
                    </button>
                    <button type="button" class="ribbon-btn" data-cmd="open-autoredact-modal" title="Intelligente Mustersuche &amp; Auto-Schwärzung (IBAN, E-Mail, Telefon, Datum, Namen)">
                        <span class="rb-icon">🔍⬛</span>
                        <span class="rb-label">Auto-Schwärzen</span>
                    </button>
                    <button type="button" class="ribbon-btn" data-cmd="sanitize-redactions">
                        <span class="rb-icon">🛡️</span>
                        <span class="rb-label">Sicher schwärzen</span>
                    </button>
                    <button type="button" class="ribbon-btn" data-cmd="open-sanitize-meta-modal" title="Metadaten- &amp; Forensik-Bereinigung: Versteckte Autoren, Zeitstempel, Skripte und Historien mit 1 Klick löschen">
                        <span class="rb-icon">🧹</span>
                        <span class="rb-label">Spuren löschen</span>
                    </button>
                    <button type="button" class="ribbon-btn" data-cmd="open-compress-modal" title="PDF-Metadaten (Titel, Autor, Betreff) bearbeiten">
                        <span class="rb-icon">🏷️</span>
                        <span class="rb-label">Metadaten</span>
                    </button>
                </div>
                <div class="ribbon-section-title">Komprimierung &amp; Sicherheit</div>
            </div>
        </div>

        <!-- TAB 6: KONVERTIEREN & OCR -->
        <div class="ribbon-pane" data-ribbon-pane="convert">
            <div class="ribbon-section">
                <div class="ribbon-section-body">
                    <button type="button" class="ribbon-btn" data-cmd="open-images">
                        <span class="rb-icon">🖼️</span>
                        <span class="rb-label">Bilder → PDF</span>
                    </button>
                    <button type="button" class="ribbon-btn" data-cmd="open-converter-modal">
                        <span class="rb-icon">📝</span>
                        <span class="rb-label">Office/Text → PDF</span>
                    </button>
                </div>
                <div class="ribbon-section-title">Import nach PDF</div>
            </div>

            <div class="ribbon-sep"></div>

            <div class="ribbon-section">
                <div class="ribbon-section-body">
                    <button type="button" class="ribbon-btn" data-cmd="open-compress-modal" title="PDF komprimieren &amp; Dateigröße verkleinern">
                        <span class="rb-icon">📉</span>
                        <span class="rb-label">Komprimieren</span>
                    </button>
                    <button type="button" class="ribbon-btn" data-cmd="export-current-png">
                        <span class="rb-icon">📷</span>
                        <span class="rb-label">Seite → PNG</span>
                    </button>
                    <button type="button" class="ribbon-btn" data-cmd="export-images-zip">
                        <span class="rb-icon">🗂️</span>
                        <span class="rb-label">Alle → ZIP</span>
                    </button>
                    <button type="button" class="ribbon-btn" data-cmd="extract-all-text">
                        <span class="rb-icon">📄</span>
                        <span class="rb-label">PDF → Text</span>
                    </button>
                </div>
                <div class="ribbon-section-title">Export aus PDF</div>
            </div>

            <div class="ribbon-sep"></div>

            <div class="ribbon-section">
                <div class="ribbon-section-body">
                    <button type="button" class="ribbon-btn rb-primary" data-cmd="make-searchable-pdf" title="Wandelt gescannte PDFs/Bilder per Offline-OCR in ein echt durchsuchbares Sandwich-PDF (mit hinterlegter Textebene) um">
                        <span class="rb-icon">🔎</span>
                        <span class="rb-label">Durchsuchbares PDF</span>
                    </button>
                    <button type="button" class="ribbon-btn" data-cmd="run-ocr-page" title="Erkennt den Text der aktuellen Seite per Offline-OCR und gibt ihn im Textfeld rechts aus">
                        <span class="rb-icon">🔍</span>
                        <span class="rb-label">OCR → Textfeld</span>
                    </button>
                    <button type="button" class="ribbon-btn" data-cmd="extract-page-text">
                        <span class="rb-icon">📖</span>
                        <span class="rb-label">Text lesen</span>
                    </button>
                </div>
                <div class="ribbon-section-title">Sandwich-OCR &amp; Texterkennung</div>
            </div>
        </div>

        <!-- TAB 7: BARRIEREFREIHEIT (PDF/UA & BITV 2.0 + TAG/ALT-TEXT EDITOR) -->
        <div class="ribbon-pane" data-ribbon-pane="a11y">
            <div class="ribbon-section">
                <div class="ribbon-section-body">
                    <button type="button" class="ribbon-btn rb-primary" data-cmd="open-a11y-modal">
                        <span class="rb-icon">♿</span>
                        <span class="rb-label">PDF/UA Prüfen</span>
                    </button>
                    <button type="button" class="ribbon-btn" data-cmd="quick-autofix-a11y">
                        <span class="rb-icon">🛠️</span>
                        <span class="rb-label">Auto-Fix</span>
                    </button>
                    <button type="button" class="ribbon-btn" data-cmd="export-a11y-report">
                        <span class="rb-icon">📊</span>
                        <span class="rb-label">Prüfbericht</span>
                    </button>
                    <button type="button" class="ribbon-btn" data-cmd="open-batch-modal" title="Mehrere PDFs in einem Durchgang automatisch nach PDF/UA barrierefrei machen">
                        <span class="rb-icon">🗂️</span>
                        <span class="rb-label">Stapel Auto-Fix</span>
                    </button>
                </div>
                <div class="ribbon-section-title">Prüfung &amp; Auto-Reparatur</div>
            </div>

            <div class="ribbon-sep"></div>

            <div class="ribbon-section">
                <div class="ribbon-section-body">
                    <button type="button" class="ribbon-btn tool-btn" data-tool="a11y-tag" data-tagtype="H1" title="Überschrift 1 (H1) im Lesebaum markieren">
                        <span class="rb-icon"><b>H1</b></span>
                        <span class="rb-label">Tag H1</span>
                    </button>
                    <button type="button" class="ribbon-btn tool-btn" data-tool="a11y-tag" data-tagtype="H2" title="Überschrift 2 (H2) im Lesebaum markieren">
                        <span class="rb-icon"><b>H2</b></span>
                        <span class="rb-label">Tag H2</span>
                    </button>
                    <button type="button" class="ribbon-btn tool-btn" data-tool="a11y-tag" data-tagtype="P" title="Textabsatz (P) im Lesebaum markieren">
                        <span class="rb-icon">¶</span>
                        <span class="rb-label">Absatz (P)</span>
                    </button>
                    <button type="button" class="ribbon-btn tool-btn" data-tool="a11y-tag" data-tagtype="Figure" title="Bild/Grafik (Figure) mit Alternativtext (/Alt) für Blinde markieren">
                        <span class="rb-icon">🖼️</span>
                        <span class="rb-label">Bild + Alt-Text</span>
                    </button>
                </div>
                <div class="ribbon-section-title">Visueller Tag-Baum &amp; Alternativtexte (/Alt)</div>
            </div>
        </div>

    </div>

    <!-- ==================================================================
         3. MULTI-DOCUMENT TABS BAR
         ================================================================== -->
    <div class="tabsbar">
        <div class="tabs-list" id="docTabsList">
            <!-- Dynamically populated tabs -->
        </div>
        <div class="tabs-actions">
            <button type="button" class="tool-btn" data-cmd="new-blank-pdf" title="Neues leeres PDF-Tab öffnen" style="height:24px;font-size:11px;">
                + Leeres PDF
            </button>
            <button type="button" class="tool-btn" data-cmd="merge-files" title="Mehrere PDF-Dateien auswählen, sortieren und zu einem PDF zusammenführen" style="height:24px;font-size:11px;">
                📑 PDF zusammenführen
            </button>
            <button type="button" class="tool-btn" data-cmd="merge-all-tabs" title="Alle geöffneten Dokument-Tabs sofort zu einem PDF zusammenführen" style="height:24px;font-size:11px;">
                ⇄ Alle Tabs zusammenführen
            </button>
        </div>
    </div>

    <!-- ==================================================================
         4. MAIN 3-COLUMN DESKTOP WORKSPACE
         ================================================================== -->
    <div class="workspace" id="mainWorkspace">

        <!-- LEFT DOCK: Pages & Sammelmappe -->
        <aside class="left-dock" id="leftDock">
            <div class="dock-tabs">
                <button type="button" class="dock-tab active" data-docktab="pages">Seiten</button>
                <button type="button" class="dock-tab" data-docktab="tray">Sammelmappe (<span id="trayCountBadge">0</span>)</button>
            </div>

            <!-- Tab 1: Page Thumbnails -->
            <div class="dock-panel" id="dockPanelPages">
                <div class="dock-header-actions">
                    <span id="leftPageSummary">Keine Datei geladen</span>
                    <div>
                        <button type="button" class="thumb-icon-btn" data-cmd="add-blank-page" title="Leere Seite hinzufügen">+</button>
                        <button type="button" class="thumb-icon-btn" data-cmd="delete-page" title="Aktuelle Seite löschen">🗑</button>
                    </div>
                </div>
                <div class="dock-body">
                    <div class="thumb-list" id="thumbnailList"></div>
                </div>
            </div>

            <!-- Tab 2: Sammelmappe (Cross-Document Page Collector) -->
            <div class="dock-panel hidden" id="dockPanelTray">
                <div class="dock-header-actions">
                    <span>Gesammelte Seiten</span>
                    <div style="display:flex;gap:4px;">
                        <button type="button" class="thumb-icon-btn" data-cmd="add-current-to-tray" title="Aktuelle Seite in Sammelmappe legen">+1</button>
                        <button type="button" class="thumb-icon-btn" data-cmd="build-pdf-from-tray" title="Neues PDF aus Sammelmappe erzeugen">✔</button>
                        <button type="button" class="thumb-icon-btn" data-cmd="clear-tray" title="Sammelmappe leeren">✕</button>
                    </div>
                </div>
                <div class="dock-body">
                    <p style="font-size:11.5px;color:var(--text-secondary);margin-bottom:10px;line-height:1.4;">
                        Sammeln Sie beliebige Seiten aus verschiedenen PDFs und erzeugen Sie daraus per Klick ein neues Dokument.
                    </p>
                    <button type="button" class="tool-btn btn-primary" data-cmd="build-pdf-from-tray" style="width:100%;margin-bottom:10px;">
                        Neues PDF aus Sammelmappe öffnen
                    </button>
                    <div class="thumb-list" id="trayList"></div>
                </div>
            </div>
        </aside>

        <!-- CENTER VIEWPORT -->
        <main class="center-viewport" id="centerViewport">
            <!-- Global Drag & Drop Overlay -->
            <div class="drop-overlay" id="dropOverlay">
                <div style="font-size:42px;">📄➕</div>
                <h2 style="font-size:18px;font-weight:700;">Dateien hier ablegen</h2>
                <p style="color:var(--text-secondary);">PDFs, Bilder (JPG/PNG/WebP), Word (.docx), Excel (.xlsx) oder Textdateien</p>
            </div>

            <!-- VIEW A: START VIEW -->
            <section class="launcher-view" id="viewLauncher">
                <div class="launcher-hero">
                    <div class="launcher-hero-text">
                        <h1>PDF-Werkstatt Pro v<?php echo htmlspecialchars(PDFSTUDIO_VERSION, ENT_QUOTES, 'UTF-8'); ?></h1>
                        <p>
                            Ziehen Sie eine PDF-Datei per Drag &amp; Drop in dieses Fenster oder klicken Sie rechts auf <strong>PDF-Datei öffnen</strong>.
                        </p>
                    </div>
                    <div class="launcher-hero-actions">
                        <button type="button" class="tool-btn btn-primary" data-cmd="open-pdf" style="height:40px;padding:0 18px;font-size:13.5px;">
                            📂 PDF-Datei öffnen
                        </button>
                    </div>
                </div>
            </section>

            <!-- VIEW B: MULTI-PAGE ORGANIZER GRID -->
            <section class="organizer-view hidden" id="viewOrganizer">
                <div class="organizer-toolbar">
                    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                        <strong>Seiten-Organisierer:</strong>
                        <span style="color:var(--text-secondary);font-size:12px;">Ziehen Sie Karten per Drag &amp; Drop zum Umsortieren</span>
                    </div>
                    <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                        <button type="button" class="tool-btn" data-cmd="rotate-all-left">⟲ Alle links</button>
                        <button type="button" class="tool-btn" data-cmd="rotate-all-right">⟳ Alle rechts</button>
                        <button type="button" class="tool-btn" data-cmd="reverse-pages">⇅ Reihenfolge umkehren</button>
                        <button type="button" class="tool-btn" data-cmd="add-blank-page">+ Leere Seite</button>
                        <button type="button" class="tool-btn" data-cmd="merge-files">📑 PDF zusammenführen</button>
                        <button type="button" class="tool-btn btn-primary" data-cmd="view-editor">✎ Im Editor öffnen</button>
                    </div>
                </div>
                <div class="organizer-grid" id="organizerGrid"></div>
            </section>

            <!-- VIEW C: VISUAL PDF STUDIO EDITOR -->
            <section class="editor-view hidden" id="viewEditor">
                <div class="page-stage-wrapper" id="pageStageWrapper">
                    <canvas id="pdfRenderCanvas"></canvas>
                    <canvas id="annotationCanvas"></canvas>
                </div>

                <!-- Floating Bottom Page, Search & Zoom Navigator -->
                <div class="floating-nav">
                    <button type="button" class="thumb-icon-btn" data-cmd="prev-page" title="Vorherige Seite">◀</button>
                    <span id="floatingPageIndicator" style="font-weight:600;min-width:90px;text-align:center;">Seite 1 / 1</span>
                    <button type="button" class="thumb-icon-btn" data-cmd="next-page" title="Nächste Seite">▶</button>
                    <span style="color:var(--border-strong);">|</span>
                    <button type="button" class="thumb-icon-btn" data-cmd="zoom-out" title="Verkleinern">−</button>
                    <span id="floatingZoomLabel" style="min-width:45px;text-align:center;font-family:var(--font-mono);">100%</span>
                    <button type="button" class="thumb-icon-btn" data-cmd="zoom-in" title="Vergrößern">+</button>
                    <button type="button" class="thumb-icon-btn" data-cmd="zoom-reset" title="100%">1:1</button>
                    <span style="color:var(--border-strong);">|</span>
                    <div style="display:flex;align-items:center;gap:4px;" title="Volltextsuche im geöffneten PDF (Strg+F)">
                        <input type="text" id="pdfSearchInput" class="form-control" placeholder="🔍 Im PDF suchen (Strg+F)…" style="width:165px;height:24px;font-size:11.5px;padding:2px 7px;">
                        <span id="pdfSearchCountBadge" style="font-size:11px;color:var(--text-secondary);min-width:34px;text-align:center;font-family:var(--font-mono);">0/0</span>
                        <button type="button" class="thumb-icon-btn" id="btnPdfSearchPrev" title="Vorheriger Suchtreffer">▲</button>
                        <button type="button" class="thumb-icon-btn" id="btnPdfSearchNext" title="Nächster Suchtreffer (Enter)">▼</button>
                        <button type="button" class="thumb-icon-btn" id="btnPdfSearchClear" title="Suche zurücksetzen">✕</button>
                    </div>
                    <span style="color:var(--border-strong);">|</span>
                    <button type="button" class="thumb-icon-btn" data-cmd="toggle-fullscreen" title="Vollbild-Modus umschalten (F11)">⛶</button>
                </div>
            </section>
        </main>

        <!-- RIGHT DOCK: CONTEXT INSPECTOR & POWER TOOLS (Standardmäßig ausgeblendet) -->
        <aside class="right-dock collapsed" id="rightDock">

            <!-- 1. Active Tool Properties -->
            <div class="inspector-section" id="inspectorToolSection">
                <div class="inspector-title">
                    <span>Werkzeug-Eigenschaften</span>
                    <span id="activeToolBadge" style="color:var(--accent-primary);">Auswahl</span>
                </div>

                <div class="form-row">
                    <label>Farbe (Text / Stift / Rahmen / Stempel)</label>
                    <div class="color-swatch-row">
                        <input type="color" id="propColor" value="#e11d48" style="width:32px;height:26px;border:none;background:none;cursor:pointer;">
                        <span class="color-swatch" data-color="#0f172a" style="background:#0f172a;"></span>
                        <span class="color-swatch" data-color="#dc2626" style="background:#dc2626;"></span>
                        <span class="color-swatch" data-color="#2563eb" style="background:#2563eb;"></span>
                        <span class="color-swatch" data-color="#16a34a" style="background:#16a34a;"></span>
                        <span class="color-swatch" data-color="#eab308" style="background:#eab308;"></span>
                    </div>
                </div>

                <div class="form-grid-2">
                    <div class="form-row">
                        <label for="propFontSize">Schriftgröße (px)</label>
                        <input type="number" id="propFontSize" class="form-control" value="18" min="8" max="96">
                    </div>
                    <div class="form-row">
                        <label for="propStrokeWidth">Linienstärke</label>
                        <input type="number" id="propStrokeWidth" class="form-control" value="3" min="1" max="30">
                    </div>
                </div>

                <div class="form-row">
                    <label for="propStampText">Stempel-Vorlage</label>
                    <select id="propStampText" class="form-control">
                        <option value="BEZAHLT">BEZAHLT</option>
                        <option value="GENEHMIGT">GENEHMIGT</option>
                        <option value="VERTRAULICH">VERTRAULICH</option>
                        <option value="ENTWURF">ENTWURF</option>
                        <option value="KOPIE">KOPIE</option>
                        <option value="GEPRÜFT">GEPRÜFT</option>
                        <option value="EINGEGANGEN AM <?php echo date('d.m.Y'); ?>">EINGEGANGEN AM <?php echo date('d.m.Y'); ?></option>
                    </select>
                </div>

                <div style="display:flex;gap:6px;margin-top:6px;">
                    <button type="button" class="tool-btn" data-cmd="delete-selected-annotation" style="flex:1;">
                        🗑 Auswahl löschen
                    </button>
                    <button type="button" class="tool-btn" data-cmd="bake-annotations" style="flex:1;">
                        ✔ Fest einbetten
                    </button>
                </div>
            </div>

            <!-- 2. Watermark & Page Numbers -->
            <div class="inspector-section" id="inspectorWatermarkSection">
                <div class="inspector-title">
                    <span>Wasserzeichen &amp; Seitenzahlen</span>
                </div>
                <div class="form-row">
                    <label for="wmText">Wasserzeichen-Text</label>
                    <input type="text" id="wmText" class="form-control" placeholder="z. B. VERTRAULICH / MUSTER">
                </div>
                <div class="form-grid-2">
                    <div class="form-row">
                        <label for="wmOpacity">Deckkraft (0.1–1.0)</label>
                        <input type="number" id="wmOpacity" class="form-control" value="0.22" step="0.05" min="0.05" max="1">
                    </div>
                    <div class="form-row">
                        <label for="wmSize">Größe (pt)</label>
                        <input type="number" id="wmSize" class="form-control" value="48" min="14" max="120">
                    </div>
                </div>
                <button type="button" class="tool-btn" data-cmd="apply-watermark" style="width:100%;margin-bottom:8px;">
                    💧 Wasserzeichen auf alle Seiten
                </button>

                <div class="form-row">
                    <label for="pageNumPos">Seitenzahlen-Position</label>
                    <select id="pageNumPos" class="form-control">
                        <option value="bottom-right">Unten rechts (Seite X von Y)</option>
                        <option value="bottom-center">Unten zentriert (Seite X von Y)</option>
                        <option value="bottom-left">Unten links (Seite X von Y)</option>
                        <option value="top-right">Oben rechts (Seite X von Y)</option>
                    </select>
                </div>
                <button type="button" class="tool-btn" data-cmd="apply-page-numbers" style="width:100%;">
                    🔢 Seitenzahlen einfügen
                </button>
            </div>

            <!-- 3. Compress PDF -->
            <div class="inspector-section" id="inspectorCompressSection">
                <div class="inspector-title">
                    <span>PDF Komprimieren</span>
                </div>
                <div class="form-row">
                    <label for="compressPreset">Komprimierungs-Stufe</label>
                    <select id="compressPreset" class="form-control">
                        <option value="screen">Stark komprimieren (96 DPI, kleine Datei)</option>
                        <option value="ebook" selected>Ausgewogen / E-Book (140 DPI, empfohlen)</option>
                        <option value="print">Hohe Qualität (200 DPI)</option>
                    </select>
                </div>
                <button type="button" class="tool-btn btn-primary" data-cmd="run-compression" style="width:100%;">
                    📉 Jetzt komprimieren
                </button>
                <div id="compressResultInfo" style="margin-top:6px;font-size:11.5px;color:var(--accent-success);"></div>
            </div>

            <!-- 4. Metadata & Security -->
            <div class="inspector-section" id="inspectorMetadataSection">
                <div class="inspector-title">
                    <span>Metadaten &amp; Dokument-Info</span>
                </div>
                <div class="form-row">
                    <label for="metaTitle">Titel</label>
                    <input type="text" id="metaTitle" class="form-control" placeholder="Dokumenttitel">
                </div>
                <div class="form-row">
                    <label for="metaAuthor">Autor</label>
                    <input type="text" id="metaAuthor" class="form-control" placeholder="Autor / Firma">
                </div>
                <div class="form-row">
                    <label for="metaSubject">Betreff / Stichwörter</label>
                    <input type="text" id="metaSubject" class="form-control" placeholder="Betreff">
                </div>
                <button type="button" class="tool-btn" data-cmd="apply-metadata" style="width:100%;">
                    🏷️ Metadaten übernehmen
                </button>
            </div>

            <!-- 5. OCR & Searchable Sandwich-PDF -->
            <div class="inspector-section" id="inspectorOcrSection">
                <div class="inspector-title">
                    <span>🔎 Durchsuchbares PDF (Sandwich-OCR)</span>
                </div>
                <div class="form-grid-2">
                    <div class="form-row">
                        <label for="ocrLang">Sprache (Offline-OCR)</label>
                        <select id="ocrLang" class="form-control">
                            <option value="deu">Deutsch (deu)</option>
                            <option value="eng">Englisch (eng)</option>
                            <option value="deu+eng">Deutsch + Englisch</option>
                        </select>
                    </div>
                    <div class="form-row">
                        <label for="ocrScope">Seitenumfang</label>
                        <select id="ocrScope" class="form-control">
                            <option value="all">Alle Seiten</option>
                            <option value="current">Aktuelle Seite</option>
                        </select>
                    </div>
                </div>
                <button type="button" class="tool-btn btn-success" data-cmd="make-searchable-pdf" style="width:100%;margin-bottom:6px;" title="Erkennt Text in Bildern/Scans und bettet ihn unsichtbar an den exakten Wortpositionen direkt in das PDF ein">
                    🔎 In durchsuchbares PDF umwandeln
                </button>
                <div style="display:flex;gap:6px;margin-bottom:8px;">
                    <button type="button" class="tool-btn" data-cmd="extract-page-text" style="flex:1;" title="Liest bereits im PDF eingebetteten Text aus">
                        📄 PDF-Text prüfen
                    </button>
                    <button type="button" class="tool-btn btn-primary" data-cmd="run-ocr-page" style="flex:1;" title="Nur Text der aktuellen Seite ins Textfeld auslesen">
                        🔍 Nur Text-Scan
                    </button>
                </div>
                <div id="ocrStatusBox" class="hidden" style="margin-bottom:6px;padding:6px 8px;border-radius:6px;font-size:11.5px;background:rgba(59,130,246,0.12);border:1px solid rgba(59,130,246,0.35);color:var(--text-primary);line-height:1.4;"></div>
                <textarea id="ocrOutputText" class="form-control" rows="5" placeholder="Erkannter oder im PDF hinterlegter Text erscheint hier..."></textarea>
                <div style="display:flex;gap:6px;margin-top:6px;">
                    <button type="button" class="tool-btn" data-cmd="copy-ocr-text" style="flex:1;">📋 Kopieren</button>
                    <button type="button" class="tool-btn" data-cmd="download-ocr-text" style="flex:1;">💾 Als .txt</button>
                </div>
            </div>

            <!-- 6. Barrierefreiheit (PDF/UA & BITV 2.0) Quick Inspector -->
            <div class="inspector-section" id="inspectorA11ySection">
                <div class="inspector-title">
                    <span>♿ Barrierefreiheit (PDF/UA)</span>
                    <span id="inspectorA11yScoreBadge" style="color:var(--accent-warning);">Prüfen…</span>
                </div>
                <p style="font-size:11.5px;color:var(--text-secondary);margin-bottom:8px;line-height:1.4;">
                    Prüft Dokumenttitel, Sprache (<code>/Lang</code>), Tagged-PDF-Struktur (<code>/StructTreeRoot</code>), <code>DisplayDocTitle</code> &amp; Textzugänglichkeit.
                </p>
                <div style="display:flex;gap:6px;">
                    <button type="button" class="tool-btn btn-primary" data-cmd="open-a11y-modal" style="flex:1;">
                        ♿ Prüfbericht &amp; Auto-Fix
                    </button>
                </div>
            </div>

        </aside>
    </div>

    <!-- ==================================================================
         5. BOTTOM DESKTOP STATUS BAR
         ================================================================== -->
    <footer class="statusbar">
        <div class="statusbar-left">
            <span class="status-item">
                <span class="status-dot"></span>
                <span id="statusText">Bereit — PDF-Werkstatt Pro v<?php echo htmlspecialchars(PDFSTUDIO_VERSION, ENT_QUOTES, 'UTF-8'); ?></span>
            </span>
            <span class="status-item" id="statusDocSize">Dateigröße: —</span>
            <span class="status-item" id="statusPageDim">Format: —</span>
            <button type="button" class="status-item" id="statusAutoSaveBtn" data-cmd="toggle-autosave" style="background:none;border:none;color:var(--accent-success);cursor:pointer;font-size:11.5px;font-weight:600;padding:0 4px;" title="Automatische Sicherung alle 5 Minuten (Klicken zum Ein-/Ausschalten)">
                ⏱️ Auto-Save (5 Min.): Aktiv
            </button>
            <button type="button" class="status-item hidden" id="btnRestoreAutoSave" data-cmd="restore-autosave" style="background:rgba(59,130,246,0.18);border:1px solid var(--accent-primary);border-radius:4px;color:#60a5fa;cursor:pointer;font-size:11px;font-weight:700;padding:1px 7px;" title="Zuletzt automatisch gesichertes Dokument wiederherstellen">
                🔄 Auto-Save wiederherstellen
            </button>
            <div class="progress-wrap" id="statusProgressWrap">
                <div class="progress-bar">
                    <div class="progress-fill" id="statusProgressFill"></div>
                </div>
                <span id="statusProgressLabel">0%</span>
            </div>
        </div>

        <div class="statusbar-right">
            <span class="status-item">PDF-Werkstatt Pro v<?php echo htmlspecialchars(PDFSTUDIO_VERSION, ENT_QUOTES, 'UTF-8'); ?> • 100 % Offline</span>
            <span class="status-item" style="display:inline-flex;align-items:center;gap:5px;">
                <span>Zoom:</span>
                <button type="button" class="thumb-icon-btn" data-cmd="zoom-out" title="Verkleinern" style="width:18px;height:18px;font-size:12px;line-height:1;">−</button>
                <input type="range" id="zoomSlider" min="50" max="250" step="5" value="110" style="width:85px;vertical-align:middle;cursor:pointer;">
                <button type="button" class="thumb-icon-btn" data-cmd="zoom-in" title="Vergrößern" style="width:18px;height:18px;font-size:12px;line-height:1;">+</button>
                <span id="statusZoomPercent" data-cmd="zoom-reset" title="Klicken für 100 % Standard-Zoom" style="min-width:36px;text-align:right;font-family:var(--font-mono);font-weight:700;cursor:pointer;">110%</span>
            </span>
        </div>
    </footer>

</div>

<!-- ======================================================================
     CUSTOM RIGHT-CLICK DESKTOP CONTEXT MENU
     ====================================================================== -->
<div class="context-menu" id="desktopContextMenu">
    <button type="button" class="menu-entry" data-cmd="rotate-right"><span>Seite 90° nach rechts drehen</span><span class="menu-shortcut">⟳</span></button>
    <button type="button" class="menu-entry" data-cmd="rotate-left"><span>Seite 90° nach links drehen</span><span class="menu-shortcut">⟲</span></button>
    <div class="menu-divider"></div>
    <button type="button" class="menu-entry" data-cmd="duplicate-page"><span>Seite duplizieren</span></button>
    <button type="button" class="menu-entry" data-cmd="add-blank-page"><span>Leere Seite danach einfügen</span></button>
    <button type="button" class="menu-entry" data-cmd="add-current-to-tray"><span>In Sammelmappe legen</span></button>
    <div class="menu-divider"></div>
    <button type="button" class="menu-entry" data-cmd="extract-current-page"><span>Nur diese Seite als PDF speichern</span></button>
    <button type="button" class="menu-entry" data-cmd="export-current-png"><span>Seite als PNG-Bild exportieren</span></button>
    <div class="menu-divider"></div>
    <button type="button" class="menu-entry" data-cmd="delete-page"><span style="color:var(--accent-danger);">Seite löschen</span><span class="menu-shortcut">Entf</span></button>
</div>

<!-- ======================================================================
     MODALS (Signature Pad, Split PDF, Office/HTML Converter, Server Info)
     ====================================================================== -->

<!-- 1. SIGNATURE MODAL -->
<div class="modal-backdrop" id="modalSignature">
    <div class="modal-window" style="max-width:640px;">
        <div class="modal-header">
            <span>✍️ Unterschrift erstellen &amp; einfügen</span>
            <button type="button" class="doc-tab-close" data-close-modal="modalSignature">✕</button>
        </div>
        <div class="modal-body">
            <p style="color:var(--text-secondary);margin-bottom:10px;">
                Zeichnen Sie Ihre Unterschrift mit der Maus / dem Finger oder geben Sie Ihren Namen als Signatur ein:
            </p>
            <div class="signature-pad-wrap">
                <canvas id="signatureCanvas" width="560" height="160"></canvas>
            </div>
            <div class="form-grid-2">
                <div class="form-row">
                    <label for="sigTypedInput">Oder Namen als Schreibschrift generieren:</label>
                    <input type="text" id="sigTypedInput" class="form-control" placeholder="z. B. Max Mustermann">
                </div>
                <div class="form-row">
                    <label for="sigPenColor">Stiftfarbe der Unterschrift</label>
                    <select id="sigPenColor" class="form-control">
                        <option value="#1d4ed8">Königsblau (#1d4ed8)</option>
                        <option value="#0f172a">Tiefschwarz (#0f172a)</option>
                        <option value="#15803d">Dokumentengrün (#15803d)</option>
                    </select>
                </div>
            </div>
        </div>
        <div class="modal-footer">
            <button type="button" class="tool-btn" id="btnClearSignature">Fläche leeren</button>
            <button type="button" class="tool-btn" data-close-modal="modalSignature">Abbrechen</button>
            <button type="button" class="tool-btn btn-primary" id="btnApplySignature">✔ Aktuelle Zeichnung auf Seite einfügen</button>
        </div>
    </div>
</div>

<!-- 2. SPLIT / EXTRACT PDF MODAL -->
<div class="modal-backdrop" id="modalSplit">
    <div class="modal-window">
        <div class="modal-header">
            <span>✂️ PDF teilen &amp; Seiten extrahieren</span>
            <button type="button" class="doc-tab-close" data-close-modal="modalSplit">✕</button>
        </div>
        <div class="modal-body">
            <div class="form-row">
                <label for="splitRangeInput">Seitenbereich eingeben (z. B. <code>1-2</code> oder <code>1, 3</code>):</label>
                <input type="text" id="splitRangeInput" class="form-control" value="1">
            </div>
            <p style="font-size:12px;color:var(--text-secondary);margin-bottom:14px;">
                Sie können die angegebenen Seiten entweder als neuen Dokument-Tab im Studio öffnen, direkt als PDF herunterladen oder alle Seiten einzeln in ein ZIP-Archiv aufteilen.
            </p>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
                <button type="button" class="tool-btn btn-primary" id="btnSplitToTab">Als neuen Tab öffnen</button>
                <button type="button" class="tool-btn" id="btnSplitDownload">Auswahl als PDF herunterladen</button>
                <button type="button" class="tool-btn" id="btnSplitAllZip">Jede Seite einzeln als PDF (ZIP)</button>
            </div>
        </div>
        <div class="modal-footer">
            <button type="button" class="tool-btn" data-close-modal="modalSplit">Schließen</button>
        </div>
    </div>
</div>

<!-- 3. DOCUMENT CONVERTER MODAL (DOCX / XLSX / HTML / MARKDOWN / TEXT -> PDF) -->
<div class="modal-backdrop" id="modalConverter">
    <div class="modal-window">
        <div class="modal-header">
            <span>🔄 Dokument- &amp; Office-Konverter → PDF</span>
            <button type="button" class="doc-tab-close" data-close-modal="modalConverter">✕</button>
        </div>
        <div class="modal-body">
            <div class="form-row">
                <label>Word (.docx), Excel (.xlsx/.csv), Text (.txt/.md) oder HTML-Datei auswählen:</label>
                <input type="file" id="officeFileInput" class="form-control" accept=".docx,.xlsx,.xls,.csv,.txt,.md,.html,.htm">
            </div>
            <div class="form-row">
                <label for="converterTextInput">Inhalt vor dem Erstellen prüfen oder frei schreiben:</label>
                <textarea id="converterTextInput" class="form-control" rows="10" placeholder="Hier Text eingeben oder oben eine Datei (.docx, .xlsx, .txt, .html) wählen..."></textarea>
            </div>
            <div class="form-row">
                <label for="converterDocTitle">Titel des neuen PDF-Dokuments:</label>
                <input type="text" id="converterDocTitle" class="form-control" value="Konvertiertes_Dokument.pdf">
            </div>
        </div>
        <div class="modal-footer">
            <button type="button" class="tool-btn" data-close-modal="modalConverter">Abbrechen</button>
            <button type="button" class="tool-btn btn-primary" id="btnConvertTextToPdf">📄 Jetzt als PDF-Tab erzeugen</button>
        </div>
    </div>
</div>

<!-- 4. SERVER DIAGNOSTICS MODAL -->
<div class="modal-backdrop" id="modalServer">
    <div class="modal-window">
        <div class="modal-header">
            <span>🖥️ System-Umgebung</span>
            <button type="button" class="doc-tab-close" data-close-modal="modalServer">✕</button>
        </div>
        <div class="modal-body">
            <table style="width:100%;border-collapse:collapse;font-size:12.5px;">
                <tr style="border-bottom:1px solid var(--border-subtle);">
                    <td style="padding:8px 0;color:var(--text-secondary);">Betriebsmodus</td>
                    <td style="padding:8px 0;font-weight:600;">100 % Offline Desktop-Suite</td>
                </tr>
                <tr style="border-bottom:1px solid var(--border-subtle);">
                    <td style="padding:8px 0;color:var(--text-secondary);">Maximale Upload-Größe</td>
                    <td style="padding:8px 0;font-weight:600;"><?php echo htmlspecialchars($serverInfo['effective_max_formatted'], ENT_QUOTES, 'UTF-8'); ?></td>
                </tr>
                <tr style="border-bottom:1px solid var(--border-subtle);">
                    <td style="padding:8px 0;color:var(--text-secondary);">PHP Memory Limit</td>
                    <td style="padding:8px 0;font-weight:600;"><?php echo htmlspecialchars($serverInfo['memory_limit'], ENT_QUOTES, 'UTF-8'); ?></td>
                </tr>
                <tr>
                    <td style="padding:8px 0;color:var(--text-secondary);">Server-Workspace (`storage/`)</td>
                    <td style="padding:8px 0;font-weight:600;">
                        <?php echo $serverInfo['storage_writable'] ? '<span style="color:var(--accent-success);">✔ Beschreibbar</span>' : '<span style="color:var(--accent-danger);">✕ Nicht beschreibbar</span>'; ?>
                    </td>
                </tr>
            </table>
        </div>
        <div class="modal-footer">
            <button type="button" class="tool-btn btn-primary" data-close-modal="modalServer">OK</button>
        </div>
    </div>
</div>

<!-- 5. BARRIEREFREIHEIT (PDF/UA & BITV 2.0 / WCAG 2.1) AUDIT & REMEDIATION MODAL -->
<div class="modal-backdrop" id="modalAccessibility">
    <div class="modal-window" style="max-width:780px;">
        <div class="modal-header">
            <span>♿ PAC 2026 Barrierefreiheits-Prüfung &amp; Reparatur (PDF/UA-1 • WCAG 2.1/2.2 • Quality)</span>
            <button type="button" class="doc-tab-close" data-close-modal="modalAccessibility">✕</button>
        </div>
        <div class="modal-body">
            <!-- Summary Banner -->
            <div id="a11ySummaryBanner" style="display:flex;align-items:center;justify-content:space-between;background:var(--bg-card);border:1px solid var(--border-strong);border-radius:8px;padding:12px 16px;margin-bottom:10px;gap:12px;flex-wrap:wrap;transition:border-color 0.25s ease, box-shadow 0.25s ease;">
                <div style="flex:1;min-width:260px;">
                    <div id="a11ySummaryTitle" style="font-size:15px;font-weight:700;">Prüfe Dokument…</div>
                    <div id="a11ySummarySub" style="font-size:12px;color:var(--text-secondary);margin-top:2px;">
                        Tiefenprüfung analog PAC 2026 nach PDF/UA-1, WCAG 2.1/2.2 &amp; Quality (inkl. Auto-Verlinkung von E-Mails &amp; URLs)
                    </div>
                </div>
                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end;">
                    <span id="a11yPdfUaBadge" style="display:inline-block;font-size:11.5px;font-weight:700;padding:4px 10px;border-radius:6px;background:var(--bg-input);border:1px solid var(--border-subtle);color:var(--text-secondary);">
                        PDF/UA: —
                    </span>
                    <span id="a11yWcagBadge" style="display:inline-block;font-size:11.5px;font-weight:700;padding:4px 10px;border-radius:6px;background:var(--bg-input);border:1px solid var(--border-subtle);color:var(--text-secondary);">
                        WCAG: —
                    </span>
                    <span id="a11yQualityBadge" style="display:inline-block;font-size:11.5px;font-weight:700;padding:4px 10px;border-radius:6px;background:var(--bg-input);border:1px solid var(--border-subtle);color:var(--text-secondary);">
                        Quality: —
                    </span>
                    <span id="a11yScorePill" style="display:inline-block;font-size:18px;font-weight:800;padding:4px 12px;border-radius:999px;background:var(--accent-soft);color:var(--accent-primary);">
                        — %
                    </span>
                </div>
            </div>

            <!-- Live Audit Progress Indicator -->
            <div id="a11yAuditProgressBox" style="display:none;background:var(--bg-card);border:1px solid var(--accent-primary);border-radius:8px;padding:10px 14px;margin-bottom:12px;">
                <div style="display:flex;align-items:center;justify-content:space-between;font-size:12px;margin-bottom:6px;gap:8px;">
                    <span id="a11yAuditStepLabel" style="font-weight:600;color:var(--accent-primary);">🔍 Starte Tiefenprüfung der PDF-Katalogstruktur…</span>
                    <span id="a11yAuditStepPercent" style="font-weight:700;color:var(--text-secondary);">0 %</span>
                </div>
                <div style="width:100%;height:7px;background:var(--bg-input);border-radius:999px;overflow:hidden;border:1px solid var(--border-subtle);">
                    <div id="a11yAuditProgressFill" style="width:0%;height:100%;background:linear-gradient(90deg, #3b82f6, #10b981);transition:width 0.08s linear;"></div>
                </div>
            </div>

            <!-- 12-Point PAC 2026 Detailed Checklist (PDF/UA + WCAG) -->
            <div id="a11yChecklistContainer" style="display:flex;flex-direction:column;gap:7px;margin-bottom:14px;max-height:300px;overflow-y:auto;padding-right:4px;">
                <!-- Populated dynamically by auditAccessibility() -->
            </div>

            <!-- Auto-Remediation Form -->
            <div style="background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:8px;padding:12px 14px;">
                <div style="font-weight:700;font-size:12.5px;margin-bottom:8px;color:var(--text-primary);">
                    🛠️ Barrierefreiheit nach PAC 2026 (PDF/UA-1 + WCAG 2.1/2.2) direkt im PDF nachrüsten:
                </div>
                <div class="form-grid-2">
                    <div class="form-row">
                        <label for="a11yFixTitle">Barrierefreier Dokumenttitel (<code>/Title</code> &amp; <code>dc:title</code>)</label>
                        <input type="text" id="a11yFixTitle" class="form-control" placeholder="Aussagekräftiger Dokumenttitel">
                    </div>
                    <div class="form-row">
                        <label for="a11yFixLang">Dokumentsprache für Screenreader (<code>/Lang</code>)</label>
                        <select id="a11yFixLang" class="form-control">
                            <option value="de-DE">Deutsch — Deutschland (de-DE)</option>
                            <option value="de-AT">Deutsch — Österreich (de-AT)</option>
                            <option value="de-CH">Deutsch — Schweiz (de-CH)</option>
                            <option value="en-US">Englisch — USA (en-US)</option>
                            <option value="en-GB">Englisch — UK (en-GB)</option>
                            <option value="fr-FR">Französisch (fr-FR)</option>
                        </select>
                    </div>
                </div>
                <p style="font-size:11.5px;color:var(--text-secondary);line-height:1.4;margin-bottom:0;">
                    Behebt automatisch alle 3 PAC-2026-Prüfbereiche: <strong>PDF/UA-1</strong> (1:1 XMP-Sync <code>pdfuaid:part=1</code>, <code>/DisplayDocTitle</code>, <code>/Marked true</code>, <code>/Suspects false</code>, vollständiges Content-Stream- &amp; Form-XObject-Tagging, TrueType-Schrifteinbettung <code>/FontFile2</code> inkl. <code>/Differences</code>-Unicode-CMap, <code>/Tabs /S</code>), <strong>WCAG 2.1/2.2</strong> (semantische Überschriftenhierarchie <code>&lt;H1&gt;</code>/<code>&lt;H2&gt;</code>, AA-Textkontrast &ge; 4,5:1, <code>&lt;Link&gt;</code>/<code>&lt;Form&gt;</code> <code>/OBJR</code>-Annotation-Tagging &amp; <code>/Outlines</code>) sowie <strong>PAC Quality</strong> (automatische <code>mailto:</code>- &amp; <code>https://</code>-Verlinkung von E-Mail-Adressen und Web-URLs im Text, keine leeren Struktur-Tags, native PDF-Standard-Tags ohne RoleMap-Umwege).
                </p>
            </div>
        </div>
        <div class="modal-footer" style="justify-content:space-between;flex-wrap:wrap;gap:8px;">
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
                <button type="button" class="tool-btn" id="btnReRunA11yAudit">↻ Erneut prüfen</button>
                <button type="button" class="tool-btn" id="btnExportA11yReportPdf">📄 Prüfbericht als PDF öffnen</button>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
                <button type="button" class="tool-btn" id="btnDownloadA11yPdf" title="Aktuelles (repariertes) PDF direkt herunterladen, um es z. B. in PAC 2026 zu prüfen">💾 PDF herunterladen</button>
                <button type="button" class="tool-btn btn-success" id="btnAutoFixA11y">🛠️ Barrierefreiheit jetzt nachrüsten</button>
            </div>
        </div>
    </div>
</div>

<!-- 6. CROP PAGES MODAL (Seiten zuschneiden / Ränder anpassen) -->
<div class="modal-backdrop" id="modalCrop">
    <div class="modal-window">
        <div class="modal-header">
            <span>📐 Seiten zuschneiden (CropBox / MediaBox Ränder)</span>
            <button type="button" class="doc-tab-close" data-close-modal="modalCrop">✕</button>
        </div>
        <div class="modal-body">
            <p style="font-size:12px;color:var(--text-secondary);margin-bottom:12px;">
                Geben Sie an, wie viele Millimeter (mm) vom jeweiligen Seitenrand abgeschnitten werden sollen:
            </p>
            <div class="form-grid-2">
                <div class="form-row">
                    <label for="cropTopMm">Rand oben abschneiden (mm)</label>
                    <input type="number" id="cropTopMm" class="form-control" value="10" min="0" max="150">
                </div>
                <div class="form-row">
                    <label for="cropBottomMm">Rand unten abschneiden (mm)</label>
                    <input type="number" id="cropBottomMm" class="form-control" value="10" min="0" max="150">
                </div>
                <div class="form-row">
                    <label for="cropLeftMm">Rand links abschneiden (mm)</label>
                    <input type="number" id="cropLeftMm" class="form-control" value="10" min="0" max="150">
                </div>
                <div class="form-row">
                    <label for="cropRightMm">Rand rechts abschneiden (mm)</label>
                    <input type="number" id="cropRightMm" class="form-control" value="10" min="0" max="150">
                </div>
            </div>
            <div class="form-row">
                <label for="cropScope">Anwenden auf:</label>
                <select id="cropScope" class="form-control">
                    <option value="all">Alle Seiten des Dokuments</option>
                    <option value="current">Nur aktuelle Seite</option>
                </select>
            </div>
        </div>
        <div class="modal-footer">
            <button type="button" class="tool-btn" data-close-modal="modalCrop">Abbrechen</button>
            <button type="button" class="tool-btn btn-primary" id="btnApplyCrop">✂️ Jetzt zuschneiden</button>
        </div>
    </div>
</div>

<!-- 7. BATES NUMBERING & 3-COLUMN HEADER/FOOTER MODAL -->
<div class="modal-backdrop" id="modalBates">
    <div class="modal-window" style="max-width:660px;">
        <div class="modal-header">
            <span>🔢 Bates-Nummerierung &amp; 3-spaltige Kopf-/Fußzeilen</span>
            <button type="button" class="doc-tab-close" data-close-modal="modalBates">✕</button>
        </div>
        <div class="modal-body">
            <div style="background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:8px;padding:12px;margin-bottom:14px;">
                <div style="font-weight:700;margin-bottom:8px;">A. Juristische / Behördliche Bates-Nummerierung</div>
                <div class="form-grid-2">
                    <div class="form-row">
                        <label for="batesPrefix">Präfix / Aktenzeichen</label>
                        <input type="text" id="batesPrefix" class="form-control" value="AZ-2026-">
                    </div>
                    <div class="form-row">
                        <label for="batesStart">Startnummer &amp; Stellen (z. B. 6 → 000001)</label>
                        <div style="display:flex;gap:6px;">
                            <input type="number" id="batesStart" class="form-control" value="1" min="1" title="Startnummer">
                            <input type="number" id="batesDigits" class="form-control" value="6" min="1" max="12" title="Anzahl Ziffern">
                        </div>
                    </div>
                </div>
                <button type="button" class="tool-btn btn-primary" id="btnApplyBates">🔢 Bates-Nummerierung oben rechts einfügen</button>
            </div>

            <div style="background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:8px;padding:12px;">
                <div style="font-weight:700;margin-bottom:4px;">B. Dreispaltige Kopf- &amp; Fußzeilen</div>
                <p style="font-size:11px;color:var(--text-secondary);margin-bottom:10px;">
                    Verfügbare Platzhalter: <code>{page}</code> (Seite), <code>{total}</code> (Gesamtseiten), <code>{date}</code> (Datum), <code>{file}</code> (Dateiname)
                </p>
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:8px;">
                    <div class="form-row">
                        <label for="hfHeaderLeft">Kopfzeile Links</label>
                        <input type="text" id="hfHeaderLeft" class="form-control" value="{file}">
                    </div>
                    <div class="form-row">
                        <label for="hfHeaderCenter">Kopfzeile Mitte</label>
                        <input type="text" id="hfHeaderCenter" class="form-control" placeholder="Optional">
                    </div>
                    <div class="form-row">
                        <label for="hfHeaderRight">Kopfzeile Rechts</label>
                        <input type="text" id="hfHeaderRight" class="form-control" value="{date}">
                    </div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">
                    <div class="form-row">
                        <label for="hfFooterLeft">Fußzeile Links</label>
                        <input type="text" id="hfFooterLeft" class="form-control" value="Vertraulich">
                    </div>
                    <div class="form-row">
                        <label for="hfFooterCenter">Fußzeile Mitte</label>
                        <input type="text" id="hfFooterCenter" class="form-control" placeholder="Optional">
                    </div>
                    <div class="form-row">
                        <label for="hfFooterRight">Fußzeile Rechts</label>
                        <input type="text" id="hfFooterRight" class="form-control" value="Seite {page} von {total}">
                    </div>
                </div>
                <button type="button" class="tool-btn btn-primary" id="btnApplyHeaderFooter" style="margin-top:6px;">📑 Kopf- &amp; Fußzeilen auf alle Seiten anwenden</button>
            </div>
        </div>
        <div class="modal-footer">
            <button type="button" class="tool-btn" data-close-modal="modalBates">Schließen</button>
        </div>
    </div>
</div>

<!-- 8. PDF COMPARE MODAL (Visueller & Textueller Dokumentenvergleich) -->
<div class="modal-backdrop" id="modalCompare">
    <div class="modal-window" style="max-width:960px;">
        <div class="modal-header">
            <span>⚖️ PDF-Vergleich (Visueller Pixel-Diff &amp; Text-Abgleich)</span>
            <button type="button" class="doc-tab-close" data-close-modal="modalCompare">✕</button>
        </div>
        <div class="modal-body">
            <div class="form-grid-2" style="margin-bottom:12px;">
                <div class="form-row">
                    <label for="compareSelectA">Dokument A (Basis-Tab):</label>
                    <select id="compareSelectA" class="form-control"></select>
                </div>
                <div class="form-row">
                    <label for="compareSelectB">Dokument B (Vergleichs-Tab oder Datei wählen):</label>
                    <div style="display:flex;gap:6px;">
                        <select id="compareSelectB" class="form-control" style="flex:1;"></select>
                        <button type="button" class="tool-btn" id="btnCompareUploadSecond">📂 2. PDF laden</button>
                    </div>
                </div>
            </div>

            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
                <div id="compareSummaryBadge" style="font-weight:700;color:var(--accent-primary);">
                    Wählen Sie zwei Dokumente und klicken Sie auf „Jetzt vergleichen“
                </div>
                <button type="button" class="tool-btn btn-primary" id="btnRunPdfCompare">⚖️ Jetzt vergleichen</button>
            </div>

            <!-- 3-Column Visual Comparison Canvases -->
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:12px;">
                <div style="background:var(--bg-card);padding:8px;border-radius:6px;text-align:center;">
                    <div style="font-size:11px;font-weight:700;margin-bottom:6px;">Dokument A (Seite 1)</div>
                    <canvas id="compareCanvasA" style="max-width:100%;background:#fff;border-radius:4px;"></canvas>
                </div>
                <div style="background:var(--bg-card);padding:8px;border-radius:6px;text-align:center;">
                    <div style="font-size:11px;font-weight:700;margin-bottom:6px;">Dokument B (Seite 1)</div>
                    <canvas id="compareCanvasB" style="max-width:100%;background:#fff;border-radius:4px;"></canvas>
                </div>
                <div style="background:var(--bg-card);padding:8px;border-radius:6px;text-align:center;">
                    <div style="font-size:11px;font-weight:700;margin-bottom:6px;color:#ef4444;">Visueller Diff (Rot = Änderung)</div>
                    <canvas id="compareCanvasDiff" style="max-width:100%;background:#fff;border-radius:4px;"></canvas>
                </div>
            </div>

            <div class="form-row">
                <label>Text-Unterschiede (Zeilen-Diff):</label>
                <div id="compareTextDiffOutput" style="background:var(--bg-input);border:1px solid var(--border-subtle);border-radius:6px;padding:10px;max-height:150px;overflow-y:auto;font-family:var(--font-mono);font-size:11.5px;line-height:1.5;"></div>
            </div>
        </div>
        <div class="modal-footer">
            <button type="button" class="tool-btn" data-close-modal="modalCompare">Schließen</button>
        </div>
    </div>
</div>

<!-- 9. PDF COMPRESSION & METADATA MODAL -->
<div class="modal-backdrop" id="modalCompress">
    <div class="modal-window" style="max-width:600px;">
        <div class="modal-header">
            <span>📉 PDF komprimieren &amp; Metadaten bearbeiten</span>
            <button type="button" class="doc-tab-close" data-close-modal="modalCompress">✕</button>
        </div>
        <div class="modal-body">
            <!-- Current Document Info Banner -->
            <div style="display:flex;align-items:center;justify-content:space-between;background:var(--bg-card);border:1px solid var(--border-strong);border-radius:8px;padding:10px 14px;margin-bottom:14px;flex-wrap:wrap;gap:10px;">
                <div>
                    <div style="font-size:13.5px;font-weight:700;" id="modalCompressDocName">—</div>
                    <div style="font-size:11.5px;color:var(--text-secondary);" id="modalCompressDocInfo">Aktuelle Dateigröße: —</div>
                </div>
                <button type="button" class="tool-btn" data-cmd="open-pdf" style="height:26px;font-size:11.5px;">📂 Anderes PDF wählen</button>
            </div>

            <!-- Section 1: Compression -->
            <div style="background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:8px;padding:14px;margin-bottom:14px;">
                <div style="font-weight:700;font-size:13px;margin-bottom:8px;color:var(--accent-primary);">
                    1. Dateigröße verkleinern (PDF-Komprimierung)
                </div>
                <div class="form-row">
                    <label for="modalCompressPreset">Komprimierungs-Stufe wählen:</label>
                    <select id="modalCompressPreset" class="form-control">
                        <option value="screen">Stark komprimieren (96 DPI — minimale Dateigröße für E-Mail/Web)</option>
                        <option value="ebook" selected>Ausgewogen / E-Book (140 DPI — empfohlenes Verhältnis aus Größe &amp; Schärfe)</option>
                        <option value="print">Hohe Qualität (200 DPI — schonende Komprimierung für Druck &amp; Archiv)</option>
                    </select>
                </div>
                <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">
                    <button type="button" class="tool-btn btn-primary" id="btnModalRunCompression" style="flex:1;">
                        📉 Jetzt komprimieren
                    </button>
                    <button type="button" class="tool-btn btn-success hidden" id="btnModalDownloadCompressed" data-cmd="export-pdf">
                        💾 Komprimiertes PDF herunterladen
                    </button>
                </div>
                <div id="modalCompressResultBox" class="hidden" style="margin-top:10px;padding:8px 10px;border-radius:6px;background:var(--bg-input);border:1px solid var(--accent-success);font-size:12px;font-weight:600;color:var(--accent-success);"></div>
            </div>

            <!-- Section 2: Metadata -->
            <div style="background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:8px;padding:14px;">
                <div style="font-weight:700;font-size:13px;margin-bottom:8px;color:var(--text-primary);">
                    2. PDF-Metadaten anpassen (optional)
                </div>
                <div class="form-grid-2">
                    <div class="form-row">
                        <label for="modalMetaTitle">Dokument-Titel</label>
                        <input type="text" id="modalMetaTitle" class="form-control" placeholder="Titel des Dokuments">
                    </div>
                    <div class="form-row">
                        <label for="modalMetaAuthor">Autor / Ersteller</label>
                        <input type="text" id="modalMetaAuthor" class="form-control" placeholder="Name / Behörde">
                    </div>
                </div>
                <div class="form-row">
                    <label for="modalMetaSubject">Betreff / Stichwörter</label>
                    <input type="text" id="modalMetaSubject" class="form-control" placeholder="Betreff / Aktenzeichen">
                </div>
                <button type="button" class="tool-btn" id="btnModalApplyMetadata" style="width:100%;margin-top:4px;">
                    🏷️ Metadaten in PDF übernehmen
                </button>
            </div>
        </div>
        <div class="modal-footer">
            <button type="button" class="tool-btn" data-close-modal="modalCompress">Schließen</button>
        </div>
    </div>
</div>

<!-- 13. PDF MERGE MODAL (PDF-Dateien zusammenführen & Reihenfolge anpassen) -->
<div class="modal-backdrop" id="modalMerge">
    <div class="modal-window" style="max-width:680px;">
        <div class="modal-header">
            <span>📑 PDF-Dateien zusammenführen &amp; Reihenfolge anpassen</span>
            <button type="button" class="doc-tab-close" data-close-modal="modalMerge">✕</button>
        </div>
        <div class="modal-body">
            <p style="font-size:12px;color:var(--text-secondary);margin-bottom:12px;line-height:1.45;">
                Wählen Sie mehrere PDF-Dateien von Ihrem Computer aus (oder übernehmen Sie bereits geöffnete Dokument-Tabs), passen Sie bei Bedarf die Reihenfolge mit <strong>▲ / ▼</strong> an und verbinden Sie alles zu einem einzigen PDF-Dokument:
            </p>

            <!-- Action Bar to Add Files or Open Tabs -->
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
                <button type="button" class="tool-btn btn-primary" id="btnMergePickFiles">
                    📂 PDF-Dateien hinzufügen…
                </button>
                <button type="button" class="tool-btn" id="btnMergeAddOpenTabs" title="Alle aktuell im Studio geöffneten PDF-Tabs zur Zusammenführungs-Liste hinzufügen">
                    ⇄ Geöffnete Tabs übernehmen
                </button>
                <button type="button" class="tool-btn" id="btnMergeClearList" style="margin-left:auto;">
                    🗑 Liste leeren
                </button>
            </div>

            <!-- Sortable File Queue List -->
            <div id="mergeQueueList" style="display:flex;flex-direction:column;gap:6px;max-height:260px;overflow-y:auto;background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:8px;padding:10px;margin-bottom:12px;">
                <!-- Populated dynamically by renderMergeQueueUI() -->
            </div>

            <div class="form-grid-2">
                <div class="form-row">
                    <label for="mergeOutputName">Dateiname des zusammengeführten PDFs</label>
                    <input type="text" id="mergeOutputName" class="form-control" value="Zusammengefuegt.pdf" placeholder="Zusammengefuegt.pdf">
                </div>
                <div class="form-row">
                    <label for="mergeTargetMode">Nach dem Zusammenführen</label>
                    <select id="mergeTargetMode" class="form-control">
                        <option value="new-tab">Als neuen Tab im Studio öffnen (zur Vorschau / Bearbeitung)</option>
                        <option value="append-active">An das aktuell geöffnete Dokument anhängen</option>
                    </select>
                </div>
            </div>
        </div>
        <div class="modal-footer" style="justify-content:space-between;flex-wrap:wrap;">
            <button type="button" class="tool-btn" data-close-modal="modalMerge">Abbrechen</button>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
                <button type="button" class="tool-btn" id="btnRunMergeDownload">
                    💾 Zusammenführen &amp; direkt herunterladen
                </button>
                <button type="button" class="tool-btn btn-success" id="btnRunMergeOpen">
                    📑 Jetzt zusammenführen
                </button>
            </div>
        </div>
    </div>
</div>

<!-- ======================================================================
     MODAL: DIRECT PDF EMAIL SENDER (SMTP)
     ====================================================================== -->
<div class="modal-backdrop" id="modalSendEmail">
    <div class="modal-window" style="max-width:560px;">
        <div class="modal-header">
            <span>📧 PDF direkt per E-Mail versenden</span>
            <button type="button" class="doc-tab-close" data-close-modal="modalSendEmail">✕</button>
        </div>
        <div class="modal-body">
            <p style="font-size:12.5px;color:var(--text-secondary);margin-bottom:14px;line-height:1.45;">
                Das aktuell geöffnete PDF-Dokument wird samt allen Änderungen als Dateianhang über den im Adminbereich (⚙️) hinterlegten SMTP-Server versendet.
            </p>
            <div class="form-row">
                <label for="emailPdfRecipient">Empfänger-E-Mail-Adresse *</label>
                <input type="email" id="emailPdfRecipient" class="form-control" placeholder="z. B. empfaenger@organisation.de" required>
            </div>
            <div class="form-row">
                <label for="emailPdfReplyTo">Antwortadresse / Reply-To (optional)</label>
                <input type="email" id="emailPdfReplyTo" class="form-control" placeholder="Ihre eigene E-Mail-Adresse für Rückantworten">
            </div>
            <div class="form-row">
                <label for="emailPdfSubject">Betreff</label>
                <input type="text" id="emailPdfSubject" class="form-control" placeholder="PDF-Dokument">
            </div>
            <div class="form-row">
                <label for="emailPdfMessage">Nachrichtentext</label>
                <textarea id="emailPdfMessage" class="form-control" rows="4" placeholder="Guten Tag, anbei erhalten Sie das gewünschte PDF-Dokument."></textarea>
            </div>
            <div id="emailPdfStatusBox" style="display:none;margin-top:10px;padding:10px 12px;border-radius:6px;font-size:12.5px;"></div>
        </div>
        <div class="modal-footer">
            <button type="button" class="tool-btn" data-close-modal="modalSendEmail">Abbrechen</button>
            <button type="button" class="tool-btn btn-primary" id="btnSendPdfEmailNow">
                📧 PDF jetzt als Anhang senden
            </button>
        </div>
    </div>
</div>

<!-- ======================================================================
     MODAL: BATCH PROCESSING (STAPELVERARBEITUNG)
     ====================================================================== -->
<div class="modal-backdrop" id="modalBatchProcess">
    <div class="modal-window" style="max-width:680px;">
        <div class="modal-header">
            <span>🗂️ Stapelverarbeitung (Batch-Modus für mehrere PDFs)</span>
            <button type="button" class="doc-tab-close" data-close-modal="modalBatchProcess">✕</button>
        </div>
        <div class="modal-body">
            <p style="font-size:12.5px;color:var(--text-secondary);margin-bottom:14px;line-height:1.45;">
                Wählen Sie beliebig viele PDF-Dateien aus (oder nutzen Sie alle geöffneten Tabs), führen Sie die gewünschten Aktionen in einem Durchgang aus und laden Sie alle Ergebnisse gesammelt als <code>.zip</code>-Archiv herunter.
            </p>

            <div class="form-row" style="background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:8px;padding:12px;">
                <label style="font-weight:700;margin-bottom:6px;display:block;">1. Eingabe-Dateien für den Stapel auswählen</label>
                <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
                    <input type="file" id="batchPdfFilesInput" accept=".pdf,application/pdf" multiple class="form-control" style="flex:1;">
                    <label style="display:inline-flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;white-space:nowrap;">
                        <input type="checkbox" id="batchUseOpenTabs" checked>
                        Auch alle aktuell geöffneten PDF-Tabs einbeziehen
                    </label>
                </div>
            </div>

            <div class="form-row" style="background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:8px;padding:12px;margin-top:10px;">
                <label style="font-weight:700;margin-bottom:8px;display:block;">2. Auszuführende Stapel-Aktionen (mehrere kombinierbar)</label>
                <div style="display:flex;flex-direction:column;gap:8px;font-size:12.5px;">
                    <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
                        <input type="checkbox" id="batchActionPdfUa" checked>
                        <span><strong>⚡ Auto-Fix PDF/UA-1 &amp; WCAG 2.1 Barrierefreiheit</strong> (Tags, ParentTree, Schriften, XMP, Lesezeichen, Sprache <code>de-DE</code>)</span>
                    </label>
                    <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
                        <input type="checkbox" id="batchActionPageNumbers">
                        <span><strong>🔢 Seitenzahlen einfügen</strong> (Fußzeile „Seite X / Y“ auf allen Seiten)</span>
                    </label>
                    <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
                        <input type="checkbox" id="batchActionWatermark">
                        <span><strong>💧 Wasserzeichen / Stempel auf alle Seiten setzen:</strong></span>
                    </label>
                    <input type="text" id="batchWatermarkText" class="form-control" placeholder="z. B. VERTRAULICH oder EINGEGANGEN" value="VERTRAULICH" style="margin-left:24px;max-width:340px;height:30px;">
                </div>
            </div>

            <div id="batchProgressBox" style="display:none;margin-top:12px;padding:12px;background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:8px;">
                <div id="batchProgressLabel" style="font-size:12.5px;font-weight:600;margin-bottom:6px;">Starte Stapelverarbeitung…</div>
                <div style="height:8px;background:var(--bg-app);border-radius:99px;overflow:hidden;">
                    <div id="batchProgressBar" style="width:0%;height:100%;background:var(--accent-primary);transition:width 0.2s;"></div>
                </div>
            </div>
        </div>
        <div class="modal-footer">
            <button type="button" class="tool-btn" data-close-modal="modalBatchProcess">Schließen</button>
            <button type="button" class="tool-btn btn-primary" id="btnRunBatchProcess">
                🗂️ Stapel starten &amp; als ZIP herunterladen
            </button>
        </div>
    </div>
</div>

<!-- ======================================================================
     MODAL: E-RECHNUNG / ZUGFeRD 2.x & XRECHNUNG (INSPECT & EMBED)
     ====================================================================== -->
<div class="modal-backdrop" id="modalZugferd">
    <div class="modal-window" style="max-width:780px;">
        <div class="modal-header">
            <span>🧾 E-Rechnung: ZUGFeRD 2.x / Factur-X &amp; XRechnung (EN 16931)</span>
            <button type="button" class="doc-tab-close" data-close-modal="modalZugferd">✕</button>
        </div>
        <div class="modal-body" style="max-height:74vh;overflow-y:auto;">
            <!-- Detection & Summary Area -->
            <div id="zugferdDetectBanner" style="padding:12px 14px;border-radius:8px;background:var(--bg-card);border:1px solid var(--border-subtle);margin-bottom:14px;">
                <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
                    <div>
                        <strong id="zugferdStatusTitle">🔍 Prüfe geöffnetes PDF auf eingebettete E-Rechnungsdaten…</strong>
                        <div id="zugferdStatusSub" style="font-size:12px;color:var(--text-secondary);margin-top:2px;">Unterstützt ZUGFeRD 1.0/2.x, Factur-X (CII) sowie XRechnung (CII &amp; UBL).</div>
                    </div>
                    <div style="display:flex;gap:6px;flex-wrap:wrap;">
                        <button type="button" class="tool-btn" id="btnZugferdLoadExternalXml" title="Separate .xml E-Rechnung zur Prüfung oder Einbettung laden">
                            📂 XML-Datei laden
                        </button>
                        <button type="button" class="tool-btn" id="btnZugferdDownloadXml" style="display:none;">
                            💾 XML extrahieren
                        </button>
                    </div>
                </div>
            </div>
            <input type="file" id="hiddenZugferdXmlInput" accept=".xml,text/xml,application/xml" class="hidden">

            <!-- Visual Invoice Data Display -->
            <div id="zugferdInvoiceView" style="display:none;margin-bottom:16px;">
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;margin-bottom:12px;">
                    <div style="background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:8px;padding:10px 12px;">
                        <div style="font-size:11px;color:var(--text-muted);">Rechnungsnummer &amp; Datum</div>
                        <div id="zfInvIdDate" style="font-size:13.5px;font-weight:700;margin-top:3px;">—</div>
                        <div id="zfBuyerRef" style="font-size:11.5px;color:var(--accent-primary);margin-top:2px;">Leitweg-ID: —</div>
                    </div>
                    <div style="background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:8px;padding:10px 12px;">
                        <div style="font-size:11px;color:var(--text-muted);">Rechnungssteller (Verkäufer)</div>
                        <div id="zfSellerInfo" style="font-size:12.5px;font-weight:600;margin-top:3px;line-height:1.35;">—</div>
                    </div>
                    <div style="background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:8px;padding:10px 12px;">
                        <div style="font-size:11px;color:var(--text-muted);">Rechnungsempfänger (Käufer)</div>
                        <div id="zfBuyerInfo" style="font-size:12.5px;font-weight:600;margin-top:3px;line-height:1.35;">—</div>
                    </div>
                </div>

                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;margin-bottom:12px;">
                    <div style="background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:8px;padding:10px 12px;">
                        <div style="font-size:11px;color:var(--text-muted);">Zahlungsverbindung (IBAN / Fälligkeit)</div>
                        <div id="zfPaymentInfo" style="font-size:12.5px;font-weight:600;margin-top:3px;">—</div>
                    </div>
                    <div style="background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:8px;padding:10px 12px;">
                        <div style="font-size:11px;color:var(--text-muted);">Beträge (Netto / Steuer / Brutto)</div>
                        <div id="zfTotalsInfo" style="font-size:13.5px;font-weight:700;color:#10b981;margin-top:3px;">—</div>
                    </div>
                </div>

                <div id="zfLineItemsWrap" style="background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:8px;padding:10px 12px;">
                    <div style="font-size:12px;font-weight:700;margin-bottom:6px;">Rechnungspositionen</div>
                    <div id="zfLineItemsTable" style="font-size:12px;overflow-x:auto;"></div>
                </div>
            </div>

            <!-- Embed / Generate ZUGFeRD EN 16931 XML into current PDF -->
            <div style="background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:8px;padding:14px;">
                <div style="font-size:13px;font-weight:700;margin-bottom:6px;">
                    ➕ ZUGFeRD 2.2 / Factur-X (EN 16931) XML in das aktuelle PDF einbetten
                </div>
                <p style="font-size:12px;color:var(--text-secondary);margin-bottom:10px;">
                    Erzeugt einen normkonformen <code>factur-x.xml</code>-Datensatz (oder nutzt eine geladene XML-Datei) und bettet ihn als strukturierte E-Rechnung in das geöffnete PDF ein.
                </p>
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px;">
                    <div class="form-row" style="margin:0;">
                        <label for="zfGenInvNumber">Rechnungsnummer</label>
                        <input type="text" id="zfGenInvNumber" class="form-control" placeholder="z. B. RE-2026-1042" value="RE-2026-1001">
                    </div>
                    <div class="form-row" style="margin:0;">
                        <label for="zfGenInvDate">Rechnungsdatum</label>
                        <input type="date" id="zfGenInvDate" class="form-control" value="<?php echo date('Y-m-d'); ?>">
                    </div>
                    <div class="form-row" style="margin:0;">
                        <label for="zfGenLeitweg">Leitweg-ID / Käuferreferenz</label>
                        <input type="text" id="zfGenLeitweg" class="form-control" placeholder="z. B. 08-12345-67">
                    </div>
                    <div class="form-row" style="margin:0;">
                        <label for="zfGenSeller">Verkäufer (Name)</label>
                        <input type="text" id="zfGenSeller" class="form-control" placeholder="Muster GmbH / Dienststelle">
                    </div>
                    <div class="form-row" style="margin:0;">
                        <label for="zfGenBuyer">Käufer (Name)</label>
                        <input type="text" id="zfGenBuyer" class="form-control" placeholder="Rechnungsempfänger">
                    </div>
                    <div class="form-row" style="margin:0;">
                        <label for="zfGenIban">IBAN</label>
                        <input type="text" id="zfGenIban" class="form-control" placeholder="DE00 0000 0000 0000 0000 00">
                    </div>
                    <div class="form-row" style="margin:0;">
                        <label for="zfGenNet">Nettobetrag (EUR)</label>
                        <input type="number" step="0.01" id="zfGenNet" class="form-control" value="100.00">
                    </div>
                    <div class="form-row" style="margin:0;">
                        <label for="zfGenTaxRate">MwSt.-Satz (%)</label>
                        <input type="number" step="0.1" id="zfGenTaxRate" class="form-control" value="19">
                    </div>
                </div>
            </div>
        </div>
        <div class="modal-footer" style="justify-content:space-between;flex-wrap:wrap;">
            <button type="button" class="tool-btn" data-close-modal="modalZugferd">Schließen</button>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
                <button type="button" class="tool-btn btn-primary" id="btnEmbedZugferdXml">
                    🧾 E-Rechnungs-XML (factur-x.xml) ins PDF einbetten
                </button>
            </div>
        </div>
    </div>
</div>

<!-- ======================================================================
     MODAL: OFFLINE QR-CODE GENERATOR ON PDF
     ====================================================================== -->
<div class="modal-backdrop" id="modalQrCode">
    <div class="modal-window" style="max-width:520px;">
        <div class="modal-header">
            <span>📱 QR-Code direkt auf der PDF-Seite platzieren</span>
            <button type="button" class="doc-tab-close" data-close-modal="modalQrCode">✕</button>
        </div>
        <div class="modal-body">
            <p style="font-size:12.5px;color:var(--text-secondary);margin-bottom:12px;">
                Erzeugt zu 100 % offline im Browser einen gestochen scharfen QR-Code (ISO/IEC 18004) und fügt ihn verschieb- und skalierbar auf der aktuellen PDF-Seite ein.
            </p>
            <div class="form-row">
                <label for="qrPayloadInput">Inhalt (Web-Adresse, E-Mail, Aktenzeichen oder Text)</label>
                <input type="text" id="qrPayloadInput" class="form-control" value="https://runready.cloud" placeholder="https://... oder Aktenzeichen">
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                <div class="form-row">
                    <label for="qrSizeSelect">Größe auf der Seite</label>
                    <select id="qrSizeSelect" class="form-control">
                        <option value="75">Klein (ca. 26 mm)</option>
                        <option value="105" selected>Mittel (ca. 37 mm)</option>
                        <option value="145">Groß (ca. 50 mm)</option>
                    </select>
                </div>
                <div class="form-row">
                    <label for="qrColorSelect">Farbe</label>
                    <select id="qrColorSelect" class="form-control">
                        <option value="#000000" selected>Schwarz (#000000)</option>
                        <option value="#1e3a8a">Behörden-Dunkelblau (#1E3A8A)</option>
                        <option value="#7f1d1d">Dunkelrot (#7F1D1D)</option>
                    </select>
                </div>
            </div>
            <div class="form-row">
                <label for="qrCaptionInput">Optionale Beschriftung unter dem QR-Code</label>
                <input type="text" id="qrCaptionInput" class="form-control" placeholder="z. B. Online-Bewerbung / Kennziffer 1026">
            </div>
            <div style="display:flex;justify-content:center;padding:12px;background:#ffffff;border-radius:8px;margin-top:8px;">
                <canvas id="qrPreviewCanvas" width="180" height="180" style="max-width:160px;height:auto;"></canvas>
            </div>
        </div>
        <div class="modal-footer">
            <button type="button" class="tool-btn" data-close-modal="modalQrCode">Abbrechen</button>
            <button type="button" class="tool-btn btn-primary" id="btnInsertQrIntoPdf">
                📱 QR-Code auf aktueller Seite einfügen
            </button>
        </div>
    </div>
</div>

<!-- MODAL: CHANGE OWN USER PASSWORD -->
<div class="modal-backdrop" id="modalChangeUserPassword">
    <div class="modal-window" style="max-width:440px;">
        <div class="modal-header">
            <span>🔑 Eigenes Passwort ändern</span>
            <button type="button" class="doc-tab-close" data-close-modal="modalChangeUserPassword">✕</button>
        </div>
        <div class="modal-body">
            <?php
            $gkCurrentUser = (!empty($_SESSION['pdfstudio_gatekeeper_user']) && is_array($_SESSION['pdfstudio_gatekeeper_user']))
                ? $_SESSION['pdfstudio_gatekeeper_user']
                : array('username' => '', 'display_name' => '', 'auth_source' => 'Lokal');
            $isLdapUser = stripos((string)$gkCurrentUser['auth_source'], 'LDAP') !== false;
            ?>
            <?php if ($isLdapUser): ?>
                <div style="padding:12px 14px;border-radius:8px;background:rgba(59,130,246,0.12);border:1px solid rgba(59,130,246,0.35);font-size:12.5px;line-height:1.5;">
                    ℹ️ <strong>Hinweis für LDAP / Active Directory Konten:</strong><br>
                    Sie sind über das zentrale Verzeichnis (<strong><?php echo htmlspecialchars((string)$gkCurrentUser['auth_source'], ENT_QUOTES, 'UTF-8'); ?></strong>) angemeldet. Bitte ändern Sie Ihr Passwort direkt über Ihre reguläre Windows-/Domänen-Anmeldung.
                </div>
            <?php else: ?>
                <div style="font-size:12px;color:var(--text-secondary);margin-bottom:12px;">
                    Angemeldet als: <strong><?php echo htmlspecialchars((string)$gkCurrentUser['display_name'], ENT_QUOTES, 'UTF-8'); ?></strong> (<code><?php echo htmlspecialchars((string)$gkCurrentUser['username'], ENT_QUOTES, 'UTF-8'); ?></code>)
                </div>
                <div class="form-row">
                    <label for="userCurPwInput">Aktuelles Passwort *</label>
                    <input type="password" id="userCurPwInput" class="form-control" placeholder="Ihr bisheriges Passwort" autocomplete="current-password">
                </div>
                <div class="form-row">
                    <label for="userNewPw1Input">Neues Passwort (mind. 6 Zeichen) *</label>
                    <input type="password" id="userNewPw1Input" class="form-control" placeholder="Neues Passwort eingeben" autocomplete="new-password">
                </div>
                <div class="form-row">
                    <label for="userNewPw2Input">Neues Passwort wiederholen *</label>
                    <input type="password" id="userNewPw2Input" class="form-control" placeholder="Neues Passwort bestätigen" autocomplete="new-password">
                </div>
                <div id="userPwChangeStatus" class="hidden" style="margin-top:10px;padding:10px 12px;border-radius:6px;font-size:12px;"></div>
            <?php endif; ?>
        </div>
        <div class="modal-footer">
            <button type="button" class="tool-btn" data-close-modal="modalChangeUserPassword">Schließen</button>
            <?php if (!$isLdapUser): ?>
                <button type="button" class="tool-btn btn-primary" id="btnSubmitUserPwChange">
                    💾 Passwort speichern
                </button>
            <?php endif; ?>
        </div>
    </div>
</div>

<!-- ======================================================================
     MODAL 1: INTELLIGENTE MUSTERSUCHE & AUTO-SCHWÄRZUNG (DSGVO)
     ====================================================================== -->
<div class="modal-backdrop" id="modalAutoRedact">
    <div class="modal-window" style="max-width:720px;">
        <div class="modal-header">
            <span>🔍⬛ Intelligente Mustersuche &amp; Auto-Schwärzung (DSGVO / Akten)</span>
            <button type="button" class="doc-tab-close" data-close-modal="modalAutoRedact">✕</button>
        </div>
        <div class="modal-body" style="max-height:74vh;overflow-y:auto;">
            <p style="font-size:12.5px;color:var(--text-secondary);margin-bottom:12px;line-height:1.45;">
                Durchsucht das geöffnete PDF automatisch nach sensiblen personenbezogenen Daten oder eigenen Suchbegriffen, zeigt alle Fundstellen mit Seitenzahl an und versieht sie auf Knopfdruck mit Schwärzungsbalken.
            </p>
            <div style="background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:8px;padding:12px;margin-bottom:12px;">
                <div style="font-size:12.5px;font-weight:700;margin-bottom:8px;">1. Zu suchende Muster auswählen:</div>
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px;font-size:12px;">
                    <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
                        <input type="checkbox" id="arPatIban" checked> 💳 IBAN / Bankverbindungen
                    </label>
                    <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
                        <input type="checkbox" id="arPatEmail" checked> 📧 E-Mail-Adressen
                    </label>
                    <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
                        <input type="checkbox" id="arPatPhone" checked> 📞 Telefon- &amp; Mobilnummern
                    </label>
                    <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
                        <input type="checkbox" id="arPatDate" checked> 📅 Geburtsdaten / Datumsangaben
                    </label>
                    <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
                        <input type="checkbox" id="arPatTaxId"> 🏛️ Steuer-ID / Aktenzeichen / PLZ
                    </label>
                </div>
                <div class="form-row" style="margin-top:10px;margin-bottom:8px;">
                    <label for="arCustomTerms">Zusätzliche Namen / Begriffe / Kennzeichen (kommagetrennt, optional):</label>
                    <input type="text" id="arCustomTerms" class="form-control" placeholder="z. B. Max Mustermann, Musterstraße 12, B-MW 1234">
                </div>
                <button type="button" class="tool-btn btn-primary" id="btnScanAutoRedact">
                    🔍 Gesamtes PDF jetzt nach Fundstellen durchsuchen
                </button>
            </div>

            <div id="arResultsContainer" style="background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:8px;padding:12px;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                    <strong id="arResultsTitle" style="font-size:12.5px;">Gefundene Treffer (0)</strong>
                    <label style="font-size:11.5px;display:inline-flex;align-items:center;gap:5px;cursor:pointer;">
                        <input type="checkbox" id="arSelectAllToggle" checked> Alle auswählen
                    </label>
                </div>
                <div id="arMatchesList" style="max-height:220px;overflow-y:auto;font-size:12px;display:flex;flex-direction:column;gap:4px;">
                    <div style="color:var(--text-muted);padding:8px 0;">Klicken Sie oben auf „Gesamtes PDF jetzt nach Fundstellen durchsuchen“.</div>
                </div>
            </div>
        </div>
        <div class="modal-footer" style="justify-content:space-between;flex-wrap:wrap;">
            <button type="button" class="tool-btn" data-close-modal="modalAutoRedact">Schließen</button>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
                <button type="button" class="tool-btn btn-primary" id="btnApplyAutoRedactBoxes">
                    ⬛ Ausgewählte Treffer schwärzen (Vorschau)
                </button>
                <button type="button" class="tool-btn btn-danger" id="btnApplyAndSanitizeAutoRedact" title="Schwärzungsbalken setzen und betroffene Seiten sofort physisch flachrechnen (unwiderruflich)">
                    🛡️ Schwärzen &amp; sofort physisch brennen (Sanitize)
                </button>
            </div>
        </div>
    </div>
</div>

<!-- ======================================================================
     MODAL 3: PDF-ANLAGEN / EINGEBETTETE DATEIEN VERWALTEN (PORTFOLIO)
     ====================================================================== -->
<div class="modal-backdrop" id="modalAttachments">
    <div class="modal-window" style="max-width:660px;">
        <div class="modal-header">
            <span>📎 PDF-Anlagen / Eingebettete Dateien verwalten</span>
            <button type="button" class="doc-tab-close" data-close-modal="modalAttachments">✕</button>
        </div>
        <div class="modal-body" style="max-height:74vh;overflow-y:auto;">
            <p style="font-size:12.5px;color:var(--text-secondary);margin-bottom:12px;line-height:1.45;">
                Zeigt alle im PDF eingebetteten Dateianhänge (z. B. Excel-Tabellen, Word-Dokumente, Bilder, Nachweise, XML) an und erlaubt das Hinzufügen beliebiger Begleitdateien direkt in den PDF-Container.
            </p>
            <div style="background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:8px;padding:12px;margin-bottom:12px;">
                <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:8px;">
                    <strong style="font-size:12.5px;">Vorhandene Dateianlagen im PDF</strong>
                    <button type="button" class="tool-btn btn-primary" id="btnAddAttachmentFiles">
                        ➕ Datei(en) in dieses PDF einbetten…
                    </button>
                    <input type="file" id="hiddenAttachmentInput" multiple class="hidden">
                </div>
                <div id="pdfAttachmentsList" style="display:flex;flex-direction:column;gap:6px;max-height:240px;overflow-y:auto;font-size:12.5px;">
                    <div style="color:var(--text-muted);padding:8px 0;">Prüfe PDF auf eingebettete Anlagen…</div>
                </div>
            </div>
        </div>
        <div class="modal-footer">
            <button type="button" class="tool-btn" data-close-modal="modalAttachments">Schließen</button>
        </div>
    </div>
</div>

<!-- ======================================================================
     MODAL 4: LESEZEICHEN- & INHALTSVERZEICHNIS-EDITOR (OUTLINES + DECKBLATT)
     ====================================================================== -->
<div class="modal-backdrop" id="modalBookmarks">
    <div class="modal-window" style="max-width:720px;">
        <div class="modal-header">
            <span>🔖 Lesezeichen-Editor &amp; automatisches Inhaltsverzeichnis</span>
            <button type="button" class="doc-tab-close" data-close-modal="modalBookmarks">✕</button>
        </div>
        <div class="modal-body" style="max-height:74vh;overflow-y:auto;">
            <p style="font-size:12.5px;color:var(--text-secondary);margin-bottom:12px;line-height:1.45;">
                Verwalten Sie die interaktiven PDF-Lesezeichen (<code>/Outlines</code>) für schnelle Navigation und Barrierefreiheit (Pflicht ab 21 Seiten) oder fügen Sie auf Knopfdruck ein formatiertes <strong>Inhaltsverzeichnis-Deckblatt</strong> als Seite 1 ein.
            </p>
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
                <button type="button" class="tool-btn" id="btnAutoDetectBookmarks" title="Erkennt Überschriften und Kapitel automatisch anhand der Schriftgrößen im Dokument">
                    🪄 Überschriften automatisch aus PDF erkennen
                </button>
                <button type="button" class="tool-btn" id="btnAddBookmarkRow">
                    ➕ Lesezeichen hinzufügen
                </button>
                <button type="button" class="tool-btn" id="btnClearBookmarks" style="margin-left:auto;">
                    🗑 Alle leeren
                </button>
            </div>

            <div id="bookmarksEditorList" style="display:flex;flex-direction:column;gap:6px;max-height:260px;overflow-y:auto;background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:8px;padding:10px;margin-bottom:12px;">
            </div>

            <div style="background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:8px;padding:12px;">
                <label style="display:flex;align-items:center;gap:8px;font-size:12.5px;font-weight:600;cursor:pointer;">
                    <input type="checkbox" id="bmInsertTocPage">
                    <span>📄 Zusätzlich ein sichtbares, klickbares <strong>Inhaltsverzeichnis-Deckblatt</strong> als erste Seite ins PDF einfügen</span>
                </label>
                <div class="form-row" style="margin-top:8px;margin-bottom:0;">
                    <label for="bmTocTitleInput">Überschrift des Inhaltsverzeichnisses:</label>
                    <input type="text" id="bmTocTitleInput" class="form-control" value="Inhaltsverzeichnis" placeholder="Inhaltsverzeichnis">
                </div>
            </div>
        </div>
        <div class="modal-footer" style="justify-content:space-between;flex-wrap:wrap;">
            <button type="button" class="tool-btn" data-close-modal="modalBookmarks">Abbrechen</button>
            <button type="button" class="tool-btn btn-primary" id="btnSaveBookmarksAndToc">
                🔖 Lesezeichen (&amp; optionales Inhaltsverzeichnis) ins PDF übernehmen
            </button>
        </div>
    </div>
</div>

<!-- ======================================================================
     MODAL 5: METADATEN- & FORENSIK-BEREINIGUNG (SANITIZE PDF)
     ====================================================================== -->
<div class="modal-backdrop" id="modalSanitizeMeta">
    <div class="modal-window" style="max-width:600px;">
        <div class="modal-header">
            <span>🧹 Metadaten- &amp; Forensik-Bereinigung („Sanitize PDF“)</span>
            <button type="button" class="doc-tab-close" data-close-modal="modalSanitizeMeta">✕</button>
        </div>
        <div class="modal-body">
            <p style="font-size:12.5px;color:var(--text-secondary);margin-bottom:12px;line-height:1.45;">
                Entfernt vor der Weitergabe oder Veröffentlichung sämtliche unsichtbaren Datenspuren, Bearbeitungshistorien, Autorennamen und aktive Skripte aus dem PDF.
            </p>
            <div id="sanitizeForensicReport" style="background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:8px;padding:12px;margin-bottom:12px;font-size:12px;line-height:1.6;">
                Prüfe Dokument auf Metadaten und versteckte Spuren…
            </div>
            <div style="background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:8px;padding:12px;display:flex;flex-direction:column;gap:8px;font-size:12.5px;">
                <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
                    <input type="checkbox" id="sanOptInfoXmp" checked>
                    <span><strong>Autoren-, Programm- &amp; Zeitstempel-Metadaten löschen</strong> (Author, Creator, Producer, CreationDate, ModDate, XMP-Historie)</span>
                </label>
                <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
                    <input type="checkbox" id="sanOptScripts" checked>
                    <span><strong>Eingebettetes JavaScript &amp; automatische OpenActions entfernen</strong> (Schutz vor aktiven Inhalten)</span>
                </label>
                <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
                    <input type="checkbox" id="sanOptAttachments">
                    <span><strong>Eingebettete Dateianhänge (`/EmbeddedFiles`) entfernen</strong></span>
                </label>
                <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
                    <input type="checkbox" id="sanOptAnnotations">
                    <span><strong>Alle Kommentare, Notizen &amp; Formularfelder flachrechnen</strong></span>
                </label>
            </div>
        </div>
        <div class="modal-footer">
            <button type="button" class="tool-btn" data-close-modal="modalSanitizeMeta">Abbrechen</button>
            <button type="button" class="tool-btn btn-primary" id="btnRunSanitizeMeta">
                🧹 PDF jetzt vollständig bereinigen
            </button>
        </div>
    </div>
</div>

<!-- ======================================================================
     MODAL 6: MEHRSEITEN-DRUCKLAYOUT (N-UP: 2-AUF-1, 4-AUF-1 & BROSCHÜRE)
     ====================================================================== -->
<div class="modal-backdrop" id="modalNupBooklet">
    <div class="modal-window" style="max-width:560px;">
        <div class="modal-header">
            <span>📖 Mehrseiten-Layout (N-up) &amp; Broschürendruck</span>
            <button type="button" class="doc-tab-close" data-close-modal="modalNupBooklet">✕</button>
        </div>
        <div class="modal-body">
            <p style="font-size:12.5px;color:var(--text-secondary);margin-bottom:12px;line-height:1.45;">
                Platziert mehrere PDF-Seiten platzsparend auf einem A4-Blatt (Handout) oder ordnet die Seiten automatisch für ein gefaltetes A5-Broschürenheft (Duplex-Druck) an.
            </p>
            <div class="form-row">
                <label for="nupLayoutMode">Layout-Modus wählen:</label>
                <select id="nupLayoutMode" class="form-control">
                    <option value="2up">2 Seiten auf 1 Blatt (A4 Querformat — nebeneinander)</option>
                    <option value="4up">4 Seiten auf 1 Blatt (A4 Hochformat — 2×2 Raster)</option>
                    <option value="booklet">Falt-Broschüre / Heftdruck (automatische Bogen-Ausschießung für A4-Duplexdruck)</option>
                </select>
            </div>
            <div class="form-row">
                <label for="nupPageMargin">Abstand / Rand zwischen den Seiten (Punkte):</label>
                <input type="number" id="nupPageMargin" class="form-control" value="18" min="0" max="60">
            </div>
            <div style="display:flex;flex-direction:column;gap:8px;font-size:12.5px;margin-top:8px;">
                <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
                    <input type="checkbox" id="nupDrawBorder" checked>
                    <span>Feinen Rahmen um jede platzierte Einzel-Seite zeichnen</span>
                </label>
                <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
                    <input type="checkbox" id="nupDrawFoldLine" checked>
                    <span>Falt- bzw. Trennlinie in der Blattmitte einzeichnen</span>
                </label>
            </div>
        </div>
        <div class="modal-footer">
            <button type="button" class="tool-btn" data-close-modal="modalNupBooklet">Abbrechen</button>
            <button type="button" class="tool-btn btn-primary" id="btnRunNupBooklet">
                📖 Neues Layout-PDF erzeugen
            </button>
        </div>
    </div>
</div>

<!-- ======================================================================
     MODAL 7: FORMULARDATEN-EXPORT & SERIENBRIEF-BEFÜLLUNG (CSV / EXCEL ↔ PDF)
     ====================================================================== -->
<div class="modal-backdrop" id="modalMailMerge">
    <div class="modal-window" style="max-width:700px;">
        <div class="modal-header">
            <span>📊 Formulardaten-Export &amp; Serienbrief-Befüllung (CSV / Excel ↔ PDF)</span>
            <button type="button" class="doc-tab-close" data-close-modal="modalMailMerge">✕</button>
        </div>
        <div class="modal-body" style="max-height:74vh;overflow-y:auto;">
            <!-- Section A: Export Form Fields -->
            <div style="background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:8px;padding:14px;margin-bottom:14px;">
                <div style="font-size:13px;font-weight:700;margin-bottom:6px;color:var(--accent-primary);">
                    1. Ausgefüllte PDF-Formularfelder auslesen &amp; exportieren
                </div>
                <p style="font-size:12px;color:var(--text-secondary);margin-bottom:10px;">
                    Erkennt alle AcroForm- und Studio-Formularfelder im aktuellen PDF. Sie können die aktuellen Feldwerte als Excel-kompatible CSV- oder JSON-Datei herunterladen.
                </p>
                <div id="mmDetectedFieldsBox" style="font-size:12px;padding:8px 10px;background:var(--bg-app);border:1px solid var(--border-subtle);border-radius:6px;margin-bottom:10px;max-height:130px;overflow-y:auto;">
                    Prüfe Formularfelder im geöffneten PDF…
                </div>
                <div style="display:flex;gap:8px;flex-wrap:wrap;">
                    <button type="button" class="tool-btn btn-primary" id="btnExportFormCsv">
                        📥 Feldwerte als CSV (Excel) exportieren
                    </button>
                    <button type="button" class="tool-btn" id="btnExportFormJson">
                        📥 Feldwerte als JSON exportieren
                    </button>
                    <button type="button" class="tool-btn" id="btnDownloadCsvTemplate" title="Erzeugt eine passende CSV-Vorlage mit den Feldnamen dieses PDFs als Spaltenüberschriften">
                        📋 Leere CSV-Vorlage für Serienbrief herunterladen
                    </button>
                </div>
            </div>

            <!-- Section B: Mail Merge from CSV / XLSX -->
            <div style="background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:8px;padding:14px;">
                <div style="font-size:13px;font-weight:700;margin-bottom:6px;color:#10b981;">
                    2. Serienbrief-Befüllung: PDF-Vorlage automatisch aus CSV- / Excel-Tabelle befüllen
                </div>
                <p style="font-size:12px;color:var(--text-secondary);margin-bottom:10px;">
                    Laden Sie eine <code>.csv</code>- oder <code>.xlsx</code>-Tabelle hoch, deren Spaltenüberschriften den Formularfeldnamen im PDF entsprechen. Für jede Tabellenzeile wird automatisch ein ausgefülltes PDF erzeugt und als <code>.zip</code>-Archiv bereitgestellt.
                </p>
                <div class="form-row">
                    <label for="mmCsvFileInput">CSV- oder Excel-Datei (<code>.csv</code>, <code>.xlsx</code>) auswählen:</label>
                    <input type="file" id="mmCsvFileInput" accept=".csv,.xlsx,.xls,text/csv" class="form-control">
                </div>
                <label style="display:flex;align-items:center;gap:8px;font-size:12px;cursor:pointer;margin-bottom:10px;">
                    <input type="checkbox" id="mmFlattenFilledPdfs">
                    <span>Erzeugte Serienbrief-PDFs direkt schreibschützen / Formularfelder flachrechnen</span>
                </label>
                <div id="mmStatusBox" style="display:none;padding:8px 10px;border-radius:6px;font-size:12px;margin-bottom:10px;"></div>
                <button type="button" class="tool-btn btn-primary" id="btnRunMailMerge">
                    🗂️ Serienbrief starten &amp; ausgefüllte PDFs als ZIP herunterladen
                </button>
            </div>
        </div>
        <div class="modal-footer">
            <button type="button" class="tool-btn" data-close-modal="modalMailMerge">Schließen</button>
        </div>
    </div>
</div>

<!-- Hidden File Inputs -->
<input type="file" id="hiddenPdfInput" accept=".pdf,application/pdf" multiple class="hidden">
<input type="file" id="hiddenMergeInput" accept=".pdf,application/pdf" multiple class="hidden">
<input type="file" id="hiddenImagesInput" accept="image/jpeg,image/png,image/webp" multiple class="hidden">
<input type="file" id="hiddenOverlayImageInput" accept="image/jpeg,image/png,image/webp" class="hidden">

<!-- Toast Notification Container -->
<div class="toast-container" id="toastContainer"></div>

<!-- Floating Assistant (Bottom-Right) -->
<div class="floating-assistant" id="floatingAssistant">
    <div class="assistant-panel" id="assistantPanel" aria-label="Soforthilfe">
        <div class="assistant-header">
            <div class="assistant-header-title">
                <div class="assistant-avatar">🤖</div>
                <div>
                    <div style="font-size:12.5px;font-weight:800;color:var(--text-primary);">Interaktive Soforthilfe</div>
                    <div style="font-size:10.5px;color:var(--text-secondary);">Schnellanleitungen &amp; 1-Klick-Werkzeugstarter</div>
                </div>
            </div>
            <div style="display:flex;align-items:center;gap:4px;">
                <button type="button" class="tool-btn" data-cmd="open-help" style="height:24px;padding:0 8px;font-size:11px;" title="Vollständiges Benutzerhandbuch in neuem Tab öffnen">
                    📖 Handbuch
                </button>
                <button type="button" class="doc-tab-close" id="btnCloseAssistant" title="Schließen">✕</button>
            </div>
        </div>

        <div class="assistant-context-banner" id="assistantContextBanner">
            💡 <strong>Aktueller Bereich:</strong> <span id="assistantContextText">Wählen Sie ein Thema oder stellen Sie unten eine Frage zu PDF-Werkstatt Pro.</span>
        </div>

        <div class="assistant-topics-bar" id="assistantTopicsBar">
            <button type="button" class="assistant-chip" data-assist-topic="edit-text">I✎ Text ändern</button>
            <button type="button" class="assistant-chip" data-assist-topic="merge-split">➕ Verbinden/Teilen</button>
            <button type="button" class="assistant-chip" data-assist-topic="sign-stamp">✍️ Signatur/Stempel</button>
            <button type="button" class="assistant-chip" data-assist-topic="redact">🛡️ Schwärzen</button>
            <button type="button" class="assistant-chip" data-assist-topic="compress">📉 Komprimieren</button>
            <button type="button" class="assistant-chip" data-assist-topic="ocr">🔎 Scan-OCR</button>
            <button type="button" class="assistant-chip" data-assist-topic="a11y">♿ Barrierefrei</button>
            <button type="button" class="assistant-chip" data-assist-topic="autosave">⏱️ Auto-Save</button>
            <button type="button" class="assistant-chip" data-assist-topic="shortcuts">⌨️ Tastenkürzel</button>
        </div>

        <div class="assistant-messages" id="assistantMessages">
            <div class="assistant-msg bot">
                👋 <strong>Wie kann ich Ihnen helfen?</strong><br>
                Klicken Sie oben auf ein Schnellthema oder tippen Sie unten ein Stichwort ein (z. B. <em>„Text ändern“</em>, <em>„Unterschrift“</em>, <em>„Seiten drehen“</em>, <em>„Komprimieren“</em>, <em>„Barrierefrei“</em>) — ich erkläre Ihnen sofort den Weg und kann das passende Werkzeug direkt für Sie starten!
            </div>
        </div>

        <form class="assistant-input-bar" id="assistantSearchForm" onsubmit="return false;">
            <input type="text" id="assistantQueryInput" class="form-control" placeholder="Frage stellen (z. B. Wie ändere ich Text im PDF?)…" autocomplete="off">
            <button type="submit" class="tool-btn btn-primary" id="btnSendAssistantQuery" style="height:32px;padding:0 12px;">Fragen</button>
        </form>
    </div>

    <button type="button" class="assistant-launcher-btn" id="btnToggleAssistant" title="Interaktive Hilfe öffnen oder schließen">
        <span class="assistant-launcher-icon">💬</span>
        <span class="assistant-pulse-dot"></span>
    </button>
</div>

<script src="assets/js/app.js?v=<?php echo urlencode(PDFSTUDIO_VERSION) . '.' . (int)@filemtime(__DIR__ . '/assets/js/app.js'); ?>"></script>
</body>
</html>
