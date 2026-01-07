/**
 * EscapeX | By RudX
 * Final Unified Script v3.0
 */

// --- CONFIGURATION ---
const CLIENT_ID = '445613530144-8nca3h64lackcrmkd3joge3cv7ir91uu.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/tasks https://www.googleapis.com/auth/userinfo.profile';
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/tasks/v1/rest';

// --- STATE ---
let tokenClient;
let gapiInited = false;
let userProfile = null;
let breathInterval = null;
let breathCount = 5;
let timerInterval = null;
let timeLeft = 1500;
let isWork = true;
let noiseNode = null;

let db = JSON.parse(localStorage.getItem('escapex_db')) || { 
    history: [], 
    tasks: [], 
    settings: { focus: 25, short: 5 } 
};

// --- CORE SYSTEM & NAVIGATION ---
function show(id) {
    // 1. Cleanup Active Rituals (Stops the "everywhere I go" bug)
    if (breathInterval) {
        clearInterval(breathInterval);
        breathInterval = null;
        const ring = document.getElementById('zen-ring');
        const btn = document.getElementById('zen-btn');
        const txt = document.getElementById('zen-text');
        if (ring) ring.className = 'w-64 h-64 rounded-full border border-white/5 flex items-center justify-center';
        if (btn) btn.style.display = 'block';
        if (txt) txt.innerText = "Ready";
    }

    // 2. Switch View Visibility
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const target = document.getElementById(id);
    if (target) target.classList.add('active');
    
    // 3. Update Navigation UI
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const navBtn = document.getElementById('n-' + id);
    if (navBtn) navBtn.classList.add('active');

    // 4. Trigger View-Specific Logic
    if (id === 'stats') renderStats();
    if (id === 'tasks') refreshTasks();
    
    lucide.createIcons();
}

function toggleFullscreen() {
    const elem = document.documentElement;
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        if (elem.requestFullscreen) elem.requestFullscreen();
        else if (elem.webkitRequestFullscreen) elem.webkitRequestFullscreen(); // Safari
        document.getElementById('fs-icon').setAttribute('data-lucide', 'minimize');
    } else {
        if (document.exitFullscreen) document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen(); // Safari
        document.getElementById('fs-icon').setAttribute('data-lucide', 'maximize');
    }
    lucide.createIcons();
}

// --- GOOGLE AUTH & TASKS ---
function handleAuthClick() { 
    tokenClient.requestAccessToken({prompt: 'consent'}); 
}

function handleSignoutClick() {
    const token = gapi.client.getToken();
    if (token) {
        google.accounts.oauth2.revoke(token.access_token);
        gapi.client.setToken('');
        userProfile = null;
        location.reload();
    }
}

function updateAuthUI(data) {
    userProfile = data;
    document.getElementById('profile-name').innerText = data.name || "Operator";
    document.getElementById('profile-img').innerHTML = `<img src="${data.picture}" class="w-full h-full object-cover">`;
    document.getElementById('auth-box').classList.add('hidden');
    document.getElementById('signout-btn').classList.remove('hidden');
    
    // Update Profile section in Stats
    document.getElementById('auth-name').innerText = data.name;
    document.getElementById('auth-sub').innerText = "Cloud Sync Active";
    document.getElementById('auth-pfp').innerHTML = `<img src="${data.picture}" class="w-full h-full rounded-full">`;
    
    refreshTasks();
}

async function refreshTasks() {
    if (!userProfile || !gapiInited) { renderTasks(); return; }
    try {
        const resp = await gapi.client.tasks.tasks.list({ tasklist: '@default' });
        db.tasks = resp.result.items || [];
        renderTasks();
    } catch(e) { console.error("Sync Error", e); }
}

async function addTask() {
    const input = document.getElementById('task-in');
    const title = input.value.trim();
    if (!title) return;

    if (userProfile && gapiInited) {
        await gapi.client.tasks.tasks.insert({ tasklist: '@default', resource: {title} });
        refreshTasks();
    } else {
        db.tasks.push({id: Date.now().toString(), title, status: 'needsAction'});
        renderTasks();
    }
    input.value = '';
    save();
}

function renderTasks() {
    const list = document.getElementById('task-list');
    if (db.tasks.length === 0) {
        list.innerHTML = `<p class="text-center opacity-20 text-[10px] uppercase mt-10">No Objectives Set</p>`;
        return;
    }
    list.innerHTML = db.tasks.map(t => `
        <div class="glass p-5 rounded-xl flex justify-between items-center animate-fade-in">
            <span class="text-sm font-light">${t.title}</span>
            <button onclick="completeTask('${t.id}')" class="w-8 h-8 rounded-full border border-white/10 flex items-center justify-center hover:bg-white hover:text-black transition">
                <i data-lucide="check" class="w-4"></i>
            </button>
        </div>
    `).join('');
    lucide.createIcons();
}

async function completeTask(id) {
    if (userProfile && gapiInited) {
        try { await gapi.client.tasks.tasks.delete({ tasklist: '@default', task: id }); } catch(e){}
    }
    db.tasks = db.tasks.filter(t => t.id != id);
    renderTasks();
    save();
}

// --- TIMER ENGINE ---
function updateConfigUI() {
    db.settings.focus = parseInt(document.getElementById('cfg-focus').value);
    db.settings.short = parseInt(document.getElementById('cfg-short').value);
    document.getElementById('val-focus').innerText = db.settings.focus + 'm';
    document.getElementById('val-short').innerText = db.settings.short + 'm';
    if (!timerInterval) resetTimer();
    save();
}

function resetTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
    timeLeft = (isWork ? db.settings.focus : db.settings.short) * 60;
    updateTimerDisplay();
}

function toggleTimer() {
    if (audioCtx.state === 'suspended') audioCtx.resume();

    if (timerInterval) {
        clearInterval(timerInterval); 
        timerInterval = null;
        document.getElementById('main-btn').innerText = "Resume Flow";
        document.body.classList.remove('locked');
    } else {
        document.body.classList.add('locked'); // Zen mode auto-hide UI
        document.getElementById('main-btn').innerText = "Locked In";
        timerInterval = setInterval(() => {
            if (timeLeft > 0) {
                timeLeft--; 
                updateTimerDisplay();
            } else {
                handleCycleComplete();
            }
        }, 1000);
    }
}

function handleCycleComplete() {
    clearInterval(timerInterval);
    timerInterval = null;
    if (isWork) {
        db.history.push({date: new Date().toISOString().split('T')[0], mins: db.settings.focus});
    }
    isWork = !isWork;
    document.getElementById('session-type').innerText = isWork ? "Deep Work Mode" : "Rest & Recover";
    resetTimer();
    document.body.classList.remove('locked');
    save();
    alert(isWork ? "Focus time! Back to work." : "Session complete. Take a break.");
}

function updateTimerDisplay() {
    const m = Math.floor(timeLeft/60), s = timeLeft%60;
    document.getElementById('timer-display').innerText = `${m}:${s<10?'0':''}${s}`;
    const total = (isWork ? db.settings.focus : db.settings.short) * 60;
    document.getElementById('progress').style.strokeDashoffset = 942 - (942 * (1 - timeLeft / total));
}

function toggleTimerSettings() { 
    document.getElementById('timer-settings').classList.toggle('hidden'); 
}

// --- ZEN BREATHING ---
function adjBreath(v) { 
    breathCount = Math.max(1, breathCount + v); 
    document.getElementById('breath-count').innerText = breathCount; 
}

function startZen() {
    const ring = document.getElementById('zen-ring');
    const txt = document.getElementById('zen-text');
    const btn = document.getElementById('zen-btn');
    
    btn.style.display = 'none';
    let cycle = 0, step = 0;
    const steps = ["Inhale", "Hold", "Exhale", "Hold"];

    if (breathInterval) clearInterval(breathInterval);

    breathInterval = setInterval(() => {
        txt.innerText = steps[step];
        ring.className = `w-64 h-64 rounded-full border border-white/5 flex items-center justify-center transition-all duration-[4000ms] ${
            step === 0 ? 'inhale' : (step === 2 ? 'exhale' : '')
        }`;

        step++;
        if (step > 3) { step = 0; cycle++; }

        if (cycle >= breathCount) {
            clearInterval(breathInterval);
            breathInterval = null;
            txt.innerText = "Done";
            btn.style.display = 'block';
            ring.className = 'w-64 h-64 rounded-full border border-white/5 flex items-center justify-center';
        }
    }, 4000);
}

// --- AUDIO & ANALYTICS ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function setAudio(t) {
    stopAudio();
    audioCtx.resume();
    const bufferSize = 2 * audioCtx.sampleRate;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const output = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) output[i] = (Math.random() * 2 - 1) * 0.05;

    noiseNode = audioCtx.createBufferSource();
    noiseNode.buffer = buffer;
    noiseNode.loop = true;
    noiseNode.connect(audioCtx.destination);
    noiseNode.start();
    document.getElementById('a-'+t).classList.add('active');
}

function stopAudio() { 
    if (noiseNode) { noiseNode.stop(); noiseNode = null; } 
    document.querySelectorAll('.sound-btn').forEach(b => b.classList.remove('active')); 
}

function renderStats() {
    const totalMins = db.history.reduce((a, b) => a + (b.mins || 0), 0);
    document.getElementById('stat-total').innerText = (totalMins/60).toFixed(1) + 'h';
    
    // Calculate Streak
    let streak = 0;
    const dates = db.history.map(h => h.date);
    const uniqueDates = [...new Set(dates)].sort().reverse();
    // Simple streak check
    let today = new Date().toISOString().split('T')[0];
    if (uniqueDates.includes(today)) {
        streak = uniqueDates.length; // Simplified for this build
    }
    document.getElementById('stat-streak').innerText = streak;

    const container = document.getElementById('graph-container');
    container.innerHTML = '';
    for (let i=0; i<7; i++) {
        const bar = document.createElement('div');
        bar.className = 'flex-1 bg-white/10 rounded-t-sm transition-all duration-1000';
        const h = Math.floor(Math.random() * 70) + 10;
        setTimeout(() => bar.style.height = h + '%', 100);
        container.appendChild(bar);
    }
}

function save() { 
    localStorage.setItem('escapex_db', JSON.stringify(db)); 
}

// --- INIT ON LOAD ---
window.onload = () => {
    gapi.load('client', async () => {
        await gapi.client.init({ discoveryDocs: [DISCOVERY_DOC] });
        gapiInited = true;
    });

    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: (resp) => {
            if (resp.access_token) {
                fetch('https://www.googleapis.com/oauth2/v3/userinfo', { 
                    headers: { Authorization: `Bearer ${resp.access_token}` }
                })
                .then(r => r.json())
                .then(data => updateAuthUI(data));
            }
        }
    });

    updateConfigUI();
    lucide.createIcons();
};
