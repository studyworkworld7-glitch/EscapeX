/**
 * EscapeX v10.0 | Final Tested Build
 * Features: Multi-list, Subtasks, Persistent Login, Modal Fixes
 */

const CLIENT_ID = '445613530144-8nca3h64lackcrmkd3joge3cv7ir91uu.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/tasks https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/userinfo.profile';

let tokenClient;
let currentToken = localStorage.getItem('escapex_token');
let timerInterval = null, noiseNode = null;
let timeLeft = 1500;
let db = JSON.parse(localStorage.getItem('escapex_db')) || { settings: { focus: 25, short: 5 } };
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

// --- CORE NAVIGATION ---
function show(id) {
    // 1. Hide every view
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    
    // 2. Activate target
    const target = document.getElementById(id);
    if (target) target.classList.add('active');

    // 3. Update nav icons
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById('n-' + id)?.classList.add('active');

    // 4. Contextual Refresh
    if (id === 'tasks' && currentToken) refreshAll();
    lucide.createIcons();
}

function toggleModal(id, isOpen) {
    document.getElementById(id).classList.toggle('active', isOpen);
}

// --- GOOGLE WORKSPACE ---
window.onload = () => {
    // Initialize Google Identity Services
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

    // Check for existing session
    if (currentToken) initUser();
    
    // Initialize UI
    timeLeft = db.settings.focus * 60;
    updateTimerDisplay();
    lucide.createIcons();
};

async function initUser() {
    try {
        const resp = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${currentToken}` }
        });
        if (!resp.ok) throw new Error('Auth Expired');
        const data = await resp.json();
        
        // Update Header
        document.getElementById('profile-name').innerText = data.name;
        document.getElementById('auth-status').innerText = 'Connected';
        document.getElementById('profile-img').innerHTML = `<img src="${data.picture}" class="w-full h-full object-cover">`;
        
        // Update Stats View
        document.getElementById('auth-ui').classList.add('hidden');
        document.getElementById('user-stats').classList.remove('hidden');
    } catch (e) {
        logout();
    }
}

async function refreshAll() {
    refreshTasks();
    refreshCalendar();
}

async function refreshTasks() {
    try {
        const listResp = await fetch('https://www.googleapis.com/tasks/v1/users/@me/lists', {
            headers: { Authorization: `Bearer ${currentToken}` }
        });
        const listsData = await listResp.json();
        const container = document.getElementById('task-container');
        container.innerHTML = '';

        for (const list of (listsData.items || [])) {
            const tasksResp = await fetch(`https://www.googleapis.com/tasks/v1/lists/${list.id}/tasks?showCompleted=false`, {
                headers: { Authorization: `Bearer ${currentToken}` }
            });
            const tasksData = await tasksResp.json();
            const allTasks = tasksData.items || [];

            const listBlock = document.createElement('div');
            listBlock.className = "mb-10";
            
            // Build Task HTML (Main tasks + Subtasks indented)
            const tasksHtml = allTasks.filter(t => !t.parent).map(t => {
                const subtasks = allTasks.filter(st => st.parent === t.id);
                return `
                    <div class="glass p-4 rounded-2xl mb-3">
                        <div class="flex justify-between items-center">
                            <span class="text-sm font-medium">${t.title}</span>
                            <button onclick="deleteTask('${list.id}','${t.id}')" class="opacity-20 hover:opacity-100 hover:text-green-500">
                                <i data-lucide="check-circle" class="w-4"></i>
                            </button>
                        </div>
                        ${subtasks.map(st => `
                            <div class="subtask-item">${st.title}</div>
                        `).join('')}
                    </div>
                `;
            }).join('');

            listBlock.innerHTML = `
                <p class="task-list-title">${list.title}</p>
                <div class="space-y-2">${tasksHtml || '<p class="opacity-20 text-[10px]">No active tasks</p>'}</div>
            `;
            container.appendChild(listBlock);
        }
        lucide.createIcons();
    } catch (e) { console.error("Tasks Error:", e); }
}

async function refreshCalendar() {
    try {
        const resp = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${new Date().toISOString()}&singleEvents=true&orderBy=startTime`, {
            headers: { Authorization: `Bearer ${currentToken}` }
        });
        const data = await resp.json();
        const container = document.getElementById('calendar-container');
        
        container.innerHTML = (data.items || []).map(e => {
            const date = new Date(e.start.dateTime || e.start.date);
            return `
                <div class="glass p-5 rounded-3xl flex justify-between items-center">
                    <div>
                        <p class="text-[8px] text-amber-500 font-bold uppercase tracking-widest mb-1">
                            ${date.toLocaleDateString(undefined, {month:'short', day:'numeric'})} @ ${date.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
                        </p>
                        <p class="text-sm font-light">${e.summary}</p>
                    </div>
                    <button onclick="deleteEvent('${e.id}')" class="opacity-10 hover:opacity-100 hover:text-red-500">
                        <i data-lucide="trash" class="w-4"></i>
                    </button>
                </div>
            `;
        }).join('') || '<p class="text-center opacity-20 text-xs">No upcoming events</p>';
        lucide.createIcons();
    } catch (e) { console.error("Calendar Error:", e); }
}

// --- ACTIONS ---
async function deleteTask(listId, taskId) {
    await fetch(`https://www.googleapis.com/tasks/v1/lists/${listId}/tasks/${taskId}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${currentToken}` }
    });
    refreshTasks();
}

async function deleteEvent(id) {
    if (!confirm('Delete this event?')) return;
    await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${id}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${currentToken}` }
    });
    refreshCalendar();
}

// --- TIMER ENGINE ---
function toggleTimer() {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
        document.getElementById('main-btn').innerText = "RESUME FLOW";
    } else {
        if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(()=>{});
        document.getElementById('main-btn').innerText = "LOCK IN";
        timerInterval = setInterval(() => {
            if (timeLeft > 0) {
                timeLeft--;
                updateTimerDisplay();
            } else {
                clearInterval(timerInterval);
                alert("Protocol Complete.");
            }
        }, 1000);
    }
}

function updateTimerDisplay() {
    const m = Math.floor(timeLeft/60), s = timeLeft%60;
    document.getElementById('timer-display').innerText = `${m}:${s<10?'0':''}${s}`;
    const total = db.settings.focus * 60;
    document.getElementById('progress').style.strokeDashoffset = 911 - (911 * (1 - timeLeft/total));
}

// --- AUDIO ENGINE ---
function setAudio(type) {
    stopAudio();
    const buffer = audioCtx.createBuffer(1, audioCtx.sampleRate * 2, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    let lastOut = 0;

    for (let i = 0; i < buffer.length; i++) {
        let white = Math.random() * 2 - 1;
        if (type === 'white') data[i] = white * 0.04;
        else if (type === 'brown') { 
            data[i] = (lastOut + (0.02 * white)) / 1.02; 
            lastOut = data[i]; 
            data[i] *= 3.5; 
        }
        else if (type === 'tick') {
            data[i] = (i % audioCtx.sampleRate < 150) ? Math.random() * 0.1 : 0;
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

// --- CONFIG ---
function updateConfigUI() {
    db.settings.focus = document.getElementById('cfg-focus').value;
    db.settings.short = document.getElementById('cfg-short').value;
    document.getElementById('val-focus').innerText = db.settings.focus + 'm';
    document.getElementById('val-short').innerText = db.settings.short + 'm';
    
    // Update active timer if not running
    if (!timerInterval) {
        timeLeft = db.settings.focus * 60;
        updateTimerDisplay();
    }
    localStorage.setItem('escapex_db', JSON.stringify(db));
}

function handleAuth() { tokenClient.requestAccessToken({prompt: 'consent'}); }
function logout() { localStorage.removeItem('escapex_token'); location.reload(); }
function toggleFullscreen() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen();
    else document.exitFullscreen();
}
