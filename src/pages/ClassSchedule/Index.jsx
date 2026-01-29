import Table from "../../components/Table.jsx";
import Modal from "../../components/Modal.jsx";

function ClassScheduleIndex(){
  const DAY_OPTIONS = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
  const [schedules,setSchedules]=React.useState([]);
  const [rooms,setRooms]=React.useState([]);
  const [offerings,setOfferings]=React.useState([]);
  const [showModal,setShowModal]=React.useState(false);
  const [editingSchedule, setEditingSchedule] = React.useState(null);
  const [form,setForm]=React.useState({ room_id:'', offering_id:'', day_of_week:'monday', start_time:'', end_time:'' });
  const [loading,setLoading]=React.useState(false);
  const [error,setError]=React.useState('');
  const [importing, setImporting] = React.useState(false);
  const [importSummary, setImportSummary] = React.useState(null);
  const [importErrors, setImportErrors] = React.useState([]);
  const fileInputRef = React.useRef(null);

  React.useEffect(()=>{ (async ()=>{ try{ const [s,r,o]=await Promise.all([apiGet('class-schedules'), apiGet('rooms'), apiGet('offerings')]); setSchedules(Array.isArray(s)?s:[]); setRooms(Array.isArray(r)?r:[]); setOfferings(Array.isArray(o)?o:[]); }catch(e){ console.error(e); setError('Failed to load schedules'); } })(); }, []);

  const openModal=(schedule=null)=>{
    setError('');
    setEditingSchedule(schedule);
    if (schedule) {
      setForm({
        room_id: schedule.room_id || '',
        offering_id: schedule.offering_id || '',
        day_of_week: schedule.day_of_week || 'monday',
        start_time: schedule.start_time ? String(schedule.start_time).slice(0,5) : '',
        end_time: schedule.end_time ? String(schedule.end_time).slice(0,5) : ''
      });
    } else {
      setForm({ room_id: rooms[0]?.room_id || '', offering_id: offerings[0]?.offering_id || '', day_of_week:'monday', start_time:'', end_time:'' });
    }
    setShowModal(true);
  };
  const closeModal=()=>{ setShowModal(false); setEditingSchedule(null); };
  const handleChange=(e)=> setForm(p=>({...p, [e.target.name]: e.target.value}));
  const runWithFallback = async (primary, fallback) => {
    try {
      return await primary();
    } catch (err) {
      if (err?.status === 405 || err?.status === 500) {
        return await fallback();
      }
      throw err;
    }
  };
  const handleSubmit=async(e)=>{
    e.preventDefault();
    setLoading(true);
    setError('');
    const payload = {
      room_id: Number(form.room_id),
      offering_id: Number(form.offering_id),
      day_of_week: form.day_of_week,
      start_time: form.start_time,
      end_time: form.end_time
    };
    try{
      if (editingSchedule) {
        await runWithFallback(
          () => apiPut(`class-schedules/${editingSchedule.schedule_id}`, payload),
          () => apiPost(`class-schedules/${editingSchedule.schedule_id}/update`, payload)
        );
      } else {
        await apiPost('class-schedules', payload);
      }
      const s = await apiGet('class-schedules');
      setSchedules(Array.isArray(s)?s:[]);
      closeModal();
    }catch(err){
      console.error(err);
      setError(err.body?.error || err.message || 'Network error');
    } finally{ setLoading(false); }
  };

  const handleDelete = async (schedule) => {
    if (!schedule?.schedule_id) return;
    const ok = window.confirm('Delete this schedule?');
    if (!ok) return;
    setError('');
    try {
      await runWithFallback(
        () => apiDelete(`class-schedules/${schedule.schedule_id}`),
        () => apiPost(`class-schedules/${schedule.schedule_id}/delete`, {})
      );
      const s = await apiGet('class-schedules');
      setSchedules(Array.isArray(s)?s:[]);
    } catch (err) {
      console.error(err);
      setError(err.body?.error || err.message || 'Failed to delete schedule');
    }
  };

  const getFileArrayBuffer = (file) => {
    if (file.arrayBuffer) return file.arrayBuffer();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  };

  const parseSpreadsheet = async (file) => {
    if (!window.XLSX) throw new Error('Spreadsheet parser is not available. Please reload the page.');
    const buffer = await getFileArrayBuffer(file);
    const workbook = window.XLSX.read(buffer, { type: 'array' });
    const sheetName = workbook.SheetNames && workbook.SheetNames[0];
    if (!sheetName) return [];
    const worksheet = workbook.Sheets[sheetName];
    const rows = window.XLSX.utils.sheet_to_json(worksheet, { defval: '', raw: false });
    return Array.isArray(rows) ? rows : [];
  };

  const handleImportFile = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setImporting(true);
    setImportSummary(null);
    setImportErrors([]);
    setError('');
    try {
      const rows = await parseSpreadsheet(file);
      const cleaned = rows.filter(r => Object.values(r || {}).some(v => String(v ?? '').trim() !== ''));
      if (!cleaned.length) {
        setError('No data rows found in the spreadsheet.');
        return;
      }
      const result = await apiPost('class-schedules', { rows: cleaned });
      setImportSummary({
        inserted: Number(result?.inserted || 0),
        skipped: Number(result?.skipped || 0),
        total: cleaned.length,
      });
      const errs = Array.isArray(result?.errors) ? result.errors : [];
      setImportErrors(errs);
      if (errs.length) setError('Some rows failed to import. See details below.');
      const s = await apiGet('class-schedules');
      setSchedules(Array.isArray(s)?s:[]);
    } catch (err) {
      console.error(err);
      setError(err.body?.error || err.message || 'Failed to import spreadsheet');
    } finally {
      setImporting(false);
      if (e.target) e.target.value = '';
    }
  };

  const columns=[
    { key:'schedule_id', label:'ID' },
    { key:'day_of_week', label:'Day' },
    { key:'time', label:'Time', render:(s)=>`${s.start_time?.slice(0,5)||''} - ${s.end_time?.slice(0,5)||''}` },
    { key:'room_name', label:'Room' },
    { key:'subject', label:'Subject / Section', render:(s)=> `${s.subject_code} - ${s.section_name}` },
    {
      key:'actions',
      label:'Actions',
      actions: [
        { label:'Edit', onClick: (row)=> openModal(row) },
        { label:'Delete', variant:'danger', onClick: (row)=> handleDelete(row) }
      ]
    }
  ];

  return (
    <div style={{padding:20}}>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12, flexWrap:'wrap', gap:12}}>
        <h2 style={{margin:0}}>Class Schedule Management</h2>
        <div style={{display:'flex', gap:8, flexWrap:'wrap', justifyContent:'flex-end'}}>
          <button type="button" onClick={()=> fileInputRef.current && fileInputRef.current.click()} disabled={importing}>{importing ? 'Importing...' : 'Import Spreadsheet'}</button>
          <button onClick={()=> openModal()} disabled={importing}>Add New Schedule</button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleImportFile}
            style={{display:'none'}}
          />
        </div>
      </div>
      {error && <div style={{color:'red'}}>{error}</div>}
      {importSummary && (
        <div style={{marginBottom:8, color: importErrors.length ? '#856404' : '#198754'}}>
          Import summary: {importSummary.inserted} inserted, {importSummary.skipped} skipped, {importSummary.total} total rows.
        </div>
      )}
      {importErrors.length > 0 && (
        <div style={{marginBottom:12, border:'1px solid #f5c6cb', background:'#f8d7da', color:'#721c24', padding:8, borderRadius:6}}>
          <div style={{fontWeight:'bold', marginBottom:4}}>Import errors (first 20 rows)</div>
          <ul style={{margin:0, paddingLeft:18}}>
            {importErrors.slice(0,20).map((err, idx)=>(
              <li key={`${err.row || idx}-${idx}`}>Row {err.row || idx + 1}: {err.message || err.error || 'Invalid data'}</li>
            ))}
          </ul>
          {importErrors.length > 20 && <div style={{marginTop:6}}>And {importErrors.length - 20} more...</div>}
        </div>
      )}
      <div style={{fontSize:12, color:'#666', marginBottom:8}}>
        Template columns supported: Campus (room), Code, Subject Name, Section Name, Schedule (day/time). Other columns are ignored for schedule import.
      </div>
      <Table columns={columns} data={schedules} />
      <Modal show={showModal} title={editingSchedule ? "Edit Class Schedule" : "Add New Class Schedule"} onClose={closeModal}>
        <form onSubmit={handleSubmit}>
          <div style={{marginBottom:8}}>
            <label>Room</label>
            <select name="room_id" value={form.room_id} onChange={handleChange} required>
              <option value="">Select room</option>
              {rooms.map(r=> <option key={r.room_id} value={r.room_id}>{r.room_name}</option>)}
            </select>
          </div>
          <div style={{marginBottom:8}}>
            <label>Subject Offering</label>
            <select name="offering_id" value={form.offering_id} onChange={handleChange} required>
              <option value="">Select offering</option>
              {offerings.map(o=> <option key={o.offering_id} value={o.offering_id}>{o.subject_code} - {o.section_name}</option>)}
            </select>
          </div>
          <div style={{marginBottom:8}}>
            <label>Day of Week</label>
            <select name="day_of_week" value={form.day_of_week} onChange={handleChange}>
              {DAY_OPTIONS.map(d=> <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div style={{marginBottom:8}}><label>Start Time</label><input type="time" name="start_time" value={form.start_time} onChange={handleChange} required/></div>
          <div style={{marginBottom:8}}><label>End Time</label><input type="time" name="end_time" value={form.end_time} onChange={handleChange} required/></div>
          <div style={{display:'flex', justifyContent:'flex-end', gap:8}}><button type="button" onClick={closeModal}>Cancel</button><button type="submit" disabled={loading}>{loading ? 'Saving...' : (editingSchedule ? 'Update Schedule' : 'Save Schedule')}</button></div>
        </form>
      </Modal>
    </div>
  );
}

export default ClassScheduleIndex;
