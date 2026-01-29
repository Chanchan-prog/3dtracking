<?php
// server-php/config/security.php
// Security-related configuration. Keep secrets out of VCS by overriding via environment variables.
$security = [
    // Use an environment variable if available, otherwise the default. Replace in production.
    // if leave blank not secure.

    'jwt_secret' => getenv('JWT_SECRET') ?: 'your-secret-key',

    // Allowed origins for CORS. In production list only your domains/tunnels.
    'allowed_origins' => [
        'https://pg7tj9bp-8000.asse.devtunnels.ms',
        'http://localhost:8000',
        'http://localhost',
        'http://127.0.0.1',
    ],

    // Error log file (will be created automatically)
    'error_log' => __DIR__ . '/../logs/php-errors.log',
];

// Ensure logs directory exists
$logDir = __DIR__ . '/../logs';
if (!is_dir($logDir)) @mkdir($logDir, 0755, true);

return $security;
