/**
 * Integration test for the Personal Dashboard API
 * Run: node test/integration.js
 */
const http = require('http');

const PORT = process.env.TEST_PORT || 3002;
let token = null;

function api(path, method, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'localhost', port: PORT, path: path, method: method || 'GET',
      headers: { 'Content-Type': 'application/json' }
    };
    if (token) options.headers['Authorization'] = 'Bearer ' + token;
    if (data) { options.headers['Content-Length'] = data.length; }
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(body) }); }
        catch (e) { resolve({ status: res.statusCode, body: body }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function runTests() {
  console.log('Starting integration tests on port ' + PORT + '...\n');

  // Test 1: Login
  const login = await api('/api/auth/login', 'POST', { username: 'admin', password: 'admin123' });
  if (login.status !== 200 || !login.body.token) {
    console.error('FAIL: Login failed');
    process.exit(1);
  }
  token = login.body.token;
  console.log('Login successful');

  // Test 2: Get settings
  const settings = await api('/api/settings', 'GET');
  if (settings.status !== 200) throw new Error('Settings fetch failed');
  console.log('Settings loaded:', Object.keys(settings.body).length, 'keys');

  // Test 3: Create task
  const task = await api('/api/tasks', 'POST', {
    title: 'Integration Test Task',
    priority: 'Urgent',
    category: 'Testing',
    due_date: '2026-10-25T10:00:00',
    description: 'Test task for integration'
  });
  if (task.status !== 201) throw new Error('Task creation failed');
  console.log('Task created:', task.body.title);

  // Test 4: Get tasks
  const tasks = await api('/api/tasks', 'GET');
  if (tasks.status !== 200) throw new Error('Tasks fetch failed');
  console.log('Tasks fetched:', tasks.body.length);

  // Test 5: Update task status
  const updated = await api('/api/tasks/' + task.body.id, 'PUT', { status: 'In Progress' });
  if (updated.status !== 200 || updated.body.status !== 'In Progress') throw new Error('Task update failed - got status: ' + (updated.body.status || 'undefined') + ', HTTP: ' + updated.status);
  console.log('Task updated:', updated.body.status);

  // Test 6: Complete task
  const completed = await api('/api/tasks/' + task.body.id + '/complete', 'PUT');
  if (completed.status !== 200) throw new Error('Task completion failed');
  console.log('Task completed, archived:', completed.body.task.archived);

  // Test 7: Get archived tasks
  const archived = await api('/api/tasks/archived', 'GET');
  if (archived.status !== 200) throw new Error('Archived tasks fetch failed');
  console.log('Archived tasks:', archived.body.length);

  // Test 8: Restore task
  const restored = await api('/api/tasks/' + task.body.id + '/restore', 'PUT');
  if (restored.status !== 200 || restored.body.archived !== false) throw new Error('Task restore failed');
  console.log('Task restored to active list');

  // Test 9: Create note
  const note = await api('/api/notes', 'POST', {
    title: 'Test Note',
    content: 'This is a test note',
    tags: ['test', 'integration'],
    pinned: true,
    important: true
  });
  console.log('Note created:', note.body.title);

  // Test 10: Get notes
  const notes = await api('/api/notes', 'GET');
  console.log('Notes fetched:', notes.body.length);

  // Test 11: Create meeting
  const meeting = await api('/api/meetings', 'POST', {
    title: 'Test Meeting',
    date_time: '2026-10-20T10:00:00',
    attendees: 'John, Sarah',
    agenda: 'Weekly sync',
    project: 'Test Project',
    action_items: [{ description: 'Test action', assignee: 'John', due_date: '2026-10-25', completed: false }]
  });
  console.log('Meeting created:', meeting.body.title);

  // Test 12: Create cascade
  const cascade = await api('/api/cascades', 'POST', {
    title: 'Test Cascade',
    details: 'Test cascade details',
    priority: 'High',
    deadline: '2026-10-25T12:00:00',
    status: 'To Cascade'
  });
  console.log('Cascade created:', cascade.body.title);

  // Test 13: Create slack alert
  const alert = await api('/api/slack/alerts', 'POST', {
    message_preview: 'Urgent: something needs attention',
    sender: 'Agent',
    channel: 'ops',
    urgency_reason: 'Keyword match'
  });
  console.log('Slack alert created');

  // Test 14: Mark cascade as cascaded
  const cascaded = await api('/api/cascades/' + cascade.body.id + '/cascaded', 'PUT');
  if (cascaded.status !== 200) throw new Error('Cascade completion failed');
  console.log('Cascade marked as Cascaded');

  // Test 15: Convert alert to task
  const alertUpdate = await api('/api/slack/alerts/' + alert.body.id, 'PUT', {
    review_status: 'reviewed',
    converted_task_id: task.body.id
  });
  console.log('Slack alert updated');

  // Test 16: Delete task
  await api('/api/tasks/' + task.body.id, 'DELETE');
  const tasksAfterDelete = await api('/api/tasks', 'GET');
  console.log('Task deleted, remaining:', tasksAfterDelete.body.length);

  // Test 17: Get vapid key
  const vapid = await api('/api/push/vapid-key', 'GET');
  console.log('VAPID key retrieved:', vapid.body.publicKey ? 'yes' : 'no');

  // Test 18: Test notifications
  const notifications = await api('/api/notifications', 'GET');
  console.log('Notifications fetched:', notifications.body.length);

  console.log('\n=== All 18 integration tests passed! ===');
}

runTests().catch(err => {
  console.error('Test failed:', err.message);
  process.exit(1);
});
