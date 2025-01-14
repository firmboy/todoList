// 检查提醒
function checkReminders() {
  chrome.storage.local.get(['todos'], (result) => {
    const todos = result.todos || [];
    const now = new Date();
    const currentTime = `${now.getHours()}:${now.getMinutes().toString().padStart(2, '0')}`;
    const today = now.toISOString().split('T')[0];

    todos.forEach(todo => {
      if (todo.date === today && todo.reminder === currentTime && !todo.isCompleted) {
        // 发送提醒
        chrome.runtime.sendMessage({ 
          action: 'showReminder',
          todo: todo
        });
      }
    });
  });
}

// 每分钟检查一次提醒
setInterval(checkReminders, 60000);
checkReminders(); // 初始检查 