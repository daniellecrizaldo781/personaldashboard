const { getDb } = require('./db');

// Helper to convert DB row to task object
function mapTask(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    priority: row.priority,
    due_date: row.due_date,
    reminder_time: row.reminder_time,
    category: row.category,
    status: row.status,
    checklist: row.checklist ? JSON.parse(row.checklist) : [],
    notes: row.notes,
    recurring: row.recurring,
    parent_task_id: row.parent_task_id,
    related_note_id: row.related_note_id,
    related_meeting_id: row.related_meeting_id,
    related_cascade_id: row.related_cascade_id,
    slack_message_ts: row.slack_message_ts,
    slack_channel: row.slack_channel,
    created_at: row.created_at,
    updated_at: row.updated_at,
    completed_at: row.completed_at,
    archived: !!row.archived,
    snoozed_until: row.snoozed_until,
    reminder_count: row.reminder_count,
    last_reminded: row.last_reminded
  };
}

// CREATE
async function createTask(taskData) {
  const db = getDb();
  return new Promise((resolve, reject) => {
    const {
      title, description, priority, due_date, reminder_time, category,
      checklist, notes, recurring, parent_task_id,
      related_note_id, related_meeting_id, related_cascade_id,
      slack_message_ts, slack_channel
    } = taskData;

    db.run(
      `INSERT INTO tasks (
        title, description, priority, due_date, reminder_time, category,
        checklist, notes, recurring, parent_task_id,
        related_note_id, related_meeting_id, related_cascade_id,
        slack_message_ts, slack_channel
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        title, description || null, priority || 'Normal',
        due_date || null, reminder_time || null, category || null,
        JSON.stringify(checklist || []), notes || null, recurring || null,
        parent_task_id || null, related_note_id || null,
        related_meeting_id || null, related_cascade_id || null,
        slack_message_ts || null, slack_channel || null
      ],
      function (err) {
        if (err) return reject(err);
        // Record creation in history
        db.run(
          'INSERT INTO task_history (task_id, action, details, new_values) VALUES (?, ?, ?, ?)',
          [this.lastID, 'created', 'Task created', JSON.stringify({ id: this.lastID, ...taskData })]
        );
        resolve(getTask(this.lastID));
      }
    );
  });
}

// READ
async function getTask(id) {
  const db = getDb();
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM tasks WHERE id = ?', [id], (err, row) => {
      if (err) return reject(err);
      resolve(mapTask(row));
    });
  });
}

async function getAllTasks(filters = {}) {
  const db = getDb();
  return new Promise((resolve, reject) => {
    let query = `SELECT * FROM tasks WHERE archived = 0`;
    const params = [];

    if (filters.status) {
      query += ` AND status = ?`;
      params.push(filters.status);
    }
    if (filters.priority) {
      query += ` AND priority = ?`;
      params.push(filters.priority);
    }
    if (filters.category) {
      query += ` AND category = ?`;
      params.push(filters.category);
    }
    if (filters.due_today) {
      const today = new Date().toISOString().split('T')[0];
      query += ` AND date(due_date) = ?`;
      params.push(today);
    }
    if (filters.overdue) {
      const now = new Date().toISOString();
      query += ` AND due_date < ? AND status != 'Completed'`;
      params.push(now);
    }
    if (filters.search) {
      query += ` AND (title LIKE ? OR description LIKE ? OR notes LIKE ?)`;
      const s = `%${filters.search}%`;
      params.push(s, s, s);
    }

    query += ` ORDER BY
      CASE priority
        WHEN 'Urgent' THEN 1
        WHEN 'High' THEN 2
        WHEN 'Normal' THEN 3
        WHEN 'Low' THEN 4
      END,
      due_date ASC,
      created_at DESC`;

    db.all(query, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows.map(mapTask));
    });
  });
}

async function getArchivedTasks(search = null) {
  const db = getDb();
  return new Promise((resolve, reject) => {
    let query = `SELECT * FROM tasks WHERE archived = 1 OR status = 'Completed'`;
    const params = [];
    if (search) {
      query += ` AND (title LIKE ? OR description LIKE ?)`;
      const s = `%${search}%`;
      params.push(s, s);
    }
    query += ` ORDER BY completed_at DESC, created_at DESC`;
    db.all(query, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows.map(mapTask));
    });
  });
}

// UPDATE
async function updateTask(id, taskData) {
  const db = getDb();
  return new Promise((resolve, reject) => {
    const oldRow = null;
    db.get('SELECT * FROM tasks WHERE id = ?', [id], (err, existing) => {
      if (err || !existing) return reject(err || new Error('Task not found'));
      const oldTask = mapTask(existing);

      const updates = [];
      const params = [];
      const fields = [
        'title', 'description', 'priority', 'due_date', 'reminder_time',
        'category', 'checklist', 'notes', 'recurring', 'parent_task_id',
        'related_note_id', 'related_meeting_id', 'related_cascade_id',
        'slack_message_ts', 'slack_channel', 'snoozed_until',
        'reminder_count', 'last_reminded', 'updated_at', 'status', 'archived'
      ];

      for (const field of fields) {
        if (taskData[field] !== undefined) {
          if (field === 'checklist') {
            updates.push(`${field} = ?`);
            params.push(JSON.stringify(taskData[field]));
          } else {
            updates.push(`${field} = ?`);
            params.push(taskData[field]);
          }
        }
      }

      if (updates.length === 0) {
        return resolve(oldTask);
      }

      db.run(
        `UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`,
        [...params, id],
        function (err) {
          if (err) return reject(err);
          db.run(
            'INSERT INTO task_history (task_id, action, details, old_values, new_values) VALUES (?, ?, ?, ?, ?)',
            [id, 'updated', 'Task updated', JSON.stringify(oldTask), JSON.stringify(taskData)]
          );
          resolve(getTask(id));
        }
      );
    });
  });
}

async function completeTask(id) {
  const db = getDb();
  return new Promise((resolve, reject) => {
    const now = new Date().toISOString();
    db.run(
      `UPDATE tasks SET status = 'Completed', archived = 1, completed_at = ? WHERE id = ?`,
      [now, id],
      function (err) {
        if (err) return reject(err);
        db.run(
          'INSERT INTO task_history (task_id, action, details) VALUES (?, ?, ?)',
          [id, 'completed', `Task completed at ${now}`]
        );
        // Handle recurring tasks - create next instance
        db.get('SELECT * FROM tasks WHERE id = ?', [id], (err, row) => {
          if (err) return reject(err);
          const task = mapTask(row);
          if (task.recurring) {
            const next = createNextRecurringTask(task);
            resolve({ task, nextRecurring: next });
          } else {
            resolve({ task });
          }
        });
      }
    );
  });
}

function createNextRecurringTask(task) {
  // This is called synchronously within a promise context
  // We return a promise here for the recurring creation
  return task; // Simplified - full recurring logic handled in server route
}

async function restoreTask(id) {
  const db = getDb();
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE tasks SET status = 'Pending', archived = 0, completed_at = NULL WHERE id = ?`,
      [id],
      function (err) {
        if (err) return reject(err);
        db.run(
          'INSERT INTO task_history (task_id, action, details) VALUES (?, ?, ?)',
          [id, 'restored', 'Task restored from archive']
        );
        resolve(getTask(id));
      }
    );
  });
}

async function deleteTask(id) {
  const db = getDb();
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM tasks WHERE id = ?', [id], function (err) {
      if (err) return reject(err);
      db.run('DELETE FROM task_history WHERE task_id = ?', [id]);
      resolve({ deleted: this.changes });
    });
  });
}

// Get tasks needing reminders (for scheduler)
async function getTasksNeedingReminders() {
  const db = getDb();
  return new Promise((resolve, reject) => {
    const now = new Date().toISOString();
    db.all(
      `SELECT * FROM tasks
       WHERE status != 'Completed'
       AND archived = 0
       AND (
         (reminder_time IS NOT NULL AND reminder_time <= ? AND (snoozed_until IS NULL OR snoozed_until < ?))
         OR (due_date IS NOT NULL AND due_date <= ? AND due_date > date(due_date, '-1 day') AND last_reminded < ?)
         OR (priority = 'Urgent' AND status = 'In Progress' AND last_reminded < ?)
       )`,
      [now, now, now, new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(), now],
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows.map(mapTask));
      }
    );
  });
}

module.exports = {
  createTask,
  getTask,
  getAllTasks,
  getArchivedTasks,
  updateTask,
  completeTask,
  restoreTask,
  deleteTask,
  getTasksNeedingReminders,
  mapTask
};
