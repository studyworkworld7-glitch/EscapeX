/**
 * EscapeX v9.0 | Ultimate Build
 */

const CLIENT_ID = '445613530144-8nca3h64lackcrmkd3joge3cv7ir91uu.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/tasks https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/userinfo.profile';

let tokenClient;
let currentToken = localStorage.getItem('escapex_token');
let timerInterval = null, noiseNode = null, timeLeft = 1500;
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

// --- INITIALIZATION ---
window.onload = () => {
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: (resp) => {
            currentToken = resp.access_token;
            localStorage.setItem('escapex_token', currentToken);
            initUser();
        }
    });

    if (currentToken) initUser();
    lucide.createIcons();
};

async function initUser() {
    try {
        const resp = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${currentToken}` }
        });
        if (!resp.ok) throw new Error('Expired');
        const data = await resp.json();
        
        document.getElementById('profile-name').innerText = data.name;
        document.getElementById('auth-status').innerText = 'Cloud Synced';
        document.getElementById('profile-img').innerHTML = `<img src="${data.picture}" class="w-full h-full object-cover">`;
        document.getElementById('auth-ui').classList.add('hidden');
        document.getElementById('user-stats').classList.remove('hidden');
        refreshAll();
    } catch (e) {
        localStorage.removeItem('escapex_token');
        currentToken = null;
    }
}

// --- NAVIGATION ---
function show(id) {
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById('n-' + id)?.classList.add('active');
    lucide.createIcons();
}

// --- TASK ENGINE (Lists + Subtasks) ---
async function refreshAll() {
    if (!currentToken) return;
    refreshTasks();
    refreshCalendar();
}

async function refreshTasks() {
    const listResp = await fetch('https://www.googleapis.com/tasks/v1/users/@me/lists', {
        headers: { Authorization: `Bearer ${currentToken}` }
    });
    const lists = await listResp.json();
    const container = document.getElementById('task-container');
    container.innerHTML = '';

    for (const list of (lists.items || [])) {
        const tasksResp = await fetch(`https://www.googleapis.com/tasks/v1/lists/${list.id}/tasks?showCompleted=false`, {
            headers: { Authorization: `Bearer ${currentToken}` }
        });
        const tasksData = await tasksResp.json();
        const tasks = tasksData.items || [];

        const listEl = document.createElement('div');
        listEl.innerHTML = `
            <div class="mb-4 flex justify-between items-center">
                <p class="text-[9px] uppercase tracking-[0.3em] opacity-40 font-bold">${list.title}</p>
                <button onclick="addTaskPrompt('${list.id}')" class="opacity-20 hover:opacity-100"><i data-lucide="plus" class="w-3"></i></button>
            </div>
            <div class="space-y-2">
                ${tasks.filter(t => !t.parent).map(t => renderTaskItem(t, tasks, list.id)).join('')}
            </div>
        `;
        container.appendChild(listEl);
    }
    lucide.createIcons();
}

function renderTaskItem(task, allTasks, listId) {
    const children = allTasks.filter(t => t.parent === task.id);
    return `
        <div class="glass p-4 rounded-2xl">
            <div class="flex justify-between items-center">
                <span class="text-sm font-light">${task.title}</span>
                <button onclick="deleteTask('${listId}', '${task.id}')" class="opacity-20 hover:text-red-500"><i data-lucide="trash-2" class="w-3"></i></button>
            </div>
            ${children.length > 0 ? `
                <div class="mt-3 ml-4 pl-4 border-l border-white/10 space-y-2">
                    ${children.map(c => `<p class="text-xs opacity-50">${c.title}</p>`).join('')}
                </div>
            ` : ''}
        </div>
    `;
}

// --- CALENDAR ENGINE (Add/Delete) ---
async function refreshCalendar() {
    const resp = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${new Date().toISOString()}&singleEvents=true&orderBy=startTime`, {
        headers: { Authorization: `Bearer ${currentToken}` }
    });
    const data = await resp.json();
    const container = document.getElementById('calendar-container');
    
    container.innerHTML = (data.items || []).map(event => `
        <div class="glass p-5 rounded-[2rem] flex justify-between items-center">
            <div>
                <p class="text-[8px] uppercase tracking-widest text-amber-500 mb-1">${new Date(event.start.dateTime || event.start.date).toLocaleDateString()}</p>
                <p class="text-sm font-light">${event.summary}</p>
                <p class="text-[10px] opacity-30 uppercase font-mono">${new Date(event.start.dateTime || event.start.date).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</p>
            </div>
            <button onclick="deleteEvent('${event.id}')" class="w-10 h-10 flex items-center justify-center rounded-full bg-white/5 opacity-20 hover:opacity-100 hover:text-red-500 transition">
                <i data-lucide="x" class="w-4"></i>
            </button>
        </div>
    `).join('') || '<p class="text-center opacity-20 text-xs">No Scheduled Events</p>';
    lucide.createIcons();
}

async function addEventPrompt() {
    const title = prompt("Event Title:");
    if (!title) return;
    const start = new Date().toISOString(); // Simplified for current time
    await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
        method: 'POST',
        headers: { Authorization: `Bearer ${currentToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ summary: title, start: { dateTime: start }, end: { dateTime: start } })
    });
    refreshCalendar();
}

async function deleteEvent(id) {
    if (!confirm('Cancel this event?')) return;
    await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${currentToken}` }
    });
    refreshCalendar();
}

// --- TASK ACTIONS ---
async function deleteTask(listId, taskId) {
    await fetch(`https://www.googleapis.com/tasks/v1/lists/${listId}/tasks/${taskId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${currentToken}` }
    });
    refreshTasks();
}

async function addTaskPrompt(listId) {
    const title = prompt("Task Title:");
    if (!title) return;
    await fetch(`https://www.googleapis.com/tasks/v1/lists/${listId}/tasks`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${currentToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title })
    });
    refreshTasks();
}

// --- TIMER ENGINE ---
function toggleTimer() {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    if (!timerInterval) {
        toggleFullscreen();
        document.getElementById('main-btn').innerText = "Running";
        timerInterval = setInterval(() => {
            if (timeLeft > 0) {
                timeLeft--;
                const m = Math.floor(timeLeft/60), s = timeLeft%60;
                document.getElementById('timer-display').innerText = `${m}:${s<10?'0':''}${s}`;
                document.getElementById('progress').style.strokeDashoffset = 942 - (942 * (1 - timeLeft/1500));
            }
        }, 1000);
    } else {
        clearInterval(timerInterval);
        timerInterval = null;
        document.getElementById('main-btn').innerText = "Initialize";
    }
}

// --- AUDIO ---
function setAudio(type) {
    stopAudio();
    const buffer = audioCtx.createBuffer(1, audioCtx.sampleRate * 2, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    let lastOut = 0;
    for (let i = 0; i < buffer.length; i++) {
        let white = Math.random() * 2 - 1;
        if (type === 'white') data[i] = white * 0.05;
        else if (type === 'brown') { data[i] = (lastOut + (0.02 * white)) / 1.02; lastOut = data[i]; data[i] *= 3.5; }
        else if (type === 'tick') data[i] = (i % audioCtx.sampleRate < 100) ? Math.random() * 0.1 : 0;
    }
    noiseNode = audioCtx.createBufferSource();
    noiseNode.buffer = buffer; noiseNode.loop = true;
    noiseNode.connect(audioCtx.destination);
    noiseNode.start();
}

function stopAudio() { if (noiseNode) { noiseNode.stop(); noiseNode = null; } }

function toggleFullscreen() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen();
    else document.exitFullscreen();
}

function handleAuth() { tokenClient.requestAccessToken({prompt: 'consent'}); }
function logout() { localStorage.removeItem('escapex_token'); location.reload(); }
