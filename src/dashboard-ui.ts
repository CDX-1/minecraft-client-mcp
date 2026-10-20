export const dashboardHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Minecraft sessions</title>
  <link rel="stylesheet" href="/dashboard.css">
</head>
<body>
  <header class="topbar">
    <div class="brand"><span class="brand-mark" aria-hidden="true"></span><strong>Minecraft sessions</strong></div>
    <div class="connection"><span id="stream-state">Connecting</span><span class="rule"></span><span id="client-state">No client</span></div>
  </header>
  <main class="workspace">
    <aside class="sessions-pane">
      <div class="pane-title"><h1>Sessions</h1><span id="session-count">0</span></div>
      <button class="session-all is-selected" id="all-sessions" type="button">All activity</button>
      <div id="sessions" class="sessions"></div>
    </aside>
    <section class="activity-pane">
      <div class="pane-title activity-title"><h2 id="activity-heading">All activity</h2><button id="clear-selection" type="button">Show all</button></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Time</th><th>Type</th><th>Action</th><th>Status</th><th>Duration</th></tr></thead>
          <tbody id="activity"></tbody>
        </table>
        <div class="empty" id="activity-empty">No actions or events recorded.</div>
      </div>
    </section>
    <aside class="detail-pane">
      <section class="current-section">
        <div class="pane-title"><h2>Current client</h2><span id="updated-at">—</span></div>
        <dl id="current-status" class="status-grid"></dl>
      </section>
      <section class="capture-section">
        <div class="pane-title"><h2>Captures</h2><span id="capture-count">0</span></div>
        <div id="captures" class="captures"></div>
        <div class="empty" id="capture-empty">No captures for this selection.</div>
      </section>
      <section class="payload-section">
        <div class="pane-title"><h2>Selected record</h2></div>
        <pre id="payload">Select an action to inspect its input and result.</pre>
      </section>
    </aside>
  </main>
  <script type="module" src="/dashboard.js"></script>
</body>
</html>`

export const dashboardCss = `
:root { --ink:#111111; --paper:#ffffff; --wash:#f7f7f8; --line:#d8d8d8; --muted:#676767; --orange:#ff4f00; --success:#166534; --danger:#b42318; }
* { box-sizing:border-box; }
html, body { margin:0; min-height:100%; background:var(--paper); color:var(--ink); font-family:"Helvetica Neue",Helvetica,sans-serif; }
body { overflow:hidden; }
button { font:inherit; color:inherit; }
.topbar { height:58px; display:flex; align-items:center; justify-content:space-between; padding:0 22px; border-bottom:1px solid var(--ink); background:var(--paper); }
.brand { display:flex; align-items:center; gap:11px; font-size:16px; }
.brand-mark { width:17px; height:17px; background:var(--orange); box-shadow:5px 5px 0 var(--ink); margin-right:5px; }
.connection { display:flex; align-items:center; gap:12px; color:var(--muted); font-size:13px; font-variant-numeric:tabular-nums; }
.connection .rule { width:32px; height:1px; background:var(--line); }
.workspace { height:calc(100vh - 58px); display:grid; grid-template-columns:264px minmax(470px,1fr) minmax(320px,390px); }
.sessions-pane, .activity-pane, .detail-pane { min-width:0; min-height:0; }
.sessions-pane { border-right:1px solid var(--ink); overflow:auto; }
.activity-pane { display:flex; flex-direction:column; border-right:1px solid var(--ink); }
.detail-pane { overflow:auto; background:var(--wash); }
.pane-title { height:52px; padding:0 16px; display:flex; align-items:center; justify-content:space-between; border-bottom:1px solid var(--line); }
.pane-title h1, .pane-title h2 { margin:0; font-size:14px; line-height:1; font-weight:650; }
.pane-title > span { color:var(--muted); font-size:12px; font-variant-numeric:tabular-nums; }
.activity-title { padding-left:20px; }
.activity-title button { border:0; background:none; color:var(--orange); padding:6px 0; cursor:pointer; font-size:12px; }
.session-all { width:100%; height:42px; padding:0 16px; text-align:left; background:var(--paper); border:0; border-bottom:1px solid var(--line); cursor:pointer; font-weight:600; }
.session-all.is-selected { box-shadow:inset 4px 0 0 var(--orange); }
.session { width:100%; display:grid; grid-template-columns:50px 1fr; padding:0; background:var(--paper); border:0; border-bottom:1px solid var(--line); text-align:left; cursor:pointer; }
.session:hover, .session.is-selected { background:var(--wash); }
.session.is-selected { box-shadow:inset 4px 0 0 var(--orange); }
.folio { min-height:92px; display:flex; align-items:flex-start; justify-content:center; padding-top:13px; border-right:1px solid var(--line); font-size:27px; font-weight:700; line-height:1; font-variant-numeric:tabular-nums; }
.session-copy { padding:12px 13px; min-width:0; }
.session-copy strong, .session-copy span { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.session-copy strong { font-size:13px; margin-bottom:6px; }
.session-copy span { font-size:12px; color:var(--muted); margin-top:3px; }
.session-status { color:var(--orange)!important; }
.table-wrap { overflow:auto; flex:1; position:relative; }
table { width:100%; border-collapse:collapse; table-layout:fixed; font-size:12px; }
th { position:sticky; top:0; z-index:1; background:var(--wash); color:var(--muted); font-weight:500; text-align:left; border-bottom:1px solid var(--ink); padding:9px 10px; }
td { border-bottom:1px solid var(--line); padding:10px; vertical-align:top; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-variant-numeric:tabular-nums; }
th:nth-child(1), td:nth-child(1) { width:82px; padding-left:20px; }
th:nth-child(2), td:nth-child(2) { width:66px; }
th:nth-child(4), td:nth-child(4) { width:86px; }
th:nth-child(5), td:nth-child(5) { width:76px; text-align:right; padding-right:20px; }
tbody tr { cursor:pointer; }
tbody tr:hover, tbody tr.is-selected { background:#fff3ed; }
.status-started { color:var(--orange); }
.status-failed { color:var(--danger); }
.status-succeeded { color:var(--success); }
.empty { color:var(--muted); font-size:12px; padding:22px 16px; }
.current-section, .capture-section { border-bottom:1px solid var(--ink); }
.status-grid { display:grid; grid-template-columns:105px 1fr; margin:0; padding:13px 16px 17px; gap:8px 12px; font-size:12px; }
.status-grid dt { color:var(--muted); }
.status-grid dd { margin:0; overflow-wrap:anywhere; font-variant-numeric:tabular-nums; }
.captures { display:grid; grid-template-columns:1fr 1fr; }
.capture { border:0; border-bottom:1px solid var(--line); background:var(--paper); padding:0; text-align:left; cursor:pointer; }
.capture:nth-child(odd) { border-right:1px solid var(--line); }
.capture img { display:block; width:100%; aspect-ratio:1; image-rendering:pixelated; object-fit:cover; background:#222; }
.capture-copy { display:block; padding:8px; font-size:11px; color:var(--muted); }
.payload-section pre { margin:0; padding:16px; min-height:190px; overflow:auto; white-space:pre-wrap; overflow-wrap:anywhere; font:11px/1.55 "IBM Plex Mono","SFMono-Regular",Consolas,monospace; color:#2c2c2c; }
@media (max-width:1050px) { .workspace { grid-template-columns:230px 1fr; } .detail-pane { display:none; } }
@media (max-width:700px) { body { overflow:auto; } .topbar { position:sticky; top:0; z-index:3; } .workspace { height:auto; display:block; } .sessions-pane, .activity-pane { border-right:0; border-bottom:1px solid var(--ink); max-height:46vh; } .detail-pane { display:block; } }
`

export const dashboardJs = `
const state = { data:null, selectedSession:null, selectedActivity:null, refreshTimer:null };
const byId = (id) => document.getElementById(id);
const text = (tag, value, className) => { const node=document.createElement(tag); node.textContent=value; if(className) node.className=className; return node; };
const formatTime = (value) => value ? new Date(value).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'}) : '—';
const formatDate = (value) => value ? new Date(value).toLocaleString([], {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}) : '—';
const compact = (value) => JSON.stringify(value ?? null).replace(/\s+/g,' ').slice(0,120);

async function refresh() {
  const response = await fetch('/api/state', {cache:'no-store'});
  if (!response.ok) throw new Error('Dashboard state unavailable');
  state.data = await response.json();
  render();
}

function scheduleRefresh() {
  clearTimeout(state.refreshTimer);
  state.refreshTimer = setTimeout(() => refresh().catch(setOffline), 70);
}

function render() {
  const {sessions,activities,captures,minecraft,now,currentSessionId} = state.data;
  byId('stream-state').textContent='Live';
  byId('client-state').textContent=minecraft.connected ? minecraft.username+' · '+minecraft.version : 'No client';
  byId('updated-at').textContent=formatTime(now);
  byId('session-count').textContent=String(sessions.length);
  byId('all-sessions').classList.toggle('is-selected', !state.selectedSession);
  renderSessions(sessions,currentSessionId);
  renderStatus(minecraft);
  const filteredActivities=state.selectedSession ? activities.filter(item=>item.sessionId===state.selectedSession) : activities;
  const filteredCaptures=state.selectedSession ? captures.filter(item=>item.sessionId===state.selectedSession) : captures;
  renderActivities(filteredActivities);
  renderCaptures(filteredCaptures);
}

function renderSessions(sessions,currentSessionId) {
  const root=byId('sessions'); root.replaceChildren();
  sessions.forEach((session,index)=>{
    const button=text('button',''); button.type='button'; button.className='session'+(state.selectedSession===session.id?' is-selected':'');
    const folio=text('span',String(sessions.length-index).padStart(2,'0'),'folio');
    const copy=text('span','', 'session-copy');
    copy.append(text('strong',session.username+' @ '+session.host+':'+session.port));
    copy.append(text('span',formatDate(session.startedAt)));
    copy.append(text('span',session.id===currentSessionId ? 'current · '+session.status : session.status,'session-status'));
    button.append(folio,copy); button.addEventListener('click',()=>{state.selectedSession=session.id;state.selectedActivity=null;render();}); root.append(button);
  });
}

function renderStatus(status) {
  const root=byId('current-status'); root.replaceChildren();
  const rows=status.connected ? [
    ['State',status.state],['Player',status.username],['Version',status.version],
    ['Position',status.position ? status.position.x+', '+status.position.y+', '+status.position.z : '—'],
    ['Health',String(status.health)],['Food',String(status.food)],['Dimension',String(status.dimension ?? '—')]
  ] : [['State',status.state],['Last reason',status.lastDisconnectReason ?? '—']];
  rows.forEach(([key,value])=>root.append(text('dt',key),text('dd',value)));
}

function renderActivities(activities) {
  const root=byId('activity'); root.replaceChildren();
  byId('activity-empty').hidden=activities.length>0;
  byId('activity-heading').textContent=state.selectedSession ? 'Session activity' : 'All activity';
  activities.forEach(activity=>{
    const row=document.createElement('tr'); if(state.selectedActivity===activity.id) row.className='is-selected';
    row.append(text('td',formatTime(activity.at)),text('td',activity.kind),text('td',activity.name),text('td',activity.status,'status-'+activity.status),text('td',activity.durationMs===null?'—':activity.durationMs+' ms'));
    row.title=compact(activity.input); row.addEventListener('click',()=>{state.selectedActivity=activity.id;byId('payload').textContent=JSON.stringify(activity,null,2);renderActivities(activities);}); root.append(row);
  });
}

function renderCaptures(captures) {
  const root=byId('captures'); root.replaceChildren(); byId('capture-count').textContent=String(captures.length); byId('capture-empty').hidden=captures.length>0;
  captures.forEach(capture=>{
    const button=text('button',''); button.type='button'; button.className='capture';
    const image=document.createElement('img'); image.src='/captures/'+encodeURIComponent(capture.filename); image.alt='Top-down world capture at '+capture.center.x+', '+capture.center.y+', '+capture.center.z; image.loading='lazy';
    button.append(image,text('span',formatDate(capture.at)+' · '+capture.radius+' block radius','capture-copy'));
    button.addEventListener('click',()=>{byId('payload').textContent=JSON.stringify(capture,null,2);}); root.append(button);
  });
}

function setOffline() { byId('stream-state').textContent='Reconnecting'; }
byId('all-sessions').addEventListener('click',()=>{state.selectedSession=null;state.selectedActivity=null;render();});
byId('clear-selection').addEventListener('click',()=>{state.selectedSession=null;state.selectedActivity=null;render();});
const stream=new EventSource('/api/stream'); stream.onopen=()=>{byId('stream-state').textContent='Live';}; stream.onmessage=scheduleRefresh; stream.onerror=setOffline;
setInterval(scheduleRefresh, 2000);
refresh().catch(setOffline);
`
