const { getDb } = require('./db');
const { getTasksNeedingReminders, getArchivedTasks } = require('./tasks');
const { getCascadesNeedingReminders } = require('./data');
const { getAllSubscriptions } = require('./data');
const { sendPushNotification } = require('./notifications');
const { getSettings, updateSetting, logNotification } = require('./data');

let schedulerInterval = null;

async function checkAndSendReminders() {
  try {
    const settings = await getSettings();
    const now = new Date();
    const currentHour = now.getHours();
    const quietStart = settings.quiet_hours_start ? parseInt(settings.quiet_hours_start) : -1;
    const quietEnd = settings.quiet_hours_end ? parseInt(settings.quiet_hours_end) : -1;
    const quietHours = quietStart >= 0 && quietEnd >= 0 &&
      currentHour >= quietStart && currentHour < quietEnd;

    // Skip routine checks during quiet hours (but critical alerts can still come through)
    if (quietHours && !settings.critical_alert_override) {
      return { skipped: true, reason: 'quiet_hours' };
    }

    const results = {
      taskReminders: 0,
      cascadeReminders: 0,
      notifications: 0
    };

    // Check tasks needing reminders
    const tasks = await getTasksNeedingReminders();
    const subscriptions = await getAllSubscriptions();
    const notifyPriorities = settings.notify_priorities || ['Urgent', 'High'];

    for (const task of tasks) {
      // Check if this task should trigger a notification
      if (notifyPriorities.includes(task.priority) ||
          task.priority === 'Urgent' ||
          (task.due_date && new Date(task.due_date) < now)) {

        // Prevent duplicate reminders (check last_reminded)
        const lastReminded = task.last_reminded ? new Date(task.last_reminded) : null;
        const reminderCooldown = settings.reminder_frequency === 'immediate' ? 1 : 3; // hours
        if (lastReminded && (now - lastReminded) < reminderCooldown * 3600000) {
          continue;
        }

        // Send push notification
        const payload = {
          title: `Task Reminder: ${task.title}`,
          body: task.description || `Due: ${task.due_date || 'No deadline'}`,
          priority: task.priority,
          tag: `task-${task.id}`,
          url: `/dashboard.html#/tasks/${task.id}`,
          data: { type: 'task', taskId: task.id }
        };

        for (const sub of subscriptions) {
          await sendPushNotification({
            endpoint: sub.endpoint,
            keys: sub.keys ? JSON.parse(sub.keys) : {}
          }, payload);
        }

        // Log notification
        await logNotification({
          source: 'Tasks',
          source_id: String(task.id),
          title: payload.title,
          body: payload.body,
          priority: task.priority,
          status: 'pending'
        });

        results.taskReminders++;

        // Update task's last_reminded field
        const db = getDb();
        db.run(
          `UPDATE tasks SET last_reminded = ?, reminder_count = reminder_count + 1 WHERE id = ?`,
          [now.toISOString(), task.id]
        );
      }
    }

    // Check cascades needing reminders
    const cascades = await getCascadesNeedingReminders();
    for (const cascade of cascades) {
      const lastReminded = cascade.last_reminded ? new Date(cascade.last_reminded) : null;
      const threeHoursAgo = new Date(Date.now() - 3 * 3600 * 1000);
      if (lastReminded && lastReminded > threeHoursAgo) continue;

      const payload = {
        title: `Cascade Reminder: ${cascade.title}`,
        body: `Deadline: ${cascade.deadline || 'No deadline'}`,
        priority: cascade.priority,
        tag: `cascade-${cascade.id}`,
        url: `/dashboard.html#/cascades/${cascade.id}`,
        data: { type: 'cascade', cascadeId: cascade.id }
      };

      for (const sub of subscriptions) {
        await sendPushNotification({
          endpoint: sub.endpoint,
          keys: sub.keys ? JSON.parse(sub.keys) : {}
        }, payload);
      }

      await logNotification({
        source: 'Team Cascades',
        source_id: String(cascade.id),
        title: payload.title,
        body: payload.body,
        priority: cascade.priority,
        status: 'pending'
      });

      results.cascadeReminders++;

      const db = getDb();
      db.run(
        `UPDATE cascades SET last_reminded = ? WHERE id = ?`,
        [now.toISOString(), cascade.id]
      );
    }

    results.notifications = results.taskReminders + results.cascadeReminders;
    return results;
  } catch (err) {
    console.error('Scheduler error:', err.message);
    return { error: err.message };
  }
}

function startScheduler() {
  // Run every 5 minutes
  schedulerInterval = setInterval(checkAndSendReminders, 5 * 60 * 1000);
  // Run immediately on start
  checkAndSendReminders();
  console.log('Background reminder scheduler started (every 5 minutes)');
}

function stopScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log('Background reminder scheduler stopped');
  }
}

module.exports = {
  checkAndSendReminders,
  startScheduler,
  stopScheduler
};
