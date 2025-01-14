// 创建悬浮按钮
function createFloatButton() {
  const button = document.createElement('div');
  button.innerHTML = `
    <div id="todo-float-button" style="
      position: fixed;
      right: 0;
      top: 40%;
      width: 24px;
      height: 80px;
      background-color: white;
      border: 1px solid #e0e0e0;
      border-right: none;
      border-radius: 4px 0 0 4px;
      box-shadow: -2px 0 8px rgba(0,0,0,0.05);
      cursor: pointer;
      z-index: 9999;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
      padding: 8px 4px;
    ">
      <div style="
        writing-mode: vertical-rl;
        color: #666;
        font-size: 12px;
        font-family: system-ui, -apple-system, sans-serif;
        letter-spacing: 1px;
        user-select: none;
      ">待办事项</div>
      <div style="
        position: absolute;
        right: 0;
        top: 50%;
        transform: translateY(-50%);
        width: 2px;
        height: 16px;
        background-color: #4dabf7;
        border-radius: 1px;
      "></div>
    </div>
  `;

  // 添加悬停效果
  const floatButton = button.firstElementChild;
  floatButton.addEventListener('mouseover', () => {
    floatButton.style.backgroundColor = '#f8f9fa';
  });

  floatButton.addEventListener('mouseout', () => {
    floatButton.style.backgroundColor = 'white';
  });

  // 点击事件
  floatButton.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'openTodoPanel' });
  });

  // 添加拖拽功能（仅限垂直方向）
  let isDragging = false;
  let initialY;
  let initialTop;

  floatButton.addEventListener('mousedown', (e) => {
    if (e.button === 0) { // 只响应左键
      isDragging = true;
      initialY = e.clientY;
      initialTop = floatButton.offsetTop;
      floatButton.style.transition = 'none';
      e.preventDefault(); // 防止文本选择
    }
  });

  document.addEventListener('mousemove', (e) => {
    if (isDragging) {
      e.preventDefault();
      const deltaY = e.clientY - initialY;
      let newTop = initialTop + deltaY;

      // 确保按钮不会超出屏幕边界
      const maxY = window.innerHeight - floatButton.offsetHeight - 20; // 留出底部边距
      newTop = Math.max(20, Math.min(newTop, maxY)); // 留出顶部边距

      floatButton.style.top = newTop + 'px';
    }
  });

  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      floatButton.style.transition = 'all 0.2s ease';
      saveButtonPosition();
    }
  });

  // 监听窗口大小变化
  window.addEventListener('resize', () => {
    const maxY = window.innerHeight - floatButton.offsetHeight - 20;
    const currentTop = parseInt(floatButton.style.top);
    if (currentTop > maxY) {
      floatButton.style.top = maxY + 'px';
      saveButtonPosition();
    }
  });

  document.body.appendChild(button);

  // 保存按钮位置
  function saveButtonPosition() {
    const position = floatButton.style.top;
    localStorage.setItem('todoButtonPosition', position);
  }

  // 恢复按钮位置
  const savedPosition = localStorage.getItem('todoButtonPosition');
  if (savedPosition) {
    floatButton.style.top = savedPosition;
  }
}

// 检查页面上是否已经存在悬浮按钮
if (!document.getElementById('todo-float-button')) {
  createFloatButton();
}

// 添加抖动动画
function addShakeAnimation(element) {
  // 移除可能存在的动画
  element.style.animation = 'none';
  element.offsetHeight; // 触发重排
  element.style.animation = 'shake 0.5s ease-in-out';

  // 动画结束后清除
  element.addEventListener('animationend', () => {
    element.style.animation = '';
  }, { once: true });

  console.log('Adding shake animation');
}

// 监听消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Received message:', request);
  if (request.action === 'shakeButton') {
    const button = document.getElementById('todo-float-button');
    if (button) {
      addShakeAnimation(button);
      console.log('Shake animation added to button');
    } else {
      console.log('Button not found');
    }
    // 立即发送响应
    sendResponse({ success: true });
  }
});

// 添加抖动动画的 CSS
const style = document.createElement('style');
style.textContent = `
  @keyframes shake {
    0%, 100% { transform: translateX(0); }
    25% { transform: translateX(-8px); }
    75% { transform: translateX(8px); }
  }
`;
document.head.appendChild(style); 