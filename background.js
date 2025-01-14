// 全局变量
let alarmName = 'checkReminders';
let keepAliveInterval;
let isOffscreenDocumentCreated = false;

// 创建离屏文档以保持活跃
async function createOffscreenDocument() {
  if (isOffscreenDocumentCreated) return;
  
  try {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['KEEP_ALIVE'],
      justification: 'Keep service worker alive for reminders'
    });
    isOffscreenDocumentCreated = true;
    console.log('Offscreen document created successfully');
  } catch (e) {
    console.error('Failed to create offscreen document:', e);
  }
}

// 检查提醒的函数
async function checkReminders() {
  try {
    const result = await chrome.storage.local.get(['todos']);
    const todos = result.todos || [];
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    console.log(`[${now.toLocaleTimeString()}] Checking reminders...`);
    console.log('Current time:', currentTime);
    console.log('Current date:', today);
    console.log('Found todos:', todos.length);

    // 检查每个待办事项
    for (const todo of todos) {
      console.log('Checking todo:', {
        text: todo.text,
        date: todo.date,
        reminder: todo.reminder,
        reminded: todo.reminded,
        matches: {
          dateMatch: todo.date === today,
          timeMatch: todo.reminder === currentTime,
          notReminded: !todo.reminded
        }
      });

      if (!todo.reminded && todo.date === today && todo.reminder === currentTime) {
        console.log('Creating notification for:', todo.text);

        // 创建通知
        const notificationId = `todo-${Date.now()}`;
        await chrome.notifications.create(notificationId, {
          type: 'basic',
          iconUrl: 'icon.png',
          title: 'TodoList 提醒',
          message: todo.text,
          priority: 2,
          requireInteraction: true,
          silent: false
        });
        console.log('Notification created:', notificationId);

        // 更新提醒状态
        const updatedTodos = todos.map(t => 
          (t.text === todo.text && t.date === todo.date && t.timestamp === todo.timestamp)
            ? { ...t, reminded: true }
            : t
        );
        await chrome.storage.local.set({ todos: updatedTodos });
        console.log('Todo marked as reminded');

        // 触发按钮抖动
        const tabs = await chrome.tabs.query({});
        console.log('Found tabs:', tabs.length);

        for (const tab of tabs) {
          if (tab.url?.startsWith('http')) {
            try {
              console.log('Sending shake message to tab:', tab.id);
              await chrome.tabs.sendMessage(tab.id, { 
                action: 'shakeButton',
                timestamp: Date.now()
              });
              console.log('Shake message sent to tab:', tab.id);
            } catch (e) {
              console.log(`Failed to send message to tab ${tab.id}:`, e);
            }
          }
        }
      }
    }
  } catch (e) {
    console.error('Error in checkReminders:', e);
  }
}

// 设置定时检查
async function setupAlarm() {
  try {
    // 清除现有的定时器
    await chrome.alarms.clearAll();
    console.log('Existing alarms cleared');
    
    // 对齐到下一分钟
    const now = Date.now();
    const nextMinute = Math.ceil(now / 60000) * 60000;
    
    // 创建新的定时器
    await chrome.alarms.create(alarmName, {
      when: nextMinute,
      periodInMinutes: 1
    });

    console.log('Alarm created for:', new Date(nextMinute).toLocaleTimeString());
    
    // 立即检查一次
    await checkReminders();
  } catch (e) {
    console.error('Error in setupAlarm:', e);
  }
}

// 初始化函数
async function initialize() {
  try {
    console.log('Initializing extension...');
    
    // 创建离屏文档
    await createOffscreenDocument();
    
    // 设置定时器
    await setupAlarm();
    
    // 设置心跳检查
    if (keepAliveInterval) {
      clearInterval(keepAliveInterval);
      console.log('Cleared existing keepAlive interval');
    }
    
    keepAliveInterval = setInterval(async () => {
      console.log('Running keepAlive check...');
      await checkReminders();
    }, 30000);
    
    console.log('Initialization completed successfully');
  } catch (e) {
    console.error('Error in initialize:', e);
  }
}

// 事件监听器
chrome.alarms.onAlarm.addListener((alarm) => {
  console.log('Alarm triggered:', alarm.name);
  if (alarm.name === alarmName) {
    checkReminders();
  }
});

chrome.runtime.onInstalled.addListener((details) => {
  console.log('Extension installed/updated:', details.reason);
  initialize();
});

chrome.runtime.onStartup.addListener(() => {
  console.log('Browser started');
  initialize();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Received message:', message);
  
  if (message.type === 'heartbeat') {
    console.log('Received heartbeat');
    return;
  }
  
  if (message.action === 'setReminder') {
    console.log('Setting reminder:', message);
    handleSetReminder(message.todoId, message.time)
      .then(async () => {
        // 获取更新后的待办事项
        const { todos } = await chrome.storage.local.get(['todos']);
        // 通知 popup 更新界面
        chrome.runtime.sendMessage({
          type: 'todosUpdated',
          todos: todos
        });
        sendResponse({ success: true });
      })
      .catch(error => {
        console.error('Set reminder failed:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // 保持消息通道开启
  }
  
  if (message.action === 'openTodoPanel' && sender.tab) {
    console.log('Opening todo panel');
    chrome.sidePanel.open({ windowId: sender.tab.windowId });
  }
});

chrome.notifications.onClicked.addListener((notificationId) => {
  console.log('Notification clicked:', notificationId);
  chrome.windows.getCurrent((window) => {
    chrome.sidePanel.open({ windowId: window.id });
  });
});

// 监听消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'setReminder') {
    handleSetReminder(message.todoId, message.time)
      .then(() => sendResponse({ success: true }))
      .catch(error => {
        console.error('Set reminder failed:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // 保持消息通道开启
  }
});

// 处理设置提醒
async function handleSetReminder(todoId, time) {
  try {
    // 获取当前待办事项
    const { todos } = await chrome.storage.local.get(['todos']);
    if (!Array.isArray(todos)) return;

    // 更新待办事项的提醒时间
    const updatedTodos = todos.map(todo => {
      if (todo.id === todoId) {
        return {
          ...todo,
          reminder: time,
          reminded: false,
          timestamp: Date.now()
        };
      }
      return todo;
    });

    // 保存更新后的待办事项
    await chrome.storage.local.set({ todos: updatedTodos });

    // 设置提醒
    const [hours, minutes] = time.split(':');
    const reminderDate = new Date();
    reminderDate.setHours(parseInt(hours));
    reminderDate.setMinutes(parseInt(minutes));
    reminderDate.setSeconds(0);

    // 如果时间已过，设置为明天
    if (reminderDate < new Date()) {
      reminderDate.setDate(reminderDate.getDate() + 1);
    }

    // 创建提醒
    await chrome.alarms.create(`todo-${todoId}`, {
      when: reminderDate.getTime()
    });

    console.log('Reminder set:', { todoId, time, when: reminderDate });
    
    // 触发同步以保持数据一致性
    try {
      await todoSync.sync();
    } catch (error) {
      console.warn('Auto sync failed after setting reminder:', error);
    }
    
    return updatedTodos;
  } catch (error) {
    console.error('Failed to set reminder:', error);
    throw error;
  }
}

// 监听提醒触发
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (!alarm.name.startsWith('todo-')) return;

  const todoId = alarm.name.replace('todo-', '');
  const { todos } = await chrome.storage.local.get(['todos']);
  
  const todo = todos.find(t => t.id === todoId);
  if (!todo || todo.reminded) return;

  // 显示通知
  chrome.notifications.create(`todo-notification-${todoId}`, {
    type: 'basic',
    iconUrl: 'icon.png',
    title: '待办事项提醒',
    message: todo.text,
    priority: 2,
    buttons: [
      { title: '完成' },
      { title: '稍后提醒' }
    ]
  });

  // 标记为已提醒
  const updatedTodos = todos.map(t => {
    if (t.id === todoId) {
      return { ...t, reminded: true };
    }
    return t;
  });

  await chrome.storage.local.set({ todos: updatedTodos });
});

// 监听通知按钮点击
chrome.notifications.onButtonClicked.addListener(async (notificationId, buttonIndex) => {
  if (!notificationId.startsWith('todo-notification-')) return;

  const todoId = notificationId.replace('todo-notification-', '');
  const { todos } = await chrome.storage.local.get(['todos']);

  if (buttonIndex === 0) {
    // 完成待办事项
    const updatedTodos = todos.map(todo => {
      if (todo.id === todoId) {
        return { ...todo, completed: true };
      }
      return todo;
    });
    await chrome.storage.local.set({ todos: updatedTodos });
  } else if (buttonIndex === 1) {
    // 稍后提醒（15分钟后）
    const later = new Date();
    later.setMinutes(later.getMinutes() + 15);
    
    await chrome.alarms.create(`todo-${todoId}`, {
      when: later.getTime()
    });

    const updatedTodos = todos.map(todo => {
      if (todo.id === todoId) {
        return { ...todo, reminded: false };
      }
      return todo;
    });
    await chrome.storage.local.set({ todos: updatedTodos });
  }

  chrome.notifications.clear(notificationId);
});

// 立即初始化
console.log('Starting extension initialization...');
initialize(); 