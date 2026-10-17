/**
 * Personal Dashboard - Main Application
 * Handles routing, page rendering, full-window alerts, notifications, and PWA setup.
 */

const API = window.DashboardAPI;
let currentRoute = 'dashboard';
let currentPage = 'dashboard';
let settings = {};
let deferredPrompt = null;
let notificationPermission = 'default';

// ===== INIT =====
async function init() {
  // Register service worker
  await registerServiceWorker();

  // Check authentication
  const token = API.getToken();
  if (!token) {
    // Try to setup/login
    const token = null;
  }

  // Load settings
  try {
    settings = await API.getSettings();
  } catch (e) {
    console.error('Failed to load settings:', e);
  }

  // Setup notification permission
  if ('Notification' in window) {
    notificationPermission = Notification.permission;
  }

  // Setup event listeners
  setupEventListeners();

  // Handle initial route
  const hash = window.location.hash || '#/dashboard';
  handleRoute(hash);

  // Check for active alerts on load
  checkActiveAlerts();

  // Setup push notifications
  setupPushNotifications();
}

// ===== SERVICE WORKER & PWA =====
async function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      console.log('Service Worker registered:', registration.scope);

      // Handle beforeinstallprompt for PWA
      window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        showPWAInstallButton();
      });
    } catch (err) {
      console.error('Service Worker registration failed:', err);
    }
  }
}

function showPWAInstallButton() {
  // Add an install button to the settings page if needed
  const installBtn = document.getElementById('install-btn');
  if (installBtn) {
    installBtn.style.display = 'inline-flex';
    installBtn.onclick = () => {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then((choiceResult) => {
          if (choiceResult.outcome === 'accepted') {
            console.log('User installed the PWA');
          }
          deferredPrompt = null;
        });
      }
    };
  }
}

// ===== PUSH NOTIFICATIONS =====
async function setupPushNotifications() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.log('Push notifications not supported');
    return;
  }

  const token = API.getToken();
  if (!token) return;

  try {
    const { publicKey } = await API.getVapidKey();
    if (!publicKey) {
      console.log('VAPID key not configured');
      return;
    }

    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      const convertedKey = urlBase64ToUint8Array(publicKey);
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedKey
      });
    }

    // Save subscription to server
    await API.saveSubscription(subscription);
    console.log('Push subscription saved');
  } catch (err) {
    console.error('Push notification setup failed:', err);
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// ===== EVENT LISTENERS =====
function setupEventListeners() {
  // Menu toggle for mobile
  document.getElementById('menu-toggle')?.addEventListener('click', () => {
    document.getElementById('sidebar').classList.add('active');
    document.getElementById('overlay').classList.add('active');
  });

  document.getElementById('overlay')?.addEventListener('click', () => {
    document.getElementById('sidebar').classList.remove('active');
    document.getElementById('overlay').classList.remove('active');
  });

  // Hash change (routing)
  window.addEventListener('hashchange', () => {
    handleRoute(window.location.hash);
  });

  // Notification close button
  document.getElementById('alert-overlay')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('alert-overlay')) {
      hideAlert();
    }
  });
}

// ===== ROUTING =====
function handleRoute(hash) {
  const route = hash.replace('#/', '').split('/')[0] || 'dashboard';
  const pathParts = hash.replace('#/', '').split('/');
  const routeParam = pathParts.length > 1 ? pathParts[1] : null;

  currentPage = route;
  updateSidebar();
  updatePageTitle();

  // Render the appropriate page
  switch (route) {
    case 'login':
      renderLoginPage(routeParam);
      break;
    case 'dashboard':
      renderDashboard();
      break;
    case 'tasks':
      renderTasksPage(routeParam);
      break;
    case 'archived':
      renderArchivedTasks();
      break;
    case 'notes':
      renderNotesPage(routeParam);
      break;
    case 'meetings':
      renderMeetingsPage(routeParam);
      break;
    case 'cascades':
      renderCascadesPage(routeParam);
      break;
    case 'slack':
      renderSlackPage(routeParam);
      break;
    case 'notifications':
      renderNotificationsPage();
      break;
    case 'settings':
      renderSettingsPage();
      break;
    default:
      handleRoute('#/dashboard');
  }
}

function updateSidebar() {
  const links = document.querySelectorAll('#sidebar-nav a[data-page]');
  links.forEach(link => {
    link.classList.remove('active');
    if (link.dataset.page === currentPage) {
      link.classList.add('active');
    }
  });

  // Show/hide logout link
  const logoutLink = document.getElementById('logout-link');
  const token = API.getToken();
  if (logoutLink) {
    logoutLink.style.display = token ? 'flex' : 'none';
  }
}

function updatePageTitle() {
  const titles = {
    dashboard: 'Dashboard',
    tasks: 'My Tasks',
    archived: 'Completed Tasks',
    notes: 'Important Notes',
    meetings: 'Meeting Notes',
    cascades: 'Team Cascades',
    slack: 'Slack Alerts',
    notifications: 'Notifications',
    settings: 'Settings',
    login: 'Login'
  };
  document.getElementById('page-title').textContent = titles[currentPage] || 'Dashboard';

  // Show search button for pages with lists
  const searchBtn = document.getElementById('search-btn');
  const showSearch = ['tasks', 'archived', 'notes', 'meetings', 'cascades', 'slack'].includes(currentPage);
  if (searchBtn) {
    searchBtn.style.display = showSearch ? 'flex' : 'none';
  }
}

// ===== TOAST =====
function showToast(message, type = 'info', duration = 4000) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = 'toast show';
  toast.classList.add(type);
  setTimeout(() => {
    toast.classList.remove('show');
  }, duration);
}

// ===== FULL-WINDOW ALERTS =====
let activeAlert = null;

function showAlert(alertData) {
  activeAlert = alertData;
  const overlay = document.getElementById('alert-overlay');
  const title = document.getElementById('alert-title');
  const priority = document.getElementById('alert-priority');
  const body = document.getElementById('alert-body');
  const meta = document.getElementById('alert-meta');
  const actions = document.getElementById('alert-actions');

  title.textContent = alertData.title;
  priority.textContent = alertData.priority || 'Normal';
  priority.className = 'alert-priority priority-' + (alertData.priority || 'Normal');
  body.textContent = alertData.body || '';

  meta.innerHTML = '';
  if (alertData.source) {
    meta.innerHTML += `<span>📍 Source: ${alertData.source}</span>`;
  }
  if (alertData.timestamp) {
    meta.innerHTML += `<span>⏰ ${new Date(alertData.timestamp).toLocaleString()}</span>`;
  }
  if (alertData.deadline) {
    meta.innerHTML += `<span>📅 ${new Date(alertData.deadline).toLocaleString()}</span>`;
  }

  actions.innerHTML = '';

  // Acknowledge button
  const ackBtn = document.createElement('button');
  ackBtn.className = 'btn btn-secondary';
  ackBtn.textContent = 'Acknowledge';
  ackBtn.onclick = () => {
    API.acknowledgeNotification(alertData.notificationId).then(() => {
      showToast('Alert acknowledged', 'success');
      hideAlert();
    }).catch(err => showToast('Failed to acknowledge: ' + err.message, 'error'));
  };
  actions.appendChild(ackBtn);

  // Snooze button
  if (alertData.source === 'Tasks' && alertData.taskId) {
    const snoozeBtn = document.createElement('button');
    snoozeBtn.className = 'btn btn-outline';
    snoozeBtn.textContent = 'Snooze';
    snoozeBtn.onclick = () => {
      const snoozeOptions = ['15 min', '30 min', '1 hour', '2 hours', '4 hours', '1 day'];
      const selected = prompt('Snooze for how long?\n' + snoozeOptions.join('\n'), '1 hour');
      if (selected && snoozeOptions.includes(selected)) {
        const snoozeMap = {
          '15 min': 15, '30 min': 30, '1 hour': 60, '2 hours': 120,
          '4 hours': 240, '1 day': 1440
        };
        const minutes = snoozeMap[selected];
        const snoozeUntil = new Date(Date.now() + minutes * 60 * 1000).toISOString();
        API.updateTask(alertData.taskId, { snoozed_until: snoozeUntil }).then(() => {
          showToast(`Alert snoozed for ${selected}`, 'success');
          hideAlert();
        });
      }
    };
    actions.appendChild(snoozeBtn);
  }

  // Open Details button
  const detailsBtn = document.createElement('button');
  detailsBtn.className = 'btn btn-primary';
  detailsBtn.textContent = 'Open Details';
  detailsBtn.onclick = () => {
    if (alertData.url) {
      window.location.href = alertData.url;
    }
    hideAlert();
  };
  actions.appendChild(detailsBtn);

  // Mark Complete button (only for tasks)
  if (alertData.source === 'Tasks' && alertData.taskId) {
    const completeBtn = document.createElement('button');
    completeBtn.className = 'btn btn-danger';
    completeBtn.textContent = 'Mark Complete';
    completeBtn.onclick = () => {
      API.completeTask(alertData.taskId).then(() => {
        showToast('Task completed and archived', 'success');
        hideAlert();
      }).catch(err => showToast('Failed: ' + err.message, 'error'));
    };
    actions.insertBefore(completeBtn, actions.firstChild);
  }

  overlay.style.display = 'flex';

  // Play sound if enabled
  if (settings.sound_enabled === 'true' && alertData.priority === 'Urgent') {
    playAlertSound();
  }
}

function hideAlert() {
  const overlay = document.getElementById('alert-overlay');
  if (overlay) {
    overlay.style.display = 'none';
  }
  activeAlert = null;
}

function playAlertSound() {
  // Create a simple beep sound
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    oscillator.frequency.value = 880;
    gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.5);
  } catch (e) {
    console.log('Audio play failed:', e);
  }
}

async function checkActiveAlerts() {
  try {
    const alerts = await API.getActiveAlerts();
    if (alerts.length > 0 && settings.full_window_alerts === 'true') {
      // Show the most urgent alert
      const urgentAlert = alerts.find(a => a.priority === 'Urgent') || alerts[0];
      showAlert({
        title: urgentAlert.title,
        body: urgentAlert.body,
        priority: urgentAlert.priority,
        source: urgentAlert.source,
        timestamp: urgentAlert.created_at,
        notificationId: urgentAlert.id,
        taskId: urgentAlert.source_id && urgentAlert.source === 'Tasks' ? parseInt(urgentAlert.source_id) : null,
        url: '/dashboard.html#/notifications'
      });
    }
  } catch (e) {
    console.error('Failed to check alerts:', e);
  }
}

// ===== PAGE RENDERERS =====

async function renderLoginPage() {
  const container = document.getElementById('main-content');
  container.innerHTML = `
    <div style="display:flex; justify-content:center; align-items:center; height:70vh;">
      <div class="card" style="max-width:400px; width:100%;">
        <div class="card-header">
          <h2>🔐 Login</h2>
        </div>
        <form id="login-form">
          <div class="form-group">
            <label class="form-label">Username</label>
            <input type="text" name="username" class="form-input" required>
          </div>
          <div class="form-group">
            <label class="form-label">Password</label>
            <input type="password" name="password" class="form-input" required>
          </div>
          <div style="text-align:center; margin-top:20px;">
            <button type="submit" class="btn btn-primary">Login</button>
          </div>
        </form>
      </div>
    </div>
  `;

  document.getElementById('login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = e.target.username.value;
    const password = e.target.password.value;
    try {
      const result = await API.login(username, password);
      showToast('Login successful!', 'success');
      window.location.hash = '#/dashboard';
    } catch (err) {
      showToast('Login failed: ' + err.message, 'error');
    }
  });
}

async function renderDashboard() {
  const container = document.getElementById('main-content');
  container.innerHTML = '<p style="text-align:center; padding:40px;">📊 Loading your dashboard...</p>';

  try {
    const [tasks, archivedTasks, notes, meetings, cascades, slackAlerts, notifications, settingsData] = await Promise.all([
      API.getTasks(),
      API.getArchivedTasks(),
      API.getNotes(),
      API.getMeetings(),
      API.getCascades(),
      API.getSlackAlerts(),
      API.getNotifications(),
      API.getSettings()
    ]);

    settings = settingsData;

    const pendingTasks = tasks.filter(t => t.status === 'Pending' || t.status === 'In Progress');
    const urgentTasks = tasks.filter(t => t.priority === 'Urgent' && t.status !== 'Completed');
    const overdueTasks = tasks.filter(t => t.due_date && new Date(t.due_date) < new Date() && t.status !== 'Completed');
    const todayTasks = tasks.filter(t => {
      if (!t.due_date) return false;
      return new Date(t.due_date).toDateString() === new Date().toDateString();
    });
    const upcomingTasks = tasks.filter(t => {
      if (!t.due_date) return false;
      const due = new Date(t.due_date);
      const today = new Date();
      const diffDays = Math.ceil((due - today) / (1000 * 60 * 60 * 24));
      return diffDays > 0 && diffDays <= 7;
    });
    const completedRecently = archivedTasks.slice(0, 5);
    const pinnedNotes = notes.filter(n => n.pinned);
    const unreviewedAlerts = slackAlerts.filter(a => a.review_status === 'unreviewed');
    const pendingCascades = cascades.filter(c => c.status !== 'Cascaded');
    const upcomingMeetings = meetings.filter(m => {
      if (!m.date_time) return false;
      const mtgDate = new Date(m.date_time);
      const today = new Date();
      const diffDays = Math.ceil((mtgDate - today) / (1000 * 60 * 60 * 24));
      return diffDays >= 0 && diffDays <= 14 && !m.completed;
    });
    const followUps = meetings.filter(m => {
      if (!m.follow_up_date) return false;
      return new Date(m.follow_up_date) <= new Date() && !m.completed;
    });

    container.innerHTML = `
      <!-- Quick Actions -->
      <div class="quick-actions">
        <div class="quick-action-btn" onclick="window.location.hash='#/tasks?action=add'">
          <div class="qa-icon">➕</div>
          <div class="qa-text">Add Task</div>
        </div>
        <div class="quick-action-btn" onclick="showQuickNote()">
          <div class="qa-icon">📝</div>
          <div class="qa-text">Quick Note</div>
        </div>
        <div class="quick-action-btn" onclick="window.location.hash='#/meetings?action=add'">
          <div class="qa-icon">👥</div>
          <div class="qa-text">Meeting Notes</div>
        </div>
        <div class="quick-action-btn" onclick="window.location.hash='#/cascades?action=add'">
          <div class="qa-icon">📢</div>
          <div class="qa-text">New Cascade</div>
        </div>
        <div class="quick-action-btn" onclick="window.location.hash='#/slack'">
          <div class="qa-icon">💬</div>
          <div class="qa-text">View Slack Alerts</div>
        </div>
      </div>

      <!-- Notification Area -->
      <div id="notification-area" style="margin-bottom:20px;"></div>

      <!-- Widget Grid -->
      <div class="widget-grid">
        <div class="widget">
          <div class="widget-header">
            <span class="widget-title">⏳ Pending</span>
          </div>
          <div class="widget-count">${pendingTasks.length}</div>
          <ul class="widget-list">
            ${pendingTasks.slice(0, 5).map(t => `<li><span class="li-title">${t.title}</span><span class="li-meta">${t.priority}</span></li>`).join('')}
            ${pendingTasks.length > 5 ? `<li style="font-size:11px; color:var(--gray-text);">+${pendingTasks.length - 5} more</li>` : ''}
            ${pendingTasks.length === 0 ? '<li class="widget-empty">All caught up! 🎉</li>' : ''}
          </ul>
        </div>

        <div class="widget">
          <div class="widget-header">
            <span class="widget-title">🚨 Urgent</span>
          </div>
          <div class="widget-count count-urgent">${urgentTasks.length}</div>
          <ul class="widget-list">
            ${urgentTasks.slice(0, 3).map(t => `<li><span class="li-title">${t.title}</span><span class="li-meta">${new Date(t.due_date).toLocaleDateString()}</span></li>`).join('')}
            ${urgentTasks.length === 0 ? '<li class="widget-empty">No urgent tasks</li>' : ''}
          </ul>
        </div>

        <div class="widget">
          <div class="widget-header">
            <span class="widget-title">🔴 Overdue</span>
          </div>
          <div class="widget-count count-overdue">${overdueTasks.length}</div>
          <ul class="widget-list">
            ${overdueTasks.slice(0, 3).map(t => `<li><span class="li-title">${t.title}</span><span class="li-meta">${new Date(t.due_date).toLocaleDateString()}</span></li>`).join('')}
            ${overdueTasks.length === 0 ? '<li class="widget-empty">None overdue</li>' : ''}
          </ul>
        </div>

        <div class="widget">
          <div class="widget-header">
            <span class="widget-title">📅 Due Today</span>
          </div>
          <div class="widget-count count-today">${todayTasks.length}</div>
          <ul class="widget-list">
            ${todayTasks.slice(0, 3).map(t => `<li><span class="li-title">${t.title}</span><span class="li-meta">${t.priority}</span></li>`).join('')}
            ${todayTasks.length === 0 ? '<li class="widget-empty">Nothing due today</li>' : ''}
          </ul>
        </div>

        <div class="widget">
          <div class="widget-header">
            <span class="widget-title">📆 Upcoming</span>
          </div>
          <div class="widget-count count-upcoming">${upcomingTasks.length}</div>
          <ul class="widget-list">
            ${upcomingTasks.slice(0, 3).map(t => `<li><span class="li-title">${t.title}</span><span class="li-meta">${new Date(t.due_date).toLocaleDateString()}</span></li>`).join('')}
            ${upcomingTasks.length === 0 ? '<li class="widget-empty">Nothing upcoming</li>' : ''}
          </ul>
        </div>

        <div class="widget">
          <div class="widget-header">
            <span class="widget-title">💬 Slack Alerts</span>
          </div>
          <div class="widget-count" style="color:#ef4444;">${unreviewedAlerts.length}</div>
          <ul class="widget-list">
            ${unreviewedAlerts.slice(0, 3).map(a => `<li><span class="li-title">${a.message_preview}</span><span class="li-meta">${a.sender} in ${a.channel}</span></li>`).join('')}
            ${unreviewedAlerts.length === 0 ? '<li class="widget-empty">No new alerts</li>' : ''}
          </ul>
        </div>

        <div class="widget">
          <div class="widget-header">
            <span class="widget-title">📢 Cascades</span>
          </div>
          <div class="widget-count">${pendingCascades.length}</div>
          <ul class="widget-list">
            ${pendingCascades.slice(0, 3).map(c => `<li><span class="li-title">${c.title}</span><span class="li-meta">${c.status}</span></li>`).join('')}
            ${pendingCascades.length === 0 ? '<li class="widget-empty">All cascaded</li>' : ''}
          </ul>
        </div>

        <div class="widget">
          <div class="widget-header">
            <span class="widget-title">👥 Upcoming Meetings</span>
          </div>
          <div class="widget-count">${upcomingMeetings.length}</div>
          <ul class="widget-list">
            ${upcomingMeetings.slice(0, 3).map(m => `<li><span class="li-title">${m.title}</span><span class="li-meta">${new Date(m.date_time).toLocaleDateString()}</span></li>`).join('')}
            ${upcomingMeetings.length === 0 ? '<li class="widget-empty">No upcoming meetings</li>' : ''}
          </ul>
        </div>

        <div class="widget">
          <div class="widget-header">
            <span class="widget-title">📌 Pinned Notes</span>
          </div>
          <ul class="widget-list">
            ${pinnedNotes.slice(0, 4).map(n => `<li><span class="li-title">${n.title}</span></li>`).join('')}
            ${pinnedNotes.length === 0 ? '<li class="widget-empty">No pinned notes</li>' : ''}
          </ul>
        </div>

        <div class="widget">
          <div class="widget-header">
            <span class="widget-title">✅ Recently Completed</span>
          </div>
          <div class="widget-count">${completedRecently.length}</div>
          <ul class="widget-list">
            ${completedRecently.slice(0, 5).map(t => `<li><span class="li-title">${t.title}</span><span class="li-meta">${new Date(t.completed_at).toLocaleDateString()}</span></li>`).join('')}
          </ul>
        </div>
      </div>
    `;

    // Render active alerts in notification area
    const alertsContainer = document.getElementById('notification-area');
    const activeAlerts = notifications.filter(n => n.status === 'pending' && !n.delivered);
    if (activeAlerts.length > 0) {
      alertsContainer.innerHTML = activeAlerts.map(n => `
        <div class="card" style="margin-bottom:12px; background:var(--pink-lighter); border-color:var(--pink-primary);">
          <strong>${n.title}</strong> — ${n.body}
          <button onclick="acknowledgeAlert(${n.id})" class="btn btn-sm btn-secondary" style="float:right; margin-top:-8px;">Dismiss</button>
        </div>
      `).join('');
    }

  } catch (err) {
    container.innerHTML = `<p style="color:#ef4444; text-align:center; padding:40px;">Error loading dashboard: ${err.message}</p>`;
  }
}

async function acknowledgeAlert(id) {
  await API.acknowledgeNotification(id);
  renderDashboard();
}

function showQuickNote() {
  const title = prompt('Quick Note Title:');
  if (!title) return;
  const content = prompt('Note content:');
  if (!content) return;
  API.createNote({ title, content }).then(() => {
    showToast('Quick note saved!', 'success');
    if (currentPage === 'dashboard') renderDashboard();
  }).catch(err => showToast('Failed: ' + err.message, 'error'));
}

// ===== TASKS PAGE =====
async function renderTasksPage(taskId = null) {
  const container = document.getElementById('main-content');
  let editTask = null;

  // Check for action=add or task ID to edit
  const hash = window.location.hash;
  if (hash.includes('action=add') || taskId) {
    const isEdit = taskId && !hash.includes('action=add');
    container.innerHTML = await renderTaskForm(editTask, isEdit);
    return;
  }

  const tasks = await API.getTasks();
  const activeTasks = tasks.filter(t => t.status !== 'Completed');

  container.innerHTML = `
    <div class="card">
      <div class="card-header">
        <h2>📝 My Tasks</h2>
        <div class="actions">
          <button class="btn btn-primary btn-sm" onclick="window.location.hash='#/tasks?action=add'">➕ Add Task</button>
        </div>
      </div>
      <div class="card-body">
        ${renderTaskList(activeTasks)}
      </div>
    </div>
  `;
}

function renderTaskList(tasks) {
  if (!tasks || tasks.length === 0) {
    return '<p class="empty-state"><span class="emoji">🎉</span><br>No active tasks. Add one to get started!</p>';
  }

  const filters = ['All', 'Urgent', 'High', 'Normal', 'Low'];
  let activeFilter = 'All';

  return `
    <div class="filters" id="task-filters" style="margin-bottom:16px;">
      ${filters.map(f => `<button class="filter-chip" onclick="filterTasks('${f}')">${f}</button>`).join('')}
      <button class="filter-chip" onclick="filterByStatus('Pending')">Pending</button>
      <button class="filter-chip" onclick="filterByStatus('In Progress')">In Progress</button>
      <button class="filter-chip filter-chip-all" onclick="resetTaskFilters()">All</button>
    </div>
    <ul class="task-list" id="task-list">
      ${tasks.map(t => renderTaskItem(t)).join('')}
    </ul>
  `;
}

window.filterTasks = function(priority) {
  document.querySelectorAll('#task-filters .filter-chip').forEach(c => c.classList.remove('active'));
  event.target.classList.add('active');
};

window.filterByStatus = function(status) {
  // Will be implemented with actual filtering in a more complete version
};

window.resetTaskFilters = function() {
  document.querySelectorAll('#task-filters .filter-chip').forEach(c => c.classList.remove('active'));
};

function renderTaskItem(task) {
  const dueDate = task.due_date ? new Date(task.due_date).toLocaleString() : 'No deadline';
  const isCompleted = task.status === 'Completed' || task.archived;

  return `
    <li class="task-item ${isCompleted ? 'completed' : ''}" onclick="editTask(${task.id})">
      <div style="display:flex; align-items:center; gap:12px; flex:1; min-width:0;">
        <div class="task-checkbox ${isCompleted ? 'checked' : ''}" onclick="toggleTaskComplete(event, ${task.id})">
          ${isCompleted ? '✓' : ''}
        </div>
        <div class="task-info">
          <div class="task-title">${task.title}</div>
          <div class="task-meta">
            <span class="priority-badge priority-${task.priority}">${task.priority}</span>
            <span class="status-badge status-${task.status}">${task.status}</span>
            <span>📅 ${dueDate}</span>
            ${task.category ? `<span>🏷 ${task.category}</span>` : ''}
          </div>
        </div>
      </div>
      <div class="task-actions" onclick="event.stopPropagation()">
        <button onclick="editTask(${task.id})" title="Edit">✎</button>
        <button onclick="deleteTask(${task.id})" title="Delete">✕</button>
      </div>
    </li>
  `;
}

async function editTask(id) {
  const task = await API.getTask(id);
  const container = document.getElementById('main-content');
  container.innerHTML = await renderTaskForm(task, true);
}

async function toggleTaskComplete(e, id) {
  e.stopPropagation();
  try {
    const task = await API.getTask(id);
    if (task.status === 'Completed') {
      await API.restoreTask(id);
      showToast('Task restored', 'success');
    } else {
      await API.completeTask(id);
      showToast('Task completed and archived', 'success');
    }
    if (currentPage === 'tasks') renderTasksPage();
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

async function deleteTask(id) {
  if (!confirm('Permanently delete this task?')) return;
  try {
    await API.deleteTask(id);
    showToast('Task deleted', 'success');
    if (currentPage === 'tasks') renderTasksPage();
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

async function renderTaskForm(task = null, isEdit = false) {
  const categories = ['General', 'Development', 'Marketing', 'Operations', 'Sales', 'HR', 'Finance', 'Legal'];
  const priorities = ['Urgent', 'High', 'Normal', 'Low'];
  const statuses = ['Pending', 'In Progress'];

  return `
    <div class="card">
      <div class="card-header">
        <h2>${isEdit ? '✏️ Edit Task' : '➕ Add Task'}</h2>
        <button class="btn btn-outline btn-sm" onclick="cancelTaskEdit()">Cancel</button>
      </div>
      <form id="task-form" onsubmit="saveTask(event)">
        <input type="hidden" id="task-id" value="${task ? task.id : ''}">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Title *</label>
            <input type="text" id="task-title" class="form-input" required value="${task ? task.title : ''}">
          </div>
          <div class="form-group">
            <label class="form-label">Priority</label>
            <select id="task-priority" class="form-select">
              ${priorities.map(p => `<option value="${p}" ${task?.priority === p ? 'selected' : ''}>${p}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Status</label>
            <select id="task-status" class="form-select">
              ${statuses.map(s => `<option value="${s}" ${task?.status === s ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Category</label>
            <select id="task-category" class="form-select">
              <option value="">None</option>
              ${categories.map(c => `<option value="${c}" ${task?.category === c ? 'selected' : ''}>${c}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Due Date</label>
            <input type="datetime-local" id="task-due-date" class="form-input" value="${task?.due_date ? formatDatetimeLocal(task.due_date) : ''}">
          </div>
          <div class="form-group">
            <label class="form-label">Reminder Time</label>
            <input type="datetime-local" id="task-reminder" class="form-input" value="${task?.reminder_time ? formatDatetimeLocal(task.reminder_time) : ''}">
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Recurring (optional)</label>
          <input type="text" id="task-recurring" class="form-input" placeholder="e.g., daily, weekly, monthly" value="${task?.recurring || ''}">
        </div>

        <div class="form-group">
          <label class="form-label">Description</label>
          <textarea id="task-description" class="form-textarea" placeholder="Add a description...">${task?.description || ''}</textarea>
        </div>

        <div class="form-group">
          <label class="form-label">Notes</label>
          <textarea id="task-notes" class="form-textarea" placeholder="Task notes...">${task?.notes || ''}</textarea>
        </div>

        <div class="form-group">
          <label class="form-label">Checklist (one item per line)</label>
          <textarea id="task-checklist" class="form-textarea" placeholder="e.g.,\nReview code\nTest on staging\nDeploy to production">${
            task?.checklist ? task.checklist.map(item => (item.done ? '✓ ' : '') + item.text).join('\n') : ''
          }</textarea>
        </div>

        <div style="text-align:right; margin-top:20px;">
          <button type="submit" class="btn btn-primary">${isEdit ? 'Update Task' : 'Create Task'}</button>
        </div>
      </form>
    </div>
  `;
}

window.cancelTaskEdit = function() {
  window.location.hash = '#/tasks';
};

window.saveTask = async function(e) {
  e.preventDefault();
  const id = document.getElementById('task-id').value;
  const title = document.getElementById('task-title').value;
  const description = document.getElementById('task-description').value;
  const priority = document.getElementById('task-priority').value;
  const status = document.getElementById('task-status').value;
  const category = document.getElementById('task-category').value;
  const dueDate = document.getElementById('task-due-date').value || null;
  const reminder = document.getElementById('task-reminder').value || null;
  const recurring = document.getElementById('task-recurring').value || null;
  const notes = document.getElementById('task-notes').value || null;

  // Parse checklist
  const checklistText = document.getElementById('task-checklist').value || '';
  const checklist = checklistText.split('\n')
    .filter(line => line.trim())
    .map(line => ({
      text: line.replace(/^✓\s*/, '').trim(),
      done: line.startsWith('✓')
    }));

  const taskData = {
    title, description, priority, status, category,
    due_date: dueDate, reminder_time: reminder, recurring, notes, checklist
  };

  try {
    if (id) {
      await API.updateTask(id, taskData);
      showToast('Task updated', 'success');
    } else {
      await API.createTask(taskData);
      showToast('Task created', 'success');
    }
    window.location.hash = '#/tasks';
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
};

function formatDatetimeLocal(dt) {
  if (!dt) return '';
  const d = new Date(dt);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ===== ARCHIVED TASKS PAGE =====
async function renderArchivedTasks() {
  const container = document.getElementById('main-content');
  const archived = await API.getArchivedTasks();

  container.innerHTML = `
    <div class="card">
      <div class="card-header">
        <h2>📦 Completed / Archived Tasks</h2>
        <div class="actions">
          <input type="text" id="archive-search" class="form-input" style="width:200px; padding:8px 12px; font-size:13px;" placeholder="Search archived..." oninput="searchArchivedTasks()">
        </div>
      </div>
      <div class="card-body">
        ${archived.length === 0
          ? '<p class="empty-state"><span class="emoji">📦</span><br>No archived tasks yet.</p>'
          : `<ul class="task-list">${archived.map(t => renderTaskItem(t)).join('')}</ul>`
        }
      </div>
    </div>
  `;
}

window.searchArchivedTasks = async function() {
  const q = document.getElementById('archive-search').value;
  const archived = await API.getArchivedTasks(q);
  document.querySelector('#archived-container .card-body').innerHTML = archived.length === 0
    ? '<p class="empty-state">No matching tasks found.</p>'
    : `<ul class="task-list">${archived.map(t => renderTaskItem(t)).join('')}</ul>`;
};

async function restoreArchivedTask(id) {
  await API.restoreTask(id);
  showToast('Task restored to active list', 'success');
  renderArchivedTasks();
}

// ===== NOTES PAGE =====
async function renderNotesPage(noteId = null) {
  const container = document.getElementById('main-content');
  const notes = await API.getNotes();

  if (noteId) {
    const note = await API.getNote(noteId);
    container.innerHTML = await renderNoteForm(note, true);
    return;
  }

  const hash = window.location.hash;
  if (hash.includes('archive')) {
    const archivedNotes = notes.filter(n => n.archived);
    container.innerHTML = renderArchivedNotes(archivedNotes);
    return;
  }

  container.innerHTML = `
    <div class="card">
      <div class="card-header">
        <h2>📝 Important Notes</h2>
        <div class="actions">
          <button class="btn btn-primary btn-sm" onclick="window.location.hash='#/notes?action=add'">➕ New Note</button>
          <button class="btn btn-secondary btn-sm" onclick="window.location.hash='#/notes?archive=1'">📦 Archived</button>
        </div>
      </div>
      <div class="card-body">
        ${notes.length === 0
          ? '<p class="empty-state"><span class="emoji">📝</span><br>No notes yet. Create your first note!</p>'
          : renderNoteGrid(notes)
        }
      </div>
    </div>
  `;
}

function renderNoteGrid(notes) {
  return `
    <div style="display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:16px;">
      ${notes.map(n => `
        <div class="card" style="cursor:pointer;" onclick="editNote(${n.id})">
          <div class="card-header">
            <h3 style="font-size:16px; color:var(--pink-dark);">${n.title}</h3>
            <div style="display:flex; gap:6px;">
              ${n.pinned ? '<span title="Pinned">📌</span>' : ''}
              ${n.important ? '<span title="Important">⭐</span>' : ''}
            </div>
          </div>
          <div class="card-body">
            <p style="font-size:13px; color:var(--gray-text); max-height:100px; overflow:hidden;">${(n.content || '').substring(0, 200)}${(n.content || '').length > 200 ? '...' : ''}</p>
            ${n.category ? `<span class="priority-badge priority-Normal" style="margin-top:8px; display:inline-block;">${n.category}</span>` : ''}
            ${n.tags ? `<div style="margin-top:8px; font-size:12px; color:var(--gray-text);">${JSON.parse(n.tags).map(t => `#${t}`).join(' ')}</div>` : ''}
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderArchivedNotes(notes) {
  return `
    <div class="card">
      <div class="card-header">
        <h2>📦 Archived Notes</h2>
        <button class="btn btn-secondary btn-sm" onclick="window.location.hash='#/notes'">← Back to Notes</button>
      </div>
      <div class="card-body">
        ${notes.length === 0
          ? '<p class="empty-state">No archived notes.</p>'
          : renderNoteGrid(notes)
        }
      </div>
    </div>
  `;
}

async function renderNoteForm(note = null, isEdit = false) {
  return `
    <div class="card">
      <div class="card-header">
        <h2>${isEdit ? '✏️ Edit Note' : '➕ New Note'}</h2>
        <button class="btn btn-outline btn-sm" onclick="window.location.hash='#/notes'">Cancel</button>
      </div>
      <form id="note-form" onsubmit="saveNote(event)">
        <input type="hidden" id="note-id" value="${note ? note.id : ''}">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Title *</label>
            <input type="text" id="note-title" class="form-input" required value="${note ? note.title : ''}">
          </div>
          <div class="form-group">
            <label class="form-label">Category</label>
            <input type="text" id="note-category" class="form-input" placeholder="e.g., Work, Personal" value="${note ? note.category : ''}">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Content</label>
          <textarea id="note-content" class="form-textarea" placeholder="Write your note here...">${note ? note.content : ''}</textarea>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Tags (comma separated)</label>
            <input type="text" id="note-tags" class="form-input" placeholder="e.g., important, review, q4" value="${note?.tags ? JSON.parse(note.tags).join(', ') : ''}">
          </div>
          <div class="form-group" style="display:flex; align-items:flex-end; gap:12px;">
            <label style="display:flex; align-items:center; gap:6px; font-size:13px;">
              <input type="checkbox" id="note-pinned" ${note?.pinned ? 'checked' : ''}> Pin to dashboard
            </label>
            <label style="display:flex; align-items:center; gap:6px; font-size:13px;">
              <input type="checkbox" id="note-important" ${note?.important ? 'checked' : ''}> Mark important
            </label>
          </div>
        </div>
        <div style="text-align:right; margin-top:20px;">
          <button type="submit" class="btn btn-primary">${isEdit ? 'Update Note' : 'Save Note'}</button>
        </div>
      </form>
    </div>
  `;
}

window.editNote = async function(id) {
  const note = await API.getNote(id);
  const container = document.getElementById('main-content');
  container.innerHTML = await renderNoteForm(note, true);
};

window.saveNote = async function(e) {
  e.preventDefault();
  const id = document.getElementById('note-id').value;
  const title = document.getElementById('note-title').value;
  const content = document.getElementById('note-content').value;
  const category = document.getElementById('note-category').value;
  const tagsText = document.getElementById('note-tags').value;
  const tags = tagsText ? tagsText.split(',').map(t => t.trim()).filter(Boolean) : [];
  const pinned = document.getElementById('note-pinned').checked;
  const important = document.getElementById('note-important').checked;

  const noteData = { title, content, category, tags, pinned, important };

  try {
    if (id) {
      await API.updateNote(id, noteData);
      showToast('Note updated', 'success');
    } else {
      await API.createNote(noteData);
      showToast('Note created', 'success');
    }
    window.location.hash = '#/notes';
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
};

// ===== MEETINGS PAGE =====
async function renderMeetingsPage(meetingId = null) {
  const container = document.getElementById('main-content');
  const meetings = await API.getMeetings();

  const hash = window.location.hash;
  if (hash.includes('action=add') || meetingId) {
    container.innerHTML = await renderMeetingForm(meetingId ? await API.getMeeting(meetingId) : null, !!meetingId);
    return;
  }

  container.innerHTML = `
    <div class="card">
      <div class="card-header">
        <h2>👥 Meeting Notes</h2>
        <div class="actions">
          <button class="btn btn-primary btn-sm" onclick="window.location.hash='#/meetings?action=add'">➕ New Meeting</button>
        </div>
      </div>
      <div class="card-body">
        ${meetings.length === 0
          ? '<p class="empty-state"><span class="emoji">👥</span><br>No meeting notes yet.</p>'
          : renderMeetingList(meetings)
        }
      </div>
    </div>
  `;
}

function renderMeetingList(meetings) {
  return `
    <table>
      <thead>
        <tr>
          <th>Title</th>
          <th>Date</th>
          <th>Follow-up</th>
          <th>Project</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${meetings.map(m => `
          <tr>
            <td><strong>${m.title}</strong></td>
            <td>${m.date_time ? new Date(m.date_time).toLocaleString() : '—'}</td>
            <td>${m.follow_up_date ? new Date(m.follow_up_date).toLocaleDateString() : '—'}</td>
            <td>${m.project || '—'}</td>
            <td>
              <button onclick="editMeeting(${m.id})" class="btn btn-outline btn-sm">✏️ Edit</button>
              <button onclick="archiveMeeting(${m.id})" class="btn btn-secondary btn-sm">📦</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

async function renderMeetingForm(meeting = null) {
  return `
    <div class="card">
      <div class="card-header">
        <h2>${meeting ? '✏️ Edit Meeting' : '➕ New Meeting'}</h2>
        <button class="btn btn-outline btn-sm" onclick="window.location.hash='#/meetings'">Cancel</button>
      </div>
      <form id="meeting-form" onsubmit="saveMeeting(event)">
        <input type="hidden" id="meeting-id" value="${meeting ? meeting.id : ''}">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Title *</label>
            <input type="text" id="meeting-title" class="form-input" required value="${meeting ? meeting.title : ''}">
          </div>
          <div class="form-group">
            <label class="form-label">Date & Time</label>
            <input type="datetime-local" id="meeting-datetime" class="form-input" value="${meeting?.date_time ? formatDatetimeLocal(meeting.date_time) : ''}">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Attendees</label>
          <input type="text" id="meeting-attendees" class="form-input" placeholder="Name, Name, Name" value="${meeting ? meeting.attendees : ''}">
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Project / Department</label>
            <input type="text" id="meeting-project" class="form-input" value="${meeting ? meeting.project : ''}">
          </div>
          <div class="form-group">
            <label class="form-label">Follow-up Date</label>
            <input type="date" id="meeting-followup" class="form-input" value="${meeting?.follow_up_date ? new Date(meeting.follow_up_date).toISOString().split('T')[0] : ''}">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Agenda</label>
          <textarea id="meeting-agenda" class="form-textarea" placeholder="Meeting agenda...">${meeting ? meeting.agenda : ''}</textarea>
        </div>
        <div class="form-group">
          <label class="form-label">Discussion Notes</label>
          <textarea id="meeting-discussion" class="form-textarea" placeholder="Key discussion points...">${meeting ? meeting.discussion_notes : ''}</textarea>
        </div>
        <div class="form-group">
          <label class="form-label">Decisions Made</label>
          <textarea id="meeting-decisions" class="form-textarea" placeholder="Decisions documented...">${meeting ? meeting.decisions : ''}</textarea>
        </div>
        <div class="form-group">
          <label class="form-label">Action Items (one per line: "description, assignee, due date")</label>
          <textarea id="meeting-actions" class="form-textarea" placeholder="Review PR, John, 2024-01-15\nSchedule follow-up, Sarah, 2024-01-20">${meeting?.action_items ? JSON.parse(meeting.action_items).map(a => `${a.description}, ${a.assignee || ''}, ${a.due_date || ''}`).join('\n') : ''}</textarea>
        </div>
        <div style="text-align:right; margin-top:20px;">
          <button type="submit" class="btn btn-primary">${meeting ? 'Update Meeting' : 'Save Meeting'}</button>
        </div>
      </form>
    </div>
  `;
}

window.editMeeting = async function(id) {
  const meeting = await API.getMeeting(id);
  const container = document.getElementById('main-content');
  container.innerHTML = await renderMeetingForm(meeting);
};

window.archiveMeeting = async function(id) {
  await API.archiveMeeting(id);
  showToast('Meeting archived', 'success');
  renderMeetingsPage();
};

window.saveMeeting = async function(e) {
  e.preventDefault();
  const id = document.getElementById('meeting-id').value;
  const title = document.getElementById('meeting-title').value;
  const date_time = document.getElementById('meeting-datetime').value || null;
  const attendees = document.getElementById('meeting-attendees').value || null;
  const project = document.getElementById('meeting-project').value || null;
  const follow_up_date = document.getElementById('meeting-followup').value || null;
  const agenda = document.getElementById('meeting-agenda').value || null;
  const discussion_notes = document.getElementById('meeting-discussion').value || null;
  const decisions = document.getElementById('meeting-decisions').value || null;

  // Parse action items
  const actionsText = document.getElementById('meeting-actions').value || '';
  const action_items = actionsText.split('\n')
    .filter(line => line.trim())
    .map(line => {
      const parts = line.split(',').map(p => p.trim());
      return {
        description: parts[0] || '',
        assignee: parts[1] || '',
        due_date: parts[2] || '',
        completed: false
      };
    });

  const meetingData = {
    title, date_time, attendees, project, follow_up_date,
    agenda, discussion_notes, decisions, action_items
  };

  try {
    if (id) {
      await API.updateMeeting(id, meetingData);
      showToast('Meeting updated', 'success');
    } else {
      await API.createMeeting(meetingData);
      showToast('Meeting created', 'success');
    }
    window.location.hash = '#/meetings';
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
};

// ===== CASCADES PAGE =====
async function renderCascadesPage(cascadeId = null) {
  const container = document.getElementById('main-content');
  const cascased = await API.getCascades();
  const hash = window.location.hash;

  if (hash.includes('action=add') || cascadeId) {
    container.innerHTML = await renderCascadeForm(cascadeId ? await API.getCascade(cascadeId) : null);
    return;
  }

  const tabs = [
    { key: 'To Cascade', label: 'To Cascade', filter: c => c.status === 'To Cascade' },
    { key: 'Scheduled', label: 'Scheduled', filter: c => c.status === 'Scheduled' },
    { key: 'overdue', label: 'Overdue', filter: () => true },
    { key: 'Cascaded', label: 'Completed', filter: c => c.status === 'Cascaded' }
  ];

  container.innerHTML = `
    <div class="card">
      <div class="card-header">
        <h2>📢 Team Cascades</h2>
        <div class="actions">
          <button class="btn btn-primary btn-sm" onclick="window.location.hash='#/cascades?action=add'">➕ New Cascade</button>
        </div>
      </div>
      <div class="tabs">
        <button class="tab active" onclick="switchCascadeTab('all')">All</button>
        <button class="tab" onclick="switchCascadeTab('To Cascade')">To Cascade</button>
        <button class="tab" onclick="switchCascadeTab('Scheduled')">Scheduled</button>
        <button class="tab" onclick="switchCascadeTab('overdue')">Overdue</button>
        <button class="tab" onclick="switchCascadeTab('Cascaded')">Completed</button>
      </div>
      <div class="card-body">
        <div id="cascade-list-container">
          ${renderCascadeList(cascades)}
        </div>
      </div>
    </div>
  `;
}

function renderCascadeList(cascades) {
  if (!cascades || cascades.length === 0) {
    return '<p class="empty-state"><span class="emoji">📢</span><br>No cascades found.</p>';
  }

  return `
    <table>
      <thead>
        <tr>
          <th>Title</th>
          <th>Priority</th>
          <th>Deadline</th>
          <th>Status</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${cascades.map(c => `
          <tr>
            <td><strong>${c.title}</strong></td>
            <td><span class="priority-badge priority-${c.priority}">${c.priority}</span></td>
            <td>${c.deadline ? new Date(c.deadline).toLocaleDateString() : '—'}</td>
            <td><span class="status-badge status-${c.status}">${c.status}</span></td>
            <td>
              <button onclick="editCascade(${c.id})" class="btn btn-outline btn-sm">✏️</button>
              ${c.status !== 'Cascaded' ? `<button onclick="markCascadeCascaded(${c.id})" class="btn btn-sm" style="background:#dcfce7; color:#166534;">✓ Cascaded</button>` : ''}
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

window.switchCascadeTab = async function(tab) {
  const cascades = await API.getCascades();
  let filtered;
  if (tab === 'all') {
    filtered = cascades;
  } else if (tab === 'overdue') {
    filtered = cascades.filter(c => c.status !== 'Cascaded' && c.deadline && new Date(c.deadline) < new Date());
  } else {
    filtered = cascades.filter(c => c.status === tab);
  }
  document.getElementById('cascade-list-container').innerHTML = renderCascadeList(filtered);
};

async function renderCascadeForm(cascade = null) {
  return `
    <div class="card">
      <div class="card-header">
        <h2>${cascade ? '✏️ Edit Cascade' : '➕ New Cascade'}</h2>
        <button class="btn btn-outline btn-sm" onclick="cancelCascadeEdit()">Cancel</button>
      </div>
      <form id="cascade-form" onsubmit="saveCascade(event)">
        <input type="hidden" id="cascade-id" value="${cascade ? cascade.id : ''}">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Title *</label>
            <input type="text" id="cascade-title" class="form-input" required value="${cascade ? cascade.title : ''}">
          </div>
          <div class="form-group">
            <label class="form-label">Priority</label>
            <select id="cascade-priority" class="form-select">
              <option value="Urgent" ${cascade?.priority === 'Urgent' ? 'selected' : ''}>Urgent</option>
              <option value="High" ${cascade?.priority === 'High' ? 'selected' : ''}>High</option>
              <option value="Normal" ${cascade?.priority === 'Normal' ? 'selected' : ''}>Normal</option>
              <option value="Low" ${cascade?.priority === 'Low' ? 'selected' : ''}>Low</option>
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Brand / Department</label>
            <input type="text" id="cascade-brand" class="form-input" value="${cascade ? cascade.brand : ''}">
          </div>
          <div class="form-group">
            <label class="form-label">Project</label>
            <input type="text" id="cascade-project" class="form-input" value="${cascade ? cascade.project : ''}">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Deadline to Cascade</label>
          <input type="datetime-local" id="cascade-deadline" class="form-input" value="${cascade?.deadline ? formatDatetimeLocal(cascade.deadline) : ''}">
        </div>
        <div class="form-group">
          <label class="form-label">Status</label>
          <select id="cascade-status" class="form-select">
            <option value="To Cascade" ${cascade?.status === 'To Cascade' ? 'selected' : ''}>To Cascade</option>
            <option value="Scheduled" ${cascade?.status === 'Scheduled' ? 'selected' : ''}>Scheduled</option>
            <option value="Cascaded" ${cascade?.status === 'Cascaded' ? 'selected' : ''}>Cascaded</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Details</label>
          <textarea id="cascade-details" class="form-textarea" placeholder="Cascade details...">${cascade ? cascade.details : ''}</textarea>
        </div>
        <div class="form-group">
          <label class="form-label">Follow-up Notes</label>
          <textarea id="cascade-followup" class="form-textarea" placeholder="Notes after cascading...">${cascade ? cascade.follow_up_notes : ''}</textarea>
        </div>
        <div class="form-group">
          <label class="form-label">Slack Link / Document</label>
          <input type="url" id="cascade-link" class="form-input" placeholder="https://..." value="${cascade ? cascade.slack_link : ''}">
        </div>
        <div style="text-align:right; margin-top:20px;">
          <button type="submit" class="btn btn-primary">${cascade ? 'Update Cascade' : 'Create Cascade'}</button>
        </div>
      </form>
    </div>
  `;
}

window.editCascade = async function(id) {
  const cascade = await API.getCascade(id);
  const container = document.getElementById('main-content');
  container.innerHTML = await renderCascadeForm(cascade);
};

window.cancelCascadeEdit = function() {
  window.location.hash = '#/cascades';
};

window.markCascadeCascaded = async function(id) {
  if (!confirm('Mark this cascade as Cascaded?')) return;
  await API.markCascadeCascaded(id);
  showToast('Cascade marked as complete', 'success');
  renderCascadesPage();
};

window.saveCascade = async function(e) {
  e.preventDefault();
  const id = document.getElementById('cascade-id').value;
  const cascadeData = {
    title: document.getElementById('cascade-title').value,
    details: document.getElementById('cascade-details').value || null,
    brand: document.getElementById('cascade-brand').value || null,
    department: null,
    project: document.getElementById('cascade-project').value || null,
    priority: document.getElementById('cascade-priority').value || 'Normal',
    deadline: document.getElementById('cascade-deadline').value || null,
    status: document.getElementById('cascade-status').value || 'To Cascade',
    follow_up_notes: document.getElementById('cascade-followup').value || null,
    slack_link: document.getElementById('cascade-link').value || null
  };

  try {
    if (id) {
      await API.updateCascade(id, cascadeData);
      showToast('Cascade updated', 'success');
    } else {
      await API.createCascade(cascadeData);
      showToast('Cascade created', 'success');
    }
    window.location.hash = '#/cascades';
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
};

// ===== SLACK ALERTS PAGE =====
async function renderSlackPage(alertId = null) {
  const container = document.getElementById('main-content');
  const alerts = await API.getSlackAlerts();

  const hash = window.location.hash;
  if (hash.includes('archived')) {
    const archivedAlerts = await API.getArchivedSlackAlerts();
    container.innerHTML = `
      <div class="card">
        <div class="card-header"><h2>📦 Archived Slack Alerts</h2>
        <button class="btn btn-secondary btn-sm" onclick="window.location.hash='#/slack'">← Back</button>
        </div>
        <div class="card-body">${renderSlackList(archivedAlerts)}</div>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="card">
      <div class="card-header">
        <h2>💬 Slack Alerts</h2>
        <div class="actions">
          <button class="btn btn-secondary btn-sm" onclick="window.location.hash='#/slack?archived=1'">📦 Archived</button>
        </div>
      </div>
      <div class="card-body">
        ${renderSlackList(alerts)}
      </div>
    </div>
  `;
}

function renderSlackList(alerts) {
  if (!alerts || alerts.length === 0) {
    return '<p class="empty-state"><span class="emoji">💬</span><br>No Slack alerts.</p>';
  }

  return `
    <table>
      <thead>
        <tr>
          <th>Message</th>
          <th>Sender</th>
          <th>Channel</th>
          <th>Reason</th>
          <th>Status</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${alerts.map(a => `
          <tr>
            <td><strong>${a.message_preview || 'No message'}</strong></td>
            <td>${a.sender || '—'}</td>
            <td>${a.channel || '—'}</td>
            <td>${a.urgency_reason || '—'}</td>
            <td><span class="priority-badge priority-${a.review_status === 'unreviewed' ? 'Urgent' : 'Normal'}">${a.review_status}</span></td>
            <td>
              <button onclick="convertAlertToTask(${a.id})" class="btn btn-outline btn-sm" title="Convert to Task">➕</button>
              <button onclick="convertAlertToCascade(${a.id})" class="btn btn-outline btn-sm" title="Create Cascade">📢</button>
              <button onclick="markAlertReviewed(${a.id})" class="btn btn-outline btn-sm" title="Mark Reviewed">✓</button>
              <button onclick="archiveSlackAlert(${a.id})" class="btn btn-outline btn-sm" title="Archive">📦</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

window.convertAlertToTask = async function(alertId) {
  const alert = await API.getSlackAlert(alertId);
  window.location.hash = '#/tasks?action=add';
  // We'll prefill the task form with the alert data
  setTimeout(() => {
    const titleInput = document.getElementById('task-title');
    const descInput = document.getElementById('task-description');
    if (titleInput) titleInput.value = `From Slack: ${alert.message_preview.substring(0, 80)}`;
    if (descInput) descInput.value = `Sent by ${alert.sender} in #${alert.channel}\n\n${alert.message_preview}\n\nOriginal link: ${alert.slack_link}`;
    document.getElementById('task-category').value = 'Slack';
  }, 500);
};

window.convertAlertToCascade = async function(alertId) {
  const alert = await API.getSlackAlert(alertId);
  const cascade = await API.createCascade({
    title: `From Slack: ${alert.message_preview.substring(0, 80)}`,
    details: alert.message_preview,
    priority: 'High',
    slack_link: alert.slack_link,
    status: 'To Cascade'
  });
  await API.updateSlackAlert(alertId, { converted_cascade_id: cascade.id });
  showToast('Cascade created from Slack alert', 'success');
  renderSlackPage();
};

window.markAlertReviewed = async function(id) {
  await API.updateSlackAlert(id, { review_status: 'reviewed' });
  showToast('Alert marked as reviewed', 'success');
  renderSlackPage();
};

window.archiveSlackAlert = async function(id) {
  await API.archiveSlackAlert(id);
  showToast('Alert archived', 'success');
  renderSlackPage();
};

// ===== NOTIFICATIONS PAGE =====
async function renderNotificationsPage() {
  const container = document.getElementById('main-content');
  const notifications = await API.getNotifications();

  container.innerHTML = `
    <div class="card">
      <div class="card-header">
        <h2>🔔 Notification History</h2>
      </div>
      <div class="card-body">
        ${notifications.length === 0
          ? '<p class="empty-state"><span class="emoji">🔔</span><br>No notification history.</p>'
          : `
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Source</th>
                  <th>Title</th>
                  <th>Body</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${notifications.map(n => `
                  <tr>
                    <td>${new Date(n.created_at).toLocaleString()}</td>
                    <td>${n.source || '—'}</td>
                    <td>${n.title}</td>
                    <td>${n.body || '—'}</td>
                    <td><span class="priority-badge priority-${n.priority || 'Normal'}">${n.status || 'pending'}</span></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          `
        }
      </div>
    </div>
  `;
}

// ===== SETTINGS PAGE =====
async function renderSettingsPage() {
  const container = document.getElementById('main-content');

  // Render PWA install button if applicable
  let installHtml = '';
  if (deferredPrompt) {
    installHtml = `<button id="install-btn" class="btn btn-primary btn-sm">📲 Install App (PWA)</button>`;
  }

  container.innerHTML = `
    <div class="card">
      <div class="card-header">
        <h2>⚙ Settings</h2>
        ${installHtml}
      </div>
      <div class="card-body">
        <div class="tabs">
          <button class="tab active" onclick="switchSettingsTab('notifications')">Notifications</button>
          <button class="tab" onclick="switchSettingsTab('devices')">Devices</button>
          <button class="tab" onclick="switchSettingsTab('pwa')">PWA & Install</button>
          <button class="tab" onclick="switchSettingsTab('data')">Data</button>
        </div>

        <div id="settings-notifications" class="tab-content active">
          <h3 style="margin:20px 0 12px; color:var(--pink-dark);">Notification Settings</h3>
          ${renderNotificationSettingsForm()}
        </div>

        <div id="settings-devices" class="tab-content">
          <h3 style="margin:20px 0 12px; color:var(--pink-dark);">Connected Devices</h3>
          <div id="devices-list">Loading...</div>
        </div>

        <div id="settings-pwa" class="tab-content">
          <h3 style="margin:20px 0 12px; color:var(--pink-dark);">PWA & Installation</h3>
          <p style="color:var(--gray-text); margin-bottom:16px;">
            You can install this dashboard as a Progressive Web App on your device.
          </p>
          <ul style="color:var(--gray-text); line-height:1.8;">
            <li><strong>Android:</strong> Open the dashboard in Chrome, tap the three-dot menu → "Install app"</li>
            <li><strong>iPhone/iPad:</strong> Open in Safari → Share button → "Add to Home Screen"
              <ul style="margin-left:20px; margin-top:4px;">
                <li>Web Push notifications require iOS 16.4+ and Safari</li>
                <li>After adding to Home Screen, open the app and allow notification permissions</li>
              </ul>
            </li>
          </ul>
          ${installHtml ? installHtml : '<p style="color:var(--gray-text);">PWA install prompt will appear when your browser supports it.</p>'}
        </div>

        <div id="settings-data" class="tab-content">
          <h3 style="margin:20px 0 12px; color:var(--pink-dark);">Data Management</h3>
          <button class="btn btn-primary" onclick="exportData()">📥 Export All Data</button>
          <p style="color:var(--gray-text); font-size:12px; margin-top:8px;">
            Export downloads a JSON file with all your tasks, notes, meetings, cascades, and alerts.
          </p>
          <h3 style="margin:20px 0 12px; color:var(--pink-dark);">Quick Note</h3>
          <div style="display:flex; gap:8px; margin-bottom:12px;">
            <input type="text" id="quick-note-title" class="form-input" placeholder="Title" style="flex:1;">
            <button class="btn btn-secondary btn-sm" onclick="saveQuickNote()">Save</button>
          </div>
          <div>
            <textarea id="quick-note-content" class="form-textarea" placeholder="Quick note content..." style="min-height:80px;"></textarea>
          </div>
        </div>
      </div>
    </div>
  `;

  // Load devices and populate settings
  loadDevices();
}

function renderNotificationSettingsForm() {
  const keys = [
    'full_window_alerts',
    'desktop_notifications',
    'phone_push_notifications',
    'sound_enabled',
    'critical_alert_override'
  ];

  return `
    <form id="notification-settings-form">
      ${keys.map(key => {
        const label = {
          full_window_alerts: 'Full-window alerts (when dashboard is open)',
          desktop_notifications: 'Desktop system notifications',
          phone_push_notifications: 'Phone push notifications',
          sound_enabled: 'Sound on urgent alerts',
          critical_alert_override: 'Critical alerts override quiet hours'
        }[key];
        const checked = settings[key] === 'true';

        return `
          <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-bottom:1px solid var(--pink-lighter);">
            <label style="font-size:13px; color:var(--dark-gray);">${label}</label>
            <label class="switch" style="position:relative; display:inline-block; width:40px; height:20px;">
              <input type="checkbox" data-key="${key}" ${checked ? 'checked' : ''}
                onchange="toggleSetting(this)">
              <span style="position:absolute; content:''; top:0; left:0; right:0; bottom:0; background:${checked ? 'var(--pink-primary)' : 'var(--soft-gray)'}; border-radius:20px; transition:var(--transition);"></span>
              <span style="position:absolute; content:''; top:2px; left:${checked ? '22px' : '4px'}; width:16px; height:16px; background:white; border-radius:50%; transition:var(--transition);"></span>
            </label>
          </div>
        `;
      }).join('')}

      <div style="margin-top:20px; padding:16px; background:var(--off-white); border-radius:var(--border-radius-sm);">
        <label class="form-label">Quiet Hours Start (hour, e.g., 22)</label>
        <input type="number" min="0" max="23" data-key="quiet_hours_start"
          class="form-input" value="${settings.quiet_hours_start || ''}"
          onchange="updateSettingInput(this)">

        <label class="form-label" style="margin-top:12px;">Quiet Hours End (hour, e.g., 8)</label>
        <input type="number" min="0" max="23" data-key="quiet_hours_end"
          class="form-input" value="${settings.quiet_hours_end || ''}"
          onchange="updateSettingInput(this)">

        <label class="form-label" style="margin-top:12px;">Time Zone</label>
        <input type="text" data-key="timezone" class="form-input"
          value="${settings.timezone || ''}" onchange="updateSettingInput(this)">

        <label class="form-label" style="margin-top:12px;">Snooze Durations (comma-separated)</label>
        <input type="text" data-key="snooze_durations" class="form-input"
          value="${settings.snooze_durations ? JSON.parse(settings.snooze_durations).join(', ') : ''}"
          onchange="updateSettingInput(this)">
      </div>

      <div style="margin-top:20px;">
        <button type="button" class="btn btn-secondary" onclick="sendTestNotification()">
          📤 Send Test Notification
        </button>
      </div>
    </form>
  `;
}

window.toggleSetting = function(checkbox) {
  const key = checkbox.dataset.key;
  const value = checkbox.checked;
  API.updateSetting(key, value).then(() => {
    settings[key] = value;
  }).catch(err => showToast('Error: ' + err.message, 'error'));
};

window.updateSettingInput = function(input) {
  const key = input.dataset.key;
  let value = input.value;
  if (key === 'snooze_durations') {
    value = JSON.stringify(value.split(',').map(s => s.trim()));
  }
  API.updateSetting(key, value).then(() => {
    settings[key] = value;
  }).catch(err => showToast('Error: ' + err.message, 'error'));
};

window.switchSettingsTab = function(tab) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  event.target.classList.add('active');
  document.getElementById(`settings-${tab}`).classList.add('active');
};

async function loadDevices() {
  try {
    const devices = await API.getSubscriptions();
    const container = document.getElementById('devices-list');
    if (!devices || devices.length === 0) {
      container.innerHTML = '<p style="color:var(--gray-text);">No devices connected. Enable push notifications to add a device.</p>';
    } else {
      container.innerHTML = `
        <table>
          <thead><tr><th>Endpoint</th><th>Added</th><th>Actions</th></tr></thead>
          <tbody>
            ${devices.map(d => `
              <tr>
                <td style="font-size:12px; max-width:300px; overflow:hidden; text-overflow:ellipsis;">
                  ${d.endpoint ? d.endpoint.substring(0, 60) + '...' : '—'}
                </td>
                <td>${new Date(d.created_at).toLocaleDateString()}</td>
                <td><button onclick="removeDevice('${d.endpoint}')" class="btn btn-danger btn-sm">Remove</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }
  } catch (err) {
    document.getElementById('devices-list').innerHTML = '<p style="color:#ef4444;">Failed to load devices</p>';
  }
}

window.removeDevice = async function(endpoint) {
  if (!confirm('Remove this device from push notifications?')) return;
  await API.removeSubscription(endpoint);
  showToast('Device removed', 'success');
  loadDevices();
};

window.sendTestNotification = async function() {
  try {
    await API.sendTestNotification();
    showToast('Test notification sent!', 'success');
  } catch (err) {
    showToast('Failed: ' + err.message, 'error');
  }
};

window.exportData = function() {
  API.exportData();
};

window.saveQuickNote = async function() {
  const title = document.getElementById('quick-note-title').value;
  const content = document.getElementById('quick-note-content').value;
  if (!title && !content) {
    showToast('Please enter a title or content', 'error');
    return;
  }
  try {
    await API.createNote({ title: title || 'Untitled', content: content || '', quick: true });
    showToast('Quick note saved!', 'success');
    document.getElementById('quick-note-title').value = '';
    document.getElementById('quick-note-content').value = '';
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
};

// ===== CHECK AUTH ON INIT =====
function checkAuth() {
  const token = API.getToken();
  const loginLink = document.getElementById('logout-link');
  const userInfo = document.getElementById('user-info');
  if (token) {
    // Decode token to get username
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (userInfo) {
        userInfo.style.display = 'block';
        document.getElementById('user-name').textContent = payload.username;
      }
      if (loginLink) loginLink.style.display = 'flex';
    } catch(e) {
      // Invalid token
      API.clearToken ? API.clearToken() : localStorage.removeItem('dashboard_auth_token');
    }
  } else {
    if (userInfo) userInfo.style.display = 'none';
    if (loginLink) loginLink.style.display = 'none';
  }
}

// ===== STARTUP =====
// Register global functions
window.checkActiveAlerts = checkActiveAlerts;
window.renderDashboard = renderDashboard;
window.renderTasksPage = renderTasksPage;
window.renderArchivedTasks = renderArchivedTasks;
window.renderNotesPage = renderNotesPage;
window.renderMeetingsPage = renderMeetingsPage;
window.renderCascadesPage = renderCascadesPage;
window.renderSlackPage = renderSlackPage;
window.renderNotificationsPage = renderNotificationsPage;
window.renderSettingsPage = renderSettingsPage;
window.logout = logout;
window.switchPage = function(page) {
  window.location.hash = '#/' + page;
};

// Initialize on load
document.addEventListener('DOMContentLoaded', async () => {
  checkAuth();
  await init();
  // Re-check auth after init
  checkAuth();

  // If not authenticated and not on login page, redirect
  const token = API.getToken();
  if (!token && currentPage !== 'login') {
    window.location.hash = '#/login';
  }

  // Hide overlay after first load
  setTimeout(() => {
    const overlay = document.querySelector('.loading-overlay');
    if (overlay) overlay.style.display = 'none';
  }, 500);
});

// Expose init function for post-login reload
window.initDashboard = init;
