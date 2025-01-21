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

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name.startsWith('todo-')) {
    const todoId = alarm.name.replace('todo-', '');
    
    try {
      // 获取待办事项
      const { todos } = await chrome.storage.local.get(['todos']);
      const todo = todos.find(t => t.id === todoId);
      
      if (todo && !todo.completed) {
        // 更新待办事项的提醒状态
        const updatedTodos = todos.map(t => {
          if (t.id === todoId) {
            return { ...t, reminded: true };
          }
          return t;
        });
        
        // 保存更新后的待办事项
        await chrome.storage.local.set({ todos: updatedTodos });
        
        // 创建通知
        chrome.notifications.create(`reminder-${todoId}`, {
          type: 'basic',
          iconUrl: 'icon.png',
          title: '待办事项提醒',
          message: todo.text,
          buttons: [
            { title: '完成' },
            { title: '稍后提醒' }
          ],
          requireInteraction: true  // 通知会一直显示直到用户操作
        });
        
        // 通知其他组件更新
        chrome.runtime.sendMessage({
          type: 'todosUpdated',
          todos: updatedTodos
        });
      }
    } catch (error) {
      console.error('Error handling reminder:', error);
    }
  }
});

// 处理通知按钮点击
chrome.notifications.onButtonClicked.addListener(async (notificationId, buttonIndex) => {
  if (notificationId.startsWith('reminder-')) {
    const todoId = notificationId.replace('reminder-', '');
    
    try {
      const { todos } = await chrome.storage.local.get(['todos']);
      
      if (buttonIndex === 0) {
        // 完成待办事项
        const updatedTodos = todos.map(t => {
          if (t.id === todoId) {
            return { ...t, completed: true, reminded: false };
          }
          return t;
        });
        
        await chrome.storage.local.set({ todos: updatedTodos });
        chrome.notifications.clear(notificationId);
        
        // 通知更新
        chrome.runtime.sendMessage({
          type: 'todosUpdated',
          todos: updatedTodos
        });
      } else if (buttonIndex === 1) {
        // 稍后提醒（5分钟后）
        const todo = todos.find(t => t.id === todoId);
        if (todo) {
          chrome.alarms.create(`todo-${todoId}`, {
            when: Date.now() + 5 * 60 * 1000
          });
          
          const updatedTodos = todos.map(t => {
            if (t.id === todoId) {
              return { ...t, reminded: false };
            }
            return t;
          });
          
          await chrome.storage.local.set({ todos: updatedTodos });
          chrome.notifications.clear(notificationId);
        }
      }
    } catch (error) {
      console.error('Error handling notification button click:', error);
    }
  }
}); 