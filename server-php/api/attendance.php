<?php
// server-php/api/attendance.php

global $mysqli;

$request_method = $_SERVER['REQUEST_METHOD'];
$input = get_input();

$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$parts = explode('/', $path);
$api_prefix_key = array_search('api', $parts);

$endpoint = $parts[$api_prefix_key + 1] ?? null;
$param1 = $parts[$api_prefix_key + 2] ?? null;


// Function to generate attendance week, translated from Node.js
function generateAttendanceWeek($start_date_str, $end_date_str) {
    global $mysqli;
    // This function logic is confirmed to be correct.
    $today = new DateTime();
    $today->setTime(0, 0, 0);

    $defaultStart = clone $today;
    $defaultEnd = clone $today;
    $defaultEnd->modify('+6 days');

    $rangeStart = $start_date_str ? new DateTime($start_date_str) : $defaultStart;
    $rangeEnd = $end_date_str ? new DateTime($end_date_str) : $defaultEnd;

    if ($rangeEnd < $rangeStart) {
        throw new Exception("end_date must be >= start_date");
    }

    $sql = "SELECT cs.schedule_id, cs.room_id, r.floor_id AS room_floor_id, cs.day_of_week, so.user_id AS teacher_id, sem.start_date, sem.end_date FROM tbl_class_schedules cs JOIN tbl_subject_offerings so ON cs.offering_id = so.offering_id JOIN tbl_semesters sem ON so.semester_id = sem.semester_id JOIN tbl_rooms r ON cs.room_id = r.room_id";
    $schedules_result = $mysqli->query($sql);
    $schedules = $schedules_result->fetch_all(MYSQLI_ASSOC);

    $dayMap = ['sunday' => 0, 'monday' => 1, 'tuesday' => 2, 'wednesday' => 3, 'thursday' => 4, 'friday' => 5, 'saturday' => 6];
    $totalInserted = 0;

    foreach ($schedules as $row) {
        $targetDow = $dayMap[strtolower($row['day_of_week'])] ?? -1;
        if ($targetDow === -1) continue;

        $semStart = new DateTime($row['start_date']);
        $semEnd = new DateTime($row['end_date']);
        
        $effStart = max($rangeStart, $semStart);
        $effEnd = min($rangeEnd, $semEnd);
        
        if ($effEnd < $effStart) continue;
        
        $currentDate = clone $effStart;
        while ($currentDate <= $effEnd) {
            if ((int)$currentDate->format('w') === $targetDow) {
                $dateStr = $currentDate->format('Y-m-d');
                $stmt = $mysqli->prepare("INSERT INTO tbl_attendance_records (user_id, schedule_id, room_id, floor_id, date, flag_in_id, flag_check_id, flag_out_id) SELECT ?, ?, ?, ?, ?, 1, 1, 1 FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM tbl_attendance_records WHERE user_id = ? AND schedule_id = ? AND date = ?)");
                $stmt->bind_param("iiiisiss", $row['teacher_id'], $row['schedule_id'], $row['room_id'], $row['room_floor_id'], $dateStr, $row['teacher_id'], $row['schedule_id'], $dateStr);
                $stmt->execute();
                $totalInserted += $stmt->affected_rows;
            }
            $currentDate->modify('+1 day');
        }
    }
    return [
        'inserted' => $totalInserted,
        'rangeStart' => $rangeStart->format('Y-m-d'),
        'rangeEnd' => $rangeEnd->format('Y-m-d'),
    ];
}


// --- ROUTING within attendance.php ---
// When included from another PHP script (e.g. to call generateAttendanceWeek),
// callers can set $GLOBALS['SKIP_ATTENDANCE_ROUTING'] = true to prevent the
// routing logic below from running (which would call json_response() and exit).
if (empty($GLOBALS['SKIP_ATTENDANCE_ROUTING'])) {

// Auto-reset temporary floor overrides for attendance records whose class end time already passed
// This ensures the 'temporary floor' set during checks is cleared after class end.
$mysqli->query("UPDATE tbl_attendance_records ar JOIN tbl_class_schedules cs ON ar.schedule_id = cs.schedule_id JOIN tbl_rooms r ON ar.room_id = r.room_id SET ar.floor_id = r.floor_id WHERE TIMESTAMP(ar.date, cs.end_time) < NOW() AND ar.floor_id != r.floor_id");

if ($request_method === 'GET' && $endpoint === 'attendance') {
    // This GET endpoint is confirmed to be correct.
    $sql = "
      SELECT
        ar.attendance_id,
        ar.user_id,
        ar.schedule_id,
        ar.room_id,
        ar.floor_id,
        DATE_FORMAT(ar.date, '%Y-%m-%d') AS date,
        ar.time_in,
        ar.altitude_in,
        ar.latitude_in,
        ar.longitude_in,
        ar.flag_in_id,
        ar.time_check,
        ar.altitude_check,
        ar.latitude_check,
        ar.longitude_check,
        ar.flag_check_id,
        ar.time_out,
        ar.altitude_out,
        ar.latitude_out,
        ar.longitude_out,
        ar.flag_out_id,
        u.first_name,
        u.last_name,
        cs.start_time,
        cs.end_time,
        r.room_name,
        s.subject_code,
        s.subject_name,
        sec.section_name,
        ft_in.flag_name AS flag_in_name,
        ft_check.flag_name AS flag_check_name,
        ft_out.flag_name AS flag_out_name,
        f.floor_name AS attendance_floor_name

      FROM tbl_attendance_records ar
      JOIN tbl_users u              ON ar.user_id = u.user_id
      JOIN tbl_class_schedules cs   ON ar.schedule_id = cs.schedule_id
      JOIN tbl_rooms r              ON ar.room_id = r.room_id
      LEFT JOIN tbl_floors f        ON ar.floor_id = f.floor_id
      JOIN tbl_subject_offerings so ON cs.offering_id = so.offering_id
      JOIN tbl_subject s            ON so.subject_id = s.subject_id
      JOIN tbl_sections sec         ON so.section_id = sec.section_id
      LEFT JOIN tbl_flag_types ft_in    ON ar.flag_in_id = ft_in.flag_id
      LEFT JOIN tbl_flag_types ft_check ON ar.flag_check_id = ft_check.flag_id
      LEFT JOIN tbl_flag_types ft_out   ON ar.flag_out_id = ft_out.flag_id
    ";
    $where = []; $params = []; $types = '';
    if (!empty($_GET['date'])) { $where[] = 'ar.date = ?'; $params[] = $_GET['date']; $types .= 's'; }
    if (!empty($_GET['status'])) {
        // match status against any of the flag name aliases (in/check/out)
        $where[] = '(ft_in.flag_name = ? OR ft_check.flag_name = ? OR ft_out.flag_name = ?)';
        $params[] = $_GET['status']; $params[] = $_GET['status']; $params[] = $_GET['status']; $types .= 'sss';
    }
    if (!empty($_GET['teacher_id'])) { $where[] = 'ar.user_id = ?'; $params[] = (int)$_GET['teacher_id']; $types .= 'i'; }
    if (!empty($where)) { $sql .= ' WHERE ' . implode(' AND ', $where); }
    $sql .= ' ORDER BY ar.date DESC, cs.start_time, u.last_name, u.first_name';
    $stmt = $mysqli->prepare($sql);
    if ($stmt === false) {
        json_response(['error' => 'Failed to prepare attendance query', 'sql_error' => $mysqli->error, 'sql' => $sql], 500);
    }
    if (!empty($params)) { $stmt->bind_param($types, ...$params); }
    if (!$stmt->execute()) {
        json_response(['error' => 'Failed to execute attendance query', 'stmt_error' => $stmt->error], 500);
    }
    $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
    json_response($rows);

} elseif ($request_method === 'GET' && $endpoint === 'floors') {
    // Support optional building_id filter so frontend can request floors for a specific building
    if (!empty($_GET['building_id'])) {
        $building_id = (int)$_GET['building_id'];
        $fstmt = $mysqli->prepare("SELECT floor_id, building_id, floor_name, baseline_altitude, floor_meter_vertical, qr_token, qr_token_active FROM tbl_floors WHERE building_id = ?");
        if ($fstmt === false) {
            json_response(['error' => 'Failed to prepare floors query', 'sql_error' => $mysqli->error], 500);
        }
        $fstmt->bind_param('i', $building_id);
        if (!$fstmt->execute()) {
            json_response(['error' => 'Failed to execute floors query', 'stmt_error' => $fstmt->error], 500);
        }
        $floors = $fstmt->get_result()->fetch_all(MYSQLI_ASSOC);
        json_response($floors);
    } else {
        $result = $mysqli->query("SELECT floor_id, building_id, floor_name, baseline_altitude, floor_meter_vertical, qr_token, qr_token_active FROM tbl_floors");
        if (!$result) {
            json_response(['error' => 'Failed to fetch floors: ' . $mysqli->error], 500);
        } else {
            $floors = $result->fetch_all(MYSQLI_ASSOC);
            json_response($floors);
        }
    }

} elseif ($request_method === 'POST' && $param1 === 'generate-week') {
    // Manual generation disabled: attendance is generated automatically by scheduled cron/script.
    json_response(['error' => 'manual_generation_disabled', 'message' => 'Attendance generation is automatic via server cron/script and cannot be triggered manually.'], 403);
    // NOTE: To run generation, use the CLI script server-php/scripts/generate-weekly-attendance.php with OS cron.

} elseif ($request_method === 'POST' && ($param1 === 'check-in' || $param1 === 'mid-check' || $param1 === 'check-out')) {
    // Shared logic for all check types
    $schedule_id = $input['schedule_id'] ?? null;
    $user_id = $input['user_id'] ?? null;
    $date = $input['date'] ?? null;
    $latitude = $input['latitude'] ?? null;
    $longitude = $input['longitude'] ?? null;
    $accuracy = $input['accuracy'] ?? null;
    $altitude = $input['altitude'] ?? null;
    $altitudeAccuracy = $input['altitudeAccuracy'] ?? null;
    $qr_token = $input['qr_token'] ?? null;

    $ACCURACY_THRESHOLD_METERS = 30;
    $ALTITUDE_ACCURACY_THRESHOLD_METERS = 15;
    $DEFAULT_VERTICAL_TOLERANCE_METERS = 1.5;

    if (!$schedule_id || !$user_id || !$date) json_response(['ok' => false, 'error' => 'missing_fields'], 400);
    if (!is_numeric($latitude) || !is_numeric($longitude)) json_response(['ok' => false, 'error' => 'missing_coordinates'], 400);

    $stmt = $mysqli->prepare("SELECT ar.attendance_id, ar.date, cs.start_time, cs.end_time, r.latitude AS room_lat, r.longitude AS room_lon, r.radius AS room_radius, r.floor_id AS room_floor_id, r.building_id AS room_building_id, f.qr_token AS qr_token, f.qr_token_active AS qr_token_active, ar.flag_in_id, ar.flag_check_id, f.baseline_altitude AS room_baseline_altitude FROM tbl_attendance_records ar JOIN tbl_class_schedules cs ON ar.schedule_id = cs.schedule_id JOIN tbl_rooms r ON ar.room_id = r.room_id LEFT JOIN tbl_floors f ON r.floor_id = f.floor_id WHERE ar.schedule_id = ? AND ar.user_id = ? AND ar.date = ? LIMIT 1");
    $stmt->bind_param("iis", $schedule_id, $user_id, $date);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();

    if (!$row) json_response(['ok' => false, 'error' => 'attendance_record_not_found'], 404);

    $classStart = new DateTime(toDateYMD($row['date']) . ' ' . $row['start_time']);
    $classEnd = new DateTime(toDateYMD($row['date']) . ' ' . $row['end_time']);
    $now = new DateTime();

    // --- New: Building containment check ---
    $building_stmt = $mysqli->prepare("SELECT building_id, building_name, latitude, longitude, radius FROM tbl_buildings WHERE building_id = ? LIMIT 1");
    if ($building_stmt) {
        $building_stmt->bind_param('i', $row['room_building_id']);
        $building_stmt->execute();
        $building = $building_stmt->get_result()->fetch_assoc();
        if ($building && is_numeric($building['latitude']) && is_numeric($building['longitude']) && is_numeric($building['radius']) && (float)$building['radius'] > 0) {
            $distToBuilding = getDistanceMeters($latitude, $longitude, (float)$building['latitude'], (float)$building['longitude']);
            if ($distToBuilding > (float)$building['radius']) {
                json_response(['ok' => false, 'error' => 'outside_building', 'distanceMeters' => $distToBuilding, 'building_radius' => (float)$building['radius'], 'building_id' => (int)$building['building_id']], 400);
            }
        }
    }

    // 1. Check QR Validity
    $isQrValid = $qr_token && $row['qr_token'] && $qr_token === $row['qr_token'] && $row['qr_token_active'] == 1;

    // 2. Horizontal GPS Check
    $distanceMeters = getDistanceMeters($latitude, $longitude, $row['room_lat'], $row['room_lon']);
    $inBox = isInsideBox($latitude, $longitude, $row['room_lat'], $row['room_lon'], (float)$row['room_radius']);
    if (!$inBox) {
        json_response([
            'ok' => false, 
            'error' => 'out_of_range', 
            'in_box' => false, 
            'distanceMeters' => $distanceMeters, 
            'room_radius' => (float)$row['room_radius']
        ], 400);
    }
    if (is_numeric($accuracy) && $accuracy > $ACCURACY_THRESHOLD_METERS) json_response(['ok' => false, 'error' => 'low_accuracy'], 400);

    // 3. Vertical / Altitude Check (CORRECTED LOGIC)
    $finalAltitude = $altitude;
    $detectedFloorId = null;
    if ($isQrValid) {
        // For QR path: validate user's reported altitude falls within the floor's baseline +/- floor_meter_vertical.
        // This replaces trusting a static baseline value and enforces the floor range for the scanned floor.
        try {
            $roomFloorId = $row['room_floor_id'] ? (int)$row['room_floor_id'] : null;
            $floorInfo = null;
            if ($roomFloorId) {
                $fstmt = $mysqli->prepare("SELECT baseline_altitude, floor_meter_vertical FROM tbl_floors WHERE floor_id = ? LIMIT 1");
                if ($fstmt) {
                    $fstmt->bind_param('i', $roomFloorId);
                    $fstmt->execute();
                    $floorInfo = $fstmt->get_result()->fetch_assoc();
                }
            }

            // Require both baseline_altitude and floor_meter_vertical to be present and numeric.
            if ($floorInfo && is_numeric($floorInfo['baseline_altitude']) && is_numeric($floorInfo['floor_meter_vertical'])) {
                $baseline = (float)$floorInfo['baseline_altitude'];
                $vertical = (float)$floorInfo['floor_meter_vertical'];
                // Use full vertical value as limit (baseline +/- vertical)
                $minAlt = $baseline - $vertical;
                $maxAlt = $baseline + $vertical;

                if (!is_numeric($altitude)) {
                    json_response(['ok' => false, 'error' => 'missing_altitude'], 400);
                }

                $userAlt = (float)$altitude;
                if ($userAlt < $minAlt || $userAlt > $maxAlt) {
                    json_response([
                        'ok' => false,
                        'error' => 'wrong_floor',
                        'expected_floor_id' => $roomFloorId,
                        'expected_baseline' => $baseline,
                        'floor_meter_vertical' => $vertical,
                        'min_altitude' => $minAlt,
                        'max_altitude' => $maxAlt,
                        'detected_altitude' => $userAlt
                    ], 400);
                }

                // Passed range check — use user's altitude as stored value and mark detected floor
                $finalAltitude = $userAlt;
                $detectedFloorId = $roomFloorId;

            } else {
                // Floor data incomplete: do not fall back to static baseline. Require floor vertical info.
                json_response(['ok' => false, 'error' => 'no_floor_match', 'reason' => 'floor_baseline_or_vertical_missing'], 400);
            }
        } catch (Exception $e) {
            // On unexpected failure, return no_floor_match instead of silently falling back
            json_response(['ok' => false, 'error' => 'no_floor_match', 'reason' => 'exception_occurred'], 400);
        }

    } else {
        if (!is_numeric($altitude)) json_response(['ok' => false, 'error' => 'missing_altitude'], 400);
        if (!is_numeric($altitudeAccuracy) || $altitudeAccuracy > $ALTITUDE_ACCURACY_THRESHOLD_METERS) json_response(['ok' => false, 'error' => 'altitude_too_poor'], 400);
        
        $floor_stmt = $mysqli->prepare("SELECT floor_id, baseline_altitude, floor_meter_vertical FROM tbl_floors WHERE building_id = ?");
        $floor_stmt->bind_param("i", $row['room_building_id']);
        $floor_stmt->execute();
        $floors_result = $floor_stmt->get_result();
        $floors = $floors_result->fetch_all(MYSQLI_ASSOC);
        
        $detectedFloorId = null;
        $detectedFloorBaseline = null;
        $detectedFloorVertical = null;
        
        if (!empty($floors)) {
            $best_match = null;
            foreach ($floors as $f) {
                if ($f['baseline_altitude'] === null) continue;
                $diff = abs((float)$f['baseline_altitude'] - (float)$altitude);
                if ($best_match === null || $diff < $best_match['diff']) {
                    $best_match = ['diff' => $diff, 'floor' => $f];
                }
            }
            if ($best_match) {
                $detectedFloorId = (int)$best_match['floor']['floor_id'];
                $detectedFloorBaseline = (float)$best_match['floor']['baseline_altitude'];
                $detectedFloorVertical = $best_match['floor']['floor_meter_vertical'] !== null ? (float)$best_match['floor']['floor_meter_vertical'] : null;
            }
        }

        if ($detectedFloorId === null) json_response(['ok' => false, 'error' => 'no_floor_match'], 400);

        // Require floor_meter_vertical to be present. Do not fallback to static baseline.
        if ($detectedFloorVertical === null) json_response(['ok' => false, 'error' => 'no_floor_match', 'reason' => 'floor_vertical_missing'], 400);

        // Use full +/- floor_meter_vertical range for validation
        $minAlt = $detectedFloorBaseline - $detectedFloorVertical;
        $maxAlt = $detectedFloorBaseline + $detectedFloorVertical;
        $userAlt = (float)$altitude;

        if ($userAlt < $minAlt || $userAlt > $maxAlt || $detectedFloorId !== (int)$row['room_floor_id']) {
            json_response([
                'ok' => false,
                'error' => 'wrong_floor',
                'detected_floor_id' => $detectedFloorId,
                'expected_floor_id' => (int)$row['room_floor_id'],
                'detected_baseline' => $detectedFloorBaseline,
                'floor_meter_vertical' => $detectedFloorVertical,
                'min_altitude' => $minAlt,
                'max_altitude' => $maxAlt,
                'detected_altitude' => $userAlt
            ], 400);
        }
    }
    
    // Persist detected floor for this attendance record so client can trust floor altitude until class end
    if ($detectedFloorId !== null) {
        $update_floor_stmt = $mysqli->prepare("UPDATE tbl_attendance_records SET floor_id = ? WHERE attendance_id = ?");
        if ($update_floor_stmt) {
            $update_floor_stmt->bind_param("ii", $detectedFloorId, $row['attendance_id']);
            $update_floor_stmt->execute();
        }
    }
    
    // --- Action based on check type ---
    $message = '';
    if ($param1 === 'check-in') {
        $inPresentWindowEnd = (clone $classStart)->modify('+15 minutes');
        if ($now < $classStart) json_response(['ok' => false, 'error' => 'too_early', 'allow_at' => $classStart->format(DateTime::ISO8601)]);
        if ($now > $classEnd) json_response(['ok' => false, 'error' => 'class_ended']);
        $flagIn = ($now <= $inPresentWindowEnd) ? 2 : 5;
        $stmt = $mysqli->prepare("UPDATE tbl_attendance_records SET time_in = NOW(), altitude_in = ?, latitude_in = ?, longitude_in = ?, flag_in_id = ? WHERE attendance_id = ?");
        $stmt->bind_param("dddii", $finalAltitude, $latitude, $longitude, $flagIn, $row['attendance_id']);
        $stmt->execute();
        $message = $flagIn === 2 ? 'checked_in_present' : 'checked_in_late';

    } elseif ($param1 === 'mid-check') {
        $duration = $classEnd->getTimestamp() - $classStart->getTimestamp();
        $midPoint = (clone $classStart)->modify('+' . ($duration / 2) . ' seconds');
        $midStart = (clone $midPoint)->modify('-10 minutes');
        $midEnd = (clone $midPoint)->modify('+10 minutes');
        if ($now < $midStart) json_response(['ok' => false, 'error' => 'too_early', 'allow_at' => $midStart->format(DateTime::ISO8601)]);
        if ($now > $classEnd) json_response(['ok' => false, 'error' => 'class_ended']);
        
        // Catch-up for flag_in_id
        $inPresentWindowEnd = (clone $classStart)->modify('+15 minutes');
        if (($row['flag_in_id'] == 1) && $now > $inPresentWindowEnd) {
            $update_stmt = $mysqli->prepare("UPDATE tbl_attendance_records SET flag_in_id = 5 WHERE attendance_id = ?");
            $update_stmt->bind_param("i", $row['attendance_id']);
            $update_stmt->execute();
        }

        $flagCheck = ($now >= $midStart && $now <= $midEnd) ? 2 : 5;
        $stmt = $mysqli->prepare("UPDATE tbl_attendance_records SET time_check = NOW(), altitude_check = ?, latitude_check = ?, longitude_check = ?, flag_check_id = ? WHERE attendance_id = ?");
        $stmt->bind_param("dddii", $finalAltitude, $latitude, $longitude, $flagCheck, $row['attendance_id']);
        $stmt->execute();
        $message = $flagCheck === 2 ? 'mid_check_present' : 'mid_check_late';

    } elseif ($param1 === 'check-out') {
        $outStart = (clone $classEnd)->modify('-15 minutes');
        if ($now < $outStart) json_response(['ok' => false, 'error' => 'too_early', 'allow_at' => $outStart->format(DateTime::ISO8601)]);
        if ($now > $classEnd) json_response(['ok' => false, 'error' => 'class_ended']);

        // Catch-up for flag_in_id
        $inPresentWindowEnd = (clone $classStart)->modify('+15 minutes');
        if (($row['flag_in_id'] == 1) && $now > $inPresentWindowEnd) {
            $update_stmt = $mysqli->prepare("UPDATE tbl_attendance_records SET flag_in_id = 5 WHERE attendance_id = ?");
            $update_stmt->bind_param("i", $row['attendance_id']);
            $update_stmt->execute();
        }
        
        // Catch-up for flag_check_id
        $duration = $classEnd->getTimestamp() - $classStart->getTimestamp();
        $midPoint = (clone $classStart)->modify('+' . ($duration / 2) . ' seconds');
        $midWindowEnd = (clone $midPoint)->modify('+10 minutes');
        if (($row['flag_check_id'] == 1) && $now > $midWindowEnd) {
            $update_stmt = $mysqli->prepare("UPDATE tbl_attendance_records SET flag_check_id = 5 WHERE attendance_id = ?");
            $update_stmt->bind_param("i", $row['attendance_id']);
            $update_stmt->execute();
        }

        $stmt = $mysqli->prepare("UPDATE tbl_attendance_records SET time_out = NOW(), altitude_out = ?, latitude_out = ?, longitude_out = ?, flag_out_id = 2 WHERE attendance_id = ?");
        // SQL has 4 placeholders: altitude_out, latitude_out, longitude_out, attendance_id
        $stmt->bind_param("dddi", $finalAltitude, $latitude, $longitude, $row['attendance_id']);
        $stmt->execute();
        $message = 'checked_out';
    }

    // Return the final updated record with joined fields (same projection as GET /api/attendance)
    $sql = "
      SELECT
        ar.attendance_id,
        ar.user_id,
        ar.schedule_id,
        ar.room_id,
        ar.floor_id,
        DATE_FORMAT(ar.date, '%Y-%m-%d') AS date,
        ar.time_in,
        ar.altitude_in,
        ar.latitude_in,
        ar.longitude_in,
        ar.flag_in_id,
        ar.time_check,
        ar.altitude_check,
        ar.latitude_check,
        ar.longitude_check,
        ar.flag_check_id,
        ar.time_out,
        ar.altitude_out,
        ar.latitude_out,
        ar.longitude_out,
        ar.flag_out_id,
        u.first_name,
        u.last_name,
        cs.start_time,
        cs.end_time,
        r.room_name,
        s.subject_code,
        s.subject_name,
        sec.section_name,
        ft_in.flag_name AS flag_in_name,
        ft_check.flag_name AS flag_check_name,
        ft_out.flag_name AS flag_out_name,
        f.floor_name AS attendance_floor_name

      FROM tbl_attendance_records ar
      JOIN tbl_users u              ON ar.user_id = u.user_id
      JOIN tbl_class_schedules cs   ON ar.schedule_id = cs.schedule_id
      JOIN tbl_rooms r              ON ar.room_id = r.room_id
      LEFT JOIN tbl_floors f        ON ar.floor_id = f.floor_id
      JOIN tbl_subject_offerings so ON cs.offering_id = so.offering_id
      JOIN tbl_subject s            ON so.subject_id = s.subject_id
      JOIN tbl_sections sec         ON so.section_id = sec.section_id
      LEFT JOIN tbl_flag_types ft_in    ON ar.flag_in_id = ft_in.flag_id
      LEFT JOIN tbl_flag_types ft_check ON ar.flag_check_id = ft_check.flag_id
      LEFT JOIN tbl_flag_types ft_out   ON ar.flag_out_id = ft_out.flag_id
      WHERE ar.attendance_id = ?
      LIMIT 1
    ";
    $stmt = $mysqli->prepare($sql);
    if ($stmt === false) {
      json_response(['ok' => false, 'error' => 'Failed to prepare attendance select', 'sql_error' => $mysqli->error], 500);
    }
    $stmt->bind_param("i", $row['attendance_id']);
    if (!$stmt->execute()) {
      json_response(['ok' => false, 'error' => 'Failed to execute attendance select', 'stmt_error' => $stmt->error], 500);
    }
    $updated_record = $stmt->get_result()->fetch_assoc();

    // Add flag indicating DB floor altitude was used (QR path)
    $used_db_floor = !empty($isQrValid) && $isQrValid ? true : false;

    json_response(['ok' => true, 'message' => $message, 'attendance' => $updated_record, 'used_db_floor' => $used_db_floor]);

} else {
    json_response(['error' => 'Endpoint not found in attendance API file.'], 404);
}

} // end skip-routing guard
