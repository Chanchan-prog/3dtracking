import Table from "../../components/Table.jsx";
import Modal from "../../components/Modal.jsx";

export default function UserIndex(){
  const [users, setUsers] = React.useState([]);
  const [roles, setRoles] = React.useState([]);
  const [showModal, setShowModal] = React.useState(false);
  const [form, setForm] = React.useState({ first_name:'', last_name:'', email:'', password:'', contact_no:'', role_id: '' });
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  // Kebab menu component
  function KebabMenu({ onEdit, onToggle, onArchive }){
    const [open, setOpen] = React.useState(false);
    const ref = React.useRef(null);
    React.useEffect(()=>{
      const onDocClick = (e)=>{ if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
      document.addEventListener('click', onDocClick);
      return ()=> document.removeEventListener('click', onDocClick);
    }, []);
    return (
      React.createElement('div', { ref, className: 'position-relative d-inline-block' },
        React.createElement('button', { type:'button', className:'btn btn-light btn-sm', onClick: ()=> setOpen(s=>!s), 'aria-haspopup':'true', 'aria-expanded': open, style:{ width:36, height:36, padding:0, borderRadius:6 } }, React.createElement('span', { style:{ fontSize:18, lineHeight:'36px' } }, '\u22EE')),
        open && React.createElement('div', { className:'card', style:{ position:'absolute', right:0, top:'110%', zIndex:250 } },
          React.createElement('div', { className:'list-group list-group-flush' },
            React.createElement('button', { type:'button', className:'list-group-item list-group-item-action', onClick: ()=>{ setOpen(false); onEdit(); } }, 'Edit'),
            React.createElement('button', { type:'button', className:'list-group-item list-group-item-action', onClick: ()=>{ setOpen(false); onToggle(); } }, 'Toggle'),
            React.createElement('button', { type:'button', className:'list-group-item list-group-item-action text-danger', onClick: ()=>{ setOpen(false); onArchive(); } }, 'Archive')
          )
        )
      )
    );
  }

  const columns = [
    { key: 'avatar', label: 'Image', render: (u)=>{
      // Prefer stored avatar/image (data URL or URL), otherwise use bundled unknown image
      const src = u.avatar || u.image || '/src/assets/unknown.jpg';
      return React.createElement('img', { src, alt: `${u.first_name || ''} ${u.last_name || ''}`, style: { width:40, height:40, borderRadius:'50%', objectFit:'cover', border: '1px solid #ddd' } });
    }},
    { key: 'name', label: 'Name', render: u=> `${u.first_name} ${u.last_name}` },
    { key: 'school_id', label: 'School ID', render: u=> u.school_id || 'N/A' },
    { key: 'email', label: 'Email' },
    { key: 'contact_no', label: 'Contact' },
    { key: 'role_name', label: 'Role' },
    { key: 'status', label: 'Status', render: u=> React.createElement('span', { className: `badge ${Number(u.status)===1? 'bg-success':'bg-secondary'}`}, Number(u.status)===1? 'Active':'Inactive') },
    { key: 'actions', label: 'Actions', render: u=> React.createElement(KebabMenu, { onEdit: ()=> handleEdit(u), onToggle: ()=> handleToggleActive(u), onArchive: ()=> handleArchive(u) }) }
  ];

  React.useEffect(()=>{
    const token = localStorage.getItem('token');
    if (!token) { window.location.hash = '#/login'; return; }
    fetchUsers(); fetchRoles();
  }, []);

  const fetchUsers = async ()=>{
    try{
      const data = await apiGet('users');
      setUsers(Array.isArray(data)? data: []);
    }catch(err){ console.error(err); setError('Failed to load users'); }
  };
  const fetchRoles = async ()=>{
    try{ const data = await apiGet('roles'); setRoles(Array.isArray(data)? data: []); }catch(e){ console.error(e); }
  };

  const openModal = ()=>{ setForm({ first_name:'', last_name:'', email:'', password:'', contact_no:'', role_id: roles[0]?.role_id || '' }); setError(''); setShowModal(true); };
  const closeModal = ()=> setShowModal(false);
  const handleChange = (e)=>{ const { name, value } = e.target; setForm(prev=> ({ ...prev, [name]: value })); };

  const handleSubmit = async (e)=>{
    e && e.preventDefault && e.preventDefault();
    setLoading(true); setError('');
    try{
      await apiPost('users', form);
      const u = await apiGet('users'); setUsers(Array.isArray(u)? u: []);
      closeModal();
    }catch(err){ console.error(err); setError(err.body?.error || err.message || 'Failed to create user'); }
    finally{ setLoading(false); }
  };

  const handleEdit = (user)=>{ console.log('Edit user (temp):', user); };
  const handleToggleActive = (user)=>{ setUsers(prev => prev.map(u => u.user_id === user.user_id ? { ...u, status: Number(u.status)===1?0:1 } : u)); };
  const handleArchive = (user)=>{ console.log('Archive (temp):', user); };

  return (
    React.createElement('div', { className: 'container py-3' },
      React.createElement('div', { className: 'd-flex justify-content-between align-items-center mb-3' },
        React.createElement('h2', { className: 'mb-0' }, 'User Management'),
        React.createElement('button', { className: 'btn btn-success', onClick: openModal }, 'Add New User')
      ),

      error && React.createElement('div', { className: 'alert alert-danger py-2' }, error),

      React.createElement(Table, { columns: columns, data: users, pageSize: 10, loading: loading, emptyText: 'No users found' }),

      React.createElement(Modal, { show: showModal, title: 'Add New User', size: 'md', onClose: closeModal },
        React.createElement('form', { onSubmit: handleSubmit },
          React.createElement('div', { className: 'mb-3' },
            React.createElement('label', { className: 'form-label' }, 'First Name'),
            React.createElement('input', { type: 'text', name: 'first_name', value: form.first_name, onChange: handleChange, className: 'form-control', required: true })
          ),
          React.createElement('div', { className: 'mb-3' },
            React.createElement('label', { className: 'form-label' }, 'Last Name'),
            React.createElement('input', { type: 'text', name: 'last_name', value: form.last_name, onChange: handleChange, className: 'form-control', required: true })
          ),
          React.createElement('div', { className: 'mb-3' },
            React.createElement('label', { className: 'form-label' }, 'Email'),
            React.createElement('input', { type: 'email', name: 'email', value: form.email, onChange: handleChange, className: 'form-control', required: true })
          ),
          React.createElement('div', { className: 'mb-3' },
            React.createElement('label', { className: 'form-label' }, 'Password'),
            React.createElement('input', { type: 'password', name: 'password', value: form.password, onChange: handleChange, className: 'form-control', required: true })
          ),
          React.createElement('div', { className: 'mb-3' },
            React.createElement('label', { className: 'form-label' }, 'Contact No'),
            React.createElement('input', { type: 'text', name: 'contact_no', value: form.contact_no, onChange: handleChange, className: 'form-control' })
          ),
          React.createElement('div', { className: 'mb-3' },
            React.createElement('label', { className: 'form-label' }, 'Role'),
            React.createElement('select', { name: 'role_id', value: form.role_id, onChange: handleChange, className: 'form-select', required: true },
              React.createElement('option', { value: '' }, 'Select role'),
              roles.map(r => React.createElement('option', { key: r.role_id, value: r.role_id }, r.role_name))
            )
          ),

          error && React.createElement('div', { className: 'alert alert-danger py-2' }, error),

          React.createElement('div', { className: 'd-flex justify-content-end gap-2 mt-3' },
            React.createElement('button', { type: 'button', className: 'btn btn-secondary', onClick: closeModal }, 'Cancel'),
            React.createElement('button', { type: 'submit', className: 'btn btn-success', disabled: loading }, loading? 'Saving...':'Save User')
          )
        )
      )
    )
  );
}
