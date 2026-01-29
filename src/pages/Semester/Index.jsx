import Table from "../../components/Table.jsx";
import Modal from "../../components/Modal.jsx";

function SemesterIndex(){
  const [items, setItems] = React.useState([]);
  const [sessions, setSessions] = React.useState([]);
  const [showModal, setShowModal] = React.useState(false);
  const [form, setForm] = React.useState({ session_id: '', term: '', start_date: '', end_date: '' });
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  React.useEffect(()=>{ (async ()=>{ try{ const [sem, ses] = await Promise.all([apiGet('semesters'), apiGet('sessions')]); setItems(Array.isArray(sem)?sem:[]); setSessions(Array.isArray(ses)?ses:[]); }catch(e){ console.error(e); setError('Failed to load semesters or sessions'); } })(); }, []);

  const openModal = ()=>{
    const today = new Date();
    const iso = (d)=> d.toISOString().slice(0,10);
    setForm({ session_id: sessions[0]?.session_id || '', term: '', start_date: iso(today), end_date: iso(new Date(today.getTime() + 90*24*60*60*1000)) });
    setShowModal(true);
  };
  const closeModal = ()=> setShowModal(false);
  const handleChange = (e)=> setForm(p=>({...p, [e.target.name]: e.target.value}));
  const handleSubmit = async (e)=>{ e.preventDefault(); setLoading(true); setError(''); try{ const payload = { session_id: Number(form.session_id), term: form.term, start_date: form.start_date, end_date: form.end_date }; await apiPost('semesters', payload); const data = await apiGet('semesters'); setItems(Array.isArray(data)?data:[]); closeModal(); }catch(err){ console.error(err); setError(err.body?.error || err.message || 'Network error'); } finally{ setLoading(false); } };

  const columns = [ { key:'semester_id', label:'ID' }, { key:'term', label:'Term' }, { key:'start_date', label:'Start' }, { key:'end_date', label:'End' } ];

  return (
    <div style={{padding:20}}>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12}}>
        <h2 style={{margin:0}}>Semesters</h2>
        <button onClick={openModal}>Add Semester</button>
      </div>

      {error && <div style={{color:'red'}}>{error}</div>}

      <Table columns={columns} data={items} />

      <Modal show={showModal} title="Add Semester" onClose={closeModal}>
        <form onSubmit={handleSubmit}>
          <div style={{marginBottom:8}}><label>Session</label>
            <select name="session_id" value={form.session_id||''} onChange={handleChange} required>
              <option value="">{sessions.length ? 'Select session' : 'No sessions available'}</option>
              {sessions.map(s => <option key={s.session_id} value={s.session_id}>{s.session_name}</option>)}
            </select>
          </div>
          <div style={{marginBottom:8}}><label>Term</label><input name="term" value={form.term||''} onChange={handleChange} required/></div>
          <div style={{marginBottom:8}}><label>Start Date</label><input type="date" name="start_date" value={form.start_date||''} onChange={handleChange} required/></div>
          <div style={{marginBottom:8}}><label>End Date</label><input type="date" name="end_date" value={form.end_date||''} onChange={handleChange} required/></div>
          <div style={{display:'flex', justifyContent:'flex-end', gap:8}}><button type="button" onClick={closeModal}>Cancel</button><button type="submit" disabled={loading}>{loading? 'Saving...':'Save'}</button></div>
        </form>
      </Modal>
    </div>
  );
}

export default SemesterIndex;
