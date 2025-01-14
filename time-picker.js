document.addEventListener('DOMContentLoaded', () => {
  const closeBtn = document.querySelector('.close-btn');
  const timeButtons = document.querySelectorAll('.time-btn');
  const customTimeInput = document.getElementById('customTime');
  const confirmBtn = document.querySelector('.confirm-btn');

  // 设置默认时间为当前时间的下一个整点
  const now = new Date();
  now.setHours(now.getHours() + 1);
  now.setMinutes(0);
  customTimeInput.value = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  // 快速选择时间按钮
  timeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      // 移除其他按钮的选中状态
      timeButtons.forEach(b => b.classList.remove('selected'));
      // 添加当前按钮的选中状态
      btn.classList.add('selected');
      // 设置自定义时间输入框的值
      customTimeInput.value = btn.dataset.time;
    });
  });

  // 确认按钮
  confirmBtn.addEventListener('click', () => {
    const selectedTime = customTimeInput.value;
    if (!selectedTime) return;

    // 获取URL中的todoId
    const urlParams = new URLSearchParams(window.location.search);
    const todoId = urlParams.get('todoId');
    
    chrome.runtime.sendMessage({
      action: 'setReminder',
      todoId: todoId,
      time: selectedTime
    }, response => {
      if (response && response.success) {
        window.close();
      }
    });
  });

  // 关闭按钮
  closeBtn.addEventListener('click', () => {
    window.close();
  });
}); 