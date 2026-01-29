<?php
// server-php/api/dashboard.php

global $mysqli;

$request_method = $_SERVER['REQUEST_METHOD'];
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$parts = explode('/', $path);
$api_prefix_key = array_search('api', $parts);
$param1 = $parts[$api_prefix_key + 2] ?? null;

if ($request_method === 'GET') {
    if ($param1 === 'summary') {
        $queries = [
            'total_departments' => 'SELECT COUNT(*) AS cnt FROM tbl_departments',
            'total_programs' => 'SELECT COUNT(*) AS cnt FROM tbl_programs',
            'total_sections' => 'SELECT COUNT(*) AS cnt FROM tbl_sections',
            'total_semesters' => 'SELECT COUNT(*) AS cnt FROM tbl_semesters',
            'total_subjects' => 'SELECT COUNT(*) AS cnt FROM tbl_subject',
            'total_offerings' => 'SELECT COUNT(*) AS cnt FROM tbl_subject_offerings',
            'total_rooms' => 'SELECT COUNT(*) AS cnt FROM tbl_rooms',
            'total_teachers' => 'SELECT COUNT(*) AS cnt FROM tbl_users WHERE role_id = 5 AND status = 1',
            'present' => 'SELECT COUNT(*) AS cnt FROM tbl_attendance_records WHERE DATE(date) = CURDATE() AND (flag_in_id = 2 OR flag_check_id = 2 OR flag_out_id = 2)',
            'absent' => 'SELECT COUNT(*) AS cnt FROM tbl_attendance_records WHERE DATE(date) = CURDATE() AND (flag_in_id = 3 OR flag_check_id = 3 OR flag_out_id = 3)',
            'late' => 'SELECT COUNT(*) AS cnt FROM tbl_attendance_records WHERE DATE(date) = CURDATE() AND (flag_in_id = 5 OR flag_check_id = 5 OR flag_out_id = 5)',
        ];
        $summary = [];
        foreach ($queries as $key => $sql) {
            $result = $mysqli->query($sql);
            $summary[$key] = $result->fetch_assoc()['cnt'] ?? 0;
        }
        
        $response = [
            'total_departments' => (int)$summary['total_departments'],
            'total_programs' => (int)$summary['total_programs'],
            'total_sections' => (int)$summary['total_sections'],
            'total_semesters' => (int)$summary['total_semesters'],
            'total_subjects' => (int)$summary['total_subjects'],
            'total_offerings' => (int)$summary['total_offerings'],
            'total_rooms' => (int)$summary['total_rooms'],
            'total_teachers' => (int)$summary['total_teachers'],
            'attendance_today' => [
                'present' => (int)$summary['present'],
                'absent' => (int)$summary['absent'],
                'late' => (int)$summary['late'],
            ],
        ];
        json_response($response);

    } elseif ($param1 === 'full') {
        $summary_query = "SELECT
                             (SELECT COUNT(*) FROM tbl_departments) AS total_departments,
                             (SELECT COUNT(*) FROM tbl_programs) AS total_programs,
                             (SELECT COUNT(*) FROM tbl_sections) AS total_sections,
                             (SELECT COUNT(*) FROM tbl_semesters) AS total_semesters,
                             (SELECT COUNT(*) FROM tbl_subject) AS total_subjects,
                             (SELECT COUNT(*) FROM tbl_subject_offerings) AS total_offerings,
                             (SELECT COUNT(*) FROM tbl_rooms) AS total_rooms,
                             (SELECT COUNT(*) FROM tbl_users WHERE role_id = 5 AND status = 1) AS total_teachers";
        $summary_counts = $mysqli->query($summary_query)->fetch_assoc();

        $present_count = $mysqli->query("SELECT COUNT(*) AS cnt FROM tbl_attendance_records WHERE DATE(date) = CURDATE() AND (flag_in_id = 2 OR flag_check_id = 2 OR flag_out_id = 2)")->fetch_assoc()['cnt'];
        $absent_count = $mysqli->query("SELECT COUNT(*) AS cnt FROM tbl_attendance_records WHERE DATE(date) = CURDATE() AND (flag_in_id = 3 OR flag_check_id = 3 OR flag_out_id = 3)")->fetch_assoc()['cnt'];
        $late_count = $mysqli->query("SELECT COUNT(*) AS cnt FROM tbl_attendance_records WHERE DATE(date) = CURDATE() AND (flag_in_id = 5 OR flag_check_id = 5 OR flag_out_id = 5)")->fetch_assoc()['cnt'];

        $summary_response = [
            'total_departments' => (int)$summary_counts['total_departments'],
            'total_programs' => (int)$summary_counts['total_programs'],
            'total_sections' => (int)$summary_counts['total_sections'],
            'total_semesters' => (int)$summary_counts['total_semesters'],
            'total_subjects' => (int)$summary_counts['total_subjects'],
            'total_offerings' => (int)$summary_counts['total_offerings'],
            'total_rooms' => (int)$summary_counts['total_rooms'],
            'total_teachers' => (int)$summary_counts['total_teachers'],
            'attendance_today' => [
                'present' => (int)$present_count,
                'absent' => (int)$absent_count,
                'late' => (int)$late_count,
            ]
        ];
        
        $departments = $mysqli->query('SELECT dept_id, dept_name FROM tbl_departments ORDER BY dept_name')->fetch_all(MYSQLI_ASSOC);
        $programs = $mysqli->query('SELECT program_id, program_name FROM tbl_programs ORDER BY program_name')->fetch_all(MYSQLI_ASSOC);
        $sections = $mysqli->query('SELECT section_id, section_name FROM tbl_sections ORDER BY section_name')->fetch_all(MYSQLI_ASSOC);
        $semesters = $mysqli->query("SELECT semester_id, term, DATE_FORMAT(start_date, '%Y-%m-%d') as start_date, DATE_FORMAT(end_date, '%Y-%m-%d') as end_date FROM tbl_semesters ORDER BY start_date DESC")->fetch_all(MYSQLI_ASSOC);
        $subjects = $mysqli->query('SELECT subject_id, subject_code, subject_name FROM tbl_subject ORDER BY subject_code')->fetch_all(MYSQLI_ASSOC);
        $offerings = $mysqli->query('SELECT so.offering_id, so.semester_id, so.section_id, so.subject_id, so.user_id, s.subject_code, s.subject_name, sec.section_name FROM tbl_subject_offerings so LEFT JOIN tbl_subject s ON so.subject_id = s.subject_id LEFT JOIN tbl_sections sec ON so.section_id = sec.section_id ORDER BY s.subject_code, sec.section_name')->fetch_all(MYSQLI_ASSOC);
        $rooms = $mysqli->query('SELECT room_id, room_name, latitude, longitude, radius FROM tbl_rooms ORDER BY room_name')->fetch_all(MYSQLI_ASSOC);
        $teachers = $mysqli->query('SELECT user_id, first_name, last_name FROM tbl_users WHERE role_id = 5 AND status = 1 ORDER BY last_name, first_name')->fetch_all(MYSQLI_ASSOC);
        $recent_attendance = $mysqli->query("SELECT ar.attendance_id, ar.user_id, ar.schedule_id, ar.room_id, DATE_FORMAT(ar.date, '%Y-%m-%d') AS date, ar.time_in, ar.latitude_in, ar.longitude_in, ar.flag_in_id, ar.time_check, ar.latitude_check, ar.longitude_check, ar.flag_check_id, ar.time_out, ar.flag_out_id, u.first_name, u.last_name, cs.start_time, cs.end_time, r.room_name, s.subject_code, s.subject_name, ft.flag_name AS flag_in_name FROM tbl_attendance_records ar LEFT JOIN tbl_users u ON ar.user_id = u.user_id LEFT JOIN tbl_class_schedules cs ON ar.schedule_id = cs.schedule_id LEFT JOIN tbl_rooms r ON ar.room_id = r.room_id LEFT JOIN tbl_subject_offerings so ON cs.offering_id = so.offering_id LEFT JOIN tbl_subject s ON so.subject_id = s.subject_id LEFT JOIN tbl_flag_types ft ON ar.flag_in_id = ft.flag_id ORDER BY ar.date DESC, ar.attendance_id DESC LIMIT 20")->fetch_all(MYSQLI_ASSOC);

        // --- New visualization data ---
        // 1) Attendance trend for last 14 days (present/absent/late counts per day)
        $trend_sql = "SELECT DATE(date) AS d,
                        SUM((flag_in_id = 2) OR (flag_check_id = 2) OR (flag_out_id = 2)) AS present,
                        SUM((flag_in_id = 3) OR (flag_check_id = 3) OR (flag_out_id = 3)) AS absent,
                        SUM((flag_in_id = 5) OR (flag_check_id = 5) OR (flag_out_id = 5)) AS late,
                        COUNT(*) AS total
                      FROM tbl_attendance_records
                      WHERE DATE(date) >= CURDATE() - INTERVAL 13 DAY
                      GROUP BY DATE(date)
                      ORDER BY DATE(date) ASC";
        $trend = $mysqli->query($trend_sql)->fetch_all(MYSQLI_ASSOC);

        // 2) Hourly distribution for today (by time_in hour)
        $hour_sql = "SELECT HOUR(time_in) AS hr, COUNT(*) AS cnt FROM tbl_attendance_records WHERE DATE(date) = CURDATE() AND time_in IS NOT NULL GROUP BY hr ORDER BY hr ASC";
        $hourly = $mysqli->query($hour_sql)->fetch_all(MYSQLI_ASSOC);

        // 3) Top rooms in last 30 days
        $top_rooms_sql = "SELECT r.room_id, r.room_name, COUNT(*) AS checks FROM tbl_attendance_records ar JOIN tbl_rooms r ON ar.room_id = r.room_id WHERE ar.date >= CURDATE() - INTERVAL 30 DAY GROUP BY ar.room_id ORDER BY checks DESC LIMIT 10";
        $top_rooms = $mysqli->query($top_rooms_sql)->fetch_all(MYSQLI_ASSOC);

        // 4) Floor distribution (last 30 days)
        $floor_sql = "SELECT f.floor_id, f.floor_name, COUNT(*) AS checks FROM tbl_attendance_records ar JOIN tbl_floors f ON ar.floor_id = f.floor_id WHERE ar.date >= CURDATE() - INTERVAL 30 DAY GROUP BY f.floor_id ORDER BY checks DESC";
        $floor_dist = $mysqli->query($floor_sql)->fetch_all(MYSQLI_ASSOC);

        // 5) Attendance by role (last 30 days)
        $role_sql = "SELECT ro.role_id, ro.role_name, COUNT(*) AS checks FROM tbl_attendance_records ar JOIN tbl_users u ON ar.user_id = u.user_id JOIN tbl_roles ro ON u.role_id = ro.role_id WHERE ar.date >= CURDATE() - INTERVAL 30 DAY GROUP BY ro.role_id ORDER BY checks DESC";
        $by_role = $mysqli->query($role_sql)->fetch_all(MYSQLI_ASSOC);

        // 6) Weekly summary (last 7 days total counts)
        $weekly_sql = "SELECT DATE(date) AS d, COUNT(*) AS total FROM tbl_attendance_records WHERE DATE(date) >= CURDATE() - INTERVAL 6 DAY GROUP BY DATE(date) ORDER BY DATE(date) ASC";
        $weekly = $mysqli->query($weekly_sql)->fetch_all(MYSQLI_ASSOC);

        json_response([
            'summary' => $summary_response,
            'departments' => $departments,
            'programs' => $programs,
            'sections' => $sections,
            'semesters' => $semesters,
            'subjects' => $subjects,
            'offerings' => $offerings,
            'rooms' => $rooms,
            'teachers' => $teachers,
            'recent_attendance' => $recent_attendance,
            // visualization-specific data
            'viz' => [
                'trend_14d' => $trend,
                'hourly_today' => $hourly,
                'top_rooms_30d' => $top_rooms,
                'floor_distribution_30d' => $floor_dist,
                'attendance_by_role_30d' => $by_role,
                'weekly_7d' => $weekly
            ]
        ]);
    }
} else {
    json_response(['error' => 'Invalid request method for dashboard.'], 405);
}
