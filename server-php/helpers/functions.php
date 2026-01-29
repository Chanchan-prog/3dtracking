<?php
// server-php/helpers/functions.php

// vendor/autoload.php is required once in index.php; do not require it here to avoid duplication

use Firebase\JWT\JWT;
use Firebase\JWT\Key;

function json_response($data, $status_code = 200) {
    // Clean any buffered output to ensure clean JSON
    if (ob_get_length() !== false) {
        @ob_end_clean();
    }
    http_response_code($status_code);
    header('Content-Type: application/json');
    // Ensure accurate content length (Helps HTTP/2 framing)
    $json = json_encode($data);
    header('Content-Length: ' . strlen($json));
    echo $json;
    exit;
}

function getDistanceMeters($lat1, $lon1, $lat2, $lon2) {
  $R = 6371000; // Earth radius in meters
  $dLat = deg2rad($lat2 - $lat1);
  $dLon = deg2rad($lon2 - $lon1);
  $a =
    sin($dLat / 2) * sin($dLat / 2) +
    cos(deg2rad($lat1)) *
      cos(deg2rad($lat2)) *
      sin($dLon / 2) *
      sin($dLon / 2);

  $c = 2 * atan2(sqrt($a), sqrt(1 - $a));
  return $R * $c;
}

function isInsideBox($coordsLat, $coordsLon, $roomLat, $roomLon, $roomRadiusMeters) {
  if (!is_numeric($coordsLat) || !is_numeric($coordsLon) || $roomLat == null || $roomLon == null || $roomRadiusMeters == null) return false;
  $metersPerDegLat = 111320; // ~ meters per degree latitude
  $deltaLat = $roomRadiusMeters / $metersPerDegLat;
  $latRad = deg2rad($roomLat);
  $metersPerDegLon = $metersPerDegLat * cos($latRad) ?: 1e-6;
  $deltaLon = $roomRadiusMeters / $metersPerDegLon;

  $minLat = $roomLat - $deltaLat;
  $maxLat = $roomLat + $deltaLat;
  $minLon = $roomLon - $deltaLon;
  $maxLon = $roomLon + $deltaLon;

  return $coordsLat >= $minLat && $coordsLat <= $maxLat && $coordsLon >= $minLon && $coordsLon <= $maxLon;
}

function toDateYMD($d) {
    if (!$d) return null;
    try {
        $dt = new DateTime($d);
        return $dt->format('Y-m-d');
    } catch (Exception $e) {
        return null;
    }
}

function generate_random_token($length = 32) {
    return bin2hex(random_bytes($length / 2));
}

function get_input() {
    return json_decode(file_get_contents('php://input'), true);
}
