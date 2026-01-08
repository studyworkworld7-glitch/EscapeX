const CLIENT_ID = '445613530144-8nca3h64lackcrmkd3joge3cv7ir91uu.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/tasks https://www.googleapis.com/auth/calendar.events.readonly';

let timeLeft, timerInterval, noiseNode, tokenClient, chartObj = null, currentToken = null;
let db = JSON.parse(localStorage.getItem('escapex_db')) || { 
    history: [], 
    settings: { focus: 25, short: 5, long: 15, cycles: 4, autostart: false, night: false } 
};

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const gainNode = audioCtx.createGain(); gainNode.connect(audioCtx.destination);

window.onload = () => {
    initAuth();
    updateConfigUI();
    lucide.createIcons();
    const saved = localStorage.getItem('escapex_profile');
    if (saved) { renderUser(JSON.parse(saved)); currentToken = localStorage.getItem('escapex_token'); }
};

// --- NAVIGATION & LOGOUT ---
function show(id) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    
    document.getElementById(id).classList.add('active');
    document.getElementById('nav-' + id).classList.add('active');

    if (id === 'tasks') { refreshTasks(); refreshCalendar(); }
    if (id === 'stats') renderChart();
    if (id === 'galaxy') renderGalaxy();
}

function logout() { localStorage.clear(); window.location.reload(); }

// --- AUTH ---
function initAuth() {
    if (typeof google === 'undefined') return setTimeout(initAuth, 100);
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID, scope: SCOPES,
        callback: (r) => { currentToken = r.access_token; localStorage.setItem('escapex_token', currentToken); fetchUser(); }
    });
}
function fetchUser() {
    fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${currentToken}` }})
        .then(r => r.json()).then(data => { localStorage.setItem('escapex_profile', JSON.stringify(data)); renderUser(data); });
}
function renderUser(d) {
    document.getElementById('profile-name').innerText = d.name;
    document.getElementById('profile-img').innerHTML = `<img src="${d.picture}" class="w-full h-full object-cover">`;
    document.getElementById('logout-btn').classList.remove('hidden');
    document.getElementById('auth-box').innerHTML = `<p class="text-green-500 text-[10px] uppercase font-bold">Cloud Synced</p>`;
}
function handleAuthClick() { tokenClient.requestAccessToken({prompt: 'consent'}); }

// --- TIMER & FULLSCREEN ---
function toggleTimer() {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    if (!timerInterval) {
        if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(()=>{});
        document.body.classList.add('locked');
        document.getElementById('main-btn').innerText = "Locked In";
        timerInterval = setInterval(() => {
            if (timeLeft > 0) { timeLeft--; updateTimerDisplay(); }
            else { finishCycle(); }
        }, 1000);
    } else {
        clearInterval(timerInterval); timerInterval = null;
        document.getElementById('main-btn').innerText = "Resume Flow";
        document.body.classList.remove('locked');
    }
}

function finishCycle() {
    db.history.push({ date: new Date().toISOString(), mins: db.settings.focus });
    save(); clearInterval(timerInterval); timerInterval = null;
    alert("Cycle Complete");
    updateConfigUI();
}

// --- GRAPH ---

function renderChart() {
    const ctx = document.getElementById('statChart').getContext('2d');
    if (chartObj) chartObj.destroy();
    const labels = []; const data = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        labels.push(d.toLocaleDateString([], { weekday: 'short' }));
        const mins = db.history.filter(h => new Date(h.date).toDateString() === d.toDateString()).reduce((a, b) => a + b.mins, 0);
        data.push(mins / 60);
    }
    chartObj = new Chart(ctx, {
        type: 'line', data: { labels, datasets: [{ data, borderColor: 'white', tension: 0.4, pointRadius: 0 }] },
        options: { maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { display: false }, x: { ticks: { color: 'rgba(255,255,255,0.2)', font: { size: 8 } } } } }
    });
}

// --- GALAXY ---
function renderGalaxy() {
    const c = document.getElementById('galaxy-canvas'); const ctx = c.getContext('2d');
    c.width = window.innerWidth; c.height = window.innerHeight;
    const total = db.history.reduce((a, b) => a + b.mins, 0);
    const count = Math.floor(total / 15);
    document.getElementById('galaxy-count').innerText = count;
    ctx.clearRect(0,0,c.width,c.height);
    for(let i=0; i<count; i++) {
        ctx.fillStyle = "white"; ctx.beginPath();
        ctx.arc(Math.random()*c.width, Math.random()*c.height, Math.random()*1.5, 0, Math.PI*2); ctx.fill();
    }
}

// --- UTILS ---
function updateTimerDisplay() {
    const m = Math.floor(timeLeft/60), s = timeLeft%60;
    document.getElementById('timer-display').innerText = `${m}:${s < 10 ? '0' : ''}${s}`;
    document.getElementById('progress').style.strokeDashoffset = 1000 - (1000 * (timeLeft / (db.settings.focus * 60)));
}
function updateConfigUI() {
    db.settings.focus = parseInt(document.getElementById('cfg-focus').value);
    timeLeft = db.settings.focus * 60; updateTimerDisplay();
}
function updateNightLight() { 
    db.settings.night = document.getElementById('cfg-night').checked;
    document.getElementById('night-overlay').style.display = db.settings.night ? 'block' : 'none'; 
}
function toggleModal(id) { document.getElementById(id).classList.toggle('hidden'); }
function save() { localStorage.setItem('escapex_db', JSON.stringify(db)); }
