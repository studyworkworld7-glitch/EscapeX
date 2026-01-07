/**
 * EscapeX | By RudX v6.0
 */

const CLIENT_ID = '445613530144-8nca3h64lackcrmkd3joge3cv7ir91uu.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/tasks https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/userinfo.profile';
const DISCOVERY_DOCS = [
    'https://www.googleapis.com/discovery/v1/apis/tasks/v1/rest',
    'https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest'
];

let tokenClient, gapiInited = false, userProfile = null;
let breathInterval = null, timerInterval = null, noiseNode = null;
let timeLeft = 1500, isWork = true, breathCount = 5;

let db = JSON.parse(localStorage.getItem('escapex_db')) || { 
    history: [], tasks: [], settings: { focus: 25, short: 5 } 
};

// --- NAVIGATION ---
function show(id) {
    if (breathInterval) { clearInterval(breathInterval); breathInterval = null; }
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById('n-' + id).classList.add('active');

    if (id === 'tasks') { refreshTasks(); refreshCalendar(); }
    if (id === 'stats') renderStats();
    lucide.createIcons();
}

// --- FULLSCREEN ---
function toggleFullscreen() {
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen();
        else if (document.documentElement.webkitRequestFullscreen) document.documentElement.webkitRequestFullscreen();
    } else {
        if (document.exitFullscreen) document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    }
}

// --- TIMER & AUTO-FULLSCREEN ---
function toggleTimer() {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    
    if (timerInterval) {
        clearInterval(timerInterval); 
        timerInterval = null;
        document.getElementById('main-btn').innerText = "Resume Flow";
        document.body.classList.remove('locked');
    } else {
        // AUTOMATIC FULLSCREEN ON ENTERING FLOW
        if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen();
        
        document.body.classList.add('locked');
        document.getElementById('main-btn').innerText = "Locked In";
        timerInterval = setInterval(() => {
            if (timeLeft > 0) { timeLeft--; updateTimerDisplay(); } 
            else { handleCycleComplete(); }
        }, 1000);
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

// --- CALENDAR & TASKS ---
async function refreshCalendar() {
    if (!userProfile || !gapiInited) return;
    try {
        const response = await gapi.client.calendar.events.list({
            'calendarId': 'primary', 'timeMin': (new Date()).toISOString(),
            'showDeleted': false, 'singleEvents': true, 'maxResults': 5, 'orderBy': 'startTime'
        });
        const events = response.result.items;
        const container = document.getElementById('calendar-list');
        container.innerHTML = events.map(e => {
            const start = new Date(e.start.dateTime || e.start.date);
            return `<div class="glass p-4 border-l-2 border-white/20 flex justify-between items-center opacity-70">
                <div><p class="text-sm font-light">${e.summary}</p><p class="text-[9px] opacity-40 uppercase">${start.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</p></div>
                <i data-lucide="calendar" class="w-3 opacity-20"></i></div>`;
        }).join('') || '<p class="text-[10px] opacity-20 uppercase">Clear Schedule</p>';
        lucide.createIcons();
    } catch (e) { console.error(e); }
}

async function refreshTasks() {
    if (!userProfile || !gapiInited) { renderTasks(); return; }
    try {
        const resp = await gapi.client.tasks.tasks.list({ tasklist: '@default' });
        db.tasks = resp.result.items || [];
        renderTasks();
    } catch(e) { console.error(e); }
}

function renderTasks() {
    const list = document.getElementById('task-list');
    list.innerHTML = db.tasks.map(t => `<div class="glass p-4 rounded-xl flex justify-between items-center">
        <span class="text-sm font-light">${t.title}</span>
        <button onclick="completeTask('${t.id}')" class="w-6 h-6 border border-white/10 rounded-full flex items-center justify-center"><i data-lucide="check" class="w-3"></i></button>
    </div>`).join('') || '<p class="text-[10px] opacity-20 uppercase">No Tasks</p>';
    lucide.createIcons();
}

// --- AUDIO SYNTH (Distinct) ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function setAudio(type) {
    stopAudio(); audioCtx.resume();
    const bufferSize = audioCtx.sampleRate * 2;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);

    let lastOut = 0; // For brown noise filter
    for (let i = 0; i < bufferSize; i++) {
        let white = Math.random() * 2 - 1;
        if (type === 'white') data[i] = white * 0.05;
        else if (type === 'brown') {
            data[i] = (lastOut + (0.02 * white)) / 1.02;
            lastOut = data[i];
            data[i] *= 3.5;
        } else if (type === 'tick') {
            data[i] = (i % (audioCtx.sampleRate) < 150) ? Math.random() * 0.1 : 0;
        }
    }
    noiseNode = audioCtx.createBufferSource();
    noiseNode.buffer = buffer; noiseNode.loop = true;
    noiseNode.connect(audioCtx.destination); noiseNode.start();
    document.getElementById('a-' + type).classList.add('active');
}

function stopAudio() { 
    if (noiseNode) { noiseNode.stop(); noiseNode = null; }
    document.querySelectorAll('.sound-btn').forEach(b => b.classList.remove('active'));
}

// --- UTILS ---
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
function adjBreath(v) { breathCount = Math.max(1, breathCount + v); document.getElementById('breath-count').innerText = breathCount; }
function renderStats() { document.getElementById('stat-total').innerText = (db.history.reduce((a, b) => a + (b.mins || 0), 0) / 60).toFixed(1) + 'h'; }

window.onload = () => {
    gapi.load('client', async () => {
        await gapi.client.init({ discoveryDocs: DISCOVERY_DOCS });
        gapiInited = true;
    });
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID, scope: SCOPES,
        callback: (resp) => {
            fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${resp.access_token}` }})
            .then(r => r.json()).then(data => { userProfile = data; updateAuthUI(data); });
        }
    });
    lucide.createIcons();
};

function updateAuthUI(data) {
    document.getElementById('profile-name').innerText = data.name;
    document.getElementById('profile-img').innerHTML = `<img src="${data.picture}" class="w-full h-full object-cover">`;
    document.getElementById('auth-box').classList.add('hidden');
    refreshTasks(); refreshCalendar();
}
