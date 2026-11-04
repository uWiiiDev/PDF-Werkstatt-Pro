<?php
/**
 * ============================================================================
 * PDF-Werkstatt Pro (v1.0) — Zentrale Administrator-Konfigurationsdatei (config.php)
 * ============================================================================
 * In dieser Datei koennen Administratoren den SMTP-Mailserver, die offizielle
 * Absenderadresse sowie das Speicherplatz-Kontingent (Quota) pro Benutzerkonto
 * zentral konfigurieren.
 *
 * Kompatibel ab PHP 5.4.0 bis PHP 8.4+
 */

if (!defined('PDFSTUDIO_INIT')) {
    if (function_exists('http_response_code')) {
        http_response_code(403);
    }
    exit('Direct access not permitted.');
}

return array(

    // ========================================================================
    // 1. E-MAIL & SMTP-SERVER KONFIGURATION
    //    (Fuer Passwort-Zuruecksetzung & Dokumenten-Freigaben per E-Mail)
    // ========================================================================

    // Versand-Methode:
    //   'smtp' = Direkter Versand ueber den unten angegebenen SMTP-Server (empfohlen)
    //   'mail' = Versand ueber die Standard-PHP-Funktion mail() des Webservers
    'mail_transport'    => 'smtp',

    // Offizielle Absender-E-Mail-Adresse und Absender-Name:
    'mail_from_address' => 'noreply@pdf-werkstatt.local',
    'mail_from_name'    => 'PDF-Werkstatt Pro',

    // SMTP-Server Einstellungen (wird genutzt, wenn mail_transport = 'smtp' und smtp_host gesetzt ist):
    'smtp_host'         => '',          // z. B. 'smtp.ihre-organisation.de' oder '127.0.0.1' (leer = Fallback auf PHP mail())
    'smtp_port'         => 587,         // Standard-Ports: 587 (STARTTLS), 465 (SSL/TLS) oder 25 (Unverschluesselt / Intranet-Relay)
    'smtp_encryption'   => 'tls',       // 'tls' (STARTTLS), 'ssl' (Implizites SSL auf Port 465) oder '' (keine Verschluesselung)
    'smtp_auth'         => true,        // true = Anmeldung mit Benutzername/Passwort, false = IP-basiertes Intranet-Relay ohne Auth
    'smtp_username'     => '',          // SMTP-Benutzername / Postfach
    'smtp_password'     => '',          // SMTP-Passwort
    'smtp_timeout'      => 10,          // Verbindungs-Timeout in Sekunden


    // ========================================================================
    // 2. SPEICHERPLATZ-KONTINGENT (QUOTA) PRO BENUTZERKONTO
    // ========================================================================

    // Maximaler Speicherplatz pro registriertem Benutzerkonto in Megabyte (MB):
    // Setzen Sie den Wert auf 0 fuer unbegrenzten Speicherplatz.
    'user_quota_mb'             => 250,

    // Maximaler Gesamtspeicherplatz fuer den oeffentlichen Gast-Tresor in Megabyte (MB):
    'public_quota_mb'           => 100,

    // Sollen automatische Dateiversionen und editierbare Projektdaten (.raw / .proj.json)
    // auf das Speicherplatz-Kontingent des Benutzers angerechnet werden?
    'include_versions_in_quota' => true,

    // Maximale Anzahl automatisch aufbewahrter Vorversionen pro PDF-Dokument im Tresor:
    'max_versions_per_file'     => 15,


    // ========================================================================
    // 3. SICHERHEITS- & BRUTE-FORCE-SCHUTZ EINSTELLUNGEN
    // ========================================================================

    // Maximale Anzahl fehlgeschlagener Anmelde-/Passwort-Reset-Versuche pro IP innerhalb des Zeitfensters:
    'max_login_attempts'        => 8,
    'login_lockout_seconds'     => 300,

    // Sicherheit beim Passwort-Reset:
    // false = Zuruecksetzungs-Link wird NIEMALS im Browser-JSON ausgegeben, sondern ausschliesslich per E-Mail/Log zugestellt (Produktiv-Empfehlung!)
    // true  = Nur fuer lokale Testsysteme ohne Mailserver: Zeigt den Reset-Link als Fallback-Button an, falls kein Mailversand moeglich war
    'expose_reset_link_on_local_fallback' => false

);
