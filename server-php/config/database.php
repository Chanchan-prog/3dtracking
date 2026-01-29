<?php
// server-php/config/database.php

$db_host = 'localhost';
$db_user = 'root';
$db_pass = '';
$db_name = 'db_teacher_attendance_3d_school_with_altitude';

$mysqli = new mysqli($db_host, $db_user, $db_pass, $db_name);

if ($mysqli->connect_error) {
  http_response_code(500);
  header('Content-Type: application/json');
  echo json_encode(['error' => 'Database connection failed: ' . $mysqli->connect_error]);
  exit;
}

date_default_timezone_set('Asia/Manila');
