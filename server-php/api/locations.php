<?php
// server-php/api/locations.php

global $mysqli;

// Helper: find the first existing column name from candidates for a table
function find_existing_column($table, $candidates) {
    global $mysqli;
    foreach ($candidates as $c) {
        $c_esc = $mysqli->real_escape_string($c);
        $res = $mysqli->query("SHOW COLUMNS FROM `$table` LIKE '{$c_esc}'");
        if ($res && $res->num_rows) return $c;
    }
    return null;
}

$request_method = $_SERVER['REQUEST_METHOD'];
$input = get_input();

$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$parts = explode('/', $path);
$api_prefix_key = array_search('api', $parts);

$endpoint = $parts[$api_prefix_key + 1] ?? null;
$param1 = $parts[$api_prefix_key + 2] ?? null;
$param2 = $parts[$api_prefix_key + 3] ?? null;
$param3 = $parts[$api_prefix_key + 4] ?? null;

switch ($endpoint) {
    case 'buildings':
        if ($request_method === 'GET') {
            // Detect which columns exist and build a safe SELECT
            $latCol = find_existing_column('tbl_buildings', ['latitude','alt','altitude','lat']);
            $lonCol = find_existing_column('tbl_buildings', ['longitude','lon','lng','long']);
            $radCol = find_existing_column('tbl_buildings', ['radius','building_radius']);

            $select = [ 'building_id', 'building_name', 'location_description' ];
            $select[] = $latCol ? "`{$latCol}` AS latitude" : "NULL AS latitude";
            $select[] = $lonCol ? "`{$lonCol}` AS longitude" : "NULL AS longitude";
            $select[] = $radCol ? "`{$radCol}` AS radius" : "NULL AS radius";

            $sql = 'SELECT ' . implode(', ', $select) . ' FROM tbl_buildings ORDER BY building_name';
            $result = $mysqli->query($sql);
            if (!$result) {
                json_response(['error' => 'Failed to fetch buildings: ' . $mysqli->error], 500);
            }
            json_response($result->fetch_all(MYSQLI_ASSOC));
        } elseif ($request_method === 'POST') {
            // Insert into buildings table. Keep insert minimal to avoid errors when latitude/longitude columns are missing.
            $stmt = $mysqli->prepare("INSERT INTO tbl_buildings (building_name, location_description, radius) VALUES (?, ?, ?)");
            $rad = isset($input['radius']) ? (int)$input['radius'] : 0;
            $stmt->bind_param("ssi", $input['building_name'], $input['location_description'], $rad);
            $stmt->execute();
            $newId = $stmt->insert_id;

            // If any latitude/longitude-like column exists, update it with provided payload values
            $latCol = find_existing_column('tbl_buildings', ['latitude','alt','altitude','lat']);
            $lonCol = find_existing_column('tbl_buildings', ['longitude','lon','lng','long']);
            if ($latCol || $lonCol) {
                $parts = [];
                $types = '';
                $vals = [];
                if ($latCol && isset($input['latitude'])) { $parts[] = "`{$latCol}` = ?"; $types .= 'd'; $vals[] = (float)$input['latitude']; }
                if ($lonCol && isset($input['longitude'])) { $parts[] = "`{$lonCol}` = ?"; $types .= 'd'; $vals[] = (float)$input['longitude']; }
                if (!empty($parts)) {
                    $types .= 'i'; $vals[] = $newId;
                    $ustmt = $mysqli->prepare("UPDATE tbl_buildings SET " . implode(', ', $parts) . " WHERE building_id = ?");
                    if ($ustmt) {
                        $ustmt->bind_param($types, ...$vals);
                        $ustmt->execute();
                    }
                }
            }

            json_response(['building_id' => $newId] + $input, 201);
        }
        break;

    case 'floors':
         if ($request_method === 'GET') {
            // Support optional building_id filter
            if (isset($_GET['building_id']) && is_numeric($_GET['building_id'])) {
                $bId = (int)$_GET['building_id'];
                $fstmt = $mysqli->prepare("SELECT floor_id, building_id, floor_name, baseline_altitude, floor_meter_vertical, qr_token, qr_token_active FROM tbl_floors WHERE building_id = ? ORDER BY floor_name");
                if ($fstmt === false) json_response(['error' => 'Failed to prepare floors query', 'sql_error' => $mysqli->error], 500);
                $fstmt->bind_param('i', $bId);
                $fstmt->execute();
                $floors_res = $fstmt->get_result();
                json_response($floors_res->fetch_all(MYSQLI_ASSOC));
            } else {
                $result = $mysqli->query("SELECT floor_id, building_id, floor_name, baseline_altitude, floor_meter_vertical, qr_token, qr_token_active FROM tbl_floors ORDER BY building_id, floor_name");
                if (!$result) json_response(['error' => 'Failed to fetch floors: ' . $mysqli->error], 500);
                json_response($result->fetch_all(MYSQLI_ASSOC));
            }
        } elseif ($request_method === 'POST') {
            // Generate QR token for floor at creation
            $token = generate_random_token();
            $stmt = $mysqli->prepare("INSERT INTO tbl_floors (building_id, floor_name, baseline_altitude, floor_meter_vertical, qr_token, qr_token_active) VALUES (?, ?, ?, ?, ?, 1)");
            $stmt->bind_param("isdds", $input['building_id'], $input['floor_name'], $input['baseline_altitude'], $input['floor_meter_vertical'], $token);
            $stmt->execute();
            json_response(['floor_id' => $stmt->insert_id, 'qr_token' => $token, 'qr_token_active' => 1] + $input, 201);
        } elseif ($request_method === 'POST' && is_numeric($param1) && $param2 === 'qr' && $param3 === 'regenerate') {
            // Regenerate QR token for a specific floor
            $newToken = generate_random_token();
            $stmt = $mysqli->prepare("UPDATE tbl_floors SET qr_token = ?, qr_token_active = 1 WHERE floor_id = ?");
            $stmt->bind_param("si", $newToken, $param1);
            $stmt->execute();
            json_response(['ok' => true, 'floor_id' => (int)$param1, 'qr_token' => $newToken, 'qr_token_active' => 1]);
        } elseif ($request_method === 'POST' && is_numeric($param1) && $param2 === 'qr' && $param3 === 'toggle-active') {
            $active = isset($input['active']) && $input['active'] ? 1 : 0;
            $stmt = $mysqli->prepare("UPDATE tbl_floors SET qr_token_active = ? WHERE floor_id = ?");
            $stmt->bind_param("ii", $active, $param1);
            $stmt->execute();
            json_response(['ok' => true, 'floor_id' => (int)$param1, 'qr_token_active' => $active]);
        }
        break;

    case 'rooms':
        if ($request_method === 'GET' && !$param1) {
            // Rooms list: bring QR info from their floor (floors now own the QR)
            // Detect room lat/lon column names to avoid Unknown column errors
            $roomLatCol = find_existing_column('tbl_rooms', ['latitude','lat','alt','altitude']);
            $roomLonCol = find_existing_column('tbl_rooms', ['longitude','lon','lng','long']);
            $roomRadiusCol = find_existing_column('tbl_rooms', ['radius']);
            if (isset($_GET['building_id']) && is_numeric($_GET['building_id'])) {
                $bId = (int)$_GET['building_id'];
                $select = [ 'r.room_id', 'r.room_name' ];
                $select[] = $roomLatCol ? "r.`{$roomLatCol}` AS latitude" : "NULL AS latitude";
                $select[] = $roomLonCol ? "r.`{$roomLonCol}` AS longitude" : "NULL AS longitude";
                $select[] = $roomRadiusCol ? "r.`{$roomRadiusCol}` AS radius" : "NULL AS radius";
                $select[] = 'f.qr_token';
                $select[] = 'f.qr_token_active';
                $select[] = 'r.building_id';
                $select[] = 'r.floor_id';
                $sql = 'SELECT ' . implode(', ', $select) . ' FROM tbl_rooms r LEFT JOIN tbl_floors f ON r.floor_id = f.floor_id WHERE r.building_id = ? ORDER BY r.room_name';
                $rstmt = $mysqli->prepare($sql);
                if ($rstmt === false) json_response(['error' => 'Failed to prepare rooms query', 'sql_error' => $mysqli->error], 500);
                $rstmt->bind_param('i', $bId);
                $rstmt->execute();
                $res = $rstmt->get_result();
                json_response($res->fetch_all(MYSQLI_ASSOC));
            } else {
                $select = [ 'r.room_id', 'r.room_name' ];
                $select[] = $roomLatCol ? "r.`{$roomLatCol}` AS latitude" : "NULL AS latitude";
                $select[] = $roomLonCol ? "r.`{$roomLonCol}` AS longitude" : "NULL AS longitude";
                $select[] = $roomRadiusCol ? "r.`{$roomRadiusCol}` AS radius" : "NULL AS radius";
                $select[] = 'f.qr_token';
                $select[] = 'f.qr_token_active';
                $select[] = 'r.building_id';
                $select[] = 'r.floor_id';
                $sql = 'SELECT ' . implode(', ', $select) . ' FROM tbl_rooms r LEFT JOIN tbl_floors f ON r.floor_id = f.floor_id ORDER BY r.room_name';
                $result = $mysqli->query($sql);
                if (!$result) json_response(['error' => 'Failed to fetch rooms: ' . $mysqli->error], 500);
                json_response($result->fetch_all(MYSQLI_ASSOC));
            }
        } elseif ($request_method === 'POST' && !$param1) {
            // Rooms no longer store QR fields; floors own the QR token
            $stmt = $mysqli->prepare("INSERT INTO tbl_rooms (building_id, floor_id, latitude, longitude, radius, room_name) VALUES (?, ?, ?, ?, ?, ?)");
            // types: building_id (i), floor_id (i), latitude (d), longitude (d), radius (d), room_name (s)
            $stmt->bind_param("iiddds", $input['building_id'], $input['floor_id'], $input['latitude'], $input['longitude'], $input['radius'], $input['room_name']);
            $stmt->execute();
            json_response(['room_id' => $stmt->insert_id] + $input, 201);
        } elseif ($request_method === 'GET' && $param1 === 'qr' && $param2) {
             // Lookup by QR token — now stored on floors; find the room that belongs to that floor (if any)
             $stmt = $mysqli->prepare("SELECT r.room_id, r.room_name, r.latitude, r.longitude, r.radius, f.qr_token_active, b.building_id, b.building_name, f.floor_id, f.floor_name, f.baseline_altitude FROM tbl_rooms r JOIN tbl_buildings b ON r.building_id = b.building_id JOIN tbl_floors f ON r.floor_id = f.floor_id WHERE f.qr_token = ? LIMIT 1");
            $stmt->bind_param("s", $param2);
            $stmt->execute();
            $room = $stmt->get_result()->fetch_assoc();
            if (!$room) json_response(['error' => 'room_not_found'], 404);
            if (!$room['qr_token_active']) json_response(['error' => 'qr_disabled'], 403);
            json_response($room);
        } elseif ($request_method === 'GET' && is_numeric($param1)) {
            $stmt = $mysqli->prepare("SELECT r.room_id, r.room_name, r.latitude, r.longitude, r.radius, f.qr_token, f.qr_token_active, b.building_id, b.building_name, f.floor_id, f.floor_name, f.baseline_altitude FROM tbl_rooms r JOIN tbl_buildings b ON r.building_id = b.building_id JOIN tbl_floors f ON r.floor_id = f.floor_id WHERE r.room_id = ? LIMIT 1");
            $stmt->bind_param("i", $param1);
            $stmt->execute();
            $room = $stmt->get_result()->fetch_assoc();
            if (!$room) json_response(['error' => 'room_not_found'], 404);
            json_response($room);
        } elseif ($request_method === 'POST' && is_numeric($param1) && $param2 === 'qr' && $param3 === 'regenerate') {
            // Regenerate QR token for the floor that this room belongs to
            $newToken = generate_random_token();
            $stmt = $mysqli->prepare("UPDATE tbl_floors f JOIN tbl_rooms r ON f.floor_id = r.floor_id SET f.qr_token = ?, f.qr_token_active = 1 WHERE r.room_id = ?");
            $stmt->bind_param("si", $newToken, $param1);
            $stmt->execute();
            json_response(['ok' => true, 'room_id' => (int)$param1, 'qr_token' => $newToken, 'qr_token_active' => 1]);
        }  elseif ($request_method === 'POST' && is_numeric($param1) && $param2 === 'qr' && $param3 === 'toggle-active') {
            $active = isset($input['active']) && $input['active'] ? 1 : 0;
            $stmt = $mysqli->prepare("UPDATE tbl_floors f JOIN tbl_rooms r ON f.floor_id = r.floor_id SET f.qr_token_active = ? WHERE r.room_id = ?");
            $stmt->bind_param("ii", $active, $param1);
            $stmt->execute();
            json_response(['ok' => true, 'room_id' => (int)$param1, 'qr_token_active' => $active]);
        }
        break;

    default:
        json_response(['error' => 'Endpoint not found in locations API file.'], 404);
        break;
}
