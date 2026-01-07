const CLIENT_ID = '445613530144-8nca3h64lackcrmkd3joge3cv7ir91uu.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/tasks'; 
// Discovery doc for Tasks API
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/tasks/v1/rest';

// --- STATE MANAGEMENT ---
let tokenClient;
let gapiInited = false;
let userProfile = null;
// Default Data Structure
let db = JSON.parse(localStorage.getItem('escape_db_v2')) || { 
    history: [], // { date: 'YYYY-MM-DD', minutes: 25 }
    settings: { focus: 25, short: 5, long: 15, rounds: 4 },
    amber: false
};

// --- AUTHENTICATION (Lazy Load) ---
function handleProfileClick() {
    if(userProfile) show('stats'); // If logged in, go to stats
    else handleAuthClick(); // Else, try login
}

function handleAuthClick() {
    if(!gapiInited) return;
    tokenClient.requestAccessToken({prompt: 'consent'});
}

function handleSignoutClick() {
    const token = gapi.client.getToken();
    if (token) {
        google.accounts.oauth2.revoke(token.access_token);
        gapi.client.setToken('');
        userProfile = null;
        updateAuthUI();
        renderTasks(); // Clear tasks
    }
}

function updateAuthUI() {
    const img = document.getElementById('profile-img');
    const status = document.getElementById('login-status');
    const statsImg = document.getElementById('stats-img');
    const statsInfo = document.getElementById('stats-info');
    const authBtn = document.getElementById('auth-btn');
    const signoutBtn = document.getElementById('signout-btn');

    if(userProfile) {
        // Logged In State
        img.innerHTML = `<img src="${userProfile.picture}" class="w-full h-full object-cover">`;
        status.innerText = "Online";
        statsImg.src = userProfile.picture;
        statsImg.classList.remove('hidden');
        statsInfo.innerHTML = `<h4 class="text-sm font-bold">${userProfile.name}</h4><p class="text-[10px] opacity-40 uppercase">Sync Active</p>`;
        authBtn.classList.add('hidden');
        signoutBtn.classList.remove('hidden');
        refreshTasks();
    } else {
        // Guest State
        img.innerHTML = `<i data-lucide="user" class="w-4 h-4 opacity-50"></i>`;
        status.innerText = "Guest";
        statsImg.classList.add('hidden');
        statsInfo.innerHTML = `<h4 class="text-sm font-bold">Anonymous</h4><p class="text-[10px] opacity-40 uppercase">Guest Access</p>`;
        authBtn.classList.remove('hidden');
        signoutBtn.classList.add('hidden');
        lucide.createIcons();
    }
}

// --- GOOGLE TASKS LOGIC ---
let localTasks = []; // Store tasks here

async function refreshTasks() {
    if(!userProfile) { renderTasks(); return; }
    try {
        const resp = await gapi.client.tasks.tasks.list({ tasklist: '@default', showCompleted: false, maxResults: 20 });
        localTasks = resp.result.items || [];
        renderTasks();
    } catch(e) { console.error("Task Error", e); }
}

async function addTask() {
    const input = document.getElementById('task-in');
    const title = input.value.trim();
    if(!title) return;
    
    // Optimistic UI Update
    const tempId = 'temp_' + Date.now();
    localTasks.push({ id: tempId, title: title, status: 'needsAction' });
    input.value = '';
    renderTasks();

    if(userProfile) {
        try {
            await gapi.client.tasks.tasks.insert({ tasklist: '@default', resource: { title: title } });
            refreshTasks(); // Sync real ID
        } catch(e) { console.error(e); }
    }
}

async function toggleTask(id, currentStatus) {
    // Find task locally
    const task = localTasks.find(t => t.id === id);
    if(task) task.status = 'completed'; // Hide immediately
    renderTasks();

    if(userProfile) {
        try {
            await gapi.client.tasks.tasks.update({ 
                tasklist: '@default', task: id, 
                id: id, status: 'completed' 
            });
            setTimeout(refreshTasks, 500);
        } catch(e) { console.error(e); }
    } else {
        // Guest mode delete
        localTasks = localTasks.filter(t => t.id !== id);
        renderTasks();
    }
}

async function deleteTask(id) {
    localTasks = localTasks.filter(t => t.id !== id);
    renderTasks();
    if(userProfile) {
        try { await gapi.client.tasks.tasks.delete({ tasklist: '@default', task: id }); } catch(e){}
    }
}

function renderTasks() {
    const list = document.getElementById('task-list');
    if(!userProfile && localTasks.length === 0) {
        list.innerHTML = `<div class="text-center opacity-30 text-[10px] uppercase tracking-widest mt-10">Sync Google Account to manage cloud tasks<br>or type to add local tasks</div>`;
        return;
    }
    
    // Filter out completed for cleaner look
    const activeTasks = localTasks.filter(t => t.status !== 'completed');
    
    list.innerHTML = activeTasks.map(t => `
        <div class="glass p-4 flex justify-between items-center group animate-fade-in">
            <span class="font-mono text-sm">${t.title}</span>
            <div class="flex gap-3 opacity-0 group-hover:opacity-100 transition">
                <button onclick="toggleTask('${t.id}', '${t.status}')"><i data-lucide="check" class="w-4 hover:text-green-400"></i></button>
                <button onclick="deleteTask('${t.id}')"><i data-lucide="trash-2" class="w-4 hover:text-red-400"></i></button>
            </div>
        </div>
    `).join('');
    lucide.createIcons();
}

// --- TIMER & ZEN MODE ---
let timeLeft = 1500, totalTime = 1500, timerId = null;
let isWork = true;

function toggleTimerSettings() {
    const el = document.getElementById('timer-settings');
    el.classList.toggle('hidden');
}

function updateConfigUI() {
    db.settings.focus = parseInt(document.getElementById('cfg-focus').value);
    db.settings.short = parseInt(document.getElementById('cfg-short').value);
    db.settings.long = parseInt(document.getElementById('cfg-long').value);
    
    document.getElementById('val-focus').innerText = db.settings.focus + 'm';
    document.getElementById('val-short').innerText = db.settings.short + 'm';
    document.getElementById('val-long').innerText = db.settings.long + 'm';
    
    if(!timerId) resetTimer();
    localStorage.setItem('escape_db_v2', JSON.stringify(db));
}

function resetTimer() {
    clearInterval(timerId); timerId = null;
    isWork = true;
    totalTime = timeLeft = db.settings.focus * 60;
    updateTimerDisplay();
    document.getElementById('main-btn').innerText = "Initialize Flow";
    document.getElementById('session-type').innerText = "Ready to Lock In";
    document.body.classList.remove('zen-active');
}

function toggleTimer() {
    if(timerId) {
        // Pause
        clearInterval(timerId); timerId = null;
        document.getElementById('main-btn').innerText = "Resume";
        document.body.classList.remove('zen-active');
    } else {
        // Start
        document.getElementById('main-btn').innerText = "Focus Active";
        document.body.classList.add('zen-active'); // Hides Navbar
        if (audioCtx.state === 'suspended') audioCtx.resume();
        
        timerId = setInterval(() => {
            timeLeft--;
            updateTimerDisplay();
            if(timeLeft <= 0) handleTimerComplete();
        }, 1000);
    }
}

function handleTimerComplete() {
    clearInterval(timerId); timerId = null;
    document.body.classList.remove('zen-active');
    stopAudio(); 
    
    // Save Stats
    if(isWork) {
        const today = new Date().toISOString().split('T')[0];
        db.history.push({ date: today, minutes: db.settings.focus });
        localStorage.setItem('escape_db_v2', JSON.stringify(db));
        renderStats(); // Update graphs
    }

    // Switch Modes
    if(isWork) {
        isWork = false;
        totalTime = timeLeft = db.settings.short * 60;
        document.getElementById('session-type').innerText = "Rest & Recover";
        document.getElementById('main-btn').innerText = "Start Break";
        new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg').play();
    } else {
        resetTimer();
    }
}

function updateTimerDisplay() {
    const m = Math.floor(timeLeft/60);
    const s = timeLeft%60;
    document.getElementById('timer-display').innerText = `${m}:${s<10?'0':''}${s}`;
    // Circle progress
    const offset = 848 - (848 * ((totalTime-timeLeft)/totalTime));
    document.getElementById('progress').style.strokeDashoffset = offset;
}

// --- BREATHING (Box Breathing: 4-4-4-4) ---
let breathCycles = 5, breathInterval;
function adjBreath(n) { 
    breathCycles = Math.max(1, breathCycles + n); 
    document.getElementById('breath-count').innerText = breathCycles; 
}

function startZen() {
    const ring = document.getElementById('zen-ring');
    const txt = document.getElementById('zen-text');
    const btn = document.getElementById('zen-btn');
    const nav = document.getElementById('main-nav');
    
    btn.style.opacity = '0';
    nav.style.transform = "translateY(150%)"; // Hide nav during breathing

    let step = 0; // 0:In, 1:Hold, 2:Out, 3:Hold
    let cyclesDone = 0;

    const instructions = ["Inhale", "Hold", "Exhale", "Hold"];
    
    const runStep = () => {
        if(cyclesDone >= breathCycles) {
            // Stop
            clearInterval(breathInterval);
            ring.className = 'breath-ring w-64 h-64 rounded-full flex items-center justify-center border border-white/10';
            txt.innerHTML = "Ritual<br>Complete";
            btn.innerText = "Again?";
            btn.style.opacity = '1';
            nav.style.transform = "translateY(0)";
            return;
        }

        // Apply Class for Animation
        ring.className = `breath-ring w-64 h-64 rounded-full flex items-center justify-center border border-white/10 breath-step-${step+1}`;
        txt.innerText = instructions[step];

        // Next step logic
        step++;
        if(step > 3) { step = 0; cyclesDone++; }
    };

    runStep(); // Run immediate
    breathInterval = setInterval(runStep, 4000); // 4 seconds per step (Box Breathing)
}

// --- STATS & GRAPHS ---
function renderStats() {
    // 1. Calculate Totals
    const totalMins = db.history.reduce((acc, cur) => acc + cur.minutes, 0);
    const maxSession = Math.max(...db.history.map(h => h.minutes), 0);
    
    document.getElementById('stat-total').innerText = (totalMins/60).toFixed(1) + 'h';
    document.getElementById('stat-max').innerText = maxSession + 'm';

    // 2. Generate Last 7 Days Graph (SVG-less, CSS Bars)
    const container = document.getElementById('graph-container');
    container.innerHTML = '';
    
    const last7Days = [];
    for(let i=6; i>=0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        last7Days.push(d.toISOString().split('T')[0]);
    }

    // Get max value for scaling height
    const dataMap = {};
    db.history.forEach(h => {
        dataMap[h.date] = (dataMap[h.date] || 0) + h.minutes;
    });
    
    const maxDaily = Math.max(...Object.values(dataMap), 10); // avoid div by zero

    last7Days.forEach(date => {
        const val = dataMap[date] || 0;
        const heightPct = (val / maxDaily) * 100;
        
        const bar = document.createElement('div');
        bar.className = 'flex-1 bg-white/10 hover:bg-white/30 transition rounded-t-sm relative group';
        bar.style.height = Math.max(heightPct, 5) + '%'; // Min 5% height
        
        // Tooltip
        bar.innerHTML = `<div class="absolute -top-6 left-1/2 -translate-x-1/2 text-[8px] bg-white text-black px-1 rounded opacity-0 group-hover:opacity-100 transition">${val}m</div>`;
        
        container.appendChild(bar);
    });
}

// --- AUDIO & UTILS ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let noiseSource = null, tickId = null;

function stopAudio() {
    if(noiseSource) { try{noiseSource.stop()}catch(e){}; noiseSource=null; }
    if(tickId) { clearInterval(tickId); tickId = null; }
    document.querySelectorAll('.sound-btn').forEach(b => b.classList.remove('active'));
}

function setAudio(type) {
    stopAudio();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    document.getElementById('a-'+type).classList.add('active');

    if(type === 'tick') {
        tickId = setInterval(() => {
            const osc = audioCtx.createOscillator(), g = audioCtx.createGain();
            osc.frequency.setValueAtTime(800, audioCtx.currentTime);
            g.gain.setValueAtTime(0.05, audioCtx.currentTime);
            g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.05);
            osc.connect(g); g.connect(audioCtx.destination);
            osc.start(); osc.stop(audioCtx.currentTime + 0.05);
        }, 1000);
    } else {
        const bufferSize = 2 * audioCtx.sampleRate, buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate), output = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            let white = Math.random() * 2 - 1;
            output[i] = (type === 'brown' ? (Math.random()*2-1)*0.1 : white * 0.1); 
            if(type==='brown') { /* Simplified Brown Filter */ }
        }
        noiseSource = audioCtx.createBufferSource();
        noiseSource.buffer = buffer; noiseSource.loop = true;
        const g = audioCtx.createGain(); g.gain.value = 0.5;
        noiseSource.connect(g); g.connect(audioCtx.destination);
        noiseSource.start();
    }
}

function toggleFullscreen() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen();
    else if (document.exitFullscreen) document.exitFullscreen();
}

function show(id) {
    document.querySelectorAll('.view').forEach(v => { v.classList.remove('active'); });
    document.getElementById(id).classList.add('active');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById('n-'+id).classList.add('active');
    if(id==='tasks') refreshTasks();
    if(id==='stats') renderStats();
}

// --- INIT ---
window.onload = () => {
    // Load Token Client
    gapi.load('client', () => {
        gapi.client.init({ discoveryDocs: [DISCOVERY_DOC] }).then(() => {
            gapiInited = true;
        });
    });
    
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID, scope: SCOPES,
        callback: (resp) => {
            if (resp.error) return;
            // Fetch User Profile from People API or assume success and get basic info
            // For simplicity in this lightweight version, we decode the token or just fetch user info via separate endpoint if needed.
            // Using a simple trick to get profile info:
            const token = gapi.client.getToken();
            fetch('https://www.googleapis.com/oauth2/v3/userinfo', { 
                headers: { Authorization: `Bearer ${token.access_token}` }
            })
            .then(r => r.json())
            .then(data => {
                userProfile = data;
                updateAuthUI();
            });
        },
    });

    // Init Config
    document.getElementById('cfg-focus').value = db.settings.focus;
    document.getElementById('cfg-short').value = db.settings.short;
    document.getElementById('cfg-long').value = db.settings.long;
    updateConfigUI();
    
    updateAuthUI(); // Start in Guest Mode
    lucide.createIcons();
};
