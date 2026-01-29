import React from 'react';

function DashboardPage(){
  const [data,setData] = React.useState(null);
  const rootRef = React.useRef(null);
  const refs = {
    donut: React.useRef(null),
    trend: React.useRef(null),
    heatmap: React.useRef(null),
    topRooms: React.useRef(null),
    floorDonut: React.useRef(null),
    rolePie: React.useRef(null),
    weekly: React.useRef(null),
  };
  const [d3Loaded, setD3Loaded] = React.useState(!!(typeof window !== 'undefined' && window.d3));
  const [wsConnected, setWsConnected] = React.useState(false);
  const [containerWidth, setContainerWidth] = React.useState(1200);
  // ensure containerWidth is always numeric
  const safeNumber = (v, fallback=800)=>{ const n = Number(v); return (isFinite(n) ? n : fallback); };
  const [isMobileClient, setIsMobileClient] = React.useState(false);

  // measure container width for responsive chart sizing
  React.useEffect(()=>{
    const upd = ()=>{ try{ const w = rootRef.current ? Math.max(320, rootRef.current.clientWidth) : window.innerWidth; setContainerWidth(w); }catch(e){} };
    upd();
    window.addEventListener('resize', upd);
    return ()=> window.removeEventListener('resize', upd);
  },[]);

  // detect mobile and set flag (used to disable heavy 3D viewer)
  React.useEffect(()=>{
    try{
      const mobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth <= 720;
      setIsMobileClient(mobile);
    }catch(e){ setIsMobileClient(false); }
  },[]);

  // Load full payload
  React.useEffect(()=>{
    let alive = true;
    (async ()=>{
      try{
        const full = await apiGet('dashboard/full');
        if (!alive) return;
        setData(full);
      }catch(e){ console.error('dashboard fetch failed', e); }
    })();
    return ()=>{ alive = false; };
  },[]);

  // Load D3: try local bundled copy first, then fallback to CDN if it doesn't define window.d3
  React.useEffect(()=>{
    if (typeof window === 'undefined') return;
    if (window.d3) { setD3Loaded(true); return; }
    let scrLocal = document.createElement('script');
    scrLocal.src = '/src/assets/d3.v7.min.js';
    scrLocal.async = true;
    const fallbackToCdn = () => {
      try { document.head.removeChild(scrLocal); } catch(e){}
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/d3@7';
      s.async = true;
      s.onload = ()=> { if (window.d3) setD3Loaded(true); else console.error('d3 loaded from CDN but window.d3 is missing'); };
      s.onerror = ()=> console.error('Failed to load d3 from CDN');
      document.head.appendChild(s);
    };
    scrLocal.onload = ()=>{
      // Some devs may place a placeholder file; ensure it actually exposed d3
      if (window.d3) {
        setD3Loaded(true);
      } else {
        // try CDN
        fallbackToCdn();
      }
    };
    scrLocal.onerror = ()=> { fallbackToCdn(); };
    document.head.appendChild(scrLocal);
    // safety: if after X ms d3 still not defined, try CDN
    const tm = setTimeout(()=>{ if (!window.d3) fallbackToCdn(); }, 1200);
    return ()=>{ try{ clearTimeout(tm); document.head.removeChild(scrLocal); }catch(e){} };
  },[]);

  // Real-time updates via WebSocket with polling fallback
  React.useEffect(()=>{
    let alive = true;
    let socket = null;
    let pollId = null;
    const tryPolling = ()=>{
      // basic polling every 15s
      const poll = async ()=>{
        try{
          const full = await apiGet('dashboard/full'); if (!alive) return; setData(full);
        }catch(e){ console.error('poll error', e); }
      };
      poll();
      pollId = setInterval(poll, 15000);
    };

    try{
      // Only attempt WS when running on localhost to avoid remote TLS/port issues
      const host = location.hostname || 'localhost';
      if (host !== 'localhost' && host !== '127.0.0.1' && host !== '::1') {
        console.info('Skipping WebSocket attempt (not localhost). Falling back to polling.');
        tryPolling();
      } else {
        // try WS at ws://localhost:8081
        socket = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + host + ':8081');
      }
      if (socket) {
        socket.addEventListener('open', ()=>{ if (!alive) return; setWsConnected(true); console.info('WS connected'); });
        socket.addEventListener('message', (ev)=>{ if (!alive) return; try{ const json = JSON.parse(ev.data); if (json && typeof json === 'object') setData(json); }catch(e){ console.error('invalid ws payload', e); } });
        socket.addEventListener('close', ()=>{ if (!alive) return; setWsConnected(false); console.info('WS closed, falling back to polling'); tryPolling(); });
        socket.addEventListener('error', (e)=>{ console.error('WS error', e); if (!alive) return; setWsConnected(false); try { socket.close(); } catch(e){} tryPolling(); });
      }
      // if ws fails to open within 2s, fallback to polling
      const tm = setTimeout(()=>{ if (!wsConnected && (!socket || socket.readyState !== WebSocket.OPEN)) { try{ socket && socket.close(); }catch(e){} tryPolling(); } }, 2000);
    }catch(e){ console.error('ws init failed', e); tryPolling(); }

    return ()=>{ alive=false; setWsConnected(false); try{ if (socket) socket.close(); }catch(e){} if (pollId) clearInterval(pollId); };
  }, []);

  // Animate KPI numbers when data.summary changes
  React.useEffect(()=>{
    if (!data || !data.summary) return;
    const root = rootRef.current;
    if (!root) return;
    const keys = ['total_departments','total_programs','total_sections','total_rooms','total_teachers'];
    keys.forEach(k=>{
      const el = root.querySelector(`[data-kpi="${k}"]`);
      if (!el) return;
      const start = parseInt(el.textContent) || 0;
      const end = data.summary[k] || 0;
      if (start === end) return;
      const duration = 800; const startTime = performance.now();
      const step = (t)=>{
        const p = Math.min(1, (t - startTime)/duration);
        const v = Math.round(start + (end - start) * easeOutCubic(p));
        el.textContent = v;
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
    function easeOutCubic(t){ return 1 - Math.pow(1 - t, 3); }
  }, [data && data.summary]);

  // Helper: common tooltip div
  const getTooltip = (container)=>{
    let tt = container.querySelector('.viz-tooltip');
    if (!tt) {
      tt = document.createElement('div');
      tt.className = 'viz-tooltip';
      Object.assign(tt.style, { position:'absolute', pointerEvents:'none', padding:'8px 10px', background:'rgba(0,0,0,0.75)', color:'#fff', borderRadius:'6px', fontSize:'12px', display:'none', zIndex:9999 });
      container.appendChild(tt);
    }
    return tt;
  };

  // Draw KPI cards as simple DOM (no D3)
  function KpiCards({summary}){
    const items = [
      {key:'total_departments', label:'Departments', color: '#6f42c1'},
      {key:'total_programs', label:'Programs', color: '#0d6efd'},
      {key:'total_sections', label:'Sections', color: '#198754'},
      {key:'total_rooms', label:'Rooms', color: '#fd7e14'},
      {key:'total_teachers', label:'Teachers', color: '#d63384'},
    ];

    return React.createElement('div', { style: { display:'flex', gap:12, flexWrap:'wrap', marginBottom:16, transition:'all 280ms ease' } },
      items.map(it => {
        const value = (summary && typeof summary[it.key] !== 'undefined') ? summary[it.key] : 0;
        return React.createElement('div', { key: it.key, style: { background:'#fff', padding:12, borderRadius:10, minWidth:160, display:'flex', gap:12, alignItems:'center', boxShadow:'0 8px 30px rgba(2,6,23,0.06)', transform:'translateY(0)', transition:'transform 360ms cubic-bezier(.2,.9,.3,1)' } },
          React.createElement('div', { style: { width:52, height:52, borderRadius:10, background:it.color, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:18, boxShadow:'0 6px 18px rgba(0,0,0,0.08)' } }, String(value)),
          React.createElement('div', null, React.createElement('div', { style:{ fontSize:12, color:'#666' } }, it.label), React.createElement('div', { style:{ fontSize:16, fontWeight:800 } }, React.createElement('span', { 'data-kpi': it.key }, String(value))))
        );
      })
    );
  }

  // DONUT: Attendance Today
  React.useEffect(()=>{
    if (!data || !d3Loaded) return;
    const d3 = window.d3;
    const el = refs.donut.current; if (!el) return;
    el.innerHTML = '';
    const attendance = data.summary.attendance_today || { present:0, absent:0, late:0 };
    const series = [ {key:'Present', value: attendance.present, color:'#28a745'}, {key:'Late', value: attendance.late, color:'#ffc107'}, {key:'Absent', value: attendance.absent, color:'#dc3545'} ];

    // responsive size based on container width
    const W = Math.min(420, Math.max(280, Math.floor(containerWidth * 0.28)) );
    const H = W; const R = Math.min(W,H)/2 - 8;
    const svg = d3.select(el).append('svg').attr('width', W).attr('height', H).style('overflow','visible');
    const g = svg.append('g').attr('transform', `translate(${W/2},${H/2})`);
    const pie = d3.pie().value(d=>d.value).sort(null);
    const arc = d3.arc().innerRadius(R*0.55).outerRadius(R);
    const arcHover = d3.arc().innerRadius(R*0.55).outerRadius(R+12);

    const paths = g.selectAll('path').data(pie(series)).enter().append('path')
      .attr('d', arc)
      .attr('fill', d=>d.data.color)
      .attr('stroke', '#fff').attr('stroke-width', 2)
      .each(function(d){ this._current = { startAngle:0, endAngle:0 }; })
      .on('mouseenter', function(event,d){ d3.select(this).transition().duration(220).attr('d', arcHover); const tt=getTooltip(el); tt.style.display='block'; tt.innerHTML = `<strong>${d.data.key}</strong>: ${d.data.value}`; const rect=el.getBoundingClientRect(); tt.style.left=(event.clientX-rect.left+10)+'px'; tt.style.top=(event.clientY-rect.top+10)+'px'; })
      .on('mousemove', function(event){ const tt=getTooltip(el); const rect=el.getBoundingClientRect(); tt.style.left=(event.clientX-rect.left+10)+'px'; tt.style.top=(event.clientY-rect.top+10)+'px'; })
      .on('mouseleave', function(event,d){ d3.select(this).transition().duration(220).attr('d', arc); const tt=getTooltip(el); tt.style.display='none'; });

    // Intro animate
    paths.transition().duration(900).attrTween('d', function(d){ const i = d3.interpolate(this._current, d); this._current = i(1); return t=> arc(i(t)); });

    // subtle morph animation loop (pulse)
    const timer = d3.timer((elapsed)=>{
      const s = 1 + 0.02 * Math.sin(elapsed/400);
      paths.attr('d', d3.arc().innerRadius((R*0.55)*s).outerRadius(R*s));
    });

    // center labels
    const total = d3.sum(series, d=>d.value);
    const center = g.append('g').attr('class','center');
    center.append('text').attr('text-anchor','middle').attr('dy','-0.2em').style('font-size','22px').style('font-weight',800).text(total);
    center.append('text').attr('text-anchor','middle').attr('dy','1.4em').style('font-size','12px').style('fill','#666').text('Today');

    // Legend
    const legend = svg.append('g').attr('transform', `translate(${10},10)`);
    series.forEach((s,i)=>{
      const lg = legend.append('g').attr('transform', `translate(0,${i*20})`);
      lg.append('rect').attr('width',12).attr('height',12).attr('fill', s.color).attr('rx',3);
      lg.append('text').attr('x',18).attr('y',10).style('font-size','12px').style('fill','#333').text(`${s.key} (${s.value})`);
    });

    return ()=>{ try{ timer.stop(); el.innerHTML=''; }catch(e){} };
  },[data,d3Loaded, containerWidth]);

  // TREND: stacked area (14 days)
  React.useEffect(()=>{
    if (!data || !d3Loaded) return; const d3 = window.d3;
    const el = refs.trend.current; if (!el) return; el.innerHTML='';
    const raw = data.viz && data.viz.trend_14d ? data.viz.trend_14d : [];
    if (!raw || raw.length === 0) return; // nothing to draw
    // normalize days array for last 14 days
    const days = [];
    for (let i=13;i>=0;i--){ const d = new Date(); d.setDate(d.getDate() - i); const key = d.toISOString().slice(0,10); days.push(key); }
    const map = {};
    raw.forEach(r=> map[r.d] = { present: (intVal(r.present)), absent: (intVal(r.absent)), late: (intVal(r.late)), total: (intVal(r.total)) });
    function intVal(v){ return v===null?0:parseInt(v); }
    const stacked = days.map(d=> ({ date:d, present: map[d]?.present||0, absent: map[d]?.absent||0, late: map[d]?.late||0 }));

    const margin = {top:18,right:20,bottom:36,left:48}; const W = safeNumber(Math.min(980, Math.max(480, Math.floor(containerWidth * 0.62))), 760); const H = 240;
    const svg = d3.select(el).append('svg').attr('width', W).attr('height', H).style('overflow','visible');
    const x = d3.scaleBand().domain(stacked.map(d=>d.date)).range([margin.left, W-margin.right]).padding(0.1);
    const maxY = d3.max(stacked, d=> d.present + d.absent + d.late) || 1;
    const y = d3.scaleLinear().domain([0, maxY]).nice().range([H - margin.bottom, margin.top]);
    // stack
    const series = d3.stack().keys(['present','late','absent'])(stacked);
    const area = d3.area().x((d,i)=> x(stacked[i].date) + x.bandwidth()/2).y0(d=> y(d[0])).y1(d=> y(d[1])).curve(d3.curveMonotoneX);
    const colors = { present:'#28a745', late:'#ffc107', absent:'#dc3545' };

    // enter
    const g = svg.append('g');
    const areas = g.selectAll('path').data(series);
    areas.enter().append('path').attr('d', (d)=> area(d)).attr('fill', (d,i)=> colors[d.key]).attr('opacity',0.95).attr('stroke', 'none').attr('opacity', 0).transition().duration(900).attr('opacity', 1);
    // update: morph smoothly
    areas.transition().duration(900).attrTween('d', function(next){ const prev = this._current || this.getAttribute('d'); const interp = d3.interpolatePath(prev, area(next)); this._current = area(next); return t=> interp(t); });
    areas.exit().transition().duration(600).attr('opacity',0).remove();

    // axes
    const xAxis = d3.axisBottom(x).tickValues(stacked.map((d,i)=> i%2===0? d.date : '')).tickFormat(d=> d);
    svg.append('g').attr('transform', `translate(0,${H-margin.bottom})`).call(xAxis).selectAll('text').attr('transform','rotate(-30)').style('text-anchor','end').style('font-size','11px');
    svg.append('g').attr('transform', `translate(${margin.left},0)`).call(d3.axisLeft(y));

    // hover vertical line and tooltip
    const tt = getTooltip(el);
    const overlay = svg.append('rect').attr('x', margin.left).attr('y', margin.top).attr('width', W-margin.left-margin.right).attr('height', H-margin.top-margin.bottom).style('fill','none').style('pointer-events','all');
    const vline = svg.append('line').attr('stroke','#666').attr('stroke-width',1).attr('y1', margin.top).attr('y2', H-margin.bottom).style('opacity',0);

    overlay.on('mousemove', function(event){
      const [mx] = d3.pointer(event);
      // try to find closest index by position
      const ratio = (mx - margin.left) / Math.max(1, (W - margin.left - margin.right));
      const closestIndex = Math.round(ratio * (stacked.length - 1));
      const idx = Math.max(0, Math.min(stacked.length - 1, closestIndex));
      const day = stacked[idx];
      // Prefer using scaleBand to compute x; fallback to even spacing if undefined
      const xVal = x(stacked[idx].date);
      let xPos;
      if (typeof xVal === 'number' && !isNaN(xVal)) {
        xPos = xVal + (x.bandwidth ? x.bandwidth()/2 : 0);
      } else {
        // fallback evenly across width
        const step = (W - margin.left - margin.right) / Math.max(1, stacked.length - 1);
        xPos = margin.left + idx * step;
      }
      vline.attr('x1', xPos).attr('x2', xPos).style('opacity', 1);
      tt.style.display = 'block';
      tt.innerHTML = `<strong>${day.date}</strong><br/>Present: ${day.present}<br/>Late: ${day.late}<br/>Absent: ${day.absent}`;
      const rect = el.getBoundingClientRect();
      tt.style.left = (event.clientX - rect.left + 10) + 'px';
      tt.style.top = (event.clientY - rect.top + 10) + 'px';
    });
    overlay.on('mouseleave', ()=>{ vline.style('opacity',0); tt.style.display='none'; });

    // legend
    const legend = svg.append('g').attr('transform', `translate(${W-180},12)`);
    ['present','late','absent'].forEach((k,i)=>{ legend.append('rect').attr('x',0).attr('y', i*20).attr('width',12).attr('height',12).attr('fill', colors[k]); legend.append('text').attr('x',18).attr('y', i*20+10).text(`${k.charAt(0).toUpperCase()+k.slice(1)}`); });

    return ()=>{ try{ el.innerHTML=''; }catch(e){} };
  },[data,d3Loaded, containerWidth]);

  // HEATMAP: hourly today (6x4 grid maybe)
  React.useEffect(()=>{
    if (!data || !d3Loaded) return; const d3 = window.d3; const el = refs.heatmap.current; if (!el) return; el.innerHTML='';
    const raw = (data.viz && data.viz.hourly_today) || [];
    const hours = Array.from({length:24}, (_,i)=>i);
    const map = {};
    raw.forEach(r=> map[parseInt(r.hr)] = parseInt(r.cnt));
    const values = hours.map(h => ({ hr:h, cnt: map[h] || 0 }));

    const cols = 8; const rows = Math.ceil(24/cols);
    const cell = 34; const width = cols * cell + 60; const height = rows * cell + 40;
    const svg = d3.select(el).append('svg').attr('width', width).attr('height', height);
    const maxV = d3.max(values, d=>d.cnt) || 1;
    const color = d3.scaleLinear().domain([0, maxV/2, maxV]).range(['#f8f9fa','#ffd54d','#d32f2f']);

    const g = svg.append('g').attr('transform', 'translate(40,20)');
    values.forEach((v,i)=>{
      const c = i%cols; const r = Math.floor(i/cols);
      const gx = g.append('g').attr('transform', `translate(${c*cell},${r*cell})`);
      gx.append('rect').attr('width', cell-6).attr('height', cell-6).attr('rx',6).attr('ry',6).attr('fill', color(v.cnt)).attr('stroke','#eee').attr('stroke-width',1)
        .attr('opacity',0).transition().delay(i*30).duration(400).attr('opacity',1);
      gx.append('text').attr('x', (cell-6)/2).attr('y', (cell-6)/2+4).attr('text-anchor','middle').style('font-size','11px').text(v.cnt);
      gx.append('text').attr('x', (cell-6)/2).attr('y', (cell-6)/2+18).attr('text-anchor','middle').style('font-size','9px').style('fill','#666').text(`${v.hr}:00`);
    });

    svg.append('text').attr('x',10).attr('y',12).style('font-weight',700).style('font-size','13px').text('Hourly checks (today)');

    return ()=>{ try{ el.innerHTML=''; }catch(e){} };
  },[data,d3Loaded]);

  // TOP ROOMS bar chart
  React.useEffect(()=>{
    if (!data || !d3Loaded) return; const d3 = window.d3; const el = refs.topRooms.current; if (!el) return; el.innerHTML='';
    const raw = (data.viz && data.viz.top_rooms_30d) || [];
    if (raw.length === 0){ el.innerHTML = '<div style="padding:12px;color:#666">No room data</div>'; return; }
    const W = Math.min(640, Math.max(360, Math.floor(containerWidth * 0.36))); const H = 300; const margin = {top:20,right:20,bottom:60,left:Math.min(160, Math.floor(W*0.28))};
    const svg = d3.select(el).append('svg').attr('width', W).attr('height', H);
    const x = d3.scaleLinear().domain([0, d3.max(raw, d=> parseInt(d.checks)) || 1]).range([margin.left, W - margin.right]);
    const y = d3.scaleBand().domain(raw.map(r=> r.room_name)).range([margin.top, H - margin.bottom]).padding(0.15);
    svg.append('g').selectAll('rect').data(raw).enter().append('rect').attr('x', margin.left).attr('y', d=> y(d.room_name)).attr('height', y.bandwidth()).attr('width',0).attr('fill','#2b8cbe')
      .transition().duration(800).attr('width', d=> x(parseInt(d.checks)) - margin.left);
    // entrance sequence: stagger labels
    svg.selectAll('g.ytext').data(raw).enter().append('text').attr('class','ytext').attr('x',12).attr('y', (d)=> y(d.room_name) + y.bandwidth()/2 +4).text(d=>d.room_name).style('font-size','11px').style('fill','#333').attr('opacity',0).transition().delay((d,i)=>i*60).duration(400).attr('opacity',1);
    svg.append('g').attr('transform', `translate(0,${H-margin.bottom})`).call(d3.axisBottom(x).ticks(4));
    svg.append('g').attr('transform', `translate(${margin.left},0)`).call(d3.axisLeft(y));
    svg.append('text').attr('x',10).attr('y',14).style('font-weight',700).style('font-size','13px').text('Top rooms (30d)');
    return ()=>{ try{ el.innerHTML=''; }catch(e){} };
  },[data,d3Loaded, containerWidth]);

  // FLOOR DONUT (distribution last 30d)
  React.useEffect(()=>{
    if (!data || !d3Loaded) return; const d3 = window.d3; const el = refs.floorDonut.current; if (!el) return; el.innerHTML='';
    const raw = (data.viz && data.viz.floor_distribution_30d) || [];
    if (raw.length === 0){ el.innerHTML = '<div style="padding:12px;color:#666">No floor data</div>'; return; }
    const series = raw.map(r=> ({ key: r.floor_name, value: parseInt(r.checks) }));
    const W = 320; const H = 260; const R = Math.min(W,H)/2 - 8;
    const svg = d3.select(el).append('svg').attr('width', W).attr('height', H);
    const g = svg.append('g').attr('transform', `translate(${W/2},${H/2})`);
    const pie = d3.pie().value(d=>d.value).sort(null);
    const arc = d3.arc().innerRadius(R*0.4).outerRadius(R);
    const color = d3.scaleOrdinal(d3.schemeTableau10).domain(series.map(s=>s.key));
    const paths = g.selectAll('path').data(pie(series)).enter().append('path').attr('d', arc).attr('fill', d=>color(d.data.key)).attr('stroke','#fff').attr('stroke-width',2).attr('opacity',0)
      .transition().duration(700).attr('opacity',1);
    // legend
    const legend = svg.append('g').attr('transform', `translate(8,12)`);
    series.forEach((s,i)=>{ const g2 = legend.append('g').attr('transform', `translate(0,${i*18})`); g2.append('rect').attr('width',12).attr('height',12).attr('fill', color(s.key)); g2.append('text').attr('x',18).attr('y',10).text(`${s.key} (${s.value})`).style('font-size','12px'); });
    return ()=>{ try{ el.innerHTML=''; }catch(e){} };
  },[data,d3Loaded]);

  // ROLE PIE
  React.useEffect(()=>{
    if (!data || !d3Loaded) return; const d3 = window.d3; const el = refs.rolePie.current; if (!el) return; el.innerHTML='';
    const raw = (data.viz && data.viz.attendance_by_role_30d) || [];
    if (raw.length === 0){ el.innerHTML = '<div style="padding:12px;color:#666">No role data</div>'; return; }
    const series = raw.map(r=> ({ key: r.role_name, value: parseInt(r.checks) }));
    const W = 280; const H = 220; const R = Math.min(W,H)/2 - 6;
    const svg = d3.select(el).append('svg').attr('width', W).attr('height', H);
    const g = svg.append('g').attr('transform', `translate(${W/2},${H/2})`);
    const pie = d3.pie().value(d=>d.value).sort(null);
    const arc = d3.arc().innerRadius(0).outerRadius(R);
    const color = d3.scaleOrdinal(d3.schemeCategory10).domain(series.map(s=>s.key));
    g.selectAll('path').data(pie(series)).enter().append('path').attr('d', arc).attr('fill', d=> color(d.data.key)).attr('stroke','#fff').attr('stroke-width',1).attr('opacity',0).transition().duration(800).attr('opacity',1);
    const legend = svg.append('g').attr('transform', `translate(${W-110},8)`);
    series.forEach((s,i)=>{ const g2 = legend.append('g').attr('transform', `translate(0,${i*16})`); g2.append('rect').attr('width',10).attr('height',10).attr('fill', color(s.key)); g2.append('text').attr('x',14).attr('y',9).text(`${s.key} (${s.value})`).style('font-size','11px'); });
    return ()=>{ try{ el.innerHTML=''; }catch(e){} };
  },[data,d3Loaded]);

  // WEEKLY sparkline
  React.useEffect(()=>{
    if (!data || !d3Loaded) return; const d3 = window.d3; const el = refs.weekly.current; if (!el) return; el.innerHTML='';
    const raw = (data.viz && data.viz.weekly_7d) || [];
    if (raw.length === 0){ el.innerHTML = '<div style="padding:12px;color:#666">No weekly data</div>'; return; }
    const series = raw.map(r=> ({ d: r.d, v: parseInt(r.total) }));
    const W = 420; const H = 60; const margin = {left:6,right:6,top:6,bottom:6};
    const svg = d3.select(el).append('svg').attr('width', W).attr('height', H);
    const x = d3.scalePoint().domain(series.map(s=>s.d)).range([margin.left, W-margin.right]);
    const y = d3.scaleLinear().domain([0, d3.max(series, s=>s.v) || 1]).range([H - margin.bottom, margin.top]);
    const line = d3.line().x(d=> x(d.d)).y(d=> y(d.v)).curve(d3.curveCardinal);
    svg.append('path').datum(series).attr('d', line).attr('fill','none').attr('stroke','#0d6efd').attr('stroke-width',2).attr('stroke-linejoin','round').attr('stroke-linecap','round').attr('opacity',0).transition().duration(900).attr('opacity',1);
    svg.selectAll('circle').data(series).enter().append('circle').attr('cx',d=>x(d.d)).attr('cy',d=>y(d.v)).attr('r',0).attr('fill','#fff').attr('stroke','#0d6efd').attr('stroke-width',2).transition().delay((d,i)=> i*80).duration(400).attr('r',4);
    return ()=>{ try{ el.innerHTML=''; }catch(e){} };
  },[data,d3Loaded]);

  // Utility: small header area with actions
  const Header = ()=> React.createElement('div', { style: { display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 } }, React.createElement('div', null, React.createElement('h3', null, 'Dashboard'), React.createElement('div', { style:{ fontSize:12, color:'#666' } }, wsConnected ? 'Live (WS)' : 'Live (polling/fallback)' )), React.createElement('div', null, React.createElement('button', { className:'btn btn-sm btn-outline-secondary', onClick: async ()=>{ const root = rootRef.current; if (root) { root.style.transition='opacity 240ms ease'; root.style.opacity='0.4'; } try{ const full = await apiGet('dashboard/full'); setData(full); }catch(e){ console.error(e); } finally{ if (root) setTimeout(()=>root.style.opacity='1',120); } } }, 'Refresh')));

  if (!data) return React.createElement('div', { style: { padding:20 } }, React.createElement('h3', null, 'Dashboard'), React.createElement('div', null, 'Loading...'));

  // layout
  return (
    React.createElement('div', { ref: rootRef, style: { padding:20 } },
      React.createElement(Header, null),
      React.createElement(KpiCards, { summary: data.summary }),

      React.createElement('div', { style: { display:'flex', gap:14, flexWrap:'wrap' } },
        // 3D Preview card (disabled on mobile)
        React.createElement('div', { style: { background:'#fff', padding:12, borderRadius:10, boxShadow:'0 12px 40px rgba(2,6,23,0.06)', flex:'0 0 360px', minWidth:280, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' } },
          React.createElement('div', { style: { display:'flex', justifyContent:'space-between', alignItems:'center', width:'100%', marginBottom:8 } }, React.createElement('h4', { style:{ margin:0, fontSize:16 } }, '3D Model Preview'), React.createElement('div', { style:{ fontSize:12, color:'#666' } }, 'Interactive viewer removed')),
          React.createElement('div', { style: { width:'100%', textAlign:'center' } },
            React.createElement('img', { src:'/src/assets/unknown.jpg', alt:'3d-preview', style:{ width:'100%', height:160, objectFit:'cover', borderRadius:6, marginBottom:10 } }),
            React.createElement('div', { style: { color:'#666', fontSize:13 } }, '3D viewer removed from this build. Static preview only.')
          )
        ),

        React.createElement('div', { style: { background:'#fff', padding:14, borderRadius:10, boxShadow:'0 12px 40px rgba(2,6,23,0.06)', flex:'0 0 360px' } },
          React.createElement('div', { style: { display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 } }, React.createElement('h4', { style:{ margin:0, fontSize:16 } }, 'Attendance Today'), React.createElement('div', { style:{ fontSize:12, color:'#666' } }, 'Live')),
          React.createElement('div', { ref: refs.donut, style: { width:320, height:320 } })
        ),

        React.createElement('div', { style: { flex:'1 1 740px', display:'flex', flexDirection:'column', gap:12 } },
          React.createElement('div', { style: { background:'#fff', padding:12, borderRadius:10, boxShadow:'0 12px 40px rgba(2,6,23,0.06)' } },
            React.createElement('h4', { style:{ marginTop:0, marginBottom:8, fontSize:16 } }, '14-Day Attendance Trend'),
            React.createElement('div', { ref: refs.trend })
          ),

          React.createElement('div', { style: { display:'flex', gap:12, marginTop:4, flexWrap:'wrap' } },
            React.createElement('div', { style: { background:'#fff', padding:12, borderRadius:10, boxShadow:'0 12px 40px rgba(2,6,23,0.06)', flex:'1 1 420px' } },
              React.createElement('h4', { style:{ marginTop:0, marginBottom:8, fontSize:14 } }, 'Hourly Heatmap (Today)'),
              React.createElement('div', { ref: refs.heatmap })
            ),

            React.createElement('div', { style: { background:'#fff', padding:12, borderRadius:10, boxShadow:'0 12px 40px rgba(2,6,23,0.06)', flex:'1 1 320px' } },
              React.createElement('h4', { style:{ marginTop:0, marginBottom:8, fontSize:14 } }, 'Top Rooms (30d)'),
              React.createElement('div', { ref: refs.topRooms })
            )
          )
        )
      ),

      React.createElement('div', { style: { display:'flex', gap:12, marginTop:16, flexWrap:'wrap' } },
        React.createElement('div', { style: { background:'#fff', padding:12, borderRadius:10, boxShadow:'0 12px 40px rgba(2,6,23,0.06)', flex:'0 0 360px' } },
          React.createElement('h4', { style:{ marginTop:0, marginBottom:8, fontSize:16 } }, 'Floor Distribution (30d)'),
          React.createElement('div', { ref: refs.floorDonut })
        ),

        React.createElement('div', { style: { background:'#fff', padding:12, borderRadius:10, boxShadow:'0 12px 40px rgba(2,6,23,0.06)', flex:'1 1 420px' } },
          React.createElement('h4', { style:{ marginTop:0, marginBottom:8, fontSize:16 } }, 'Attendance by Role (30d)'),
          React.createElement('div', { ref: refs.rolePie })
        ),

        React.createElement('div', { style: { background:'#fff', padding:12, borderRadius:10, boxShadow:'0 12px 40px rgba(2,6,23,0.06)', flex:'1 1 420px' } },
          React.createElement('h4', { style:{ marginTop:0, marginBottom:8, fontSize:16 } }, 'Weekly Summary'),
          React.createElement('div', { ref: refs.weekly })
        )
      ),

      React.createElement('div', { style: { marginTop:18 } },
        React.createElement('h4', null, 'Recent Attendance'),
        React.createElement('div', { style: { background:'#fff', padding:12, borderRadius:8, boxShadow:'0 12px 40px rgba(2,6,23,0.06)' } },
          React.createElement('table', { className:'table table-sm mb-0' },
            React.createElement('thead', null, React.createElement('tr', null, React.createElement('th', null, 'User'), React.createElement('th', null, 'Room'), React.createElement('th', null, 'Date'), React.createElement('th', null, 'Flag'))),
            React.createElement('tbody', null, (data.recent_attendance || []).map(r => React.createElement('tr', { key: r.attendance_id }, React.createElement('td', null, `${r.first_name || ''} ${r.last_name || ''}`), React.createElement('td', null, r.room_name || ''), React.createElement('td', null, r.date || ''), React.createElement('td', null, r.flag_in_name || ''))))
          )
        )
      )
    )
  );
}

export default DashboardPage;
