<?php
/**
 * PDF-Werkstatt Pro (v1.0) - Backend API Endpoint
 * Strictly compatible with PHP 5.4+ up to PHP 8.4+
 * Runs on pure webspace without shell_exec / exec
 */

require_once __DIR__ . '/includes/bootstrap.php';
pdfstudio_enforce_app_gatekeeper(true);

$action = isset($_REQUEST['action']) ? (string)$_REQUEST['action'] : 'status';

/**
 * Send JSON response and terminate
 */
function pdfstudio_json_response($data, $statusCode = 200)
{
    if (!headers_sent()) {
        if (function_exists('http_response_code')) {
            http_response_code($statusCode);
        } else {
            header('HTTP/1.1 ' . (int)$statusCode . ' OK');
        }
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store, no-cache, must-revalidate');
    }
    echo json_encode($data);
    exit;
}

/**
 * Enforce CSRF token verification on state-changing POST requests
 */
function pdfstudio_require_csrf()
{
    if (!pdfstudio_verify_csrf_token()) {
        pdfstudio_json_response(array(
            'ok' => false,
            'error' => 'Sicherheitspruefung (CSRF-Token) fehlgeschlagen. Bitte laden Sie die Seite neu (F5).'
        ), 403);
    }
}

/**
 * Require an authenticated user account for Vault (Tresor) and Share operations
 */
function pdfstudio_require_login()
{
    $user = pdfstudio_get_current_user();
    if (!$user || !isset($user['id'])) {
        @session_write_close();
        pdfstudio_json_response(array(
            'ok' => false,
            'auth_required' => true,
            'error' => 'Das Speichern und Verwalten von Dokumenten im Tresor ist Kontoinhabern vorbehalten. Bitte melden Sie sich an.'
        ), 401);
    }
    return $user;
}

/**
 * Mask an email address for privacy in public responses (e.g. "m***@firma.de")
 */
function pdfstudio_mask_email($email)
{
    $email = trim((string)$email);
    $atPos = strpos($email, '@');
    if ($atPos === false || $atPos < 1) {
        return '***';
    }
    $local = substr($email, 0, $atPos);
    $domain = substr($email, $atPos);
    $firstChar = substr($local, 0, 1);
    return $firstChar . '***' . $domain;
}

/**
 * List files stored in active workspace (User Vault if logged in, otherwise Public storage/)
 * Optimized O(N + M) single-pass directory & version scan
 */
function pdfstudio_list_workspace_files()
{
    $files = array();
    $workspaceDir = pdfstudio_get_workspace_dir();
    if (!$workspaceDir || !is_dir($workspaceDir)) {
        return $files;
    }

    // Pre-count versions in a single pass O(M) instead of rescanning versions/ per file
    $versionCounts = array();
    $verDir = $workspaceDir . DIRECTORY_SEPARATOR . 'versions';
    if (is_dir($verDir)) {
        $vh = @opendir($verDir);
        if ($vh) {
            while (($vEntry = readdir($vh)) !== false) {
                if (substr($vEntry, -4) === '.pdf') {
                    $sepPos = strpos($vEntry, '__v');
                    if ($sepPos !== false) {
                        $basePdf = substr($vEntry, 0, $sepPos);
                        if (!isset($versionCounts[$basePdf])) {
                            $versionCounts[$basePdf] = 0;
                        }
                        $versionCounts[$basePdf]++;
                    }
                }
            }
            closedir($vh);
        }
    }

    $handle = @opendir($workspaceDir);
    if (!$handle) {
        return $files;
    }

    while (($entry = readdir($handle)) !== false) {
        if ($entry === '.' || $entry === '..' || $entry === '.htaccess' || $entry === 'index.html') {
            continue;
        }
        if (strtolower(substr($entry, -4)) !== '.pdf') {
            continue;
        }
        $fullPath = $workspaceDir . DIRECTORY_SEPARATOR . $entry;
        if (is_file($fullPath)) {
            $size = @filesize($fullPath);
            $mtime = @filemtime($fullPath);
            $headerSample = @file_get_contents($fullPath, false, null, 0, 1024);
            $pdfVer = '1.4';
            if ($headerSample !== false && preg_match('/^%PDF-(\d+\.\d+)/', substr($headerSample, 0, 32), $m)) {
                $pdfVer = $m[1];
            }
            $projFile = $fullPath . '.proj.json';
            $hasProject = is_file($projFile);
            $verCount = isset($versionCounts[$entry]) ? $versionCounts[$entry] : 0;

            $files[] = array(
                'name' => $entry,
                'size' => (int)$size,
                'size_formatted' => pdfstudio_format_bytes($size),
                'modified' => $mtime ? date('d.m.Y H:i:s', $mtime) : '',
                'timestamp' => (int)$mtime,
                'pdf_version' => $pdfVer,
                'has_project' => $hasProject,
                'version_count' => $verCount
            );
        }
    }
    closedir($handle);

    // Sort newest first (PHP 5.4 compatible usort)
    usort($files, 'pdfstudio_sort_files_by_time');
    return $files;
}

if (!function_exists('pdfstudio_sort_files_by_time')) {
    function pdfstudio_sort_files_by_time($a, $b)
    {
        if ($a['timestamp'] === $b['timestamp']) {
            return 0;
        }
        return ($a['timestamp'] > $b['timestamp']) ? -1 : 1;
    }
}

/**
 * Helper to update the currently logged-in user record inside users.json
 */
function pdfstudio_update_current_user_record($callback)
{
    if (!isset($_SESSION['pdfstudio_user_id']) || empty($_SESSION['pdfstudio_user_id'])) {
        return null;
    }
    $uid = (string)$_SESSION['pdfstudio_user_id'];
    $db = pdfstudio_load_users_db();
    $updatedUser = null;

    foreach ($db['users'] as $idx => $u) {
        if (isset($u['id']) && $u['id'] === $uid) {
            $u = call_user_func($callback, $u);
            $db['users'][$idx] = $u;
            $updatedUser = $u;
            break;
        }
    }

    if ($updatedUser !== null) {
        pdfstudio_save_users_db($db);
        return pdfstudio_sanitize_user_for_client($updatedUser);
    }
    return null;
}

/**
 * Build base application URL for share links
 */
function pdfstudio_get_base_app_url()
{
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (isset($_SERVER['SERVER_PORT']) && (int)$_SERVER['SERVER_PORT'] === 443);
    $scheme = $https ? 'https' : 'http';
    $host = isset($_SERVER['HTTP_HOST']) ? preg_replace('/[^a-zA-Z0-9\.\-\:\[\]]/', '', $_SERVER['HTTP_HOST']) : 'localhost';
    $scriptDir = isset($_SERVER['SCRIPT_NAME']) ? dirname($_SERVER['SCRIPT_NAME']) : '';
    $scriptDir = rtrim(str_replace('\\', '/', $scriptDir), '/');
    return $scheme . '://' . $host . $scriptDir . '/index.php';
}

switch ($action) {
    case 'status':
        $csrf = pdfstudio_get_csrf_token();
        $user = pdfstudio_get_current_user();
        @session_write_close();
        pdfstudio_json_response(array(
            'ok' => true,
            'csrf_token' => $csrf,
            'server' => pdfstudio_get_server_info(),
            'user' => $user,
            'quota' => pdfstudio_get_workspace_quota_info(),
            'files' => pdfstudio_list_workspace_files()
        ));
        break;

    // =========================================================================
    // USER ACCOUNT AUTHENTICATION & PROFILE ENDPOINTS
    // =========================================================================
    case 'register':
        pdfstudio_require_csrf();
        $rl = pdfstudio_check_rate_limit('register');
        if (!$rl['allowed']) {
            pdfstudio_json_response(array(
                'ok' => false,
                'error' => 'Zu viele Anfragen. Bitte warten Sie ' . $rl['retry_after'] . ' Sekunden.'
            ), 429);
        }

        $username = isset($_POST['username']) ? trim((string)$_POST['username']) : '';
        $email = isset($_POST['email']) ? trim((string)$_POST['email']) : '';
        $displayName = isset($_POST['display_name']) ? trim((string)$_POST['display_name']) : '';
        $organization = isset($_POST['organization']) ? trim((string)$_POST['organization']) : '';
        $password = isset($_POST['password']) ? (string)$_POST['password'] : '';

        $cleanUsername = preg_replace('/[^a-zA-Z0-9_\-\.]/', '', $username);
        if (strlen($cleanUsername) < 3 || strlen($cleanUsername) > 64) {
            pdfstudio_json_response(array(
                'ok' => false,
                'error' => 'Der Benutzername muss zwischen 3 und 64 Zeichen lang sein (Buchstaben/Zahlen).'
            ), 400);
        }
        if ($email === '' || strpos($email, '@') === false || strlen($email) > 128) {
            pdfstudio_json_response(array(
                'ok' => false,
                'error' => 'Bitte geben Sie eine gueltige E-Mail-Adresse ein.'
            ), 400);
        }
        if (strlen($password) < 8) {
            pdfstudio_json_response(array(
                'ok' => false,
                'error' => 'Das Passwort muss mindestens 8 Zeichen lang sein.'
            ), 400);
        }
        if ($displayName === '') {
            $displayName = $cleanUsername;
        }

        $db = pdfstudio_load_users_db();
        foreach ($db['users'] as $existing) {
            if (strtolower($existing['username']) === strtolower($cleanUsername)) {
                pdfstudio_record_rate_limit_failure('register');
                pdfstudio_json_response(array(
                    'ok' => false,
                    'error' => 'Dieser Benutzername ist bereits vergeben.'
                ), 409);
            }
            if (isset($existing['email']) && strtolower($existing['email']) === strtolower($email)) {
                pdfstudio_record_rate_limit_failure('register');
                pdfstudio_json_response(array(
                    'ok' => false,
                    'error' => 'Es existiert bereits ein Konto mit dieser E-Mail-Adresse.'
                ), 409);
            }
        }

        $uid = 'usr_' . date('YmdHis') . '_' . pdfstudio_generate_token(8);
        $profile = pdfstudio_default_user_profile($displayName, $email);
        $profile['organization'] = $organization;

        $newUser = array(
            'id' => $uid,
            'username' => $cleanUsername,
            'email' => $email,
            'display_name' => $displayName,
            'password_hash' => pdfstudio_hash_password($password),
            'created_at' => date('d.m.Y H:i'),
            'last_login' => date('d.m.Y H:i'),
            'login_count' => 1,
            'profile' => $profile,
            'signatures' => array(),
            'stamps' => array(
                array(
                    'id' => 'st_' . pdfstudio_generate_token(6),
                    'text' => 'GEPRÜFT — ' . strtoupper($displayName),
                    'color' => '#16a34a'
                ),
                array(
                    'id' => 'st_' . pdfstudio_generate_token(6),
                    'text' => 'FREIGEGEBEN AM ' . date('d.m.Y'),
                    'color' => '#2563eb'
                )
            )
        );

        $db['users'][] = $newUser;
        pdfstudio_save_users_db($db);
        pdfstudio_record_stat('register');

        @session_regenerate_id(true);
        $_SESSION['pdfstudio_user_id'] = $uid;
        $csrf = pdfstudio_get_csrf_token();
        // Initialize user directory
        pdfstudio_get_workspace_dir();
        @session_write_close();

        pdfstudio_json_response(array(
            'ok' => true,
            'csrf_token' => $csrf,
            'user' => pdfstudio_sanitize_user_for_client($newUser),
            'quota' => pdfstudio_get_workspace_quota_info(),
            'files' => pdfstudio_list_workspace_files()
        ));
        break;

    case 'login':
        pdfstudio_require_csrf();
        $rl = pdfstudio_check_rate_limit('login');
        if (!$rl['allowed']) {
            pdfstudio_json_response(array(
                'ok' => false,
                'error' => 'Zu viele fehlgeschlagene Anmeldeversuche. Bitte warten Sie ' . $rl['retry_after'] . ' Sekunden.'
            ), 429);
        }

        $loginId = isset($_POST['login_id']) ? trim((string)$_POST['login_id']) : '';
        $password = isset($_POST['password']) ? (string)$_POST['password'] : '';

        if ($loginId === '' || $password === '') {
            pdfstudio_json_response(array(
                'ok' => false,
                'error' => 'Bitte geben Sie Benutzername/E-Mail und Passwort ein.'
            ), 400);
        }

        $db = pdfstudio_load_users_db();
        $foundUser = null;
        $foundIdx = -1;
        foreach ($db['users'] as $idx => $u) {
            $matchUser = strtolower($u['username']) === strtolower($loginId);
            $matchMail = isset($u['email']) && strtolower($u['email']) === strtolower($loginId);
            if ($matchUser || $matchMail) {
                if (pdfstudio_verify_password($password, $u['password_hash'])) {
                    $foundUser = $u;
                    $foundIdx = $idx;
                }
                break;
            }
        }

        if (!$foundUser) {
            pdfstudio_record_rate_limit_failure('login');
            pdfstudio_record_stat('login_failed');
            pdfstudio_json_response(array(
                'ok' => false,
                'error' => 'Ungueltige Zugangsdaten. Bitte pruefen Sie Benutzername/E-Mail und Passwort.'
            ), 401);
        }

        $db['users'][$foundIdx]['last_login'] = date('d.m.Y H:i');
        $db['users'][$foundIdx]['login_count'] = (isset($foundUser['login_count']) ? (int)$foundUser['login_count'] : 0) + 1;
        $foundUser = $db['users'][$foundIdx];
        pdfstudio_save_users_db($db);
        pdfstudio_record_stat('login_success');

        pdfstudio_clear_rate_limit('login');
        @session_regenerate_id(true);
        $_SESSION['pdfstudio_user_id'] = $foundUser['id'];
        $csrf = pdfstudio_get_csrf_token();
        pdfstudio_get_workspace_dir();
        @session_write_close();

        pdfstudio_json_response(array(
            'ok' => true,
            'csrf_token' => $csrf,
            'user' => pdfstudio_sanitize_user_for_client($foundUser),
            'quota' => pdfstudio_get_workspace_quota_info(),
            'files' => pdfstudio_list_workspace_files()
        ));
        break;

    case 'logout':
        pdfstudio_require_csrf();
        unset($_SESSION['pdfstudio_user_id']);
        @session_regenerate_id(true);
        $csrf = pdfstudio_get_csrf_token();
        @session_write_close();
        pdfstudio_json_response(array(
            'ok' => true,
            'csrf_token' => $csrf,
            'user' => null,
            'quota' => pdfstudio_get_workspace_quota_info(),
            'files' => pdfstudio_list_workspace_files()
        ));
        break;

    case 'request_password_reset':
        pdfstudio_require_csrf();
        $rl = pdfstudio_check_rate_limit('password_reset');
        if (!$rl['allowed']) {
            pdfstudio_json_response(array(
                'ok' => false,
                'error' => 'Zu viele Anfragen zum Zuruecksetzen des Passworts. Bitte warten Sie ' . $rl['retry_after'] . ' Sekunden.'
            ), 429);
        }

        $loginId = isset($_POST['login_id']) ? trim((string)$_POST['login_id']) : '';
        if ($loginId === '') {
            pdfstudio_json_response(array(
                'ok' => false,
                'error' => 'Bitte geben Sie Ihren Benutzernamen oder Ihre registrierte E-Mail-Adresse ein.'
            ), 400);
        }

        pdfstudio_record_rate_limit_failure('password_reset');

        $db = pdfstudio_load_users_db();
        $foundIdx = -1;
        foreach ($db['users'] as $idx => $u) {
            $matchUser = strtolower($u['username']) === strtolower($loginId);
            $matchMail = isset($u['email']) && strtolower($u['email']) === strtolower($loginId);
            if ($matchUser || $matchMail) {
                $foundIdx = $idx;
                break;
            }
        }

        if ($foundIdx === -1) {
            pdfstudio_json_response(array(
                'ok' => false,
                'error' => 'Es wurde kein Benutzerkonto mit diesem Benutzernamen oder dieser E-Mail-Adresse gefunden.'
            ), 404);
        }

        $targetUser = $db['users'][$foundIdx];
        $userEmail = isset($targetUser['email']) ? trim((string)$targetUser['email']) : '';
        if ($userEmail === '' || strpos($userEmail, '@') === false) {
            pdfstudio_json_response(array(
                'ok' => false,
                'error' => 'Fuer dieses Konto ist keine gueltige E-Mail-Adresse hinterlegt.'
            ), 400);
        }

        $resetToken = pdfstudio_generate_token(32);
        $expiresAt = time() + 3600; // 60 minutes validity
        $db['users'][$foundIdx]['reset_token'] = $resetToken;
        $db['users'][$foundIdx]['reset_expires_at'] = $expiresAt;
        pdfstudio_save_users_db($db);
        pdfstudio_record_stat('password_reset');

        $resetUrl = pdfstudio_get_base_app_url() . '?reset_token=' . urlencode($resetToken);
        $displayName = isset($targetUser['display_name']) ? $targetUser['display_name'] : $targetUser['username'];

        $subject = 'Passwort zuruecksetzen — PDF-Werkstatt Pro';
        $bodyLines = array(
            'Guten Tag ' . $displayName . ',',
            '',
            'Sie haben das Zuruecksetzen Ihres Passworts fuer Ihr Konto ("' . $targetUser['username'] . '") in PDF-Werkstatt Pro angefordert.',
            '',
            'Bitte klicken Sie innerhalb der naechsten 60 Minuten auf folgenden Link, um ein neues Passwort zu vergeben:',
            $resetUrl,
            '',
            'Falls Sie diese Anfrage nicht selbst gestellt haben, koennen Sie diese E-Mail ignorieren.',
            '',
            'Mit freundlichen Gruessen',
            (string)pdfstudio_config('mail_from_name', 'PDF-Werkstatt Pro')
        );

        $mailBody = implode("\r\n", $bodyLines);
        $mailRes = pdfstudio_send_email($userEmail, $subject, $mailBody);
        $mailSent = !empty($mailRes['sent']);

        // Security: Never expose reset_url in JSON response unless explicitly enabled for offline test environments in config.php
        $exposeFallback = (bool)pdfstudio_config('expose_reset_link_on_local_fallback', false) && !$mailSent;
        $maskedEmail = pdfstudio_mask_email($userEmail);

        $respPayload = array(
            'ok' => true,
            'mail_sent' => $mailSent,
            'mail_method' => isset($mailRes['method']) ? $mailRes['method'] : 'mail',
            'from_address' => isset($mailRes['from_address']) ? $mailRes['from_address'] : '',
            'email' => $maskedEmail,
            'expires_minutes' => 60
        );
        if ($exposeFallback) {
            $respPayload['reset_url'] = $resetUrl;
            $respPayload['mailto_url'] = 'mailto:' . rawurlencode($userEmail)
                                       . '?subject=' . rawurlencode($subject)
                                       . '&body=' . rawurlencode($mailBody);
        }

        pdfstudio_json_response($respPayload);
        break;

    case 'verify_reset_token':
        $rl = pdfstudio_check_rate_limit('verify_token');
        if (!$rl['allowed']) {
            pdfstudio_json_response(array('ok' => false, 'error' => 'Zu viele Anfragen. Bitte warten Sie ' . $rl['retry_after'] . ' Sekunden.'), 429);
        }
        $token = isset($_GET['token']) ? trim((string)$_GET['token']) : '';
        if ($token === '') {
            pdfstudio_json_response(array('ok' => false, 'error' => 'Kein Token angegeben.'), 400);
        }

        $db = pdfstudio_load_users_db();
        $foundUser = null;
        foreach ($db['users'] as $u) {
            if (!empty($u['reset_token']) && pdfstudio_safe_equals($u['reset_token'], $token)) {
                $foundUser = $u;
                break;
            }
        }

        if (!$foundUser) {
            pdfstudio_record_rate_limit_failure('verify_token');
            pdfstudio_json_response(array(
                'ok' => false,
                'error' => 'Dieser Link zum Zuruecksetzen des Passworts ist ungueltig oder wurde bereits verwendet.'
            ), 404);
        }

        if (!empty($foundUser['reset_expires_at']) && time() > (int)$foundUser['reset_expires_at']) {
            pdfstudio_json_response(array(
                'ok' => false,
                'error' => 'Dieser Link zum Zuruecksetzen des Passworts ist abgelaufen (Gueltigkeit: 60 Minuten). Bitte fordern Sie einen neuen Link an.'
            ), 410);
        }

        pdfstudio_json_response(array(
            'ok' => true,
            'username' => $foundUser['username'],
            'display_name' => isset($foundUser['display_name']) ? $foundUser['display_name'] : $foundUser['username'],
            'email' => pdfstudio_mask_email(isset($foundUser['email']) ? $foundUser['email'] : '')
        ));
        break;

    case 'confirm_password_reset':
        pdfstudio_require_csrf();
        $rl = pdfstudio_check_rate_limit('confirm_reset');
        if (!$rl['allowed']) {
            pdfstudio_json_response(array('ok' => false, 'error' => 'Zu viele Versuche. Bitte warten Sie ' . $rl['retry_after'] . ' Sekunden.'), 429);
        }
        $token = isset($_POST['token']) ? trim((string)$_POST['token']) : '';
        $newPassword = isset($_POST['new_password']) ? (string)$_POST['new_password'] : '';

        if ($token === '') {
            pdfstudio_json_response(array('ok' => false, 'error' => 'Ungueltiger Zuruecksetzungs-Token.'), 400);
        }
        if (strlen($newPassword) < 8) {
            pdfstudio_json_response(array(
                'ok' => false,
                'error' => 'Das neue Passwort muss mindestens 8 Zeichen lang sein.'
            ), 400);
        }

        $db = pdfstudio_load_users_db();
        $foundIdx = -1;
        foreach ($db['users'] as $idx => $u) {
            if (!empty($u['reset_token']) && pdfstudio_safe_equals($u['reset_token'], $token)) {
                $foundIdx = $idx;
                break;
            }
        }

        if ($foundIdx === -1) {
            pdfstudio_record_rate_limit_failure('confirm_reset');
            pdfstudio_json_response(array(
                'ok' => false,
                'error' => 'Dieser Link zum Zuruecksetzen des Passworts ist ungueltig oder wurde bereits verwendet.'
            ), 404);
        }

        if (!empty($db['users'][$foundIdx]['reset_expires_at']) && time() > (int)$db['users'][$foundIdx]['reset_expires_at']) {
            pdfstudio_json_response(array(
                'ok' => false,
                'error' => 'Dieser Link zum Zuruecksetzen des Passworts ist abgelaufen. Bitte fordern Sie einen neuen Link an.'
            ), 410);
        }

        $db['users'][$foundIdx]['password_hash'] = pdfstudio_hash_password($newPassword);
        unset($db['users'][$foundIdx]['reset_token']);
        unset($db['users'][$foundIdx]['reset_expires_at']);
        pdfstudio_save_users_db($db);

        pdfstudio_clear_rate_limit('confirm_reset');
        pdfstudio_clear_rate_limit('login');
        $updatedUser = $db['users'][$foundIdx];
        @session_regenerate_id(true);
        $_SESSION['pdfstudio_user_id'] = $updatedUser['id'];
        $csrf = pdfstudio_get_csrf_token();
        pdfstudio_get_workspace_dir();
        @session_write_close();

        pdfstudio_json_response(array(
            'ok' => true,
            'csrf_token' => $csrf,
            'user' => pdfstudio_sanitize_user_for_client($updatedUser),
            'quota' => pdfstudio_get_workspace_quota_info(),
            'files' => pdfstudio_list_workspace_files()
        ));
        break;

    case 'save_profile':
        pdfstudio_require_csrf();
        $user = pdfstudio_get_current_user();
        if (!$user) {
            pdfstudio_json_response(array('ok' => false, 'error' => 'Nicht angemeldet.'), 401);
        }

        $updated = pdfstudio_update_current_user_record(function ($u) {
            if (isset($_POST['display_name']) && trim($_POST['display_name']) !== '') {
                $u['display_name'] = substr(trim((string)$_POST['display_name']), 0, 120);
            }
            if (isset($_POST['email']) && strpos($_POST['email'], '@') !== false) {
                $u['email'] = substr(trim((string)$_POST['email']), 0, 128);
            }
            if (!isset($u['profile']) || !is_array($u['profile'])) {
                $u['profile'] = pdfstudio_default_user_profile($u['display_name'], $u['email']);
            }
            $fields = array(
                'default_author', 'organization', 'default_lang', 'default_watermark',
                'bates_prefix', 'header_left', 'header_center', 'header_right',
                'footer_left', 'footer_center', 'footer_right'
            );
            foreach ($fields as $f) {
                if (isset($_POST[$f])) {
                    $u['profile'][$f] = substr(trim((string)$_POST[$f]), 0, 180);
                }
            }
            if (isset($_POST['bates_counter'])) {
                $u['profile']['bates_counter'] = max(1, (int)$_POST['bates_counter']);
            }
            if (isset($_POST['bates_digits'])) {
                $u['profile']['bates_digits'] = max(3, min(10, (int)$_POST['bates_digits']));
            }
            return $u;
        });
        @session_write_close();

        pdfstudio_json_response(array(
            'ok' => true,
            'user' => $updated
        ));
        break;

    case 'change_password':
        pdfstudio_require_csrf();
        pdfstudio_check_rate_limit('change_password');
        $user = pdfstudio_require_login();
        $currentPassword = isset($_POST['current_password']) ? (string)$_POST['current_password'] : '';
        $newPassword = isset($_POST['new_password']) ? (string)$_POST['new_password'] : '';
        $newPasswordConfirm = isset($_POST['new_password_confirm']) ? (string)$_POST['new_password_confirm'] : $newPassword;

        if ($currentPassword === '') {
            pdfstudio_json_response(array(
                'ok' => false,
                'error' => 'Bitte geben Sie Ihr aktuelles Passwort zur Sicherheit ein.'
            ), 400);
        }
        if (strlen($newPassword) < 8) {
            pdfstudio_json_response(array(
                'ok' => false,
                'error' => 'Das neue Passwort muss mindestens 8 Zeichen lang sein.'
            ), 400);
        }
        if ($newPassword !== $newPasswordConfirm) {
            pdfstudio_json_response(array(
                'ok' => false,
                'error' => 'Die beiden eingegebenen neuen Passwoerter stimmen nicht ueberein.'
            ), 400);
        }

        $db = pdfstudio_load_users_db();
        $foundIdx = -1;
        foreach ($db['users'] as $idx => $u) {
            if (isset($u['id']) && $u['id'] === $user['id']) {
                $foundIdx = $idx;
                break;
            }
        }

        if ($foundIdx === -1 || !pdfstudio_verify_password($currentPassword, $db['users'][$foundIdx]['password_hash'])) {
            pdfstudio_record_rate_limit_failure('change_password');
            pdfstudio_json_response(array(
                'ok' => false,
                'error' => 'Das eingegebene aktuelle Passwort ist nicht korrekt.'
            ), 401);
        }

        pdfstudio_clear_rate_limit('change_password');
        $db['users'][$foundIdx]['password_hash'] = pdfstudio_hash_password($newPassword);
        pdfstudio_save_users_db($db);
        @session_regenerate_id(true);
        $csrf = pdfstudio_get_csrf_token();
        @session_write_close();

        pdfstudio_json_response(array(
            'ok' => true,
            'csrf_token' => $csrf,
            'user' => pdfstudio_sanitize_user_for_client($db['users'][$foundIdx])
        ));
        break;

    case 'delete_account':
        pdfstudio_require_csrf();
        pdfstudio_check_rate_limit('delete_account');
        $user = pdfstudio_require_login();
        $currentPassword = isset($_POST['current_password']) ? (string)$_POST['current_password'] : '';

        if ($currentPassword === '') {
            pdfstudio_json_response(array(
                'ok' => false,
                'error' => 'Bitte geben Sie zur Bestaetigung Ihr aktuelles Passwort ein.'
            ), 400);
        }

        $db = pdfstudio_load_users_db();
        $foundIdx = -1;
        foreach ($db['users'] as $idx => $u) {
            if (isset($u['id']) && $u['id'] === $user['id']) {
                $foundIdx = $idx;
                break;
            }
        }

        if ($foundIdx === -1 || !pdfstudio_verify_password($currentPassword, $db['users'][$foundIdx]['password_hash'])) {
            pdfstudio_record_rate_limit_failure('delete_account');
            pdfstudio_json_response(array(
                'ok' => false,
                'error' => 'Das eingegebene Passwort ist nicht korrekt. Das Konto wurde nicht geloescht.'
            ), 401);
        }

        pdfstudio_clear_rate_limit('delete_account');
        $safeUid = preg_replace('/[^a-zA-Z0-9_\-]/', '', $user['id']);

        // 1. Delete user's personal vault directory and all versions
        if ($safeUid !== '') {
            $userDir = PDFSTUDIO_USERS_DIR . DIRECTORY_SEPARATOR . $safeUid;
            pdfstudio_delete_dir_recursive($userDir);
        }

        // 2. Remove all shares created by this user
        $sharesDb = pdfstudio_load_shares_db();
        if (isset($sharesDb['shares']) && is_array($sharesDb['shares'])) {
            $remainingShares = array();
            foreach ($sharesDb['shares'] as $s) {
                if (!isset($s['owner_id']) || $s['owner_id'] !== $user['id']) {
                    $remainingShares[] = $s;
                }
            }
            $sharesDb['shares'] = $remainingShares;
            pdfstudio_save_shares_db($sharesDb);
        }

        // 3. Remove user account from users.json
        array_splice($db['users'], $foundIdx, 1);
        pdfstudio_save_users_db($db);

        // 4. Refresh administrator usage statistics report
        pdfstudio_save_stats_and_report(pdfstudio_load_stats());

        // 5. Terminate user session
        unset($_SESSION['pdfstudio_user_id']);
        @session_regenerate_id(true);
        $_SESSION['pdfstudio_csrf_token'] = pdfstudio_generate_token(32);
        $csrf = $_SESSION['pdfstudio_csrf_token'];
        @session_write_close();

        pdfstudio_json_response(array(
            'ok' => true,
            'csrf_token' => $csrf,
            'user' => null,
            'quota' => null,
            'files' => array()
        ));
        break;

    case 'update_bates_counter':
        pdfstudio_require_csrf();
        $user = pdfstudio_get_current_user();
        if (!$user) {
            @session_write_close();
            pdfstudio_json_response(array('ok' => true, 'guest' => true));
        }
        $nextCounter = isset($_POST['bates_counter']) ? max(1, (int)$_POST['bates_counter']) : 1;
        $prefix = isset($_POST['bates_prefix']) ? substr(trim((string)$_POST['bates_prefix']), 0, 64) : null;

        $updated = pdfstudio_update_current_user_record(function ($u) use ($nextCounter, $prefix) {
            if (!isset($u['profile']) || !is_array($u['profile'])) {
                $u['profile'] = pdfstudio_default_user_profile($u['display_name'], $u['email']);
            }
            $u['profile']['bates_counter'] = $nextCounter;
            if ($prefix !== null && $prefix !== '') {
                $u['profile']['bates_prefix'] = $prefix;
            }
            return $u;
        });
        @session_write_close();

        pdfstudio_json_response(array(
            'ok' => true,
            'user' => $updated
        ));
        break;

    // =========================================================================
    // SIGNATURE & CUSTOM STAMP VAULT ENDPOINTS
    // =========================================================================
    case 'save_signature_vault':
        pdfstudio_require_csrf();
        $user = pdfstudio_get_current_user();
        if (!$user) {
            pdfstudio_json_response(array('ok' => false, 'error' => 'Bitte melden Sie sich an, um Unterschriften im Konto-Tresor zu speichern.'), 401);
        }
        $title = isset($_POST['title']) ? substr(trim((string)$_POST['title']), 0, 80) : 'Unterschrift';
        $dataUrl = isset($_POST['data_url']) ? trim((string)$_POST['data_url']) : '';
        if ($title === '') {
            $title = 'Unterschrift vom ' . date('d.m.Y');
        }
        if (!preg_match('/^data:image\/(png|jpeg);base64,[A-Za-z0-9+\/=]+$/', $dataUrl) || strlen($dataUrl) > 1048576) {
            pdfstudio_json_response(array('ok' => false, 'error' => 'Ungueltige Bilddaten fuer die Unterschrift.'), 400);
        }

        $updated = pdfstudio_update_current_user_record(function ($u) use ($title, $dataUrl) {
            if (!isset($u['signatures']) || !is_array($u['signatures'])) {
                $u['signatures'] = array();
            }
            $u['signatures'][] = array(
                'id' => 'sig_' . pdfstudio_generate_token(8),
                'title' => $title,
                'data_url' => $dataUrl,
                'created_at' => date('d.m.Y H:i')
            );
            return $u;
        });
        @session_write_close();

        pdfstudio_json_response(array(
            'ok' => true,
            'user' => $updated
        ));
        break;

    case 'delete_signature_vault':
        pdfstudio_require_csrf();
        $sigId = isset($_POST['sig_id']) ? (string)$_POST['sig_id'] : '';
        $updated = pdfstudio_update_current_user_record(function ($u) use ($sigId) {
            if (!isset($u['signatures']) || !is_array($u['signatures'])) {
                return $u;
            }
            $filtered = array();
            foreach ($u['signatures'] as $s) {
                if (isset($s['id']) && $s['id'] !== $sigId) {
                    $filtered[] = $s;
                }
            }
            $u['signatures'] = $filtered;
            return $u;
        });
        @session_write_close();

        pdfstudio_json_response(array(
            'ok' => true,
            'user' => $updated
        ));
        break;

    case 'save_stamp_vault':
        pdfstudio_require_csrf();
        $user = pdfstudio_get_current_user();
        if (!$user) {
            pdfstudio_json_response(array('ok' => false, 'error' => 'Bitte melden Sie sich an, um eigene Stempel im Konto zu speichern.'), 401);
        }
        $text = isset($_POST['text']) ? substr(trim((string)$_POST['text']), 0, 80) : '';
        $color = isset($_POST['color']) ? trim((string)$_POST['color']) : '#dc2626';
        if (!preg_match('/^#[0-9a-fA-F]{6}$/', $color)) {
            $color = '#16a34a';
        }
        if ($text === '') {
            pdfstudio_json_response(array('ok' => false, 'error' => 'Bitte geben Sie einen Stempel-Text ein.'), 400);
        }

        $updated = pdfstudio_update_current_user_record(function ($u) use ($text, $color) {
            if (!isset($u['stamps']) || !is_array($u['stamps'])) {
                $u['stamps'] = array();
            }
            $u['stamps'][] = array(
                'id' => 'st_' . pdfstudio_generate_token(8),
                'text' => $text,
                'color' => $color
            );
            return $u;
        });
        @session_write_close();

        pdfstudio_json_response(array(
            'ok' => true,
            'user' => $updated
        ));
        break;

    case 'delete_stamp_vault':
        pdfstudio_require_csrf();
        $stampId = isset($_POST['stamp_id']) ? (string)$_POST['stamp_id'] : '';
        $updated = pdfstudio_update_current_user_record(function ($u) use ($stampId) {
            if (!isset($u['stamps']) || !is_array($u['stamps'])) {
                return $u;
            }
            $filtered = array();
            foreach ($u['stamps'] as $s) {
                if (isset($s['id']) && $s['id'] !== $stampId) {
                    $filtered[] = $s;
                }
            }
            $u['stamps'] = $filtered;
            return $u;
        });
        @session_write_close();

        pdfstudio_json_response(array(
            'ok' => true,
            'user' => $updated
        ));
        break;

    // =========================================================================
    // WORKSPACE FILES, EDITABLE PROJECTS & VERSION HISTORY ENDPOINTS
    // =========================================================================
    case 'list_files':
        pdfstudio_require_login();
        @session_write_close();
        pdfstudio_json_response(array(
            'ok' => true,
            'quota' => pdfstudio_get_workspace_quota_info(),
            'files' => pdfstudio_list_workspace_files()
        ));
        break;

    case 'save_file':
        pdfstudio_require_csrf();
        pdfstudio_require_login();
        $workspaceDir = pdfstudio_get_workspace_dir();
        @session_write_close();
        if (!$workspaceDir || !is_dir($workspaceDir) || !is_writable($workspaceDir)) {
            pdfstudio_json_response(array(
                'ok' => false,
                'error' => 'Das Server-Verzeichnis ist nicht beschreibbar.'
            ), 500);
        }

        $rawName = isset($_POST['filename']) ? $_POST['filename'] : 'dokument.pdf';
        $safeName = pdfstudio_sanitize_filename($rawName);
        $targetPath = $workspaceDir . DIRECTORY_SEPARATOR . $safeName;

        $binaryData = null;
        if (isset($_FILES['file']) && isset($_FILES['file']['tmp_name']) && is_uploaded_file($_FILES['file']['tmp_name'])) {
            $binaryData = @file_get_contents($_FILES['file']['tmp_name']);
        } elseif (isset($_POST['pdf_base64'])) {
            $b64 = (string)$_POST['pdf_base64'];
            $commaPos = strpos($b64, ',');
            if ($commaPos !== false) {
                $b64 = substr($b64, $commaPos + 1);
            }
            $binaryData = base64_decode($b64);
        }

        if (!$binaryData || strlen($binaryData) < 8 || strncmp($binaryData, '%PDF-', 5) !== 0) {
            pdfstudio_json_response(array(
                'ok' => false,
                'error' => 'Ungueltige oder leere PDF-Daten empfangen.'
            ), 400);
        }

        // Check storage quota defined in config.php before writing
        $quotaInfo = pdfstudio_get_workspace_quota_info($workspaceDir);
        if ($quotaInfo['quota_bytes'] > 0) {
            $newBytesNeeded = strlen($binaryData);
            if (isset($_POST['project_json'])) {
                $newBytesNeeded += strlen((string)$_POST['project_json']);
            }
            if (isset($_FILES['raw_file']) && isset($_FILES['raw_file']['size'])) {
                $newBytesNeeded += (int)$_FILES['raw_file']['size'];
            }
            // If overwriting an existing project, .proj.json and .raw are replaced in-place (not archived)
            $reclaimedBytes = 0;
            if (is_file($targetPath . '.proj.json')) {
                $reclaimedBytes += (int)@filesize($targetPath . '.proj.json');
            }
            if (is_file($targetPath . '.raw')) {
                $reclaimedBytes += (int)@filesize($targetPath . '.raw');
            }
            if (!pdfstudio_config('include_versions_in_quota', true) && is_file($targetPath)) {
                $reclaimedBytes += (int)@filesize($targetPath);
            }
            $effectiveUsed = max(0, $quotaInfo['used_bytes'] - $reclaimedBytes);
            if (($effectiveUsed + $newBytesNeeded) > $quotaInfo['quota_bytes']) {
                pdfstudio_json_response(array(
                    'ok' => false,
                    'error' => 'Speicherplatz-Kontingent erreicht: Ihnen stehen maximal '
                             . $quotaInfo['quota_formatted'] . ' zur Verfuegung (aktuell belegt: '
                             . $quotaInfo['used_formatted'] . '). Bitte loeschen Sie nicht mehr benoetigte Dateien im Tresor.',
                    'quota' => $quotaInfo
                ), 413);
            }
        }

        $isAutoSave = isset($_POST['autosave']) && $_POST['autosave'] === '1';

        // Archive existing file into versions/ before overwriting
        // (For 5-minute auto-saves, only create a new version if the existing file is at least 15 minutes old)
        $archivedVersion = null;
        if (is_file($targetPath)) {
            $shouldArchive = true;
            if ($isAutoSave) {
                $versions = pdfstudio_list_file_versions($workspaceDir, $safeName);
                if (!empty($versions) && isset($versions[0]['timestamp'])) {
                    if ((time() - (int)$versions[0]['timestamp']) < 900) {
                        $shouldArchive = false;
                    }
                }
            }
            if ($shouldArchive) {
                $archivedVersion = pdfstudio_archive_file_version($workspaceDir, $safeName);
            }
        }

        $written = @file_put_contents($targetPath, $binaryData, LOCK_EX);
        if ($written === false) {
            pdfstudio_json_response(array(
                'ok' => false,
                'error' => 'Fehler beim Schreiben der PDF-Datei auf dem Server.'
            ), 500);
        }

        // Optional: Save editable project state (.proj.json + unbaked .raw PDF) for "Later re-editing"
        $projPath = $targetPath . '.proj.json';
        $rawPdfPath = $targetPath . '.raw';
        if (isset($_POST['project_json']) && trim((string)$_POST['project_json']) !== '') {
            $rawJsonStr = (string)$_POST['project_json'];
            $decodedProjCheck = @json_decode($rawJsonStr, true);
            if (is_array($decodedProjCheck)) {
                @file_put_contents($projPath, $rawJsonStr, LOCK_EX);
                if (isset($_FILES['raw_file']) && isset($_FILES['raw_file']['tmp_name']) && is_uploaded_file($_FILES['raw_file']['tmp_name'])) {
                    $rawBytes = @file_get_contents($_FILES['raw_file']['tmp_name']);
                    if ($rawBytes && strncmp($rawBytes, '%PDF-', 5) === 0) {
                        @file_put_contents($rawPdfPath, $rawBytes, LOCK_EX);
                    }
                }
            }
        }

        $info = pdfstudio_inspect_pdf_binary($binaryData);
        if (!$isAutoSave) {
            pdfstudio_record_stat('tool', 'vault_saved');
        }
        pdfstudio_json_response(array(
            'ok' => true,
            'autosave' => $isAutoSave,
            'filename' => $safeName,
            'size' => $written,
            'size_formatted' => pdfstudio_format_bytes($written),
            'archived_version' => $archivedVersion,
            'info' => $info,
            'quota' => pdfstudio_get_workspace_quota_info($workspaceDir),
            'files' => pdfstudio_list_workspace_files()
        ));
        break;

    case 'load_file':
        pdfstudio_require_login();
        $workspaceDir = pdfstudio_get_workspace_dir();
        @session_write_close();
        $rawName = isset($_GET['filename']) ? $_GET['filename'] : '';
        $safeName = pdfstudio_sanitize_filename($rawName);
        $targetPath = $workspaceDir . DIRECTORY_SEPARATOR . $safeName;

        if (!is_file($targetPath) || !is_readable($targetPath)) {
            pdfstudio_json_response(array(
                'ok' => false,
                'error' => 'Datei wurde auf dem Server nicht gefunden.'
            ), 404);
        }

        if (!headers_sent()) {
            header('Content-Type: application/pdf');
            header('Content-Length: ' . filesize($targetPath));
            header('Content-Disposition: inline; filename="' . $safeName . '"');
            header('Cache-Control: no-store, no-cache, must-revalidate');
        }
        readfile($targetPath);
        exit;

    case 'load_project':
        pdfstudio_require_login();
        $workspaceDir = pdfstudio_get_workspace_dir();
        @session_write_close();
        $rawName = isset($_GET['filename']) ? $_GET['filename'] : '';
        $safeName = pdfstudio_sanitize_filename($rawName);
        $targetPath = $workspaceDir . DIRECTORY_SEPARATOR . $safeName;

        if (!is_file($targetPath) || !is_readable($targetPath)) {
            pdfstudio_json_response(array(
                'ok' => false,
                'error' => 'Datei wurde im Tresor nicht gefunden.'
            ), 404);
        }

        $projPath = $targetPath . '.proj.json';
        $rawPdfPath = $targetPath . '.raw';

        $hasProject = is_file($projPath);
        $projectData = null;
        if ($hasProject) {
            $decodedProj = @json_decode(@file_get_contents($projPath), true);
            if (is_array($decodedProj)) {
                $projectData = $decodedProj;
            }
        }

        // If unbaked .raw exists and project has annotations, load .raw so annotations are not duplicated
        $pdfSourcePath = ($hasProject && is_file($rawPdfPath)) ? $rawPdfPath : $targetPath;
        $pdfBytes = @file_get_contents($pdfSourcePath);
        pdfstudio_record_stat('tool', 'vault_loaded');

        pdfstudio_json_response(array(
            'ok' => true,
            'filename' => $safeName,
            'has_project' => ($projectData !== null),
            'project' => $projectData,
            'pdf_base64' => base64_encode($pdfBytes !== false ? $pdfBytes : '')
        ));
        break;

    case 'delete_file':
        pdfstudio_require_csrf();
        pdfstudio_require_login();
        $workspaceDir = pdfstudio_get_workspace_dir();
        @session_write_close();
        $rawName = isset($_POST['filename']) ? $_POST['filename'] : (isset($_GET['filename']) ? $_GET['filename'] : '');
        $safeName = pdfstudio_sanitize_filename($rawName);
        $targetPath = $workspaceDir . DIRECTORY_SEPARATOR . $safeName;

        if (is_file($targetPath)) {
            @unlink($targetPath);
        }
        if (is_file($targetPath . '.proj.json')) {
            @unlink($targetPath . '.proj.json');
        }
        if (is_file($targetPath . '.raw')) {
            @unlink($targetPath . '.raw');
        }

        pdfstudio_json_response(array(
            'ok' => true,
            'quota' => pdfstudio_get_workspace_quota_info($workspaceDir),
            'files' => pdfstudio_list_workspace_files()
        ));
        break;

    case 'list_versions':
        pdfstudio_require_login();
        $workspaceDir = pdfstudio_get_workspace_dir();
        @session_write_close();
        $rawName = isset($_GET['filename']) ? $_GET['filename'] : '';
        $safeName = pdfstudio_sanitize_filename($rawName);
        $versions = pdfstudio_list_file_versions($workspaceDir, $safeName);

        pdfstudio_json_response(array(
            'ok' => true,
            'filename' => $safeName,
            'versions' => $versions
        ));
        break;

    case 'load_version':
        pdfstudio_require_login();
        $workspaceDir = pdfstudio_get_workspace_dir();
        @session_write_close();
        $verFile = isset($_GET['version_file']) ? basename((string)$_GET['version_file']) : '';
        if (!preg_match('/^[a-zA-Z0-9_\-\.]+\.pdf$/', $verFile)) {
            pdfstudio_json_response(array('ok' => false, 'error' => 'Ungueltiger Versionsdateiname.'), 400);
        }
        $verPath = $workspaceDir . DIRECTORY_SEPARATOR . 'versions' . DIRECTORY_SEPARATOR . $verFile;

        if ($verFile === '' || !is_file($verPath) || !is_readable($verPath)) {
            pdfstudio_json_response(array(
                'ok' => false,
                'error' => 'Angeforderte Dateiversion wurde nicht gefunden.'
            ), 404);
        }

        if (!headers_sent()) {
            header('Content-Type: application/pdf');
            header('Content-Length: ' . filesize($verPath));
            header('Content-Disposition: inline; filename="' . $verFile . '"');
            header('Cache-Control: no-store, no-cache, must-revalidate');
        }
        readfile($verPath);
        exit;

    // =========================================================================
    // EMAIL DOCUMENT SHARING ENDPOINTS
    // =========================================================================
    case 'create_share':
        pdfstudio_require_csrf();
        $user = pdfstudio_require_login();
        $workspaceDir = pdfstudio_get_workspace_dir();
        @session_write_close();

        $rawName = isset($_POST['filename']) ? $_POST['filename'] : '';
        $safeName = pdfstudio_sanitize_filename($rawName);
        $targetPath = $workspaceDir . DIRECTORY_SEPARATOR . $safeName;

        // If the document is not yet saved in workspaceDir, allow uploading it directly in the share request
        if (!is_file($targetPath) && isset($_FILES['file']) && isset($_FILES['file']['tmp_name']) && is_uploaded_file($_FILES['file']['tmp_name'])) {
            $uploadedBytes = @file_get_contents($_FILES['file']['tmp_name']);
            if ($uploadedBytes && strncmp($uploadedBytes, '%PDF-', 5) === 0) {
                @file_put_contents($targetPath, $uploadedBytes, LOCK_EX);
            }
        }

        if (!is_file($targetPath)) {
            pdfstudio_json_response(array(
                'ok' => false,
                'error' => 'Die zu teilende PDF-Datei wurde nicht auf dem Server gefunden.'
            ), 404);
        }

        $recipientEmail = isset($_POST['recipient_email']) ? trim((string)$_POST['recipient_email']) : '';
        $customMessage = isset($_POST['message']) ? substr(trim((string)$_POST['message']), 0, 1000) : '';
        $allowEdit = isset($_POST['allow_edit']) && $_POST['allow_edit'] === '1';
        $expiresDays = isset($_POST['expires_days']) ? (int)$_POST['expires_days'] : 14;

        if ($recipientEmail === '' || strpos($recipientEmail, '@') === false) {
            pdfstudio_json_response(array(
                'ok' => false,
                'error' => 'Bitte geben Sie eine gueltige Empfaenger-E-Mail-Adresse ein.'
            ), 400);
        }

        $token = pdfstudio_generate_token(32);
        $senderName = $user ? $user['display_name'] : (string)pdfstudio_config('mail_from_name', 'PDF-Werkstatt Pro');
        $replyToEmail = ($user && !empty($user['email'])) ? $user['email'] : (string)pdfstudio_config('mail_from_address', 'noreply@pdf-werkstatt.local');
        $expiresAt = $expiresDays > 0 ? (time() + ($expiresDays * 86400)) : 0;

        $shareRecord = array(
            'token' => $token,
            'owner_id' => $user ? $user['id'] : 'guest',
            'owner_name' => $senderName,
            'owner_email' => $replyToEmail,
            'recipient_email' => $recipientEmail,
            'message' => $customMessage,
            'filename' => $safeName,
            'file_path' => $targetPath,
            'allow_edit' => $allowEdit,
            'created_at' => date('d.m.Y H:i'),
            'expires_at' => $expiresAt,
            'expires_formatted' => $expiresAt > 0 ? date('d.m.Y', $expiresAt) : 'Unbegrenzt'
        );

        $sharesDb = pdfstudio_load_shares_db();
        $sharesDb['shares'][] = $shareRecord;
        pdfstudio_save_shares_db($sharesDb);
        pdfstudio_record_stat('tool', 'email_shared');

        $shareUrl = pdfstudio_get_base_app_url() . '?share=' . urlencode($token);
        $modeLabel = $allowEdit ? 'Im Browser-Editor ansehen, kommentieren & gegenzeichnen' : 'Im Browser ansehen & herunterladen';

        $subject = 'PDF-Freigabe von ' . $senderName . ': ' . $safeName;
        $bodyLines = array(
            'Guten Tag,',
            '',
            $senderName . ' hat das PDF-Dokument "' . $safeName . '" in PDF-Werkstatt Pro fuer Sie freigegeben.',
            ''
        );
        if ($customMessage !== '') {
            $bodyLines[] = 'Persoenliche Nachricht:';
            $bodyLines[] = '"' . $customMessage . '"';
            $bodyLines[] = '';
        }
        $bodyLines[] = 'Berechtigung : ' . $modeLabel;
        $bodyLines[] = 'Gueltigkeit  : ' . $shareRecord['expires_formatted'];
        $bodyLines[] = '';
        $bodyLines[] = 'Direkter Link zum Oeffnen des Dokuments:';
        $bodyLines[] = $shareUrl;
        $bodyLines[] = '';
        $bodyLines[] = 'Mit freundlichen Gruessen';
        $bodyLines[] = (string)pdfstudio_config('mail_from_name', 'PDF-Werkstatt Pro');

        $mailBody = implode("\r\n", $bodyLines);
        $mailRes = pdfstudio_send_email($recipientEmail, $subject, $mailBody, $replyToEmail);
        $mailSent = !empty($mailRes['sent']);

        $mailtoUrl = 'mailto:' . rawurlencode($recipientEmail)
                   . '?subject=' . rawurlencode($subject)
                   . '&body=' . rawurlencode($mailBody);

        pdfstudio_json_response(array(
            'ok' => true,
            'share' => array(
                'token' => $token,
                'filename' => $safeName,
                'recipient_email' => $recipientEmail,
                'allow_edit' => $allowEdit,
                'created_at' => $shareRecord['created_at'],
                'expires_formatted' => $shareRecord['expires_formatted']
            ),
            'share_url' => $shareUrl,
            'mail_sent' => $mailSent,
            'mail_method' => isset($mailRes['method']) ? $mailRes['method'] : 'mail',
            'from_address' => isset($mailRes['from_address']) ? $mailRes['from_address'] : '',
            'mailto_url' => $mailtoUrl,
            'files' => pdfstudio_list_workspace_files()
        ));
        break;

    case 'list_shares':
        $user = pdfstudio_require_login();
        @session_write_close();
        $ownerId = $user['id'];
        $sharesDb = pdfstudio_load_shares_db();
        $myShares = array();
        $baseUrl = pdfstudio_get_base_app_url();

        foreach ($sharesDb['shares'] as $s) {
            if (isset($s['owner_id']) && $s['owner_id'] === $ownerId) {
                $myShares[] = array(
                    'token' => $s['token'],
                    'filename' => $s['filename'],
                    'recipient_email' => $s['recipient_email'],
                    'allow_edit' => !empty($s['allow_edit']),
                    'created_at' => $s['created_at'],
                    'expires_formatted' => isset($s['expires_formatted']) ? $s['expires_formatted'] : 'Unbegrenzt',
                    'share_url' => $baseUrl . '?share=' . urlencode($s['token'])
                );
            }
        }

        pdfstudio_json_response(array(
            'ok' => true,
            'shares' => array_reverse($myShares)
        ));
        break;

    case 'delete_share':
        pdfstudio_require_csrf();
        $user = pdfstudio_require_login();
        @session_write_close();
        $ownerId = $user['id'];
        $token = isset($_POST['token']) ? (string)$_POST['token'] : '';
        $sharesDb = pdfstudio_load_shares_db();
        $remaining = array();

        foreach ($sharesDb['shares'] as $s) {
            if (isset($s['token']) && pdfstudio_safe_equals($s['token'], $token) && isset($s['owner_id']) && $s['owner_id'] === $ownerId) {
                continue;
            }
            $remaining[] = $s;
        }
        $sharesDb['shares'] = $remaining;
        pdfstudio_save_shares_db($sharesDb);

        pdfstudio_json_response(array(
            'ok' => true
        ));
        break;

    case 'load_share':
        @session_write_close();
        $rl = pdfstudio_check_rate_limit('load_share');
        if (!$rl['allowed']) {
            pdfstudio_json_response(array('ok' => false, 'error' => 'Zu viele Anfragen. Bitte warten Sie ' . $rl['retry_after'] . ' Sekunden.'), 429);
        }
        $token = isset($_GET['token']) ? trim((string)$_GET['token']) : '';
        $sharesDb = pdfstudio_load_shares_db();
        $found = null;

        foreach ($sharesDb['shares'] as $s) {
            if (isset($s['token']) && pdfstudio_safe_equals($s['token'], $token)) {
                $found = $s;
                break;
            }
        }

        if (!$found) {
            pdfstudio_record_rate_limit_failure('load_share');
            pdfstudio_json_response(array(
                'ok' => false,
                'error' => 'Dieser Freigabe-Link ist ungueltig oder wurde widerrufen.'
            ), 404);
        }

        if (!empty($found['expires_at']) && time() > (int)$found['expires_at']) {
            pdfstudio_json_response(array(
                'ok' => false,
                'error' => 'Dieser Freigabe-Link ist abgelaufen.'
            ), 410);
        }

        $filePath = isset($found['file_path']) ? $found['file_path'] : '';
        if (!is_file($filePath) || !is_readable($filePath)) {
            pdfstudio_json_response(array(
                'ok' => false,
                'error' => 'Die freigegebene PDF-Datei existiert nicht mehr.'
            ), 404);
        }

        $projPath = $filePath . '.proj.json';
        $rawPdfPath = $filePath . '.raw';
        $projectData = null;

        if (!empty($found['allow_edit']) && is_file($projPath)) {
            $decoded = @json_decode(@file_get_contents($projPath), true);
            if (is_array($decoded)) {
                $projectData = $decoded;
            }
        }

        $sourcePdf = ($projectData !== null && is_file($rawPdfPath)) ? $rawPdfPath : $filePath;
        $pdfBytes = @file_get_contents($sourcePdf);

        pdfstudio_json_response(array(
            'ok' => true,
            'share' => array(
                'token' => $found['token'],
                'filename' => $found['filename'],
                'owner_name' => $found['owner_name'],
                'recipient_email' => $found['recipient_email'],
                'message' => isset($found['message']) ? $found['message'] : '',
                'allow_edit' => !empty($found['allow_edit']),
                'created_at' => $found['created_at']
            ),
            'project' => $projectData,
            'pdf_base64' => base64_encode($pdfBytes !== false ? $pdfBytes : '')
        ));
        break;

    case 'send_pdf_email':
        pdfstudio_require_csrf();
        @session_write_close();

        $rl = pdfstudio_check_rate_limit('send_pdf_email');
        if (empty($rl['allowed'])) {
            pdfstudio_json_response(array(
                'ok' => false,
                'error' => 'Zu viele E-Mail-Anfragen. Bitte warten Sie ' . (int)$rl['retry_after'] . ' Sekunden.'
            ), 429);
        }

        $toEmail = isset($_POST['to_email']) ? trim((string)$_POST['to_email']) : '';
        $replyTo = isset($_POST['reply_to']) ? trim((string)$_POST['reply_to']) : '';
        $subject = isset($_POST['subject']) ? trim((string)$_POST['subject']) : '';
        $message = isset($_POST['message']) ? trim((string)$_POST['message']) : '';
        $filename = isset($_POST['filename']) ? pdfstudio_sanitize_filename($_POST['filename']) : 'dokument.pdf';

        if ($toEmail === '' || strpos($toEmail, '@') === false) {
            pdfstudio_json_response(array('ok' => false, 'error' => 'Bitte eine gültige Empfänger-E-Mail-Adresse eingeben.'), 400);
        }
        if ($subject === '') {
            $subject = 'PDF-Dokument: ' . $filename;
        }
        if ($message === '') {
            $message = "Guten Tag,\n\nanbei erhalten Sie das PDF-Dokument \"" . $filename . "\".\n\nMit freundlichen Grüßen\nPDF-Werkstatt Pro";
        }

        $pdfBytes = '';
        if (isset($_FILES['pdf_file']) && isset($_FILES['pdf_file']['tmp_name']) && is_uploaded_file($_FILES['pdf_file']['tmp_name'])) {
            $pdfBytes = (string)@file_get_contents($_FILES['pdf_file']['tmp_name']);
        } elseif (!empty($_POST['pdf_base64'])) {
            $decoded = @base64_decode((string)$_POST['pdf_base64'], true);
            if ($decoded !== false) {
                $pdfBytes = $decoded;
            }
        }

        if (strlen($pdfBytes) < 8 || strncmp($pdfBytes, '%PDF-', 5) !== 0) {
            pdfstudio_json_response(array('ok' => false, 'error' => 'Ungültige oder fehlende PDF-Daten für den E-Mail-Anhang.'), 400);
        }

        $sendRes = pdfstudio_send_email_with_pdf($toEmail, $subject, $message, $pdfBytes, $filename, $replyTo);
        if (!empty($sendRes['sent'])) {
            pdfstudio_record_stat('tool', 'email_shared');
            pdfstudio_json_response(array(
                'ok' => true,
                'method' => $sendRes['method'],
                'message' => 'PDF "' . $filename . '" wurde erfolgreich per E-Mail an ' . $toEmail . ' gesendet!'
            ));
        } else {
            pdfstudio_record_rate_limit_failure('send_pdf_email');
            pdfstudio_json_response(array(
                'ok' => false,
                'error' => !empty($sendRes['error'])
                    ? $sendRes['error']
                    : 'E-Mail konnte nicht versendet werden. Bitte prüfen Sie die SMTP-Einstellungen im Adminbereich (⚙️).'
            ), 500);
        }
        break;

    case 'track_event':
        pdfstudio_require_csrf();
        @session_write_close();
        $evKey = isset($_POST['event_key']) ? trim((string)$_POST['event_key']) : '';
        if ($evKey !== '') {
            pdfstudio_record_stat('tool', $evKey);
        }
        pdfstudio_json_response(array('ok' => true));
        break;

    case 'inspect_pdf':
        @session_write_close();
        if (isset($_FILES['file']) && isset($_FILES['file']['tmp_name']) && is_uploaded_file($_FILES['file']['tmp_name'])) {
            $data = @file_get_contents($_FILES['file']['tmp_name']);
            $info = pdfstudio_inspect_pdf_binary($data !== false ? $data : '');
            $a11y = pdfstudio_audit_accessibility($data !== false ? $data : '');
            pdfstudio_json_response(array(
                'ok' => true,
                'info' => $info,
                'accessibility' => $a11y
            ));
        } else {
            pdfstudio_json_response(array(
                'ok' => false,
                'error' => 'Keine Datei uebergeben.'
            ), 400);
        }
        break;

    default:
        pdfstudio_json_response(array(
            'ok' => false,
            'error' => 'Unbekannte API-Aktion: ' . htmlspecialchars($action, ENT_QUOTES, 'UTF-8')
        ), 400);
        break;
}
