import React from 'react';
import Modal from '../../components/Modal.jsx';
// Ensure these components exist in your project or adjust imports
import { apiGet, apiPost } from '../../services/api.js';

const API_BASE = (typeof window !== 'undefined' && window.API_BASE) ? window.API_BASE : '/server-php/api';

// --- Helpers ---
const deg2rad = (deg) => (deg * Math.PI) / 180;

const getDistanceMeters = (lat1, lon1, lat2, lon2) => {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return Infinity;
  const R = 6371000;
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const isInsideBox = (coords, room) => {
  if (!coords || !room) return false;
  const metersPerDegLat = 111320;
  const deltaLat = Number(room.radius) / metersPerDegLat;
  const latRad = deg2rad(Number(room.latitude || 0));
  const metersPerDegLon = Math.max(1e-6, metersPerDegLat * Math.cos(latRad));
  const deltaLon = Number(room.radius) / metersPerDegLon;
  
  const minLat = Number(room.latitude) - deltaLat;
  const maxLat = Number(room.latitude) + deltaLat;
  const minLon = Number(room.longitude) - deltaLon;
  const maxLon = Number(room.longitude) + deltaLon;

  return coords.latitude >= minLat && coords.latitude <= maxLat && 
         coords.longitude >= minLon && coords.longitude <= maxLon;
};

const formatDateYMD = (d) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatTime12 = (value) => {
  if (!value) return '—';
  // Handle cases where value might be just HH:MM:SS or ISO
  const timeStr = value.includes('T') ? value : `1970-01-01T${value}`;
  const d = new Date(timeStr);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};

const getFlagLabel = (flagId) => {
  switch (flagId) {
    case 1: return 'NA';
    case 2: return 'Present';
    case 3: return 'Absent';
    case 4: return 'Excused';
    case 5: return 'Late';
    default: return '—';
  }
};

export default function AttendanceIndex() {
  const [userId, setUserId] = React.useState(null);
  const [teacherName, setTeacherName] = React.useState('');
  
  const [records, setRecords] = React.useState([]);
  const [rooms, setRooms] = React.useState([]);
  const [floors, setFloors] = React.useState([]);
  const [buildings, setBuildings] = React.useState([]);
  const [currentBuilding, setCurrentBuilding] = React.useState(null);
  
  const [coords, setCoords] = React.useState(null);
  const [errorMessage, setErrorMessage] = React.useState(null);
  const [wrongFloorInfo, setWrongFloorInfo] = React.useState(null);
  const [filterMode, setFilterMode] = React.useState('today');
  
  const [actionAllowed, setActionAllowed] = React.useState(false);
  const [allowAt, setAllowAt] = React.useState(null);
  const [currentAction, setCurrentAction] = React.useState(null);
  
  const [isCameraVisible, setIsCameraVisible] = React.useState(false);
  const [detectedFloor, setDetectedFloor] = React.useState(null);
  const [usingDbFloor, setUsingDbFloor] = React.useState(false);
  // Debug preview for diagnosing camera issues
  const debugVideoRef = React.useRef(null);
  const previewStreamRef = React.useRef(null);
  const [previewActive, setPreviewActive] = React.useState(false);
  const scannerStartedRef = React.useRef(false);
  // Keep a stable ref to the latest handleCheckNow to avoid restarting the scanner when
  // React re-creates the handleCheckNow callback due to other state updates (e.g. polling)
  const handleCheckNowRef = React.useRef(null);
  
  // Next Schedule Logic
  const [nextSchedule, setNextSchedule] = React.useState(null);
  const [nextStartDate, setNextStartDate] = React.useState(null);
  const [nextSecondsLeft, setNextSecondsLeft] = React.useState(null);

  const [cameraPermission, setCameraPermission] = React.useState('prompt');

  // Stored scanned QR token (scan-only UX). When non-null, Do Check will include this token.
  const [scannedQrToken, setScannedQrToken] = React.useState(null);
  const [scannedFloor, setScannedFloor] = React.useState(null);
  const LOCAL_STORAGE_KEY = 'attendance_scanned_qr_v1';

  // Load persisted scanned token from localStorage when floors and records are ready
  React.useEffect(() => {
    // Wait until floors and records are loaded before attempting to restore
    try {
      const floorsReady = Array.isArray(floors) && floors.length > 0;
      const recordsReady = Array.isArray(records); // may be empty but defined
      if (!floorsReady || !recordsReady) return; // wait for data

      const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.token) return;

      // Compute active schedule from records (avoid referencing findActiveSchedule before it's declared)
      const now = new Date();
      const todayStr = formatDateYMD(now);
      const todays = records.filter(r => r.date === todayStr);
      const active = todays.find(r => {
        if (!r.start_time || !r.end_time) return false;
        const start = new Date(`${r.date}T${r.start_time}`);
        const end = new Date(`${r.date}T${r.end_time}`);
        return now >= start && now <= end;
      }) || null;

      if (parsed.schedule_id && active && (String(parsed.schedule_id) !== String(active.schedule_id))) {
        // different schedule -> don't restore
        localStorage.removeItem(LOCAL_STORAGE_KEY);
        return;
      }

      // Restore token and floor if floor exists in current floors list
      if (parsed.floor_id) {
        const f = floors.find(ff => String(ff.floor_id) === String(parsed.floor_id));
        if (f) {
          setScannedQrToken(parsed.token);
          setScannedFloor(f);
        } else {
          // no matching floor in current data -> drop
          localStorage.removeItem(LOCAL_STORAGE_KEY);
        }
      } else {
        // restore token only
        setScannedQrToken(parsed.token);
      }
    } catch (e) { /* ignore parse errors */ }
  }, [floors, records]);

  // Persist scanned token to localStorage when it changes
  React.useEffect(() => {
    try {
      if (!scannedQrToken) {
        localStorage.removeItem(LOCAL_STORAGE_KEY);
        return;
      }
      // Compute active schedule from records to avoid early reference
      const now = new Date();
      const todayStr = formatDateYMD(now);
      const todays = records.filter(r => r.date === todayStr);
      const active = todays.find(r => {
        if (!r.start_time || !r.end_time) return false;
        const start = new Date(`${r.date}T${r.start_time}`);
        const end = new Date(`${r.date}T${r.end_time}`);
        return now >= start && now <= end;
      }) || null;

      const payload = {
        token: scannedQrToken,
        floor_id: scannedFloor ? scannedFloor.floor_id : null,
        schedule_id: active ? active.schedule_id : null,
        ts: Date.now()
      };
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(payload));
    } catch (e) {}
  }, [scannedQrToken, scannedFloor, records]);

  const lastCoordsRef = React.useRef(null);
  const watchIdRef = React.useRef(null);
  const pollingRef = React.useRef(null);
  const isFetchingRef = React.useRef(false);
  const pausedPollingRef = React.useRef(false);

  const ACCURACY_THRESHOLD_METERS = 30;
  const ALTITUDE_ACCURACY_THRESHOLD_METERS = 30;
  const LOCATION_DISTANCE_INTERVAL_METERS = 5;

  // --- Init ---
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const uid = params.get('userId');
    const nameParam = params.get('name') || '';
    if (uid) {
      setUserId(Number(uid));
      setTeacherName(nameParam);
      return;
    }
    // fallback: try reading logged-in user from localStorage (AuthContext stores 'user')
    try {
      const stored = localStorage.getItem('user');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && (parsed.user_id || parsed.id || parsed.userId)) {
          const resolvedId = parsed.user_id || parsed.id || parsed.userId;
          setUserId(Number(resolvedId));
          setTeacherName((parsed.first_name && parsed.last_name) ? `${parsed.first_name} ${parsed.last_name}` : (nameParam || parsed.name || ''));
          return;
        }
      }
    } catch (e) {}
    // no userId found
    setUserId(null);
    setTeacherName(nameParam || '');
  }, []);

  // Fetch rooms & floors on mount regardless of userId so nearest-room and floor info is available
  React.useEffect(() => {
    (async () => {
      try {
        const [roomsData, floorsData] = await Promise.all([apiGet('rooms'), apiGet('floors')]);
        if (Array.isArray(roomsData)) setRooms(roomsData);
        if (Array.isArray(floorsData)) setFloors(floorsData);
      } catch (err) {
        console.error('Failed loading rooms/floors (initial):', err);
      }
    })();
  }, []);

  // Fetch buildings (separate effect so UIs that only need buildings can load quickly)
  React.useEffect(() => {
    (async () => {
      try {
        const data = await apiGet('buildings');
        setBuildings(Array.isArray(data) ? data : []);
      } catch (e) {
        console.error('Failed to load buildings', e);
      }
    })();
  }, []);

  const loadMyAttendance = React.useCallback(async () => {
    if (!userId || isFetchingRef.current) return;
    isFetchingRef.current = true;
    try {
      const data = await apiGet(`attendance?teacher_id=${userId}`);
      setRecords(Array.isArray(data) ? data : []);
      setErrorMessage(null);
    } catch (err) {
      setErrorMessage(err && err.message ? `Network Error: ${err.message}` : 'Network Error');
    } finally {
      isFetchingRef.current = false;
    }
  }, [userId]);

  const startLocationTracking = React.useCallback(() => {
    if (!('geolocation' in navigator)) {
      setErrorMessage('Geolocation is not supported.');
      return;
    }
    try {
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          const newCoords = pos.coords;
          
          // Throttle updates based on distance
          const last = lastCoordsRef.current;
          if (last) {
            const dist = getDistanceMeters(newCoords.latitude, newCoords.longitude, last.latitude, last.longitude);
            if (dist < LOCATION_DISTANCE_INTERVAL_METERS) return; 
          }
          
          lastCoordsRef.current = newCoords;
          setCoords(newCoords);
          // Auto-clear GPS errors on success
          setErrorMessage(null);
        },
        (err) => {
          setErrorMessage(`GPS Error: ${err && err.message ? err.message : String(err)}`);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    } catch (err) {
      setErrorMessage('Failed to start geolocation: ' + (err.message || err));
    }
  }, []);

  // --- Hybrid polling fallback (forces UI update every 2s) ---
  const gpsPollRef = React.useRef(null);
  const LOCATION_POLL_INTERVAL_MS = 2000; // 2 seconds

  const startGpsPoll = React.useCallback(() => {
    if (gpsPollRef.current) return;
    if (!('geolocation' in navigator)) return;
    // Run getCurrentPosition periodically. This will cause setCoords() every interval
    // (getCurrentPosition provides a fresh coords object so React re-renders even if values equal).
    gpsPollRef.current = setInterval(() => {
      try {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const newCoords = pos.coords;
            lastCoordsRef.current = newCoords;
            setCoords(newCoords);
            setErrorMessage(null);
          },
          (err) => {
            // Temporarily suppress UI spam — log detailed poll errors to console for debugging
            console.debug('GPS Poll Error (suppressed in UI):', err && err.message ? err.message : String(err));
            // keep friendly message handling elsewhere via gpsFailureCountRef escalation
          },
          { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
        );
      } catch (e) {
        // ignore
      }
    }, LOCATION_POLL_INTERVAL_MS);
  }, []);

  const stopGpsPoll = React.useCallback(() => {
    try {
      if (gpsPollRef.current) {
        clearInterval(gpsPollRef.current);
        gpsPollRef.current = null;
      }
    } catch (e) {}
  }, []);

  // Start polling when we have a user, the page is visible, and camera modal is closed.
  React.useEffect(() => {
    const update = () => {
      try {
        const visible = (typeof document !== 'undefined') ? document.visibilityState === 'visible' : true;
        if (userId && visible && !isCameraVisible) startGpsPoll(); else stopGpsPoll();
      } catch (e) {}
    };
    update();
    document.addEventListener('visibilitychange', update);
    return () => { stopGpsPoll(); document.removeEventListener('visibilitychange', update); };
  }, [userId, isCameraVisible, startGpsPoll, stopGpsPoll]);

  // --- Initial Data Load ---
  React.useEffect(() => {
    if (!userId) return;

    (async () => {
      try {
        const [roomsData, floorsData] = await Promise.all([
          apiGet('rooms'),
          apiGet('floors')
        ]);
        if (Array.isArray(roomsData)) setRooms(roomsData);
        if (Array.isArray(floorsData)) setFloors(floorsData);
      } catch (err) {
        console.error('Failed loading rooms/floors', err);
      }
    })();

    loadMyAttendance();
    startLocationTracking();

    pollingRef.current = setInterval(loadMyAttendance, 5000);

    return () => {
      if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current);
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [userId, loadMyAttendance, startLocationTracking]);

  // --- Floor & Room Logic ---
  
  const detectFloorFromAltitude = React.useCallback((alt, buildingId = null) => {
    if (alt == null || !floors.length) return null;
    // Narrow candidates by building if known
    const candidates = buildingId ? floors.filter(f => f.building_id === buildingId) : floors;
    if (!candidates.length) return null;

    let best = null;
    for (const f of candidates) {
      if (f.baseline_altitude == null) continue;
      const diff = Math.abs(Number(f.baseline_altitude) - Number(alt));
      if (!best || diff < best.diff) {
        best = { diff, floor: f };
      }
    }
    return best ? best.floor : null;
  }, [floors]);

  // Determine which building we're currently inside (based on coords). Prefers nearest containing building.
  React.useEffect(() => {
    if (!coords || !Array.isArray(buildings) || buildings.length === 0) { setCurrentBuilding(null); return; }
    let best = null;
    for (const b of buildings) {
      // tolerate different column names (latitude may be stored in 'altitude' column)
      const bLat = (b.latitude ?? b.lat ?? b.altitude ?? null);
      const bLon = (b.longitude ?? b.lon ?? b.lng ?? b.longitude ?? null);
      const bRadius = Number(b.radius ?? b.building_radius ?? 0);
      if (bLat == null || bLon == null) continue;
      const d = getDistanceMeters(coords.latitude, coords.longitude, Number(bLat), Number(bLon));
      if (d <= bRadius) {
        if (!best || d < best.dist) best = { building: b, dist: d };
      }
    }
    setCurrentBuilding(best ? best.building : null);
  }, [coords, buildings]);

  const findNearestRoom = React.useCallback((coords) => {
    if (!coords || !rooms.length) return null;

    // Determine building context: scannedFloor => strict, else detected building if present
    const buildingIdToUse = scannedFloor?.building_id ?? currentBuilding?.building_id ?? null;

    // 1. Filter by 2D bounding box and building
    let candidates = rooms.filter(room => {
      if (!room) return false;
      if (buildingIdToUse && Number(room.building_id) !== Number(buildingIdToUse)) return false;
      return isInsideBox(coords, room);
    });

    // If a scanned floor is present, strictly limit candidates to that floor only
    if (scannedFloor) {
      candidates = candidates.filter(r => String(r.floor_id) === String(scannedFloor.floor_id));
      // If no rooms on the scanned floor are inside the box, try nearest rooms on that same floor within fallback range
      const NEAREST_FALLBACK_METERS = 100;
      if (!candidates.length) {
        const within = [];
        for (const room of rooms) {
          if (String(room.floor_id) !== String(scannedFloor.floor_id)) continue;
          if (room.latitude == null || room.longitude == null) continue;
          const d = getDistanceMeters(coords.latitude, coords.longitude, room.latitude, room.longitude);
          if (d <= NEAREST_FALLBACK_METERS) within.push({ room, dist: d });
        }
        if (within.length) {
          within.sort((a,b)=> a.dist - b.dist);
          candidates = within.map(w => w.room);
        } else {
          // No candidate rooms on the scanned floor — do not fallback to other floors per strict requirement
          return null;
        }
      }
    } else {
      // No scanned floor: original behavior — fall back to nearest rooms globally within a reasonable radius
      const NEAREST_FALLBACK_METERS = 100; // show nearest room if within 100m
      if (!candidates.length) {
        const within = [];
        for (const room of rooms) {
          if (room.latitude == null || room.longitude == null) continue;
          const d = getDistanceMeters(coords.latitude, coords.longitude, room.latitude, room.longitude);
          if (d <= NEAREST_FALLBACK_METERS) within.push({ room, dist: d });
        }
        if (within.length) {
          within.sort((a,b)=> a.dist - b.dist);
          candidates = within.map(w => w.room);
        } else {
          let best = null; let bestDist = Infinity;
          for (const room of rooms) {
            if (room.latitude == null || room.longitude == null) continue;
            const d = getDistanceMeters(coords.latitude, coords.longitude, room.latitude, room.longitude);
            if (d < bestDist) { bestDist = d; best = room; }
          }
          return best;
        }
      }
    }

    // 2. If Altitude is available, use 3D logic
    const alt = scannedFloor && scannedFloor.baseline_altitude != null ? Number(scannedFloor.baseline_altitude) : (typeof coords.altitude === 'number' ? coords.altitude : null);
    if (alt != null && Array.isArray(floors) && floors.length) {
      const preferred = [];
      
      for (const room of candidates) {
        // Try to find room's floor data
        const roomFloor = room.floor_id ? floors.find(f => f.floor_id === room.floor_id) : null;
        const buildingId = room.building_id || (roomFloor ? roomFloor.building_id : null);
        
        let baseline = null;
        let vertical = null;

        if (roomFloor && roomFloor.baseline_altitude != null) {
          baseline = Number(roomFloor.baseline_altitude);
          vertical = roomFloor.floor_meter_vertical != null ? Number(roomFloor.floor_meter_vertical) : null;
        } else if (buildingId) {
          // Fallback: try to guess floor from altitude for this building
          const matchedFloor = detectFloorFromAltitude(alt, buildingId);
          if (matchedFloor && matchedFloor.floor_id === room.floor_id && matchedFloor.baseline_altitude != null) {
            baseline = Number(matchedFloor.baseline_altitude);
            vertical = matchedFloor.floor_meter_vertical != null ? Number(matchedFloor.floor_meter_vertical) : null;
          }
        }

        if (baseline != null) {
          const diff = Math.abs(baseline - Number(alt));
          // Use dynamic tolerance from TSX
          const tolerance = vertical != null ? vertical / 2 : 1.5;
          
          if (diff <= tolerance) {
            const dist = getDistanceMeters(coords.latitude, coords.longitude, room.latitude, room.longitude);
            preferred.push({ room, dist });
          }
        }
      }

      if (preferred.length) {
        preferred.sort((a, b) => a.dist - b.dist);
        return preferred[0].room;
      }
    }

    // 3. Nearest by horizontal distance among candidates
    let best = null;
    let bestDist = Infinity;
    for (const room of candidates) {
      const d = getDistanceMeters(coords.latitude, coords.longitude, room.latitude, room.longitude);
      if (d < bestDist) {
        bestDist = d;
        best = room;
      }
    }
    return best;
  }, [rooms, floors, detectFloorFromAltitude, scannedFloor, currentBuilding]);

  const getNearestRoomLabel = (coords) => {
    if (!coords) return { name: 'X', floor: 'X', building: 'X' };
    // If we are not inside a known building and there's no scanned floor or DB-detected floor,
    // show explicit X placeholders instead of guessing nearest room/building.
    if (!currentBuilding && !scannedFloor && !usingDbFloor && !detectedFloor) {
      return { name: 'X', floor: 'X', building: 'X' };
    }
    const room = findNearestRoom(coords);
    if (!room) return { name: 'X', floor: 'X', building: 'X' };
    const dist = getDistanceMeters(coords.latitude, coords.longitude, room.latitude, room.longitude);
    const roomFloor = (room.floor_id && floors.length) ? floors.find(f => f.floor_id === room.floor_id) : null;
    // prefer scannedFloor if present
    const floorName = scannedFloor ? (scannedFloor.floor_name || 'X') : (roomFloor ? roomFloor.floor_name : (detectFloorFromAltitude(coords?.altitude, room.building_id)?.floor_name || 'X'));
    const buildingObj = buildings.find(b => Number(b.building_id) === Number(room.building_id)) || currentBuilding || null;
    const buildingName = buildingObj ? (buildingObj.building_name || 'X') : 'X';
    return { name: `${room.room_name || 'Unnamed'} (${Math.round(dist)}m)`, floor: floorName, building: buildingName };
  };

  // --- Permission Watcher (Web Specific) ---
  React.useEffect(() => {
    if (!('permissions' in navigator)) return;
    let mounted = true;
    try {
      navigator.permissions.query({ name: 'camera' }).then(status => {
        if (!mounted) return;
        setCameraPermission(status.state || 'prompt');
        status.onchange = () => { if (mounted) setCameraPermission(status.state || 'prompt'); };
      }).catch(() => {});
    } catch (e) {}
    return () => { mounted = false; };
  }, []);

  // --- Schedule Logic ---

  // Strict active check (for Action Button)
  const findActiveSchedule = React.useCallback(() => {
    const now = new Date();
    const todayStr = formatDateYMD(now);
    // Optimization: Filter by today first
    const todays = records.filter(r => r.date === todayStr);
    
    return todays.find(r => {
      if (!r.start_time || !r.end_time) return false;
      const start = new Date(`${r.date}T${r.start_time}`);
      const end = new Date(`${r.date}T${r.end_time}`);
      return now >= start && now <= end;
    });
  }, [records]);

  // Fuzzy check (for List Sorting) - Matches TSX 'findTodayCurrentRecord'
  const findTodayCurrentRecord = React.useCallback(() => {
    const now = new Date();
    const todayStr = formatDateYMD(now);
    const todays = records.filter(r => r.date === todayStr);
    if (!todays.length) return null;

    // 1. Active now?
    const active = todays.find(r => {
      const start = new Date(`${r.date}T${r.start_time}`);
      const end = new Date(`${r.date}T${r.end_time}`);
      return now >= start && now <= end;
    });
    if (active) return active;

    // 2. Else nearest?
    let best = null;
    for (const r of todays) {
      const start = new Date(`${r.date}T${r.start_time}`);
      if (!best) {
        best = { r, start };
      } else {
        const bestDiff = Math.abs(best.start.getTime() - now.getTime());
        const curDiff = Math.abs(start.getTime() - now.getTime());
        if (curDiff < bestDiff) best = { r, start };
      }
    }
    return best ? best.r : null;
  }, [records]);

  const computeActionState = React.useCallback((rec) => {
    if (!rec) return { allowed: false, action: null, allowAt: null, predictedFlag: null };
    const now = new Date();
    const classStart = new Date(`${rec.date}T${rec.start_time}`);
    const classEnd = new Date(`${rec.date}T${rec.end_time}`);

    let action = null;
    if (!rec.time_in) action = 'check-in';
    else if (!rec.time_check) action = 'mid-check';
    else if (!rec.time_out) action = 'check-out';
    else return { allowed: false, action: null, allowAt: null, predictedFlag: null };

    if (action === 'check-in') {
      if (now < classStart) return { allowed: false, allowAt: classStart.toISOString(), action, predictedFlag: null };
      const presentEnd = new Date(classStart.getTime() + 15 * 60000);
      const predictedFlag = now <= presentEnd ? 'present' : 'late';
      return { allowed: true, allowAt: null, action, predictedFlag };
    }

    if (action === 'mid-check') {
      const center = new Date(classStart.getTime() + (classEnd.getTime() - classStart.getTime()) / 2);
      const midStart = new Date(center.getTime() - 10 * 60000);
      if (now < midStart) return { allowed: false, allowAt: midStart.toISOString(), action, predictedFlag: null };
      const predictedFlag = (now >= midStart && now <= new Date(center.getTime() + 10 * 60000)) ? 'present' : 'late';
      return { allowed: true, allowAt: null, action, predictedFlag };
    }

    // check-out
    const outStart = new Date(classEnd.getTime() - 15 * 60000);
    if (now < outStart) return { allowed: false, allowAt: outStart.toISOString(), action, predictedFlag: null };
    if (now > classEnd) return { allowed: false, allowAt: null, action, predictedFlag: null };
    return { allowed: true, allowAt: null, action, predictedFlag: 'present' };
  }, []);

  const computeNextSchedule = React.useCallback(() => {
    if (!records || !records.length) {
      setNextSchedule(null); setNextStartDate(null); setNextSecondsLeft(null);
      return;
    }
    const now = new Date();
    let best = null;
    let bestStart = null;

    for (const r of records) {
      const st = new Date(`${r.date}T${r.start_time}`);
      if (st.getTime() >= now.getTime()) {
        if (!bestStart || st < bestStart) {
          best = r;
          bestStart = st;
        }
      }
    }

    if (!best) {
      setNextSchedule(null); setNextStartDate(null); setNextSecondsLeft(null);
      return;
    }
    setNextSchedule(best);
    setNextStartDate(bestStart);
    setNextSecondsLeft(Math.max(0, Math.ceil((bestStart.getTime() - Date.now()) / 1000)));
  }, [records]);

  // Effects for Action State and Next Schedule
  React.useEffect(() => {
    computeNextSchedule();
  }, [records, computeNextSchedule]);

  React.useEffect(() => {
    if (!nextStartDate) {
      setNextSecondsLeft(null);
      return;
    }
    const tick = () => {
      setNextSecondsLeft(Math.max(0, Math.ceil((nextStartDate.getTime() - Date.now()) / 1000)));
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [nextStartDate]);

  React.useEffect(() => {
    const active = findActiveSchedule();
    const st = computeActionState(active);
    setActionAllowed(st.allowed);
    setAllowAt(st.allowAt);
    setCurrentAction(st.action);
    computeNextSchedule();
  }, [records, findActiveSchedule, computeActionState, computeNextSchedule]);

  // Filter attendance records for the list view: 'today', 'past', 'future'
  const filteredRecords = React.useMemo(() => {
    if (!Array.isArray(records)) return [];
    const now = new Date();
    const todayStr = formatDateYMD(now);
    try {
      if (filterMode === 'today') {
        return records.filter(r => r.date === todayStr);
      }
      if (filterMode === 'past') {
        return records.filter(r => {
          if (!r.date || !r.end_time) return false;
          return new Date(`${r.date}T${r.end_time}`).getTime() < now.getTime();
        });
      }
      if (filterMode === 'future') {
        return records.filter(r => {
          if (!r.date || !r.start_time) return false;
          return new Date(`${r.date}T${r.start_time}`).getTime() > now.getTime();
        });
      }
    } catch (e) {
      return records;
    }
    return records;
  }, [records, filterMode]);

  // Derived State for UI
  const currentRoomObj = React.useMemo(() => {
    const active = findActiveSchedule();
    return active ? rooms.find(r => r.room_id === active.room_id) || null : null;
  }, [records, rooms, findActiveSchedule]);

  const currentDist = React.useMemo(() => (coords && currentRoomObj) 
    ? getDistanceMeters(coords.latitude, coords.longitude, Number(currentRoomObj.latitude), Number(currentRoomObj.longitude)) 
    : null, 
  [coords, currentRoomObj]);

  const isInRoomBox = coords && currentRoomObj ? isInsideBox(coords, currentRoomObj) : false;
  const isOutOfRange = currentRoomObj ? !isInRoomBox : false;

  // Live validation: when a QR-scanned floor exists, treat its baseline_altitude + floor_meter_vertical
  // as the authoritative vertical band. While inside that band the scanned floor is authoritative.
  const scannedFloorInRange = React.useMemo(() => {
    try {
      if (!scannedFloor || !coords) return false;
      const base = (scannedFloor.baseline_altitude != null) ? Number(scannedFloor.baseline_altitude) : null;
      const vert = (scannedFloor.floor_meter_vertical != null) ? Number(scannedFloor.floor_meter_vertical) : null;
      if (base == null || vert == null) return false;
      const min = base - vert;
      const max = base + vert;
      const alt = (typeof coords.altitude === 'number') ? Number(coords.altitude) : null;
      if (alt == null) return false;
      return alt >= min && alt <= max;
    } catch (e) { return false; }
  }, [scannedFloor, coords]);

  // Expose numeric min/max/current for UI when scannedFloor present
  const scannedFloorRange = React.useMemo(() => {
    if (!scannedFloor) return null;
    const base = (scannedFloor.baseline_altitude != null) ? Number(scannedFloor.baseline_altitude) : null;
    const vert = (scannedFloor.floor_meter_vertical != null) ? Number(scannedFloor.floor_meter_vertical) : null;
    if (base == null || vert == null) return null;
    return { min: base - vert, max: base + vert, base };
  }, [scannedFloor]);

  // When scanned floor is breached, compute a suggested floor from current altitude (if possible)
  const altDetectedFloor = React.useMemo(() => {
    if (!coords || typeof coords.altitude !== 'number') return null;
    // prefer building context for detectFloorFromAltitude
    const bId = currentBuilding && currentBuilding.building_id ? Number(currentBuilding.building_id) : null;
    return detectFloorFromAltitude(coords.altitude, bId);
  }, [coords, detectFloorFromAltitude, currentBuilding]);

  // Building-awareness: determine if user is inside the scheduled class building
  const scheduledBuildingObj = React.useMemo(() => {
    if (!currentRoomObj || !Array.isArray(buildings)) return null;
    return buildings.find(b => Number(b.building_id) === Number(currentRoomObj.building_id)) || null;
  }, [currentRoomObj, buildings]);

  const isOutsideBuilding = React.useMemo(() => {
    if (!currentRoomObj) return false;
    if (!currentBuilding) return true; // not inside any known building
    return Number(currentBuilding.building_id) !== Number(currentRoomObj.building_id);
  }, [currentRoomObj, currentBuilding]);

  const notInAnyBuilding = React.useMemo(() => (!currentBuilding && Array.isArray(buildings) && buildings.length > 0), [currentBuilding, buildings]);

  // When currentBuilding changes, fetch building-scoped floors & rooms to limit client dataset
  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (currentBuilding && currentBuilding.building_id) {
          const bId = Number(currentBuilding.building_id);
          const [roomsData, floorsData] = await Promise.all([
            apiGet(`rooms?building_id=${bId}`),
            apiGet(`floors?building_id=${bId}`)
          ]);
          if (!mounted) return;
          if (Array.isArray(roomsData) && roomsData.length) setRooms(roomsData);
          if (Array.isArray(floorsData) && floorsData.length) setFloors(floorsData);
        } else {
          // No building detected -> fall back to global lists
          const [roomsData, floorsData] = await Promise.all([apiGet('rooms'), apiGet('floors')]);
          if (!mounted) return;
          if (Array.isArray(roomsData)) setRooms(roomsData);
          if (Array.isArray(floorsData)) setFloors(floorsData);
        }
      } catch (e) {
        console.warn('Failed to load building-scoped rooms/floors', e);
      }
    })();
    return () => { mounted = false; };
  }, [currentBuilding]);

  // Display Helpers
  const renderWrongFloorMessage = () => {
    // Prefer structured wrongFloorInfo from server if available
    const info = wrongFloorInfo;
    if (!info && (!errorMessage || !String(errorMessage).includes('wrong_floor'))) return null;

    if (info) {
      const floorId = info.expected_floor_id || info.floor_id || null;
      const floorObj = floorId && Array.isArray(floors) ? floors.find(f => Number(f.floor_id) === Number(floorId)) : null;
      const floorName = floorObj ? (floorObj.floor_name || `Floor ${floorId}`) : (info.expected_floor_name || 'the expected floor');
      const minAlt = (info.min_altitude != null) ? Number(info.min_altitude).toFixed(1) : null;
      const maxAlt = (info.max_altitude != null) ? Number(info.max_altitude).toFixed(1) : null;
      const detected = (info.detected_altitude != null) ? Number(info.detected_altitude).toFixed(1) : (coords && typeof coords.altitude === 'number' ? coords.altitude.toFixed(1) : 'N/A');

      return (
        React.createElement('div', { style: { padding: 10, backgroundColor: '#fff3cd', color: '#856404', borderRadius: 5, margin: '10px 0', textAlign: 'center', border: '1px solid #ffeeba' } },
          React.createElement('div', null, `You appear to be on a different floor.`),
          React.createElement('div', null, `Expected: ${floorName} — altitude range ${minAlt !== null ? `${minAlt}m` : 'N/A'} to ${maxAlt !== null ? `${maxAlt}m` : 'N/A'}`),
          React.createElement('div', null, `Your altitude: ${detected}m`)
        )
      );
    }

    // Fallback generic message when only errorMessage is present
    return (
      React.createElement('div', { style: { padding: 10, backgroundColor: '#fff3cd', color: '#856404', borderRadius: 5, margin: '10px 0', textAlign: 'center', border: '1px solid #ffeeba' } },
        'Your device altitude indicates you may be on a different floor. Move to the correct floor or contact the administrator.'
      )
    );
  };

  const nextCountdownStr = () => {
    if (nextSecondsLeft == null) return null;
    if (nextSecondsLeft <= 0) return 'now';
    const days = Math.floor(nextSecondsLeft / 86400);
    const hours = Math.floor((nextSecondsLeft % 86400) / 3600);
    const mins = Math.floor((nextSecondsLeft % 3600) / 60);
    const secs = nextSecondsLeft % 60;
    
    // Format: "1d 02:30:05" or "02:30:05"
    const h = String(hours).padStart(2, '0');
    const m = String(mins).padStart(2, '0');
    const s = String(secs).padStart(2, '0');
    
    if (days > 0) return `${days}d ${h}:${m}:${s}`;
    return `${h}:${m}:${s}`;
  };

  // --- Actions ---

  const openScannerWithPermission = async () => {
    // Prevent scanning when there is no active schedule
    const rec = findActiveSchedule();
    if (!rec) return alert('No active schedule — scanning disabled');
    if (cameraPermission === 'denied') {
      setErrorMessage('Camera permission is denied — enable it in browser settings.');
      return;
    }
    if (cameraPermission === 'prompt') {
      try {
        // Request rear camera explicitly to trigger permission prompt for camera on mobile
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        // Immediately stop tracks — we only wanted to prompt for permission now
        try { stream.getTracks().forEach(t => t.stop()); } catch (e) {}
        setCameraPermission('granted');
      } catch (e) {
        setCameraPermission('denied');
        setErrorMessage('Camera access denied.');
        return;
      }
    }
    // Pause background polling while scanner is active to avoid camera restarts
    try {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
        pausedPollingRef.current = true;
      }
    } catch(e) {}
    setIsCameraVisible(true);
  };

  // When the camera modal closes, resume polling if we paused it earlier
  React.useEffect(() => {
    if (!isCameraVisible && pausedPollingRef.current) {
      try {
        // restart polling only if not already running and userId available
        if (!pollingRef.current && userId) {
          pollingRef.current = setInterval(loadMyAttendance, 5000);
        }
        // Force immediate refresh to pick up any auto-absent changes made by cron
        loadMyAttendance().catch(()=>{});
      } catch (e) {}
      pausedPollingRef.current = false;
    }
    // If camera opened while polling not yet started, nothing to do
  }, [isCameraVisible, userId, loadMyAttendance]);

  // Optional: expose a function to fetch recent auto-absent debug info from server
  const fetchAutoAbsentDebug = React.useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/auto-absent-debug`);
      if (!res.ok) return null;
      const j = await res.json();
      console.log('Auto-absent debug:', j);
      return j;
    } catch (e) { console.warn('Auto-absent debug fetch failed'); return null; }
  }, []);

  const handleCheckNow = React.useCallback(async (scannedQrToken = null) => {
    setErrorMessage(null); // Clear previous errors
    setWrongFloorInfo(null);

    const rec = findActiveSchedule();
    if (!rec) {
      if (scannedQrToken) {
        alert('No active schedule found.');
        setIsCameraVisible(false);
      } else {
        alert('No active schedule found.');
      }
      return;
    }

    if (!scannedQrToken) {
      if (!actionAllowed) return alert('Action not allowed at this time.');
      if (!coords) return alert('Waiting for GPS coordinates.');
      if (!currentRoomObj) {
        // Try to recover: maybe rooms weren't loaded or types mismatch (string vs number)
        console.warn('Room lookup failed for schedule:', rec);
        try {
          const refreshed = await apiGet('rooms');
          if (Array.isArray(refreshed) && refreshed.length) {
            setRooms(refreshed);
            const found = refreshed.find(r => Number(r.room_id) === Number(rec.room_id));
            if (found) {
              // found after refresh, proceed
            } else {
              alert('Room data not found after refreshing rooms. Contact admin.');
              return;
            }
          } else {
            alert('Room data not found (rooms API empty).');
            return;
          }
        } catch (e) {
          console.error('Failed to refresh rooms:', e);
          alert('Room data not found and refresh failed.');
          return;
        }
      }
      if (isOutOfRange) return alert('You are out of range. Move closer to the room.');
      if (coords.accuracy > ACCURACY_THRESHOLD_METERS) return alert('Poor GPS accuracy.');

      // Altitude checks: many devices don't provide altitude or altitudeAccuracy.
      // The server requires altitude accuracy <= ALTITUDE_ACCURACY_THRESHOLD_METERS when QR is not used.
      // BLOCK: if altitudeAccuracy missing or poor, prompt user to scan QR (recommended) or abort to avoid server error.
      const poorAltitude = (!coords.altitudeAccuracy && coords.altitudeAccuracy !== 0) || (coords.altitudeAccuracy > ALTITUDE_ACCURACY_THRESHOLD_METERS);
      if (poorAltitude) {
        // Prompt: Scan QR now or cancel. Use SweetAlert if available, otherwise fallback to confirm().
        try {
          await ensureSwalLoaded();
          const res = await window.Swal.fire({
            title: 'Poor altitude accuracy',
            text: '(Not recommended to do check right now) Altitude accuracy too poor — move outdoors or scan the floor QR? for more vertical altitude validition.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Scan QR',
            cancelButtonText: 'Cancel'
          });
          if (res.isConfirmed) { openScannerWithPermission(); return; }
          // cancelled -> abort to avoid server error
          return;
        } catch (e) {
          // fallback
          const ok = window.confirm('Altitude accuracy too poor — move outdoors or scan the floor QR. Press OK to open scanner now.');
          if (ok) { openScannerWithPermission(); return; }
          return;
        }
      }
    }

    const payload = {
      schedule_id: rec.schedule_id,
      user_id: userId,
      date: rec.date,
      latitude: coords?.latitude || 0,
      longitude: coords?.longitude || 0,
      accuracy: coords?.accuracy || 100,
      altitude: coords?.altitude || null,
      altitudeAccuracy: coords?.altitudeAccuracy || null,
      qr_token: scannedQrToken || null,
    };

    try {
      const endpoint = currentAction ? `attendance/${currentAction}` : 'attendance/check-in';
      const data = await apiPost(endpoint, payload);

      // Optimistic Update
      if (data && data.attendance) {
        const att = data.attendance;
        setRecords(prev => {
          try {
            const idx = prev.findIndex(r => (r.attendance_id && att.attendance_id && r.attendance_id === att.attendance_id) || (r.schedule_id === att.schedule_id && r.date === att.date));
            if (idx >= 0) {
              const copy = prev.slice();
              copy[idx] = { ...copy[idx], ...att };
              return copy;
            }
            return [att, ...prev];
          } catch (e) { return prev; }
        });
        
        // Update detected floor if server returns it
        if (data.attendance.floor_id) {
          const serverFloor = floors.find(f => f.floor_id === Number(data.attendance.floor_id));
          if (serverFloor) setDetectedFloor(serverFloor);
        }
        // Clear any previous wrong-floor hint on success
        setWrongFloorInfo(null);
        // If server indicates DB floor was used (QR path), enable usingDbFloor
        if (data && data.used_db_floor) {
          setUsingDbFloor(true);
          // ensure detectedFloor is set
          if (data.attendance && data.attendance.floor_id) {
            const serverFloor = floors.find(f => f.floor_id === Number(data.attendance.floor_id));
            if (serverFloor) setDetectedFloor(serverFloor);
          }
          // show notice
          try { alert('Using floor altitude (QR)'); } catch(e){}
        }
      } else {
        await loadMyAttendance();
      }

      alert(`Success: ${data.message || 'OK'}`);
      setIsCameraVisible(false);
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      const body = err && err.body ? err.body : null;
      // If server returned structured wrong_floor details, surface them in UI
      if (body && body.error === 'wrong_floor') {
        setWrongFloorInfo(body);
        setErrorMessage('wrong_floor');
      } else {
        setWrongFloorInfo(null);
        setErrorMessage(body && body.error ? body.error : msg);
      }
      alert(`Error: ${body && body.error ? body.error : msg}`);
      if (scannedQrToken) setIsCameraVisible(false);
    }
  }, [findActiveSchedule, actionAllowed, coords, currentRoomObj, isOutOfRange, userId, currentAction, floors, loadMyAttendance]);

  // Keep the ref updated with the latest callback instance
  React.useEffect(() => {
    handleCheckNowRef.current = handleCheckNow;
  }, [handleCheckNow]);

  // Helper: dynamically load html5-qrcode script from multiple CDNs with fallback
  const ensureHtml5QrcodeLoaded = async () => {
    if (typeof window === 'undefined') return;
    if (window.Html5Qrcode || window.Html5QrcodeScanner) return;

    // If a loader tag already present, wait for it
    const existing = document.querySelector('script[data-html5qrcode]');
    if (existing) {
      await new Promise((resolve, reject) => {
        if (existing.getAttribute('data-loaded') === '1') return resolve();
        existing.addEventListener('load', () => resolve());
        existing.addEventListener('error', () => reject(new Error('Failed loading html5-qrcode script')));
      });
      if (window.Html5Qrcode || window.Html5QrcodeScanner) return;
      throw new Error('html5-qrcode loaded but globals not exposed');
    }

    const cdns = [
      'https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.7/minified/html5-qrcode.min.js',
      'https://unpkg.com/html5-qrcode@2.3.7/minified/html5-qrcode.min.js',
      'https://rawcdn.githack.com/mebjas/html5-qrcode/v2.3.7/minified/html5-qrcode.min.js'
    ];

    let lastErr = null;
    for (const src of cdns) {
      try {
        await new Promise((resolve, reject) => {
          const s = document.createElement('script');
          s.src = src;
          s.async = true;
          s.setAttribute('data-html5qrcode', '1');
          s.onload = () => {
            s.setAttribute('data-loaded', '1');
            setTimeout(() => {
              if (window.Html5Qrcode || window.Html5QrcodeScanner) resolve();
              else reject(new Error('html5-qrcode did not expose expected globals after load'));
            }, 50);
          };
          s.onerror = () => reject(new Error('Failed to load html5-qrcode from ' + src));
          document.head.appendChild(s);
        });
        return;
      } catch (err) {
        lastErr = err;
        try {
          const failed = document.querySelector('script[data-html5qrcode]');
          if (failed && failed.getAttribute('src') === src) failed.parentNode.removeChild(failed);
        } catch (e) {}
      }
    }

    throw lastErr || new Error('All CDNs failed for html5-qrcode');
  };

  // Helper: dynamically load SweetAlert2 (CDN) for nice toasts
  const ensureSwalLoaded = async () => {
    if (typeof window === 'undefined') return;
    if (window.Swal) return;

    // Load CSS if not present
    if (!document.querySelector('link[data-swal]')) {
      const l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = 'https://cdn.jsdelivr.net/npm/sweetalert2@11/dist/sweetalert2.min.css';
      l.setAttribute('data-swal', '1');
      document.head.appendChild(l);
    }

    if (document.querySelector('script[data-swal]')) {
      // wait for existing script to load
      const existing = document.querySelector('script[data-swal]');
      if ((existing.getAttribute('data-loaded')) === '1' && window.Swal) return;
      await new Promise((resolve, reject) => {
        existing.addEventListener('load', () => resolve());
        existing.addEventListener('error', () => reject(new Error('Failed to load SweetAlert')));
      });
      if (window.Swal) return;
    }

    // Insert script
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/sweetalert2@11/dist/sweetalert2.all.min.js';
      s.async = true;
      s.setAttribute('data-swal', '1');
      s.onload = () => { s.setAttribute('data-loaded', '1'); resolve(); };
      s.onerror = () => reject(new Error('Failed to load SweetAlert script'));
      document.head.appendChild(s);
    });
    if (!window.Swal) throw new Error('SweetAlert failed to initialize');
  };

  // QR Scanner Effect
  React.useEffect(() => {
    if (!isCameraVisible) return;

    let activeScanner = null;
    let usingScannerUI = false;
    let stopped = false;

    const startScanner = async () => {
      try {
        if (typeof window.Html5Qrcode === 'undefined' && typeof window.Html5QrcodeScanner === 'undefined') {
          try {
            await ensureHtml5QrcodeLoaded();
          } catch (err) {
            setErrorMessage('QR library failed to load: ' + (err && err.message ? err.message : String(err)));
            return;
          }
        }

        // Start a short debug preview using getUserMedia to verify camera access
        try {
          if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia && debugVideoRef.current) {
            const previewStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
            previewStreamRef.current = previewStream;
            try { debugVideoRef.current.srcObject = previewStream; } catch (e) {}
            try { const p = debugVideoRef.current.play(); if (p && p.then) p.catch(()=>{}); } catch(e){}
            setPreviewActive(true);
          }
        } catch (err) {
          setErrorMessage('Camera preview failed: ' + (err && err.message ? err.message : String(err)));
        }

        // Try to discover camera devices now (so cameraId is always defined)
        let cameraId = null;
        if (typeof window.Html5Qrcode !== 'undefined') {
          try {
            const cams = await window.Html5Qrcode.getCameras();
            if (Array.isArray(cams) && cams.length) {
              let preferred = cams.find(c => /back|rear|environment|rear camera/i.test(c.label));
              if (!preferred) preferred = cams[cams.length - 1];
              cameraId = preferred && (preferred.id || preferred.deviceId || preferred.cameraId) ? (preferred.id || preferred.deviceId || preferred.cameraId) : null;
            }
          } catch (e) {
            cameraId = null;
          }
        }

        // stop preview before starting the scanner to free the camera device
        const stopPreviewIfAny = () => {
          try {
            if (previewStreamRef.current) {
              previewStreamRef.current.getTracks().forEach(t => { try { t.stop(); } catch(e){} });
              previewStreamRef.current = null;
            }
            setPreviewActive(false);
            if (debugVideoRef.current) {
              try { debugVideoRef.current.srcObject = null; } catch (e) {}
            }
          } catch (e) {}
        };

        stopPreviewIfAny();
        if (scannerStartedRef.current) return;
        const html5QrCode = new window.Html5Qrcode('qr-scanner-container');
        activeScanner = html5QrCode;

        const config = { fps: 10, qrbox: { width: 250, height: 250 } };
        const cameraOrConstr = cameraId || { facingMode: 'environment' };

        try {
          await html5QrCode.start(
            cameraOrConstr,
            config,
            (decodedText) => {
              try { html5QrCode.stop(); } catch (e) {}
              try { html5QrCode.clear(); } catch (e) {}
              if (!stopped) {
                // Match the decoded token to a known floor
                const matchedFloor = floors.find(f => f.qr_token === decodedText);
                const active = findActiveSchedule ? findActiveSchedule() : null;
                // Resolve scheduled room's floor id (if available)
                let scheduledFloorId = null;
                try { if (active && active.room_id) { const rr = rooms.find(r => Number(r.room_id) === Number(active.room_id)); if (rr) scheduledFloorId = rr.floor_id; } } catch(e) {}

                if (!matchedFloor) {
                  // Unknown QR — do not accept. Show Swal toast.
                  (async () => {
                    try { await ensureSwalLoaded(); window.Swal.fire({ toast:true, position:'top', icon:'error', title: 'Scanned QR is not recognized', showConfirmButton:false, timer:3000 }); } catch (e) { alert('Scanned QR is not recognized'); }
                  })();
                } else if (scheduledFloorId != null && Number(matchedFloor.floor_id) !== Number(scheduledFloorId)) {
                  // Floor does not match active schedule — reject locally, show Swal
                  (async () => {
                    try { await ensureSwalLoaded(); window.Swal.fire({ toast:true, position:'top', icon:'error', title: 'Scanned floor does not match your active class', showConfirmButton:false, timer:3500 }); } catch (e) { alert('Scanned floor does not match your active class'); }
                  })();
                } else {
                  // Accept and store token + matched floor
                  (async () => {
                    try { await ensureSwalLoaded(); window.Swal.fire({ toast:true, position:'top', icon:'success', title: `Scanned: ${matchedFloor.floor_name || 'floor'}`, showConfirmButton:false, timer:2000 }); } catch (e) { /* ignore */ }
                  })();
                  setScannedQrToken(decodedText);
                  setScannedFloor(matchedFloor);
                }
                setIsCameraVisible(false);
              }
            },
            (_error) => {
              // ignore per-frame scan failures
            }
          );
          scannerStartedRef.current = true;
        } catch (startErr) {
          const em = (startErr && startErr.message) ? startErr.message : String(startErr);
          if (em.toLowerCase().includes('notreadable') || em.toLowerCase().includes('could not start video')) {
            setErrorMessage('Camera busy or inaccessible. Close other apps/tabs using the camera and try again.');
          } else if (em.toLowerCase().includes('notallowed') || em.toLowerCase().includes('permission')) {
            setErrorMessage('Camera permission denied. Allow camera access in browser/site settings.');
          } else {
            setErrorMessage('Failed to start QR scanner: ' + em);
          }
          try { html5QrCode.clear(); } catch (e) {}
          return;
        }
        return;
      } catch (err) {
        setErrorMessage('Failed to start QR scanner: ' + (err && err.message ? err.message : String(err)));
      }
    };

    startScanner();

    return () => {
      stopped = true;
      scannerStartedRef.current = false;
      try {
        if (previewStreamRef.current) {
          previewStreamRef.current.getTracks().forEach(t => { try{ t.stop(); }catch(e){} });
          previewStreamRef.current = null;
        }
        setPreviewActive(false);
        if (debugVideoRef.current) { try { debugVideoRef.current.srcObject = null; } catch (e) {} }
      } catch (e) {}
      (async () => {
        try {
          if (!activeScanner) return;
          if (!usingScannerUI && typeof activeScanner.stop === 'function') {
            try { await activeScanner.stop(); } catch (e) {}
            try { activeScanner.clear(); } catch (e) {}
          }
          if (usingScannerUI) {
            try { activeScanner.clear(); } catch (e) {}
          }
        } catch (e) {}
      })();
    };
  }, [isCameraVisible, floors, rooms, findActiveSchedule]);

  // Helper: show a brief notice when DB floor altitude was used
  const showUsingDbFloorNotice = (res) => {
    try {
      if (!res) return;
      // res may be the server response { attendance: {...}, used_db_floor: true }
      const att = res.attendance || res;
      const used = res.used_db_floor || (att && att.used_db_floor) || false;
      if (used || (att && att.floor_id && detectedFloor && Number(att.floor_id) === Number(detectedFloor.floor_id))) {
        const f = floors.find(ff => Number(ff.floor_id) === Number(att.floor_id));
        if (f) setDetectedFloor(f);
        setUsingDbFloor(Boolean(used || (att && att.floor_id && (!f || Number(att.floor_id) !== Number(f.floor_id)) ? true : used)));
        // transient alert — adapt to your UI toast mechanism
        alert('Using floor altitude (QR)');
      }
    } catch (e) { console.error(e); }
  };

  // Clear usingDbFloor when class ends or when server returns attendance floor equal to room floor
  React.useEffect(() => {
    try {
      const rec = findActiveSchedule();
      if (!rec) {
        setUsingDbFloor(false);
        return;
      }
      // Find latest record matching active schedule in records
      const current = records.find(r => (r.attendance_id && rec.attendance_id && r.attendance_id === rec.attendance_id) || (r.schedule_id === rec.schedule_id && r.date === rec.date));
      if (!current || !current.floor_id || !current.room_id) {
        setUsingDbFloor(false);
        return;
      }
      const room = rooms.find(r => Number(r.room_id) === Number(current.room_id));
      if (room && Number(current.floor_id) === Number(room.floor_id)) {
        // floor matches room's configured floor -> not using DB override
        setUsingDbFloor(false);
      } else {
        setUsingDbFloor(true);
        const f = floors.find(ff => Number(ff.floor_id) === Number(current.floor_id));
        if (f) setDetectedFloor(f);
      }
    } catch (e) { /* ignore */ }
  }, [records, rooms, floors, findActiveSchedule]);

  // Clear scanned QR token when there is no active schedule or when the active schedule ends.
  React.useEffect(() => {
    // Clear scanned QR token when there is no active schedule or when the active schedule ends.
    let timer = null;
    try {
      const now = new Date();
      const todayStr = formatDateYMD(now);
      const todays = records.filter(r => r.date === todayStr);
      const active = todays.find(r => {
        if (!r.start_time || !r.end_time) return false;
        const start = new Date(`${r.date}T${r.start_time}`);
        const end = new Date(`${r.date}T${r.end_time}`);
        return now >= start && now <= end;
      }) || null;
  
      if (!active) {
        // No active schedule — clear any stored scanned token
        setScannedQrToken(null);
        setScannedFloor(null);
        try { localStorage.removeItem(LOCAL_STORAGE_KEY); } catch(e){}
        return () => {};
      }
  
      // Compute class end timestamp
      const endTs = new Date(`${active.date}T${active.end_time}`).getTime();
      const msLeft = endTs - Date.now();
      if (msLeft <= 0) {
        // Already ended — clear immediately
        setScannedQrToken(null);
        setScannedFloor(null);
        try { localStorage.removeItem(LOCAL_STORAGE_KEY); } catch(e){}
        return () => {};
      }
  
      // Schedule clearing at class end (+1s small buffer)
      timer = setTimeout(() => {
        setScannedQrToken(null);
        setScannedFloor(null);
        try { localStorage.removeItem(LOCAL_STORAGE_KEY); } catch(e){}
      }, msLeft + 1000);
    } catch (e) {
      // If anything goes wrong, ensure we clear stale state to be safe
      setScannedQrToken(null);
      setScannedFloor(null);
      try { localStorage.removeItem(LOCAL_STORAGE_KEY); } catch(e){}
    }
    return () => { if (timer) clearTimeout(timer); };
  }, [records]);

  // --- Render ---
// ... (keep all your logic above)

  return (
    React.createElement('div', { style: { padding: 20 } },
      React.createElement('h2', { style: { marginTop: 0 } }, `My Attendance ${teacherName ? `– ${teacherName}` : ''}`),

      // Building & Scan Status Banner
      (currentBuilding || scheduledBuildingObj || scannedFloor || usingDbFloor || detectedFloor) && React.createElement('div', { style: { marginBottom: 12, padding: 10, borderRadius:6, border:'1px solid #e6e6e6', background:'#f8f9fa' } },
        currentBuilding && React.createElement('div', null, `Detected building: ${currentBuilding.building_name || 'Building'} (radius ${Math.round(Number(currentBuilding.radius || currentBuilding.building_radius || 0))}m)`),
        currentRoomObj && React.createElement('div', { style: { marginTop:6 } }, `Scheduled building: ${currentBuilding ? (scheduledBuildingObj? (scheduledBuildingObj.building_name || 'Building'): 'X') : 'X'}`),

        // Outside-building specific message (keep actionable warning)
        isOutsideBuilding && currentRoomObj && scheduledBuildingObj && coords && React.createElement('div', { style:{marginTop:8, color:'#842029', background:'#f8d7da', padding:8, borderRadius:4} },
          `You are outside ${scheduledBuildingObj.building_name || 'the scheduled building'} by ${Math.max(0, Math.round(getDistanceMeters(coords.latitude, coords.longitude, Number(scheduledBuildingObj.latitude), Number(scheduledBuildingObj.longitude)) - Number(scheduledBuildingObj.radius || scheduledBuildingObj.building_radius || 0)))}m — attendance denied`
        ),

        // QR / DB-floor / GPS detected floor messages
        scannedFloor && React.createElement('div', { style:{marginTop:8, color:'#0f5132', background:'#d1e7dd', padding:8, borderRadius:4} }, `QR validated — floor: ${scannedFloor.floor_name || 'floor'}`),
        !scannedFloor && usingDbFloor && detectedFloor && React.createElement('div', { style:{marginTop:8, color:'#0f5132', background:'#d1e7dd', padding:8, borderRadius:4} }, `Using DB floor altitude — floor: ${detectedFloor.floor_name || 'floor'}`),
        !scannedFloor && !usingDbFloor && detectedFloor && currentRoomObj && React.createElement('div', { style:{marginTop:8, color:'#0c5460', background:'#cff4fc', padding:8, borderRadius:4} }, `GPS-detected floor: ${detectedFloor.floor_name || '...'} — expected: ${ (floors.find(f=>String(f.floor_id)===String(currentRoomObj.floor_id)) || {}).floor_name || 'scheduled floor' }`)
      ),

      // Banner when no userId is available
      !userId && React.createElement('div', { style: { padding:10, backgroundColor:'#fff3fb', border:'1px solid #ffd6ea', color:'#6f0f3a', borderRadius:6, marginBottom:12, textAlign:'center' } },
        React.createElement('div', null, 'No user selected. Open this page with a teacher id in the URL (e.g. ?userId=6) or log in.'),
        React.createElement('div', { style: { marginTop:8 } }, React.createElement('button', { onClick: ()=> { const id = prompt('Enter test userId (e.g. 6)'); if (id) { setUserId(Number(id)); } }, style: { padding:'6px 10px', borderRadius:6, border:'1px solid #ddd', background:'#fff' } }, 'Use test user id'))
      ),

      // --- 1. FORCE GPS BUTTON (If stuck) ---
      !coords && !errorMessage && React.createElement('div', { style: { marginBottom: 15, textAlign: 'center' } },
        React.createElement('p', { style: { color: '#666' } }, "Waiting for location..."),
        React.createElement('button', { 
          onClick: startLocationTracking,
          style: { padding: '8px 12px', background: '#007bff', color: '#fff', border: 'none', borderRadius: 4 } 
        }, "Request GPS Permission")
      ),

      // --- 2. QR SCAN BUTTON ---
      React.createElement('div', { style: { display: 'flex', justifyContent: 'center', marginBottom: 10 } },
        React.createElement('button', { 
          onClick: openScannerWithPermission, 
          disabled: cameraPermission === 'denied', 
          title: cameraPermission === 'denied' ? 'Camera blocked' : 'Scan QR', 
          style: { padding: '8px 12px', borderRadius: 6, border: 'none', background: cameraPermission === 'denied' ? '#888' : '#198754', color: '#fff' } 
        }, 'Scan QR')
      ),

      // QR scan status banner
      React.createElement('div', { style: { textAlign: 'center', marginBottom: 10 } },
        !scannedQrToken ?
          React.createElement('div', { style: { color: '#666' } }, 'You did not scan a QR code yet') :
          React.createElement('div', { style: { color: '#155724', background: '#d4edda', display: 'inline-block', padding: '6px 10px', borderRadius: 6 } },
            React.createElement('div', null, React.createElement('strong', null, `You scanned: `), (scannedFloor && scannedFloor.floor_name) ? scannedFloor.floor_name : scannedQrToken),
            // Live status line: authoritative while inside scanned floor band's range
            scannedFloor ? (
              React.createElement('div', { style: { marginTop: 6, fontSize: 12, color: scannedFloorInRange ? '#0f5132' : '#842029' } },
                scannedFloorInRange ?
                  // In-range: show baseline + explicit valid range and live GPS altitude
                  `On scanned floor — baseline: ${scannedFloorRange ? Number(scannedFloorRange.base).toFixed(1) : 'N/A'}m (valid: ${scannedFloorRange ? `${Number(scannedFloorRange.min).toFixed(1)}m to ${Number(scannedFloorRange.max).toFixed(1)}m` : 'N/A'}). Your alt: ${coords && typeof coords.altitude === 'number' ? coords.altitude.toFixed(1) + 'm' : 'N/A'}` :
                  // Out-of-range: keep existing message but also include baseline/range and live GPS altitude
                  `Not on scanned floor anymore — allowed: ${scannedFloorRange ? `${Number(scannedFloorRange.min).toFixed(1)}m to ${Number(scannedFloorRange.max).toFixed(1)}m` : 'N/A'}. Baseline: ${scannedFloorRange ? Number(scannedFloorRange.base).toFixed(1) + 'm' : 'N/A'}. Your alt: ${coords && typeof coords.altitude === 'number' ? coords.altitude.toFixed(1) + 'm' : 'N/A'}`
              )
            ) : null,

            // If scanned floor breached, show suggested (alt-detected) floor if available
            (!scannedFloorInRange && altDetectedFloor) ? React.createElement('div', { style: { marginTop: 6, fontSize: 12, color: '#0c5460' } }, `Detected floor by GPS: ${altDetectedFloor.floor_name || 'Unknown'}`) : null,

            React.createElement('button', { onClick: () => { setScannedQrToken(null); setScannedFloor(null); try { localStorage.removeItem(LOCAL_STORAGE_KEY); } catch(e){} }, style: { marginLeft: 8, background: 'transparent', border: 'none', cursor: 'pointer', color: '#155724', fontWeight: 700 } }, '✕')
          )
      ),

      // --- 3. GPS INFO (DEBUG TEXT) ---
      // MODIFIED: Always show live GPS altitude (coords.altitude) as primary; include scanned baseline info separately
      coords && React.createElement('div', { style: { marginBottom: 8, textAlign: 'center', color: '#333', padding: 8, backgroundColor: '#e9ecef', borderRadius: 4 } },
        `GPS: ${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)} (Acc: ${coords.accuracy?.toFixed(1)}m) ${coords.altitude != null ? `(Alt: ${coords.altitude.toFixed(1)}m)` : '(Alt: N/A)'}${scannedFloor && scannedFloor.baseline_altitude != null ? ` — Scanned baseline: ${Number(scannedFloor.baseline_altitude).toFixed(1)}m` : (usingDbFloor && detectedFloor && detectedFloor.baseline_altitude != null ? ` — DB baseline: ${Number(detectedFloor.baseline_altitude).toFixed(1)}m` : '')}`,
        React.createElement('div', null, `Nearest Room: ${getNearestRoomLabel(coords).name} | Building: ${getNearestRoomLabel(coords).building} | Detected Floor: ${scannedFloor ? scannedFloor.floor_name : (usingDbFloor && detectedFloor ? detectedFloor.floor_name : getNearestRoomLabel(coords).floor)}`)
      ),

      // --- 4. ERROR MESSAGES ---
      errorMessage && React.createElement('div', { style: { padding: 10, backgroundColor: '#f8d7da', color: '#721c24', borderRadius: 5, margin: '10px 0', textAlign: 'center', border: '1px solid #f5c6cb' } }, errorMessage),
      
      // ... (Rest of your UI: renderWrongFloorMessage, nextSchedule, buttons, list)
      renderWrongFloorMessage(),

      // --- BUILDING BANNERS ---
      notInAnyBuilding && React.createElement('div', { style: { padding: 10, backgroundColor: '#fff3cd', color: '#856404', borderRadius: 5, margin: '10px 0', textAlign: 'center', border: '1px solid #ffeeba' } }, 'You are not inside any known building. Move closer to the building or check location permissions.'),

      isOutsideBuilding && currentRoomObj && React.createElement('div', { style: { padding: 10, backgroundColor: '#fff3cd', color: '#856404', borderRadius: 5, margin: '10px 0', textAlign: 'center', border: '1px solid #ffeeba' } },
        scheduledBuildingObj ? `You are in ${currentBuilding ? (currentBuilding.building_name || 'another building') : 'an unknown area'}. Active class is in ${scheduledBuildingObj.building_name}. Move to the correct building or scan the floor QR.` : 'You are not in the correct building for the active class. Move to the assigned building or scan the floor QR.'
      ),

      isOutOfRange && currentRoomObj && React.createElement('div', { style: { padding: 10, backgroundColor: '#fff3cd', color: '#856404', borderRadius: 5, margin: '10px 0', textAlign: 'center', border: '1px solid #ffeeba' } }, `You are out of range for the active class (${currentDist ? Math.round(currentDist) : 'N/A'}m away). Move closer to room '${currentRoomObj.room_name}'.`),

      // ... (Keep the rest of your render exactly as it was)
      nextSchedule && React.createElement('div', { style: { textAlign: 'center', marginBottom: 8 } }, 
        `Next class: ${nextSchedule.subject_code} at ${formatTime12(nextSchedule.start_time)} — ${nextSecondsLeft != null ? `Starts in ${nextCountdownStr()}` : ''}`
      ),

      React.createElement('div', { style: { margin: '16px 0', display: 'flex', justifyContent: 'center', gap: 8 } },
        React.createElement('button', { 
          onClick: () => handleCheckNow(scannedQrToken), 
          disabled: !actionAllowed || isOutOfRange, 
          style: Object.assign({ padding: '10px 14px', borderRadius: 6, border: 'none' }, (actionAllowed && !isOutOfRange) ? { background: '#198754', color: '#fff' } : { background: '#ccc', color: '#666' }) 
        }, currentAction ? `Do ${currentAction.replace('-', ' ')}` : 'No Active Schedule'),
        
        !actionAllowed && allowAt && React.createElement('div', { style: { alignSelf: 'center', color: '#666' } }, `Allowed at: ${new Date(allowAt).toLocaleTimeString()}`)
      ),

      React.createElement('div', { style: { display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 12 } }, 
        ['today', 'past', 'future'].map(mode => (
          React.createElement('button', { 
            key: mode, 
            onClick: () => setFilterMode(mode), 
            style: Object.assign({ padding: '6px 10px', borderRadius: 6, border: '1px solid #ddd', background: '#fff' }, filterMode === mode ? { background: '#198754', color: '#fff' } : {}) 
          }, mode.charAt(0).toUpperCase() + mode.slice(1))
        ))
      ),

      React.createElement('div', null, filteredRecords.length > 0 ? filteredRecords.map(item => (
        React.createElement('div', { key: item.attendance_id || `${item.schedule_id}-${item.date}`, style: { padding: 12, borderRadius: 6, background: '#fff', marginBottom: 8, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' } },
          React.createElement('div', { style: { fontWeight: 600, marginBottom: 6 } }, `${item.date} (${item.day_of_week || ''})`),
          React.createElement('div', null, React.createElement('span', { style: { fontWeight: 600 } }, 'Class:'), ` ${item.subject_code || ''} - ${item.section_name || ''}`),
          React.createElement('div', null, React.createElement('span', { style: { fontWeight: 600 } }, 'Time:'), ` ${formatTime12(item.start_time)} - ${formatTime12(item.end_time)}`),
          React.createElement('div', null, React.createElement('span', { style: { fontWeight: 600 } }, 'Room:'), ` ${item.room_name || ''}`),
          React.createElement('div', null, React.createElement('span', { style: { fontWeight: 600 } }, 'Check In:'), ` ${getFlagLabel(item.flag_in_id)}`),
          React.createElement('div', null, React.createElement('span', { style: { fontWeight: 600 } }, 'Mid Check:'), ` ${getFlagLabel(item.flag_check_id)}`),
          React.createElement('div', null, React.createElement('span', { style: { fontWeight: 600 } }, 'Check Out:'), ` ${getFlagLabel(item.flag_out_id)}`)
        )
      )) : React.createElement('div', { style: { textAlign: 'center', color: '#666' } }, 'No records for this filter.')),

      React.createElement(Modal, { show: isCameraVisible, title: 'Scan QR Code', onClose: () => setIsCameraVisible(false) },
        React.createElement('div', { style: { position: 'relative', minWidth: 300, minHeight: 300 } },
          // Debug preview (shows small video feed if getUserMedia succeeded) — helps diagnose permission/device issues
          previewActive && React.createElement('div', { style: { marginBottom: 8, textAlign: 'center' } },
            React.createElement('video', { ref: debugVideoRef, autoPlay: true, playsInline: true, muted: true, id: 'debug-camera-preview', style: { width: '100%', maxHeight: 220, objectFit: 'cover', borderRadius: 6 } })
          ),
          React.createElement('div', { id: 'qr-scanner-container', style: { width: '100%', height: '100%' } }),
          React.createElement('div', { style: { position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: 250, height: 250, border: '2px solid #00FF00', pointerEvents: 'none', borderRadius: 6 } })
        )
      )
    )
  );
}