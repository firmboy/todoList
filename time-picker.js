document.addEventListener('DOMContentLoaded', () => {
  const hoursSelect = document.getElementById('hours');
  const minutesSelect = document.getElementById('minutes');
  const confirmBtn = document.querySelector('.confirm-btn');
  const cancelBtn = document.querySelector('.cancel-btn');
  const quickTimeButtons = document.querySelectorAll('.quick-time-btn');

  // 获取URL中的messageId
  const urlParams = new URLSearchParams(window.location.search);
  const messageId = urlParams.get('messageId');

  // 填充小时选项
  for (let i = 0; i < 24; i++) {
    const option = document.createElement('option');
    option.value = i;
    option.textContent = i.toString().padStart(2, '0');
    hoursSelect.appendChild(option);
  }

  // 填充分钟选项
  for (let i = 0; i < 60; i++) {
    const option = document.createElement('option');
    option.value = i;
    option.textContent = i.toString().padStart(2, '0');
    minutesSelect.appendChild(option);
  }

  // 设置默认时间为当前时间的下一分钟
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  
  if (currentMinute === 59) {
    hoursSelect.value = (currentHour + 1) % 24;
    minutesSelect.value = 0;
  } else {
    hoursSelect.value = currentHour;
    minutesSelect.value = currentMinute + 1;
  }

  // 快速选择时间
  quickTimeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const [hours, minutes] = btn.dataset.time.split(':');
      hoursSelect.value = parseInt(hours);
      minutesSelect.value = parseInt(minutes);
    });
  });

  // 确认按钮
  confirmBtn.addEventListener('click', () => {
    const time = `${hoursSelect.value.toString().padStart(2, '0')}:${minutesSelect.value.toString().padStart(2, '0')}`;
    chrome.runtime.sendMessage({
      action: 'setReminder',
      time: time,
      messageId: messageId
    }, response => {
      if (response && response.success) {
        window.close();
      }
    });
  });

  // 取消按钮
  cancelBtn.addEventListener('click', () => {
    window.close();
  });
}); 