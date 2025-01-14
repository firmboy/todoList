import { todoSync } from './sync-service.js';

window.onerror = function(message, source, lineno, colno, error) {
  console.error('Global error:', { message, source, lineno, colno, error });
};

document.addEventListener('DOMContentLoaded', () => {
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
          todayList.className = 'date-list collapsed';
          todayHeader.querySelector('.collapse-icon').style.transform = 'rotate(-90deg)';

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

      // 创建历史待办分组
      const historyDates = Object.keys(groupedTodos)
          .filter(date => date !== today)
          .sort((a, b) => new Date(b) - new Date(a));

      // 总是创建历史待办分组，即使没有历史待办事项
      {
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
    } catch (error) {
      console.error('Error in renderTodosByDate:', error);
    }
  }

  function createTodoElement(todo) {
    console.log('Creating element for todo:', todo);
    const li = document.createElement('li');
    const today = new Date().toISOString().split('T')[0];
    const showMoveButton = todo.date !== today;

    // 创建主要内容
    const mainContent = document.createElement('div');
    mainContent.className = 'todo-main-content';
    mainContent.innerHTML = `
      <div class="todo-header">
        <span class="todo-text">${todo.text}</span>
        <div class="todo-buttons">
          <button class="reminder-btn" title="设置提醒">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2zm-2 1H8v-6c0-2.48 1.51-4.5 4-4.5s4 2.02 4 4.5v6z"/>
            </svg>
          </button>
          ${showMoveButton ? '<button class="move-btn">移至今天</button>' : ''}
          <button class="delete-btn" title="删除">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
            </svg>
          </button>
        </div>
      </div>
    `;

    // 创建展开内容
    const expandedContent = document.createElement('div');
    expandedContent.className = 'todo-expanded-content';
    if (todo.reminder) {
      expandedContent.innerHTML = `
        <div class="reminder-info">
          提醒时间: ${formatTime(todo.reminder)}
        </div>
      `;
    }

    li.appendChild(mainContent);
    li.appendChild(expandedContent);

    // 设置初始展开状态
    expandedContent.style.height = '0';
    expandedContent.style.opacity = '0';

    // 事件处理
    const todoText = mainContent.querySelector('.todo-text');
    const buttonsDiv = mainContent.querySelector('.todo-buttons');
    const reminderBtn = buttonsDiv.querySelector('.reminder-btn');
    const deleteBtn = buttonsDiv.querySelector('.delete-btn');
    const moveBtn = buttonsDiv.querySelector('.move-btn');

    // 阻止按钮点击事件冒泡
    buttonsDiv.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    // 点击待办事项文本展开/收起
    todoText.addEventListener('click', (e) => {
      e.stopPropagation();
      const isExpanded = expandedContent.style.height !== '0px';
      
      if (isExpanded) {
        expandedContent.style.height = '0';
        expandedContent.style.opacity = '0';
      } else {
        expandedContent.style.height = expandedContent.scrollHeight + 'px';
        expandedContent.style.opacity = '1';
      }
    });

    // 删除按钮
    deleteBtn.addEventListener('click', () => {
      chrome.storage.local.get(['todos'], (result) => {
        const todos = result.todos || [];
        const updatedTodos = todos.filter(t => t.id !== todo.id);
        chrome.storage.local.set({ todos: updatedTodos }, () => {
          loadTodos(); // 重新加载所有待办事项
        });
      });
    });

    // 提醒按钮
    reminderBtn.addEventListener('click', () => {
      const messageId = Date.now().toString();
      const buttonRect = reminderBtn.getBoundingClientRect();
      
      chrome.windows.create({
        url: `time-picker.html?messageId=${messageId}`,
        type: 'popup',
        width: 232,
        height: 220,
        left: Math.round((window.screenLeft || window.screenX) + buttonRect.left),
        top: Math.round((window.screenTop || window.screenY) + buttonRect.bottom + 5),
        focused: true
      });

      function handleTimeSelection(request, sender, sendResponse) {
        if (request.action === 'setReminder' && request.messageId === messageId) {
          chrome.runtime.onMessage.removeListener(handleTimeSelection);
          
          chrome.storage.local.get(['todos'], (result) => {
            const todos = result.todos || [];
            const updatedTodos = todos.map(t => 
              t.id === todo.id ? { ...t, reminder: request.time } : t
            );
            chrome.storage.local.set({ todos: updatedTodos }, () => {
              renderTodosByDate(updatedTodos);
              sendResponse({ success: true });
            });
          });
          return true;
        }
      }
      
      chrome.runtime.onMessage.addListener(handleTimeSelection);
    });

    // 移动按钮
    if (showMoveButton) {
      moveBtn.addEventListener('click', () => {
        chrome.storage.local.get(['todos'], (result) => {
          const todos = result.todos || [];
          const updatedTodos = todos.map(t => 
            t.id === todo.id ? { ...t, date: today, timestamp: Date.now() } : t
          );
          chrome.storage.local.set({ todos: updatedTodos }, () => {
            renderTodosByDate(updatedTodos);
          });
        });
      });
    }

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
  
  const headerContainer = document.querySelector('.container h1');
  headerContainer.appendChild(syncButton);
  headerContainer.appendChild(settingsButton);
  headerContainer.appendChild(syncStatus);

  // 添加同步功能
  syncButton.addEventListener('click', async () => {
    try {
      syncButton.disabled = true;
      syncButton.style.opacity = '0.5';
      syncStatus.textContent = '同步中...';
      syncStatus.className = 'sync-status syncing';
      const updatedTodos = await todoSync.sync();
      renderTodosByDate(updatedTodos);
      syncStatus.textContent = '同步成功';
      syncStatus.className = 'sync-status success';
    } catch (error) {
      console.error('Sync failed:', error);
      syncStatus.textContent = error.message || '同步失败';
      syncStatus.className = 'sync-status error';
    } finally {
      syncButton.disabled = false;
      syncButton.style.opacity = '1';
      setTimeout(() => {
        syncStatus.textContent = '';
        syncStatus.className = 'sync-status';
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
}); 