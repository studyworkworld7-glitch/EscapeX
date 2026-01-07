const CLIENT_ID = '445613530144-8nca3h64lackcrmkd3joge3cv7ir91uu.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/tasks';

let tokenClient, gapiInited = false, userProfile = null;
let db = JSON.parse(localStorage.getItem('escapex_db')) || { 
    history: [], tasks: [], settings: { focus: 25, short: 5 } 
};

// --- CORE SYSTEM ---
function show(id) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById('n-'+id).classList.add('active');
    if(id === 'stats') renderStats();
    if(id === 'tasks') renderTasks();
    lucide.createIcons();
}

function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
        document.getElementById('fs-icon').setAttribute('data-lucide', 'minimize');
    } else {
        document.exitFullscreen();
        document.getElementById('fs-icon').setAttribute('data-lucide', 'maximize');
    }
    lucide.createIcons();
}

// --- AUTH & GOOGLE TASKS ---
function handleAuthClick() { tokenClient.requestAccessToken({prompt: 'consent'}); }

function updateAuthUI(data) {
    userProfile = data;
    document.getElementById('profile-name').innerText = data.name;
    document.getElementById('profile-img').innerHTML = `<img src="${data.picture}" class="w-full h-full object-cover">`;
    document.getElementById('auth-box').classList.add('hidden');
    document.getElementById('signout-btn').classList.remove('hidden');
    refreshTasks();
}

async function refreshTasks() {
    if(!userProfile) return;
    const resp = await gapi.client.tasks.tasks.list({ tasklist: '@default' });
    db.tasks = resp.result.items || [];
    renderTasks();
}

async function addTask() {
    const title = document.getElementById('task-in').value;
    if(!title) return;
    if(userProfile) {
        await gapi.client.tasks.tasks.insert({ tasklist: '@default', resource: {title} });
        refreshTasks();
    } else {
        db.tasks.push({id: Date.now(), title, status: 'needsAction'});
        renderTasks();
    }
    document.getElementById('task-in').value = '';
    save();
}

function renderTasks() {
    const list = document.getElementById('task-list');
    list.innerHTML = db.tasks.map(t => `
        <div class="glass p-5 rounded-xl flex justify-between items-center animate-fade-in">
            <span class="text-sm font-light">${t.title}</span>
            <button onclick="completeTask('${t.id}')" class="w-6 h-6 rounded-full border border-white/20 flex items-center justify-center hover:bg-white hover:text-black transition">
                <i data-lucide="check" class="w-3"></i>
            </button>
        </div>
    `).join('');
    lucide.createIcons();
}

async function completeTask(id) {
    if(userProfile) await gapi.client.tasks.tasks.delete({ tasklist: '@default', task: id });
    db.tasks = db.tasks.filter(t => t.id != id);
    renderTasks();
    save();
}

// --- TIMER ENGINE ---
let timeLeft = 1500, timerInterval = null, isWork = true;

function updateConfigUI() {
    db.settings.focus = document.getElementById('cfg-focus').value;
    db.settings.short = document.getElementById('cfg-short').value;
    document.getElementById('val-focus').innerText = db.settings.focus + 'm';
    document.getElementById('val-short').innerText = db.settings.short + 'm';
    if(!timerInterval) resetTimer();
    save();
}

function resetTimer() {
    timeLeft = (isWork ? db.settings.focus : db.settings.short) * 60;
    updateTimerDisplay();
}

function toggleTimer() {
    if(timerInterval) {
        clearInterval(timerInterval); timerInterval = null;
        document.getElementById('main-btn').innerText = "Resume Flow";
        document.body.classList.remove('locked');
    } else {
        document.body.classList.add('locked'); // ZEN MODE ON
        document.getElementById('main-btn').innerText = "Locked In";
        timerInterval = setInterval(() => {
            timeLeft--; updateTimerDisplay();
            if(timeLeft <= 0) {
                if(isWork) db.history.push({date: new Date().toISOString().split('T')[0], mins: parseInt(db.settings.focus)});
                isWork = !isWork;
                resetTimer(); toggleTimer();
                save();
            }
        }, 1000);
    }
}

function updateTimerDisplay() {
    const m = Math.floor(timeLeft/60), s = timeLeft%60;
    document.getElementById('timer-display').innerText = `${m}:${s<10?'0':''}${s}`;
    document.getElementById('progress').style.strokeDashoffset = 942 - (942 * (timeLeft / (isWork?db.settings.focus*60 : db.settings.short*60)));
}

function toggleTimerSettings() { document.getElementById('timer-settings').classList.toggle('hidden'); }

// --- ZEN BREATHING ---
let breathCount = 5;
function adjBreath(v) { breathCount = Math.max(1, breathCount + v); document.getElementById('breath-count').innerText = breathCount; }
function startZen() {
    const ring = document.getElementById('zen-ring'), txt = document.getElementById('zen-text'), btn = document.getElementById('zen-btn');
    btn.style.display = 'none';
    let cycle = 0, step = 0;
    const steps = ["Inhale", "Hold", "Exhale", "Hold"];
    const interval = setInterval(() => {
        txt.innerText = steps[step];
        ring.className = `w-64 h-64 rounded-full border border-white/5 flex items-center justify-center transition-all duration-[4000ms] ${step === 0 ? 'inhale' : (step === 2 ? 'exhale' : '')}`;
        step++;
        if(step > 3) { step = 0; cycle++; }
        if(cycle >= breathCount) { clearInterval(interval); txt.innerText = "Done"; btn.style.display = 'block'; }
    }, 4000);
}

// --- AUDIO & STATS ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let noise = null;
function setAudio(t) {
    stopAudio(); audioCtx.resume();
    const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * 2, audioCtx.sampleRate), out = buf.getChannelData(0);
    for(let i=0; i<buf.length; i++) out[i] = (Math.random()*2-1) * (t === 'white' ? 0.05 : 0.1);
    noise = audioCtx.createBufferSource(); noise.buffer = buf; noise.loop = true;
    noise.connect(audioCtx.destination); noise.start();
    document.getElementById('a-'+t).classList.add('active');
}
function stopAudio() { if(noise) noise.stop(); document.querySelectorAll('.sound-btn').forEach(b => b.classList.remove('active')); }

function renderStats() {
    const total = db.history.reduce((a, b) => a + b.mins, 0);
    document.getElementById('stat-total').innerText = (total/60).toFixed(1) + 'h';
    // Graph Logic
    const container = document.getElementById('graph-container');
    container.innerHTML = '';
    for(let i=0; i<7; i++) {
        const bar = document.createElement('div');
        bar.className = 'flex-1 bg-white/10 rounded-t-sm';
        bar.style.height = (Math.random()*100)+'%'; // Replace with real daily filter logic
        container.appendChild(bar);
    }
}

function save() { localStorage.setItem('escapex_db', JSON.stringify(db)); }

window.onload = () => {
    gapi.load('client', () => {
        gapi.client.init({ discoveryDocs: ["https://www.googleapis.com/discovery/v1/apis/tasks/v1/rest"] }).then(() => gapiInited = true);
    });
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID, scope: SCOPES,
        callback: (resp) => {
            fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${resp.access_token}` }})
            .then(r => r.json()).then(data => updateAuthUI(data));
        }
    });
    updateConfigUI();
    lucide.createIcons();
};
