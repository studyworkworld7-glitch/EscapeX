/* GOOGLE CONFIGURATION */
const CLIENT_ID = 'PASTE_YOUR_CLIENT_ID_HERE';
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';
const SCOPES = 'https://www.googleapis.com/auth/drive.appdata';

let tokenClient;
let gapiInited = false;
let gsisInited = false;
let cloudFileId = null;

/* DATABASE LOGIC */
let db = JSON.parse(localStorage.getItem('escape_db')) || { stars: 0, tasks: [], amber: false };

const save = async () => {
    localStorage.setItem('escape_db', JSON.stringify(db));
    renderTasks();
    renderSky();
    if (gapiInited) await uploadToCloud(); // Sync to Google
};

/* GOOGLE DRIVE SYNC LOGIC */
async function uploadToCloud() {
    const fileContent = JSON.stringify(db);
    const fileMetadata = { name: 'escape_data.json', parents: ['appDataFolder'] };
    const boundary = 'foo_bar_baz';
    const delimiter = "\r\n--" + boundary + "\r\n";
    const close_delim = "\r\n--" + boundary + "--";

    let url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
    let method = 'POST';

    if (cloudFileId) {
        url = `https://www.googleapis.com/upload/drive/v3/files/${cloudFileId}?uploadType=multipart`;
        method = 'PATCH';
    }

    const multipartRequestBody =
        delimiter + 'Content-Type: application/json\r\n\r\n' + JSON.stringify(fileMetadata) +
        delimiter + 'Content-Type: application/json\r\n\r\n' + fileContent + close_delim;

    await fetch(url, {
        method: method,
        headers: { 'Authorization': 'Bearer ' + gapi.client.getToken().access_token, 'Content-Type': 'multipart/related; boundary=' + boundary },
        body: multipartRequestBody
    });
}

async function downloadFromCloud() {
    const response = await gapi.client.drive.files.list({ spaces: 'appDataFolder', fields: 'files(id, name)' });
    const file = response.result.files.find(f => f.name === 'escape_data.json');
    if (file) {
        cloudFileId = file.id;
        const data = await gapi.client.drive.files.get({ fileId: cloudFileId, alt: 'media' });
        db = data.result;
        save();
    }
}

/* AUTHENTICATION */
function gapiLoaded() { gapi.load('client', async () => { await gapi.client.init({ discoveryDocs: [DISCOVERY_DOC] }); gapiInited = true; }); }
function gsiLoaded() {
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID, scope: SCOPES,
        callback: async (resp) => {
            if (resp.error) throw resp;
            document.getElementById('auth-screen').style.display = 'none';
            await downloadFromCloud();
        },
    });
    gsisInited = true;
}
function handleAuthClick() { tokenClient.requestAccessToken({prompt: 'consent'}); }
function handleSignoutClick() { 
    const token = gapi.client.getToken();
    if (token !== null) { google.accounts.oauth2.revoke(token.access_token); gapi.client.setToken(''); location.reload(); }
}

/* UI & FUNCTIONALITY (The rest of your original logic) */
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let noiseSource = null, tickId = null;

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
function setTimer(s) { clearInterval(timerInterval); running = false; timeLeft = totalTime = s; updateUI(); document.getElementById('main-btn').innerText = "Enter Flow"; }
function toggleTimer() {
    if(running) { clearInterval(timerInterval); document.getElementById('main-btn').innerText = "Resume Flow"; running = false; }
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
        <div class="glass p-6 flex justify-between items-center transition-all" ondblclick="burnTask(this, ${t.id})">
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
    const cycle = () => {
        txt.innerText = steps[i % 4];
        if(i % 4 === 0) ring.classList.add('inhale');
        if(i % 4 === 2) ring.classList.remove('inhale');
        i++; setTimeout(cycle, 4000);
    };
    cycle();
}

function renderSky() {
    const sky = document.getElementById('universe-sky'); sky.innerHTML = '';
    for(let i=0; i<db.stars; i++) {
        const s = document.createElement('div'); s.className = 'star';
        s.style.width = s.style.height = (Math.random()*2.5+1)+'px';
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
    renderTasks(); updateUI(); lucide.createIcons();
};
