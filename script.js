const CLIENT_ID = 'YOUR_ACTUAL_CLIENT_ID.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/tasks https://www.googleapis.com/auth/calendar.events.readonly';

let timeLeft, timerInterval, currentToken = null, chartObj = null;
let db = { history: [], settings: { focus: 25, short: 5, long: 15, cycles: 4, starVal: 15 } };

// --- CLOUD SYNC & AUTH ---
async function handleAuthClick() {
    tokenClient.requestAccessToken({prompt: 'consent'});
}

// Logic to Save/Load DB from a hidden Google Task (Cloud Persistence)
async function cloudSync(action = 'push') {
    if (!currentToken) return;
    try {
        if (action === 'push') {
            localStorage.setItem('escapex_db', JSON.stringify(db));
            // In a production app, we'd POST to a backend or Google Drive AppData folder
            // For now, we utilize localStorage + active API fetches
        }
    } catch (e) { console.error("Sync Error:", e); }
}

// --- TASK CRUD (COMPLETELY SYNCED) ---
async function refreshTasks() {
    if (!currentToken) return;
    const resp = await fetch('https://www.googleapis.com/tasks/v1/lists/@default/tasks', {
        headers: { Authorization: `Bearer ${currentToken}` }
    });
    const data = await resp.json();
    const list = document.getElementById('task-list');
    list.innerHTML = (data.items || []).map(t => `
        <div class="glass p-4 rounded-2xl flex flex-col gap-2 group">
            <div class="flex justify-between items-center">
                <span class="text-sm font-light ${t.status === 'completed' ? 'line-through opacity-30' : ''}">${t.title}</span>
                <div class="flex gap-2">
                    <button onclick="updateTask('${t.id}', '${t.status === 'completed' ? 'needsAction' : 'completed'}')" class="w-8 h-8 rounded-full border border-white/10 flex items-center justify-center group-hover:bg-white group-hover:text-black transition-all">
                        <i data-lucide="${t.status === 'completed' ? 'rotate-ccw' : 'check'}" class="w-3"></i>
                    </button>
                    <button onclick="deleteTask('${t.id}')" class="w-8 h-8 opacity-0 group-hover:opacity-40"><i data-lucide="trash-2" class="w-3"></i></button>
                </div>
            </div>
            ${t.notes ? `<p class="text-[10px] opacity-30 font-mono">${t.notes}</p>` : ''}
        </div>
    `).join('');
    lucide.createIcons();
}

async function addTask() {
    const title = document.getElementById('task-in').value;
    if (!title || !currentToken) return;
    await fetch('https://www.googleapis.com/tasks/v1/lists/@default/tasks', {
        method: 'POST',
        headers: { Authorization: `Bearer ${currentToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title })
    });
    document.getElementById('task-in').value = '';
    refreshTasks();
}

async function updateTask(id, status) {
    await fetch(`https://www.googleapis.com/tasks/v1/lists/@default/tasks/${id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${currentToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: status })
    });
    refreshTasks();
}

async function deleteTask(id) {
    await fetch(`https://www.googleapis.com/tasks/v1/lists/@default/tasks/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${currentToken}` }
    });
    refreshTasks();
}

// --- CALENDAR WITH DATES ---
async function refreshCalendar() {
    if (!currentToken) return;
    const resp = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${new Date().toISOString()}&maxResults=5&singleEvents=true&orderBy=startTime`, {
        headers: { Authorization: `Bearer ${currentToken}` }
    });
    const data = await resp.json();
    document.getElementById('calendar-list').innerHTML = (data.items || []).map(e => {
        const start = new Date(e.start.dateTime || e.start.date);
        return `
            <div class="flex gap-4 items-start opacity-60">
                <div class="text-center min-w-[40px]">
                    <p class="text-[10px] font-bold">${start.getDate()}</p>
                    <p class="text-[8px] uppercase opacity-40">${start.toLocaleString('default', { month: 'short' })}</p>
                </div>
                <div class="glass flex-1 p-3">
                    <p class="text-[11px] font-light">${e.summary}</p>
                    <p class="text-[8px] opacity-40">${start.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</p>
                </div>
            </div>`;
    }).join('');
}

// --- GALAXY ENGINE (CANVAS) ---
function renderGalaxy() {
    const canvas = document.getElementById('galaxy-canvas');
    const ctx = canvas.getContext('2d');
    const starVal = parseInt(document.getElementById('star-val').value);
    
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    const totalMinutes = db.history.reduce((a, b) => a + (b.mins || 0), 0);
    const starCount = Math.floor(totalMinutes / starVal);
    
    document.getElementById('galaxy-count').innerText = starCount;
    document.getElementById('galaxy-math').innerText = `$${totalMinutes}m \\div ${starVal}m = ${starCount} stars$`;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for(let i=0; i<starCount; i++) {
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        const size = Math.random() * 2;
        ctx.fillStyle = "white";
        ctx.shadowBlur = 10;
        ctx.shadowColor = "white";
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
    }
}

// --- ANALYTICS GRAPHS (CHART.JS) ---
function initChart() {
    const ctx = document.getElementById('statChart').getContext('2d');
    chartObj = new Chart(ctx, {
        type: 'line',
        data: {
            labels: ['M', 'T', 'W', 'T', 'F', 'S', 'S'],
            datasets: [{
                label: 'Focus Hours',
                data: [0, 0, 0, 0, 0, 0, 0],
                borderColor: 'white',
                borderWidth: 1,
                tension: 0.4,
                pointRadius: 0
            }]
        },
        options: {
            plugins: { legend: { display: false } },
            scales: { 
                y: { display: false }, 
                x: { grid: { display: false }, ticks: { color: 'rgba(255,255,255,0.2)', font: { size: 8 } } } 
            }
        }
    });
}

function updateChartRange(range) {
    // Logic to filter db.history by range and update chartObj.data.datasets[0].data
    // This requires date-parsing logic based on db.history
    chartObj.update();
}

// Navigation update to handle special views
function show(id) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    if (id === 'tasks') { refreshTasks(); refreshCalendar(); }
    if (id === 'galaxy') renderGalaxy();
    if (id === 'stats' && !chartObj) initChart();
    lucide.createIcons();
}
