import Table from "../../components/Table.jsx";
import Modal from "../../components/Modal.jsx";

function ProgramIndex(){
  const [programs, setPrograms] = React.useState([]);
  const [departments, setDepartments] = React.useState([]);
  const [heads, setHeads] = React.useState([]);
  const [showModal, setShowModal] = React.useState(false);
  const [form, setForm] = React.useState({ program_name: '', dept_id: '', head_id: '' });
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  React.useEffect(()=>{ (async ()=>{ try{ const [p,d,u] = await Promise.all([apiGet('programs'), apiGet('departments'), apiGet('users')]); setPrograms(Array.isArray(p)?p:[]); setDepartments(Array.isArray(d)?d:[]); // filter users for program_head role
      const programHeads = Array.isArray(u) ? u.filter(x => String(x.role_name).toLowerCase() === 'program_head' || String(x.role_name).toLowerCase() === 'program head' || x.role_name === 'program_head') : [];
      setHeads(programHeads);
    }catch(e){ console.error(e); setError('Failed to load programs'); } })(); }, []);

  const openModal = ()=>{ setForm({ program_name:'', dept_id: departments[0]?.dept_id || '', head_id: heads[0]?.user_id || '' }); setError(''); setShowModal(true); };
  const closeModal = ()=> setShowModal(false);
  const handleChange = (e) => setForm(p=>({...p, [e.target.name]: e.target.value}));

  const handleSubmit = async (e)=>{ e.preventDefault(); setLoading(true); setError(''); try{ const payload = { ...form, dept_id: Number(form.dept_id), head_id: Number(form.head_id) }; await apiPost('programs', payload); const p = await apiGet('programs'); setPrograms(Array.isArray(p)?p:[]); closeModal(); }catch(err){ console.error(err); setError(err.body?.error || err.message || 'Failed to save'); } finally{ setLoading(false); } };

  const columns = [ { key:'program_id', label:'ID' }, { key:'program_name', label:'Program' }, { key:'dept_name', label:'Department' } ];

  return (
    React.createElement('div', { style: { padding:20 } },
      React.createElement('div', { style: { display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 } },
        React.createElement('h2', { style:{margin:0} }, 'Program Management'),
        React.createElement('button', { onClick: openModal }, 'Add Program')
      ),
      error && React.createElement('div', { style:{ color:'red', marginBottom:8 } }, error),
      React.createElement(Table, { columns: columns, data: programs }),

      React.createElement(Modal, { show: showModal, title: 'Add Program', onClose: closeModal },
        React.createElement('form', { onSubmit: handleSubmit },
          React.createElement('div', { style:{ marginBottom:8 } },
            React.createElement('label', null, 'Department'),
            React.createElement('select', { name:'dept_id', value: form.dept_id, onChange: handleChange, required: true },
              React.createElement('option', { value: '' }, 'Select department'),
              departments.map(d => React.createElement('option', { key: d.dept_id, value: d.dept_id }, d.dept_name))
            )
          ),
          React.createElement('div', { style:{ marginBottom:8 } }, React.createElement('label', null, 'Program Name'), React.createElement('input', { name:'program_name', value: form.program_name, onChange: handleChange, required: true })),
          React.createElement('div', { style:{ marginBottom:8 } }, React.createElement('label', null, 'Program Head'),
            React.createElement('select', { name:'head_id', value: form.head_id, onChange: handleChange, required: true },
              React.createElement('option', { value:'' }, heads.length ? 'Select program head' : 'No program heads available'),
              heads.map(h => React.createElement('option', { key: h.user_id, value: h.user_id }, `${h.first_name} ${h.last_name}`))
            )
          ),
          React.createElement('div', { style:{ display:'flex', justifyContent:'flex-end', gap:8 } }, React.createElement('button', { type:'button', onClick: closeModal }, 'Cancel'), React.createElement('button', { type:'submit', disabled: loading }, loading? 'Saving...':'Save'))
        )
      )
    )
  );
}

export default ProgramIndex;
