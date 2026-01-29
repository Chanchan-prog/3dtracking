import Table from "../../components/Table.jsx";
import Modal from "../../components/Modal.jsx";

function DepartmentIndex(){
  const [departments, setDepartments] = React.useState([]);
  const [deans, setDeans] = React.useState([]);
  const [showModal, setShowModal] = React.useState(false);
  const [form, setForm] = React.useState({ dept_name: '', dean_id: '' });
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  React.useEffect(()=>{ (async ()=>{ try{ const [d,ds] = await Promise.all([apiGet('departments'), apiGet('deans')]); setDepartments(Array.isArray(d)?d:[]); setDeans(Array.isArray(ds)?ds:[]); }catch(e){ console.error(e); setError('Failed to load departments or deans'); } })(); }, []);

  const openModal = ()=>{ setForm({ dept_name:'', dean_id: deans[0]?.user_id || '' }); setError(''); setShowModal(true); };
  const closeModal = ()=> setShowModal(false);
  const handleChange = (e)=> setForm(p=>({...p, [e.target.name]: e.target.value}));
  const handleSubmit = async (e)=>{ e.preventDefault(); setLoading(true); setError(''); try{ const payload = { ...form, dean_id: Number(form.dean_id) }; await apiPost('departments', payload); const d = await apiGet('departments'); setDepartments(Array.isArray(d)?d:[]); closeModal(); }catch(err){ console.error(err); setError(err.body?.error || err.message || 'Failed to save'); } finally{ setLoading(false); } };

  const columns = [ { key:'dept_id', label:'ID' }, { key:'dept_name', label:'Department' }, { key:'dean_id', label:'Dean ID' } ];
  return (
    React.createElement('div', { style:{ padding:20 } },
      React.createElement('div', { style:{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 } },
        React.createElement('h2', { style:{ margin:0 } }, 'Departments'),
        React.createElement('button', { onClick: openModal }, 'Add Department')
      ),
      error && React.createElement('div', { style:{ color:'red', marginBottom:8 } }, error),
      React.createElement(Table, { columns: columns, data: departments }),
      React.createElement(Modal, { show: showModal, title: 'Add Department', onClose: closeModal },
        React.createElement('form', { onSubmit: handleSubmit },
          React.createElement('div', { style:{ marginBottom:8 } }, React.createElement('label', null, 'Department Name'), React.createElement('input', { name:'dept_name', value: form.dept_name, onChange: handleChange, required: true })),
          React.createElement('div', { style:{ marginBottom:8 } }, React.createElement('label', null, 'Dean'),
            React.createElement('select', { name:'dean_id', value: form.dean_id, onChange: handleChange, required: true },
              React.createElement('option', { value:'', key:'__select__' }, deans.length ? 'Select dean...' : 'No deans available'),
              deans.map(dn => React.createElement('option', { key: dn.user_id, value: dn.user_id }, `${dn.first_name} ${dn.last_name}`))
            )
          ),
          React.createElement('div', { style:{ display:'flex', justifyContent:'flex-end', gap:8 } }, React.createElement('button', { type:'button', onClick: closeModal }, 'Cancel'), React.createElement('button', { type:'submit', disabled: loading }, loading? 'Saving...':'Save'))
        )
      )
    )
  );
}

export default DepartmentIndex;
