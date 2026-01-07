/**
 * EscapeX | By RudX v8.0 (Final Stable)
 */

const CLIENT_ID = '445613530144-8nca3h64lackcrmkd3joge3cv7ir91uu.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/tasks https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/userinfo.profile';
const DISCOVERY_DOCS = [
    'https://www.googleapis.com/discovery/v1/apis/tasks/v1/rest',
    'https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest'
];

let tokenClient, gapiInited = false, userProfile = null, currentToken = null;
let breathInterval = null, timerInterval = null, noiseNode = null;
let timeLeft = 1500, isWork = true;

let db = JSON.parse(localStorage.getItem('escapex_db')) || { 
    history: [], tasks: [], settings: { focus: 25, short: 5 } 
};

// --- NAVIGATION & CLEANUP ---
function show(id) {
    if (breathInterval) { clearInterval(breathInterval); breathInterval = null; }
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const n = document.getElementById('n-' + id);
    if(n) n.classList.add('active');

    if (id === 'tasks') { refreshTasks(); refreshCalendar(); }
    if (id === 'stats') renderStats();
    lucide.createIcons();
}

function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
    } else {
        document.exitFullscreen();
    }
}

// --- TIMER ENGINE ---
function toggleTimer() {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    if (!timerInterval) {
        toggleFullscreen();
        document.body.classList.add('locked');
        document.getElementById('main-btn').innerText = "Locked In";
        timerInterval = setInterval(() => {
            if (timeLeft > 0) { timeLeft--; updateTimerDisplay(); } 
            else { handleCycleComplete(); }
        }, 1000);
    } else {
        clearInterval(timerInterval);
        timerInterval = null;
        document.getElementById('main-btn').innerText = "Resume Flow";
        document.body.classList.remove('locked');
    }
}

function updateTimerDisplay() {
    const m = Math.floor(timeLeft/60), s = timeLeft%60;
    document.getElementById('timer-display').innerText = `${m}:${s<10?'0':''}${s}`;
    const total = (isWork ? db.settings.focus : db.settings.short) * 60;
    document.getElementById('progress').style.strokeDashoffset = 942 - (942 * (1 - timeLeft / total));
}

function handleCycleComplete() {
    clearInterval(timerInterval);
    timerInterval = null;
    if (isWork) db.history.push({date: new Date().toISOString().split('T')[0], mins: db.settings.focus});
    isWork = !isWork;
    document.getElementById('session-type').innerText = isWork ? "Deep Work Mode" : "Rest & Recover";
    resetTimer();
    document.body.classList.remove('locked');
    save();
}

// --- GOOGLE WORKSPACE SYNC ---
function handleAuthClick() {
    tokenClient.requestAccessToken({prompt: 'consent'});
}

async function refreshCalendar() {
    if (!currentToken) return;
    try {
        const resp = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${new Date().toISOString()}&maxResults=5&singleEvents=true&orderBy=startTime`, {
            headers: { Authorization: `Bearer ${currentToken}` }
        });
        const data = await resp.json();
        const container = document.getElementById('calendar-list');
        container.innerHTML = (data.items || []).map(e => {
            const start = new Date(e.start.dateTime || e.start.date);
            return `<div class="glass p-4 border-l-2 border-white/20 flex justify-between items-center opacity-70">
                <div><p class="text-sm font-light">${e.summary}</p><p class="text-[9px] opacity-40 uppercase">${start.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</p></div>
                <i data-lucide="calendar" class="w-3 opacity-20"></i></div>`;
        }).join('') || '<p class="text-[10px] opacity-20 uppercase text-center mt-4">Clear Schedule</p>';
        lucide.createIcons();
    } catch (e) { console.error(e); }
}

async function refreshTasks() {
    if (!currentToken) return;
    try {
        const resp = await fetch('https://www.googleapis.com/tasks/v1/lists/@default/tasks', {
            headers: { Authorization: `Bearer ${currentToken}` }
        });
        const data = await resp.json();
        db.tasks = data.items || [];
        const list = document.getElementById('task-list');
        list.innerHTML = db.tasks.map(t => `<div class="glass p-4 rounded-xl flex justify-between items-center">
            <span class="text-sm font-light">${t.title}</span>
            <button onclick="completeTask('${t.id}')" class="w-6 h-6 border border-white/10 rounded-full flex items-center justify-center"><i data-lucide="check" class="w-3"></i></button>
        </div>`).join('') || '<p class="text-[10px] opacity-20 uppercase text-center mt-4">No Active Tasks</p>';
        lucide.createIcons();
    } catch (e) { console.error(e); }
}

// --- AUDIO ENGINE ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function setAudio(type) {
    stopAudio();
    const bufferSize = audioCtx.sampleRate * 2;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    let lastOut = 0;

    for (let i = 0; i < bufferSize; i++) {
        let white = Math.random() * 2 - 1;
        if (type === 'white') {
            data[i] = white * 0.05;
        } else if (type === 'brown') {
            data[i] = (lastOut + (0.02 * white)) / 1.02;
            lastOut = data[i];
            data[i] *= 3.5;
        } else if (type === 'tick') {
            const phase = i % audioCtx.sampleRate;
            data[i] = (phase < 150) ? Math.random() * 0.15 : 0;
        }
    }
    noiseNode = audioCtx.createBufferSource();
    noiseNode.buffer = buffer; noiseNode.loop = true;
    noiseNode.connect(audioCtx.destination);
    noiseNode.start();
    document.querySelectorAll('.sound-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('a-' + type).classList.add('active');
}

function stopAudio() { 
    if (noiseNode) { noiseNode.stop(); noiseNode = null; }
    document.querySelectorAll('.sound-btn').forEach(b => b.classList.remove('active'));
}

// --- ZEN RITUAL ---
function startZen() {
    const ring = document.getElementById('zen-ring');
    const txt = document.getElementById('zen-text');
    const btn = document.getElementById('zen-btn');
    btn.style.display = 'none';
    let step = 0;
    const steps = ["Inhale", "Hold", "Exhale", "Hold"];
    breathInterval = setInterval(() => {
        txt.innerText = steps[step];
        ring.style.transform = (step === 0) ? 'scale(1.4)' : (step === 2 ? 'scale(1)' : ring.style.transform);
        ring.style.borderColor = (step === 0) ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.05)';
        step = (step + 1) % 4;
    }, 4000);
}

// --- SYSTEM INIT ---
window.onload = () => {
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: (resp) => {
            currentToken = resp.access_token;
            fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${currentToken}` }})
                .then(r => r.json()).then(data => {
                    userProfile = data;
                    document.getElementById('profile-name').innerText = data.name;
                    document.getElementById('profile-img').innerHTML = `<img src="${data.picture}" class="w-full h-full object-cover">`;
                    document.getElementById('auth-box').innerHTML = `<p class="text-[10px] text-green-500 uppercase tracking-widest">Protocol Synced</p>`;
                    show('focus');
                });
        }
    });
    updateConfigUI();
    lucide.createIcons();
};

function save() { localStorage.setItem('escapex_db', JSON.stringify(db)); }
function resetTimer() { timeLeft = (isWork ? db.settings.focus : db.settings.short) * 60; updateTimerDisplay(); }
function updateConfigUI() {
    db.settings.focus = document.getElementById('cfg-focus').value;
    db.settings.short = document.getElementById('cfg-short').value;
    document.getElementById('val-focus').innerText = db.settings.focus + 'm';
    document.getElementById('val-short').innerText = db.settings.short + 'm';
    resetTimer(); save();
}
function toggleTimerSettings() { document.getElementById('timer-settings').classList.toggle('hidden'); }
function renderStats() { document.getElementById('stat-total').innerText = (db.history.reduce((a, b) => a + (b.mins || 0), 0) / 60).toFixed(1) + 'h'; }
