import Table from "../../components/Table.jsx";
import Modal from "../../components/Modal.jsx";
import QrModal from "../../components/QrModal.jsx";

function FloorIndex(){
  const [floors, setFloors] = React.useState([]);
  const [buildings, setBuildings] = React.useState([]);
  const [showModal, setShowModal] = React.useState(false);
  const [qrModalOpen, setQrModalOpen] = React.useState(false);
  const [qrModalToken, setQrModalToken] = React.useState(null);
  const [qrModalActive, setQrModalActive] = React.useState(false);
  const [form, setForm] = React.useState({ building_id:'', floor_name:'', baseline_altitude:'', floor_meter_vertical:'' });
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  React.useEffect(()=>{ (async ()=>{ try{ const [f,b] = await Promise.all([apiGet('floors'), apiGet('buildings')]); setFloors(Array.isArray(f)?f:[]); setBuildings(Array.isArray(b)?b:[]); }catch(e){ console.error(e); setError('Failed to load floors'); } })(); }, []);

  const openModal = ()=>{ setForm({ building_id: buildings[0]?.building_id || '', floor_name:'', baseline_altitude:'', floor_meter_vertical:'' }); setError(''); setShowModal(true); };
  const closeModal = ()=> setShowModal(false);
  const handleChange = (e)=> setForm(p=>({...p, [e.target.name]: e.target.value}));
  const handleSubmit = async (e)=>{ e.preventDefault(); setLoading(true); setError(''); try{ await apiPost('floors', { building_id: Number(form.building_id), floor_name: form.floor_name, baseline_altitude: Number(form.baseline_altitude || 0), floor_meter_vertical: Number(form.floor_meter_vertical || 0) }); const f = await apiGet('floors'); setFloors(Array.isArray(f)?f:[]); closeModal(); }catch(err){ console.error(err); setError(err.body?.error || err.message || 'Failed to save'); } finally{ setLoading(false); } };

  const handleRegenerateQr = async (floorId)=>{ try{ const data = await apiPost(`floors/${floorId}/qr/regenerate`, {}); setQrModalToken(data.qr_token); setQrModalActive(Boolean(data.qr_token_active)); setQrModalOpen(true); const f = await apiGet('floors'); setFloors(Array.isArray(f)?f:[]); }catch(err){ console.error(err); setError(err.body?.error || err.message || 'Failed to regenerate QR'); } };
  const handleToggleQr = async (floorId, active)=>{ try{ const data = await apiPost(`floors/${floorId}/qr/toggle-active`, { active: active?1:0 }); const f = await apiGet('floors'); setFloors(Array.isArray(f)?f:[]); }catch(err){ console.error(err); setError(err.body?.error || err.message || 'Failed to toggle QR'); } };

  const columns = [
    { key:'floor_id', label:'ID' },
    { key:'floor_name', label:'Floor' },
    { key:'building_name', label:'Building' },
    { key:'baseline_altitude', label:'Baseline Alt (m)' },
    { key:'qr', label:'QR', render: (r)=> (
      React.createElement('div', {style:{display:'flex', gap:6}},
        React.createElement('button', {onClick: ()=>{ const active = Boolean(Number(r.qr_token_active)); setQrModalToken(r.qr_token); setQrModalActive(active); setQrModalOpen(true); }}, 'View QR'),
        React.createElement('button', {onClick: ()=>handleRegenerateQr(r.floor_id)}, 'Regenerate'),
        React.createElement('button', {onClick: ()=>{ const current = Boolean(Number(r.qr_token_active)); handleToggleQr(r.floor_id, !current); }}, Number(r.qr_token_active) ? 'Active' : 'Inactive')
      )
    ) }
  ];

  return (
    React.createElement('div', { style:{ padding:20 } },
      React.createElement('div', { style:{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 } },
        React.createElement('h2', { style:{ margin:0 } }, 'Floor Management'),
        React.createElement('button', { onClick: openModal }, 'Add Floor')
      ),
      error && React.createElement('div', { style:{ color:'red', marginBottom:8 } }, error),
      React.createElement(Table, { columns: columns, data: floors }),
      React.createElement(QrModal, { key: qrModalToken || 'qrmodal', show: qrModalOpen, onClose: ()=>setQrModalOpen(false), token: qrModalToken, active: qrModalActive }),
      React.createElement(Modal, { show: showModal, title: 'Add Floor', onClose: closeModal },
        React.createElement('form', { onSubmit: handleSubmit },
          React.createElement('div', { style:{ marginBottom:8 } }, React.createElement('label', null, 'Building'), React.createElement('select', { name:'building_id', value: form.building_id, onChange: handleChange, required: true }, React.createElement('option', { value: '' }, 'Select building'), buildings.map(b => React.createElement('option', { key: b.building_id, value: b.building_id }, b.building_name)))),
          React.createElement('div', { style:{ marginBottom:8 } }, React.createElement('label', null, 'Floor Name'), React.createElement('input', { name:'floor_name', value: form.floor_name, onChange: handleChange, required: true })),
          React.createElement('div', { style:{ marginBottom:8 } }, React.createElement('label', null, 'Baseline Altitude (m)'), React.createElement('input', { name:'baseline_altitude', value: form.baseline_altitude, onChange: handleChange, type:'number', step:'0.1' })),
          React.createElement('div', { style:{ marginBottom:8 } }, React.createElement('label', null, 'Floor Vertical Meter (m)'), React.createElement('input', { name:'floor_meter_vertical', value: form.floor_meter_vertical, onChange: handleChange, type:'number', step:'0.01' })),
          React.createElement('div', { style:{ display:'flex', justifyContent:'flex-end', gap:8 } }, React.createElement('button', { type:'button', onClick: closeModal }, 'Cancel'), React.createElement('button', { type:'submit', disabled: loading }, loading? 'Saving...':'Save'))
        )
      )
    )
  );
}

export default FloorIndex;
