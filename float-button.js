// 确保按钮只被创建一次
let todoButton = null;

// 在文件顶部添加状态跟踪
let isPanelOpen = false;

function createButton() {
  if (todoButton) return;
  
  todoButton = document.createElement('button');
  todoButton.id = 'todoButton';
  todoButton.className = 'todo-button';
  todoButton.innerHTML = `
    <span>待办事项</span>
  `;

  // 使用 shadow DOM 来隔离样式
  const host = document.createElement('div');
  host.id = 'todo-button-host';
  const shadow = host.attachShadow({ mode: 'open' });
  
  // 添加样式
  const style = document.createElement('style');
  style.textContent = `
    .todo-button {
      position: fixed;
      top: 50%;
      right: 0;
      transform: translateY(-50%);
      display: flex;
      align-items: center;
      padding: 10px 6px;
      background-color: #4CAF50;
      color: white;
      border: none;
      border-radius: 6px 0 0 6px;
      cursor: pointer;
      box-shadow: -2px 0 5px rgba(0,0,0,0.2);
      transition: all 0.3s ease;
      z-index: 2147483647;
      font-family: system-ui, -apple-system, sans-serif;
      writing-mode: vertical-rl;
      letter-spacing: 1px;
    }

    .todo-button.has-reminder {
      background-color: #ff9800;
      animation: pulse 2s infinite;
    }

    @keyframes pulse {
      0% {
        box-shadow: -2px 0 0 0 rgba(255, 152, 0, 0.4);
      }
      70% {
        box-shadow: -2px 0 0 10px rgba(255, 152, 0, 0);
      }
      100% {
        box-shadow: -2px 0 0 0 rgba(255, 152, 0, 0);
      }
    }

    .todo-button:hover {
      background-color: #45a049;
      padding-right: 10px;
      box-shadow: -3px 0 8px rgba(0,0,0,0.2);
    }

    .todo-button span {
      font-size: 13px;
    }
  `;

  shadow.appendChild(style);
  shadow.appendChild(todoButton);
  document.body.appendChild(host);

  todoButton.addEventListener('click', () => {
    // 切换面板状态
    isPanelOpen = !isPanelOpen;
    
    // 根据状态发送不同的消息
    chrome.runtime.sendMessage({ 
      action: isPanelOpen ? 'openSidePanel' : 'closeSidePanel' 
    });
  });

  // 创建按钮后立即检查提醒状态
  updateButtonReminderState();
}

// 使用 MutationObserver 确保按钮始终存在
function ensureButtonExists() {
  const observer = new MutationObserver((mutations) => {
    const host = document.getElementById('todo-button-host');
    if (!host) {
      createButton();
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  // 初始创建按钮
  createButton();
}

// 当 DOM 加载完成后初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', ensureButtonExists);
} else {
  ensureButtonExists();
}

// 处理从 background script 发来的消息
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'shakeButton' && todoButton) {
    // 添加提醒样式
    todoButton.classList.add('has-reminder');
    
    // 修改点击事件处理
    const checkAndClearReminder = () => {
      // 检查所有待办事项的提醒状态
      chrome.storage.local.get(['todos'], (result) => {
        const todos = result.todos || [];
        const hasReminders = todos.some(todo => todo.reminded && !todo.completed);
        
        // 只有当没有提醒中的待办事项时，才移除提醒样式
        if (!hasReminders) {
          todoButton.classList.remove('has-reminder');
          todoButton.removeEventListener('click', checkAndClearReminder);
        }
      });
    };
    
    todoButton.addEventListener('click', checkAndClearReminder);
  }
  
  if (message.action === 'sidePanelStateChanged') {
    isPanelOpen = message.isOpen;
  }
});

// 添加一个函数来检查并更新按钮状态
function updateButtonReminderState() {
  if (!todoButton) return;
  
  chrome.storage.local.get(['todos'], (result) => {
    const todos = result.todos || [];
    const hasReminders = todos.some(todo => todo.reminded && !todo.completed);
    
    if (hasReminders) {
      todoButton.classList.add('has-reminder');
    } else {
      todoButton.classList.remove('has-reminder');
    }
  });
}

// 监听存储变化以更新按钮状态
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.todos) {
    updateButtonReminderState();
  }
}); 