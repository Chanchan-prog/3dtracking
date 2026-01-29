<?php
// server-php/api/qrcode.php
// Generate a QR PNG on the server using endroid/qr-code (composer package).

// Ensure vendor autoload already included by index.php; if called directly, include it.
if (file_exists(__DIR__ . '/../vendor/autoload.php')) {
    require_once __DIR__ . '/../vendor/autoload.php';
}

use Endroid\QrCode\Builder\Builder;
use Endroid\QrCode\Writer\PngWriter;
use Endroid\QrCode\ErrorCorrectionLevel;

// Accept GET /api/qrcode?data=...
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if (empty($_GET['data'])) {
    header('Content-Type: application/json');
    http_response_code(400);
    echo json_encode(['error' => 'missing_data']);
    exit;
}

$data = (string) $_GET['data'];
$size = isset($_GET['size']) ? (int)$_GET['size'] : 240;
$margin = isset($_GET['margin']) ? (int)$_GET['margin'] : 0;

try {
    // Instantiate Builder (installed endroid version uses instance builder)
    $builder = new Builder();

    // Call build() providing overrides: data, error correction, size, margin
    $result = $builder->build(
        null, // writer (use default)
        null, // writerOptions
        null, // validateResult
        $data, // data
        null, // encoding
        ErrorCorrectionLevel::High, // error correction
        $size, // size
        $margin // margin
    );

    // Output PNG
    header('Content-Type: image/png');
    header('Cache-Control: private, max-age=86400');
    echo $result->getString();
    exit;
} catch (Throwable $e) {
    error_log('[qrcode] Generation failed: ' . $e->getMessage());
    header('Content-Type: application/json');
    http_response_code(500);
    echo json_encode(['error' => 'qr_generation_failed', 'message' => $e->getMessage()]);
    exit;
}