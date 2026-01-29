import Table from "../../components/Table.jsx";
import Modal from "../../components/Modal.jsx";

// Converted Subject management
function SubjectIndex(){
  const [subjects,setSubjects]=React.useState([]);
  const [programs,setPrograms]=React.useState([]);
  const [showModal,setShowModal]=React.useState(false);
  const [form,setForm]=React.useState({ program_id:'', subject_code:'', subject_name:'' });
  const [loading,setLoading]=React.useState(false);
  const [error,setError]=React.useState('');
  React.useEffect(()=>{ (async ()=>{ try{ const [s,p]=await Promise.all([apiGet('subjects'), apiGet('programs')]); setSubjects(Array.isArray(s)?s:[]); setPrograms(Array.isArray(p)?p:[]); }catch(e){ console.error(e); setError('Failed to load subjects'); } })(); }, []);
  const openModal=()=>{ setForm({ program_id: programs[0]?.program_id||'', subject_code:'', subject_name:'' }); setShowModal(true); };
  const closeModal=()=> setShowModal(false);
  const handleChange=(e)=> setForm(p=>({...p, [e.target.name]: e.target.value}));
  const handleSubmit=async(e)=>{ e.preventDefault(); setLoading(true); try{ await apiPost('subjects', form); const s = await apiGet('subjects'); setSubjects(Array.isArray(s)?s:[]); closeModal(); }catch(err){ console.error(err); setError(err.body?.error || err.message || 'Network error'); } finally{ setLoading(false); } };
  const columns=[ { key:'subject_id', label:'ID' }, { key:'subject_code', label:'Code' }, { key:'subject_name', label:'Name' }, { key:'program_id', label:'Program ID' } ];
  return (
    <div style={{padding:20}}>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12}}><h2 style={{margin:0}}>Subject Management</h2><button onClick={openModal}>Add Subject</button></div>
      {error && <div style={{color:'red'}}>{error}</div>}
      <Table columns={columns} data={subjects} />
      <Modal show={showModal} title="Add Subject" onClose={closeModal}>
        <form onSubmit={handleSubmit}>
          <div style={{marginBottom:8}}>
            <label>Program</label>
            <select name="program_id" value={form.program_id} onChange={handleChange} required>
              <option value="">Select program</option>
              {programs.map(p=> <option key={p.program_id} value={p.program_id}>{p.program_name}</option>)}
            </select>
          </div>
          <div style={{marginBottom:8}}><label>Subject Code</label><input name="subject_code" value={form.subject_code} onChange={handleChange} required/></div>
          <div style={{marginBottom:8}}><label>Subject Name</label><input name="subject_name" value={form.subject_name} onChange={handleChange} required/></div>
          <div style={{display:'flex', justifyContent:'flex-end', gap:8}}><button type="button" onClick={closeModal}>Cancel</button><button type="submit">Save</button></div>
        </form>
      </Modal>
    </div>
  );
}

export default SubjectIndex;
