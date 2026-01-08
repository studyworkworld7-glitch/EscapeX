const CLIENT_ID = '445613530144-8nca3h64lackcrmkd3joge3cv7ir91uu.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/tasks';

let timeLeft, timerInterval, noiseNode, breathInterval, currentToken = null;
let currentCycle = 1, sessionState = 'WORK', selectedZen = 'focus';
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const gainNode = audioCtx.createGain();
gainNode.connect(audioCtx.destination);

let db = JSON.parse(localStorage.getItem('escapex_db')) || { 
    history: [], settings: { focus: 25, short: 5, long: 15, cycles: 4, autostart: false, night: false } 
};

// --- INITIALIZATION ---
window.onload = () => {
    // Persistent Login Check
    const savedToken = localStorage.getItem('escapex_token');
    const savedProfile = localStorage.getItem('escapex_profile');
    if(savedToken && savedProfile) {
        currentToken = savedToken;
        updateProfileUI(JSON.parse(savedProfile));
    }

    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID, scope: SCOPES,
        callback: (resp) => {
            currentToken = resp.access_token;
            localStorage.setItem('escapex_token', currentToken);
            fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${currentToken}` }})
                .then(r => r.json()).then(data => {
                    localStorage.setItem('escapex_profile', JSON.stringify(data));
                    updateProfileUI(data);
                });
        }
    });

    updateConfigUI();
    lucide.createIcons();
};

function updateProfileUI(data) {
    document.getElementById('profile-name').innerText = data.name;
    document.getElementById('profile-img').innerHTML = `<img src="${data.picture}" class="w-full h-full object-cover">`;
    document.getElementById('auth-box').innerHTML = `<p class="text-green-500 text-[10px] uppercase tracking-widest">Protocol Active</p>`;
}

// --- TIMER ENGINE & CYCLES ---
function toggleTimer() {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    if (!timerInterval) {
        toggleFullscreen(true);
        document.body.classList.add('locked');
        document.getElementById('main-btn').innerText = "Locked In";
        timerInterval = setInterval(() => {
            if (timeLeft > 0) { 
                timeLeft--; 
                updateTimerDisplay(); 
            } else { 
                handleCycleComplete(); 
            }
        }, 1000);
    } else {
        clearInterval(timerInterval);
        timerInterval = null;
        document.getElementById('main-btn').innerText = "Resume Flow";
        document.body.classList.remove('locked');
    }
}

function handleCycleComplete() {
    ringBell();
    clearInterval(timerInterval);
    timerInterval = null;
    
    if (sessionState === 'WORK') {
        db.history.push({ date: new Date(), mins: db.settings.focus });
        if (currentCycle >= db.settings.cycles) {
            sessionState = 'LONG';
            timeLeft = db.settings.long * 60;
            currentCycle = 1;
        } else {
            sessionState = 'SHORT';
            timeLeft = db.settings.short * 60;
            currentCycle++;
        }
    } else {
        sessionState = 'WORK';
        timeLeft = db.settings.focus * 60;
    }

    save();
    updateTimerDisplay();
    if (db.settings.autostart) {
        setTimeout(toggleTimer, 4000); 
    } else {
        document.body.classList.remove('locked');
        document.getElementById('main-btn').innerText = "Start " + sessionState;
    }
}

function ringBell() {
    const osc = audioCtx.createOscillator();
    const bellGain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(440, audioCtx.currentTime + 3);
    bellGain.gain.setValueAtTime(0.5, audioCtx.currentTime);
    bellGain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 3);
    osc.connect(bellGain);
    bellGain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 3);
}

// --- AUDIO SYNTHESIS ---
function setAudio(type) {
    if (noiseNode) { noiseNode.stop(); noiseNode = null; }
    document.querySelectorAll('.sound-opt').forEach(b => b.classList.remove('active'));
    if (type === 'none') return;

    const bufferSize = audioCtx.sampleRate * 2;
    const buffer = audioCtx.createBuffer(type === 'binaural' ? 2 : 1, bufferSize, audioCtx.sampleRate);
    
    if (type === 'binaural') {
        // 200Hz Left, 204Hz Right = 4Hz Theta for Focus
        const l = buffer.getChannelData(0), r = buffer.getChannelData(1);
        for(let i=0; i<bufferSize; i++) {
            l[i] = Math.sin(2 * Math.PI * 200 * (i/audioCtx.sampleRate)) * 0.1;
            r[i] = Math.sin(2 * Math.PI * 204 * (i/audioCtx.sampleRate)) * 0.1;
        }
    } else {
        const data = buffer.getChannelData(0);
        let lastOut = 0;
        for (let i = 0; i < bufferSize; i++) {
            let white = Math.random() * 2 - 1;
            if (type === 'white') data[i] = white * 0.05;
            if (type === 'brown') { data[i] = (lastOut + (0.02 * white)) / 1.02; lastOut = data[i]; data[i] *= 3.5; }
            if (type === 'flow') data[i] = Math.sin(i / 1500) * white * 0.04;
            if (type === 'tick') data[i] = (i % (audioCtx.sampleRate) < 150) ? white * 0.2 : 0;
        }
    }

    noiseNode = audioCtx.createBufferSource();
    noiseNode.buffer = buffer;
    noiseNode.loop = true;
    noiseNode.connect(gainNode);
    noiseNode.start();
}

function updateVolume() {
    const val = document.getElementById('vol-slider').value;
    gainNode.gain.setTargetAtTime(val, audioCtx.currentTime, 0.1);
    document.getElementById('vol-val').innerText = Math.round(val * 100) + '%';
}

// --- ZEN BREATHING ---
const patterns = {
    focus: { steps: ["Inhale", "Hold", "Exhale", "Hold"], time: 4000 },
    relax: { steps: ["Inhale", "Hold", "Exhale"], time: 5000 }, // 4-7-8 approximation
    study: { steps: ["Inhale", "Exhale"], time: 6000 }
};

function startZen() {
    const ring = document.getElementById('zen-ring');
    const txt = document.getElementById('zen-text');
    const p = patterns[selectedZen];
    let i = 0;
    document.getElementById('zen-btn').style.display = 'none';
    
    breathInterval = setInterval(() => {
        txt.innerText = p.steps[i];
        ring.style.transform = (p.steps[i] === 'Inhale') ? 'scale(1.4)' : (p.steps[i] === 'Exhale' ? 'scale(1)' : ring.style.transform);
        ring.style.borderColor = (p.steps[i] === 'Inhale') ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.05)';
        i = (i + 1) % p.steps.length;
    }, p.time);
}

// --- CORE UTILITIES ---
function show(id) {
    if (breathInterval) { clearInterval(breathInterval); breathInterval = null; document.getElementById('zen-btn').style.display = 'block'; }
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const n = document.getElementById('n-' + id);
    if(n) n.classList.add('active');
    lucide.createIcons();
}

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
    
    timeLeft = db.settings.focus * 60;
    updateTimerDisplay();
    save();
}

function updateTimerDisplay() {
    const m = Math.floor(timeLeft / 60), s = timeLeft % 60;
    document.getElementById('timer-display').innerText = `${m}:${s < 10 ? '0' : ''}${s}`;
    document.getElementById('session-type').innerText = `${sessionState} | CYCLE ${currentCycle}`;
    const total = (sessionState === 'WORK' ? db.settings.focus : (sessionState === 'SHORT' ? db.settings.short : db.settings.long)) * 60;
    document.getElementById('progress').style.strokeDashoffset = 942 - (942 * (timeLeft / total));
}

function updateNightLight() {
    db.settings.night = document.getElementById('cfg-night').checked;
    document.getElementById('night-overlay').style.display = db.settings.night ? 'block' : 'none';
    save();
}

function setZenMode(m) {
    selectedZen = m;
    document.querySelectorAll('.zen-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('zen-' + m).classList.add('active');
}

function handleAuthClick() { tokenClient.requestAccessToken({prompt: 'consent'}); }
function toggleSoundMenu() { document.getElementById('sound-menu').classList.toggle('hidden'); }
function toggleTimerSettings() { document.getElementById('timer-settings').classList.toggle('hidden'); }
function save() { localStorage.setItem('escapex_db', JSON.stringify(db)); }
function toggleFullscreen(go) { if(go) document.documentElement.requestFullscreen().catch(()=>{}); else if(document.fullscreenElement) document.exitFullscreen(); }
