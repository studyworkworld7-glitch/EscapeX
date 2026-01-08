/**
 * EscapeX v11.5 | Final Stable Release
 */

const CLIENT_ID = '445613530144-8nca3h64lackcrmkd3joge3cv7ir91uu.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/tasks https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/userinfo.profile';

let tokenClient;
let currentToken = localStorage.getItem('escapex_token');
let timerInterval = null, noiseNode = null;

// Load DB or set defaults
let db = JSON.parse(localStorage.getItem('escapex_db')) || { settings: { focus: 25, short: 5 } };
let timeLeft = db.settings.focus * 60;

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

// --- THE VIEW ENGINE ---
function show(id) {
    // 1. Remove 'active' from all views and nav items
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

    // 2. Activate the selected view and nav icon
    const targetView = document.getElementById(id);
    const targetNav = document.getElementById('n-' + id);
    
    if (targetView) targetView.classList.add('active');
    if (targetNav) targetNav.classList.add('active');

    // 3. Refresh data if entering Objectives
    if (id === 'tasks' && currentToken) refreshAll();
    
    lucide.createIcons();
}

function toggleModal(id, isOpen) {
    document.getElementById(id).classList.toggle('active', isOpen);
}

// --- GOOGLE WORKSPACE & PERSISTENCE ---
window.onload = () => {
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: (resp) => {
            if (resp.access_token) {
                currentToken = resp.access_token;
                localStorage.setItem('escapex_token', currentToken);
                initUser();
            }
        }
    });

    if (currentToken) initUser();
    updateTimerDisplay();
    lucide.createIcons();
};

async function initUser() {
    try {
        const resp = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${currentToken}` }
        });
        if (!resp.ok) throw new Error('Session Expired');
        const data = await resp.json();
        
        // Update Header Profile
        document.getElementById('profile-name').innerText = data.name;
        document.getElementById('profile-img').innerHTML = `<img src="${data.picture}" class="w-full h-full object-cover">`;
        document.getElementById('auth-status').innerText = 'Cloud Active';
        
        // Update Stats View
        document.getElementById('auth-ui').classList.add('hidden');
        document.getElementById('user-stats').classList.remove('hidden');
    } catch (e) {
        localStorage.removeItem('escapex_token');
        currentToken = null;
    }
}

// --- DATA FETCHING (Lists + Subtasks) ---
async function refreshAll() {
    if (!currentToken) return;
    
    // FETCH TASKS
    const listResp = await fetch('https://www.googleapis.com/tasks/v1/users/@me/lists', {
        headers: { Authorization: `Bearer ${currentToken}` }
    });
    const lists = await listResp.json();
    const taskContainer = document.getElementById('task-container');
    taskContainer.innerHTML = '';

    for (const list of (lists.items || [])) {
        const tasksResp = await fetch(`https://www.googleapis.com/tasks/v1/lists/${list.id}/tasks?showCompleted=false`, {
            headers: { Authorization: `Bearer ${currentToken}` }
        });
        const tasksData = await tasksResp.json();
        const allTasks = tasksData.items || [];

        const block = document.createElement('div');
        block.className = 'list-group';
        block.innerHTML = `
            <p class="list-title">${list.title}</p>
            <div class="space-y-3">
                ${allTasks.filter(t => !t.parent).map(t => {
                    const subtasks = allTasks.filter(st => st.parent === t.id);
                    return `
                        <div class="glass p-4 rounded-2xl">
                            <div class="flex justify-between items-center">
                                <span class="text-sm font-light">${t.title}</span>
                                <button onclick="deleteTask('${list.id}','${t.id}')" class="opacity-20 hover:opacity-100"><i data-lucide="check" class="w-4"></i></button>
                            </div>
                            ${subtasks.map(st => `<p class="ml-6 mt-2 text-xs opacity-40">• ${st.title}</p>`).join('')}
                        </div>
                    `;
                }).join('') || '<p class="text-[10px] opacity-20">Clear</p>'}
            </div>
        `;
        taskContainer.appendChild(block);
    }

    // FETCH CALENDAR
    const calResp = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${new Date().toISOString()}&singleEvents=true&orderBy=startTime`, {
        headers: { Authorization: `Bearer ${currentToken}` }
    });
    const calData = await calResp.json();
    const calContainer = document.getElementById('calendar-container');
    calContainer.innerHTML = (calData.items || []).map(e => `
        <div class="glass p-5 rounded-2xl flex justify-between items-center">
            <div>
                <p class="text-[9px] text-amber-500 font-bold mb-1 uppercase">${new Date(e.start.dateTime || e.start.date).toDateString()}</p>
                <p class="text-sm font-light">${e.summary}</p>
            </div>
            <button onclick="deleteEvent('${e.id}')" class="opacity-20 hover:opacity-100"><i data-lucide="x" class="w-4"></i></button>
        </div>
    `).join('');
    
    lucide.createIcons();
}

// --- TIMER ENGINE ---
function updateTimerDisplay() {
    const m = Math.floor(timeLeft / 60);
    const s = timeLeft % 60;
    document.getElementById('timer-display').innerText = `${m}:${s < 10 ? '0' : ''}${s}`;
    const total = db.settings.focus * 60;
    document.getElementById('progress').style.strokeDashoffset = 911 - (911 * (1 - timeLeft / total));
}

function toggleTimer() {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
        document.getElementById('main-btn').innerText = "RESUME";
    } else {
        document.getElementById('main-btn').innerText = "LOCK IN";
        timerInterval = setInterval(() => {
            if (timeLeft > 0) {
                timeLeft--;
                updateTimerDisplay();
            } else {
                clearInterval(timerInterval);
                new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg').play();
            }
        }, 1000);
    }
}

// --- AUDIO ENGINE ---
function setAudio(type) {
    stopAudio();
    const buffer = audioCtx.createBuffer(1, audioCtx.sampleRate * 2, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    let lastOut = 0;

    for (let i = 0; i < buffer.length; i++) {
        let white = Math.random() * 2 - 1;
        if (type === 'white') data[i] = white * 0.05;
        else if (type === 'brown') { 
            data[i] = (lastOut + (0.02 * white)) / 1.02; 
            lastOut = data[i]; 
            data[i] *= 3.5; 
        } else if (type === 'tick') {
            data[i] = (i % audioCtx.sampleRate < 100) ? Math.random() * 0.1 : 0;
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

// --- SETTINGS ---
function updateConfigUI() {
    db.settings.focus = document.getElementById('cfg-focus').value;
    db.settings.short = document.getElementById('cfg-short').value;
    document.getElementById('val-focus').innerText = db.settings.focus + 'm';
    document.getElementById('val-short').innerText = db.settings.short + 'm';
    
    if (!timerInterval) {
        timeLeft = db.settings.focus * 60;
        updateTimerDisplay();
    }
    localStorage.setItem('escapex_db', JSON.stringify(db));
}

// --- SYSTEM UTILS ---
async function deleteTask(lId, tId) {
    await fetch(`https://www.googleapis.com/tasks/v1/lists/${lId}/tasks/${tId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${currentToken}` } });
    refreshAll();
}
async function deleteEvent(id) {
    await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${currentToken}` } });
    refreshAll();
}
function handleAuth() { tokenClient.requestAccessToken({prompt: 'consent'}); }
function logout() { localStorage.removeItem('escapex_token'); location.reload(); }
function toggleFullscreen() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen();
    else document.exitFullscreen();
}
