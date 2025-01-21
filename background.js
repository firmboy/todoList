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

    console.log('Checking reminders at:', currentTime);
    console.log('Today is:', today);
    console.log('Current todos:', todos);

    let hasUpdates = false;
    const updatedTodos = todos.map(todo => {
      // 检查是否需要提醒
      const shouldRemind = !todo.reminded && 
                         !todo.completed && 
                         todo.date === today && 
                         todo.reminder === currentTime;
      
      console.log('Checking todo:', {
        id: todo.id,
        text: todo.text,
        date: todo.date,
        reminder: todo.reminder,
        reminded: todo.reminded,
        completed: todo.completed,
        shouldRemind
      });

      if (shouldRemind) {
        hasUpdates = true;
        return { ...todo, reminded: true };
      }
      return todo;
    });

    console.log('Has updates:', hasUpdates);
    console.log('Updated todos:', updatedTodos);

    if (hasUpdates) {
      // 更新存储
      await chrome.storage.local.set({ todos: updatedTodos });
      console.log('Storage updated with new todos');

      // 创建通知
      const remindedTodos = updatedTodos.filter(todo => 
        todo.reminded && !todo.completed && todo.date === today
      );

      console.log('Todos to remind:', remindedTodos);

      for (const todo of remindedTodos) {
        const notificationId = `todo-${todo.id}-${Date.now()}`;
        console.log('Creating notification:', notificationId);
        
        await chrome.notifications.create(notificationId, {
          type: 'basic',
          iconUrl: 'icon.png',
          title: 'TodoList 提醒',
          message: todo.text,
          priority: 2,
          requireInteraction: true,
          silent: false
        });
        console.log('Notification created');
      }

      // 通知所有标签页更新
      const tabs = await chrome.tabs.query({});
      console.log('Found tabs:', tabs.length);

      for (const tab of tabs) {
        try {
          // 更新待办列表
          await chrome.tabs.sendMessage(tab.id, {
            type: 'todosUpdated',
            todos: updatedTodos
          });
          console.log('Sent todos update to tab:', tab.id);
          
          // 触发按钮状态更新
          if (tab.url?.startsWith('http')) {
            await chrome.tabs.sendMessage(tab.id, {
              action: 'shakeButton',
              timestamp: Date.now()
            });
            console.log('Sent button update to tab:', tab.id);
          }
        } catch (e) {
          console.log(`Failed to send message to tab ${tab.id}:`, e);
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
  
  // 处理侧边栏的开关
  if (message.action === 'openSidePanel' || message.action === 'closeSidePanel') {
    console.log(`${message.action === 'openSidePanel' ? 'Opening' : 'Closing'} side panel`);
    chrome.windows.getCurrent((window) => {
      if (window) {
        if (message.action === 'openSidePanel') {
          // 打开侧边栏
          chrome.sidePanel.open({ windowId: window.id })
            .then(() => {
              notifyPanelStateChanged(true);
            })
            .catch(error => {
              console.error('Failed to open side panel:', error);
            });
        } else {
          // 关闭侧边栏 - 通过向侧边栏内容发送关闭消息
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const activeTab = tabs[0];
            if (activeTab) {
              chrome.tabs.sendMessage(activeTab.id, { action: 'closeSidePanelFromButton' });
            }
          });
        }
      }
    });
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

  if (message.action === 'deleteTodo') {
    (async () => {
      try {
        // 获取当前待办事项
        const { todos } = await chrome.storage.local.get(['todos']);
        if (!Array.isArray(todos)) {
          throw new Error('Invalid todos data');
        }

        // 过滤掉要删除的待办事项
        const updatedTodos = todos.filter(todo => todo.id !== message.todoId);

        // 等待本地存储更新完成
        await chrome.storage.local.set({ todos: updatedTodos });

        // 广播更新消息到所有标签页
        chrome.tabs.query({}, (tabs) => {
          tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, {
              type: 'todosUpdated',
              todos: updatedTodos
            }).catch(() => {/* 忽略错误 */});
          });
        });

        // 延迟后进行同步
        setTimeout(async () => {
          try {
            await todoSync.sync();
          } catch (error) {
            console.warn('Auto sync failed after deleting todo:', error);
          }
        }, 500);

        sendResponse({ success: true });
      } catch (error) {
        console.error('Failed to delete todo:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true; // 保持消息通道开启
  }
});

// 处理通知点击
chrome.notifications.onClicked.addListener((notificationId) => {
  console.log('Notification clicked:', notificationId);
  // 获取当前窗口并打开侧边栏
  chrome.windows.getCurrent((window) => {
    if (window) {
      chrome.sidePanel.open({ windowId: window.id }).catch(error => {
        console.error('Failed to open side panel:', error);
      });
    }
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

    // 等待本地存储更新完成
    await chrome.storage.local.set({ todos: updatedTodos });

    // 等待一段时间再进行同步，避免竞态条件
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // 触发同步
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
  if (!todo || todo.completed) return;

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

  // 通知 popup 更新界面
  chrome.runtime.sendMessage({
    type: 'todosUpdated',
    todos: updatedTodos
  });
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
        return { 
          ...todo, 
          completed: true,
          reminded: false // 清除提醒状态
        };
      }
      return todo;
    });
    await chrome.storage.local.set({ todos: updatedTodos });

    // 通知 popup 更新界面
    chrome.runtime.sendMessage({
      type: 'todosUpdated',
      todos: updatedTodos
    });
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

    // 通知 popup 更新界面
    chrome.runtime.sendMessage({
      type: 'todosUpdated',
      todos: updatedTodos
    });
  }

  chrome.notifications.clear(notificationId);
});

// 立即初始化
console.log('Starting extension initialization...');
initialize(); 

// 添加消息监听器来处理打开弹窗的请求
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'openTodoPopup') {
    chrome.windows.create({
      url: 'popup.html',
      type: 'popup',
      width: 400,
      height: 600
    });
  }
}); 

// 辅助函数：通知所有标签页面板状态改变
function notifyPanelStateChanged(isOpen) {
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, {
        action: 'sidePanelStateChanged',
        isOpen: isOpen
      }).catch(() => {
        // 忽略向不支持的标签页发送消息时的错误
      });
    });
  });
} 

// 修改删除待办事项的处理逻辑
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'deleteTodo') {
    handleDeleteTodo(message.todoId)
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
  // ... 其他消息处理保持不变
});

// 添加删除待办事项的处理函数
async function handleDeleteTodo(todoId) {
  try {
    // 获取当前待办事项
    const { todos } = await chrome.storage.local.get(['todos']);
    if (!Array.isArray(todos)) return;

    // 过滤掉要删除的待办事项
    const updatedTodos = todos.filter(todo => todo.id !== todoId);

    // 等待本地存储更新完成
    await chrome.storage.local.set({ todos: updatedTodos });

    // 等待一段时间再进行同步
    await new Promise(resolve => setTimeout(resolve, 500));

    // 触发同步
    try {
      await todoSync.sync();
    } catch (error) {
      console.warn('Auto sync failed after deleting todo:', error);
    }

    // 通知所有标签页更新
    chrome.runtime.sendMessage({
      type: 'todosUpdated',
      todos: updatedTodos
    });

    return updatedTodos;
  } catch (error) {
    console.error('Failed to delete todo:', error);
    throw error;
  }
} 

// 确保定时检查提醒
const checkInterval = setInterval(checkReminders, 60000); // 每分钟检查一次

// 立即进行一次检查
checkReminders(); 

// 确保 service worker 不会休眠
chrome.alarms.create('keepAlive', {
  periodInMinutes: 1
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keepAlive') {
    checkReminders();
  }
}); 