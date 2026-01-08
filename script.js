/**
 * EscapeX Platinum v10.5 - Official Master Script
 * Built by Rudra Thorat
 */

// --- GLOBAL CONFIGURATION ---
const CLIENT_ID = '445613530144-8nca3h64lackcrmkd3joge3cv7ir91uu.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/tasks https://www.googleapis.com/auth/calendar.events.readonly';

let timeLeft, timerInterval, noiseNode, tokenClient, chartObj = null, currentToken = null;
let currentCycle = 1, sessionState = 'WORK', zenMode = 'focus', breathInterval = null;

// Audio Context Initialization
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const gainNode = audioCtx.createGain(); 
gainNode.connect(audioCtx.destination);
gainNode.gain.setValueAtTime(0.5, audioCtx.currentTime);

// Database Persistence
let db = JSON.parse(localStorage.getItem('escapex_db')) || { 
    history: [], 
    settings: { focus: 25, short: 5, long: 15, cycles: 4, autostart: false, night: false } 
};

// --- 1. INITIALIZATION & AUTH ---

window.onload = () => {
    initAuth();
    loadSettings();
    updateConfigUI(); // Sets initial timeLeft
    lucide.createIcons();
    
    // Check for existing session
    const savedToken = localStorage.getItem('escapex_token');
    const savedProfile = localStorage.getItem('escapex_profile');
    if (savedToken && savedProfile) {
        currentToken = savedToken;
        renderUserUI(JSON.parse(savedProfile));
    }
};

function initAuth() {
    if (typeof google === 'undefined') {
        setTimeout(initAuth, 200);
        return;
    }
    
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID, 
        scope: SCOPES,
        callback: (resp) => {
            if (resp.error) return;
            currentToken = resp.access_token;
            localStorage.setItem('escapex_token', currentToken);
            fetchUserInfo();
        }
    });
}

function fetchUserInfo() {
    fetch('https://www.googleapis.com/oauth2/v3/userinfo', { 
        headers: { Authorization: `Bearer ${currentToken}` }
    })
    .then(r => r.json())
    .then(data => {
        localStorage.setItem('escapex_profile', JSON.stringify(data));
        renderUserUI(data);
    });
}

function renderUserUI(data) {
    document.getElementById('profile-name').innerText = data.name;
    document.getElementById('profile-img').innerHTML = `<img src="${data.picture}" class="w-full h-full object-cover">`;
    document.getElementById('logout-btn').classList.remove('hidden');
    document.getElementById('auth-box').innerHTML = `<p class="text-green-500 text-[9px] uppercase tracking-[0.4em] font-bold">Cloud Synced</p>`;
    show('focus');
}

function logout() {
    localStorage.removeItem('escapex_token');
    localStorage.removeItem('escapex_profile');
    window.location.reload();
}

function handleAuthClick() {
    tokenClient.requestAccessToken({prompt: 'consent'});
}

// --- 2. NAVIGATION & VIEW LOGIC (GLOW FIX) ---

function show(id) {
    // 1. Reset Zen animations if leaving Zen tab
    if (breathInterval) { 
        clearTimeout(breathInterval); 
        breathInterval = null; 
        document.getElementById('zen-btn').style.display = 'block';
    }

    // 2. Tab Visibility Toggle
    document.querySelectorAll('.view').forEach(v => {
        v.classList.remove('active');
        v.style.display = 'none'; 
    });
    
    const targetView = document.getElementById(id);
    if (targetView) {
        targetView.style.display = 'flex';
        // Small timeout to allow display:flex to register before opacity transition
        setTimeout(() => targetView.classList.add('active'), 10);
    }

    // 3. Navigation Glow Fix
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.classList.remove('active');
    });
    const activeNav = document.getElementById('nav-' + id);
    if (activeNav) activeNav.classList.add('active');

    // 4. Data Refresh
    if (id === 'tasks') { refreshTasks(); refreshCalendar(); }
    if (id === 'stats') updateChart();
    if (id === 'galaxy') renderGalaxy();
    
    lucide.createIcons();
}

// --- 3. TIMER & FULLSCREEN ENGINE ---

function toggleTimer() {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    
    if (!timerInterval) {
        // Fullscreen Logic
        const doc = document.documentElement;
        if (doc.requestFullscreen) doc.requestFullscreen();
        else if (doc.webkitRequestFullscreen) doc.webkitRequestFullscreen();

        document.body.classList.add('locked');
        document.getElementById('main-btn').innerText = "Locked In";
        
        timerInterval = setInterval(() => {
            if (timeLeft > 0) {
                timeLeft--;
                updateTimerDisplay();
            } else {
                handleSessionComplete();
            }
        }, 1000);
    } else {
        stopTimer();
    }
}

function stopTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
    document.getElementById('main-btn').innerText = "Resume Flow";
    document.body.classList.remove('locked');
}

function handleSessionComplete() {
    ringBell();
    clearInterval(timerInterval);
    timerInterval = null;

    if (sessionState === 'WORK') {
        db.history.push({ date: new Date().toISOString(), mins: db.settings.focus });
        save();
        
        if (currentCycle >= db.settings.cycles) {
            sessionState = 'LONG BREAK';
            timeLeft = db.settings.long * 60;
            currentCycle = 1;
        } else {
            sessionState = 'SHORT BREAK';
            timeLeft = db.settings.short * 60;
            currentCycle++;
        }
    } else {
        sessionState = 'WORK';
        timeLeft = db.settings.focus * 60;
    }

    updateTimerDisplay();
    if (db.settings.autostart) setTimeout(toggleTimer, 3000);
}

function updateTimerDisplay() {
    const m = Math.floor(timeLeft / 60);
    const s = timeLeft % 60;
    document.getElementById('timer-display').innerText = `${m}:${s < 10 ? '0' : ''}${s}`;
    document.getElementById('session-type').innerText = `${sessionState} | CYCLE ${currentCycle}`;
    
    // Progress Ring (Based on dasharray 942 or 1000)
    const circle = document.getElementById('progress');
    const total = (sessionState === 'WORK') ? db.settings.focus * 60 : (sessionState === 'LONG BREAK' ? db.settings.long * 60 : db.settings.short * 60);
    const offset = 1000 - (1000 * (timeLeft / total));
    circle.style.strokeDashoffset = offset;
}

// --- 4. AUDIO SYNTHESIS ---

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
            let w = Math.random() * 2 - 1;
            if (type === 'white') d[i] = w * 0.05;
            if (type === 'brown') { d[i] = (last + (0.02 * w)) / 1.02; last = d[i]; d[i] *= 3.5; }
            if (type === 'flow') d[i] = Math.sin(i / 2000) * w * 0.04;
            if (type === 'tick') d[i] = (i % audioCtx.sampleRate < 100) ? w : 0;
        }
    }

    noiseNode = audioCtx.createBufferSource();
    noiseNode.buffer = buffer;
    noiseNode.loop = true;
    noiseNode.connect(gainNode);
    noiseNode.start();
    
    const activeBtn = document.querySelector(`[onclick="setAudio('${type}')"]`);
    if(activeBtn) activeBtn.classList.add('active');
}

function updateVolume() {
    const v = document.getElementById('vol-slider').value;
    gainNode.gain.setTargetAtTime(v, audioCtx.currentTime, 0.1);
    document.getElementById('vol-val').innerText = Math.round(v * 100) + '%';
}

function ringBell() {
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, audioCtx.currentTime);
    g.gain.setValueAtTime(0.5, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 2);
    osc.connect(g); g.connect(audioCtx.destination);
    osc.start(); osc.stop(audioCtx.currentTime + 2);
}

// --- 5. GOOGLE CRUD OPERATIONS ---

async function refreshTasks() {
    if (!currentToken) return;
    try {
        const resp = await fetch('https://www.googleapis.com/tasks/v1/lists/@default/tasks', { 
            headers: { Authorization: `Bearer ${currentToken}` }
        });
        const data = await resp.json();
        const list = document.getElementById('task-list');
        list.innerHTML = (data.items || []).map(t => `
            <div class="glass p-4 flex justify-between items-center group">
                <span class="text-sm font-light ${t.status === 'completed' ? 'line-through opacity-20' : ''}">${t.title}</span>
                <div class="flex gap-2">
                    <button onclick="toggleTask('${t.id}', '${t.status}')" class="w-8 h-8 rounded-full border border-white/10 flex items-center justify-center hover:bg-white hover:text-black transition-all">
                        <i data-lucide="check" class="w-3"></i>
                    </button>
                    <button onclick="deleteTask('${t.id}')" class="opacity-0 group-hover:opacity-40 transition-opacity p-2">
                        <i data-lucide="trash-2" class="w-3"></i>
                    </button>
                </div>
            </div>`).join('');
        lucide.createIcons();
    } catch(e) { console.error("Task Fetch Failed"); }
}

async function addTask() {
    const input = document.getElementById('task-in');
    if (!input.value || !currentToken) return;
    await fetch('https://www.googleapis.com/tasks/v1/lists/@default/tasks', {
        method: 'POST', 
        headers: { Authorization: `Bearer ${currentToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: input.value })
    });
    input.value = '';
    refreshTasks();
}

async function toggleTask(id, s) {
    const ns = s === 'completed' ? 'needsAction' : 'completed';
    await fetch(`https://www.googleapis.com/tasks/v1/lists/@default/tasks/${id}`, {
        method: 'PATCH', 
        headers: { Authorization: `Bearer ${currentToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: ns })
    });
    refreshTasks();
}

async function deleteTask(id) {
    await fetch(`https://www.googleapis.com/tasks/v1/lists/@default/tasks/${id}`, {
        method: 'DELETE', 
        headers: { Authorization: `Bearer ${currentToken}` }
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
        return `<div class="glass p-4 opacity-50 flex justify-between items-center text-[11px]">
            <span>${e.summary}</span>
            <span class="opacity-40 font-mono">${start.getHours()}:${start.getMinutes().toString().padStart(2,'0')}</span>
        </div>`;
    }).join('');
}

// --- 6. ANALYTICS & GALAXY ---

function updateChart() {
    const canvas = document.getElementById('statChart');
    if (!canvas) return;
    if (chartObj) chartObj.destroy();
    
    const labels = [], data = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        labels.push(d.toLocaleDateString([], { weekday: 'short' }));
        const mins = db.history.filter(h => new Date(h.date).toDateString() === d.toDateString())
                               .reduce((s, h) => s + h.mins, 0);
        data.push(mins / 60); // Hours
    }

    chartObj = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
            labels,
            datasets: [{ data, borderColor: 'white', borderWidth: 1, tension: 0.4, pointRadius: 2, backgroundColor: 'rgba(255,255,255,0.05)', fill: true }]
        },
        options: {
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { 
                y: { display: true, beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: 'rgba(255,255,255,0.2)', font: { size: 8 } } }, 
                x: { grid: { display: false }, ticks: { color: 'rgba(255,255,255,0.2)', font: { size: 8 } } } 
            }
        }
    });
}

function renderGalaxy() {
    const canvas = document.getElementById('galaxy-canvas');
    const ctx = canvas.getContext('2d');
    const val = parseInt(document.getElementById('star-val').value);
    
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    const totalMins = db.history.reduce((a, b) => a + (b.mins || 0), 0);
    const count = Math.floor(totalMins / val);
    document.getElementById('galaxy-count').innerText = count;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for(let i=0; i<count; i++) {
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        const size = Math.random() * 1.5;
        const op = Math.random();
        ctx.fillStyle = `rgba(255, 255, 255, ${op})`;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
    }
}

// --- 7. ZEN RITUAL ---

function setZenMode(m) {
    zenMode = m;
    document.querySelectorAll('.zen-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`zen-${m}-btn`).classList.add('active');
}

function startZen() {
    const ring = document.getElementById('zen-ring');
    const txt = document.getElementById('zen-text');
    let step = 0;
    
    const steps = zenMode === 'relax' ? ["Inhale", "Hold", "Exhale"] : (zenMode === 'study' ? ["Inhale", "Exhale"] : ["Inhale", "Hold", "Exhale", "Hold"]);
    const times = zenMode === 'relax' ? [4000, 7000, 8000] : (zenMode === 'study' ? [6000, 6000] : [4000, 4000, 4000, 4000]);
    
    document.getElementById('zen-btn').style.display = 'none';

    const runZen = () => {
        txt.innerText = steps[step];
        ring.style.transform = (steps[step] === "Inhale") ? "scale(1.4)" : (steps[step] === "Exhale" ? "scale(1.0)" : ring.style.transform);
        
        breathInterval = setTimeout(() => {
            step = (step + 1) % steps.length;
            runZen();
        }, times[step]);
    };
    runZen();
}

// --- 8. UTILITIES & SETTINGS ---

function updateConfigUI() {
    db.settings.focus = parseInt(document.getElementById('cfg-focus').value);
    db.settings.short = parseInt(document.getElementById('cfg-short').value);
    db.settings.long = parseInt(document.getElementById('cfg-long').value);
    db.settings.cycles = parseInt(document.getElementById('cfg-cycles').value);
    db.settings.autostart = document.getElementById('cfg-autostart').checked;

    document.getElementById('val-focus').innerText = db.settings.focus + 'm';
    document.getElementById('val-short').innerText = db.settings.short + 'm';
    document.getElementById('val-long').innerText = db.settings.long + 'm';
    document.getElementById('val-cycles').innerText = db.settings.cycles;

    if (!timerInterval) {
        timeLeft = db.settings.focus * 60;
        updateTimerDisplay();
    }
    save();
}

function updateNightLight() {
    db.settings.night = document.getElementById('cfg-night').checked;
    document.getElementById('night-overlay').style.display = db.settings.night ? 'block' : 'none';
    save();
}

function save() { localStorage.setItem('escapex_db', JSON.stringify(db)); }

function loadSettings() {
    document.getElementById('cfg-focus').value = db.settings.focus;
    document.getElementById('cfg-short').value = db.settings.short;
    document.getElementById('cfg-long').value = db.settings.long;
    document.getElementById('cfg-cycles').value = db.settings.cycles;
    document.getElementById('cfg-autostart').checked = db.settings.autostart;
    document.getElementById('cfg-night').checked = db.settings.night;
    updateNightLight();
}

function toggleModal(id) {
    const modal = document.getElementById(id);
    modal.classList.toggle('hidden');
}
