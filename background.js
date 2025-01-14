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
    console.log('Setting reminder...');
    checkReminders().then(() => {
      console.log('Reminder check completed');
      sendResponse({ success: true });
    });
    return true;
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

// 立即初始化
console.log('Starting extension initialization...');
initialize(); 