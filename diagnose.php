<?php
/**
 * PDF-Werkstatt Pro v1.0 — Standalone Server-Diagnose (Kompatibel ab PHP 5.3 / 5.4 / 5.5+)
 * Rufen Sie diese Datei im Browser auf (z. B. http://ihr-server/diagnose.php),
 * um Dateirechte, PHP-Module und Apache-Einstellungen zu pruefen.
 */
@ini_set('display_errors', '0');
error_reporting(0);
if (!headers_sent()) {
    header('Content-Type: text/html; charset=UTF-8');
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: SAMEORIGIN');
    header('Referrer-Policy: strict-origin-when-cross-origin');
    header('Cache-Control: no-store, no-cache, must-revalidate');
}

$root = dirname(__FILE__);
$checks = array();

$checks[] = array(
    'label' => 'PHP-Version (' . PHP_VERSION . ')',
    'ok'    => version_compare(PHP_VERSION, '5.4.0', '>='),
    'info'  => version_compare(PHP_VERSION, '5.4.0', '>=') ? 'Kompatibel (ab PHP 5.4.0 unterstuetzt)' : 'Zu alt (mindestens PHP 5.4.0 erforderlich)'
);

$requiredFiles = array(
    'index.php',
    'api.php',
    'hilfe.php',
    'config.php',
    'includes/bootstrap.php',
    'includes/account.php',
    'assets/css/desktop.css',
    'assets/js/app.js',
    'assets/vendor/pdf-lib.min.js',
    'assets/vendor/pdf.min.js',
    'assets/vendor/pdf.worker.min.js'
);

foreach ($requiredFiles as $rel) {
    $full = $root . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $rel);
    $exists = is_file($full);
    $readable = $exists && is_readable($full);
    $checks[] = array(
        'label' => 'Datei: ' . $rel,
        'ok'    => $readable,
        'info'  => $readable ? ('Vorhanden & lesbar (' . filesize($full) . ' Bytes)') : ($exists ? 'FEHLER: Keine Leserechte fuer Apache (chmod 644 / 755 setzen!)' : 'FEHLER: Datei fehlt auf dem Server!')
    );
}

$storageDir = $root . DIRECTORY_SEPARATOR . 'storage';
if (!is_dir($storageDir)) {
    @mkdir($storageDir, 0755, true);
}
$storageWritable = is_dir($storageDir) && is_writable($storageDir);
$checks[] = array(
    'label' => 'Verzeichnis: storage/ (Schreibrechte)',
    'ok'    => $storageWritable,
    'info'  => $storageWritable ? 'Beschreibbar durch Webserver' : 'FEHLER: Nicht beschreibbar! Bitte chmod -R 775 storage/ und chown www-data ausfuehren.'
);

$checks[] = array(
    'label' => 'PHP-Erweiterung: json',
    'ok'    => function_exists('json_encode'),
    'info'  => function_exists('json_encode') ? 'Aktiv' : 'Hinweis: php5-json fehlt (integrierter Fallback in bootstrap.php übernimmt)'
);

$checks[] = array(
    'label' => 'PHP-Erweiterung: session',
    'ok'    => function_exists('session_start'),
    'info'  => function_exists('session_start') ? 'Aktiv' : 'FEHLER: PHP-Session-Modul fehlt!'
);
?><!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="utf-8">
    <title>PDF-Werkstatt Pro v1.0 — Server-Diagnose</title>
    <style>
        body { background: #14171f; color: #f1f5f9; font-family: sans-serif; padding: 30px; margin: 0; }
        .box { max-width: 820px; margin: 0 auto; background: #1d222e; border: 1px solid #363e52; border-radius: 10px; padding: 24px; }
        h1 { margin-top: 0; font-size: 20px; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 13.5px; }
        th, td { text-align: left; padding: 9px 10px; border-bottom: 1px solid #282e3d; }
        .ok { color: #10b981; font-weight: bold; }
        .err { color: #ef4444; font-weight: bold; }
        .btn { display: inline-block; margin-top: 18px; padding: 9px 16px; background: #2563eb; color: #fff; text-decoration: none; border-radius: 6px; font-weight: bold; }
    </style>
</head>
<body>
<div class="box">
    <h1>🔍 PDF-Werkstatt Pro v1.0 — Apache &amp; PHP 5.5 Server-Diagnose</h1>
    <p>Server-Software: <code><?php echo htmlspecialchars(isset($_SERVER['SERVER_SOFTWARE']) ? $_SERVER['SERVER_SOFTWARE'] : 'Unbekannt', ENT_QUOTES, 'UTF-8'); ?></code> | PHP: <code><?php echo htmlspecialchars(PHP_VERSION, ENT_QUOTES, 'UTF-8'); ?></code></p>
    <table>
        <thead>
            <tr>
                <th>Prüfpunkt</th>
                <th>Status</th>
                <th>Details</th>
            </tr>
        </thead>
        <tbody>
            <?php foreach ($checks as $c): ?>
            <tr>
                <td><code><?php echo htmlspecialchars($c['label'], ENT_QUOTES, 'UTF-8'); ?></code></td>
                <td class="<?php echo $c['ok'] ? 'ok' : 'err'; ?>"><?php echo $c['ok'] ? '✔ OK' : '✕ FEHLER'; ?></td>
                <td><?php echo htmlspecialchars($c['info'], ENT_QUOTES, 'UTF-8'); ?></td>
            </tr>
            <?php endforeach; ?>
        </tbody>
    </table>
    <a class="btn" href="index.php">→ Weiter zur Hauptanwendung (index.php)</a>
</div>
</body>
</html>
