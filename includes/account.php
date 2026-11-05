<?php
/**
 * PDF-Werkstatt Pro - Optional User Account, Vault, Versioning & Email Share System
 * 100% File-based in storage/ (Zero-Config, Compatible with PHP 5.4.0 through PHP 8.4+)
 */

if (!defined('PDFSTUDIO_INIT')) {
    exit('Direct access not permitted.');
}

define('PDFSTUDIO_USERS_FILE', PDFSTUDIO_STORAGE . DIRECTORY_SEPARATOR . 'users.json.php');
define('PDFSTUDIO_SHARES_FILE', PDFSTUDIO_STORAGE . DIRECTORY_SEPARATOR . 'shares.json.php');
define('PDFSTUDIO_RATELIMIT_FILE', PDFSTUDIO_STORAGE . DIRECTORY_SEPARATOR . 'ratelimit.json.php');
define('PDFSTUDIO_USERS_DIR', PDFSTUDIO_STORAGE . DIRECTORY_SEPARATOR . 'users');
define('PDFSTUDIO_PUBLIC_DIR', PDFSTUDIO_STORAGE . DIRECTORY_SEPARATOR . 'public');
define('PDFSTUDIO_STATS_JSON', PDFSTUDIO_STORAGE . DIRECTORY_SEPARATOR . 'nutzungsstatistik.json.php');
define('PDFSTUDIO_STATS_TXT', PDFSTUDIO_STORAGE . DIRECTORY_SEPARATOR . 'nutzungsstatistik.txt.php');
define('PDFSTUDIO_MAIL_LOG_FILE', PDFSTUDIO_STORAGE . DIRECTORY_SEPARATOR . 'mail_outbox.log.php');
define('PDFSTUDIO_SECRET_KEY_FILE', PDFSTUDIO_STORAGE . DIRECTORY_SEPARATOR . '.secret_key.php');
define('PDFSTUDIO_ADMIN_SETTINGS_FILE', PDFSTUDIO_STORAGE . DIRECTORY_SEPARATOR . 'admin_settings.json.php');
define('PDFSTUDIO_GATEKEEPER_USERS_FILE', PDFSTUDIO_STORAGE . DIRECTORY_SEPARATOR . 'gatekeeper_users.json.php');

/**
 * PHP-exit guard header prepended to all files in storage/ so direct HTTP requests on Nginx/Apache/IIS return 403 Forbidden
 */
function pdfstudio_storage_guard_header()
{
    return "<?php if (function_exists('http_response_code')) { http_response_code(403); } exit('403 Forbidden'); ?>\n";
}

/**
 * Resolve persistent fallback storage path in /var/tmp or sys_get_temp_dir()
 * Used automatically if the primary storage/ directory is owned by root and not writable by the webserver user (www-data)
 */
function pdfstudio_storage_fallback_path($path)
{
    $baseName = basename((string)$path);
    $instHash = substr(md5(defined('PDFSTUDIO_ROOT') ? PDFSTUDIO_ROOT : __DIR__), 0, 12);
    $candidates = array('/var/tmp', @sys_get_temp_dir());
    foreach ($candidates as $baseDir) {
        $baseDir = rtrim((string)$baseDir, '/\\');
        if ($baseDir !== '' && @is_dir($baseDir) && @is_writable($baseDir)) {
            $dir = $baseDir . DIRECTORY_SEPARATOR . 'pdfstudio_storage_' . $instHash;
            if (!@is_dir($dir)) {
                @mkdir($dir, 0700, true);
            }
            if (@is_dir($dir) && @is_writable($dir)) {
                return $dir . DIRECTORY_SEPARATOR . $baseName;
            }
        }
    }
    return '';
}

/**
 * Strip PHP-exit guard line from raw file content
 */
function pdfstudio_storage_strip_guard($raw)
{
    if (!is_string($raw)) {
        return false;
    }
    if (strncmp($raw, "\xEF\xBB\xBF", 3) === 0) {
        $raw = substr($raw, 3);
    }
    if (strncmp($raw, '<?php', 5) === 0) {
        $nlPos = strpos($raw, "\n");
        if ($nlPos !== false) {
            return trim(substr($raw, $nlPos + 1), "\r\n");
        }
        return '';
    }
    return $raw;
}

/**
 * Check if a PHP-guarded storage file (or its legacy / fallback counterpart) exists
 */
function pdfstudio_storage_exists($path)
{
    if (is_file($path) && is_readable($path)) {
        return true;
    }
    $legacy = preg_replace('/\.php$/', '', (string)$path);
    if ($legacy !== $path && is_file($legacy) && is_readable($legacy)) {
        return true;
    }
    $fb = pdfstudio_storage_fallback_path($path);
    if ($fb !== '' && is_file($fb) && is_readable($fb)) {
        return true;
    }
    return false;
}

/**
 * Read a PHP-guarded storage file (supports primary storage/, legacy .json migration, and fallback directory)
 */
function pdfstudio_storage_read($path)
{
    @clearstatcache(true, (string)$path);
    $legacy = preg_replace('/\.php$/', '', (string)$path);
    $fb = pdfstudio_storage_fallback_path($path);
    if ($fb !== '') {
        @clearstatcache(true, $fb);
    }

    // 1. If a fallback file exists and is newer than (or replaces an unwritable) primary file, prefer it
    if ($fb !== '' && is_file($fb) && is_readable($fb)) {
        $useFallback = false;
        if (!is_file($path) || !is_readable($path)) {
            $useFallback = true;
        } else {
            $fbMtime = (int)@filemtime($fb);
            $pMtime  = (int)@filemtime($path);
            if ($fbMtime >= $pMtime) {
                $useFallback = true;
            }
        }
        if ($useFallback) {
            $fbRaw = @file_get_contents($fb);
            if ($fbRaw !== false && strlen(trim($fbRaw)) > 0) {
                return pdfstudio_storage_strip_guard($fbRaw);
            }
        }
    }

    // 2. Migrate legacy unguarded file (.json / .txt / .log) if primary .php file does not exist yet
    if (!is_file($path) && $legacy !== $path && is_file($legacy) && is_readable($legacy)) {
        $legacyRaw = @file_get_contents($legacy);
        if ($legacyRaw !== false) {
            $cleanLegacy = pdfstudio_storage_strip_guard($legacyRaw);
            if (pdfstudio_storage_write($path, $cleanLegacy, false)) {
                if (is_file($path) && @filesize($path) > 0) {
                    @unlink($legacy);
                }
            }
            return $cleanLegacy;
        }
    }

    // 3. Read primary PHP-guarded file
    if (is_file($path) && is_readable($path)) {
        $raw = @file_get_contents($path);
        if ($raw !== false) {
            $stripped = pdfstudio_storage_strip_guard($raw);
            if ($stripped !== '' || $legacy === $path || !is_file($legacy)) {
                if ($legacy !== $path && is_file($legacy) && strlen($stripped) > 2) {
                    @unlink($legacy);
                }
                return $stripped;
            }
        }
    }

    // 4. Last-resort fallback to legacy file if primary could not be read
    if ($legacy !== $path && is_file($legacy) && is_readable($legacy)) {
        $legacyRaw = @file_get_contents($legacy);
        if ($legacyRaw !== false) {
            return pdfstudio_storage_strip_guard($legacyRaw);
        }
    }

    // 5. Last-resort fallback to temp storage directory
    if ($fb !== '' && is_file($fb) && is_readable($fb)) {
        $fbRaw = @file_get_contents($fb);
        if ($fbRaw !== false) {
            return pdfstudio_storage_strip_guard($fbRaw);
        }
    }

    return false;
}

/**
 * Helper to write content to a specific file path (with atomic rename, unlink recovery, and LOCK_EX fallback)
 */
function pdfstudio_storage_write_single($targetPath, $fullPayload, $rawAppendContent, $append = false)
{
    $dir = dirname($targetPath);
    if (!is_dir($dir)) {
        @mkdir($dir, 0775, true);
    }
    if (is_dir($dir) && !is_writable($dir)) {
        @chmod($dir, 0775);
    }

    if ($append && is_file($targetPath)) {
        if (!is_writable($targetPath)) {
            @chmod($targetPath, 0664);
        }
        $res = @file_put_contents($targetPath, (string)$rawAppendContent, FILE_APPEND | LOCK_EX);
        if ($res === false) {
            $res = @file_put_contents($targetPath, (string)$rawAppendContent, FILE_APPEND);
        }
        @clearstatcache(true, $targetPath);
        return $res !== false;
    }

    // Atomic write via temp file in same directory (also replaces root-owned 0600/0644 files if directory is writable!)
    $tmpFile = $targetPath . '.tmp.' . uniqid(mt_rand(), true);
    $written = @file_put_contents($tmpFile, $fullPayload, LOCK_EX);
    if ($written === false) {
        $written = @file_put_contents($tmpFile, $fullPayload);
    }
    if ($written !== false && is_file($tmpFile) && @filesize($tmpFile) > 0) {
        @chmod($tmpFile, 0660);
        if (@rename($tmpFile, $targetPath)) {
            @clearstatcache(true, $targetPath);
            return true;
        }
        @unlink($targetPath);
        if (@rename($tmpFile, $targetPath)) {
            @clearstatcache(true, $targetPath);
            return true;
        }
        @unlink($tmpFile);
    } else {
        @unlink($tmpFile);
    }

    // Direct write fallback (if directory is not writable for creating .tmp, but target file itself exists and is writable)
    if (is_file($targetPath) && !is_writable($targetPath)) {
        @chmod($targetPath, 0660);
        if (!is_writable($targetPath)) {
            @unlink($targetPath);
        }
    }
    $res = @file_put_contents($targetPath, $fullPayload, LOCK_EX);
    if ($res === false) {
        $res = @file_put_contents($targetPath, $fullPayload);
    }
    if ($res !== false && is_file($targetPath) && @filesize($targetPath) > 0) {
        @chmod($targetPath, 0660);
        @clearstatcache(true, $targetPath);
        return true;
    }

    return false;
}

/**
 * Write a PHP-guarded storage file (with automatic fallback if storage/ is not writable by webserver user)
 */
function pdfstudio_storage_write($path, $content, $append = false)
{
    $guard = pdfstudio_storage_guard_header();
    $fullPayload = $guard . (string)$content;
    $legacy = preg_replace('/\.php$/', '', (string)$path);
    $fb = pdfstudio_storage_fallback_path($path);

    // 1. Try writing to primary path in storage/
    $okPrimary = pdfstudio_storage_write_single($path, $fullPayload, $content, $append);
    if ($okPrimary) {
        if ($legacy !== $path && is_file($legacy)) {
            @unlink($legacy);
        }
        if ($fb !== '' && is_file($fb)) {
            @unlink($fb);
        }
        return true;
    }

    // 2. If primary .php file could not be created because storage/ dir is 0755, but legacy file exists and is writable
    if ($legacy !== $path && is_file($legacy) && is_writable($legacy)) {
        $okLegacy = pdfstudio_storage_write_single($legacy, (string)$content, $content, $append);
        if ($okLegacy) {
            return true;
        }
    }

    // 3. Automatic persistent fallback in /var/tmp or sys_get_temp_dir() when storage/ is owned by root (0755)
    if ($fb !== '') {
        $okFb = pdfstudio_storage_write_single($fb, $fullPayload, $content, $append);
        if ($okFb) {
            return true;
        }
    }

    return false;
}

/**
 * Get or create the installation-specific 256-bit encryption key for secrets at rest
 */
function pdfstudio_get_encryption_key()
{
    $raw = pdfstudio_storage_read(PDFSTUDIO_SECRET_KEY_FILE);
    $keyHex = $raw !== false ? trim((string)$raw) : '';
    if (strlen($keyHex) < 64) {
        $keyHex = pdfstudio_generate_token(32);
        pdfstudio_storage_write(PDFSTUDIO_SECRET_KEY_FILE, $keyHex);
    }
    return hash('sha256', $keyHex . '|pdf-werkstatt-pro-key', true);
}

/**
 * Encrypt a sensitive string (SMTP password, LDAP bind password, GitHub token) at rest using AES-256-CBC + HMAC-SHA256
 */
function pdfstudio_encrypt_secret($plain)
{
    $plain = (string)$plain;
    if ($plain === '' || strpos($plain, 'ENCv1:') === 0) {
        return $plain;
    }
    if (!function_exists('openssl_encrypt')) {
        return $plain;
    }
    $key = pdfstudio_get_encryption_key();
    $iv  = substr(hash('sha256', pdfstudio_generate_token(16) . microtime(true), true), 0, 16);
    $ct  = @openssl_encrypt($plain, 'AES-256-CBC', $key, OPENSSL_RAW_DATA, $iv);
    if ($ct === false) {
        return $plain;
    }
    $mac = hash_hmac('sha256', $iv . $ct, $key, true);
    return 'ENCv1:' . base64_encode($iv . $mac . $ct);
}

/**
 * Decrypt a sensitive string stored with pdfstudio_encrypt_secret()
 */
function pdfstudio_decrypt_secret($stored)
{
    $stored = (string)$stored;
    if ($stored === '' || strpos($stored, 'ENCv1:') !== 0) {
        return $stored;
    }
    if (!function_exists('openssl_decrypt')) {
        return '';
    }
    $raw = @base64_decode(substr($stored, 6), true);
    if ($raw === false || strlen($raw) <= 48) {
        return '';
    }
    $iv  = substr($raw, 0, 16);
    $mac = substr($raw, 16, 32);
    $ct  = substr($raw, 48);
    $key = pdfstudio_get_encryption_key();
    $calcMac = hash_hmac('sha256', $iv . $ct, $key, true);
    if (!pdfstudio_safe_equals($calcMac, $mac)) {
        return '';
    }
    $pt = @openssl_decrypt($ct, 'AES-256-CBC', $key, OPENSSL_RAW_DATA, $iv);
    return $pt !== false ? $pt : '';
}

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

    if (!pdfstudio_storage_exists(PDFSTUDIO_RATELIMIT_FILE)) {
        return array('allowed' => true, 'remaining' => $maxAttempts, 'retry_after' => 0);
    }

    $raw = pdfstudio_storage_read(PDFSTUDIO_RATELIMIT_FILE);
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

    $raw = pdfstudio_storage_exists(PDFSTUDIO_RATELIMIT_FILE) ? pdfstudio_storage_read(PDFSTUDIO_RATELIMIT_FILE) : '';
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

    pdfstudio_storage_write(PDFSTUDIO_RATELIMIT_FILE, json_encode($data));
}

function pdfstudio_clear_rate_limit($bucket)
{
    if (!pdfstudio_storage_exists(PDFSTUDIO_RATELIMIT_FILE)) {
        return;
    }
    $key = pdfstudio_get_client_ip_key($bucket);
    $raw = pdfstudio_storage_read(PDFSTUDIO_RATELIMIT_FILE);
    $data = $raw ? @json_decode($raw, true) : array();
    if (is_array($data) && isset($data[$key])) {
        unset($data[$key]);
        pdfstudio_storage_write(PDFSTUDIO_RATELIMIT_FILE, json_encode($data));
    }
}

/**
 * Ensure user and share storage directories exist
 */
function pdfstudio_init_account_storage()
{
    if (!is_dir(PDFSTUDIO_USERS_DIR)) {
        @mkdir(PDFSTUDIO_USERS_DIR, 0700, true);
    }
    if (!is_dir(PDFSTUDIO_PUBLIC_DIR)) {
        @mkdir(PDFSTUDIO_PUBLIC_DIR, 0700, true);
    }
    // Automatically migrate any legacy unguarded .json/.txt/.log files in storage/ to .php-guarded files
    $guardedFiles = array(
        PDFSTUDIO_USERS_FILE,
        PDFSTUDIO_SHARES_FILE,
        PDFSTUDIO_RATELIMIT_FILE,
        PDFSTUDIO_STATS_JSON,
        PDFSTUDIO_STATS_TXT,
        PDFSTUDIO_MAIL_LOG_FILE,
        PDFSTUDIO_STORAGE . DIRECTORY_SEPARATOR . 'admin_settings.json.php',
        PDFSTUDIO_STORAGE . DIRECTORY_SEPARATOR . 'gatekeeper_users.json.php'
    );
    foreach ($guardedFiles as $gf) {
        pdfstudio_storage_read($gf);
    }
    if (!pdfstudio_storage_exists(PDFSTUDIO_USERS_FILE)) {
        pdfstudio_storage_write(PDFSTUDIO_USERS_FILE, json_encode(array('users' => array())));
    }
    if (!pdfstudio_storage_exists(PDFSTUDIO_SHARES_FILE)) {
        pdfstudio_storage_write(PDFSTUDIO_SHARES_FILE, json_encode(array('shares' => array())));
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
    $raw = pdfstudio_storage_read(PDFSTUDIO_USERS_FILE);
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
 * Save users database to users.json.php
 */
function pdfstudio_save_users_db($db)
{
    pdfstudio_init_account_storage();
    $flags = defined('JSON_PRETTY_PRINT') ? JSON_PRETTY_PRINT : 0;
    return pdfstudio_storage_write(PDFSTUDIO_USERS_FILE, json_encode($db, $flags));
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
    $raw = pdfstudio_storage_read(PDFSTUDIO_SHARES_FILE);
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
    return pdfstudio_storage_write(PDFSTUDIO_SHARES_FILE, json_encode($db, $flags));
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
    pdfstudio_storage_write(PDFSTUDIO_MAIL_LOG_FILE, $logEntry, true);

    return array(
        'sent' => $sent,
        'method' => $methodUsed,
        'from_address' => $fromAddr,
        'from_name' => $fromName,
        'error' => $errorMsg
    );
}

/**
 * Send an email with a binary PDF attachment (multipart/mixed) via configured SMTP server or PHP mail()
 */
function pdfstudio_send_email_with_pdf($toEmail, $subject, $bodyText, $pdfBinary, $pdfFilename, $replyToEmail = '')
{
    $toEmail = str_replace(array("\r", "\n", "\0", '<', '>'), '', trim((string)$toEmail));
    $replyToEmail = str_replace(array("\r", "\n", "\0", '<', '>'), '', trim((string)$replyToEmail));
    $subject = str_replace(array("\r", "\n", "\0"), ' ', trim((string)$subject));
    $safeName = pdfstudio_sanitize_filename($pdfFilename);

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
    $smtpTimeout = max(3, (int)pdfstudio_config('smtp_timeout', 12));

    $encodedSubject = '=?UTF-8?B?' . base64_encode($subject) . '?=';
    $encodedFromName = '=?UTF-8?B?' . base64_encode($fromName) . '?=';
    $fromHeader = $encodedFromName . ' <' . $fromAddr . '>';

    $boundary = '=_PDFStudio_' . md5(uniqid(mt_rand(), true));
    $normText = str_replace(array("\r\n", "\r"), "\n", (string)$bodyText);
    $normText = str_replace("\n", "\r\n", $normText);

    $mimeBody = "--" . $boundary . "\r\n"
              . "Content-Type: text/plain; charset=UTF-8\r\n"
              . "Content-Transfer-Encoding: 8bit\r\n\r\n"
              . $normText . "\r\n\r\n"
              . "--" . $boundary . "\r\n"
              . "Content-Type: application/pdf; name=\"" . $safeName . "\"\r\n"
              . "Content-Disposition: attachment; filename=\"" . $safeName . "\"\r\n"
              . "Content-Transfer-Encoding: base64\r\n\r\n"
              . chunk_split(base64_encode((string)$pdfBinary), 76, "\r\n")
              . "--" . $boundary . "--";

    $sent = false;
    $methodUsed = 'mail';
    $errorMsg = '';

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
                        $ehlo = array('ok' => false, 'response' => 'STARTTLS-Verschlüsselung konnte nicht aktiviert werden.');
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
                    $lines = explode("\r\n", $mimeBody);
                    $escapedLines = array();
                    foreach ($lines as $ln) {
                        if (isset($ln[0]) && $ln[0] === '.') {
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
                             . "Content-Type: multipart/mixed; boundary=\"" . $boundary . "\"\r\n"
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
        $headers = "MIME-Version: 1.0\r\n"
                 . "From: " . $fromHeader . "\r\n"
                 . "Reply-To: " . $replyToEmail . "\r\n"
                 . "Content-Type: multipart/mixed; boundary=\"" . $boundary . "\"\r\n";
        if (function_exists('mail')) {
            $sent = @mail($toEmail, $encodedSubject, $mimeBody, $headers);
            if (!$sent) {
                $errorMsg = 'PHP mail()-Funktion meldete einen Fehler. Bitte konfigurieren Sie im Adminbereich einen SMTP-Server.';
            }
        } else {
            $errorMsg = 'PHP mail() ist deaktiviert und kein SMTP-Server konfiguriert.';
        }
    }

    $logEntry = "[" . date('Y-m-d H:i:s') . "] METHOD: " . strtoupper($methodUsed)
              . " | FROM: " . $fromAddr
              . " | TO: " . $toEmail
              . " | FILE: " . $safeName . " (" . strlen((string)$pdfBinary) . " B)"
              . " | STATUS: " . ($sent ? 'SENT' : 'ERROR (' . $errorMsg . ')') . "\n";
    pdfstudio_storage_write(PDFSTUDIO_MAIL_LOG_FILE, $logEntry, true);

    return array(
        'sent' => $sent,
        'method' => $methodUsed,
        'from_address' => $fromAddr,
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
        'email_shared'        => 'Dokument direkt per E-Mail versendet',
        'batch_processed'     => 'Stapelverarbeitung (Batch-Modus) ausgefuehrt',
        'zugferd_used'        => 'E-Rechnung (ZUGFeRD / XRechnung) geprueft/eingebettet',
        'qrcode_inserted'     => 'QR-Code auf PDF-Seite generiert',
        'auto_redact_pattern' => 'Intelligente Mustersuche & Auto-Schwaerzung (DSGVO)',
        'attachments_managed' => 'PDF-Anlagen / Eingebettete Dateien verwaltet',
        'bookmarks_toc_used'  => 'Lesezeichen-Editor & Inhaltsverzeichnis erzeugt',
        'metadata_sanitized'  => 'Forensik- & Metadaten-Bereinigung (Sanitize PDF)',
        'nup_booklet_created' => 'Mehrseiten-Layout (N-up / Broschuerendruck) erstellt',
        'form_mailmerge_used' => 'Formulardaten-Export & Serienbrief-Befuellung',
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

    if (!pdfstudio_storage_exists(PDFSTUDIO_STATS_JSON)) {
        return $defaults;
    }

    $raw = pdfstudio_storage_read(PDFSTUDIO_STATS_JSON);
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
    pdfstudio_storage_write(PDFSTUDIO_STATS_JSON, json_encode($stats, $flags));

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

    pdfstudio_storage_write(PDFSTUDIO_STATS_TXT, implode("\r\n", $lines));
}

// ============================================================================
// ADMIN SETTINGS, LOCAL USERS (NO-DB) & LDAP / GATEKEEPER AUTHENTICATION
// ============================================================================

/**
 * Default settings structure combining config.php defaults + LDAP & Gatekeeper options
 */
function pdfstudio_get_default_admin_settings()
{
    return array(
        // Admin panel password hash (empty = initial setup required on first visit to admin.php)
        'admin_password_hash'   => '',
        'admin_updated_at'      => '',

        // Application Gatekeeper Mode: 'none' | 'local' | 'ldap' | 'both'
        'auth_mode'             => 'none',
        'auth_banner_title'     => 'Anmeldung an der PDF-Werkstatt Pro',
        'auth_banner_hint'      => 'Bitte melden Sie sich mit Ihrer Benutzerkennung an.',

        // LDAP / Active Directory settings
        'ldap_host'             => '',
        'ldap_port'             => 389,
        'ldap_use_starttls'     => false,
        'ldap_ignore_cert'      => false,
        'ldap_timeout'          => 8,
        'ldap_bind_mode'        => 'direct_upn', // 'direct_upn' | 'search_bind' | 'direct_dn'
        'ldap_upn_suffix'       => '',           // e.g. @polizei.bwl.de
        'ldap_netbios_domain'   => '',           // e.g. LKA
        'ldap_dn_template'      => 'uid={username},ou=users,dc=example,dc=de',
        'ldap_base_dn'          => '',           // e.g. OU=Mitarbeiter,DC=dienststelle,DC=intern
        'ldap_bind_dn'          => '',           // Technical reader DN/UPN for search_bind
        'ldap_bind_password'    => '',           // Technical reader password
        'ldap_search_filter'    => '(&(objectClass=user)(sAMAccountName={username}))',
        'ldap_display_attr'     => 'displayName',
        'ldap_required_group'   => '',           // Optional group DN in memberOf

        // Brute-Force & Security settings (from config.php)
        'max_login_attempts'    => 8,
        'login_lockout_seconds' => 300,

        // Mail / SMTP settings (from config.php)
        'mail_transport'        => 'smtp',
        'mail_from_address'     => 'noreply@pdf-werkstatt.local',
        'mail_from_name'        => 'PDF-Werkstatt Pro',
        'smtp_host'             => '',
        'smtp_port'             => 587,
        'smtp_encryption'       => 'tls',
        'smtp_auth'             => true,
        'smtp_username'         => '',
        'smtp_password'         => '',
        'smtp_timeout'          => 10,

        // GitHub Direct Update Settings
        'github_repo'           => 'uWiiiDev/PDF-Werkstatt-Pro',
        'github_branch'         => 'main',
        'github_token'          => '',
        'last_update_check'     => '',
        'last_update_at'        => '',
        'last_update_commit'    => ''
    );
}

/**
 * Load merged settings from config.php and storage/admin_settings.json.php into $GLOBALS['PDFSTUDIO_CONFIG']
 */
function pdfstudio_load_admin_settings()
{
    $defaults = pdfstudio_get_default_admin_settings();
    $baseCfg = isset($GLOBALS['PDFSTUDIO_BASE_CONFIG']) && is_array($GLOBALS['PDFSTUDIO_BASE_CONFIG'])
        ? $GLOBALS['PDFSTUDIO_BASE_CONFIG']
        : (isset($GLOBALS['PDFSTUDIO_CONFIG']) && is_array($GLOBALS['PDFSTUDIO_CONFIG']) ? $GLOBALS['PDFSTUDIO_CONFIG'] : array());

    $merged = array_merge($defaults, $baseCfg);

    $needsEncryptMigration = false;
    if (pdfstudio_storage_exists(PDFSTUDIO_ADMIN_SETTINGS_FILE)) {
        $raw = pdfstudio_storage_read(PDFSTUDIO_ADMIN_SETTINGS_FILE);
        $saved = $raw ? @json_decode($raw, true) : null;
        if (is_array($saved)) {
            foreach ($saved as $k => $v) {
                $merged[$k] = $v;
            }
            foreach (array('ldap_bind_password', 'smtp_password', 'github_token') as $secKey) {
                if (!empty($saved[$secKey]) && strpos((string)$saved[$secKey], 'ENCv1:') !== 0) {
                    $needsEncryptMigration = true;
                }
            }
        }
    }

    // If admin_password_hash is still empty, check all candidate files (fallback & legacy) so a stale empty file never hides a saved hash
    if (empty($merged['admin_password_hash'])) {
        $legacyFile = preg_replace('/\.php$/', '', (string)PDFSTUDIO_ADMIN_SETTINGS_FILE);
        $fbFile     = pdfstudio_storage_fallback_path(PDFSTUDIO_ADMIN_SETTINGS_FILE);
        $candidates = array($fbFile, PDFSTUDIO_ADMIN_SETTINGS_FILE, $legacyFile);
        foreach ($candidates as $cand) {
            if ($cand !== '' && is_file($cand) && is_readable($cand)) {
                $cRaw = @file_get_contents($cand);
                if ($cRaw !== false) {
                    $cStripped = pdfstudio_storage_strip_guard($cRaw);
                    $cArr = $cStripped ? @json_decode($cStripped, true) : null;
                    if (is_array($cArr) && !empty($cArr['admin_password_hash'])) {
                        $merged['admin_password_hash'] = $cArr['admin_password_hash'];
                        foreach ($cArr as $ck => $cv) {
                            if (!isset($merged[$ck]) || $merged[$ck] === '') {
                                $merged[$ck] = $cv;
                            }
                        }
                        break;
                    }
                }
            }
        }
    }

    // Decrypt secrets at rest for runtime usage
    foreach (array('ldap_bind_password', 'smtp_password', 'github_token') as $secKey) {
        if (!empty($merged[$secKey])) {
            $merged[$secKey] = pdfstudio_decrypt_secret($merged[$secKey]);
        }
    }

    $GLOBALS['PDFSTUDIO_CONFIG'] = $merged;

    if ($needsEncryptMigration) {
        $toStore = $merged;
        foreach (array('ldap_bind_password', 'smtp_password', 'github_token') as $secKey) {
            if (!empty($toStore[$secKey])) {
                $toStore[$secKey] = pdfstudio_encrypt_secret($toStore[$secKey]);
            }
        }
        $flags = defined('JSON_PRETTY_PRINT') ? JSON_PRETTY_PRINT : 0;
        pdfstudio_storage_write(PDFSTUDIO_ADMIN_SETTINGS_FILE, json_encode($toStore, $flags));
    }

    return $merged;
}

/**
 * Save admin settings to storage/admin_settings.json.php (encrypting secrets at rest) and update $GLOBALS['PDFSTUDIO_CONFIG']
 */
function pdfstudio_save_admin_settings($newSettings)
{
    $current = pdfstudio_load_admin_settings();
    $prevHash = isset($current['admin_password_hash']) ? (string)$current['admin_password_hash'] : '';
    if (is_array($newSettings)) {
        foreach ($newSettings as $k => $v) {
            $current[$k] = $v;
        }
    }
    // Never clobber an existing admin_password_hash unless explicitly changed
    if ($prevHash !== '' && (!is_array($newSettings) || !array_key_exists('admin_password_hash', $newSettings) || trim((string)$newSettings['admin_password_hash']) === '')) {
        $current['admin_password_hash'] = $prevHash;
    }
    $current['admin_updated_at'] = date('d.m.Y H:i:s');

    $toStore = $current;
    foreach (array('ldap_bind_password', 'smtp_password', 'github_token') as $secKey) {
        if (!empty($toStore[$secKey])) {
            $toStore[$secKey] = pdfstudio_encrypt_secret($toStore[$secKey]);
        }
    }

    $flags = defined('JSON_PRETTY_PRINT') ? JSON_PRETTY_PRINT : 0;
    $jsonPayload = json_encode($toStore, $flags);
    if (!is_string($jsonPayload) || strlen($jsonPayload) < 10) {
        return false;
    }

    $written = pdfstudio_storage_write(PDFSTUDIO_ADMIN_SETTINGS_FILE, $jsonPayload);
    if (!$written) {
        return false;
    }

    // Verify by reading back from disk
    $verifyRaw = pdfstudio_storage_read(PDFSTUDIO_ADMIN_SETTINGS_FILE);
    $verifyArr = $verifyRaw ? @json_decode($verifyRaw, true) : null;
    if (!is_array($verifyArr)) {
        return false;
    }
    if (!empty($current['admin_password_hash']) && empty($verifyArr['admin_password_hash'])) {
        return false;
    }

    $GLOBALS['PDFSTUDIO_CONFIG'] = $current;
    return true;
}

/**
 * Load database-free local Gatekeeper users from storage/gatekeeper_users.json.php
 */
function pdfstudio_load_local_users()
{
    if (!pdfstudio_storage_exists(PDFSTUDIO_GATEKEEPER_USERS_FILE)) {
        return array();
    }
    $raw = pdfstudio_storage_read(PDFSTUDIO_GATEKEEPER_USERS_FILE);
    $decoded = $raw ? @json_decode($raw, true) : null;
    if (!is_array($decoded) || !isset($decoded['users']) || !is_array($decoded['users'])) {
        return array();
    }
    return $decoded['users'];
}

/**
 * Save local Gatekeeper users to storage/gatekeeper_users.json.php
 */
function pdfstudio_save_local_users($users)
{
    $payload = array(
        'updated_at' => date('d.m.Y H:i:s'),
        'users'      => array_values($users)
    );
    $flags = defined('JSON_PRETTY_PRINT') ? JSON_PRETTY_PRINT : 0;
    return pdfstudio_storage_write(PDFSTUDIO_GATEKEEPER_USERS_FILE, json_encode($payload, $flags));
}

/**
 * Create or update a local user (password is ALWAYS stored as a Bcrypt/HMAC hash, never plaintext)
 */
function pdfstudio_upsert_local_user($username, $displayName, $plainPassword = '', $active = true)
{
    $normUser = strtolower(trim((string)$username));
    if (!preg_match('/^[a-z0-9._@-]{2,64}$/', $normUser)) {
        return array('ok' => false, 'error' => 'Ungültiger Benutzername (erlaubt: a-z, 0-9, Punkt, Bindestrich, Unterstrich, @; 2–64 Zeichen).');
    }

    $users = pdfstudio_load_local_users();
    $foundIdx = -1;
    for ($i = 0; $i < count($users); $i++) {
        if (isset($users[$i]['username']) && strtolower($users[$i]['username']) === $normUser) {
            $foundIdx = $i;
            break;
        }
    }

    if ($foundIdx === -1) {
        if (strlen((string)$plainPassword) < 6) {
            return array('ok' => false, 'error' => 'Das Passwort für einen neuen Benutzer muss mindestens 6 Zeichen lang sein.');
        }
        $users[] = array(
            'username'      => $normUser,
            'display_name'  => trim((string)$displayName) !== '' ? trim((string)$displayName) : $normUser,
            'password_hash' => pdfstudio_hash_password($plainPassword),
            'active'        => (bool)$active,
            'created_at'    => date('d.m.Y H:i'),
            'last_login'    => '—',
            'login_count'   => 0
        );
    } else {
        if (trim((string)$displayName) !== '') {
            $users[$foundIdx]['display_name'] = trim((string)$displayName);
        }
        $users[$foundIdx]['active'] = (bool)$active;
        if ((string)$plainPassword !== '') {
            if (strlen((string)$plainPassword) < 6) {
                return array('ok' => false, 'error' => 'Das neue Passwort muss mindestens 6 Zeichen lang sein.');
            }
            $users[$foundIdx]['password_hash'] = pdfstudio_hash_password($plainPassword);
        }
    }

    if (!pdfstudio_save_local_users($users)) {
        return array('ok' => false, 'error' => 'Benutzerdatei konnte nicht in storage/ gespeichert werden.');
    }
    return array('ok' => true);
}

/**
 * Delete a local Gatekeeper user
 */
function pdfstudio_delete_local_user($username)
{
    $normUser = strtolower(trim((string)$username));
    $users = pdfstudio_load_local_users();
    $filtered = array();
    foreach ($users as $u) {
        if (isset($u['username']) && strtolower($u['username']) === $normUser) {
            continue;
        }
        $filtered[] = $u;
    }
    return pdfstudio_save_local_users($filtered);
}

/**
 * Toggle active state of a local Gatekeeper user
 */
function pdfstudio_toggle_local_user($username)
{
    $normUser = strtolower(trim((string)$username));
    $users = pdfstudio_load_local_users();
    for ($i = 0; $i < count($users); $i++) {
        if (isset($users[$i]['username']) && strtolower($users[$i]['username']) === $normUser) {
            $users[$i]['active'] = empty($users[$i]['active']);
            break;
        }
    }
    return pdfstudio_save_local_users($users);
}

/**
 * Authenticate a user against local hashed user store
 */
function pdfstudio_authenticate_local_user($username, $password)
{
    $normUser = strtolower(trim((string)$username));
    $password = (string)$password;
    if ($normUser === '' || $password === '') {
        return array('ok' => false, 'error' => 'Bitte Benutzername und Passwort eingeben.');
    }

    $users = pdfstudio_load_local_users();
    for ($i = 0; $i < count($users); $i++) {
        $u = $users[$i];
        if (isset($u['username']) && strtolower($u['username']) === $normUser) {
            if (empty($u['active'])) {
                return array('ok' => false, 'error' => 'Dieses Benutzerkonto ist aktuell deaktiviert.');
            }
            if (isset($u['password_hash']) && pdfstudio_verify_password($password, $u['password_hash'])) {
                $users[$i]['last_login'] = date('d.m.Y H:i');
                $users[$i]['login_count'] = (isset($u['login_count']) ? (int)$u['login_count'] : 0) + 1;
                pdfstudio_save_local_users($users);
                return array(
                    'ok' => true,
                    'user' => array(
                        'username'     => $u['username'],
                        'display_name' => isset($u['display_name']) && $u['display_name'] !== '' ? $u['display_name'] : $u['username'],
                        'auth_source'  => 'Lokal'
                    )
                );
            }
            return array('ok' => false, 'error' => 'Ungültiger Benutzername oder Passwort.');
        }
    }
    return array('ok' => false, 'error' => 'Ungültiger Benutzername oder Passwort.');
}

/**
 * Self-service password change for a local Gatekeeper user (or Admin)
 */
function pdfstudio_change_local_user_password($username, $currentPassword, $newPassword, $confirmPassword)
{
    $normUser = strtolower(trim((string)$username));
    $currentPassword = (string)$currentPassword;
    $newPassword     = (string)$newPassword;
    $confirmPassword = (string)$confirmPassword;

    if ($normUser === '' || $currentPassword === '' || $newPassword === '') {
        return array('ok' => false, 'error' => 'Bitte füllen Sie alle Passwortfelder vollständig aus.');
    }
    if (strlen($newPassword) < 6) {
        return array('ok' => false, 'error' => 'Das neue Passwort muss mindestens 6 Zeichen lang sein.');
    }
    if ($newPassword !== $confirmPassword) {
        return array('ok' => false, 'error' => 'Das neue Passwort und die Wiederholung stimmen nicht überein.');
    }
    if ($newPassword === $currentPassword) {
        return array('ok' => false, 'error' => 'Das neue Passwort muss sich vom bisherigen Passwort unterscheiden.');
    }

    $users = pdfstudio_load_local_users();
    for ($i = 0; $i < count($users); $i++) {
        $u = $users[$i];
        if (isset($u['username']) && strtolower($u['username']) === $normUser) {
            if (empty($u['active'])) {
                return array('ok' => false, 'error' => 'Dieses Benutzerkonto ist aktuell deaktiviert.');
            }
            if (!isset($u['password_hash']) || !pdfstudio_verify_password($currentPassword, $u['password_hash'])) {
                return array('ok' => false, 'error' => 'Das eingegebene aktuelle Passwort ist nicht korrekt.');
            }
            $users[$i]['password_hash']       = pdfstudio_hash_password($newPassword);
            $users[$i]['password_changed_at'] = date('d.m.Y H:i');
            if (!pdfstudio_save_local_users($users)) {
                return array('ok' => false, 'error' => 'Das neue Passwort konnte nicht gespeichert werden.');
            }
            if (function_exists('pdfstudio_record_stat')) {
                pdfstudio_record_stat('password_reset');
            }
            return array('ok' => true);
        }
    }

    return array('ok' => false, 'error' => 'Lokales Benutzerkonto "' . $normUser . '" wurde nicht gefunden (LDAP-Passwörter werden zentral verwaltet).');
}

/**
 * Escape special characters in LDAP search filter values (RFC 4515)
 */
function pdfstudio_ldap_escape_filter($str)
{
    $str = (string)$str;
    if (function_exists('ldap_escape')) {
        return ldap_escape($str, '', LDAP_ESCAPE_FILTER);
    }
    return str_replace(
        array('\\', '*', '(', ')', "\x00"),
        array('\\5c', '\\2a', '\\28', '\\29', '\\00'),
        $str
    );
}

/**
 * Authenticate a user via LDAP / Active Directory OR run a step-by-step live diagnostic test
 */
function pdfstudio_ldap_authenticate($username, $password, $overrideCfg = null, $testConnectionOnly = false)
{
    $cfg = is_array($overrideCfg) ? array_merge(pdfstudio_load_admin_settings(), $overrideCfg) : pdfstudio_load_admin_settings();
    $steps = array();

    $rawHost = trim((string)(isset($cfg['ldap_host']) ? $cfg['ldap_host'] : ''));
    $port = max(1, (int)(isset($cfg['ldap_port']) ? $cfg['ldap_port'] : 389));
    $useStartTls = !empty($cfg['ldap_use_starttls']);
    $ignoreCert = !empty($cfg['ldap_ignore_cert']);
    $timeout = max(2, (int)(isset($cfg['ldap_timeout']) ? $cfg['ldap_timeout'] : 8));
    $bindMode = isset($cfg['ldap_bind_mode']) ? (string)$cfg['ldap_bind_mode'] : 'direct_upn';

    if ($rawHost === '') {
        return array(
            'ok'    => false,
            'error' => 'Kein LDAP-Server (Host/IP) konfiguriert.',
            'steps' => array(array('status' => 'fail', 'title' => 'Konfiguration', 'detail' => 'Feld "LDAP-Server / Host" ist leer.'))
        );
    }

    // Parse host for TCP reachability test
    $tcpHost = preg_replace('#^ldaps?://#i', '', $rawHost);
    $tcpHost = preg_replace('#/.*$#', '', $tcpHost);
    $tcpHost = preg_replace('#:\d+$#', '', $tcpHost);
    $isLdaps = (stripos($rawHost, 'ldaps://') === 0) || ($port === 636);

    // Step 1: TCP Socket Reachability Check (works even without php-ldap installed)
    $sockPrefix = $isLdaps ? 'ssl://' : '';
    $errNo = 0;
    $errStr = '';
    $t0 = microtime(true);
    $ctx = stream_context_create(array(
        'ssl' => array(
            'verify_peer'      => !$ignoreCert,
            'verify_peer_name' => !$ignoreCert,
            'allow_self_signed'=> $ignoreCert
        )
    ));
    $fp = @stream_socket_client(
        ($sockPrefix . $tcpHost . ':' . $port),
        $errNo,
        $errStr,
        $timeout,
        STREAM_CLIENT_CONNECT,
        $ctx
    );
    $latencyMs = round((microtime(true) - $t0) * 1000);
    if ($fp) {
        @fclose($fp);
        $steps[] = array(
            'status' => 'ok',
            'title'  => '1. Netzwerk- & Port-Erreichbarkeit',
            'detail' => 'Server ' . $tcpHost . ':' . $port . ($isLdaps ? ' (LDAPS/SSL)' : '') . ' antwortet (' . $latencyMs . ' ms).'
        );
    } else {
        $steps[] = array(
            'status' => 'fail',
            'title'  => '1. Netzwerk- & Port-Erreichbarkeit',
            'detail' => 'Verbindung zu ' . $tcpHost . ':' . $port . ' fehlgeschlagen: ' . ($errStr ? $errStr : ('Fehler #' . $errNo))
        );
        return array(
            'ok'    => false,
            'error' => 'LDAP-Server ' . $tcpHost . ':' . $port . ' ist über das Netzwerk nicht erreichbar (' . ($errStr ? $errStr : ('Code ' . $errNo)) . ').',
            'steps' => $steps
        );
    }

    // Step 2: Check PHP LDAP extension
    if (!function_exists('ldap_connect')) {
        $steps[] = array(
            'status' => 'fail',
            'title'  => '2. PHP-LDAP Erweiterung (php-ldap)',
            'detail' => 'Das PHP-Modul "php-ldap" ist auf diesem Webserver noch nicht aktiviert (apt install php-ldap).'
        );
        return array(
            'ok'    => false,
            'error' => 'Netzwerkverbindung zu ' . $tcpHost . ':' . $port . ' steht (' . $latencyMs . ' ms), aber das PHP-Modul "php-ldap" ist auf dem Server nicht installiert.',
            'steps' => $steps
        );
    }
    $steps[] = array(
        'status' => 'ok',
        'title'  => '2. PHP-LDAP Erweiterung (php-ldap)',
        'detail' => 'PHP-Erweiterung "ldap" ist geladen und einsatzbereit.'
    );

    if ($ignoreCert && defined('LDAP_OPT_X_TLS_REQUIRE_CERT') && defined('LDAP_OPT_X_TLS_NEVER')) {
        @ldap_set_option(null, LDAP_OPT_X_TLS_REQUIRE_CERT, LDAP_OPT_X_TLS_NEVER);
    }

    $ldapUri = (stripos($rawHost, 'ldap://') === 0 || stripos($rawHost, 'ldaps://') === 0)
        ? $rawHost
        : (($isLdaps ? 'ldaps://' : 'ldap://') . $tcpHost . ':' . $port);

    $conn = @ldap_connect($ldapUri);
    if (!$conn) {
        $steps[] = array(
            'status' => 'fail',
            'title'  => '3. LDAP-Handle & Protokolloptionen',
            'detail' => 'ldap_connect("' . $ldapUri . '") schlug fehl.'
        );
        return array('ok' => false, 'error' => 'Ungültige LDAP-URI: ' . $ldapUri, 'steps' => $steps);
    }

    @ldap_set_option($conn, LDAP_OPT_PROTOCOL_VERSION, 3);
    @ldap_set_option($conn, LDAP_OPT_REFERRALS, 0);
    if (defined('LDAP_OPT_NETWORK_TIMEOUT')) {
        @ldap_set_option($conn, LDAP_OPT_NETWORK_TIMEOUT, $timeout);
    }

    if ($useStartTls && !$isLdaps) {
        if (!@ldap_start_tls($conn)) {
            $tlsErr = function_exists('ldap_error') ? @ldap_error($conn) : 'Unbekannter TLS-Fehler';
            $steps[] = array(
                'status' => 'fail',
                'title'  => '3. StartTLS-Verschlüsselung',
                'detail' => 'StartTLS konnte nicht ausgehandelt werden: ' . $tlsErr
            );
            @ldap_unbind($conn);
            return array('ok' => false, 'error' => 'StartTLS-Fehler: ' . $tlsErr, 'steps' => $steps);
        }
        $steps[] = array(
            'status' => 'ok',
            'title'  => '3. StartTLS-Verschlüsselung',
            'detail' => 'StartTLS erfolgreich ausgehandelt.'
        );
    } else {
        $steps[] = array(
            'status' => 'ok',
            'title'  => '3. LDAP-Protokoll & Verbindung',
            'detail' => 'LDAPv3 initialisiert (' . $ldapUri . ').'
        );
    }

    $username = trim((string)$username);
    $password = (string)$password;

    // If connection-only test without user credentials in Direct Bind mode
    if ($testConnectionOnly && ($username === '' || $password === '') && $bindMode !== 'search_bind') {
        $steps[] = array(
            'status' => 'ok',
            'title'  => '4. Bereit für Direct-Bind-Anmeldungen',
            'detail' => 'Server antwortet. Geben Sie optional unten einen Test-Benutzernamen + Passwort ein, um auch die Anmeldung live zu prüfen.'
        );
        @ldap_unbind($conn);
        return array('ok' => true, 'error' => '', 'steps' => $steps);
    }

    $userDnToBind = '';
    $displayName = $username;
    $userGroups = array();

    if ($bindMode === 'search_bind') {
        $bindDn = trim((string)(isset($cfg['ldap_bind_dn']) ? $cfg['ldap_bind_dn'] : ''));
        $bindPw = (string)(isset($cfg['ldap_bind_password']) ? $cfg['ldap_bind_password'] : '');
        $baseDn = trim((string)(isset($cfg['ldap_base_dn']) ? $cfg['ldap_base_dn'] : ''));

        if ($baseDn === '') {
            @ldap_unbind($conn);
            $steps[] = array(
                'status' => 'fail',
                'title'  => '4. Verzeichnissuche (Search & Bind)',
                'detail' => 'Base-DN fehlt für den Modus "Search & Bind".'
            );
            return array('ok' => false, 'error' => 'Base-DN fehlt für Search & Bind.', 'steps' => $steps);
        }

        $searchBindOk = ($bindDn !== '') ? @ldap_bind($conn, $bindDn, $bindPw) : @ldap_bind($conn);
        if (!$searchBindOk) {
            $bErr = function_exists('ldap_error') ? @ldap_error($conn) : 'Bind fehlgeschlagen';
            $steps[] = array(
                'status' => 'fail',
                'title'  => '4. Technischer Lese-Bind',
                'detail' => 'Anmeldung mit Bind-DN "' . ($bindDn !== '' ? $bindDn : 'anonym') . '" fehlgeschlagen: ' . $bErr
            );
            @ldap_unbind($conn);
            return array('ok' => false, 'error' => 'Technischer LDAP-Bind fehlgeschlagen: ' . $bErr, 'steps' => $steps);
        }
        $steps[] = array(
            'status' => 'ok',
            'title'  => '4. Technischer Lese-Bind',
            'detail' => 'Bind erfolgreich (' . ($bindDn !== '' ? $bindDn : 'anonym') . ').'
        );

        if ($testConnectionOnly && ($username === '' || $password === '')) {
            @ldap_unbind($conn);
            return array('ok' => true, 'error' => '', 'steps' => $steps);
        }

        if ($username === '' || $password === '') {
            @ldap_unbind($conn);
            return array('ok' => false, 'error' => 'Bitte Benutzername und Passwort eingeben.', 'steps' => $steps);
        }

        $filterTpl = trim((string)(isset($cfg['ldap_search_filter']) ? $cfg['ldap_search_filter'] : '(&(objectClass=user)(sAMAccountName={username}))'));
        if ($filterTpl === '') {
            $filterTpl = '(sAMAccountName={username})';
        }
        $safeUser = pdfstudio_ldap_escape_filter($username);
        $filter = str_replace(array('{username}', '%s'), $safeUser, $filterTpl);
        $dispAttr = strtolower(trim((string)(isset($cfg['ldap_display_attr']) ? $cfg['ldap_display_attr'] : 'displayName')));
        $attrs = array('dn', 'cn', 'displayname', 'mail', 'memberof');
        if ($dispAttr !== '' && !in_array($dispAttr, $attrs, true)) {
            $attrs[] = $dispAttr;
        }

        $sr = @ldap_search($conn, $baseDn, $filter, $attrs);
        if (!$sr) {
            $sErr = function_exists('ldap_error') ? @ldap_error($conn) : 'Suche fehlgeschlagen';
            $steps[] = array(
                'status' => 'fail',
                'title'  => '5. Benutzersuche in Base-DN',
                'detail' => 'Suche in "' . $baseDn . '" mit Filter "' . $filter . '" fehlgeschlagen: ' . $sErr
            );
            @ldap_unbind($conn);
            return array('ok' => false, 'error' => 'LDAP-Suche fehlgeschlagen: ' . $sErr, 'steps' => $steps);
        }

        $entries = @ldap_get_entries($conn, $sr);
        if (!is_array($entries) || empty($entries['count']) || (int)$entries['count'] < 1) {
            $steps[] = array(
                'status' => 'fail',
                'title'  => '5. Benutzersuche in Base-DN',
                'detail' => 'Kein Eintrag für Filter "' . $filter . '" unter "' . $baseDn . '" gefunden.'
            );
            @ldap_unbind($conn);
            return array('ok' => false, 'error' => 'Benutzer "' . $username . '" wurde im LDAP-Verzeichnis nicht gefunden.', 'steps' => $steps);
        }

        $first = $entries[0];
        $userDnToBind = isset($first['dn']) ? (string)$first['dn'] : '';
        if ($dispAttr !== '' && isset($first[$dispAttr][0])) {
            $displayName = (string)$first[$dispAttr][0];
        } elseif (isset($first['displayname'][0])) {
            $displayName = (string)$first['displayname'][0];
        } elseif (isset($first['cn'][0])) {
            $displayName = (string)$first['cn'][0];
        }

        if (isset($first['memberof']) && is_array($first['memberof'])) {
            $cnt = isset($first['memberof']['count']) ? (int)$first['memberof']['count'] : 0;
            for ($gi = 0; $gi < $cnt; $gi++) {
                $userGroups[] = (string)$first['memberof'][$gi];
            }
        }

        $steps[] = array(
            'status' => 'ok',
            'title'  => '5. Benutzersuche in Base-DN',
            'detail' => 'Gefunden: DN="' . $userDnToBind . '" (' . $displayName . ').'
        );
    } elseif ($bindMode === 'direct_dn') {
        if ($username === '' || $password === '') {
            @ldap_unbind($conn);
            return array('ok' => false, 'error' => 'Bitte Benutzername und Passwort eingeben.', 'steps' => $steps);
        }
        $tpl = trim((string)(isset($cfg['ldap_dn_template']) ? $cfg['ldap_dn_template'] : 'uid={username},ou=users,dc=example,dc=de'));
        $userDnToBind = str_replace('{username}', $username, $tpl);
    } else {
        // direct_upn (Active Directory UPN or NetBIOS domain)
        if ($username === '' || $password === '') {
            @ldap_unbind($conn);
            return array('ok' => false, 'error' => 'Bitte Benutzername und Passwort eingeben.', 'steps' => $steps);
        }
        $upnSuffix = trim((string)(isset($cfg['ldap_upn_suffix']) ? $cfg['ldap_upn_suffix'] : ''));
        $netbios = trim((string)(isset($cfg['ldap_netbios_domain']) ? $cfg['ldap_netbios_domain'] : ''));

        if (strpos($username, '@') !== false || strpos($username, '\\') !== false) {
            $userDnToBind = $username;
        } elseif ($upnSuffix !== '') {
            $suffix = (strpos($upnSuffix, '@') === 0) ? $upnSuffix : ('@' . $upnSuffix);
            $userDnToBind = $username . $suffix;
        } elseif ($netbios !== '') {
            $userDnToBind = rtrim($netbios, '\\') . '\\' . $username;
        } else {
            $userDnToBind = $username;
        }
    }

    // Bind with user credentials
    $authOk = ($password !== '') && @ldap_bind($conn, $userDnToBind, $password);
    if (!$authOk) {
        $uErr = function_exists('ldap_error') ? @ldap_error($conn) : 'Ungültige Anmeldedaten';
        $steps[] = array(
            'status' => 'fail',
            'title'  => 'Benutzer-Authentifizierung (Bind)',
            'detail' => 'Anmeldung als "' . $userDnToBind . '" abgelehnt: ' . $uErr
        );
        @ldap_unbind($conn);
        return array('ok' => false, 'error' => 'LDAP-Anmeldung fehlgeschlagen (' . $uErr . ').', 'steps' => $steps);
    }

    $steps[] = array(
        'status' => 'ok',
        'title'  => 'Benutzer-Authentifizierung (Bind)',
        'detail' => 'Passwort für "' . $userDnToBind . '" vom LDAP-Server bestätigt.'
    );

    // Optional group check
    $reqGroup = trim((string)(isset($cfg['ldap_required_group']) ? $cfg['ldap_required_group'] : ''));
    if ($reqGroup !== '') {
        // If Direct Bind mode was used and base_dn is provided, query memberOf now after binding as user
        if (empty($userGroups) && !empty($cfg['ldap_base_dn'])) {
            $safeUser = pdfstudio_ldap_escape_filter($username);
            $srG = @ldap_search($conn, trim((string)$cfg['ldap_base_dn']), '(|(sAMAccountName=' . $safeUser . ')(userPrincipalName=' . pdfstudio_ldap_escape_filter($userDnToBind) . ')(uid=' . $safeUser . '))', array('memberof', 'displayname', 'cn'));
            if ($srG) {
                $entG = @ldap_get_entries($conn, $srG);
                if (is_array($entG) && !empty($entG['count']) && isset($entG[0]['memberof'])) {
                    $gCnt = (int)$entG[0]['memberof']['count'];
                    for ($gi = 0; $gi < $gCnt; $gi++) {
                        $userGroups[] = (string)$entG[0]['memberof'][$gi];
                    }
                }
            }
        }

        $groupMatched = false;
        foreach ($userGroups as $ug) {
            if (strcasecmp(trim($ug), $reqGroup) === 0 || stripos($ug, $reqGroup) !== false) {
                $groupMatched = true;
                break;
            }
        }
        if (!$groupMatched) {
            $steps[] = array(
                'status' => 'fail',
                'title'  => 'Gruppenberechtigung (memberOf)',
                'detail' => 'Benutzer ist nicht Mitglied der erforderlichen Gruppe "' . $reqGroup . '".'
            );
            @ldap_unbind($conn);
            return array('ok' => false, 'error' => 'Zugriff verweigert: Erforderliche LDAP-Gruppe fehlt.', 'steps' => $steps);
        }
        $steps[] = array(
            'status' => 'ok',
            'title'  => 'Gruppenberechtigung (memberOf)',
            'detail' => 'Mitgliedschaft in "' . $reqGroup . '" bestätigt.'
        );
    }

    @ldap_unbind($conn);
    return array(
        'ok'    => true,
        'error' => '',
        'steps' => $steps,
        'user'  => array(
            'username'     => $username,
            'display_name' => $displayName,
            'auth_source'  => 'LDAP',
            'dn'           => $userDnToBind,
            'groups'       => $userGroups
        )
    );
}

/**
 * Combined Gatekeeper Authentication (checks Local Users and/or LDAP based on auth_mode)
 */
function pdfstudio_gatekeeper_authenticate($username, $password)
{
    $mode = (string)pdfstudio_config('auth_mode', 'none');
    $username = trim((string)$username);
    $password = (string)$password;

    if ($username === '' || $password === '') {
        return array('ok' => false, 'error' => 'Bitte Benutzername und Passwort eingeben.');
    }

    if ($mode === 'local') {
        return pdfstudio_authenticate_local_user($username, $password);
    }

    if ($mode === 'ldap') {
        return pdfstudio_ldap_authenticate($username, $password);
    }

    if ($mode === 'both') {
        // Check local users first (fast, no network wait), then LDAP
        $localRes = pdfstudio_authenticate_local_user($username, $password);
        if (!empty($localRes['ok'])) {
            return $localRes;
        }
        if (trim((string)pdfstudio_config('ldap_host', '')) !== '') {
            $ldapRes = pdfstudio_ldap_authenticate($username, $password);
            if (!empty($ldapRes['ok'])) {
                return $ldapRes;
            }
        }
        return array('ok' => false, 'error' => 'Ungültige Anmeldedaten (weder lokal noch über LDAP bestätigt).');
    }

    return array('ok' => true, 'user' => array('username' => $username, 'display_name' => $username, 'auth_source' => 'Offen'));
}

/**
 * Enforce Gatekeeper Login before allowing access to index.php, hilfe.php, or api.php
 */
function pdfstudio_enforce_app_gatekeeper($isApi = false)
{
    // Handle logout request
    if (isset($_GET['gatekeeper_logout'])) {
        unset($_SESSION['pdfstudio_gatekeeper_user']);
        if (!$isApi) {
            $cleanUrl = strtok($_SERVER['REQUEST_URI'], '?');
            header('Location: ' . ($cleanUrl ? $cleanUrl : 'index.php'));
            exit;
        }
    }

    $mode = (string)pdfstudio_config('auth_mode', 'none');
    if ($mode === 'none' || $mode === '') {
        return;
    }

    // Already authenticated via Gatekeeper or logged in as Admin
    if (!empty($_SESSION['pdfstudio_gatekeeper_user']) && is_array($_SESSION['pdfstudio_gatekeeper_user'])) {
        return;
    }
    if (!empty($_SESSION['pdfstudio_admin_logged_in'])) {
        $_SESSION['pdfstudio_gatekeeper_user'] = array(
            'username'     => 'admin',
            'display_name' => 'Administrator',
            'auth_source'  => 'Admin'
        );
        return;
    }

    if ($isApi) {
        if (!headers_sent()) {
            if (function_exists('http_response_code')) {
                http_response_code(401);
            }
            header('Content-Type: application/json; charset=UTF-8');
        }
        echo json_encode(array('ok' => false, 'error' => 'Nicht angemeldet. Bitte melden Sie sich zuerst an.'));
        exit;
    }

    $loginError = '';
    $loginSuccess = '';
    $showPwChangeBox = false;

    if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['gatekeeper_change_pw_submit'])) {
        $showPwChangeBox = true;
        if (!pdfstudio_verify_csrf_token()) {
            $loginError = 'Ungültiges Sicherheits-Token (CSRF). Bitte laden Sie die Seite neu.';
        } else {
            $rl = pdfstudio_check_rate_limit('gatekeeper_login');
            if (empty($rl['allowed'])) {
                $loginError = 'Zu viele Fehlversuche. Bitte warten Sie ' . (int)$rl['retry_after'] . ' Sekunden.';
            } else {
                $uName  = isset($_POST['cp_username']) ? trim((string)$_POST['cp_username']) : '';
                $curPw  = isset($_POST['cp_current_password']) ? (string)$_POST['cp_current_password'] : '';
                $newPw1 = isset($_POST['cp_new_password']) ? (string)$_POST['cp_new_password'] : '';
                $newPw2 = isset($_POST['cp_confirm_password']) ? (string)$_POST['cp_confirm_password'] : '';
                $cpRes  = pdfstudio_change_local_user_password($uName, $curPw, $newPw1, $newPw2);
                if (!empty($cpRes['ok'])) {
                    pdfstudio_clear_rate_limit('gatekeeper_login');
                    $loginSuccess = 'Ihr Passwort wurde erfolgreich geändert! Sie können sich jetzt mit Ihrem neuen Passwort anmelden.';
                    $showPwChangeBox = false;
                } else {
                    pdfstudio_record_rate_limit_failure('gatekeeper_login');
                    $loginError = isset($cpRes['error']) ? $cpRes['error'] : 'Passwortänderung fehlgeschlagen.';
                }
            }
        }
    } elseif ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['gatekeeper_login_submit'])) {
        if (!pdfstudio_verify_csrf_token()) {
            $loginError = 'Ungültiges Sicherheits-Token (CSRF). Bitte laden Sie die Seite neu.';
        } else {
            $rl = pdfstudio_check_rate_limit('gatekeeper_login');
            if (empty($rl['allowed'])) {
                $loginError = 'Zu viele Fehlversuche. Bitte warten Sie ' . (int)$rl['retry_after'] . ' Sekunden.';
            } else {
                $uName = isset($_POST['username']) ? trim((string)$_POST['username']) : '';
                $uPass = isset($_POST['password']) ? (string)$_POST['password'] : '';
                $authRes = pdfstudio_gatekeeper_authenticate($uName, $uPass);
                if (!empty($authRes['ok']) && isset($authRes['user'])) {
                    pdfstudio_clear_rate_limit('gatekeeper_login');
                    if (function_exists('session_regenerate_id')) {
                        @session_regenerate_id(true);
                    }
                    $_SESSION['pdfstudio_gatekeeper_user'] = $authRes['user'];
                    pdfstudio_record_stat('login_success');
                    $redirectUri = isset($_SERVER['REQUEST_URI']) ? $_SERVER['REQUEST_URI'] : 'index.php';
                    header('Location: ' . $redirectUri);
                    exit;
                } else {
                    pdfstudio_record_rate_limit_failure('gatekeeper_login');
                    pdfstudio_record_stat('login_failed');
                    $loginError = isset($authRes['error']) ? $authRes['error'] : 'Anmeldung fehlgeschlagen.';
                }
            }
        }
    }

    $modeLabel = 'Lokale Anmeldung';
    if ($mode === 'ldap') {
        $modeLabel = 'LDAP / Active Directory Anmeldung';
    } elseif ($mode === 'both') {
        $modeLabel = 'LDAP / Active Directory oder lokales Benutzerkonto';
    }

    $bannerTitle = (string)pdfstudio_config('auth_banner_title', 'Anmeldung an der PDF-Werkstatt Pro');
    $bannerHint = (string)pdfstudio_config('auth_banner_hint', 'Bitte melden Sie sich mit Ihrer Benutzerkennung an.');

    if (!headers_sent()) {
        header('Content-Type: text/html; charset=UTF-8');
    }
    echo '<!DOCTYPE html><html lang="de"><head><meta charset="utf-8">';
    echo '<meta name="viewport" content="width=device-width, initial-scale=1.0">';
    echo '<title>' . htmlspecialchars($bannerTitle, ENT_QUOTES, 'UTF-8') . ' — v' . htmlspecialchars(PDFSTUDIO_VERSION, ENT_QUOTES, 'UTF-8') . '</title>';
    echo '<link rel="stylesheet" href="assets/css/desktop.css?v=' . urlencode(PDFSTUDIO_VERSION) . '">';
    echo '<style>
        body { display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; background:#0f131a; color:#f1f5f9; font-family:system-ui,-apple-system,sans-serif; }
        .gk-card { width:100%; max-width:420px; background:#181e29; border:1px solid #2a3446; border-radius:12px; padding:28px; box-shadow:0 20px 50px rgba(0,0,0,0.45); }
        .gk-brand { display:flex; align-items:center; gap:10px; margin-bottom:18px; }
        .gk-badge { background:#3b82f6; color:#fff; font-weight:800; font-size:12px; padding:4px 8px; border-radius:6px; }
        .gk-title { font-size:18px; font-weight:700; margin:0 0 6px; }
        .gk-sub { font-size:12.5px; color:#94a3b8; margin:0 0 20px; line-height:1.45; }
        .gk-field { margin-bottom:14px; }
        .gk-field label { display:block; font-size:12px; font-weight:600; color:#cbd5e1; margin-bottom:5px; }
        .gk-input { width:100%; height:38px; padding:0 12px; border-radius:7px; border:1px solid #334155; background:#0f131a; color:#f8fafc; font-size:13.5px; box-sizing:border-box; }
        .gk-input:focus { outline:none; border-color:#3b82f6; box-shadow:0 0 0 2px rgba(59,130,246,0.25); }
        .gk-btn { width:100%; height:40px; border:none; border-radius:7px; background:#3b82f6; color:#fff; font-size:13.5px; font-weight:600; cursor:pointer; margin-top:6px; }
        .gk-btn:hover { background:#2563eb; }
        .gk-btn-sec { width:100%; height:36px; border:1px solid #334155; border-radius:7px; background:#121721; color:#cbd5e1; font-size:12.5px; font-weight:600; cursor:pointer; margin-top:10px; }
        .gk-btn-sec:hover { background:#1e293b; color:#fff; }
        .gk-err { background:rgba(239,68,68,0.14); border:1px solid rgba(239,68,68,0.4); color:#fca5a5; padding:10px 12px; border-radius:7px; font-size:12.5px; margin-bottom:16px; }
        .gk-ok { background:rgba(16,185,129,0.14); border:1px solid rgba(16,185,129,0.4); color:#6ee7b7; padding:10px 12px; border-radius:7px; font-size:12.5px; margin-bottom:16px; }
        .gk-foot { margin-top:18px; padding-top:14px; border-top:1px solid #263042; display:flex; justify-content:space-between; align-items:center; font-size:11.5px; color:#64748b; }
        .gk-foot a { color:#94a3b8; text-decoration:none; }
        .gk-foot a:hover { color:#e2e8f0; text-decoration:underline; }
    </style></head><body>';
    echo '<div class="gk-card">';
    echo '<div class="gk-brand"><span class="gk-badge">PDF</span><strong>PDF-Werkstatt Pro v' . htmlspecialchars(PDFSTUDIO_VERSION, ENT_QUOTES, 'UTF-8') . '</strong></div>';
    echo '<h1 class="gk-title">' . htmlspecialchars($bannerTitle, ENT_QUOTES, 'UTF-8') . '</h1>';
    echo '<p class="gk-sub">' . htmlspecialchars($bannerHint, ENT_QUOTES, 'UTF-8') . '<br><span style="color:#60a5fa;font-size:11.5px;">Modus: ' . htmlspecialchars($modeLabel, ENT_QUOTES, 'UTF-8') . '</span></p>';
    if ($loginError !== '') {
        echo '<div class="gk-err">⚠️ ' . htmlspecialchars($loginError, ENT_QUOTES, 'UTF-8') . '</div>';
    }
    if ($loginSuccess !== '') {
        echo '<div class="gk-ok">✔ ' . htmlspecialchars($loginSuccess, ENT_QUOTES, 'UTF-8') . '</div>';
    }
    echo '<div id="gkLoginBox" style="display:' . ($showPwChangeBox ? 'none' : 'block') . ';">';
    echo '<form method="post" action="">';
    echo '<input type="hidden" name="csrf_token" value="' . htmlspecialchars(pdfstudio_get_csrf_token(), ENT_QUOTES, 'UTF-8') . '">';
    echo '<input type="hidden" name="gatekeeper_login_submit" value="1">';
    echo '<div class="gk-field"><label for="gkUser">Benutzername / Kennung</label>';
    echo '<input type="text" id="gkUser" name="username" class="gk-input" required autofocus autocomplete="username"></div>';
    echo '<div class="gk-field"><label for="gkPass">Passwort</label>';
    echo '<input type="password" id="gkPass" name="password" class="gk-input" required autocomplete="current-password"></div>';
    echo '<button type="submit" class="gk-btn">🔐 Anmelden</button>';
    echo '</form>';
    if ($mode === 'local' || $mode === 'both') {
        echo '<button type="button" class="gk-btn-sec" onclick="document.getElementById(\'gkLoginBox\').style.display=\'none\';document.getElementById(\'gkPwBox\').style.display=\'block\';">🔑 Eigenes Passwort ändern</button>';
    }
    echo '</div>';

    if ($mode === 'local' || $mode === 'both') {
        echo '<div id="gkPwBox" style="display:' . ($showPwChangeBox ? 'block' : 'none') . ';">';
        echo '<form method="post" action="">';
        echo '<input type="hidden" name="csrf_token" value="' . htmlspecialchars(pdfstudio_get_csrf_token(), ENT_QUOTES, 'UTF-8') . '">';
        echo '<input type="hidden" name="gatekeeper_change_pw_submit" value="1">';
        echo '<div class="gk-field"><label for="cpUser">Benutzername</label>';
        echo '<input type="text" id="cpUser" name="cp_username" class="gk-input" required autocomplete="username"></div>';
        echo '<div class="gk-field"><label for="cpCurPass">Aktuelles Passwort</label>';
        echo '<input type="password" id="cpCurPass" name="cp_current_password" class="gk-input" required autocomplete="current-password"></div>';
        echo '<div class="gk-field"><label for="cpNewPass1">Neues Passwort (mind. 6 Zeichen)</label>';
        echo '<input type="password" id="cpNewPass1" name="cp_new_password" class="gk-input" minlength="6" required autocomplete="new-password"></div>';
        echo '<div class="gk-field"><label for="cpNewPass2">Neues Passwort wiederholen</label>';
        echo '<input type="password" id="cpNewPass2" name="cp_confirm_password" class="gk-input" minlength="6" required autocomplete="new-password"></div>';
        echo '<button type="submit" class="gk-btn">💾 Neues Passwort speichern</button>';
        echo '<button type="button" class="gk-btn-sec" onclick="document.getElementById(\'gkPwBox\').style.display=\'none\';document.getElementById(\'gkLoginBox\').style.display=\'block\';">← Zurück zur Anmeldung</button>';
        echo '</form>';
        echo '</div>';
    }
    echo '<div class="gk-foot"><span>100 % Lokale Verarbeitung</span><a href="admin.php">⚙️ Adminbereich</a></div>';
    echo '</div></body></html>';
    exit;
}

// ============================================================================
// GITHUB DIRECT UPDATE MANAGER (CHECKS & ONE-CLICK INSTALLER)
// ============================================================================

/**
 * Perform an HTTPS GET request to GitHub API / Raw / Codeload with cURL or stream fallback
 */
function pdfstudio_github_http_get($url, $token = '', $timeout = 20)
{
    $headers = array(
        'User-Agent: PDF-Werkstatt-Pro-Updater/' . PDFSTUDIO_VERSION,
        'Accept: application/vnd.github+json'
    );
    if (trim((string)$token) !== '') {
        $headers[] = 'Authorization: Bearer ' . trim((string)$token);
    }

    if (function_exists('curl_init')) {
        $ch = @curl_init($url);
        if ($ch) {
            @curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            @curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
            @curl_setopt($ch, CURLOPT_MAXREDIRS, 5);
            @curl_setopt($ch, CURLOPT_TIMEOUT, (int)$timeout);
            @curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 10);
            @curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
            @curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
            $body = @curl_exec($ch);
            $code = (int)@curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $err  = @curl_error($ch);
            @curl_close($ch);
            if ($body !== false && $code >= 200 && $code < 300) {
                return array('ok' => true, 'status' => $code, 'body' => $body);
            }
            return array(
                'ok'     => false,
                'status' => $code,
                'error'  => $err ? $err : ('HTTP-Status ' . $code),
                'body'   => (string)$body
            );
        }
    }

    // Fallback to file_get_contents stream
    $ctx = stream_context_create(array(
        'http' => array(
            'method'          => 'GET',
            'header'          => implode("\r\n", $headers) . "\r\n",
            'timeout'         => (int)$timeout,
            'follow_location' => 1
        )
    ));
    $body = @file_get_contents($url, false, $ctx);
    if ($body !== false) {
        return array('ok' => true, 'status' => 200, 'body' => $body);
    }
    return array('ok' => false, 'status' => 0, 'error' => 'HTTPS-Verbindung zu GitHub fehlgeschlagen.');
}

/**
 * Determine the currently installed short commit hash (from .git or admin_settings.json)
 */
function pdfstudio_get_local_commit_hash($settings = null)
{
    if (!is_array($settings)) {
        $settings = pdfstudio_load_admin_settings();
    }
    $gitHeadFile = PDFSTUDIO_ROOT . DIRECTORY_SEPARATOR . '.git' . DIRECTORY_SEPARATOR . 'HEAD';
    if (is_file($gitHeadFile)) {
        $headRaw = trim((string)@file_get_contents($gitHeadFile));
        if (strpos($headRaw, 'ref: ') === 0) {
            $refRel = trim(substr($headRaw, 5));
            $refFile = PDFSTUDIO_ROOT . DIRECTORY_SEPARATOR . '.git' . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $refRel);
            if (is_file($refFile)) {
                $sha = trim((string)@file_get_contents($refFile));
                if (preg_match('/^[0-9a-f]{7,40}$/i', $sha)) {
                    return substr($sha, 0, 7);
                }
            }
        } elseif (preg_match('/^[0-9a-f]{7,40}$/i', $headRaw)) {
            return substr($headRaw, 0, 7);
        }
    }
    if (!empty($settings['last_update_commit'])) {
        return substr(trim((string)$settings['last_update_commit']), 0, 7);
    }
    return '';
}

/**
 * Check GitHub repository for available updates (Version + Commit comparison)
 */
function pdfstudio_github_check_update($settings = null)
{
    if (!is_array($settings)) {
        $settings = pdfstudio_load_admin_settings();
    }
    $repo = isset($settings['github_repo']) && trim((string)$settings['github_repo']) !== ''
        ? trim((string)$settings['github_repo'])
        : 'uWiiiDev/PDF-Werkstatt-Pro';
    // Allow full URLs like https://github.com/uWiiiDev/PDF-Werkstatt-Pro.git
    $repo = preg_replace('#^https?://github\.com/#i', '', $repo);
    $repo = preg_replace('#\.git$#i', '', trim($repo, '/'));

    $branch = isset($settings['github_branch']) && trim((string)$settings['github_branch']) !== ''
        ? trim((string)$settings['github_branch'])
        : 'main';
    $token = isset($settings['github_token']) ? trim((string)$settings['github_token']) : '';

    if (!preg_match('#^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$#', $repo)) {
        return array(
            'ok'    => false,
            'error' => 'Ungültiges GitHub-Repository-Format (erwartet: Besitzer/Repository, z. B. uWiiiDev/PDF-Werkstatt-Pro).'
        );
    }

    $commitUrl = 'https://api.github.com/repos/' . $repo . '/commits/' . rawurlencode($branch);
    $res = pdfstudio_github_http_get($commitUrl, $token, 15);
    if (empty($res['ok'])) {
        return array(
            'ok'    => false,
            'error' => 'GitHub API konnte nicht abgefragt werden (' . (isset($res['error']) ? $res['error'] : 'Unbekannter Fehler') . ').'
        );
    }

    $commitData = @json_decode($res['body'], true);
    if (!is_array($commitData) || empty($commitData['sha'])) {
        return array(
            'ok'    => false,
            'error' => 'Unerwartete Antwort von GitHub API (Repository oder Branch "' . $branch . '" nicht gefunden).'
        );
    }

    $remoteFullSha  = (string)$commitData['sha'];
    $remoteShortSha = substr($remoteFullSha, 0, 7);
    $commitMsg      = isset($commitData['commit']['message']) ? trim((string)$commitData['commit']['message']) : 'Keine Commit-Nachricht';
    $commitAuthor   = isset($commitData['commit']['author']['name']) ? (string)$commitData['commit']['author']['name'] : 'GitHub';
    $commitDateRaw  = isset($commitData['commit']['committer']['date']) ? (string)$commitData['commit']['committer']['date'] : '';
    $commitDateFmt  = $commitDateRaw !== '' ? date('d.m.Y H:i:s', strtotime($commitDateRaw)) : '—';

    // Fetch remote includes/bootstrap.php by exact commit SHA (bypasses GitHub branch CDN cache)
    $remoteVersion = PDFSTUDIO_VERSION;
    $rawUrl = 'https://raw.githubusercontent.com/' . $repo . '/' . rawurlencode($remoteFullSha) . '/includes/bootstrap.php';
    $rawRes = pdfstudio_github_http_get($rawUrl, $token, 12);
    if (!empty($rawRes['ok']) && !empty($rawRes['body'])) {
        if (preg_match("/define\s*\(\s*['\"]PDFSTUDIO_VERSION['\"]\s*,\s*['\"]([^'\"]+)['\"]\s*\)/", $rawRes['body'], $m)) {
            $remoteVersion = trim($m[1]);
        }
    }

    $localVersion = PDFSTUDIO_VERSION;
    $localCommit  = pdfstudio_get_local_commit_hash($settings);

    $isNewerVersion = version_compare($remoteVersion, $localVersion, '>');
    $isDifferentSha = ($localCommit !== '' && strtolower($localCommit) !== strtolower($remoteShortSha));
    $updateAvailable = ($isNewerVersion || $isDifferentSha);

    pdfstudio_save_admin_settings(array(
        'last_update_check' => date('d.m.Y H:i:s')
    ));

    return array(
        'ok'               => true,
        'repo'             => $repo,
        'branch'           => $branch,
        'local_version'    => $localVersion,
        'remote_version'   => $remoteVersion,
        'local_commit'     => $localCommit !== '' ? $localCommit : '—',
        'remote_commit'    => $remoteShortSha,
        'remote_full_sha'  => $remoteFullSha,
        'commit_message'   => $commitMsg,
        'commit_author'    => $commitAuthor,
        'commit_date'      => $commitDateFmt,
        'update_available' => $updateAvailable,
        'checked_at'       => date('d.m.Y H:i:s')
    );
}

/**
 * Recursively remove a temporary directory inside storage/
 */
function pdfstudio_rrmdir_temp($dir)
{
    if (!is_dir($dir)) {
        return;
    }
    $items = @scandir($dir);
    if (is_array($items)) {
        foreach ($items as $item) {
            if ($item === '.' || $item === '..') {
                continue;
            }
            $path = $dir . DIRECTORY_SEPARATOR . $item;
            if (is_dir($path) && !is_link($path)) {
                pdfstudio_rrmdir_temp($path);
            } else {
                @unlink($path);
            }
        }
    }
    @rmdir($dir);
}

/**
 * Recursively copy extracted GitHub release files into PDFSTUDIO_ROOT while strictly preserving storage/, .git/ and config.local.php
 */
function pdfstudio_copy_update_tree($srcDir, $dstDir, $relPrefix = '', &$copiedCount = 0)
{
    $items = @scandir($srcDir);
    if (!is_array($items)) {
        return false;
    }
    if (!is_dir($dstDir)) {
        @mkdir($dstDir, 0755, true);
    }
    foreach ($items as $item) {
        if ($item === '.' || $item === '..') {
            continue;
        }
        $relPath = $relPrefix === '' ? $item : ($relPrefix . '/' . $item);
        // Never overwrite local runtime storage, git metadata or local config overrides
        if ($relPath === 'storage' || strpos($relPath, 'storage/') === 0 ||
            $relPath === '.git' || strpos($relPath, '.git/') === 0 ||
            $relPath === 'config.local.php') {
            continue;
        }
        $srcPath = $srcDir . DIRECTORY_SEPARATOR . $item;
        $dstPath = $dstDir . DIRECTORY_SEPARATOR . $item;
        if (is_dir($srcPath)) {
            if (!is_dir($dstPath)) {
                @mkdir($dstPath, 0755, true);
            }
            @chmod($dstPath, 0755);
            pdfstudio_copy_update_tree($srcPath, $dstPath, $relPath, $copiedCount);
        } else {
            if (@copy($srcPath, $dstPath)) {
                @chmod($dstPath, 0644);
                $copiedCount++;
            }
        }
    }
    return true;
}

/**
 * Download and install the latest version from GitHub directly into the application root
 * Preserves all files in storage/ (Admin settings, local users, statistics, vault)
 */
function pdfstudio_github_perform_update($settings = null)
{
    if (!is_array($settings)) {
        $settings = pdfstudio_load_admin_settings();
    }
    $check = pdfstudio_github_check_update($settings);
    if (empty($check['ok'])) {
        return $check;
    }

    if (!class_exists('ZipArchive')) {
        return array(
            'ok'    => false,
            'error' => 'Die PHP-Erweiterung "ZipArchive" (php-zip) ist auf diesem Webserver nicht aktiviert.'
        );
    }

    $repo   = $check['repo'];
    $branch = $check['branch'];
    $shaRef = !empty($check['remote_full_sha']) ? $check['remote_full_sha'] : $branch;
    $token  = isset($settings['github_token']) ? trim((string)$settings['github_token']) : '';

    // Download ZIP archive from GitHub by exact commit SHA (bypasses branch CDN cache)
    $zipUrl = 'https://api.github.com/repos/' . $repo . '/zipball/' . rawurlencode($shaRef);
    $dl = pdfstudio_github_http_get($zipUrl, $token, 60);
    if (empty($dl['ok']) || empty($dl['body']) || strlen($dl['body']) < 1000) {
        // Fallback to codeload URL for public repos
        $fallbackUrl = 'https://codeload.github.com/' . $repo . '/zip/' . rawurlencode($shaRef);
        $dl = pdfstudio_github_http_get($fallbackUrl, $token, 60);
        if (empty($dl['ok']) || empty($dl['body']) || strlen($dl['body']) < 1000) {
            return array(
                'ok'    => false,
                'error' => 'Download des Update-Pakets von GitHub fehlgeschlagen (' . (isset($dl['error']) ? $dl['error'] : 'Leeres Archiv') . ').'
            );
        }
    }

    $tmpZip = PDFSTUDIO_STORAGE . DIRECTORY_SEPARATOR . 'github_update_' . time() . '.zip';
    $tmpExtractDir = PDFSTUDIO_STORAGE . DIRECTORY_SEPARATOR . 'github_update_extract_' . time();

    if (@file_put_contents($tmpZip, $dl['body']) === false) {
        return array(
            'ok'    => false,
            'error' => 'Update-Archiv konnte nicht im Verzeichnis storage/ zwischengespeichert werden (Schreibrechte prüfen).'
        );
    }

    $zip = new ZipArchive();
    if ($zip->open($tmpZip) !== true) {
        @unlink($tmpZip);
        return array(
            'ok'    => false,
            'error' => 'Heruntergeladenes GitHub-ZIP-Archiv konnte nicht geöffnet werden.'
        );
    }

    @mkdir($tmpExtractDir, 0700, true);
    $extracted = @$zip->extractTo($tmpExtractDir);
    $zip->close();
    @unlink($tmpZip);

    if (!$extracted) {
        pdfstudio_rrmdir_temp($tmpExtractDir);
        return array(
            'ok'    => false,
            'error' => 'Entpacken des GitHub-Archivs fehlgeschlagen.'
        );
    }

    // Locate inner root folder created by GitHub zipball (e.g. uWiiiDev-PDF-Werkstatt-Pro-ffeec5b/)
    $subItems = @scandir($tmpExtractDir);
    $sourceRoot = $tmpExtractDir;
    if (is_array($subItems)) {
        foreach ($subItems as $si) {
            if ($si === '.' || $si === '..') {
                continue;
            }
            $candidate = $tmpExtractDir . DIRECTORY_SEPARATOR . $si;
            if (is_dir($candidate) && is_file($candidate . DIRECTORY_SEPARATOR . 'index.php')) {
                $sourceRoot = $candidate;
                break;
            }
        }
    }

    if (!is_file($sourceRoot . DIRECTORY_SEPARATOR . 'index.php')) {
        pdfstudio_rrmdir_temp($tmpExtractDir);
        return array(
            'ok'    => false,
            'error' => 'Das heruntergeladene GitHub-Archiv enthält keine gültige PDF-Werkstatt Pro Installation (index.php fehlt).'
        );
    }

    $copiedFiles = 0;
    pdfstudio_copy_update_tree($sourceRoot, PDFSTUDIO_ROOT, '', $copiedFiles);
    pdfstudio_rrmdir_temp($tmpExtractDir);

    if ($copiedFiles === 0) {
        return array(
            'ok'    => false,
            'error' => 'Es konnten keine Programmdateien überschrieben werden. Bitte Schreibrechte des Webserver-Benutzers (z. B. www-data) für das Anwendungsverzeichnis prüfen.'
        );
    }

    // Update local .git commit ref if .git exists and is writable
    $gitHeadFile = PDFSTUDIO_ROOT . DIRECTORY_SEPARATOR . '.git' . DIRECTORY_SEPARATOR . 'HEAD';
    if (is_file($gitHeadFile) && !empty($check['remote_full_sha'])) {
        $headRaw = trim((string)@file_get_contents($gitHeadFile));
        if (strpos($headRaw, 'ref: ') === 0) {
            $refRel = trim(substr($headRaw, 5));
            $refFile = PDFSTUDIO_ROOT . DIRECTORY_SEPARATOR . '.git' . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $refRel);
            if (is_file($refFile) && is_writable($refFile)) {
                @file_put_contents($refFile, $check['remote_full_sha'] . "\n");
            }
        }
    }

    $nowStr = date('d.m.Y H:i:s');
    pdfstudio_save_admin_settings(array(
        'last_update_check'  => $nowStr,
        'last_update_at'     => $nowStr,
        'last_update_commit' => $check['remote_commit']
    ));

    if (function_exists('opcache_reset')) {
        @opcache_reset();
    }

    return array(
        'ok'             => true,
        'copied_files'   => $copiedFiles,
        'remote_version' => $check['remote_version'],
        'remote_commit'  => $check['remote_commit'],
        'commit_message' => $check['commit_message'],
        'updated_at'     => $nowStr
    );
}

