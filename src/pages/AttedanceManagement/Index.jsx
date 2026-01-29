import { AuthContext } from "../../context/AuthContext.jsx";

import Table from "../../components/Table.jsx";
import Modal from "../../components/Modal.jsx";

// Converted Attendance Management (admin) from Websitereactvite
function AttedanceManagement(){
  const { user } = React.useContext(AuthContext);
  const [records, setRecords] = React.useState([]);
  const [teachers, setTeachers] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [filterDate, setFilterDate] = React.useState('');
  const [filterStatus, setFilterStatus] = React.useState('');
  const [filterTeacher, setFilterTeacher] = React.useState('');
  const [showModal, setShowModal] = React.useState(false);
  const [selectedRecord, setSelectedRecord] = React.useState(null);

  React.useEffect(()=>{
    // redirect to login if not authenticated
    if (!user) { window.location.hash = '#/login'; return; }
    // teachers should not access this page
    if (user.role_id === 5) { window.location.hash = '#/dashboard'; return; }
    loadInitial();
  }, [user]);

  const loadInitial = async ()=>{
    setLoading(true); setError('');
    try{
      const [tres, rres] = await Promise.all([apiGet('teachers'), apiGet('attendance')]);
      setTeachers(Array.isArray(tres)?tres:[]);
      // DEBUG: log raw attendance response so we can inspect why table is empty
      console.log('loadInitial - raw attendance response:', rres);
      // add stable unique key to each record
      const recordsWithKey = Array.isArray(rres)? rres.map((rec, i)=> ({ ...rec, key: rec.attendance_id ? `${rec.attendance_id}-${i}` : `rec-${i}` })) : [];
      console.log('loadInitial - mapped records (with key):', recordsWithKey);
      setRecords(recordsWithKey);
    }catch(err){ console.error(err); setError(err.body?.error || err.message || 'Failed to load'); }
    finally{ setLoading(false); }
  };

  const buildUrl = (date, status, teacherId)=>{
    let url = 'attendance';
    const params = [];
    if (date) params.push(`date=${date}`);
    if (status) params.push(`status=${encodeURIComponent(status)}`);
    if (teacherId) params.push(`teacher_id=${teacherId}`);
    if (params.length) url += '?' + params.join('&');
    return url;
  };

  const fetchRecords = async (date, status, teacherId)=>{
    try{
      setLoading(true);
      const url = buildUrl(date,status,teacherId);
      const data = await apiGet(url);
      const rows = Array.isArray(data)? data.map((rec,i)=> ({ ...rec, key: rec.attendance_id ? `${rec.attendance_id}-${i}` : `rec-${i}` })) : [];
      setRecords(rows);
    }catch(err){ console.error(err); setError(err.body?.error || err.message || 'Failed to load'); }
    finally{ setLoading(false); }
  };

  const handleApplyFilter = ()=> fetchRecords(filterDate, filterStatus, filterTeacher);
  const handleClearFilter = ()=>{ setFilterDate(''); setFilterStatus(''); setFilterTeacher(''); fetchRecords(); };

  const openViewModal = (r)=>{ setSelectedRecord(r); setShowModal(true); };
  const closeViewModal = ()=>{ setSelectedRecord(null); setShowModal(false); };

  const columns = [
    { key: 'date', label: 'Date' },
    { key: 'teacher', label: 'Teacher', render: (r)=> `${r.last_name}, ${r.first_name}` },
    { key: 'subject', label: 'Subject / Section', render: (r)=> `${r.subject_code} - ${r.section_name}` },
    { key: 'room_name', label: 'Room' },
    { key: 'attendance_floor_name', label: 'Floor' },
    { key: 'class_time', label: 'Class Time', render: (r)=> `${(r.start_time||'').slice(0,5)} - ${(r.end_time||'').slice(0,5)}` },
    { key: 'altitude_in', label: 'Alt (In) (m)', render: (r)=> (r.altitude_in!=null? Number(r.altitude_in).toFixed(3): '') },
    { key: 'altitude_check', label: 'Alt (Check) (m)', render: (r)=> (r.altitude_check!=null? Number(r.altitude_check).toFixed(3): '') },
    { key: 'altitude_out', label: 'Alt (Out) (m)', render: (r)=> (r.altitude_out!=null? Number(r.altitude_out).toFixed(3): '') },
    { key: 'time_in', label: 'Time In', render: (r)=> renderTimeWithFlag(r.time_in, r.flag_in_id) },
    { key: 'time_check', label: 'Time Check', render: (r)=> renderTimeWithFlag(r.time_check, r.flag_check_id) },
    { key: 'time_out', label: 'Time Out', render: (r)=> renderTimeWithFlag(r.time_out, r.flag_out_id) },
    { key: 'action', label: 'Action', render: (r)=> React.createElement('button', { onClick: ()=>openViewModal(r) }, 'View') }
  ];

  const renderTimeWithFlag = (time, flag) => {
    const FLAGS = {1:'NA',2:'present',3:'absent',4:'excuse',5:'late'};
    const fid = flag == null ? null : Number(flag);
    if (!fid) return '';
    const word = FLAGS[fid] || '';
    if (fid === 2) return time ? `${new Date(`1970-01-01T${time}`).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})} ${word.charAt(0).toUpperCase()+word.slice(1)}` : (word.charAt(0).toUpperCase()+word.slice(1));
    return word.charAt(0).toUpperCase()+word.slice(1);
  };

  return (
    React.createElement('div', { style: { padding: 20 } },
      React.createElement('h2', null, 'Teacher Attendance Records'),
      error && React.createElement('div', { style:{ color:'red' } }, error),

      React.createElement('div', { style: { display:'flex', gap:12, marginBottom:12 } },
        React.createElement('div', null, React.createElement('label', null, 'Date'), React.createElement('input', { type:'date', value: filterDate, onChange: e=>setFilterDate(e.target.value) })),
        React.createElement('div', null, React.createElement('label', null, 'Status'), React.createElement('select', { value: filterStatus, onChange: e=>setFilterStatus(e.target.value) }, React.createElement('option',{value:''},'All'), React.createElement('option',{value:'NA'},'NA'), React.createElement('option',{value:'present'},'present'), React.createElement('option',{value:'absent'},'absent'), React.createElement('option',{value:'excuse'},'excuse'))),
        React.createElement('div', null, React.createElement('label', null, 'Teacher'), React.createElement('select', { value: filterTeacher, onChange: e=>setFilterTeacher(e.target.value) }, React.createElement('option',{value:''},'All'), teachers.map(t=> React.createElement('option',{key:t.user_id, value:t.user_id}, `${t.last_name}, ${t.first_name}`) ))),
        React.createElement('div', null, React.createElement('button', { onClick: handleApplyFilter }, 'Apply'), ' ', React.createElement('button', { onClick: handleClearFilter }, 'Clear'))
      ),

      React.createElement(Table, { columns: columns, data: records, pageSize: 10, loading: loading, emptyText: 'No attendance records found', rowKey: 'attendance_id' }),

      React.createElement(Modal, { show: showModal, title: 'Attendance Details', onClose: closeViewModal },
        selectedRecord ? React.createElement('div', null,
          React.createElement('table', { className: 'table table-bordered' }, React.createElement('tbody', null,
            React.createElement('tr', null, React.createElement('th', null, 'Teacher'), React.createElement('td', null, `${selectedRecord.last_name}, ${selectedRecord.first_name}`)),
            React.createElement('tr', null, React.createElement('th', null, 'Subject'), React.createElement('td', null, `${selectedRecord.subject_code} - ${selectedRecord.subject_name} (${selectedRecord.section_name})`)),
            React.createElement('tr', null, React.createElement('th', null, 'Date'), React.createElement('td', null, selectedRecord.date)),
            React.createElement('tr', null, React.createElement('th', null, 'Class Time'), React.createElement('td', null, `${(selectedRecord.start_time||'').slice(0,5)} - ${(selectedRecord.end_time||'').slice(0,5)}`)),
            React.createElement('tr', null, React.createElement('th', null, 'Time In'), React.createElement('td', null, renderTimeWithFlag(selectedRecord.time_in, selectedRecord.flag_in_id))),
            React.createElement('tr', null, React.createElement('th', null, 'Time Check'), React.createElement('td', null, renderTimeWithFlag(selectedRecord.time_check, selectedRecord.flag_check_id))),
            React.createElement('tr', null, React.createElement('th', null, 'Time Out'), React.createElement('td', null, renderTimeWithFlag(selectedRecord.time_out, selectedRecord.flag_out_id))),
            React.createElement('tr', null, React.createElement('th', null, 'Location Logs'), React.createElement('td', null, `In: ${selectedRecord.latitude_in}, ${selectedRecord.longitude_in} ${selectedRecord.altitude_in? ` (alt ${selectedRecord.altitude_in}m)` : ''}\nCheck: ${selectedRecord.latitude_check}, ${selectedRecord.longitude_check} ${selectedRecord.altitude_check? ` (alt ${selectedRecord.altitude_check}m)` : ''}\nOut: ${selectedRecord.latitude_out}, ${selectedRecord.longitude_out} ${selectedRecord.altitude_out? ` (alt ${selectedRecord.altitude_out}m)` : ''}`)),
            React.createElement('tr', null, React.createElement('th', null, 'Detected Floor'), React.createElement('td', null, selectedRecord.attendance_floor_name || 'N/A'))
          )),
          React.createElement('div', { style: { textAlign: 'right', marginTop: 8 } }, React.createElement('button', { onClick: closeViewModal }, 'Close'))
        ) : null
      )
    )
  );
}

// expose globally for App.jsx
window.AttedanceManagement = AttedanceManagement;

export default AttedanceManagement;
