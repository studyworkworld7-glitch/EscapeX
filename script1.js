const CLIENT_ID = '445613530144-8nca3h64lackcrmkd3joge3cv7ir91uu.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/tasks https://www.googleapis.com/auth/calendar.events.readonly';

let timeLeft, timerInterval, noiseNode, tokenClient, chartObj = null, currentToken = null;
let db = JSON.parse(localStorage.getItem('escapex_db')) || { 
    history: [], 
    settings: { focus: 25, night: false } 
};

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const gainNode = audioCtx.createGain(); gainNode.connect(audioCtx.destination);

// --- NAVIGATION & GLOW FIX ---
function show(id) {
    // Reset Views
    document.querySelectorAll('.view').forEach(v => {
        v.classList.remove('active');
        v.style.display = 'none';
    });
    
    // Reset Nav Glow
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

    // Activate Selected
    const target = document.getElementById(id);
    target.style.display = 'flex';
    setTimeout(() => target.classList.add('active'), 50);
    
    document.getElementById('nav-' + id).classList.add('active');

    // Contextual Refresh
    if (id === 'tasks') { refreshTasks(); refreshCalendar(); }
    if (id === 'stats') renderChart();
    if (id === 'galaxy') renderGalaxy();
    lucide.createIcons();
}

// --- LOGOUT & AUTH ---
function logout() { localStorage.clear(); window.location.reload(); }

function initAuth() {
    if (typeof google === 'undefined') return setTimeout(initAuth, 100);
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID, scope: SCOPES,
        callback: (r) => { 
            currentToken = r.access_token; 
            localStorage.setItem('escapex_token', currentToken);
            fetchUserInfo(); 
        }
    });
}

function fetchUserInfo() {
    fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${currentToken}` }})
        .then(r => r.json()).then(data => {
            localStorage.setItem('escapex_profile', JSON.stringify(data));
            renderUserUI(data);
        });
}

function renderUserUI(d) {
    document.getElementById('profile-name').innerText = d.name;
    document.getElementById('profile-img').innerHTML = `<img src="${d.picture}" class="w-full h-full object-cover">`;
    document.getElementById('logout-btn').classList.remove('hidden');
    document.getElementById('auth-box').innerHTML = `<p class="text-green-500 text-[10px] uppercase font-bold tracking-widest">Cloud Sync Active</p>`;
}

function handleAuthClick() { tokenClient.requestAccessToken({prompt: 'consent'}); }

// --- TIMER & AUTO FULLSCREEN ---
function toggleTimer() {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    
    if (!timerInterval) {
        // Auto Fullscreen
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => console.log("FS Blocked"));
        }
        
        document.body.classList.add('locked');
        document.getElementById('main-btn').innerText = "Locked In";
        timerInterval = setInterval(() => {
            if (timeLeft > 0) { timeLeft--; updateTimerDisplay(); }
            else { 
                db.history.push({ date: new Date().toISOString(), mins: db.settings.focus });
                save(); clearInterval(timerInterval); timerInterval = null;
                alert("Session Complete"); updateConfigUI(); 
            }
        }, 1000);
    } else {
        clearInterval(timerInterval); timerInterval = null;
        document.getElementById('main-btn').innerText = "Resume Flow";
        document.body.classList.remove('locked');
    }
}

// --- IMPROVED GRAPH ---

function renderChart() {
    const canvas = document.getElementById('statChart');
    if (chartObj) chartObj.destroy();
    
    const labels = []; const dataPoints = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        labels.push(d.toLocaleDateString([], { weekday: 'short' }));
        const mins = db.history.filter(h => new Date(h.date).toDateString() === d.toDateString())
                               .reduce((sum, h) => sum + h.mins, 0);
        dataPoints.push(mins / 60);
    }

    const total = dataPoints.reduce((a, b) => a + b, 0).toFixed(1);
    document.getElementById('total-hrs').innerText = total + " HRS";

    chartObj = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
            labels,
            datasets: [{ data: dataPoints, borderColor: 'white', tension: 0.4, pointRadius: 0, borderWidth: 1.5, fill: true, backgroundColor: 'rgba(255,255,255,0.05)' }]
        },
        options: {
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { 
                y: { display: false, beginAtZero: true }, 
                x: { grid: { display: false }, ticks: { color: 'rgba(255,255,255,0.2)', font: { size: 8 } } } 
            }
        }
    });
}

// --- TASK CRUD ---
async function refreshTasks() {
    if (!currentToken) return;
    const resp = await fetch('https://www.googleapis.com/tasks/v1/lists/@default/tasks', { headers: { Authorization: `Bearer ${currentToken}` }});
    const data = await resp.json();
    document.getElementById('task-list').innerHTML = (data.items || []).map(t => `
        <div class="glass p-4 flex justify-between items-center group">
            <span class="text-sm font-light ${t.status === 'completed' ? 'line-through opacity-20' : ''}">${t.title}</span>
            <button onclick="deleteTask('${t.id}')" class="opacity-0 group-hover:opacity-40 transition-opacity"><i data-lucide="trash-2" class="w-3"></i></button>
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

async function deleteTask(id) {
    await fetch(`https://www.googleapis.com/tasks/v1/lists/@default/tasks/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${currentToken}` }});
    refreshTasks();
}

async function refreshCalendar() {
    if (!currentToken) return;
    const resp = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${new Date().toISOString()}&maxResults=3&singleEvents=true&orderBy=startTime`, { headers: { Authorization: `Bearer ${currentToken}` }});
    const data = await resp.json();
    document.getElementById('calendar-list').innerHTML = (data.items || []).map(e => `
        <div class="glass p-4 opacity-40 text-xs flex justify-between">
            <span>${e.summary}</span>
            <span class="font-mono">${new Date(e.start.dateTime || e.start.date).getHours()}:00</span>
        </div>`).join('');
}

// --- GALAXY ---
function renderGalaxy() {
    const c = document.getElementById('galaxy-canvas'); const ctx = c.getContext('2d');
    c.width = window.innerWidth; c.height = window.innerHeight;
    const totalMins = db.history.reduce((a, b) => a + b.mins, 0);
    const count = Math.floor(totalMins / 15);
    document.getElementById('galaxy-count').innerText = count;
    ctx.clearRect(0,0,c.width,c.height);
    for(let i=0; i<count; i++) {
        ctx.fillStyle = "white"; ctx.beginPath();
        ctx.arc(Math.random()*c.width, Math.random()*c.height, Math.random()*1.5, 0, Math.PI*2); ctx.fill();
    }
}

// --- CORE UTILS ---
function updateTimerDisplay() {
    const m = Math.floor(timeLeft/60), s = timeLeft%60;
    document.getElementById('timer-display').innerText = `${m}:${s < 10 ? '0' : ''}${s}`;
    document.getElementById('progress').style.strokeDashoffset = 1000 - (1000 * (timeLeft / (db.settings.focus * 60)));
}

function updateConfigUI() {
    db.settings.focus = parseInt(document.getElementById('cfg-focus').value);
    document.getElementById('val-focus').innerText = db.settings.focus + 'm';
    timeLeft = db.settings.focus * 60; updateTimerDisplay(); save();
}

function updateNightLight() {
    db.settings.night = document.getElementById('cfg-night').checked;
    document.getElementById('night-overlay').style.display = db.settings.night ? 'block' : 'none'; save();
}

function setAudio(type) {
    if (noiseNode) noiseNode.stop();
    if (type === 'none') return;
    const buffer = audioCtx.createBuffer(1, audioCtx.sampleRate * 2, audioCtx.sampleRate);
    const d = buffer.getChannelData(0);
    for(let i=0; i<buffer.length; i++) d[i] = (Math.random()*2-1) * 0.05;
    noiseNode = audioCtx.createBufferSource(); noiseNode.buffer = buffer; noiseNode.loop = true;
    noiseNode.connect(gainNode); noiseNode.start();
}

function toggleModal(id) { document.getElementById(id).classList.toggle('hidden'); }
function save() { localStorage.setItem('escapex_db', JSON.stringify(db)); }
window.onload = () => { initAuth(); updateConfigUI(); lucide.createIcons(); const s = localStorage.getItem('escapex_profile'); if(s) renderUserUI(JSON.parse(s)); };
