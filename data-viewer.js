document.addEventListener('DOMContentLoaded', () => {
  const dataDisplay = document.getElementById('dataDisplay');
  const stats = document.getElementById('stats');
  const refreshBtn = document.getElementById('refreshBtn');

  async function loadData() {
    try {
      const { todos, lastSyncTime, lastSyncVersion } = await chrome.storage.local.get([
        'todos',
        'lastSyncTime',
        'lastSyncVersion'
      ]);

      // 显示统计信息
      const totalTodos = todos?.length || 0;
      const completedTodos = todos?.filter(todo => todo.completed)?.length || 0;
      stats.textContent = `共 ${totalTodos} 个待办事项，已完成 ${completedTodos} 个`;
      
      // 格式化显示数据
      const displayData = {
        todos,
        lastSync: lastSyncTime,
        version: lastSyncVersion
      };

      dataDisplay.textContent = JSON.stringify(displayData, null, 2);
    } catch (error) {
      dataDisplay.textContent = '加载数据失败: ' + error.message;
      dataDisplay.className = 'error';
    }
  }

  // 加载初始数据
  loadData();

  // 刷新按钮点击事件
  refreshBtn.addEventListener('click', loadData);
}); 