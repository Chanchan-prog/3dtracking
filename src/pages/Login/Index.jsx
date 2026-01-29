import { AuthContext } from "../../context/AuthContext.jsx";

// Full login layout using Bootstrap classes to match the provided design exact layout
export default function LoginPage(){
  const { login } = React.useContext(AuthContext);
  const [loading, setLoading] = React.useState(false);

  const [form, setForm] = React.useState({ email:'', password:'' });
  const [captchaA, setCaptchaA] = React.useState(0);
  const [captchaB, setCaptchaB] = React.useState(0);
  const [captchaInput, setCaptchaInput] = React.useState('');
  const [captchaTouched, setCaptchaTouched] = React.useState(false);
  const [attemptedSubmit, setAttemptedSubmit] = React.useState(false);
  const captchaRef = React.useRef(null);

  const generateCaptcha = (focus=false)=>{
    const total = Math.floor(Math.random() * (110 - 5 + 1)) + 5;
    const a = Math.floor(Math.random() * (total - 1)) + 1;
    const b = total - a;
    setCaptchaA(a); setCaptchaB(b); setCaptchaInput(''); setCaptchaTouched(false); setAttemptedSubmit(false);
    if (focus) setTimeout(()=> captchaRef.current?.focus?.(), 60);
  };
  React.useEffect(()=>{
    generateCaptcha(false);
    // add class to body so App can hide header / adjust spacing
    try{ document.body.classList.add('login-fullpage'); }catch(e){}
    return ()=>{ try{ document.body.classList.remove('login-fullpage'); } catch(e){} };
  }, []);

  const handleChange = (e)=> setForm(prev=> ({ ...prev, [e.target.name]: e.target.value }));
  const handleCaptchaChange = (e)=> { setCaptchaInput(e.target.value.replace(/[^0-9]/g,'')); setCaptchaTouched(true); };

  const doLogin = async (e)=>{
    e && e.preventDefault && e.preventDefault();
    setAttemptedSubmit(true);
    const expected = captchaA + captchaB;
    if (String(expected) !== String((captchaInput||'').trim())){
      try{ await Swal.fire({ icon:'error', title:'Wrong Answer', text:'Please solve the math challenge correctly before signing in.', confirmButtonColor:'#d33' }); }catch(e){}
      generateCaptcha(); return;
    }
    try{
      setLoading(true);
      // Direct relative fetch to PHP router so tunnels/LiveServer setups work reliably
      const loginUrl = (window.API_BASE ? window.API_BASE.replace(/\/+$/,'') + '/login' : '../server-php/index.php/api/login');
      const res = await fetch(loginUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: form.email, password: form.password }) });
      const dataText = await res.text();
      let data = null;
      try { data = dataText ? JSON.parse(dataText) : null; } catch(e) { throw new Error('Invalid JSON response from login'); }
      if (!res.ok) { const err = new Error(data?.error || res.statusText || 'Login failed'); err.body = data; throw err; }
      if (!data || !data.token || !data.user) throw new Error('Invalid login response');
      login(data.user, data.token);
      try{ await Swal.fire({ icon:'success', title:'Welcome!', text:'Login successful.', showConfirmButton:false, timer:1200 }); }catch(e){}
      window.location.hash = '#/dashboard';
    }catch(err){
      try{ await Swal.fire({ icon:'error', title:'Login Failed', text: (err.body?.error || err.message || 'Login failed'), confirmButtonColor:'#d33' }); }catch(e){}
      generateCaptcha();
    }finally{ setLoading(false); }
  };

  const handleForgot = async (ev)=>{ ev && ev.preventDefault && ev.preventDefault(); const { value: email } = await Swal.fire({ title: 'Forgot Password', input: 'email', inputLabel: 'Enter your email address', inputPlaceholder: 'email@example.com', showCancelButton: true }); if (email) { await Swal.fire({ icon: 'info', title: 'Request received', text: `If ${email} exists in our system, you'll receive password reset instructions.` }); } };

  return (
    <div className="container-fluid">
      <section>
        <div className="row vh-100">
          <div className="col-lg-6 d-flex flex-column justify-content-center align-items-center bg-white">
            <div className="text-center">
              <img src="/Phinmalogo2.png" alt="college logo" className="img-fluid" style={{maxWidth:190}} />
              <h3 className="mt-3">Cagayan De Oro College</h3>
              <p className="px-4">Max Suniel St. Carmen, Cagayan de Oro City, Misamis Oriental, Philippines 9000</p>
            </div>
            <div className="mt-4"><img src="/logo-left.png" className="img-fluid" style={{maxWidth:220}} alt="npc" /></div>
          </div>

          <div className="col-lg-6 d-flex align-items-center">
            <div className="container">
              <div className="row justify-content-center">
                <div className="col-lg-10 col-md-10 col-12">
                  <div className="d-flex align-items-center mb-3">
                    <img src="/logo-right.png" style={{maxWidth:110}} alt="right" />
                    <div className="ms-3">
                      <h4 className="mb-0">PHINMA EDUCATION</h4>
                      <p className="mb-0 small">MAKING LIVES BETTER THROUGH EDUCATION</p>
                    </div>
                  </div>

                  <div className="card">
                    <div className="card-body">
                      <h4>Sign In</h4>
                      <div style={{height:3,width:120,background:'#2b6cb0',borderRadius:2,marginTop:8,marginBottom:16}} />

                      <form onSubmit={doLogin}>
                        <div className="mb-3 position-relative">
                          <label className="form-label"><sup style={{color:'#d9534f'}}>*</sup> Username</label>
                          <input name="email" value={form.email} onChange={handleChange} type="email" className="form-control" placeholder="Enter Username" required style={{border:'none',borderBottom:'2px solid #e6eef7',borderRadius:0,paddingRight:40}} />
                          <i className="bi bi-person" style={{position:'absolute',right:12,top:38,color:'#9ca3af'}} />
                        </div>

                        <div className="mb-3 position-relative">
                          <label className="form-label"><sup style={{color:'#d9534f'}}>*</sup> Password</label>
                          <input name="password" value={form.password} onChange={handleChange} type="password" className="form-control" placeholder="Enter Password" required style={{border:'none',borderBottom:'2px solid #e6eef7',borderRadius:0,paddingRight:40}} />
                          <a href="#" onClick={(ev)=>{ev.preventDefault();}} style={{position:'absolute',right:12,top:38,color:'#9ca3af'}}><i className="bi bi-eye-slash" /></a>
                        </div>

                        <div className="mb-3">
                          <div className="d-flex align-items-center">
                            <div style={{minWidth:72,height:44,borderRadius:6,border:'1px solid #e6eef7',background:'#f8fafc',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700,fontSize:16}}>{captchaA}</div>
                            <div style={{width:24,textAlign:'center',fontWeight:700,margin:'0 8px'}}>+</div>
                            <div style={{minWidth:56,height:44,borderRadius:6,border:'1px solid #e6eef7',display:'flex',alignItems:'center',justifyContent:'center'}}>{captchaB}</div>
                            <div style={{width:24,textAlign:'center',fontWeight:700,margin:'0 8px'}}>=</div>
                            <input ref={captchaRef} value={captchaInput} onChange={handleCaptchaChange} maxLength={3} className="form-control" style={{width:96,display:'inline-block',marginLeft:8}} required />

                            <button type="button" className="btn btn-outline-secondary ms-3" onClick={()=>generateCaptcha(true)} style={{width:44,height:44,borderRadius:6}} aria-label="reload captcha">
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M21 12a9 9 0 10-3.05 6.364L21 12z" stroke="#374151" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M21 3v6h-6" stroke="#374151" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                            </button>
                          </div>
                          <div className="mt-2">
                            <div className={(captchaTouched || attemptedSubmit) && captchaInput && String(captchaA + captchaB) !== String(captchaInput) ? '' : 'd-none'} style={{color:'#d9534f',fontWeight:600}}>Please fill correct value</div>
                            <div className={(captchaTouched || attemptedSubmit) && !captchaInput ? '' : 'd-none'} style={{color:'#d9534f',fontWeight:600}}>Required field cannot be left blank</div>
                          </div>
                        </div>

                        <div className="d-grid mb-3 col-sm-6 col-12 mx-auto">
                          <button className="btn btn-primary" type="submit" disabled={loading}>{loading ? 'Signing In...' : 'Sign In'}</button>
                        </div>

                        <div className="text-center"><a href="#" onClick={handleForgot}>Forgot Password</a></div>

                      </form>

                    </div>
                  </div>

                </div>
              </div>
            </div>
          </div>

        </div>
      </section>
    </div>
  );
}
