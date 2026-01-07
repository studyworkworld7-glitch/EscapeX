const CLIENT_ID = '445613530144-8nca3h64lackcrmkd3joge3cv7ir91uu.apps.googleusercontent.com';
const DISCOVERY_DOCS = [
    'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest',
    'https://www.googleapis.com/discovery/v1/apis/tasks/v1/rest',
    'https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest'
];
const SCOPES = 'https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/tasks https://www.googleapis.com/auth/calendar.readonly';

let tokenClient, gapiInited = false, cloudFileId = null;
let db = JSON.parse(localStorage.getItem('escape_db')) || { stars: 0, tasks: [], amber: false };

// --- AUDIO ENGINE (FIXED) ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let noiseSource = null, tickId = null;

function stopAudio() {
    if(noiseSource) { try { noiseSource.stop(); } catch(e){} noiseSource = null; }
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
            osc.frequency.setValueAtTime(900, audioCtx.currentTime);
            g.gain.setValueAtTime(0.1, audioCtx.currentTime);
            g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);
            osc.connect(g); g.connect(audioCtx.destination);
            osc.start(); osc.stop(audioCtx.currentTime + 0.1);
        }, 1000);
    } else {
        const bufferSize = 2 * audioCtx.sampleRate, buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate), output = buffer.getChannelData(0);
        let lastOut = 0.0;
        for (let i = 0; i < bufferSize; i++) {
            let white = Math.random() * 2 - 1;
            if (type === 'brown') {
                output[i] = (lastOut + (0.02 * white)) / 1.02;
                lastOut = output[i];
                output[i] *= 3.5;
            } else { output[i] = white * 0.15; }
        }
        noiseSource = audioCtx.createBufferSource();
        noiseSource.buffer = buffer; noiseSource.loop = true;
        const gainNode = audioCtx.createGain(); gainNode.gain.value = 0.5;
        noiseSource.connect(gainNode); gainNode.connect(audioCtx.destination);
        noiseSource.start();
    }
}

// --- CLOUD SYNC LOGIC ---
async function uploadToCloud() {
    if (!gapiInited || !gapi.client.getToken()) return;
    const fileMetadata = { name: 'escape_config.json', parents: ['appDataFolder'] };
    const content = JSON.stringify(db);
    const boundary = 'foo_bar_baz', delimiter = "\r\n--" + boundary + "\r\n", close_delim = "\r\n--" + boundary + "--";
    let url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', method = 'POST';
    if (cloudFileId) { url = `https://www.googleapis.com/upload/drive/v3/files/${cloudFileId}?uploadType=multipart`; method = 'PATCH'; }
    const body = delimiter + 'Content-Type: application/json\r\n\r\n' + JSON.stringify(fileMetadata) + delimiter + 'Content-Type: application/json\r\n\r\n' + content + close_delim;
    await fetch(url, { method, headers: { 'Authorization': 'Bearer ' + gapi.client.getToken().access_token, 'Content-Type': 'multipart/related; boundary=' + boundary }, body });
}

async function downloadFromCloud() {
    const response = await gapi.client.drive.files.list({ spaces: 'appDataFolder', fields: 'files(id, name)' });
    const file = response.result.files.find(f => f.name === 'escape_config.json');
    if (file) {
        cloudFileId = file.id;
        const res = await gapi.client.drive.files.get({ fileId: cloudFileId, alt: 'media' });
        db = res.result;
        save(false);
    }
}

async function syncGoogleServices() {
    try {
        const taskRes = await gapi.client.tasks.tasks.list({ tasklist: '@me', maxResults: 10 });
        if (taskRes.result.items) {
            taskRes.result.items.forEach(gt => {
                if (!db.tasks.find(t => t.text === gt.title)) db.tasks.push({ id: gt.id, text: gt.title, done: gt.status === 'completed' });
            });
        }
        const calRes = await gapi.client.calendar.events.list({ calendarId: 'primary', timeMin: (new Date()).toISOString(), maxResults: 1, singleEvents: true, orderBy: 'startTime' });
        const event = calRes.result.items[0];
        if (event) document.getElementById('next-event').innerText = `Next: ${event.summary} (${new Date(event.start.dateTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})})`;
        save();
    } catch (e) { console.error(e); }
}

// --- CORE UTILITIES ---
const save = (upload = true) => {
    localStorage.setItem('escape_db', JSON.stringify(db));
    renderTasks(); renderSky();
    if (upload) uploadToCloud();
};

function handleAuthClick() { tokenClient.requestAccessToken({prompt: 'consent'}); }
function handleSignoutClick() { 
    const token = gapi.client.getToken();
    if (token) { google.accounts.oauth2.revoke(token.access_token); gapi.client.setToken(''); location.reload(); }
}

function gapiLoaded() { gapi.load('client', async () => { await gapi.client.init({ discoveryDocs: DISCOVERY_DOCS }); gapiInited = true; }); }
function gsiLoaded() {
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID, scope: SCOPES,
        callback: async (resp) => {
            document.getElementById('auth-screen').style.display = 'none';
            await downloadFromCloud();
            await syncGoogleServices();
        },
    });
}

function show(id) {
    document.querySelectorAll('.view').forEach(v => { v.classList.remove('active'); v.style.display = 'none'; });
    const target = document.getElementById(id);
    target.style.display = 'flex';
    setTimeout(() => target.classList.add('active'), 10);
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById('n-'+id).classList.add('active');
    if(id === 'map') renderSky();
    lucide.createIcons();
}

let timeLeft = 1500, totalTime = 1500, running = false, timerInterval;
function setTimer(s) { clearInterval(timerInterval); running = false; timeLeft = totalTime = s; updateUI(); }
function toggleTimer() {
    if(running) { clearInterval(timerInterval); running = false; document.getElementById('main-btn').innerText = "Resume Flow"; }
    else {
        running = true; document.getElementById('main-btn').innerText = "Stay Focused";
        timerInterval = setInterval(() => {
            timeLeft--; updateUI();
            if(timeLeft <= 0) { clearInterval(timerInterval); db.stars++; save(); setTimer(totalTime); }
        }, 1000);
    }
}
function updateUI() {
    const m = Math.floor(timeLeft/60), s = timeLeft%60;
    document.getElementById('timer-display').innerText = `${m}:${s<10?'0':''}${s}`;
    document.getElementById('progress').style.strokeDashoffset = 754 - (754 * (totalTime-timeLeft)/totalTime);
}

function addTask() {
    const input = document.getElementById('task-in'); if(!input.value) return;
    db.tasks.push({id: Date.now(), text: input.value, done: false});
    input.value = ''; save();
}
function renderTasks() {
    document.getElementById('task-list').innerHTML = db.tasks.map(t => `
        <div class="glass p-6 flex justify-between items-center" ondblclick="burnTask(this, ${t.id})">
            <span class="font-light ${t.done?'opacity-20 line-through':''}">${t.text}</span>
            <button onclick="toggleTask(${t.id})"><i data-lucide="${t.done?'rotate-ccw':'check'}" class="w-4 opacity-40"></i></button>
        </div>
    `).join('');
    lucide.createIcons();
}
function toggleTask(id) { db.tasks = db.tasks.map(t => t.id === id ? {...t, done: !t.done} : t); save(); }
function burnTask(el, id) { el.classList.add('burning'); setTimeout(() => { db.tasks = db.tasks.filter(t => t.id !== id); save(); }, 1100); }

function startZen() {
    const ring = document.getElementById('zen-ring'), txt = document.getElementById('zen-text'), steps = ["Inhale", "Hold", "Exhale", "Hold"];
    let i = 0; document.getElementById('zen-btn').style.opacity = '0';
    const cycle = () => { txt.innerText = steps[i % 4]; if(i % 4 === 0) ring.classList.add('inhale'); if(i % 4 === 2) ring.classList.remove('inhale'); i++; setTimeout(cycle, 4000); };
    cycle();
}

function renderSky() {
    const sky = document.getElementById('universe-sky'); sky.innerHTML = '';
    for(let i=0; i<db.stars; i++) {
        const s = document.createElement('div'); s.className = 'star';
        s.style.width = s.style.height = (Math.random()*2+1)+'px';
        s.style.left = Math.random()*100+'%'; s.style.top = Math.random()*100+'%';
        s.style.setProperty('--d', (Math.random()*4+2)+'s');
        sky.appendChild(s);
    }
    document.getElementById('star-count').innerText = db.stars;
}

function toggleAmber(c) { db.amber = c; document.getElementById('amber-overlay').style.display = c?'block':'none'; save(); }

window.onload = () => { 
    gapiLoaded(); gsiLoaded();
    if(db.amber) { document.getElementById('amber-check').checked = true; toggleAmber(true); } 
    save(false); updateUI(); lucide.createIcons();
};
