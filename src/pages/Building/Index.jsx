import Table from "../../components/Table.jsx";
import Modal from "../../components/Modal.jsx";

// Converted Building management page (uses apiGet/apiPost)
function BuildingIndex(){
  const [buildings, setBuildings] = React.useState([]);
  const [showModal, setShowModal] = React.useState(false);
  const [form, setForm] = React.useState({ building_name: '', location_description: '', latitude: '', longitude: '', radius: '' });
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  const columns = [ 
    { key:'building_id', label:'ID' }, 
    { key:'building_name', label:'Building Name' }, 
    { key:'location_description', label:'Location Description' },
    { key:'latitude', label:'Latitude' },
    { key:'longitude', label:'Longitude' },
    { key:'radius', label:'Radius (m)' }
  ];

  React.useEffect(()=>{ (async ()=>{ try{ const data = await apiGet('buildings'); setBuildings(Array.isArray(data)?data:[]); }catch(e){ console.error(e); setError('Failed to load buildings'); } })(); }, []);

  const openModal = ()=>{ setForm({ building_name:'', location_description:'', latitude: '', longitude: '', radius: '' }); setError(''); setShowModal(true); };
  const closeModal = ()=> setShowModal(false);
  const handleChange = (e) => setForm(p=>({...p,[e.target.name]: e.target.value}));

  const handleSubmit = async (e) => {
    e.preventDefault(); setLoading(true); setError('');
    try{
      // ensure numeric fields are sent as numbers
      const payload = {
        ...form,
        latitude: form.latitude !== '' ? Number(form.latitude) : null,
        longitude: form.longitude !== '' ? Number(form.longitude) : null,
        radius: form.radius !== '' ? Number(form.radius) : 0
      };
      const res = await apiPost('buildings', payload);
      await (async ()=>{ const data = await apiGet('buildings'); setBuildings(Array.isArray(data)?data:[]); })();
      closeModal();
    }catch(err){ console.error(err); setError(err.body?.error || err.message || 'Network error'); }
    finally{ setLoading(false); }
  };

  return (
    <div style={{padding:20}}>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12}}>
        <h2 style={{margin:0}}>Building Management</h2>
        <button onClick={openModal}>Add New Building</button>
      </div>
      {error && <div style={{color:'red', marginBottom:8}}>{error}</div>}
      <Table columns={columns} data={buildings} />

      <Modal show={showModal} title="Add New Building" onClose={closeModal}>
        <form onSubmit={handleSubmit}>
          <div style={{marginBottom:8}}>
            <label>Building Name</label>
            <input name="building_name" required value={form.building_name} onChange={handleChange} />
          </div>
          <div style={{marginBottom:8}}>
            <label>Location Description</label>
            <textarea name="location_description" required value={form.location_description} onChange={handleChange} />
          </div>
          <div style={{display:'flex', gap:8, marginBottom:8}}>
            <div style={{flex:1}}>
              <label>Latitude</label>
              <input name="latitude" type="number" step="any" placeholder="e.g. 8.469967" value={form.latitude} onChange={handleChange} />
            </div>
            <div style={{flex:1}}>
              <label>Longitude</label>
              <input name="longitude" type="number" step="any" placeholder="e.g. 124.634364" value={form.longitude} onChange={handleChange} />
            </div>
            <div style={{width:120}}>
              <label>Radius (m)</label>
              <input name="radius" type="number" step="1" min="0" placeholder="10" value={form.radius} onChange={handleChange} />
            </div>
          </div>
          {error && <div style={{color:'red'}}>{error}</div>}
          <div style={{display:'flex', justifyContent:'flex-end', gap:8}}>
            <button type="button" onClick={closeModal}>Cancel</button>
            <button type="submit" disabled={loading}>{loading? 'Saving...':'Save Building'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default BuildingIndex;
