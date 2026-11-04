<?php
/**
 * PDF-Werkstatt Pro - Optional User Account, Vault, Versioning & Email Share System
 * 100% File-based in storage/ (Zero-Config, Compatible with PHP 5.4.0 through PHP 8.4+)
 */

if (!defined('PDFSTUDIO_INIT')) {
    exit('Direct access not permitted.');
}

define('PDFSTUDIO_USERS_FILE', PDFSTUDIO_STORAGE . DIRECTORY_SEPARATOR . 'users.json');
define('PDFSTUDIO_SHARES_FILE', PDFSTUDIO_STORAGE . DIRECTORY_SEPARATOR . 'shares.json');
define('PDFSTUDIO_RATELIMIT_FILE', PDFSTUDIO_STORAGE . DIRECTORY_SEPARATOR . 'ratelimit.json');
define('PDFSTUDIO_USERS_DIR', PDFSTUDIO_STORAGE . DIRECTORY_SEPARATOR . 'users');
define('PDFSTUDIO_PUBLIC_DIR', PDFSTUDIO_STORAGE . DIRECTORY_SEPARATOR . 'public');
define('PDFSTUDIO_STATS_JSON', PDFSTUDIO_STORAGE . DIRECTORY_SEPARATOR . 'nutzungsstatistik.json');
define('PDFSTUDIO_STATS_TXT', PDFSTUDIO_STORAGE . DIRECTORY_SEPARATOR . 'nutzungsstatistik.txt');

/**
 * Constant-time string comparison (PHP 5.4+ compatible) to prevent timing attacks
 */
function pdfstudio_safe_equals($known, $userProvided)
{
    $known = (string)$known;
    $userProvided = (string)$userProvided;
    if (function_exists('hash_equals')) {
        return hash_equals($known, $userProvided);
    }
    if (strlen($known) !== strlen($userProvided)) {
        return false;
    }
    $len = strlen($known);
    $res = 0;
    for ($i = 0; $i < $len; $i++) {
        $res |= (ord($known[$i]) ^ ord($userProvided[$i]));
    }
    return ($res === 0);
}

/**
 * Generate or return the current session's CSRF protection token
 */
function pdfstudio_get_csrf_token()
{
    if (!isset($_SESSION['pdfstudio_csrf_token']) || !is_string($_SESSION['pdfstudio_csrf_token']) || strlen($_SESSION['pdfstudio_csrf_token']) < 32) {
        $_SESSION['pdfstudio_csrf_token'] = pdfstudio_generate_token(32);
    }
    return $_SESSION['pdfstudio_csrf_token'];
}

/**
 * Validate incoming CSRF token from header or POST parameter
 */
function pdfstudio_verify_csrf_token()
{
    $expected = pdfstudio_get_csrf_token();
    $provided = '';
    if (isset($_SERVER['HTTP_X_CSRF_TOKEN'])) {
        $provided = (string)$_SERVER['HTTP_X_CSRF_TOKEN'];
    } elseif (isset($_POST['csrf_token'])) {
        $provided = (string)$_POST['csrf_token'];
    }
    if ($provided === '' || !pdfstudio_safe_equals($expected, $provided)) {
        return false;
    }
    return true;
}

/**
 * Brute-force rate limiter per IP + bucket (stored in storage/ratelimit.json)
 */
function pdfstudio_get_client_ip_key($bucket)
{
    $ip = isset($_SERVER['REMOTE_ADDR']) ? (string)$_SERVER['REMOTE_ADDR'] : '127.0.0.1';
    return sha1($bucket . '|' . $ip);
}

function pdfstudio_check_rate_limit($bucket)
{
    $maxAttempts = max(3, (int)pdfstudio_config('max_login_attempts', 8));
    $windowSec = max(60, (int)pdfstudio_config('login_lockout_seconds', 300));
    $key = pdfstudio_get_client_ip_key($bucket);
    $now = time();

    if (!is_file(PDFSTUDIO_RATELIMIT_FILE)) {
        return array('allowed' => true, 'remaining' => $maxAttempts, 'retry_after' => 0);
    }

    $raw = @file_get_contents(PDFSTUDIO_RATELIMIT_FILE);
    $data = $raw ? @json_decode($raw, true) : array();
    if (!is_array($data) || !isset($data[$key])) {
        return array('allowed' => true, 'remaining' => $maxAttempts, 'retry_after' => 0);
    }

    $entry = $data[$key];
    $firstTs = isset($entry['first_ts']) ? (int)$entry['first_ts'] : $now;
    $count = isset($entry['count']) ? (int)$entry['count'] : 0;

    if (($now - $firstTs) > $windowSec) {
        return array('allowed' => true, 'remaining' => $maxAttempts, 'retry_after' => 0);
    }

    if ($count >= $maxAttempts) {
        $retryAfter = max(1, $windowSec - ($now - $firstTs));
        return array('allowed' => false, 'remaining' => 0, 'retry_after' => $retryAfter);
    }

    return array('allowed' => true, 'remaining' => $maxAttempts - $count, 'retry_after' => 0);
}

function pdfstudio_record_rate_limit_failure($bucket)
{
    $windowSec = max(60, (int)pdfstudio_config('login_lockout_seconds', 300));
    $key = pdfstudio_get_client_ip_key($bucket);
    $now = time();

    $raw = is_file(PDFSTUDIO_RATELIMIT_FILE) ? @file_get_contents(PDFSTUDIO_RATELIMIT_FILE) : '';
    $data = $raw ? @json_decode($raw, true) : array();
    if (!is_array($data)) {
        $data = array();
    }

    // Prune expired buckets
    foreach ($data as $k => $v) {
        if (!isset($v['first_ts']) || ($now - (int)$v['first_ts']) > ($windowSec * 2)) {
            unset($data[$k]);
        }
    }

    if (!isset($data[$key]) || ($now - (int)$data[$key]['first_ts']) > $windowSec) {
        $data[$key] = array('first_ts' => $now, 'count' => 1);
    } else {
        $data[$key]['count'] = (int)$data[$key]['count'] + 1;
    }

    @file_put_contents(PDFSTUDIO_RATELIMIT_FILE, json_encode($data), LOCK_EX);
}

function pdfstudio_clear_rate_limit($bucket)
{
    if (!is_file(PDFSTUDIO_RATELIMIT_FILE)) {
        return;
    }
    $key = pdfstudio_get_client_ip_key($bucket);
    $raw = @file_get_contents(PDFSTUDIO_RATELIMIT_FILE);
    $data = $raw ? @json_decode($raw, true) : array();
    if (is_array($data) && isset($data[$key])) {
        unset($data[$key]);
        @file_put_contents(PDFSTUDIO_RATELIMIT_FILE, json_encode($data), LOCK_EX);
    }
}

/**
 * Ensure user and share storage directories exist
 */
function pdfstudio_init_account_storage()
{
    if (!is_dir(PDFSTUDIO_USERS_DIR)) {
        @mkdir(PDFSTUDIO_USERS_DIR, 0755, true);
    }
    if (!is_dir(PDFSTUDIO_PUBLIC_DIR)) {
        @mkdir(PDFSTUDIO_PUBLIC_DIR, 0755, true);
    }
    if (!file_exists(PDFSTUDIO_USERS_FILE)) {
        @file_put_contents(PDFSTUDIO_USERS_FILE, json_encode(array('users' => array())));
    }
    if (!file_exists(PDFSTUDIO_SHARES_FILE)) {
        @file_put_contents(PDFSTUDIO_SHARES_FILE, json_encode(array('shares' => array())));
    }
}

/**
 * PHP 5.4+ compatible password hashing & verification
 */
function pdfstudio_hash_password($password)
{
    $password = (string)$password;
    if (function_exists('password_hash')) {
        return password_hash($password, PASSWORD_DEFAULT);
    }
    // Fallback for PHP 5.4.x without password_compat
    $salt = sha1(uniqid(mt_rand(), true) . microtime(true));
    $hash = hash_hmac('sha256', $password, $salt);
    for ($i = 0; $i < 1000; $i++) {
        $hash = hash_hmac('sha256', $hash . $password, $salt);
    }
    return 'sha256$1000$' . $salt . '$' . $hash;
}

function pdfstudio_verify_password($password, $storedHash)
{
    $password = (string)$password;
    $storedHash = (string)$storedHash;
    if (strpos($storedHash, 'sha256$1000$') === 0) {
        $parts = explode('$', $storedHash);
        if (count($parts) !== 4) {
            return false;
        }
        $salt = $parts[2];
        $expected = $parts[3];
        $hash = hash_hmac('sha256', $password, $salt);
        for ($i = 0; $i < 1000; $i++) {
            $hash = hash_hmac('sha256', $hash . $password, $salt);
        }
        return pdfstudio_safe_equals($expected, $hash);
    }
    if (function_exists('password_verify')) {
        return password_verify($password, $storedHash);
    }
    return false;
}

/**
 * Generate a secure random token (PHP 5.4+ safe)
 */
function pdfstudio_generate_token($length = 32)
{
    if (function_exists('random_bytes')) {
        try {
            return bin2hex(random_bytes((int)($length / 2)));
        } catch (Exception $e) {
            // fallback below
        }
    }
    if (function_exists('openssl_random_pseudo_bytes')) {
        $bytes = openssl_random_pseudo_bytes((int)($length / 2));
        if ($bytes !== false) {
            return bin2hex($bytes);
        }
    }
    $pool = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    $out = '';
    for ($i = 0; $i < $length; $i++) {
        $out .= $pool[mt_rand(0, strlen($pool) - 1)];
    }
    return $out;
}

/**
 * Load all users from users.json
 */
function pdfstudio_load_users_db()
{
    pdfstudio_init_account_storage();
    $raw = @file_get_contents(PDFSTUDIO_USERS_FILE);
    if (!$raw) {
        return array('users' => array());
    }
    $decoded = @json_decode($raw, true);
    if (!is_array($decoded) || !isset($decoded['users']) || !is_array($decoded['users'])) {
        return array('users' => array());
    }
    return $decoded;
}

/**
 * Save users database to users.json
 */
function pdfstudio_save_users_db($db)
{
    pdfstudio_init_account_storage();
    $flags = defined('JSON_PRETTY_PRINT') ? JSON_PRETTY_PRINT : 0;
    return @file_put_contents(PDFSTUDIO_USERS_FILE, json_encode($db, $flags), LOCK_EX) !== false;
}

/**
 * Default user profile & vault structure
 */
function pdfstudio_default_user_profile($displayName, $email)
{
    return array(
        'default_author' => $displayName,
        'organization' => '',
        'default_lang' => 'de-DE',
        'default_watermark' => 'VERTRAULICH',
        'bates_prefix' => 'AZ-' . date('Y') . '-',
        'bates_counter' => 1,
        'bates_digits' => 6,
        'header_left' => '',
        'header_center' => '',
        'header_right' => '{date}',
        'footer_left' => $displayName,
        'footer_center' => '',
        'footer_right' => 'Seite {page} von {total}'
    );
}

/**
 * Return currently logged in user array (without password_hash) or null
 */
function pdfstudio_get_current_user()
{
    if (!isset($_SESSION['pdfstudio_user_id']) || empty($_SESSION['pdfstudio_user_id'])) {
        return null;
    }
    $uid = (string)$_SESSION['pdfstudio_user_id'];
    $db = pdfstudio_load_users_db();
    foreach ($db['users'] as $u) {
        if (isset($u['id']) && $u['id'] === $uid) {
            return pdfstudio_sanitize_user_for_client($u);
        }
    }
    unset($_SESSION['pdfstudio_user_id']);
    return null;
}

/**
 * Strip sensitive fields before returning user object to client
 */
function pdfstudio_sanitize_user_for_client($user)
{
    $clean = $user;
    unset($clean['password_hash']);
    unset($clean['reset_token']);
    unset($clean['reset_expires_at']);
    if (!isset($clean['profile']) || !is_array($clean['profile'])) {
        $clean['profile'] = pdfstudio_default_user_profile(
            isset($clean['display_name']) ? $clean['display_name'] : $clean['username'],
            isset($clean['email']) ? $clean['email'] : ''
        );
    }
    if (!isset($clean['signatures']) || !is_array($clean['signatures'])) {
        $clean['signatures'] = array();
    }
    if (!isset($clean['stamps']) || !is_array($clean['stamps'])) {
        $clean['stamps'] = array();
    }
    return $clean;
}

/**
 * Get the active storage directory for the current session (Only for logged-in account holders; null for guests)
 */
function pdfstudio_get_workspace_dir()
{
    $user = pdfstudio_get_current_user();
    if ($user && isset($user['id'])) {
        $safeUid = preg_replace('/[^a-zA-Z0-9_\-]/', '', $user['id']);
        $userDir = PDFSTUDIO_USERS_DIR . DIRECTORY_SEPARATOR . $safeUid;
        if (!is_dir($userDir)) {
            @mkdir($userDir, 0755, true);
        }
        $verDir = $userDir . DIRECTORY_SEPARATOR . 'versions';
        if (!is_dir($verDir)) {
            @mkdir($verDir, 0755, true);
        }
        return $userDir;
    }
    return null;
}

/**
 * Recursively delete a directory and all its contents (PHP 5.4+ compatible)
 */
function pdfstudio_delete_dir_recursive($dir)
{
    if (!is_string($dir) || $dir === '' || !is_dir($dir)) {
        return false;
    }
    $items = @scandir($dir);
    if (is_array($items)) {
        foreach ($items as $item) {
            if ($item === '.' || $item === '..') {
                continue;
            }
            $fullPath = $dir . DIRECTORY_SEPARATOR . $item;
            if (is_dir($fullPath) && !is_link($fullPath)) {
                pdfstudio_delete_dir_recursive($fullPath);
            } else {
                @unlink($fullPath);
            }
        }
    }
    return @rmdir($dir);
}

/**
 * Load shares database
 */
function pdfstudio_load_shares_db()
{
    pdfstudio_init_account_storage();
    $raw = @file_get_contents(PDFSTUDIO_SHARES_FILE);
    if (!$raw) {
        return array('shares' => array());
    }
    $decoded = @json_decode($raw, true);
    if (!is_array($decoded) || !isset($decoded['shares']) || !is_array($decoded['shares'])) {
        return array('shares' => array());
    }
    return $decoded;
}

/**
 * Save shares database
 */
function pdfstudio_save_shares_db($db)
{
    pdfstudio_init_account_storage();
    $flags = defined('JSON_PRETTY_PRINT') ? JSON_PRETTY_PRINT : 0;
    return @file_put_contents(PDFSTUDIO_SHARES_FILE, json_encode($db, $flags), LOCK_EX) !== false;
}

/**
 * Archive an existing file into the versions/ subfolder before overwriting
 */
function pdfstudio_archive_file_version($workspaceDir, $safeName)
{
    $targetPath = $workspaceDir . DIRECTORY_SEPARATOR . $safeName;
    if (!is_file($targetPath)) {
        return null;
    }

    $verDir = $workspaceDir . DIRECTORY_SEPARATOR . 'versions';
    if (!is_dir($verDir)) {
        @mkdir($verDir, 0755, true);
    }

    // Determine next version number for this file
    $existing = pdfstudio_list_file_versions($workspaceDir, $safeName);
    $nextVerNum = count($existing) + 1;
    $stamp = date('Ymd_His');
    $verFilename = $safeName . '__v' . $nextVerNum . '__' . $stamp . '.pdf';
    $verPath = $verDir . DIRECTORY_SEPARATOR . $verFilename;

    @copy($targetPath, $verPath);

    // Keep at most max_versions_per_file versions per file (configured in config.php)
    $maxVersions = max(1, (int)pdfstudio_config('max_versions_per_file', 15));
    if (count($existing) >= $maxVersions) {
        $oldest = end($existing);
        if ($oldest && isset($oldest['version_file'])) {
            $oldPath = $verDir . DIRECTORY_SEPARATOR . basename($oldest['version_file']);
            if (is_file($oldPath)) {
                @unlink($oldPath);
            }
        }
    }

    return $verFilename;
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
 * List all saved versions for a given filename in workspaceDir
 */
function pdfstudio_list_file_versions($workspaceDir, $safeName)
{
    $versions = array();
    $verDir = $workspaceDir . DIRECTORY_SEPARATOR . 'versions';
    if (!is_dir($verDir)) {
        return $versions;
    }

    $prefix = $safeName . '__v';
    $handle = @opendir($verDir);
    if (!$handle) {
        return $versions;
    }

    while (($entry = readdir($handle)) !== false) {
        if (strpos($entry, $prefix) === 0 && substr($entry, -4) === '.pdf') {
            $full = $verDir . DIRECTORY_SEPARATOR . $entry;
            if (is_file($full)) {
                $mtime = @filemtime($full);
                $size = @filesize($full);
                $verNum = 1;
                if (preg_match('/__v(\d+)__/', $entry, $m)) {
                    $verNum = (int)$m[1];
                }
                $versions[] = array(
                    'version_file' => $entry,
                    'version_num' => $verNum,
                    'label' => 'Version ' . $verNum . ' (' . date('d.m.Y H:i:s', $mtime) . ')',
                    'modified' => date('d.m.Y H:i:s', $mtime),
                    'timestamp' => (int)$mtime,
                    'size' => (int)$size,
                    'size_formatted' => pdfstudio_format_bytes($size)
                );
            }
        }
    }
    closedir($handle);

    usort($versions, 'pdfstudio_sort_files_by_time');
    return $versions;
}

/**
 * Calculate used bytes and configured quota for the logged-in user's vault (returns null for guests)
 */
function pdfstudio_get_workspace_quota_info($workspaceDir = null)
{
    $user = pdfstudio_get_current_user();
    if (!$user) {
        return null;
    }
    if ($workspaceDir === null) {
        $workspaceDir = pdfstudio_get_workspace_dir();
    }
    if (!$workspaceDir) {
        return null;
    }
    $quotaMb = (float)pdfstudio_config('user_quota_mb', 250);
    $quotaBytes = $quotaMb > 0 ? (int)round($quotaMb * 1048576) : 0;
    $includeVersions = (bool)pdfstudio_config('include_versions_in_quota', true);

    $usedBytes = 0;
    if (is_dir($workspaceDir)) {
        $handle = @opendir($workspaceDir);
        if ($handle) {
            while (($entry = readdir($handle)) !== false) {
                if ($entry === '.' || $entry === '..' || $entry === '.htaccess' || $entry === 'index.html' || $entry === 'users.json' || $entry === 'shares.json' || $entry === 'mail_outbox.log') {
                    continue;
                }
                $full = $workspaceDir . DIRECTORY_SEPARATOR . $entry;
                if (is_file($full)) {
                    $isPdf = (strtolower(substr($entry, -4)) === '.pdf');
                    $isSidecar = (substr($entry, -4) === '.raw' || substr($entry, -10) === '.proj.json');
                    if ($isPdf || ($includeVersions && $isSidecar)) {
                        $usedBytes += (int)@filesize($full);
                    }
                }
            }
            closedir($handle);
        }

        if ($includeVersions) {
            $verDir = $workspaceDir . DIRECTORY_SEPARATOR . 'versions';
            if (is_dir($verDir)) {
                $vh = @opendir($verDir);
                if ($vh) {
                    while (($vEntry = readdir($vh)) !== false) {
                        if ($vEntry === '.' || $vEntry === '..') continue;
                        $vFull = $verDir . DIRECTORY_SEPARATOR . $vEntry;
                        if (is_file($vFull)) {
                            $usedBytes += (int)@filesize($vFull);
                        }
                    }
                    closedir($vh);
                }
            }
        }
    }

    $percent = 0;
    if ($quotaBytes > 0) {
        $percent = min(100, round(($usedBytes / $quotaBytes) * 100, 1));
    }

    return array(
        'used_bytes' => $usedBytes,
        'used_formatted' => pdfstudio_format_bytes($usedBytes),
        'quota_mb' => $quotaMb,
        'quota_bytes' => $quotaBytes,
        'quota_formatted' => $quotaBytes > 0 ? pdfstudio_format_bytes($quotaBytes) : 'Unbegrenzt',
        'remaining_bytes' => $quotaBytes > 0 ? max(0, $quotaBytes - $usedBytes) : -1,
        'percent' => $percent
    );
}

/**
 * Helper to read a complete response from an SMTP socket (PHP 5.4+ compatible)
 */
function pdfstudio_smtp_read($fp)
{
    $data = '';
    while ($str = @fgets($fp, 515)) {
        $data .= $str;
        if (substr($str, 3, 1) === ' ') {
            break;
        }
    }
    return $data;
}

/**
 * Helper to send a command to an SMTP socket and check expected 3-digit status code
 */
function pdfstudio_smtp_cmd($fp, $cmd, $expectedCodes)
{
    if ($cmd !== null) {
        @fwrite($fp, $cmd . "\r\n");
    }
    $resp = pdfstudio_smtp_read($fp);
    $code = (int)substr($resp, 0, 3);
    if (!in_array($code, (array)$expectedCodes, true)) {
        return array('ok' => false, 'code' => $code, 'response' => trim($resp));
    }
    return array('ok' => true, 'code' => $code, 'response' => trim($resp));
}

/**
 * Send email using the administrator settings in config.php (Direct SMTP socket or PHP mail())
 */
function pdfstudio_send_email($toEmail, $subject, $bodyText, $replyToEmail = '')
{
    // Strip any CR/LF characters to prevent SMTP command or header injection
    $toEmail = str_replace(array("\r", "\n", "\0", '<', '>'), '', trim((string)$toEmail));
    $replyToEmail = str_replace(array("\r", "\n", "\0", '<', '>'), '', trim((string)$replyToEmail));
    $subject = str_replace(array("\r", "\n", "\0"), ' ', trim((string)$subject));

    $transport = strtolower(trim((string)pdfstudio_config('mail_transport', 'smtp')));
    $fromAddr = str_replace(array("\r", "\n", "\0", '<', '>'), '', trim((string)pdfstudio_config('mail_from_address', 'noreply@pdf-werkstatt.local')));
    $fromName = str_replace(array("\r", "\n", "\0"), ' ', trim((string)pdfstudio_config('mail_from_name', 'PDF-Werkstatt Pro')));
    if ($fromAddr === '') {
        $fromAddr = 'noreply@' . (isset($_SERVER['HTTP_HOST']) ? preg_replace('/[^a-zA-Z0-9\.\-]/', '', $_SERVER['HTTP_HOST']) : 'localhost');
    }
    if ($replyToEmail === '' || strpos($replyToEmail, '@') === false) {
        $replyToEmail = $fromAddr;
    }

    $smtpHost = trim((string)pdfstudio_config('smtp_host', ''));
    $smtpPort = (int)pdfstudio_config('smtp_port', 587);
    $smtpEnc = strtolower(trim((string)pdfstudio_config('smtp_encryption', 'tls')));
    $smtpAuth = (bool)pdfstudio_config('smtp_auth', true);
    $smtpUser = (string)pdfstudio_config('smtp_username', '');
    $smtpPass = (string)pdfstudio_config('smtp_password', '');
    $smtpTimeout = max(3, (int)pdfstudio_config('smtp_timeout', 10));

    $encodedSubject = '=?UTF-8?B?' . base64_encode($subject) . '?=';
    $encodedFromName = '=?UTF-8?B?' . base64_encode($fromName) . '?=';
    $fromHeader = $encodedFromName . ' <' . $fromAddr . '>';

    $sent = false;
    $methodUsed = 'mail';
    $errorMsg = '';

    // 1. Direct SMTP socket delivery if smtp_host is configured in config.php
    if ($transport === 'smtp' && $smtpHost !== '') {
        $methodUsed = 'smtp';
        $remote = ($smtpEnc === 'ssl' ? 'ssl://' : '') . $smtpHost;
        $errno = 0;
        $errstr = '';
        $fp = @fsockopen($remote, $smtpPort, $errno, $errstr, $smtpTimeout);

        if (!$fp) {
            $errorMsg = 'SMTP-Verbindung fehlgeschlagen (' . $smtpHost . ':' . $smtpPort . '): ' . $errstr;
        } else {
            @stream_set_timeout($fp, $smtpTimeout);
            $greet = pdfstudio_smtp_cmd($fp, null, array(220));
            $ehloHost = isset($_SERVER['HTTP_HOST']) ? $_SERVER['HTTP_HOST'] : 'localhost';
            $ehlo = $greet['ok'] ? pdfstudio_smtp_cmd($fp, 'EHLO ' . $ehloHost, array(250)) : $greet;

            if ($ehlo['ok'] && $smtpEnc === 'tls') {
                $tlsRes = pdfstudio_smtp_cmd($fp, 'STARTTLS', array(220));
                if ($tlsRes['ok'] && function_exists('stream_socket_enable_crypto')) {
                    $cryptoMethod = defined('STREAM_CRYPTO_METHOD_TLS_CLIENT') ? STREAM_CRYPTO_METHOD_TLS_CLIENT : 1;
                    $cryptoOk = @stream_socket_enable_crypto($fp, true, $cryptoMethod);
                    if (!$cryptoOk) {
                        $ehlo = array('ok' => false, 'response' => 'STARTTLS-Verschluesselung konnte nicht aktiviert werden.');
                    } else {
                        $ehlo = pdfstudio_smtp_cmd($fp, 'EHLO ' . $ehloHost, array(250));
                    }
                } else {
                    $ehlo = $tlsRes;
                }
            }

            if ($ehlo['ok'] && $smtpAuth && $smtpUser !== '') {
                $authStart = pdfstudio_smtp_cmd($fp, 'AUTH LOGIN', array(334));
                if ($authStart['ok']) {
                    $uRes = pdfstudio_smtp_cmd($fp, base64_encode($smtpUser), array(334));
                    if ($uRes['ok']) {
                        $pRes = pdfstudio_smtp_cmd($fp, base64_encode($smtpPass), array(235));
                        if (!$pRes['ok']) {
                            $ehlo = $pRes;
                        }
                    } else {
                        $ehlo = $uRes;
                    }
                } else {
                    $ehlo = $authStart;
                }
            }

            if ($ehlo['ok']) {
                $mFrom = pdfstudio_smtp_cmd($fp, 'MAIL FROM:<' . $fromAddr . '>', array(250));
                $rTo = $mFrom['ok'] ? pdfstudio_smtp_cmd($fp, 'RCPT TO:<' . $toEmail . '>', array(250, 251)) : $mFrom;
                $dataCmd = $rTo['ok'] ? pdfstudio_smtp_cmd($fp, 'DATA', array(354)) : $rTo;

                if ($dataCmd['ok']) {
                    // Dot-stuff lines starting with '.'
                    $normBody = str_replace(array("\r\n", "\r"), "\n", $bodyText);
                    $lines = explode("\n", $normBody);
                    $escapedLines = array();
                    foreach ($lines as $ln) {
                        if ( isset($ln[0]) && $ln[0] === '.' ) {
                            $ln = '.' . $ln;
                        }
                        $escapedLines[] = $ln;
                    }

                    $msgData = "Date: " . date('r') . "\r\n"
                             . "From: " . $fromHeader . "\r\n"
                             . "Reply-To: <" . $replyToEmail . ">\r\n"
                             . "To: <" . $toEmail . ">\r\n"
                             . "Subject: " . $encodedSubject . "\r\n"
                             . "MIME-Version: 1.0\r\n"
                             . "Content-Type: text/plain; charset=UTF-8\r\n"
                             . "Content-Transfer-Encoding: 8bit\r\n"
                             . "\r\n"
                             . implode("\r\n", $escapedLines) . "\r\n.";

                    $sendRes = pdfstudio_smtp_cmd($fp, $msgData, array(250));
                    if ($sendRes['ok']) {
                        $sent = true;
                    } else {
                        $errorMsg = 'SMTP DATA Fehler: ' . $sendRes['response'];
                    }
                } else {
                    $errorMsg = 'SMTP Adress-Fehler: ' . $dataCmd['response'];
                }
            } else {
                $errorMsg = 'SMTP Handshake/Auth-Fehler: ' . $ehlo['response'];
            }

            @fwrite($fp, "QUIT\r\n");
            @fclose($fp);
        }
    } else {
        // 2. Native PHP mail() delivery using mail_from_address from config.php
        $headers = "MIME-Version: 1.0\r\n"
                 . "Content-Type: text/plain; charset=UTF-8\r\n"
                 . "From: " . $fromHeader . "\r\n"
                 . "Reply-To: " . $replyToEmail . "\r\n";
        if (function_exists('mail')) {
            $sent = @mail($toEmail, $encodedSubject, $bodyText, $headers);
        }
    }

    $logEntry = "[" . date('Y-m-d H:i:s') . "] METHOD: " . strtoupper($methodUsed)
              . " | FROM: " . $fromAddr
              . " | TO: " . $toEmail
              . " | SUBJECT: " . $subject
              . " | STATUS: " . ($sent ? 'SENT' : 'FALLBACK (' . $errorMsg . ')') . "\n";
    @file_put_contents(PDFSTUDIO_STORAGE . DIRECTORY_SEPARATOR . 'mail_outbox.log', $logEntry, FILE_APPEND);

    return array(
        'sent' => $sent,
        'method' => $methodUsed,
        'from_address' => $fromAddr,
        'from_name' => $fromName,
        'error' => $errorMsg
    );
}

/**
 * Default catalog of tracked tool/feature events with human-readable German labels
 */
function pdfstudio_get_stat_event_labels()
{
    return array(
        'pdf_opened'          => 'PDF-Dokumente lokal geoeffnet',
        'pdf_exported'        => 'Fertige PDFs heruntergeladen / gespeichert',
        'vault_saved'         => 'Im Tresor gespeichert (Projekt & PDF)',
        'vault_loaded'        => 'Aus dem Tresor geladen & weiterbearbeitet',
        'text_edited_inline'  => 'Originaltext im PDF direkt umgeschrieben (I-Edit)',
        'pdf_merged'          => 'PDFs zusammengefuegt (Merge)',
        'pdf_split'           => 'PDF geteilt / Seiten extrahiert (Split)',
        'pdf_compressed'      => 'PDF komprimiert (Dateigroesse reduziert)',
        'ocr_searchable_pdf'  => 'In durchsuchbares PDF umgewandelt (Sandwich-OCR)',
        'ocr_page_text'       => 'OCR-Texterkennung (Einzelseite)',
        'a11y_checked'        => 'Barrierefreiheits-Pruefung (PDF/UA & BITV)',
        'a11y_autofix'        => 'Barrierefreiheit Auto-Fix (PDF/UA Reparatur)',
        'signature_applied'   => 'Unterschrift / Signatur eingefuegt',
        'redaction_sanitized' => 'Sicher geschwaerzt (Sanitize)',
        'bates_header_footer' => 'Bates-Nummerierung / Kopf- & Fusszeilen',
        'pdf_compared'        => 'PDF-Vergleich (Visueller & Text-Diff)',
        'email_shared'        => 'Dokument per E-Mail-Freigabelink geteilt',
        'converter_used'      => 'Konverter genutzt (Bilder/Office/Text -> PDF)'
    );
}

/**
 * Load usage statistics from storage/nutzungsstatistik.json
 */
function pdfstudio_load_stats()
{
    $now = date('d.m.Y H:i:s');
    $defaults = array(
        'created_at'           => $now,
        'updated_at'           => $now,
        'total_sessions'       => 0,
        'total_pageviews'      => 0,
        'help_pageviews'       => 0,
        'total_logins'         => 0,
        'failed_logins'        => 0,
        'total_registrations'  => 0,
        'password_resets'      => 0,
        'total_tool_actions'   => 0,
        'events'               => array(),
        'daily'                => array(),
        'monthly'              => array()
    );

    foreach (pdfstudio_get_stat_event_labels() as $k => $label) {
        $defaults['events'][$k] = 0;
    }

    if (!is_file(PDFSTUDIO_STATS_JSON)) {
        return $defaults;
    }

    $raw = @file_get_contents(PDFSTUDIO_STATS_JSON);
    $decoded = $raw ? @json_decode($raw, true) : null;
    if (!is_array($decoded)) {
        return $defaults;
    }

    foreach ($defaults as $k => $v) {
        if (!isset($decoded[$k])) {
            $decoded[$k] = $v;
        }
    }
    if (!is_array($decoded['events'])) {
        $decoded['events'] = array();
    }
    foreach (pdfstudio_get_stat_event_labels() as $ek => $elabel) {
        if (!isset($decoded['events'][$ek])) {
            $decoded['events'][$ek] = 0;
        }
    }

    return $decoded;
}

/**
 * Record a usage statistic counter and regenerate storage/nutzungsstatistik.json + storage/nutzungsstatistik.txt
 */
function pdfstudio_record_stat($type, $eventKey = null)
{
    $stats = pdfstudio_load_stats();
    $stats['updated_at'] = date('d.m.Y H:i:s');
    $today = date('Y-m-d');
    $month = date('Y-m');

    if (!isset($stats['daily'][$today]) || !is_array($stats['daily'][$today])) {
        $stats['daily'][$today] = array(
            'sessions' => 0,
            'pageviews' => 0,
            'logins' => 0,
            'tool_actions' => 0
        );
    }
    if (!isset($stats['monthly'][$month]) || !is_array($stats['monthly'][$month])) {
        $stats['monthly'][$month] = array(
            'sessions' => 0,
            'pageviews' => 0,
            'logins' => 0,
            'tool_actions' => 0
        );
    }

    if ($type === 'pageview') {
        $stats['total_pageviews']++;
        $stats['daily'][$today]['pageviews']++;
        $stats['monthly'][$month]['pageviews']++;
        if (empty($_SESSION['pdfstudio_stat_session_counted'])) {
            $_SESSION['pdfstudio_stat_session_counted'] = 1;
            $stats['total_sessions']++;
            $stats['daily'][$today]['sessions']++;
            $stats['monthly'][$month]['sessions']++;
        }
    } elseif ($type === 'help_view') {
        $stats['help_pageviews']++;
    } elseif ($type === 'login_success') {
        $stats['total_logins']++;
        $stats['daily'][$today]['logins']++;
        $stats['monthly'][$month]['logins']++;
    } elseif ($type === 'login_failed') {
        $stats['failed_logins']++;
    } elseif ($type === 'register') {
        $stats['total_registrations']++;
        $stats['total_logins']++;
        $stats['daily'][$today]['logins']++;
        $stats['monthly'][$month]['logins']++;
    } elseif ($type === 'password_reset') {
        $stats['password_resets']++;
    } elseif ($type === 'tool' && $eventKey !== null) {
        $labels = pdfstudio_get_stat_event_labels();
        if (isset($labels[$eventKey])) {
            $stats['events'][$eventKey] = (isset($stats['events'][$eventKey]) ? (int)$stats['events'][$eventKey] : 0) + 1;
            $stats['total_tool_actions']++;
            $stats['daily'][$today]['tool_actions']++;
            $stats['monthly'][$month]['tool_actions']++;
        }
    }

    // Keep at most the last 90 days in daily history
    if (count($stats['daily']) > 90) {
        ksort($stats['daily']);
        $stats['daily'] = array_slice($stats['daily'], -90, 90, true);
    }

    pdfstudio_save_stats_and_report($stats);
}

/**
 * Save structured JSON stats and write the formatted human-readable administrator report (storage/nutzungsstatistik.txt)
 */
function pdfstudio_save_stats_and_report($stats)
{
    $db = pdfstudio_load_users_db();
    $users = isset($db['users']) && is_array($db['users']) ? $db['users'] : array();
    $sharesDb = pdfstudio_load_shares_db();
    $sharesCount = isset($sharesDb['shares']) && is_array($sharesDb['shares']) ? count($sharesDb['shares']) : 0;

    $totalVaultFiles = 0;
    $totalVaultBytes = 0;
    $sumUserLogins = 0;
    $userSummaries = array();

    foreach ($users as $u) {
        $uid = isset($u['id']) ? preg_replace('/[^a-zA-Z0-9_\-]/', '', $u['id']) : '';
        $uDir = $uid !== '' ? (PDFSTUDIO_USERS_DIR . DIRECTORY_SEPARATOR . $uid) : '';
        $uFiles = 0;
        $uBytes = 0;
        if ($uDir !== '' && is_dir($uDir)) {
            $h = @opendir($uDir);
            if ($h) {
                while (($e = readdir($h)) !== false) {
                    if ($e === '.' || $e === '..') continue;
                    $fp = $uDir . DIRECTORY_SEPARATOR . $e;
                    if (is_file($fp)) {
                        $uBytes += (int)@filesize($fp);
                        if (strtolower(substr($e, -4)) === '.pdf') {
                            $uFiles++;
                        }
                    }
                }
                closedir($h);
            }
            $vDir = $uDir . DIRECTORY_SEPARATOR . 'versions';
            if (is_dir($vDir)) {
                $vh = @opendir($vDir);
                if ($vh) {
                    while (($ve = readdir($vh)) !== false) {
                        if ($ve === '.' || $ve === '..') continue;
                        $vfp = $vDir . DIRECTORY_SEPARATOR . $ve;
                        if (is_file($vfp)) {
                            $uBytes += (int)@filesize($vfp);
                        }
                    }
                    closedir($vh);
                }
            }
        }
        $totalVaultFiles += $uFiles;
        $totalVaultBytes += $uBytes;

        $org = (isset($u['profile']['organization']) && $u['profile']['organization'] !== '') ? $u['profile']['organization'] : '—';
        $lastLogin = isset($u['last_login']) ? $u['last_login'] : (isset($u['created_at']) ? $u['created_at'] : '—');
        $loginCnt = isset($u['login_count']) ? (int)$u['login_count'] : 1;
        $sumUserLogins += $loginCnt;

        $userSummaries[] = array(
            'username'     => isset($u['username']) ? $u['username'] : '?',
            'display_name' => isset($u['display_name']) ? $u['display_name'] : '',
            'organization' => $org,
            'created_at'   => isset($u['created_at']) ? $u['created_at'] : '—',
            'last_login'   => $lastLogin,
            'login_count'  => $loginCnt,
            'vault_files'  => $uFiles,
            'vault_size'   => pdfstudio_format_bytes($uBytes)
        );
    }

    if ((int)$stats['total_registrations'] < count($users)) {
        $stats['total_registrations'] = count($users);
    }
    if ((int)$stats['total_logins'] < $sumUserLogins) {
        $stats['total_logins'] = $sumUserLogins;
    }
    $stats['registered_accounts_count'] = count($users);
    $stats['active_shares_count'] = $sharesCount;
    $stats['total_vault_files'] = $totalVaultFiles;
    $stats['total_vault_bytes'] = $totalVaultBytes;
    $stats['total_vault_size_formatted'] = pdfstudio_format_bytes($totalVaultBytes);

    $flags = defined('JSON_PRETTY_PRINT') ? JSON_PRETTY_PRINT : 0;
    @file_put_contents(PDFSTUDIO_STATS_JSON, json_encode($stats, $flags), LOCK_EX);

    // Build human-readable German text report for the administrator
    $lines = array();
    $lines[] = '================================================================================';
    $lines[] = ' PDF-Werkstatt Pro (Version ' . PDFSTUDIO_VERSION . ') — ADMINISTRATOR-NUTZUNGSSTATISTIK';
    $lines[] = '================================================================================';
    $lines[] = ' Stand der Auswertung   : ' . $stats['updated_at'];
    $lines[] = ' Erfassung gestartet am : ' . $stats['created_at'];
    $lines[] = '================================================================================';
    $lines[] = '';
    $lines[] = '1. BENUTZERKONTEN & ANMELDUNGEN (PERSONEN-STATISTIK)';
    $lines[] = '--------------------------------------------------------------------------------';
    $lines[] = sprintf(' %-42s : %d Personen', 'Registrierte Kontoinhaber aktuell', count($users));
    $lines[] = sprintf(' %-42s : %d', 'Konto-Neuregistrierungen gesamt', (int)$stats['total_registrations']);
    $lines[] = sprintf(' %-42s : %d', 'Erfolgreiche Anmeldungen (Logins)', (int)$stats['total_logins']);
    $lines[] = sprintf(' %-42s : %d', 'Fehlgeschlagene Anmeldeversuche', (int)$stats['failed_logins']);
    $lines[] = sprintf(' %-42s : %d', 'Passwort-Zuruecksetzungen', (int)$stats['password_resets']);
    $lines[] = sprintf(' %-42s : %d Dateien (%s)', 'Gespeicherte Dokumente im Tresor', $totalVaultFiles, pdfstudio_format_bytes($totalVaultBytes));
    $lines[] = sprintf(' %-42s : %d', 'Aktive E-Mail-Freigabelinks', $sharesCount);
    $lines[] = '';

    if (count($userSummaries) > 0) {
        $lines[] = ' Uebersicht der registrierten Kontoinhaber:';
        foreach ($userSummaries as $idx => $us) {
            $lines[] = sprintf(
                '  %2d. %-16s (%s | %s) | Registriert: %s | Letzter Login: %s | Logins: %d | Tresor: %d PDF(s) (%s)',
                $idx + 1,
                $us['username'],
                $us['display_name'],
                $us['organization'],
                $us['created_at'],
                $us['last_login'],
                $us['login_count'],
                $us['vault_files'],
                $us['vault_size']
            );
        }
    } else {
        $lines[] = ' (Noch keine registrierten Benutzerkonten vorhanden)';
    }

    $lines[] = '';
    $lines[] = '2. ALLGEMEINE PROGRAMMNUTZUNG & AUFRUFE';
    $lines[] = '--------------------------------------------------------------------------------';
    $lines[] = sprintf(' %-42s : %d', 'Programm-Sitzungen (Besuche)', (int)$stats['total_sessions']);
    $lines[] = sprintf(' %-42s : %d', 'Seitenaufrufe Hauptanwendung (index.php)', (int)$stats['total_pageviews']);
    $lines[] = sprintf(' %-42s : %d', 'Aufrufe Benutzerhandbuch (hilfe.php)', (int)$stats['help_pageviews']);
    $lines[] = sprintf(' %-42s : %d', 'Ausgefuehrte PDF-Werkzeug-Aktionen', (int)$stats['total_tool_actions']);
    $lines[] = '';
    $lines[] = '3. GENUTZTE PDF-WERKZEUGE & FUNKTIONEN IM DETAIL';
    $lines[] = '--------------------------------------------------------------------------------';

    $labels = pdfstudio_get_stat_event_labels();
    foreach ($labels as $ek => $elabel) {
        $cnt = isset($stats['events'][$ek]) ? (int)$stats['events'][$ek] : 0;
        $lines[] = sprintf(' %-46s : %d', '- ' . $elabel, $cnt);
    }

    $lines[] = '';
    $lines[] = '4. MONATSUEBERSICHT (YYYY-MM)';
    $lines[] = '--------------------------------------------------------------------------------';
    if (!empty($stats['monthly']) && is_array($stats['monthly'])) {
        $months = $stats['monthly'];
        krsort($months);
        foreach ($months as $ym => $mData) {
            $lines[] = sprintf(
                ' - %s : %4d Sitzungen | %4d Seitenaufrufe | %4d Logins | %4d Werkzeug-Aktionen',
                $ym,
                isset($mData['sessions']) ? (int)$mData['sessions'] : 0,
                isset($mData['pageviews']) ? (int)$mData['pageviews'] : 0,
                isset($mData['logins']) ? (int)$mData['logins'] : 0,
                isset($mData['tool_actions']) ? (int)$mData['tool_actions'] : 0
            );
        }
    }

    $lines[] = '';
    $lines[] = '5. TAGESVERLAUF (LETZTE 30 TAGE)';
    $lines[] = '--------------------------------------------------------------------------------';
    if (!empty($stats['daily']) && is_array($stats['daily'])) {
        $days = $stats['daily'];
        krsort($days);
        $dayCount = 0;
        foreach ($days as $ymd => $dData) {
            $lines[] = sprintf(
                ' - %s : %4d Sitzungen | %4d Seitenaufrufe | %4d Logins | %4d Werkzeug-Aktionen',
                $ymd,
                isset($dData['sessions']) ? (int)$dData['sessions'] : 0,
                isset($dData['pageviews']) ? (int)$dData['pageviews'] : 0,
                isset($dData['logins']) ? (int)$dData['logins'] : 0,
                isset($dData['tool_actions']) ? (int)$dData['tool_actions'] : 0
            );
            $dayCount++;
            if ($dayCount >= 30) break;
        }
    }
    $lines[] = '================================================================================';
    $lines[] = '';

    @file_put_contents(PDFSTUDIO_STATS_TXT, implode("\r\n", $lines), LOCK_EX);
}
