import { AuthContext } from "../context/AuthContext.jsx";
// Use static path for bundled fallback avatar to avoid importing binary in JS (avoids Babel transform error)
const unknownImg = '/src/assets/unknown.jpg';

// Full header + sidebar navbar adapted from RoleCheck layout
export default function Navbar(){
  const { user, logout, login } = React.useContext(AuthContext);
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const [currentHash, setCurrentHash] = React.useState(window.location.hash.slice(1) || '/dashboard');
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [profileOpen, setProfileOpen] = React.useState(false);
  const [profileData, setProfileData] = React.useState(user || null);
  const [uploading, setUploading] = React.useState(false);
  const [selectedAvatarFile, setSelectedAvatarFile] = React.useState(null);
  const [selectedAvatarPreview, setSelectedAvatarPreview] = React.useState(null);

  // keep profileData in sync with auth user
  React.useEffect(()=>{
    setProfileData(user || null);
  }, [user]);

  // Fetch full profile when user is available or when profileData changes (so navbar avatar updates on login/reload)
  React.useEffect(()=>{
    let alive = true;
    (async ()=>{
      try{
        const uid = user && (user.user_id || user.id || user.userId) ? (user.user_id || user.id || user.userId) : null;
        if (!uid) return;
        // only fetch if we don't already have a profile avatar (avoids duplicate requests)
        if (profileData && profileData.avatar) return;
        const res = await fetch(`/server-php/api/user_profile.php?user_id=${uid}`);
        if (!alive) return;
        if (res.ok) {
          const j = await res.json();
          if (j && j.user) {
            setProfileData(j.user);
            // also update global auth user so other components reflect change
            try{ if (login) login(j.user); }catch(e){}
          }
        }
      }catch(e){ /* ignore */ }
    })();
    return ()=>{ alive = false; };
  }, [user, profileData]);

  React.useEffect(()=>{
    const onHash = ()=> setCurrentHash(window.location.hash.slice(1) || '/dashboard');
    window.addEventListener('hashchange', onHash);
    return ()=> window.removeEventListener('hashchange', onHash);
  }, []);

  // keep profileData in sync with localStorage changes from other tabs
  React.useEffect(()=>{
    const onStorage = (e)=>{
      if (e.key === 'user'){
        try{ const parsed = JSON.parse(e.newValue || 'null'); setProfileData(parsed); }catch(e){}
      }
    };
    window.addEventListener('storage', onStorage);
    return ()=> window.removeEventListener('storage', onStorage);
  }, []);

  // Load SweetAlert2 dynamically for nice logout confirm
  const ensureSwalLoaded = async () => {
    if (typeof window === 'undefined') return;
    if (window.Swal) return;
    if (!document.querySelector('link[data-swal]')) {
      const l = document.createElement('link'); l.rel='stylesheet'; l.href='https://cdn.jsdelivr.net/npm/sweetalert2@11/dist/sweetalert2.min.css'; l.setAttribute('data-swal','1'); document.head.appendChild(l);
    }
    if (document.querySelector('script[data-swal]')) {
      const existing = document.querySelector('script[data-swal]');
      await new Promise((resolve,reject)=>{ existing.addEventListener('load',()=>resolve()); existing.addEventListener('error',()=>reject()); });
      if (window.Swal) return;
    }
    await new Promise((resolve,reject)=>{ const s=document.createElement('script'); s.src='https://cdn.jsdelivr.net/npm/sweetalert2@11/dist/sweetalert2.all.min.js'; s.async=true; s.setAttribute('data-swal','1'); s.onload=()=>resolve(); s.onerror=()=>reject(); document.head.appendChild(s); });
  };

  // Open profile modal and fetch fresh profile if available
  const openProfile = async () => {
    setMenuOpen(false);
    try {
      const uid = user && (user.user_id || user.id || user.userId) ? (user.user_id || user.id || user.userId) : null;
      if (uid) {
        const res = await fetch(`/server-php/api/user_profile.php?user_id=${uid}`);
        if (res.ok) {
          const j = await res.json();
          // API returns { ok: true, user: { ... } }
          setProfileData((j && j.user) ? j.user : (j || user));
        }
      }
    } catch(e){}
    setProfileOpen(true);
  };

  // Compute a consistent avatar source (prefer fresh profileData, then Auth user, then bundled fallback)
  const avatarSrc = (profileData && profileData.avatar) || (user && (user.avatar || user.image)) || unknownImg;

  const handleUploadAvatar = async (file) => {
    if (!file) return;
    const uid = user && (user.user_id || user.id || user.userId) ? (user.user_id || user.id || user.userId) : null;
    if (!uid) return alert('No user id');
    const fd = new FormData();
    fd.append('user_id', String(uid));
    fd.append('avatar', file);
    setUploading(true);
    try {
      const res = await fetch('/server-php/api/user_profile.php', { method: 'POST', body: fd });
      const j = await res.json();
      if (res.ok && j && j.ok) {
        setProfileData(j.user || profileData);
        // update global user in localStorage if present
        try { const stored = localStorage.getItem('user'); if (stored) { const parsed = JSON.parse(stored); parsed.avatar = j.user.avatar; localStorage.setItem('user', JSON.stringify(parsed)); } } catch(e){}
        // also update global auth user so other components reflect change
        try{ if (login) login(j.user); }catch(e){}
        alert('Profile updated');
      } else {
        alert((j && (j.error || j.message)) || 'Upload failed');
      }
    } catch (e) {
      console.error(e); alert('Upload failed');
    } finally { setUploading(false); }
  };

  const navItems = [
    { label: "Dashboard", path: "/dashboard" },
    { label: "Users", path: "/users" },
    { label: "Attendance", path: "/attendance" },
    { label: "Attendance Management", path: "/attendancemgmt" },
    { label: "Class Schedules", path: "/class-schedules" },
    { label: "3D Building", path: "/3d-building" },
    { label: "Departments", path: "/departments" },
    { label: "Programs", path: "/programs" },
    { label: "Sections", path: "/sections" },
    { label: "Semesters", path: "/semesters" },
    { label: "Subjects", path: "/subjects" },
    { label: "Subject Offerings", path: "/subject-offerings" },
    { label: "Buildings", path: "/building" },
    { label: "Floors", path: "/floors" },
    { label: "Rooms", path: "/rooms" },
  ];

  // Restrict navigation for teacher role: only show Dashboard and Attendance
  const isTeacher = Boolean(user && (user.role_id === 5 || user.role === 'teacher' || user.role_name === 'Teacher' || user.role_name === 'teacher'));
  const visibleNavItems = isTeacher ? navItems.filter(i=> ['/dashboard','/attendance','/3d-building'].includes(i.path)) : navItems;

  const toggleSidebar = ()=> setSidebarOpen(s=>!s);
  const closeSidebar = ()=> setSidebarOpen(false);

  const navTo = (path)=>{ window.location.hash = '#'+path; setSidebarOpen(false); };

  const handleLogout = async () => {
    // show a toast then perform logout
    try {
      await ensureSwalLoaded();
      try {
        if (window.Swal) await window.Swal.fire({ toast:true, position:'top', icon:'success', title: 'Logged out', showConfirmButton:false, timer:1200 });
      } catch (e) { console.debug('Swal toast failed', e); }
    } catch (e) { try { alert('Logged out'); } catch (e) {} }

    try {
      if (typeof logout === 'function') {
        logout();
      } else {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.hash = '#/login';
      }
    } catch (e) {
      try { localStorage.removeItem('token'); localStorage.removeItem('user'); window.location.hash = '#/login'; } catch (e) {}
    }
  };

  const headerStyle = {
    height: '56px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 1rem', backgroundColor: '#2ead00', color: '#fff', position: 'sticky', top:0, zIndex:20
  };
  const burgerButtonStyle = { border:'none', background:'transparent', padding:0, display:'flex', flexDirection:'column', gap:'4px', cursor:'pointer' };
  const burgerLineStyle = { width:'20px', height:'2px', backgroundColor:'#fff', borderRadius:'2px' };
  const logoutButtonStyle = { border:'1px solid rgba(255,255,255,0.8)', background:'transparent', color:'#fff', padding:'4px 10px', borderRadius:4, fontSize:'0.85rem', cursor:'pointer' };

  const sidebarStyle = {
    position: 'fixed', top: '56px', left: 0, bottom:0, width: '220px', backgroundColor: '#ffffff', borderRight: '1px solid #ddd', paddingTop: '0.5rem', transition: 'transform 0.2s ease-out', zIndex:25, transform: sidebarOpen? 'translateX(0)' : 'translateX(-100%)'
  };
  const navLinkStyle = { display:'block', padding: '0.5rem 1.25rem', color:'#333', textDecoration:'none', fontSize:'0.95rem', cursor:'pointer' };
  const navLinkActiveStyle = { backgroundColor:'#e9f2ff', fontWeight:600 };
  const overlayStyle = { position:'fixed', inset:0, background:'rgba(0,0,0,0.25)', zIndex:24 };

  return (
    React.createElement(React.Fragment, null,
      React.createElement('header', { style: headerStyle },
        React.createElement('button', { type:'button', onClick: toggleSidebar, style: burgerButtonStyle, 'aria-label':'Toggle navigation' },
          React.createElement('span', { style: burgerLineStyle }),
          React.createElement('span', { style: burgerLineStyle }),
          React.createElement('span', { style: burgerLineStyle })
        ),
        React.createElement('div', { style: { display:'flex', alignItems:'center', gap:'0.5rem' } }, React.createElement('span', { style: { fontWeight:700 } }, '3D School — Teacher Attendance')),
        React.createElement('div', { style: { display:'flex', gap:12, alignItems:'center', position:'relative' } },
          user ? React.createElement(React.Fragment, null,
            // Avatar
            React.createElement('img', { src: avatarSrc, alt: 'avatar', style: { width:36, height:36, borderRadius:18, objectFit:'cover', border:'2px solid rgba(255,255,255,0.3)' } }),
            // Three-line menu button
React.createElement(
  'button',
  {
    onClick: () => setMenuOpen(s => !s),
    title: 'Menu',
    style: {
      border: 'none',
      background: 'rgb(46, 173, 0)',
      width: 40,
      height: 40,
      borderRadius: '50%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      cursor: 'pointer'
    }
  },
  React.createElement('span', {
    style: { width: 5, height: 5, background: '#fff', borderRadius: '50%' }
  }),
  React.createElement('span', {
    style: { width: 5, height: 5, background: '#fff', borderRadius: '50%' }
  }),
  React.createElement('span', {
    style: { width: 5, height: 5, background: '#fff', borderRadius: '50%' }
  })
),

            menuOpen && React.createElement('div', { style: { position:'absolute', right:10, top:56, background:'#fff', color:'#333', border:'1px solid #ddd', borderRadius:6, boxShadow:'0 6px 18px rgba(0,0,0,0.12)', zIndex:50, minWidth:140, padding:'6px 0', boxSizing:'border-box', textAlign:'left' } },
              React.createElement('div', { onClick: openProfile, style: { padding:'8px 14px', cursor:'pointer', color:'#333' } }, 'Profile'),
              React.createElement('div', { onClick: handleLogout, style: { padding:'8px 14px', cursor:'pointer', color:'#333' } }, 'Logout')
            )
          ) : React.createElement('a', { href:'#/login', style: { color:'#fff', textDecoration:'none' } }, 'Login')
        )
      ),

      // Profile Modal
      profileOpen && React.createElement('div', { style: { position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:60 } },
        React.createElement('div', { style: { width:420, background:'#fff', borderRadius:8, padding:16, boxShadow:'0 10px 30px rgba(0,0,0,0.2)' } },
          React.createElement('h3', null, 'My Profile'),
          React.createElement('div', { style: { display:'flex', gap:12, alignItems:'center' } },
            React.createElement('img', { src: selectedAvatarPreview || (profileData && profileData.avatar) || avatarSrc, style: { width:86, height:86, borderRadius:10, objectFit:'cover', border:'1px solid #ddd' } }),
            React.createElement('div', null,
              React.createElement('div', null, React.createElement('strong', null, profileData && (profileData.first_name || '') + ' ' + (profileData.last_name || ''))),
              React.createElement('div', null, profileData && profileData.email ? profileData.email : ''),
              React.createElement('div', { style: { marginTop:8 } },
                React.createElement('input', { type:'file', accept:'image/*', onChange: (e)=> {
                  const f = e.target.files && e.target.files[0];
                  if (f) {
                    setSelectedAvatarFile(f);
                    try { setSelectedAvatarPreview(URL.createObjectURL(f)); } catch(e) { setSelectedAvatarPreview(null); }
                  }
                } })
              )
            )
          ),
          React.createElement('div', { style: { display:'flex', justifyContent:'flex-end', gap:8, marginTop:12 } },
            React.createElement('button', { onClick: ()=> { setSelectedAvatarFile(null); setSelectedAvatarPreview(null); setProfileOpen(false); }, style: { padding:'8px 12px', borderRadius:6, border:'1px solid #ddd', background:'#fff' } }, 'Close'),
            React.createElement('button', { onClick: async ()=> {
              if (!selectedAvatarFile) return alert('No file selected');
              await handleUploadAvatar(selectedAvatarFile);
              // refresh displayed profile after upload
              try {
                const uid = user && (user.user_id || user.id || user.userId) ? (user.user_id || user.id || user.userId) : null;
                if (uid) {
                  const res = await fetch(`/server-php/api/user_profile.php?user_id=${uid}`);
                  if (res.ok) {
                    const j = await res.json(); setProfileData((j && j.user) ? j.user : profileData);
                  }
                }
              } catch (e) {}
              setSelectedAvatarFile(null);
              if (selectedAvatarPreview) { try{ URL.revokeObjectURL(selectedAvatarPreview); }catch(e){} }
              setSelectedAvatarPreview(null);
            }, disabled: uploading || !selectedAvatarFile, style: { padding:'8px 12px', borderRadius:6, border:'1px solid #198754', background: uploading || !selectedAvatarFile ? '#ccc' : '#198754', color: uploading || !selectedAvatarFile ? '#666' : '#fff' } }, 'Save')
          )
        )
      ),

      // Sidebar
      React.createElement('aside', { style: sidebarStyle },
        React.createElement('div', { style: { padding: '1rem 1.25rem', fontWeight:600 } }, 'Navigation'),
        React.createElement('nav', null,
          visibleNavItems.map(item => {
            // active when exactly the same path or when currentHash starts with item.path + '/' (subroutes)
            const active = currentHash === item.path || (item.path !== '/' && currentHash.startsWith(item.path + '/'));
            return React.createElement('div', { key: item.path, onClick: ()=> navTo(item.path), style: { ...navLinkStyle, ...(active ? navLinkActiveStyle : {}) } }, item.label);
          })
        )
      ),

      // Overlay for small screens
      sidebarOpen && React.createElement('div', { style: overlayStyle, onClick: closeSidebar })
    )
  );
}
