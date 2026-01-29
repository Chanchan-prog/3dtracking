<?php
// server-php/api/user_profile.php

// If this script is requested directly (not via index.php router), ensure the app bootstrap is available
if (!isset($GLOBALS['mysqli']) || $GLOBALS['mysqli'] === null) {
    if (file_exists(__DIR__ . '/../config/database.php')) {
        require_once __DIR__ . '/../config/database.php';
    }
    if (file_exists(__DIR__ . '/../vendor/autoload.php')) {
        require_once __DIR__ . '/../vendor/autoload.php';
    }
}

// Ensure helper functions are loaded (json_response etc.)
if (!function_exists('json_response')) {
    require_once __DIR__ . '/../helpers/functions.php';
}

global $mysqli;

$request_method = $_SERVER['REQUEST_METHOD'];

if ($request_method === 'GET') {
    $user_id = isset($_GET['user_id']) ? (int)$_GET['user_id'] : null;
    if (!$user_id) json_response(['ok' => false, 'error' => 'missing_user_id'], 400);

    $stmt = $mysqli->prepare("SELECT user_id, first_name, last_name, email, image FROM tbl_users WHERE user_id = ? LIMIT 1");
    if (!$stmt) json_response(['ok' => false, 'error' => 'db_prepare_failed', 'details' => $mysqli->error], 500);
    $stmt->bind_param('i', $user_id);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    if (!$row) json_response(['ok' => false, 'error' => 'user_not_found'], 404);

    // Normalize avatar output: return as `avatar` (data URL) if image column present
    $avatar = null;
    if (!empty($row['image'])) {
        // assume stored as data URL already; otherwise, if raw base64 detect and convert
        $img = $row['image'];
        if (strpos($img, 'data:') === 0) {
            $avatar = $img;
        } else {
            // unknown legacy format: treat as base64 and default to image/png
            $avatar = 'data:image/png;base64,' . $img;
        }
    }

    $out = [
        'ok' => true,
        'user' => [
            'user_id' => (int)$row['user_id'],
            'first_name' => $row['first_name'],
            'last_name' => $row['last_name'],
            'email' => $row['email'],
            'avatar' => $avatar
        ]
    ];

    json_response($out);

} elseif ($request_method === 'POST') {
    // Expect multipart/form-data with user_id and avatar file
    // Ensure a file was uploaded
    if (empty($_POST['user_id'])) json_response(['ok' => false, 'error' => 'missing_user_id'], 400);
    $user_id = (int)$_POST['user_id'];

    if (empty($_FILES) || empty($_FILES['avatar']) || $_FILES['avatar']['error'] !== UPLOAD_ERR_OK) {
        json_response(['ok' => false, 'error' => 'missing_file_or_upload_error'], 400);
    }

    $file = $_FILES['avatar'];
    // Basic size limit (e.g., 4MB upload allowed) — we'll still recompress before storing
    $maxUploadBytes = 4_000_000;
    if ($file['size'] > $maxUploadBytes) json_response(['ok' => false, 'error' => 'file_too_large'], 400);

    // Determine mime type more reliably
    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mime = finfo_file($finfo, $file['tmp_name']);
    finfo_close($finfo);
    $allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!in_array($mime, $allowed)) {
        json_response(['ok' => false, 'error' => 'unsupported_mime', 'allowed' => $allowed], 400);
    }

    // Try to load image and resample/recompress to reduce size before storing
    $img = null;
    if ($mime === 'image/jpeg') $img = @imagecreatefromjpeg($file['tmp_name']);
    elseif ($mime === 'image/png') $img = @imagecreatefrompng($file['tmp_name']);
    elseif ($mime === 'image/webp') $img = @imagecreatefromwebp($file['tmp_name']);

    if ($img === false || $img === null) {
        // fallback: read raw data but may fail later due to packet size
        $data = file_get_contents($file['tmp_name']);
        if ($data === false) json_response(['ok' => false, 'error' => 'failed_read_file'], 500);
        $b64 = base64_encode($data);
        $dataUrl = 'data:' . $mime . ';base64,' . $b64;
    } else {
        // Recompress/resample to max dimension to reduce storage size
        $maxDim = 800; // px
        $w = imagesx($img);
        $h = imagesy($img);
        $scale = min(1, $maxDim / max($w, $h));
        $nw = (int)max(1, floor($w * $scale));
        $nh = (int)max(1, floor($h * $scale));
        $tmp = imagecreatetruecolor($nw, $nh);
        // Preserve transparency for PNG/WebP
        if ($mime === 'image/png' || $mime === 'image/webp') {
            imagealphablending($tmp, false);
            imagesavealpha($tmp, true);
            $transparent = imagecolorallocatealpha($tmp, 0, 0, 0, 127);
            imagefilledrectangle($tmp, 0, 0, $nw, $nh, $transparent);
        }
        imagecopyresampled($tmp, $img, 0, 0, 0, 0, $nw, $nh, $w, $h);

        ob_start();
        if ($mime === 'image/png') {
            // PNG quality: 0 (no compression) to 9
            imagepng($tmp, null, 6);
        } elseif ($mime === 'image/webp') {
            imagewebp($tmp, null, 80);
        } else {
            // JPEG quality
            imagejpeg($tmp, null, 80);
        }
        $outData = ob_get_clean();
        imagedestroy($tmp);
        imagedestroy($img);
        if ($outData === false) json_response(['ok' => false, 'error' => 'image_processing_failed'], 500);
        $b64 = base64_encode($outData);
        $dataUrl = 'data:' . $mime . ';base64,' . $b64;
    }

    // Save to DB. Wrap execute in try/catch to catch max_allowed_packet errors and provide helpful message.
    try {
        $stmt = $mysqli->prepare("UPDATE tbl_users SET image = ? WHERE user_id = ?");
        if (!$stmt) json_response(['ok' => false, 'error' => 'db_prepare_failed', 'details' => $mysqli->error], 500);
        $stmt->bind_param('si', $dataUrl, $user_id);
        if (!$stmt->execute()) {
            json_response(['ok' => false, 'error' => 'db_execute_failed', 'details' => $stmt->error], 500);
        }
    } catch (mysqli_sql_exception $mse) {
        // Common cause: max_allowed_packet too small. Inform user and suggest reducing image size.
        json_response(['ok' => false, 'error' => 'db_packet_too_large', 'message' => 'Image too large for database packet. Resize image or increase MySQL max_allowed_packet.'], 500);
    }

    // Return updated profile
    $stmt2 = $mysqli->prepare("SELECT user_id, first_name, last_name, email, image FROM tbl_users WHERE user_id = ? LIMIT 1");
    $stmt2->bind_param('i', $user_id);
    $stmt2->execute();
    $row = $stmt2->get_result()->fetch_assoc();
    $avatar = null;
    if (!empty($row['image'])) $avatar = $row['image'];

    json_response(['ok' => true, 'message' => 'profile_updated', 'user' => [ 'user_id' => (int)$row['user_id'], 'first_name' => $row['first_name'], 'last_name' => $row['last_name'], 'email' => $row['email'], 'avatar' => $avatar ] ]);

} else {
    json_response(['ok' => false, 'error' => 'method_not_allowed'], 405);
}
