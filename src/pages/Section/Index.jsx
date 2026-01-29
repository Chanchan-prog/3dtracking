import Table from "../../components/Table.jsx";
import Modal from "../../components/Modal.jsx";

function SectionIndex(){
  const [sections, setSections] = React.useState([]);
  const [programs, setPrograms] = React.useState([]);
  const [yearLevels, setYearLevels] = React.useState([]);
  const [showModal, setShowModal] = React.useState(false);
  const [form, setForm] = React.useState({ section_name: '', program_id: '', year_id: '' });
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  React.useEffect(()=>{ (async ()=>{ try{ const [s,p,y] = await Promise.all([apiGet('sections'), apiGet('programs'), apiGet('year-levels')]); setSections(Array.isArray(s)?s:[]); setPrograms(Array.isArray(p)?p:[]); setYearLevels(Array.isArray(y)?y:[]); }catch(e){ console.error(e); setError('Failed to load sections, programs, or year levels'); } })(); }, []);

  const openModal = ()=>{ setForm({ section_name: '', program_id: programs[0]?.program_id || '', year_id: yearLevels[0]?.year_id || '' }); setShowModal(true); };
  const closeModal = ()=> setShowModal(false);
  const handleChange = (e)=> setForm(p=>({...p, [e.target.name]: e.target.value}));
  const handleSubmit = async (e)=>{ e.preventDefault(); setLoading(true); setError(''); try{ const payload = { section_name: form.section_name, program_id: Number(form.program_id), year_id: Number(form.year_id) }; await apiPost('sections', payload); const data = await apiGet('sections'); setSections(Array.isArray(data)?data:[]); closeModal(); }catch(err){ console.error(err); setError(err.body?.error || err.message || 'Network error'); } finally{ setLoading(false); } };

  const columns = [ { key:'section_id', label:'ID' }, { key:'section_name', label:'Section Name' }, { key:'program_name', label:'Program' } ];

  return (
    <div style={{padding:20}}>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12}}>
        <h2 style={{margin:0}}>Sections</h2>
        <button onClick={openModal}>Add Section</button>
      </div>

      {error && <div style={{color:'red'}}>{error}</div>}

      <Table columns={columns} data={sections} />

      <Modal show={showModal} title="Add Section" onClose={closeModal}>
        <form onSubmit={handleSubmit}>
          <div style={{marginBottom:8}}>
            <label>Program</label>
            <select name="program_id" value={form.program_id||''} onChange={handleChange} required>
              <option value="">Select program</option>
              {programs.map(p=> React.createElement('option', { key: p.program_id, value: p.program_id }, p.program_name))}
            </select>
          </div>
          <div style={{marginBottom:8}}>
            <label>Year Level</label>
            <select name="year_id" value={form.year_id||''} onChange={handleChange} required>
              <option value="">Select year level</option>
              {yearLevels.map(y=> React.createElement('option', { key: y.year_id, value: y.year_id }, y.level))}
            </select>
          </div>
          <div style={{marginBottom:8}}><label>Section Name</label><input name="section_name" value={form.section_name||''} onChange={handleChange} required/></div>
          <div style={{display:'flex', justifyContent:'flex-end', gap:8}}><button type="button" onClick={closeModal}>Cancel</button><button type="submit">Save</button></div>
        </form>
      </Modal>
    </div>
  );
}

export default SectionIndex;
