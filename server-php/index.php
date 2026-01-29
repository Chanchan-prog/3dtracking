<?php
// server-php/index.php

// 1. DISABLE COMPRESSION (Crucial fix for HTTP2 Protocol Error)
ini_set('zlib.output_compression', 'Off');
ini_set('output_buffering', 'Off');
ini_set('output_handler', '');

// Start output buffering so any stray output can be cleaned before JSON responses
ob_start();

// 2. DISABLE WARNINGS (Keep JSON clean)
error_reporting(E_ALL & ~E_DEPRECATED & ~E_STRICT & ~E_NOTICE & ~E_WARNING);
ini_set('display_errors', 0);

// Load security config
$security = [];
if (file_exists(__DIR__ . '/config/security.php')) {
    $security = require __DIR__ . '/config/security.php';
}

// Configure error logging to file while keeping display_errors off
if (!empty($security['error_log'])) {
    ini_set('log_errors', '1');
    ini_set('error_log', $security['error_log']);
}

// 3. HANDLE CORS (Allow Mobile Access)
// Dynamic CORS: restrict to allowed_origins list if it's not '*'
$allowed = $security['allowed_origins'] ?? ['*'];
$requestOrigin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array('*', $allowed) || $requestOrigin === '') {
    header("Access-Control-Allow-Origin: *");
} else {
    // If origin matches allowed list, reflect it; otherwise deny
    foreach ($allowed as $ao) {
        if ($ao && stripos($requestOrigin, $ao) !== false) {
            header('Access-Control-Allow-Origin: ' . $requestOrigin);
            break;
        }
    }
}
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS, PUT, DELETE");

// 4. HANDLE PREFLIGHT (Mobile Check)
if ($_SERVER['REQUEST_METHOD'] == 'OPTIONS') {
    http_response_code(200);
    exit;
}

// 5. LOAD APP
require_once __DIR__ . '/config/database.php';
// Note: functions.php includes vendor/autoload, so we don't need to duplicate it if functions is loaded.
// But to be safe/consistent with your structure:
require_once __DIR__ . '/vendor/autoload.php'; 
require_once __DIR__ . '/helpers/functions.php';

// 6. ROUTING
$request_uri = $_SERVER['REQUEST_URI'];
$path = parse_url($request_uri, PHP_URL_PATH);
$parts = explode('/', $path);

$api_prefix_key = array_search('api', $parts);
$endpoint_root = null;
if ($api_prefix_key !== false && isset($parts[$api_prefix_key + 1])) {
    $endpoint_root = $parts[$api_prefix_key + 1];
}

switch ($endpoint_root) {
    case 'dashboard':
        require_once __DIR__ . '/api/dashboard.php';
        break;
    case 'attendance':
        require_once __DIR__ . '/api/attendance.php';
        break;
    case 'qrcode':
        require_once __DIR__ . '/api/qrcode.php';
        break;
    case 'buildings':
    case 'rooms':
    case 'floors':
        require_once __DIR__ . '/api/locations.php';
        break;
    case 'login':
    case 'roles':
    case 'users':
    case 'teachers':
    case 'deans':
    case 'sessions':
    case 'year-levels':
    case 'offerings':
    case 'class-schedules':
    case 'departments':
    case 'programs':
    case 'sections':
    case 'semesters':
    case 'subjects':
    case 'subject-offerings':
        require_once __DIR__ . '/api/main.php';
        break;
    default:
        http_response_code(404);
        header('Content-Type: application/json');
        echo json_encode(['error' => 'API endpoint not found']);
        break;
}