import Table from "../../components/Table.jsx";
import Modal from "../../components/Modal.jsx";
import QrModal from "../../components/QrModal.jsx";

function RoomIndex(){
  const [rooms, setRooms] = React.useState([]);
  const [buildings, setBuildings] = React.useState([]);
  const [floors, setFloors] = React.useState([]);
  const [showModal, setShowModal] = React.useState(false);
  const [qrModalOpen, setQrModalOpen] = React.useState(false);
  const [qrModalToken, setQrModalToken] = React.useState(null);
  const [qrModalActive, setQrModalActive] = React.useState(false);
  const [form, setForm] = React.useState({ building_id:'', floor_id:'', room_name:'', latitude:'', longitude:'', radius:'10' });
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  const columns = [ { key:'room_id', label:'ID' }, { key:'room_name', label:'Room Name' }, { key:'building_name', label:'Building' }, { key:'floor_name', label:'Floor' }, { key:'latitude', label:'Latitude' }, { key:'longitude', label:'Longitude' }, { key:'radius', label:'Radius (m)' }, { key:'qr', label:'QR (Floor)', render: (r)=> (
    React.createElement('div', {style:{display:'flex', gap:6}},
      React.createElement('button', {onClick: ()=>{ const active = Boolean(Number(r.qr_token_active)); setQrModalToken(r.qr_token); setQrModalActive(active); setQrModalOpen(true); }}, 'View QR')
    )
  ) } ];

  React.useEffect(()=>{ (async ()=>{ try{ const [rb, rf, rr] = await Promise.all([apiGet('buildings'), apiGet('floors'), apiGet('rooms')]); setBuildings(Array.isArray(rb)?rb:[]); setFloors(Array.isArray(rf)?rf:[]); setRooms(Array.isArray(rr)?rr:[]); }catch(e){ console.error(e); setError('Failed to load rooms data'); } })(); }, []);

  const openModal = ()=>{ setForm(prev=>({ building_id: buildings[0]?.building_id || '', floor_id: floors.find(f=>f.building_id=== (buildings[0]?.building_id || 0))?.floor_id || '', room_name:'', latitude:'', longitude:'', radius:'10' })); setError(''); setShowModal(true); };
  const closeModal = ()=> setShowModal(false);
  const handleChange = (e)=> setForm(p=>({...p,[e.target.name]: e.target.value}));
  const handleBuildingChange = (e)=>{ const b = Number(e.target.value); const related = floors.filter(f=> Number(f.building_id) === b); setForm(p=>({...p, building_id:b, floor_id: related[0]?.floor_id || '' })); };

  const handleSubmit = async (e)=>{ e.preventDefault(); setLoading(true); setError(''); try{ const body = { ...form, latitude: form.latitude? Number(form.latitude): null, longitude: form.longitude? Number(form.longitude): null, radius: form.radius? Number(form.radius): null }; await apiPost('rooms', body); const rr = await apiGet('rooms'); setRooms(Array.isArray(rr)?rr:[]); closeModal(); }catch(err){ console.error(err); setError(err.body?.error || err.message || 'Network error'); } finally{ setLoading(false); } };

  const handleRegenerateQr = async (floorId)=>{ try{ const data = await apiPost(`floors/${floorId}/qr/regenerate`, {}); setQrModalToken(data.qr_token); setQrModalActive(Boolean(data.qr_token_active)); setQrModalOpen(true); const rr = await apiGet('rooms'); setRooms(Array.isArray(rr)?rr:[]); }catch(err){ console.error(err); setError(err.body?.error || err.message || 'Failed to regenerate QR'); } };
  const handleToggleQr = async (floorId, active)=>{ try{ const data = await apiPost(`floors/${floorId}/qr/toggle-active`, { active: active?1:0 }); const rr = await apiGet('rooms'); setRooms(Array.isArray(rr)?rr:[]); }catch(err){ console.error(err); setError(err.body?.error || err.message || 'Failed to toggle QR'); } };

  const floorsForBuilding = React.useMemo(()=> Array.isArray(floors)?floors.filter(f=> Number(f.building_id) === Number(form.building_id)) : [], [form.building_id, floors]);

  return (
    React.createElement('div', {style:{padding:20}}, 
      React.createElement('div', {style:{display:'flex', justifyContent:'space-between', marginBottom:12}}, React.createElement('h2', null, 'Room Management'), React.createElement('button',{onClick:openModal}, 'Add New Room')),
      error && React.createElement('div', {style:{color:'red'}}, error),
      React.createElement(Table, { columns: columns, data: rooms }),
      React.createElement(QrModal, { key: qrModalToken || 'qrmodal', show: qrModalOpen, onClose: ()=>setQrModalOpen(false), token: qrModalToken, active: qrModalActive }),
      React.createElement(Modal, { show: showModal, title: 'Add New Room', onClose: closeModal },
        React.createElement('form', { onSubmit: handleSubmit },
          React.createElement('div', {style:{marginBottom:8}}, React.createElement('label', null, 'Building'), React.createElement('select', { name:'building_id', value: form.building_id, onChange: handleBuildingChange }, React.createElement('option', { value: '' }, 'Select building'), buildings.map(b=> React.createElement('option',{key:b.building_id, value:b.building_id}, b.building_name)))),
          React.createElement('div', {style:{marginBottom:8}}, React.createElement('label', null, 'Floor'), React.createElement('select',{name:'floor_id', value: form.floor_id, onChange: handleChange}, React.createElement('option',{value:''}, 'Select floor'), floorsForBuilding.map(f=> React.createElement('option',{key:f.floor_id, value:f.floor_id}, f.floor_name)))),
          React.createElement('div', {style:{marginBottom:8}}, React.createElement('label', null, 'Room Name'), React.createElement('input', { name:'room_name', value: form.room_name, onChange: handleChange, required:true })),
          React.createElement('div', {style:{marginBottom:8}}, React.createElement('label', null, 'Latitude'), React.createElement('input', { name:'latitude', value: form.latitude, onChange: handleChange, type:'number', step:'0.000001' })),
          React.createElement('div', {style:{marginBottom:8}}, React.createElement('label', null, 'Longitude'), React.createElement('input', { name:'longitude', value: form.longitude, onChange: handleChange, type:'number', step:'0.000001' })),
          React.createElement('div', {style:{marginBottom:8}}, React.createElement('label', null, 'Radius (meters)'), React.createElement('input', { name:'radius', value: form.radius, onChange: handleChange, type:'number' })),
          error && React.createElement('div', {style:{color:'red'}}, error),
          React.createElement('div', {style:{display:'flex', justifyContent:'flex-end', gap:8}}, React.createElement('button',{type:'button', onClick: closeModal}, 'Cancel'), React.createElement('button', {type:'submit'}, loading? 'Saving...':'Save Room'))
        )
      )
    )
  );
}

export default RoomIndex;
