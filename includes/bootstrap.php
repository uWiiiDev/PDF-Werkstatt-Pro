<?php
/**
 * PDF-Werkstatt Pro - Desktop Web Suite (Version 1.0)
 * Bootstrap & Pure PHP 5.4+ Helper Functions (No shell_exec required)
 * Compatible with PHP 5.4.0 through PHP 8.4+
 */

if (!defined('PDFSTUDIO_INIT')) {
    define('PDFSTUDIO_INIT', true);
}

define('PDFSTUDIO_VERSION', '1.4.5');
if (!defined('PDFSTUDIO_ROOT')) {
    define('PDFSTUDIO_ROOT', dirname(__DIR__));
}
define('PDFSTUDIO_STORAGE', PDFSTUDIO_ROOT . DIRECTORY_SEPARATOR . 'storage');
define('PDFSTUDIO_CONFIG_FILE', PDFSTUDIO_ROOT . DIRECTORY_SEPARATOR . 'config.php');

// Ensure timezone is set (required in PHP 5.4/5.5 if php.ini lacks date.timezone)
if (function_exists('date_default_timezone_set')) {
    $tz = @date_default_timezone_get();
    if (!$tz) {
        $tz = 'Europe/Berlin';
    }
    @date_default_timezone_set($tz);
}

// Pure-PHP fallback if php5-json extension is missing on older PHP 5.5 Debian/Ubuntu servers
if (!function_exists('json_encode')) {
    function json_encode($val, $options = 0)
    {
        if (is_null($val)) return 'null';
        if (is_bool($val)) return $val ? 'true' : 'false';
        if (is_int($val) || is_float($val)) return (string)$val;
        if (is_string($val)) {
            $escaped = str_replace(
                array('\\', '"', "\r", "\n", "\t", '/'),
                array('\\\\', '\\"', '\\r', '\\n', '\\t', '\\/'),
                $val
            );
            return '"' . $escaped . '"';
        }
        if (is_array($val)) {
            $isList = (array_keys($val) === range(0, count($val) - 1));
            $items = array();
            foreach ($val as $k => $v) {
                $items[] = ($isList ? '' : json_encode((string)$k) . ':') . json_encode($v);
            }
            return $isList ? '[' . implode(',', $items) . ']' : '{' . implode(',', $items) . '}';
        }
        return 'null';
    }
}

if (!function_exists('json_decode')) {
    function json_decode($json, $assoc = false)
    {
        $json = trim((string)$json);
        if ($json === '' || $json === 'null') return null;
        if ($json === 'true') return true;
        if ($json === 'false') return false;
        if (is_numeric($json)) return (strpos($json, '.') !== false) ? (float)$json : (int)$json;
        if ($json[0] === '"' && substr($json, -1) === '"') {
            return stripcslashes(substr($json, 1, -1));
        }
        // Safe token-based parser for flat/nested JSON objects & arrays
        $len = strlen($json);
        $pos = 0;
        $parseVal = null;
        $skipWs = function () use ($json, $len, &$pos) {
            while ($pos < $len && ($json[$pos] === ' ' || $json[$pos] === "\t" || $json[$pos] === "\r" || $json[$pos] === "\n")) {
                $pos++;
            }
        };
        $parseStr = function () use ($json, $len, &$pos) {
            if ($pos >= $len || $json[$pos] !== '"') return '';
            $pos++;
            $out = '';
            while ($pos < $len) {
                $ch = $json[$pos++];
                if ($ch === '"') return $out;
                if ($ch === '\\' && $pos < $len) {
                    $esc = $json[$pos++];
                    if ($esc === 'n') $out .= "\n";
                    elseif ($esc === 'r') $out .= "\r";
                    elseif ($esc === 't') $out .= "\t";
                    elseif ($esc === '"' || $esc === '\\' || $esc === '/') $out .= $esc;
                    elseif ($esc === 'u' && ($pos + 4) <= $len) {
                        $hex = substr($json, $pos, 4);
                        $pos += 4;
                        $out .= html_entity_decode('&#x' . $hex . ';', ENT_NOQUOTES, 'UTF-8');
                    } else $out .= $esc;
                } else {
                    $out .= $ch;
                }
            }
            return $out;
        };
        $parseVal = function () use ($json, $len, &$pos, $assoc, &$parseVal, &$skipWs, &$parseStr) {
            $skipWs();
            if ($pos >= $len) return null;
            $ch = $json[$pos];
            if ($ch === '"') return $parseStr();
            if ($ch === '{') {
                $pos++;
                $res = array();
                $skipWs();
                if ($pos < $len && $json[$pos] === '}') {
                    $pos++;
                    return $assoc ? $res : (object)$res;
                }
                while ($pos < $len) {
                    $skipWs();
                    $key = $parseStr();
                    $skipWs();
                    if ($pos < $len && $json[$pos] === ':') $pos++;
                    $val = $parseVal();
                    $res[$key] = $val;
                    $skipWs();
                    if ($pos < $len && $json[$pos] === ',') {
                        $pos++;
                        continue;
                    }
                    if ($pos < $len && $json[$pos] === '}') {
                        $pos++;
                        break;
                    }
                    break;
                }
                return $assoc ? $res : (object)$res;
            }
            if ($ch === '[') {
                $pos++;
                $res = array();
                $skipWs();
                if ($pos < $len && $json[$pos] === ']') {
                    $pos++;
                    return $res;
                }
                while ($pos < $len) {
                    $res[] = $parseVal();
                    $skipWs();
                    if ($pos < $len && $json[$pos] === ',') {
                        $pos++;
                        continue;
                    }
                    if ($pos < $len && $json[$pos] === ']') {
                        $pos++;
                        break;
                    }
                    break;
                }
                return $res;
            }
            $start = $pos;
            while ($pos < $len && strpos(",]} \t\r\n", $json[$pos]) === false) {
                $pos++;
            }
            $lit = substr($json, $start, $pos - $start);
            if ($lit === 'true') return true;
            if ($lit === 'false') return false;
            if ($lit === 'null') return null;
            if (is_numeric($lit)) return (strpos($lit, '.') !== false) ? (float)$lit : (int)$lit;
            return $lit;
        };
        return $parseVal();
    }
}

// Harden session configuration before starting session (PHP 5.4/5.5+ compatible)
@ini_set('session.use_only_cookies', '1');
@ini_set('session.cookie_httponly', '1');
@ini_set('session.use_strict_mode', '1');
@ini_set('session.cookie_samesite', 'Lax');

// Ensure session save path is writable; fallback to storage/sessions if system /var/lib/php5 is locked
$sysSessPath = @session_save_path();
if ($sysSessPath !== '' && strpos($sysSessPath, ';') === false && !@is_writable($sysSessPath)) {
    $localSessDir = PDFSTUDIO_STORAGE . DIRECTORY_SEPARATOR . 'sessions';
    if (!is_dir($localSessDir)) {
        @mkdir($localSessDir, 0700, true);
    }
    if (is_dir($localSessDir) && is_writable($localSessDir)) {
        @session_save_path($localSessDir);
    }
}

$isHttps = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
    || (isset($_SERVER['SERVER_PORT']) && (int)$_SERVER['SERVER_PORT'] === 443)
    || (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && strtolower((string)$_SERVER['HTTP_X_FORWARDED_PROTO']) === 'https');

if (function_exists('session_status')) {
    if (session_status() === PHP_SESSION_NONE) {
        @session_set_cookie_params(0, '/', '', $isHttps, true);
        @session_start();
    }
} else {
    if (session_id() === '') {
        @session_set_cookie_params(0, '/', '', $isHttps, true);
        @session_start();
    }
}

// Send defensive HTTP security headers on all PHP responses
if (!headers_sent()) {
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: SAMEORIGIN');
    header('Referrer-Policy: strict-origin-when-cross-origin');
    header('Permissions-Policy: camera=(), microphone=(), geolocation=()');
    header("Content-Security-Policy: default-src 'self' blob: data:; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' blob: data:; worker-src 'self' blob:; frame-src 'self' blob: data:; frame-ancestors 'self'; object-src 'none'; base-uri 'self'");
}

$GLOBALS['PDFSTUDIO_CONFIG'] = array();
$GLOBALS['PDFSTUDIO_BASE_CONFIG'] = array();
if (is_file(PDFSTUDIO_CONFIG_FILE)) {
    $loadedCfg = include PDFSTUDIO_CONFIG_FILE;
    if (is_array($loadedCfg)) {
        $GLOBALS['PDFSTUDIO_CONFIG'] = $loadedCfg;
        $GLOBALS['PDFSTUDIO_BASE_CONFIG'] = $loadedCfg;
    }
}

/**
 * Retrieve a configuration value from config.php with fallback default
 */
function pdfstudio_config($key, $default = null)
{
    if (isset($GLOBALS['PDFSTUDIO_CONFIG']) && is_array($GLOBALS['PDFSTUDIO_CONFIG']) && array_key_exists($key, $GLOBALS['PDFSTUDIO_CONFIG'])) {
        return $GLOBALS['PDFSTUDIO_CONFIG'][$key];
    }
    return $default;
}

/**
 * Initialize storage directory and security files
 */
function pdfstudio_init_storage()
{
    if (!is_dir(PDFSTUDIO_STORAGE)) {
        @mkdir(PDFSTUDIO_STORAGE, 0775, true);
    }

    // Self-heal if an index.html file was accidentally copied into the application root directory
    $rootIndexHtml = PDFSTUDIO_ROOT . DIRECTORY_SEPARATOR . 'index.html';
    if (is_file($rootIndexHtml)) {
        @unlink($rootIndexHtml);
    }

    // Deny direct HTTP access to storage/ without using 'Options -Indexes' (which triggers HTTP 500 if AllowOverride Options is off)
    $htaccess = PDFSTUDIO_STORAGE . DIRECTORY_SEPARATOR . '.htaccess';
    $rules = "<IfModule mod_authz_core.c>\n"
           . "    Require all denied\n"
           . "</IfModule>\n"
           . "<IfModule !mod_authz_core.c>\n"
           . "    Order Allow,Deny\n"
           . "    Deny from all\n"
           . "</IfModule>\n";

    // Only perform disk writes & chmod normalization when .htaccess is missing or outdated
    if (!is_file($htaccess) || (int)@filesize($htaccess) !== strlen($rules)) {
        @file_put_contents($htaccess, $rules);
        @chmod(PDFSTUDIO_ROOT, 0755);
        foreach (array('index.php', 'admin.php', 'api.php', 'hilfe.php', 'diagnose.php', 'config.php', '.htaccess') as $rootFile) {
            $rfPath = PDFSTUDIO_ROOT . DIRECTORY_SEPARATOR . $rootFile;
            if (is_file($rfPath)) {
                @chmod($rfPath, 0644);
            }
        }
    }

    $incIndex = __DIR__ . DIRECTORY_SEPARATOR . 'index.html';
    if (!is_file($incIndex)) {
        @file_put_contents($incIndex, '<!DOCTYPE html><html><head><meta charset="utf-8"><title>403</title></head><body></body></html>');
    }

    $indexFile = PDFSTUDIO_STORAGE . DIRECTORY_SEPARATOR . 'index.html';
    if (!is_file($indexFile)) {
        @file_put_contents($indexFile, '<!DOCTYPE html><html><head><meta charset="utf-8"><title>403</title></head><body></body></html>');
    }
}

/**
 * Convert PHP ini shorthand byte values (e.g. 64M, 128M) to integer bytes
 */
function pdfstudio_parse_size($size)
{
    $size = trim((string)$size);
    if ($size === '') {
        return 0;
    }
    $last = strtolower(substr($size, -1));
    $value = (float)$size;
    switch ($last) {
        case 'g':
            $value *= 1024;
            // fallthrough
        case 'm':
            $value *= 1024;
            // fallthrough
        case 'k':
            $value *= 1024;
            break;
    }
    return (int)round($value);
}

/**
 * Format byte size to human-readable string
 */
function pdfstudio_format_bytes($bytes, $precision = 1)
{
    $bytes = max(0, (int)$bytes);
    $units = array('B', 'KB', 'MB', 'GB', 'TB');
    $pow = floor(($bytes ? log($bytes) : 0) / log(1024));
    $pow = min($pow, count($units) - 1);
    $bytes /= pow(1024, $pow);
    return round($bytes, $precision) . ' ' . $units[$pow];
}

/**
 * Sanitize filename for safe storage on disk
 */
function pdfstudio_sanitize_filename($filename)
{
    $filename = basename((string)$filename);
    $filename = preg_replace('/[^a-zA-Z0-9_\-\.]/', '_', $filename);
    $filename = preg_replace('/_+/', '_', $filename);
    $filename = trim($filename, '._');
    if ($filename === '' || $filename === '.pdf') {
        $filename = 'dokument_' . date('Ymd_His') . '.pdf';
    }
    if (strtolower(substr($filename, -4)) !== '.pdf') {
        $filename .= '.pdf';
    }
    return $filename;
}

/**
 * Inspect a PDF file or binary string in pure PHP 5.4+ (without external libraries or exec)
 * Extracts PDF version, approximate page count, encryption flag, and basic info dictionary strings.
 */
function pdfstudio_inspect_pdf_binary($content)
{
    $info = array(
        'valid' => false,
        'version' => '1.4',
        'pages' => 0,
        'encrypted' => false,
        'linearized' => false,
        'size' => strlen($content)
    );

    if (strncmp($content, '%PDF-', 5) !== 0) {
        return $info;
    }

    $info['valid'] = true;
    if (preg_match('/^%PDF-(\d+\.\d+)/', substr($content, 0, 32), $m)) {
        $info['version'] = $m[1];
    }

    if (strpos($content, '/Encrypt') !== false) {
        $info['encrypted'] = true;
    }
    if (strpos(substr($content, 0, 2048), '/Linearized') !== false) {
        $info['linearized'] = true;
    }

    // Count /Type /Page (excluding /Type /Pages)
    $pageMatches = preg_match_all('/\/Type\s*\/Page\b(?!s)/', $content, $matches);
    if ($pageMatches && $pageMatches > 0) {
        $info['pages'] = (int)$pageMatches;
    } elseif (preg_match_all('/\/Count\s+(\d+)/', $content, $countMatches)) {
        $maxCount = 0;
        foreach ($countMatches[1] as $c) {
            if ((int)$c > $maxCount) {
                $maxCount = (int)$c;
            }
        }
        $info['pages'] = $maxCount;
    }

    return $info;
}

/**
 * Pure PHP 5.4+ PDF Accessibility (Barrierefreiheit / PDF/UA / BITV 2.0) Inspector
 * Checks raw PDF binary structure for key accessibility requirements.
 */
function pdfstudio_audit_accessibility($content)
{
    $basic = pdfstudio_inspect_pdf_binary($content);
    $hasLang = (bool)preg_match('/\/Lang\s*\(([^)]+)\)/', $content, $langMatch);
    $langVal = $hasLang ? trim($langMatch[1]) : '';

    $hasDisplayDocTitle = (bool)preg_match('/\/DisplayDocTitle\s+true\b/i', $content);
    $hasMarkedTrue = (bool)preg_match('/\/Marked\s+true\b/i', $content);
    $hasStructTree = (strpos($content, '/StructTreeRoot') !== false);
    $hasOutlines = (strpos($content, '/Outlines') !== false);
    $hasPdfUaId = (strpos($content, 'pdfuaid:part') !== false);
    $hasTitle = (bool)preg_match('/\/Title\s*\(([^)]+)\)/', $content, $titleMatch) && trim($titleMatch[1]) !== '';
    if (!$hasTitle && strpos($content, '<dc:title>') !== false) {
        $hasTitle = true;
    }

    return array(
        'valid' => $basic['valid'],
        'pages' => $basic['pages'],
        'has_title' => $hasTitle,
        'has_display_doc_title' => $hasDisplayDocTitle,
        'has_lang' => $hasLang,
        'lang' => $langVal,
        'has_marked' => $hasMarkedTrue,
        'has_struct_tree' => $hasStructTree,
        'has_pdfua_xmp' => $hasPdfUaId,
        'has_outlines' => $hasOutlines,
        'not_encrypted' => !$basic['encrypted']
    );
}

/**
 * Get server diagnostic & environment capabilities (PHP 5.4+ safe)
 */
function pdfstudio_get_server_info()
{
    $uploadMax = pdfstudio_parse_size(ini_get('upload_max_filesize'));
    $postMax = pdfstudio_parse_size(ini_get('post_max_size'));
    $memLimit = pdfstudio_parse_size(ini_get('memory_limit'));
    $effectiveMax = min($uploadMax > 0 ? $uploadMax : 67108864, $postMax > 0 ? $postMax : 67108864);

    return array(
        'app_version' => PDFSTUDIO_VERSION,
        'php_version' => PHP_VERSION,
        'php_54_compatible' => version_compare(PHP_VERSION, '5.4.0', '>='),
        'sapi' => php_sapi_name(),
        'upload_max_filesize' => ini_get('upload_max_filesize'),
        'post_max_size' => ini_get('post_max_size'),
        'memory_limit' => ini_get('memory_limit'),
        'effective_max_bytes' => $effectiveMax,
        'effective_max_formatted' => pdfstudio_format_bytes($effectiveMax),
        'extensions' => array(
            'zlib' => extension_loaded('zlib'),
            'gd' => extension_loaded('gd'),
            'mbstring' => extension_loaded('mbstring'),
            'iconv' => extension_loaded('iconv'),
            'json' => extension_loaded('json'),
            'zip' => extension_loaded('zip')
        ),
        'storage_writable' => is_dir(PDFSTUDIO_STORAGE) && is_writable(PDFSTUDIO_STORAGE),
        'mode' => 'Pure Webspace (PHP 5.4+ & Smart Browser Engine, no shell_exec)',
        'mail_transport' => (string)pdfstudio_config('mail_transport', 'smtp'),
        'mail_from_address' => (string)pdfstudio_config('mail_from_address', 'noreply@localhost'),
        'mail_from_name' => (string)pdfstudio_config('mail_from_name', 'PDF-Werkstatt Pro'),
        'smtp_configured' => trim((string)pdfstudio_config('smtp_host', '')) !== '',
        'smtp_host' => (string)pdfstudio_config('smtp_host', ''),
        'smtp_port' => (int)pdfstudio_config('smtp_port', 587),
        'user_quota_mb' => (float)pdfstudio_config('user_quota_mb', 250),
        'public_quota_mb' => (float)pdfstudio_config('public_quota_mb', 100)
    );
}

pdfstudio_init_storage();
require_once __DIR__ . '/account.php';
pdfstudio_init_account_storage();
pdfstudio_load_admin_settings();
if (!pdfstudio_storage_exists(PDFSTUDIO_STATS_TXT)) {
    pdfstudio_save_stats_and_report(pdfstudio_load_stats());
}
