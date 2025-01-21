import { todoSync } from './sync-service.js';

window.onerror = function(message, source, lineno, colno, error) {
  console.error('Global error:', { message, source, lineno, colno, error });
};

document.addEventListener('DOMContentLoaded', () => {
  // 检查当前是否在弹出窗口中
  const isPopup = location.pathname.endsWith('popup.html');
  
  if (!isPopup) {
    // 只在非弹出窗口中创建待办按钮
    const todoButton = document.createElement('button');
    todoButton.id = 'todoButton';
    todoButton.className = 'todo-button';
    todoButton.innerHTML = `
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"/>
      </svg>
      <span>待办事项</span>
    `;

    // 将按钮添加到页面中
    document.body.appendChild(todoButton);

    // 添加点击事件监听器
    todoButton.addEventListener('click', () => {
      chrome.windows.create({
        url: 'popup.html',
        type: 'popup',
        width: 400,
        height: 600
      });
    });
  } else {
    // 弹出窗口中的原有代码
    console.log('DOM Content Loaded');
    const todoInput = document.getElementById('todoInput');
    const addTodoBtn = document.getElementById('addTodo');
    const todoList = document.getElementById('todoList');

    // 加载保存的待办事项
    loadTodos();

    // 添加新待办事项
    addTodoBtn.addEventListener('click', () => {
      console.log('Add button clicked');
      addTodoFromInput();
    });

    // 回车添加待办事项
    todoInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        console.log('Enter key pressed');
        addTodoFromInput();
      }
    });
  }

  console.log('DOM Content Loaded');
  const todoInput = document.getElementById('todoInput');
  const addTodoBtn = document.getElementById('addTodo');
  const todoList = document.getElementById('todoList');

  // 加载保存的待办事项
  loadTodos();

  // 添加新待办事项
  addTodoBtn.addEventListener('click', () => {
    console.log('Add button clicked');
    addTodoFromInput();
  });

  // 回车添加待办事项
  todoInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      console.log('Enter key pressed');
      addTodoFromInput();
    }
  });

  function loadTodos() {
    chrome.storage.local.get(['todos'], (result) => {
      console.log('Loading todos:', result);
      let todos = result.todos || [];
      if (!Array.isArray(todos)) {
        console.warn('Invalid todos in storage, resetting...');
        todos = [];
        chrome.storage.local.set({ todos: [] });
      }
      renderTodosByDate(todos);
    });
  }

  function addTodoFromInput() {
    const todoText = todoInput.value.trim();
    console.log('Adding todo from input:', todoText);
    if (!todoText) {
      console.log('Empty todo text, skipping...');
      return;
    }
    
    chrome.storage.local.get(['todos'], (result) => {
      let todos = result.todos || [];
      if (!Array.isArray(todos)) {
        todos = [];
      }

      const newTodo = {
        id: Date.now().toString(),
        text: todoText,
        date: new Date().toISOString().split('T')[0],
        timestamp: Date.now(),
        reminder: null,
        expanded: false,
        reminded: false
      };

      console.log('Created new todo:', newTodo);
      todos.push(newTodo);

      chrome.storage.local.set({ todos }, () => {
        if (chrome.runtime.lastError) {
          console.error('Failed to save todo:', chrome.runtime.lastError);
          return;
        }
        console.log('Todo saved successfully');
        todoInput.value = '';
        todoInput.focus();
        loadTodos(); // 重新加载所有待办事项
      });
    });
  }

  function renderTodosByDate(todos) {
    console.log('Rendering todos:', todos);

    // 确保 todos 是数组
    if (!Array.isArray(todos)) {
      console.warn('Invalid todos in renderTodosByDate:', todos);
      todos = [];
    }

    // 清空现有列表
    todoList.innerHTML = '';

    try {
      // 按日期分组
      const groupedTodos = groupTodosByDate(todos);
      console.log('Grouped todos:', groupedTodos);

      const today = new Date().toISOString().split('T')[0];
      
      // 检查是否有历史待办事项
      const historyDates = Object.keys(groupedTodos)
        .filter(date => date !== today)
        .sort((a, b) => new Date(b) - new Date(a));
      
      const hasHistoryTodos = historyDates.length > 0;
      console.log('History dates:', historyDates);

      // 先渲染今天的待办事项
      if (groupedTodos[today]) {
          const todayGroup = document.createElement('div');
          todayGroup.className = 'date-group';
          
          const todayHeader = document.createElement('div');
          todayHeader.className = 'date-header';
          todayHeader.innerHTML = `
            <div class="date-header-content">
              <span class="collapse-icon">▼</span>
              <span class="date-text">今天</span>
              <span class="todo-count">${groupedTodos[today].length}</span>
            </div>
          `;

          const todayList = document.createElement('ul');
          todayList.className = 'date-list';
          todayHeader.querySelector('.collapse-icon').style.transform = '';

          groupedTodos[today]
            .sort((a, b) => b.timestamp - a.timestamp)
            .forEach(todo => {
              todayList.appendChild(createTodoElement(todo));
            });

          todayGroup.appendChild(todayHeader);
          todayGroup.appendChild(todayList);
          todoList.appendChild(todayGroup);

          // 添加折叠功能
          todayHeader.addEventListener('click', () => {
            const icon = todayHeader.querySelector('.collapse-icon');
            todayList.classList.toggle('collapsed');
            icon.style.transform = todayList.classList.contains('collapsed') ? 'rotate(-90deg)' : '';
          });
      }

      // 总是创建历史待办分组，即使没有历史待办事项
      if (hasHistoryTodos) {
          const historyGroup = document.createElement('div');
          historyGroup.className = 'date-group history-group';
          
          // 创建历史待办的主标题
          const historyHeader = document.createElement('div');
          historyHeader.className = 'date-header main-header';
          const totalHistoryTodos = historyDates.reduce((sum, date) => sum + groupedTodos[date].length, 0);
          historyHeader.innerHTML = `
            <div class="date-header-content">
              <span class="collapse-icon">▼</span>
              <span class="date-text">历史待办</span>
              <span class="todo-count">${totalHistoryTodos}</span>
            </div>
          `;

          const historyContent = document.createElement('div');
          historyContent.className = 'history-content collapsed';
          historyHeader.querySelector('.collapse-icon').style.transform = 'rotate(-90deg)';

          // 为每个历史日期创建子分组
          historyDates.forEach(date => {
              const dateGroup = document.createElement('div');
              dateGroup.className = 'date-group sub-group';
              
              const dateHeader = document.createElement('div');
              dateHeader.className = 'date-header sub-header';
              dateHeader.innerHTML = `
                <div class="date-header-content">
                  <span class="collapse-icon">▼</span>
                  <span class="date-text">${formatDate(date)}</span>
                  <span class="todo-count">${groupedTodos[date].length}</span>
                </div>
              `;

              const dateList = document.createElement('ul');
              dateList.className = 'date-list collapsed';
              dateHeader.querySelector('.collapse-icon').style.transform = 'rotate(-90deg)';
              
              groupedTodos[date]
                .sort((a, b) => b.timestamp - a.timestamp)
                .forEach(todo => {
                  dateList.appendChild(createTodoElement(todo));
                });

              dateGroup.appendChild(dateHeader);
              dateGroup.appendChild(dateList);
              historyContent.appendChild(dateGroup);

              // 添加子分组的折叠功能
              dateHeader.addEventListener('click', (e) => {
                e.stopPropagation();
                const icon = dateHeader.querySelector('.collapse-icon');
                dateList.classList.toggle('collapsed');
                icon.style.transform = dateList.classList.contains('collapsed') ? 'rotate(-90deg)' : '';
              });
          });

          historyGroup.appendChild(historyHeader);
          historyGroup.appendChild(historyContent);
          todoList.appendChild(historyGroup);

          // 添加主分组的折叠功能
          historyHeader.addEventListener('click', () => {
            const icon = historyHeader.querySelector('.collapse-icon');
            historyContent.classList.toggle('collapsed');
            icon.style.transform = historyContent.classList.contains('collapsed') ? 'rotate(-90deg)' : '';
          });
      }
      console.log('Render completed');
    } catch (error) {
      console.error('Error in renderTodosByDate:', error);
    }
  }

  function createTodoElement(todo) {
    const li = document.createElement('li');
    
    // 如果待办事项已提醒但未完成，添加提醒样式
    if (todo.reminded && !todo.completed) {
      li.className = 'reminded';
    }
    
    // 创建主要内容区域
    const mainContent = document.createElement('div');
    mainContent.className = 'todo-main-content';
    
    // 创建待办事项头部
    const todoHeader = document.createElement('div');
    todoHeader.className = 'todo-header';
    
    const todoContent = document.createElement('div');
    todoContent.className = 'todo-content';
    
    const todoText = document.createElement('span');
    todoText.className = 'todo-text';
    todoText.textContent = todo.text;
    
    const todoButtons = document.createElement('div');
    todoButtons.className = 'todo-buttons';
    
    // 如果待办事项已提醒但未完成，添加完成按钮
    if (todo.reminded && !todo.completed) {
      const completeBtn = document.createElement('button');
      completeBtn.className = 'complete-btn';
      completeBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M20 6L9 17l-5-5"/>
        </svg>
      `;
      
      completeBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
          const { todos } = await chrome.storage.local.get(['todos']);
          const updatedTodos = todos.map(t => {
            if (t.id === todo.id) {
              return { 
                ...t, 
                reminded: false,
                completed: true
              };
            }
            return t;
          });
          
          await chrome.storage.local.set({ todos: updatedTodos });
          // 通知更新
          chrome.runtime.sendMessage({
            type: 'todosUpdated',
            todos: updatedTodos
          });
        } catch (error) {
          console.error('Failed to complete todo:', error);
        }
      });
      
      todoButtons.insertBefore(completeBtn, todoButtons.firstChild);
    }
    
    // 添加提醒按钮
    const reminderBtn = document.createElement('button');
    reminderBtn.className = 'reminder-btn';
    reminderBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/>
      </svg>
    `;
    
    // 添加删除按钮
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-btn';
    deleteBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2M10 11v6M14 11v6"/>
      </svg>
    `;
    
    todoButtons.appendChild(reminderBtn);
    todoButtons.appendChild(deleteBtn);
    
    todoContent.appendChild(todoText);
    todoHeader.appendChild(todoContent);
    todoHeader.appendChild(todoButtons);
    mainContent.appendChild(todoHeader);
    
    // 修改提醒信息的显示逻辑
    if (todo.reminder) {
      const reminderInfo = document.createElement('div');
      reminderInfo.className = 'reminder-info';
      const time = new Date();
      const [hours, minutes] = todo.reminder.split(':');
      time.setHours(parseInt(hours));
      time.setMinutes(parseInt(minutes));
      
      const formattedTime = time.toLocaleTimeString('zh-CN', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
      
      // 添加提醒状态显示
      const reminderStatus = todo.reminded ? '(已提醒)' : '';
      
      reminderInfo.innerHTML = `
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/>
        </svg>
        <span>${formattedTime} ${reminderStatus}</span>
      `;
      
      // 如果已提醒但未完成，添加特殊样式
      if (todo.reminded && !todo.completed) {
        reminderInfo.classList.add('reminded');
        li.classList.add('reminded');
      }
      
      mainContent.appendChild(reminderInfo);
    }
    
    li.appendChild(mainContent);
    
    // 添加事件监听器
    reminderBtn.addEventListener('click', () => {
      chrome.windows.create({
        url: `time-picker.html?todoId=${todo.id}`,
        type: 'popup',
        width: 300,
        height: 400,
        focused: true
      });
    });
    
    deleteBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      e.preventDefault();
      
      // 禁用删除按钮防止重复点击
      deleteBtn.disabled = true;
      
      try {
        // 获取当前待办事项列表
        const { todos } = await chrome.storage.local.get(['todos']);
        
        // 过滤掉要删除的待办事项
        const updatedTodos = todos.filter(t => t.id !== todo.id);
        
        // 保存更新后的待办事项列表
        await chrome.storage.local.set({ todos: updatedTodos });
        
        // 通知其他组件更新
        chrome.runtime.sendMessage({
          type: 'todosUpdated',
          todos: updatedTodos
        });
        
        // 如果存在提醒，取消提醒
        if (todo.reminder) {
          chrome.alarms.clear(`todo-${todo.id}`);
        }
        
        console.log('Todo deleted successfully');
      } catch (error) {
        console.error('Failed to delete todo:', error);
        // 删除失败时重新启用按钮
        deleteBtn.disabled = false;
      }
    });
    
    return li;
  }

  function groupTodosByDate(todos) {
    if (!Array.isArray(todos)) {
      console.warn('Invalid todos:', todos);
      return {};
    }

    return todos.reduce((groups, todo) => {
      if (!todo || !todo.date) {
        console.warn('Invalid todo item:', todo);
        return groups;
      }

      const date = todo.date;
      if (!groups[date]) {
        groups[date] = [];
      }
      groups[date].push(todo);
      return groups;
    }, {});
  }

  function formatDate(dateStr) {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (dateStr === today.toISOString().split('T')[0]) {
      return '今天';
    } else if (dateStr === yesterday.toISOString().split('T')[0]) {
      return '昨天';
    } else {
      return `${date.getMonth() + 1}月${date.getDate()}日`;
    }
  }

  function formatTime(time) {
    if (!time) return '';
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? '下午' : '上午';
    const hour12 = hour % 12 || 12;
    return `${ampm} ${hour12}:${minutes}`;
  }

  // 添加同步按钮和设置按钮
  const syncButton = document.createElement('button');
  syncButton.className = 'sync-btn';
  const settingsButton = document.createElement('button');
  settingsButton.className = 'settings-btn';
  const syncStatus = document.createElement('div');
  syncStatus.className = 'sync-status';
  
  syncButton.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M21.5 2v6h-6M2.5 22v-6h6M2 12c0-4.4 3.6-8 8-8 3.3 0 6.2 2 7.4 5M22 12c0 4.4-3.6 8-8 8-3.3 0-6.2-2-7.4-5"/>
    </svg>
  `;
  
  settingsButton.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M12 15a3 3 0 100-6 3 3 0 000 6z"/>
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>
    </svg>
  `;
  
  const dataViewerButton = document.createElement('button');
  dataViewerButton.className = 'data-viewer-btn';
  dataViewerButton.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14zM5 7h14v2H5V7zm0 4h14v2H5v-2zm0 4h14v2H5v-2z"/>
    </svg>
  `;

  const headerContainer = document.querySelector('.container h1');
  headerContainer.appendChild(syncButton);
  headerContainer.appendChild(settingsButton);
  headerContainer.appendChild(dataViewerButton);
  headerContainer.appendChild(syncStatus);

  // 添加同步功能
  syncButton.addEventListener('click', async () => {
    try {
      syncButton.disabled = true;
      syncButton.style.opacity = '0.5';
      syncStatus.textContent = '同步中...';
      syncStatus.className = 'sync-status syncing';
      
      // 检查是否已配置 GitHub
      const { githubClientId, githubClientSecret } = await chrome.storage.local.get([
        'githubClientId',
        'githubClientSecret'
      ]);

      if (!githubClientId || !githubClientSecret) {
        throw new Error('请先在设置中配置 GitHub 认证信息');
      }

      const updatedTodos = await todoSync.sync();
      renderTodosByDate(updatedTodos);
      syncStatus.textContent = '同步成功';
      syncStatus.className = 'sync-status success';
    } catch (error) {
      console.error('Sync failed:', error);
      syncStatus.textContent = error.message || '同步失败';
      syncStatus.className = 'sync-status error';
      
      // 如果是认证相关错误，自动打开设置页面
      if (error.message.includes('认证') || error.message.includes('配置')) {
        chrome.windows.create({
          url: 'settings.html',
          type: 'popup',
          width: 440,
          height: 400,
          focused: true
        });
      }
    } finally {
      syncButton.disabled = false;
      syncButton.style.opacity = '1';
      setTimeout(() => {
        if (syncStatus.className !== 'sync-status error') {
          syncStatus.textContent = '';
          syncStatus.className = 'sync-status';
        }
      }, 3000);
    }
  });

  // 监听同步状态更新
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'syncStatus') {
      const { success, error, lastSyncTime } = message.status;
      if (success) {
        syncStatus.textContent = `上次同步: ${formatLastSync(lastSyncTime)}`;
        syncStatus.className = 'sync-status';
      } else {
        syncStatus.textContent = error || '同步失败';
        syncStatus.className = 'sync-status error';
      }
    }
  });
  
  function formatLastSync(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
    return `${Math.floor(diff / 86400000)}天前`;
  }

  // 添加设置按钮点击事件
  settingsButton.addEventListener('click', () => {
    chrome.windows.create({
      url: 'settings.html',
      type: 'popup',
      width: 440,
      height: 400,
      focused: true
    });
  });

  // 添加数据查看按钮点击事件
  dataViewerButton.addEventListener('click', () => {
    chrome.windows.create({
      url: 'data-viewer.html',
      type: 'popup',
      width: 800,
      height: 600,
      focused: true
    });
  });

  // 添加存储变化监听
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes.todos) {
      renderTodosByDate(changes.todos.newValue);
    }
  });

  // 确保只有一个 todosUpdated 消息监听器
  const messageListeners = chrome.runtime.onMessage.getListeners();
  messageListeners.forEach(listener => {
    chrome.runtime.onMessage.removeListener(listener);
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'todosUpdated') {
      console.log('Received todos update:', message.todos);
      renderTodosByDate(message.todos);
    }
  });

  // 添加消息监听器
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'closeSidePanelFromButton') {
      // 查找并点击关闭按钮
      const closeButton = document.querySelector('button[aria-label="关闭侧边栏"]');
      if (closeButton) {
        closeButton.click();
      }
    }
  });
}); 