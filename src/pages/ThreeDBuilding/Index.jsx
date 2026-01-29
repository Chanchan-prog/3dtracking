function ThreeDBuildingIndex(){
  const resolveUrl = (path) => {
    try {
      return new URL(path, window.location.href).href;
    } catch (e) {
      return path;
    }
  };
  const resolveServerRoot = () => {
    const apiBase = (typeof window !== 'undefined' && window.API_BASE) ? window.API_BASE : '../server-php/index.php/api';
    let base = apiBase;
    try {
      base = new URL(apiBase, window.location.href).href;
    } catch (e) {
      base = resolveUrl(apiBase);
    }
    base = base.replace(/\/?index\.php\/api\/?$/, '');
    base = base.replace(/\/?api\/?$/, '');
    return base;
  };
  const serverRoot = resolveServerRoot();
  const defaultModel = new URL('./3dbuilding/MW.glb', serverRoot + '/').href;
  const fallbackModel = 'http://localhost/3D_SCHOOL_FOR_TEACHER_ATTENDANCE_TRACKING_P1/server-php/3dbuilding/MW.glb';
  const [modelSrc, setModelSrc] = React.useState(defaultModel);
  const [status, setStatus] = React.useState('ready');
  const [message, setMessage] = React.useState('');
  const [customUrl, setCustomUrl] = React.useState('');
  const viewerRef = React.useRef(null);
  const [yawOffset, setYawOffset] = React.useState(0);
  const [modelScale, setModelScale] = React.useState(1);
  const defaultZoomFactor = 0.18;
  const viewOrbits = React.useMemo(() => ({
    front: '0deg 82deg auto',
    back: '180deg 82deg auto',
    left: '90deg 82deg auto',
    right: '-90deg 82deg auto',
    top: '0deg 0deg auto'
  }), []);
  const applyView = React.useCallback((key, zoomFactor = defaultZoomFactor) => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const orbit = viewOrbits[key] || viewOrbits.front;
    viewer.cameraTarget = '0m 0m 0m';
    viewer.cameraOrbit = orbit;
    const zoomIn = () => {
      if (typeof viewer.getCameraOrbit !== 'function') {
        if (typeof viewer.jumpCameraToGoal === 'function') viewer.jumpCameraToGoal();
        return;
      }
      const current = viewer.getCameraOrbit();
      if (!current || !current.radius) return;
      const radius = Math.max(current.radius * zoomFactor, 0.1);
      viewer.cameraOrbit = `${current.theta}rad ${current.phi}rad ${radius}m`;
      if (typeof viewer.jumpCameraToGoal === 'function') {
        viewer.jumpCameraToGoal();
      }
    };
    requestAnimationFrame(zoomIn);
  }, [viewOrbits, defaultZoomFactor]);

  const rotateModel = (delta) => {
    setYawOffset(prev => {
      const next = (prev + delta) % 360;
      return next < 0 ? next + 360 : next;
    });
  };

  const clampScale = (value) => Math.min(100, Math.max(0.1, value));
  const adjustScale = (delta) => {
    setModelScale(prev => clampScale(Number((prev + delta).toFixed(2))));
  };

  React.useEffect(()=>{
    const viewer = viewerRef.current;
    if (!viewer) return;
    const handleLoad = () => {
      setStatus('ready');
      setMessage('');
      applyView('front');
    };
    const handleError = () => {
      setStatus('error');
      setMessage('Failed to load the model. Ensure MW.glb is reachable at /server-php/3dbuilding.');
    };
    viewer.addEventListener('load', handleLoad);
    viewer.addEventListener('error', handleError);
    return () => {
      viewer.removeEventListener('load', handleLoad);
      viewer.removeEventListener('error', handleError);
    };
  }, [modelSrc, applyView]);

  React.useEffect(()=>{
    let alive = true;
    const checkDefault = async () => {
      try {
        setStatus('loading');
        const res = await fetch(defaultModel, { method: 'HEAD', cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        if (!alive) return;
        setModelSrc(defaultModel);
        setStatus('ready');
        setMessage('');
      } catch (e) {
        if (!alive) return;
        setMessage(`Cannot access model at ${defaultModel}. ${e?.message || 'Fetch failed'}`);
        setModelSrc(fallbackModel);
        setStatus('fallback');
      }
    };
    checkDefault();
    return ()=>{ alive = false; };
  }, [defaultModel, fallbackModel]);

  const applyCustomModel = () => {
    const next = customUrl.trim();
    if (!next) return;
    setModelSrc(next);
    setStatus('custom');
    setMessage('');
  };

  const useDefaultModel = () => {
    setModelSrc(defaultModel);
    setStatus('ready');
    setMessage('');
  };

  const useFallbackModel = () => {
    setModelSrc(fallbackModel);
    setStatus('fallback');
    setMessage('');
  };

  return (
    <div style={{padding:20}}>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12, flexWrap:'wrap', gap:12}}>
        <div>
          <h2 style={{margin:0}}>3D Building Viewer</h2>
          <div style={{fontSize:12, color:'#666'}}>Loads MW.glb from the same server as the API.</div>
        </div>
        <div style={{display:'flex', gap:8, alignItems:'center', flexWrap:'wrap'}}>
          <input
            placeholder="Paste custom model URL"
            value={customUrl}
            onChange={(e)=> setCustomUrl(e.target.value)}
            style={{minWidth:240}}
          />
          <button type="button" onClick={applyCustomModel}>Load Model</button>
          <button type="button" onClick={useDefaultModel}>Use MW.glb</button>
          <button type="button" onClick={useFallbackModel}>Use Fallback</button>
          <button type="button" onClick={() => applyView('front')}>Front</button>
          <button type="button" onClick={() => applyView('back')}>Back</button>
          <button type="button" onClick={() => applyView('left')}>Left</button>
          <button type="button" onClick={() => applyView('right')}>Right</button>
          <button type="button" onClick={() => applyView('top')}>Top</button>
          <button type="button" onClick={() => rotateModel(-90)} title="Rotate model left">Rotate -90°</button>
          <button type="button" onClick={() => rotateModel(90)} title="Rotate model right">Rotate +90°</button>
          <button type="button" onClick={() => setYawOffset(0)}>Reset Rotation</button>
          <button type="button" onClick={() => adjustScale(-1)}>Scale -</button>
          <button type="button" onClick={() => adjustScale(1)}>Scale +</button>
          <div style={{fontSize:12, color:'#555'}}>Scale: {modelScale}x</div>
        </div>
      </div>

      {message && <div style={{color:'#b94a48', marginBottom:8}}>{message}</div>}

      <div style={{background:'#f8f9fb', border:'1px solid #e6e8ef', borderRadius:10, padding:12, marginBottom:12}}>
        <div style={{fontWeight:600, marginBottom:6}}>Notes</div>
        <ul style={{margin:0, paddingLeft:18, color:'#555', fontSize:13}}>
          <li>Model location: <a href={defaultModel} target="_blank" rel="noreferrer">{defaultModel}</a></li>
          <li>Current model: <code>{modelSrc || 'Loading...'}</code></li>
        </ul>
      </div>

      <div style={{border:'1px solid #e1e4ea', borderRadius:12, overflow:'hidden', background:'#0f1116'}}>
        {modelSrc ? (
          <model-viewer
            ref={viewerRef}
            src={modelSrc}
            alt="3D Building"
            camera-controls
            camera-orbit="0deg 75deg auto"
            camera-target="0m 0m 0m"
            field-of-view="30deg"
            orientation={`0deg ${yawOffset}deg 0deg`}
            scale={`${modelScale} ${modelScale} ${modelScale}`}
            auto-rotate
            shadow-intensity="1"
            exposure="1"
            style={{width:'100%', height:'80vh', background:'#111'}}
          />
        ) : (
          <div style={{color:'#fff', padding:20}}>Loading model...</div>
        )}
      </div>

      {status === 'fallback' && (
        <div style={{marginTop:10, fontSize:12, color:'#8a6d3b'}}>Using fallback model. Export your building to GLB and upload it to /server-php/3dbuilding for the correct view.</div>
      )}
    </div>
  );
}

export default ThreeDBuildingIndex;
