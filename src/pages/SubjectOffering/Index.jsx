import Table from "../../components/Table.jsx";
import Modal from "../../components/Modal.jsx";

function SubjectOfferingIndex(){
  const [items, setItems] = React.useState([]);
  const [subjects, setSubjects] = React.useState([]);
  const [sections, setSections] = React.useState([]);
  const [semesters, setSemesters] = React.useState([]);
  const [teachers, setTeachers] = React.useState([]);
  const [showModal, setShowModal] = React.useState(false);
  const [form, setForm] = React.useState({ semester_id: '', section_id: '', subject_id: '', user_id: '' });
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  React.useEffect(()=>{ (async ()=>{ try{ const [data, s, sec, sem, t] = await Promise.all([apiGet('subject-offerings'), apiGet('subjects'), apiGet('sections'), apiGet('semesters'), apiGet('teachers')]); setItems(Array.isArray(data)?data:[]); setSubjects(Array.isArray(s)?s:[]); setSections(Array.isArray(sec)?sec:[]); setSemesters(Array.isArray(sem)?sem:[]); setTeachers(Array.isArray(t)?t:[]); }catch(e){ console.error(e); setError('Failed to load subject offerings or related data'); } })(); }, []);

  const openModal = ()=>{ setForm({ semester_id: semesters[0]?.semester_id || '', section_id: sections[0]?.section_id || '', subject_id: subjects[0]?.subject_id || '', user_id: teachers[0]?.user_id || '' }); setShowModal(true); };
  const closeModal = ()=> setShowModal(false);
  const handleChange = (e)=> setForm(p=>({...p, [e.target.name]: e.target.value}));
  const handleSubmit = async (e)=>{ e.preventDefault(); setLoading(true); setError(''); try{ const payload = { semester_id: Number(form.semester_id), section_id: Number(form.section_id), subject_id: Number(form.subject_id), user_id: Number(form.user_id) }; await apiPost('subject-offerings', payload); const data = await apiGet('subject-offerings'); setItems(Array.isArray(data)?data:[]); closeModal(); }catch(err){ console.error(err); setError(err.body?.error || err.message || 'Network error'); } finally{ setLoading(false); } };

  const columns = [
    { key:'offering_id', label:'ID' },
    { key:'subject_code', label:'Subject Code' },
    { key:'subject_name', label:'Subject' },
    { key:'section_name', label:'Section' },
    { key:'term', label:'Semester' },
    { key:'user_id', label:'Teacher', render: (row) => { const u = teachers.find(x=>x.user_id == row.user_id); return u ? `${u.first_name} ${u.last_name}` : row.user_id; } }
  ];

  return (
    <div style={{padding:20}}>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12}}>
        <h2 style={{margin:0}}>Subject Offerings</h2>
        <button onClick={openModal}>Add Offering</button>
      </div>

      {error && <div style={{color:'red'}}>{error}</div>}

      <Table columns={columns} data={items} />

      <Modal show={showModal} title="Add Subject Offering" onClose={closeModal}>
        <form onSubmit={handleSubmit}>
          <div style={{marginBottom:8}}>
            <label>Semester</label>
            <select name="semester_id" value={form.semester_id||''} onChange={handleChange} required>
              <option value="">Select semester</option>
              {semesters.map(s => React.createElement('option', { key: s.semester_id, value: s.semester_id }, s.term))}
            </select>
          </div>

          <div style={{marginBottom:8}}>
            <label>Section</label>
            <select name="section_id" value={form.section_id||''} onChange={handleChange} required>
              <option value="">Select section</option>
              {sections.map(s => React.createElement('option', { key: s.section_id, value: s.section_id }, s.section_name))}
            </select>
          </div>

          <div style={{marginBottom:8}}>
            <label>Subject</label>
            <select name="subject_id" value={form.subject_id||''} onChange={handleChange} required>
              <option value="">Select subject</option>
              {subjects.map(s => React.createElement('option', { key: s.subject_id, value: s.subject_id }, `${s.subject_code} - ${s.subject_name}`))}
            </select>
          </div>

          <div style={{marginBottom:8}}>
            <label>Teacher</label>
            <select name="user_id" value={form.user_id||''} onChange={handleChange} required>
              <option value="">Select teacher</option>
              {teachers.map(t => React.createElement('option', { key: t.user_id, value: t.user_id }, `${t.first_name} ${t.last_name}`))}
            </select>
          </div>

          <div style={{display:'flex', justifyContent:'flex-end', gap:8}}><button type="button" onClick={closeModal}>Cancel</button><button type="submit" disabled={loading}>{loading? 'Saving...':'Save'}</button></div>
        </form>
      </Modal>
    </div>
  );
}

export default SubjectOfferingIndex;
