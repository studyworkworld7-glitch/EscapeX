const CLIENT_ID = '445613530144-8nca3h64lackcrmkd3joge3cv7ir91uu.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/tasks https://www.googleapis.com/auth/calendar.events.readonly';

let timeLeft, timerInterval, noiseNode, breathInterval, currentToken = null, chartObj = null;
let currentCycle = 1, sessionState = 'WORK', zenMode = 'focus';
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const gainNode = audioCtx.createGain(); gainNode.connect(audioCtx.destination);

// Database structure
let db = JSON.parse(localStorage.getItem('escapex_db')) || { 
    history: [], 
    settings: { focus: 25, short: 5, long: 15, cycles: 4, autostart: false, night: false } 
};

// --- AUTH & PERSISTENCE ---
window.onload = () => {
    const savedToken = localStorage.getItem('escapex_token');
    const savedProfile = localStorage.getItem('escapex_profile');
    if (savedToken && savedProfile) {
        currentToken = savedToken;
        updateUI(JSON.parse(savedProfile));
    }
    
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID, scope: SCOPES,
        callback: (resp) => {
            currentToken = resp.access_token;
            localStorage.setItem('escapex_token', currentToken);
            fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${currentToken}` }})
                .then(r => r.json()).then(data => {
                    localStorage.setItem('escapex_profile', JSON.stringify(data));
                    updateUI(data);
                });
        }
    });
    updateConfigUI(); lucide.createIcons();
};

function updateUI(data) {
    document.getElementById('profile-name').innerText = data.name;
    document.getElementById('profile-img').innerHTML = `<img src="${data.picture}" class="w-full h-full object-cover">`;
    document.getElementById('auth-box').innerHTML = `<p class="text-green-500 text-[10px] uppercase tracking-[0.4em]">Cloud Protocol Active</p>`;
    show('focus');
}

function logout() {
    localStorage.removeItem('escapex_token');
    localStorage.removeItem('escapex_profile');
    window.location.reload();
}

// --- CORE NAVIGATION (FIXED GLOW) ---
function show(id) {
    if (breathInterval) { clearInterval(breathInterval); breathInterval = null; document.getElementById('zen-btn').style.display = 'block'; }
    
    // Switch Views
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const target = document.getElementById(id);
    if(target) target.classList.add('active');

    // Switch Glow (Fixed Logic)
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const navBtn = document.getElementById('nav-' + id);
    if (navBtn) navBtn.classList.add('active');

    // Contextual Data Fetch
    if (id === 'tasks') { refreshTasks(); refreshCalendar(); }
    if (id === 'galaxy') renderGalaxy();
    if (id === 'stats') updateChart('week');
    
    lucide.createIcons();
}

// --- TASK & CALENDAR SYNC ---
async function refreshTasks() {
    if (!currentToken) return;
    const resp = await fetch('https://www.googleapis.com/tasks/v1/lists/@default/tasks', { headers: { Authorization: `Bearer ${currentToken}` }});
    const data = await resp.json();
    document.getElementById('task-list').innerHTML = (data.items || []).map(t => `
        <div class="glass p-4 rounded-2xl flex justify-between items-center group">
            <span class="text-sm font-light ${t.status === 'completed' ? 'line-through opacity-20' : ''}">${t.title}</span>
            <div class="flex gap-3">
                <button onclick="toggleTask('${t.id}', '${t.status}')" class="w-8 h-8 rounded-full border border-white/10 flex items-center justify-center hover:bg-white hover:text-black transition-all"><i data-lucide="check" class="w-3"></i></button>
                <button onclick="deleteTask('${t.id}')" class="opacity-0 group-hover:opacity-40 transition-opacity"><i data-lucide="trash-2" class="w-3"></i></button>
            </div>
        </div>`).join('');
    lucide.createIcons();
}

async function addTask() {
    const val = document.getElementById('task-in').value;
    if (!val || !currentToken) return;
    await fetch('https://www.googleapis.com/tasks/v1/lists/@default/tasks', {
        method: 'POST', headers: { Authorization: `Bearer ${currentToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: val })
    });
    document.getElementById('task-in').value = ''; refreshTasks();
}

async function toggleTask(id, s) {
    const ns = s === 'completed' ? 'needsAction' : 'completed';
    await fetch(`https://www.googleapis.com/tasks/v1/lists/@default/tasks/${id}`, {
        method: 'PATCH', headers: { Authorization: `Bearer ${currentToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: ns })
    });
    refreshTasks();
}

async function deleteTask(id) {
    await fetch(`https://www.googleapis.com/tasks/v1/lists/@default/tasks/${id}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${currentToken}` }
    });
    refreshTasks();
}

async function refreshCalendar() {
    if (!currentToken) return;
    const resp = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${new Date().toISOString()}&maxResults=5&singleEvents=true&orderBy=startTime`, {
        headers: { Authorization: `Bearer ${currentToken}` }
    });
    const data = await resp.json();
    document.getElementById('calendar-list').innerHTML = (data.items || []).map(e => {
        const start = new Date(e.start.dateTime || e.start.date);
        return `<div class="glass p-4 opacity-50 flex justify-between items-center">
            <div>
                <p class="text-[11px] font-light">${e.summary}</p>
                <p class="text-[8px] opacity-40 uppercase">${start.getDate()} ${start.toLocaleString('default',{month:'short'})} | ${start.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</p>
            </div>
        </div>`;
    }).join('');
}

// --- TIMER ENGINE (AUTO-FULLSCREEN) ---
function toggleTimer() {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    if (!timerInterval) {
        // Auto Fullscreen on Flow
        if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(()=>{});
        
        document.body.classList.add('locked');
        document.getElementById('main-btn').innerText = "Locked In";
        timerInterval = setInterval(() => {
            if (timeLeft > 0) { timeLeft--; updateTimerDisplay(); } 
            else { handleCycleComplete(); }
        }, 1000);
    } else {
        clearInterval(timerInterval); timerInterval = null;
        document.getElementById('main-btn').innerText = "Resume Flow";
        document.body.classList.remove('locked');
    }
}

function handleCycleComplete() {
    ringBell(); clearInterval(timerInterval); timerInterval = null;
    if (sessionState === 'WORK') {
        db.history.push({ date: new Date().toISOString(), mins: db.settings.focus });
        save();
        if (currentCycle >= db.settings.cycles) { sessionState = 'LONG'; timeLeft = db.settings.long * 60; currentCycle = 1; }
        else { sessionState = 'SHORT'; timeLeft = db.settings.short * 60; currentCycle++; }
    } else { sessionState = 'WORK'; timeLeft = db.settings.focus * 60; }
    updateTimerDisplay();
    if (db.settings.autostart) setTimeout(toggleTimer, 4000);
}

function ringBell() {
    const osc = audioCtx.createOscillator(); const g = audioCtx.createGain();
    osc.type = 'sine'; osc.frequency.setValueAtTime(880, audioCtx.currentTime);
    g.gain.setValueAtTime(0.5, audioCtx.currentTime); g.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 3);
    osc.connect(g); g.connect(audioCtx.destination); osc.start(); osc.stop(audioCtx.currentTime + 3);
}

// --- AUDIO ENGINE ---
function setAudio(type) {
    if (noiseNode) noiseNode.stop();
    document.querySelectorAll('.sound-opt').forEach(b => b.classList.remove('active'));
    if (type === 'none') return;
    const bufferSize = audioCtx.sampleRate * 2;
    const buffer = audioCtx.createBuffer(type === 'binaural' ? 2 : 1, bufferSize, audioCtx.sampleRate);
    if (type === 'binaural') {
        const l = buffer.getChannelData(0), r = buffer.getChannelData(1);
        for(let i=0; i<bufferSize; i++) {
            l[i] = Math.sin(2 * Math.PI * 200 * (i/audioCtx.sampleRate)) * 0.1;
            r[i] = Math.sin(2 * Math.PI * 204 * (i/audioCtx.sampleRate)) * 0.1;
        }
    } else {
        const d = buffer.getChannelData(0); let last = 0;
        for(let i=0; i<bufferSize; i++) {
            let w = Math.random()*2-1;
            if (type === 'white') d[i] = w * 0.05;
            if (type === 'brown') { d[i] = (last + (0.02 * w)) / 1.02; last = d[i]; d[i] *= 3.5; }
            if (type === 'flow') d[i] = Math.sin(i / 2000) * w * 0.04;
            if (type === 'tick') d[i] = (i % audioCtx.sampleRate < 100) ? w : 0;
        }
    }
    noiseNode = audioCtx.createBufferSource(); noiseNode.buffer = buffer; noiseNode.loop = true; noiseNode.connect(gainNode); noiseNode.start();
    document.querySelector(`[onclick="setAudio('${type}')"]`).classList.add('active');
}

function updateVolume() {
    const v = document.getElementById('vol-slider').value; 
    gainNode.gain.setTargetAtTime(v, audioCtx.currentTime, 0.1);
    document.getElementById('vol-val').innerText = Math.round(v*100)+'%';
}

// --- ZEN ---
function setZenMode(m) { zenMode = m; document.querySelectorAll('.zen-btn').forEach(b => b.classList.remove('active')); document.getElementById('zen-'+m).classList.add('active'); }
function startZen() {
    const ring = document.getElementById('zen-ring'); const txt = document.getElementById('zen-text');
    let step = 0; const steps = zenMode === 'relax' ? ["Inhale","Hold","Exhale"] : (zenMode === 'study' ? ["Inhale","Exhale"] : ["Inhale","Hold","Exhale","Hold"]);
    const times = zenMode === 'relax' ? [4000, 7000, 8000] : (zenMode === 'study' ? [6000, 6000] : [4000,4000,4000,4000]);
    document.getElementById('zen-btn').style.display = 'none';
    const runZen = () => {
        txt.innerText = steps[step];
        ring.style.transform = (steps[step] === "Inhale") ? "scale(1.4)" : (steps[step] === "Exhale" ? "scale(1.0)" : ring.style.transform);
        breathInterval = setTimeout(() => { step = (step + 1) % steps.length; runZen(); }, times[step]);
    }; runZen();
}

// --- ANALYTICS & GALAXY ---
function updateChart(range) {
    if (chartObj) chartObj.destroy();
    const ctx = document.getElementById('statChart').getContext('2d');
    const labels = []; const dataPoints = [];
    const now = new Date();
    
    // Simple logic for Week view - scales better
    for (let i = 6; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        labels.push(d.toLocaleDateString([], { weekday: 'short' }));
        const dayTotal = db.history.filter(h => new Date(h.date).toDateString() === d.toDateString()).reduce((a, b) => a + b.mins, 0);
        dataPoints.push(dayTotal / 60);
    }

    chartObj = new Chart(ctx, {
        type: 'line', data: { labels, datasets: [{ data: dataPoints, borderColor: 'white', tension: 0.4, pointRadius: 0, borderWeight: 1 }] },
        options: { plugins: { legend: { display: false } }, scales: { y: { display: false }, x: { grid: { display: false }, ticks: { color: 'rgba(255,255,255,0.2)', font: { size: 8 } } } } }
    });
}

function renderGalaxy() {
    const canvas = document.getElementById('galaxy-canvas'); const ctx = canvas.getContext('2d');
    const val = parseInt(document.getElementById('star-val').value);
    canvas.width = window.innerWidth; canvas.height = window.innerHeight;
    const totalMins = db.history.reduce((a, b) => a + (b.mins || 0), 0);
    const count = Math.floor(totalMins / val);
    document.getElementById('galaxy-count').innerText = count;
    document.getElementById('galaxy-math').innerText = `$ ${totalMins}m \\div ${val}m = ${count} Stars $`;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for(let i=0; i<count; i++) {
        ctx.fillStyle = "white"; ctx.shadowBlur = 10; ctx.shadowColor = "white";
        ctx.beginPath(); ctx.arc(Math.random()*canvas.width, Math.random()*canvas.height, Math.random()*1.5, 0, Math.PI*2); ctx.fill();
    }
}

// --- UTILS ---
function updateConfigUI() {
    db.settings.focus = parseInt(document.getElementById('cfg-focus').value);
    db.settings.short = parseInt(document.getElementById('cfg-short').value);
    db.settings.long = parseInt(document.getElementById('cfg-long').value);
    db.settings.cycles = parseInt(document.getElementById('cfg-cycles').value);
    db.settings.autostart = document.getElementById('cfg-autostart').checked;
    document.getElementById('val-focus').innerText = db.settings.focus+'m';
    document.getElementById('val-short').innerText = db.settings.short+'m';
    document.getElementById('val-long').innerText = db.settings.long+'m';
    document.getElementById('val-cycles').innerText = db.settings.cycles;
    timeLeft = db.settings.focus * 60; updateTimerDisplay(); save();
}
function updateTimerDisplay() {
    const m = Math.floor(timeLeft/60), s = timeLeft%60;
    document.getElementById('timer-display').innerText = `${m}:${s < 10 ? '0' : ''}${s}`;
    document.getElementById('session-type').innerText = `${sessionState} | CYCLE ${currentCycle}`;
    document.getElementById('progress').style.strokeDashoffset = 942 - (942 * (timeLeft / (db.settings.focus*60)));
}
function updateNightLight() { 
    db.settings.night = document.getElementById('cfg-night').checked;
    document.getElementById('night-overlay').style.display = db.settings.night ? 'block' : 'none'; 
    save();
}
function save() { localStorage.setItem('escapex_db', JSON.stringify(db)); }
function toggleSoundMenu() { document.getElementById('sound-menu').classList.toggle('hidden'); }
function toggleTimerSettings() { document.getElementById('timer-settings').classList.toggle('hidden'); }
function handleAuthClick() { tokenClient.requestAccessToken({prompt: 'consent'}); }
