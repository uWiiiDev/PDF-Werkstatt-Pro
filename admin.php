<?php
/**
 * PDF-Werkstatt Pro — Passwortgeschützter Administrationsbereich (admin.php)
 * Verwaltung von:
 *  - Anwendungs-Login (Gatekeeper: Offen / Lokal / LDAP / Kombiniert)
 *  - Lokalen Benutzern ohne Datenbank (Bcrypt-gehasht in storage/gatekeeper_users.json)
 *  - LDAP / Active Directory Anbindung inkl. Live-Verbindungstester
 *  - Allgemeinen Sicherheits- & SMTP-Einstellungen (vormals config.php)
 */
define('PDFSTUDIO_ROOT', __DIR__);
require_once __DIR__ . '/includes/bootstrap.php';

$settings = pdfstudio_load_admin_settings();
$csrfToken = pdfstudio_get_csrf_token();
$flashSuccess = '';
$flashError = '';
$ldapTestResult = null;

// Handle Admin Logout
if (isset($_GET['admin_logout'])) {
    unset($_SESSION['pdfstudio_admin_logged_in']);
    header('Location: admin.php');
    exit;
}

$hasAdminPassword = !empty($settings['admin_password_hash']);
$isAdminLoggedIn = !empty($_SESSION['pdfstudio_admin_logged_in']);

// 1. Handle Initial Admin Password Setup (first run only)
if (!$hasAdminPassword && $_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action']) && $_POST['action'] === 'setup_admin_password') {
    if (!pdfstudio_verify_csrf_token()) {
        $flashError = 'Ungültiges Sicherheits-Token (CSRF). Bitte Seite neu laden.';
    } else {
        $pw1 = isset($_POST['new_password']) ? (string)$_POST['new_password'] : '';
        $pw2 = isset($_POST['confirm_password']) ? (string)$_POST['confirm_password'] : '';
        if (strlen($pw1) < 8) {
            $flashError = 'Das Admin-Passwort muss mindestens 8 Zeichen lang sein.';
        } elseif ($pw1 !== $pw2) {
            $flashError = 'Die beiden eingegebenen Passwörter stimmen nicht überein.';
        } else {
            $hash = pdfstudio_hash_password($pw1);
            pdfstudio_save_admin_settings(array('admin_password_hash' => $hash));
            $settings = pdfstudio_load_admin_settings();
            $hasAdminPassword = true;
            if (function_exists('session_regenerate_id')) {
                @session_regenerate_id(true);
            }
            $_SESSION['pdfstudio_admin_logged_in'] = true;
            $isAdminLoggedIn = true;
            $flashSuccess = 'Admin-Passwort wurde sicher (Bcrypt-Hash) gespeichert. Willkommen im Administrationsbereich!';
        }
    }
}

// 2. Handle Admin Login
if ($hasAdminPassword && !$isAdminLoggedIn && $_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action']) && $_POST['action'] === 'admin_login') {
    if (!pdfstudio_verify_csrf_token()) {
        $flashError = 'Ungültiges Sicherheits-Token (CSRF). Bitte Seite neu laden.';
    } else {
        $rl = pdfstudio_check_rate_limit('admin_login');
        if (empty($rl['allowed'])) {
            $flashError = 'Zu viele Fehlversuche. Bitte warten Sie ' . (int)$rl['retry_after'] . ' Sekunden.';
        } else {
            $pw = isset($_POST['admin_password']) ? (string)$_POST['admin_password'] : '';
            if ($pw !== '' && pdfstudio_verify_password($pw, $settings['admin_password_hash'])) {
                pdfstudio_clear_rate_limit('admin_login');
                if (function_exists('session_regenerate_id')) {
                    @session_regenerate_id(true);
                }
                $_SESSION['pdfstudio_admin_logged_in'] = true;
                $isAdminLoggedIn = true;
            } else {
                pdfstudio_record_rate_limit_failure('admin_login');
                $flashError = 'Ungültiges Administrator-Passwort.';
            }
        }
    }
}

// 3. Handle Authenticated Admin Actions
if ($isAdminLoggedIn && $_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action'])) {
    if (!pdfstudio_verify_csrf_token()) {
        $flashError = 'Ungültiges Sicherheits-Token (CSRF). Bitte Seite neu laden.';
    } else {
        $act = (string)$_POST['action'];

        if ($act === 'save_gatekeeper_and_ldap' || $act === 'test_ldap_live') {
            $allowedModes = array('none', 'local', 'ldap', 'both');
            $authMode = isset($_POST['auth_mode']) && in_array($_POST['auth_mode'], $allowedModes, true) ? $_POST['auth_mode'] : 'none';
            $bindModes = array('direct_upn', 'search_bind', 'direct_dn');
            $bindMode = isset($_POST['ldap_bind_mode']) && in_array($_POST['ldap_bind_mode'], $bindModes, true) ? $_POST['ldap_bind_mode'] : 'direct_upn';

            $newLdapBindPw = isset($_POST['ldap_bind_password']) ? (string)$_POST['ldap_bind_password'] : '';
            if ($newLdapBindPw === '' && !empty($settings['ldap_bind_password']) && empty($_POST['clear_ldap_bind_password'])) {
                $newLdapBindPw = $settings['ldap_bind_password'];
            }

            $updated = array(
                'auth_mode'           => $authMode,
                'auth_banner_title'   => trim((string)(isset($_POST['auth_banner_title']) ? $_POST['auth_banner_title'] : 'Anmeldung an der PDF-Werkstatt Pro')),
                'auth_banner_hint'    => trim((string)(isset($_POST['auth_banner_hint']) ? $_POST['auth_banner_hint'] : 'Bitte melden Sie sich mit Ihrer Benutzerkennung an.')),
                'ldap_host'           => trim((string)(isset($_POST['ldap_host']) ? $_POST['ldap_host'] : '')),
                'ldap_port'           => max(1, min(65535, (int)(isset($_POST['ldap_port']) ? $_POST['ldap_port'] : 389))),
                'ldap_use_starttls'   => !empty($_POST['ldap_use_starttls']),
                'ldap_ignore_cert'    => !empty($_POST['ldap_ignore_cert']),
                'ldap_timeout'        => max(2, min(60, (int)(isset($_POST['ldap_timeout']) ? $_POST['ldap_timeout'] : 8))),
                'ldap_bind_mode'      => $bindMode,
                'ldap_upn_suffix'     => trim((string)(isset($_POST['ldap_upn_suffix']) ? $_POST['ldap_upn_suffix'] : '')),
                'ldap_netbios_domain' => trim((string)(isset($_POST['ldap_netbios_domain']) ? $_POST['ldap_netbios_domain'] : '')),
                'ldap_dn_template'    => trim((string)(isset($_POST['ldap_dn_template']) ? $_POST['ldap_dn_template'] : 'uid={username},ou=users,dc=example,dc=de')),
                'ldap_base_dn'        => trim((string)(isset($_POST['ldap_base_dn']) ? $_POST['ldap_base_dn'] : '')),
                'ldap_bind_dn'        => trim((string)(isset($_POST['ldap_bind_dn']) ? $_POST['ldap_bind_dn'] : '')),
                'ldap_bind_password'  => $newLdapBindPw,
                'ldap_search_filter'  => trim((string)(isset($_POST['ldap_search_filter']) ? $_POST['ldap_search_filter'] : '(&(objectClass=user)(sAMAccountName={username}))')),
                'ldap_display_attr'   => trim((string)(isset($_POST['ldap_display_attr']) ? $_POST['ldap_display_attr'] : 'displayName')),
                'ldap_required_group' => trim((string)(isset($_POST['ldap_required_group']) ? $_POST['ldap_required_group'] : ''))
            );

            // Prevent locking out if 'local' mode is chosen without any active local user
            if ($authMode === 'local') {
                $existingLocal = pdfstudio_load_local_users();
                $hasActiveLocal = false;
                foreach ($existingLocal as $lu) {
                    if (!empty($lu['active'])) {
                        $hasActiveLocal = true;
                        break;
                    }
                }
                if (!$hasActiveLocal) {
                    $flashError = 'Hinweis: Bitte legen Sie zuerst mindestens einen aktiven lokalen Benutzer an, bevor Sie den Zugriffsmodus "Nur lokale Benutzer" aktivieren.';
                    $updated['auth_mode'] = $settings['auth_mode'];
                }
            }

            pdfstudio_save_admin_settings($updated);
            $settings = pdfstudio_load_admin_settings();

            if ($act === 'test_ldap_live') {
                $testUser = isset($_POST['ldap_test_username']) ? trim((string)$_POST['ldap_test_username']) : '';
                $testPass = isset($_POST['ldap_test_password']) ? (string)$_POST['ldap_test_password'] : '';
                $ldapTestResult = pdfstudio_ldap_authenticate($testUser, $testPass, $updated, ($testUser === '' || $testPass === ''));
                if (!empty($ldapTestResult['ok'])) {
                    $flashSuccess = 'LDAP-Diagnosetest erfolgreich abgeschlossen!';
                } else {
                    $flashError = 'LDAP-Diagnosetest meldet ein Problem: ' . $ldapTestResult['error'];
                }
            } elseif ($flashError === '') {
                $flashSuccess = 'Zugriffsschutz- und LDAP-Einstellungen wurden erfolgreich gespeichert.';
            }
        } elseif ($act === 'upsert_local_user') {
            $uName = isset($_POST['local_username']) ? trim((string)$_POST['local_username']) : '';
            $dName = isset($_POST['local_display_name']) ? trim((string)$_POST['local_display_name']) : '';
            $uPass = isset($_POST['local_password']) ? (string)$_POST['local_password'] : '';
            $res = pdfstudio_upsert_local_user($uName, $dName, $uPass, true);
            if (!empty($res['ok'])) {
                $flashSuccess = 'Lokaler Benutzer "' . htmlspecialchars(strtolower($uName), ENT_QUOTES, 'UTF-8') . '" wurde mit Bcrypt-Passwort-Hash gespeichert.';
            } else {
                $flashError = $res['error'];
            }
        } elseif ($act === 'toggle_local_user') {
            $uName = isset($_POST['target_username']) ? (string)$_POST['target_username'] : '';
            pdfstudio_toggle_local_user($uName);
            $flashSuccess = 'Status für Benutzer "' . htmlspecialchars($uName, ENT_QUOTES, 'UTF-8') . '" wurde umgeschaltet.';
        } elseif ($act === 'delete_local_user') {
            $uName = isset($_POST['target_username']) ? (string)$_POST['target_username'] : '';
            pdfstudio_delete_local_user($uName);
            $flashSuccess = 'Lokaler Benutzer "' . htmlspecialchars($uName, ENT_QUOTES, 'UTF-8') . '" wurde gelöscht.';
        } elseif ($act === 'save_system_settings') {
            $newSmtpPw = isset($_POST['smtp_password']) ? (string)$_POST['smtp_password'] : '';
            if ($newSmtpPw === '' && !empty($settings['smtp_password']) && empty($_POST['clear_smtp_password'])) {
                $newSmtpPw = $settings['smtp_password'];
            }
            $sysUpdate = array(
                'max_login_attempts'    => max(3, min(50, (int)(isset($_POST['max_login_attempts']) ? $_POST['max_login_attempts'] : 8))),
                'login_lockout_seconds' => max(30, min(86400, (int)(isset($_POST['login_lockout_seconds']) ? $_POST['login_lockout_seconds'] : 300))),
                'mail_transport'        => (isset($_POST['mail_transport']) && $_POST['mail_transport'] === 'mail') ? 'mail' : 'smtp',
                'mail_from_address'     => trim((string)(isset($_POST['mail_from_address']) ? $_POST['mail_from_address'] : 'noreply@pdf-werkstatt.local')),
                'mail_from_name'        => trim((string)(isset($_POST['mail_from_name']) ? $_POST['mail_from_name'] : 'PDF-Werkstatt Pro')),
                'smtp_host'             => trim((string)(isset($_POST['smtp_host']) ? $_POST['smtp_host'] : '')),
                'smtp_port'             => max(1, min(65535, (int)(isset($_POST['smtp_port']) ? $_POST['smtp_port'] : 587))),
                'smtp_encryption'       => isset($_POST['smtp_encryption']) && in_array($_POST['smtp_encryption'], array('tls', 'ssl', ''), true) ? $_POST['smtp_encryption'] : 'tls',
                'smtp_auth'             => !empty($_POST['smtp_auth']),
                'smtp_username'         => trim((string)(isset($_POST['smtp_username']) ? $_POST['smtp_username'] : '')),
                'smtp_password'         => $newSmtpPw,
                'smtp_timeout'          => max(2, min(60, (int)(isset($_POST['smtp_timeout']) ? $_POST['smtp_timeout'] : 10)))
            );
            pdfstudio_save_admin_settings($sysUpdate);
            $settings = pdfstudio_load_admin_settings();
            $flashSuccess = 'System-, Sicherheits- und SMTP-Einstellungen wurden gespeichert.';
        } elseif ($act === 'change_admin_password') {
            $curPw = isset($_POST['current_admin_password']) ? (string)$_POST['current_admin_password'] : '';
            $newPw1 = isset($_POST['new_admin_password']) ? (string)$_POST['new_admin_password'] : '';
            $newPw2 = isset($_POST['confirm_admin_password']) ? (string)$_POST['confirm_admin_password'] : '';
            if (!pdfstudio_verify_password($curPw, $settings['admin_password_hash'])) {
                $flashError = 'Das aktuelle Admin-Passwort ist nicht korrekt.';
            } elseif (strlen($newPw1) < 8) {
                $flashError = 'Das neue Admin-Passwort muss mindestens 8 Zeichen lang sein.';
            } elseif ($newPw1 !== $newPw2) {
                $flashError = 'Die neuen Passwörter stimmen nicht überein.';
            } else {
                pdfstudio_save_admin_settings(array('admin_password_hash' => pdfstudio_hash_password($newPw1)));
                $settings = pdfstudio_load_admin_settings();
                $flashSuccess = 'Das Administrator-Passwort wurde erfolgreich geändert (Bcrypt-Hash aktualisiert).';
            }
        }
    }
}

$localUsers = pdfstudio_load_local_users();
$ldapExtLoaded = function_exists('ldap_connect');
?><!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Adminbereich — PDF-Werkstatt Pro v<?php echo htmlspecialchars(PDFSTUDIO_VERSION, ENT_QUOTES, 'UTF-8'); ?></title>
    <link rel="stylesheet" href="assets/css/desktop.css?v=<?php echo urlencode(PDFSTUDIO_VERSION) . '.' . (int)@filemtime(__DIR__ . '/assets/css/desktop.css'); ?>">
    <style>
        html, body {
            overflow-y: auto !important;
            height: auto !important;
            min-height: 100vh;
            background: #0f131a;
            color: #f1f5f9;
            font-family: system-ui, -apple-system, sans-serif;
            user-select: text !important;
        }
        .adm-topbar {
            position: sticky;
            top: 0;
            z-index: 50;
            background: #161b26;
            border-bottom: 1px solid #263042;
            padding: 12px 24px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 16px;
            flex-wrap: wrap;
        }
        .adm-wrap {
            max-width: 1180px;
            margin: 0 auto;
            padding: 24px 20px 64px;
        }
        .adm-card {
            background: #181e29;
            border: 1px solid #283246;
            border-radius: 10px;
            padding: 22px 24px;
            margin-bottom: 22px;
        }
        .adm-card h2 {
            margin: 0 0 6px;
            font-size: 16.5px;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .adm-card p.adm-desc {
            margin: 0 0 18px;
            font-size: 12.5px;
            color: #94a3b8;
            line-height: 1.5;
        }
        .adm-grid-2 {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 14px 18px;
        }
        .adm-grid-3 {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
            gap: 14px 18px;
        }
        .adm-field {
            margin-bottom: 12px;
        }
        .adm-field label {
            display: block;
            font-size: 12px;
            font-weight: 600;
            color: #cbd5e1;
            margin-bottom: 5px;
        }
        .adm-field small {
            display: block;
            font-size: 11px;
            color: #64748b;
            margin-top: 4px;
            line-height: 1.35;
        }
        .adm-input, .adm-select {
            width: 100%;
            height: 36px;
            padding: 0 11px;
            border-radius: 6px;
            border: 1px solid #334155;
            background: #0f131a;
            color: #f8fafc;
            font-size: 13px;
            box-sizing: border-box;
        }
        .adm-input:focus, .adm-select:focus {
            outline: none;
            border-color: #3b82f6;
            box-shadow: 0 0 0 2px rgba(59,130,246,0.22);
        }
        .adm-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            height: 36px;
            padding: 0 16px;
            border-radius: 6px;
            border: 1px solid #334155;
            background: #232c3d;
            color: #f1f5f9;
            font-size: 12.5px;
            font-weight: 600;
            cursor: pointer;
            text-decoration: none;
        }
        .adm-btn:hover {
            background: #2d384d;
        }
        .adm-btn-primary {
            background: #3b82f6;
            border-color: #3b82f6;
            color: #ffffff;
        }
        .adm-btn-primary:hover {
            background: #2563eb;
        }
        .adm-btn-danger {
            background: rgba(239,68,68,0.15);
            border-color: rgba(239,68,68,0.4);
            color: #fca5a5;
        }
        .adm-btn-danger:hover {
            background: rgba(239,68,68,0.28);
        }
        .adm-alert {
            padding: 12px 16px;
            border-radius: 8px;
            margin-bottom: 18px;
            font-size: 13px;
            line-height: 1.45;
        }
        .adm-alert-ok {
            background: rgba(16,185,129,0.14);
            border: 1px solid rgba(16,185,129,0.4);
            color: #6ee7b7;
        }
        .adm-alert-err {
            background: rgba(239,68,68,0.14);
            border: 1px solid rgba(239,68,68,0.4);
            color: #fca5a5;
        }
        .adm-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 12.5px;
            margin-top: 12px;
        }
        .adm-table th, .adm-table td {
            padding: 9px 10px;
            text-align: left;
            border-bottom: 1px solid #263042;
        }
        .adm-table th {
            color: #94a3b8;
            font-weight: 600;
            background: #131822;
        }
        .adm-pill {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 99px;
            font-size: 11px;
            font-weight: 600;
        }
        .adm-pill-ok {
            background: rgba(16,185,129,0.16);
            color: #34d399;
        }
        .adm-pill-warn {
            background: rgba(245,158,11,0.16);
            color: #fbbf24;
        }
        .adm-pill-off {
            background: rgba(148,163,184,0.15);
            color: #94a3b8;
        }
        .adm-login-box {
            max-width: 430px;
            margin: 64px auto;
            background: #181e29;
            border: 1px solid #2a3446;
            border-radius: 12px;
            padding: 28px;
            box-shadow: 0 20px 50px rgba(0,0,0,0.45);
        }
    </style>
</head>
<body>

<header class="adm-topbar">
    <div style="display:flex;align-items:center;gap:10px;">
        <span class="app-brand-badge">PDF</span>
        <strong>PDF-Werkstatt Pro v<?php echo htmlspecialchars(PDFSTUDIO_VERSION, ENT_QUOTES, 'UTF-8'); ?> — Administrationsbereich</strong>
    </div>
    <div style="display:flex;align-items:center;gap:8px;">
        <a href="index.php" class="adm-btn">⬅ Zurück zur Anwendung</a>
        <?php if ($isAdminLoggedIn): ?>
            <a href="admin.php?admin_logout=1" class="adm-btn adm-btn-danger">⎋ Admin abmelden</a>
        <?php endif; ?>
    </div>
</header>

<div class="adm-wrap">

    <?php if ($flashSuccess !== ''): ?>
        <div class="adm-alert adm-alert-ok">✔ <?php echo htmlspecialchars($flashSuccess, ENT_QUOTES, 'UTF-8'); ?></div>
    <?php endif; ?>
    <?php if ($flashError !== ''): ?>
        <div class="adm-alert adm-alert-err">⚠️ <?php echo htmlspecialchars($flashError, ENT_QUOTES, 'UTF-8'); ?></div>
    <?php endif; ?>

    <?php if (!$hasAdminPassword): ?>
        <!-- INITIAL ADMIN PASSWORD SETUP -->
        <div class="adm-login-box">
            <h2 style="margin:0 0 8px;font-size:18px;">🔐 Ersteinrichtung: Admin-Passwort festlegen</h2>
            <p style="font-size:12.5px;color:#94a3b8;line-height:1.5;margin:0 0 18px;">
                Legen Sie jetzt ein Administrator-Passwort fest, um die Systemeinstellungen, die LDAP-Anbindung und die lokale Benutzerverwaltung zu schützen. Das Passwort wird ausschließlich als kryptografischer Bcrypt-Hash gespeichert.
            </p>
            <form method="post" action="admin.php">
                <input type="hidden" name="csrf_token" value="<?php echo htmlspecialchars($csrfToken, ENT_QUOTES, 'UTF-8'); ?>">
                <input type="hidden" name="action" value="setup_admin_password">
                <div class="adm-field">
                    <label for="initPw1">Neues Admin-Passwort (mind. 8 Zeichen)</label>
                    <input type="password" id="initPw1" name="new_password" class="adm-input" minlength="8" required autofocus>
                </div>
                <div class="adm-field">
                    <label for="initPw2">Admin-Passwort wiederholen</label>
                    <input type="password" id="initPw2" name="confirm_password" class="adm-input" minlength="8" required>
                </div>
                <button type="submit" class="adm-btn adm-btn-primary" style="width:100%;height:40px;margin-top:6px;">
                    ✔ Admin-Passwort speichern &amp; öffnen
                </button>
            </form>
        </div>

    <?php elseif (!$isAdminLoggedIn): ?>
        <!-- ADMIN LOGIN SCREEN -->
        <div class="adm-login-box">
            <h2 style="margin:0 0 8px;font-size:18px;">🔒 Administrator-Anmeldung</h2>
            <p style="font-size:12.5px;color:#94a3b8;line-height:1.5;margin:0 0 18px;">
                Bitte geben Sie das Administrator-Passwort ein, um die Einstellungen, LDAP-Zugangsdaten und lokalen Benutzer zu verwalten.
            </p>
            <form method="post" action="admin.php">
                <input type="hidden" name="csrf_token" value="<?php echo htmlspecialchars($csrfToken, ENT_QUOTES, 'UTF-8'); ?>">
                <input type="hidden" name="action" value="admin_login">
                <div class="adm-field">
                    <label for="admPw">Administrator-Passwort</label>
                    <input type="password" id="admPw" name="admin_password" class="adm-input" required autofocus>
                </div>
                <button type="submit" class="adm-btn adm-btn-primary" style="width:100%;height:40px;margin-top:6px;">
                    🔓 Anmelden
                </button>
            </form>
        </div>

    <?php else: ?>
        <!-- AUTHENTICATED ADMIN DASHBOARD -->

        <!-- 1. GATEKEEPER & LDAP CONFIGURATION -->
        <form method="post" action="admin.php">
            <input type="hidden" name="csrf_token" value="<?php echo htmlspecialchars($csrfToken, ENT_QUOTES, 'UTF-8'); ?>">

            <div class="adm-card">
                <h2>🛡️ 1. Zugriffsschutz vor der Anwendung (Login-Schranke / Gatekeeper)</h2>
                <p class="adm-desc">
                    Legen Sie fest, ob vor dem Start der PDF-Werkstatt Pro eine Anmeldung erforderlich ist und ob diese gegen lokale Benutzer, gegen Ihren LDAP-/Active-Directory-Server oder kombiniert geprüft werden soll.
                </p>

                <div class="adm-grid-3">
                    <div class="adm-field">
                        <label for="authModeSelect">Anmeldemodus vor der Anwendung</label>
                        <select id="authModeSelect" name="auth_mode" class="adm-select">
                            <option value="none" <?php echo ($settings['auth_mode'] === 'none') ? 'selected' : ''; ?>>🔓 Offen (Kein Login erforderlich)</option>
                            <option value="local" <?php echo ($settings['auth_mode'] === 'local') ? 'selected' : ''; ?>>👤 Nur lokale Benutzer (ohne Datenbank)</option>
                            <option value="ldap" <?php echo ($settings['auth_mode'] === 'ldap') ? 'selected' : ''; ?>>🏢 Nur LDAP / Active Directory</option>
                            <option value="both" <?php echo ($settings['auth_mode'] === 'both') ? 'selected' : ''; ?>>🔄 Kombiniert (LDAP + lokale Benutzer)</option>
                        </select>
                        <small>Bei „Kombiniert“ können sich sowohl Haus-Nutzer per LDAP als auch lokal angelegte Konten anmelden.</small>
                    </div>
                    <div class="adm-field">
                        <label for="authBannerTitle">Überschrift im Anmeldefenster</label>
                        <input type="text" id="authBannerTitle" name="auth_banner_title" class="adm-input" value="<?php echo htmlspecialchars((string)$settings['auth_banner_title'], ENT_QUOTES, 'UTF-8'); ?>">
                    </div>
                    <div class="adm-field">
                        <label for="authBannerHint">Hinweistext im Anmeldefenster</label>
                        <input type="text" id="authBannerHint" name="auth_banner_hint" class="adm-input" value="<?php echo htmlspecialchars((string)$settings['auth_banner_hint'], ENT_QUOTES, 'UTF-8'); ?>">
                    </div>
                </div>
            </div>

            <!-- 2. LDAP / ACTIVE DIRECTORY SETTINGS & LIVE TESTER -->
            <div class="adm-card">
                <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:6px;">
                    <h2 style="margin:0;">🏢 2. LDAP / Active Directory Konfiguration &amp; Live-Test</h2>
                    <?php if ($ldapExtLoaded): ?>
                        <span class="adm-pill adm-pill-ok">✔ PHP-Modul php-ldap aktiv</span>
                    <?php else: ?>
                        <span class="adm-pill adm-pill-warn">⚠️ PHP-Modul php-ldap nicht geladen (TCP-Porttest dennoch verfügbar)</span>
                    <?php endif; ?>
                </div>
                <p class="adm-desc">
                    Tragen Sie hier die Verbindungsdaten Ihres Verzeichnisdienstes (Active Directory / OpenLDAP) ein. Über den Testbereich unten können Sie die Verbindung und eine Test-Kennung jederzeit live prüfen.
                </p>

                <div class="adm-grid-3">
                    <div class="adm-field">
                        <label for="ldapHost">LDAP-Server (Host / IP oder URI)</label>
                        <input type="text" id="ldapHost" name="ldap_host" class="adm-input" placeholder="z. B. ldap://dc01.dienststelle.intern" value="<?php echo htmlspecialchars((string)$settings['ldap_host'], ENT_QUOTES, 'UTF-8'); ?>">
                        <small>Hostname, IP oder <code>ldap://...</code> bzw. <code>ldaps://...</code></small>
                    </div>
                    <div class="adm-field">
                        <label for="ldapPort">Port</label>
                        <input type="number" id="ldapPort" name="ldap_port" class="adm-input" value="<?php echo (int)$settings['ldap_port']; ?>">
                        <small>Standard: <code>389</code> (LDAP / StartTLS) oder <code>636</code> (LDAPS/SSL)</small>
                    </div>
                    <div class="adm-field">
                        <label for="ldapBindMode">Anmeldeverfahren (Bind-Modus)</label>
                        <select id="ldapBindMode" name="ldap_bind_mode" class="adm-select">
                            <option value="direct_upn" <?php echo ($settings['ldap_bind_mode'] === 'direct_upn') ? 'selected' : ''; ?>>Variante A: Direct Bind (AD UPN / Domäne)</option>
                            <option value="search_bind" <?php echo ($settings['ldap_bind_mode'] === 'search_bind') ? 'selected' : ''; ?>>Variante B: Search &amp; Bind (Base-DN + Lese-User)</option>
                            <option value="direct_dn" <?php echo ($settings['ldap_bind_mode'] === 'direct_dn') ? 'selected' : ''; ?>>Variante C: Direct Bind mit DN-Muster</option>
                        </select>
                        <small>Variante A benötigt keinen technischen Lese-User.</small>
                    </div>
                </div>

                <div class="adm-grid-3" style="margin-top:4px;">
                    <div class="adm-field">
                        <label for="ldapUpnSuffix">UPN-Suffix (für Variante A)</label>
                        <input type="text" id="ldapUpnSuffix" name="ldap_upn_suffix" class="adm-input" placeholder="z. B. @polizei.bwl.de" value="<?php echo htmlspecialchars((string)$settings['ldap_upn_suffix'], ENT_QUOTES, 'UTF-8'); ?>">
                        <small>Ergänzt <code>benutzer</code> automatisch zu <code>benutzer@domain</code></small>
                    </div>
                    <div class="adm-field">
                        <label for="ldapNetbios">Alternativ: NetBIOS-Domäne (Variante A)</label>
                        <input type="text" id="ldapNetbios" name="ldap_netbios_domain" class="adm-input" placeholder="z. B. LANDESAMT" value="<?php echo htmlspecialchars((string)$settings['ldap_netbios_domain'], ENT_QUOTES, 'UTF-8'); ?>">
                        <small>Meldet als <code>DOMAENE\benutzer</code> an, falls UPN leer ist</small>
                    </div>
                    <div class="adm-field">
                        <label for="ldapDnTpl">DN-Schablone (nur für Variante C)</label>
                        <input type="text" id="ldapDnTpl" name="ldap_dn_template" class="adm-input" value="<?php echo htmlspecialchars((string)$settings['ldap_dn_template'], ENT_QUOTES, 'UTF-8'); ?>">
                        <small>Platzhalter <code>{username}</code> wird ersetzt</small>
                    </div>
                </div>

                <div class="adm-grid-3" style="margin-top:4px;">
                    <div class="adm-field">
                        <label for="ldapBaseDn">Base-DN / Suchbasis (für Variante B &amp; Gruppen)</label>
                        <input type="text" id="ldapBaseDn" name="ldap_base_dn" class="adm-input" placeholder="z. B. OU=Mitarbeiter,DC=dienststelle,DC=intern" value="<?php echo htmlspecialchars((string)$settings['ldap_base_dn'], ENT_QUOTES, 'UTF-8'); ?>">
                    </div>
                    <div class="adm-field">
                        <label for="ldapBindDn">Technischer Lese-User / Bind-DN (Variante B)</label>
                        <input type="text" id="ldapBindDn" name="ldap_bind_dn" class="adm-input" placeholder="z. B. CN=svc_ldap,OU=Service,DC=... (leer = anonym)" value="<?php echo htmlspecialchars((string)$settings['ldap_bind_dn'], ENT_QUOTES, 'UTF-8'); ?>">
                    </div>
                    <div class="adm-field">
                        <label for="ldapBindPw">Passwort des Lese-Users (Variante B)</label>
                        <input type="password" id="ldapBindPw" name="ldap_bind_password" class="adm-input" placeholder="<?php echo !empty($settings['ldap_bind_password']) ? '•••••••• (gespeichert — leer lassen zum Behalten)' : 'Passwort eingeben'; ?>" autocomplete="new-password">
                    </div>
                </div>

                <div class="adm-grid-3" style="margin-top:4px;">
                    <div class="adm-field">
                        <label for="ldapFilter">Suchfilter (Variante B)</label>
                        <input type="text" id="ldapFilter" name="ldap_search_filter" class="adm-input" value="<?php echo htmlspecialchars((string)$settings['ldap_search_filter'], ENT_QUOTES, 'UTF-8'); ?>">
                        <small>AD: <code>(&amp;(objectClass=user)(sAMAccountName={username}))</code></small>
                    </div>
                    <div class="adm-field">
                        <label for="ldapReqGroup">Optionale Pflichtgruppe (memberOf-DN)</label>
                        <input type="text" id="ldapReqGroup" name="ldap_required_group" class="adm-input" placeholder="z. B. CN=G_PDF_Werkstatt,OU=Gruppen,DC=..." value="<?php echo htmlspecialchars((string)$settings['ldap_required_group'], ENT_QUOTES, 'UTF-8'); ?>">
                        <small>Leer lassen, wenn alle gültigen LDAP-Nutzer zugreifen dürfen</small>
                    </div>
                    <div class="adm-field">
                        <label>TLS / Zertifikatsoptionen</label>
                        <div style="display:flex;flex-direction:column;gap:6px;padding-top:4px;font-size:12.5px;">
                            <label style="display:flex;align-items:center;gap:7px;font-weight:400;margin:0;">
                                <input type="checkbox" name="ldap_use_starttls" value="1" <?php echo !empty($settings['ldap_use_starttls']) ? 'checked' : ''; ?>>
                                StartTLS auf Port 389 erzwingen
                            </label>
                            <label style="display:flex;align-items:center;gap:7px;font-weight:400;margin:0;">
                                <input type="checkbox" name="ldap_ignore_cert" value="1" <?php echo !empty($settings['ldap_ignore_cert']) ? 'checked' : ''; ?>>
                                Selbstsignierte Haus-Zertifikate erlauben
                            </label>
                        </div>
                    </div>
                </div>

                <!-- LIVE LDAP TEST BOX -->
                <div style="margin-top:14px;padding:14px 16px;background:#121721;border:1px solid #283449;border-radius:8px;">
                    <div style="font-size:13px;font-weight:700;margin-bottom:8px;color:#93c5fd;">
                        🔌 Live-Test: LDAP-Verbindung &amp; Test-Anmeldung prüfen
                    </div>
                    <div class="adm-grid-3" style="align-items:end;">
                        <div class="adm-field" style="margin-bottom:0;">
                            <label for="ldapTestUser">Test-Benutzername (optional)</label>
                            <input type="text" id="ldapTestUser" name="ldap_test_username" class="adm-input" placeholder="z. B. max.mustermann" value="<?php echo isset($_POST['ldap_test_username']) ? htmlspecialchars((string)$_POST['ldap_test_username'], ENT_QUOTES, 'UTF-8') : ''; ?>">
                        </div>
                        <div class="adm-field" style="margin-bottom:0;">
                            <label for="ldapTestPass">Test-Passwort (optional)</label>
                            <input type="password" id="ldapTestPass" name="ldap_test_password" class="adm-input" placeholder="Passwort zum Live-Testen">
                        </div>
                        <div style="display:flex;gap:8px;flex-wrap:wrap;">
                            <button type="submit" name="action" value="test_ldap_live" class="adm-btn">
                                🔌 LDAP jetzt testen
                            </button>
                            <button type="submit" name="action" value="save_gatekeeper_and_ldap" class="adm-btn adm-btn-primary">
                                💾 Einstellungen speichern
                            </button>
                        </div>
                    </div>

                    <?php if (is_array($ldapTestResult) && !empty($ldapTestResult['steps'])): ?>
                        <div style="margin-top:14px;padding-top:12px;border-top:1px solid #263042;">
                            <div style="font-size:12px;font-weight:700;margin-bottom:8px;">Diagnose-Protokoll:</div>
                            <?php foreach ($ldapTestResult['steps'] as $st): ?>
                                <div style="display:flex;align-items:flex-start;gap:8px;font-size:12px;margin-bottom:5px;">
                                    <span><?php echo ($st['status'] === 'ok') ? '✅' : '❌'; ?></span>
                                    <div>
                                        <strong><?php echo htmlspecialchars($st['title'], ENT_QUOTES, 'UTF-8'); ?>:</strong>
                                        <span style="color:#cbd5e1;"><?php echo htmlspecialchars($st['detail'], ENT_QUOTES, 'UTF-8'); ?></span>
                                    </div>
                                </div>
                            <?php endforeach; ?>
                        </div>
                    <?php endif; ?>
                </div>
            </div>
        </form>

        <!-- 3. LOCAL USER MANAGEMENT (NO DATABASE, BCRYPT HASHED) -->
        <div class="adm-card">
            <h2>👥 3. Lokale Benutzerverwaltung (Ohne Datenbank • Bcrypt-Passwort-Hash)</h2>
            <p class="adm-desc">
                Hier angelegte Benutzer werden ohne Datenbank in der geschützten Datei <code>storage/gatekeeper_users.json</code> gespeichert. Passwörter werden niemals im Klartext abgelegt, sondern sofort mit <code>password_hash()</code> (Bcrypt + zufälligem Salt) verschlüsselt.
            </p>

            <form method="post" action="admin.php" style="padding:14px 16px;background:#121721;border:1px solid #283449;border-radius:8px;margin-bottom:16px;">
                <input type="hidden" name="csrf_token" value="<?php echo htmlspecialchars($csrfToken, ENT_QUOTES, 'UTF-8'); ?>">
                <input type="hidden" name="action" value="upsert_local_user">
                <div style="font-size:13px;font-weight:700;margin-bottom:10px;color:#93c5fd;">
                    ➕ Neuen lokalen Benutzer anlegen oder Passwort aktualisieren
                </div>
                <div class="adm-grid-3" style="align-items:end;">
                    <div class="adm-field" style="margin-bottom:0;">
                        <label for="locUser">Benutzername (Login-Kennung)</label>
                        <input type="text" id="locUser" name="local_username" class="adm-input" placeholder="z. B. m.mustermann" required>
                    </div>
                    <div class="adm-field" style="margin-bottom:0;">
                        <label for="locDisp">Anzeigename / Abteilung (optional)</label>
                        <input type="text" id="locDisp" name="local_display_name" class="adm-input" placeholder="z. B. Max Mustermann (FG 221)">
                    </div>
                    <div class="adm-field" style="margin-bottom:0;">
                        <label for="locPass">Passwort (mind. 6 Zeichen)</label>
                        <div style="display:flex;gap:8px;">
                            <input type="password" id="locPass" name="local_password" class="adm-input" placeholder="Passwort (wird gehasht)" required>
                            <button type="submit" class="adm-btn adm-btn-primary" style="white-space:nowrap;">💾 Speichern</button>
                        </div>
                    </div>
                </div>
            </form>

            <?php if (empty($localUsers)): ?>
                <div style="font-size:12.5px;color:#94a3b8;padding:10px 0;">
                    Noch keine lokalen Benutzer angelegt.
                </div>
            <?php else: ?>
                <table class="adm-table">
                    <thead>
                        <tr>
                            <th>Benutzername</th>
                            <th>Anzeigename</th>
                            <th>Status</th>
                            <th>Passwort-Speicherung</th>
                            <th>Erstellt am</th>
                            <th>Letzter Login</th>
                            <th style="text-align:right;">Aktionen</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php foreach ($localUsers as $lu): ?>
                            <tr>
                                <td><strong><?php echo htmlspecialchars($lu['username'], ENT_QUOTES, 'UTF-8'); ?></strong></td>
                                <td><?php echo htmlspecialchars(isset($lu['display_name']) ? $lu['display_name'] : $lu['username'], ENT_QUOTES, 'UTF-8'); ?></td>
                                <td>
                                    <?php if (!empty($lu['active'])): ?>
                                        <span class="adm-pill adm-pill-ok">Aktiv</span>
                                    <?php else: ?>
                                        <span class="adm-pill adm-pill-off">Gesperrt</span>
                                    <?php endif; ?>
                                </td>
                                <td><code style="font-size:11px;color:#94a3b8;"><?php echo htmlspecialchars(substr((string)$lu['password_hash'], 0, 16) . '…', ENT_QUOTES, 'UTF-8'); ?></code></td>
                                <td><?php echo htmlspecialchars(isset($lu['created_at']) ? $lu['created_at'] : '—', ENT_QUOTES, 'UTF-8'); ?></td>
                                <td><?php echo htmlspecialchars(isset($lu['last_login']) ? $lu['last_login'] : '—', ENT_QUOTES, 'UTF-8'); ?> (<?php echo isset($lu['login_count']) ? (int)$lu['login_count'] : 0; ?>×)</td>
                                <td style="text-align:right;white-space:nowrap;">
                                    <form method="post" action="admin.php" style="display:inline;">
                                        <input type="hidden" name="csrf_token" value="<?php echo htmlspecialchars($csrfToken, ENT_QUOTES, 'UTF-8'); ?>">
                                        <input type="hidden" name="action" value="toggle_local_user">
                                        <input type="hidden" name="target_username" value="<?php echo htmlspecialchars($lu['username'], ENT_QUOTES, 'UTF-8'); ?>">
                                        <button type="submit" class="adm-btn" style="height:28px;padding:0 10px;font-size:11.5px;">
                                            <?php echo !empty($lu['active']) ? '⏸ Sperren' : '▶ Aktivieren'; ?>
                                        </button>
                                    </form>
                                    <form method="post" action="admin.php" style="display:inline;margin-left:4px;" onsubmit="return confirm('Benutzer wirklich löschen?');">
                                        <input type="hidden" name="csrf_token" value="<?php echo htmlspecialchars($csrfToken, ENT_QUOTES, 'UTF-8'); ?>">
                                        <input type="hidden" name="action" value="delete_local_user">
                                        <input type="hidden" name="target_username" value="<?php echo htmlspecialchars($lu['username'], ENT_QUOTES, 'UTF-8'); ?>">
                                        <button type="submit" class="adm-btn adm-btn-danger" style="height:28px;padding:0 10px;font-size:11.5px;">
                                            🗑 Löschen
                                        </button>
                                    </form>
                                </td>
                            </tr>
                        <?php endforeach; ?>
                    </tbody>
                </table>
            <?php endif; ?>
        </div>

        <!-- 4. GENERAL SYSTEM SETTINGS (FORMERLY CONFIG.PHP) & ADMIN PASSWORD -->
        <div class="adm-grid-2">
            <div class="adm-card">
                <h2>⚙️ 4. Sicherheit &amp; E-Mail / SMTP (vormals config.php)</h2>
                <p class="adm-desc">
                    Brute-Force-Schutz für Anmeldungen sowie optionale SMTP-Server-Parameter.
                </p>
                <form method="post" action="admin.php">
                    <input type="hidden" name="csrf_token" value="<?php echo htmlspecialchars($csrfToken, ENT_QUOTES, 'UTF-8'); ?>">
                    <input type="hidden" name="action" value="save_system_settings">
                    <div class="adm-grid-2">
                        <div class="adm-field">
                            <label for="maxLoginAtt">Max. Fehlversuche pro IP</label>
                            <input type="number" id="maxLoginAtt" name="max_login_attempts" class="adm-input" value="<?php echo (int)$settings['max_login_attempts']; ?>">
                        </div>
                        <div class="adm-field">
                            <label for="lockoutSec">Sperrzeit bei Fehlversuchen (Sek.)</label>
                            <input type="number" id="lockoutSec" name="login_lockout_seconds" class="adm-input" value="<?php echo (int)$settings['login_lockout_seconds']; ?>">
                        </div>
                    </div>
                    <div class="adm-grid-2">
                        <div class="adm-field">
                            <label for="smtpHost">SMTP-Server (optional)</label>
                            <input type="text" id="smtpHost" name="smtp_host" class="adm-input" value="<?php echo htmlspecialchars((string)$settings['smtp_host'], ENT_QUOTES, 'UTF-8'); ?>">
                        </div>
                        <div class="adm-field">
                            <label for="smtpPort">SMTP-Port</label>
                            <input type="number" id="smtpPort" name="smtp_port" class="adm-input" value="<?php echo (int)$settings['smtp_port']; ?>">
                        </div>
                    </div>
                    <div class="adm-grid-2">
                        <div class="adm-field">
                            <label for="mailFromAddr">Absender-E-Mail</label>
                            <input type="text" id="mailFromAddr" name="mail_from_address" class="adm-input" value="<?php echo htmlspecialchars((string)$settings['mail_from_address'], ENT_QUOTES, 'UTF-8'); ?>">
                        </div>
                        <div class="adm-field">
                            <label for="mailFromName">Absender-Name</label>
                            <input type="text" id="mailFromName" name="mail_from_name" class="adm-input" value="<?php echo htmlspecialchars((string)$settings['mail_from_name'], ENT_QUOTES, 'UTF-8'); ?>">
                        </div>
                    </div>
                    <button type="submit" class="adm-btn adm-btn-primary" style="margin-top:6px;">
                        💾 Systemeinstellungen speichern
                    </button>
                </form>
            </div>

            <div class="adm-card">
                <h2>🔑 5. Administrator-Passwort ändern</h2>
                <p class="adm-desc">
                    Ändert das Passwort für diesen Administrationsbereich (`admin.php`).
                </p>
                <form method="post" action="admin.php">
                    <input type="hidden" name="csrf_token" value="<?php echo htmlspecialchars($csrfToken, ENT_QUOTES, 'UTF-8'); ?>">
                    <input type="hidden" name="action" value="change_admin_password">
                    <div class="adm-field">
                        <label for="curAdmPw">Aktuelles Admin-Passwort</label>
                        <input type="password" id="curAdmPw" name="current_admin_password" class="adm-input" required>
                    </div>
                    <div class="adm-field">
                        <label for="newAdmPw1">Neues Admin-Passwort (mind. 8 Zeichen)</label>
                        <input type="password" id="newAdmPw1" name="new_admin_password" class="adm-input" minlength="8" required>
                    </div>
                    <div class="adm-field">
                        <label for="newAdmPw2">Neues Admin-Passwort wiederholen</label>
                        <input type="password" id="newAdmPw2" name="confirm_admin_password" class="adm-input" minlength="8" required>
                    </div>
                    <button type="submit" class="adm-btn adm-btn-primary" style="margin-top:6px;">
                        🔑 Admin-Passwort aktualisieren
                    </button>
                </form>
            </div>
        </div>

    <?php endif; ?>

</div>

</body>
</html>
