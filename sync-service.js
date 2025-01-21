export const todoSync = {
  GIST_DESCRIPTION: 'Chrome Todo List Backup',
  GIST_FILENAME: 'todos.json',
  syncInProgress: false,

  // 获取 GitHub 访问令牌
  async getAccessToken() {
    const { githubAccessToken } = await chrome.storage.local.get(['githubAccessToken']);
    if (!githubAccessToken) {
      throw new Error('需要 GitHub 访问令牌');
    }
    return githubAccessToken;
  },

  // 获取或创建用于存储的 Gist
  async getOrCreateGist(token) {
    const response = await fetch('https://api.github.com/gists', {
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });
    
    const gists = await response.json();
    const todoGist = gists.find(gist => 
      gist.description === this.GIST_DESCRIPTION &&
      gist.files[this.GIST_FILENAME]
    );

    if (todoGist) return todoGist.id;

    // 创建新的 Gist
    const newGist = await fetch('https://api.github.com/gists', {
      method: 'POST',
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        description: this.GIST_DESCRIPTION,
        public: false,
        files: {
          [this.GIST_FILENAME]: {
            content: JSON.stringify({ 
              todos: [],
              lastSync: new Date().toISOString(),
              version: 1
            })
          }
        }
      })
    });

    const newGistData = await newGist.json();
    return newGistData.id;
  },

  // 合并本地和远程数据
  mergeTodos(localTodos = [], remoteTodos = []) {
    const todosMap = new Map();
    
    // 添加所有本地待办事项
    localTodos.forEach(todo => {
      todosMap.set(todo.id, { ...todo });
    });

    // 合并远程待办事项，使用较新的版本
    remoteTodos.forEach(todo => {
      const localTodo = todosMap.get(todo.id);
      if (!localTodo || todo.timestamp > localTodo.timestamp) {
        todosMap.set(todo.id, { ...todo });
      }
    });

    return Array.from(todosMap.values())
      .sort((a, b) => b.timestamp - a.timestamp);
  },

  // 同步数据
  async sync() {
    if (this.syncInProgress) {
      console.log('同步正在进行中，跳过...');
      return;
    }

    this.syncInProgress = true;
    let syncError = null;

    try {
      // 获取访问令牌和本地数据
      const token = await this.getAccessToken();
      const { todos: localTodos, syncVersion } = await chrome.storage.local.get(['todos', 'syncVersion']);
      
      // 获取或创建 Gist
      const gistId = await this.getOrCreateGist(token);

      // 获取远程数据
      const response = await fetch(`https://api.github.com/gists/${gistId}`, {
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });
      
      const gistData = await response.json();
      const remoteData = JSON.parse(gistData.files[this.GIST_FILENAME].content);
      
      // 合并数据
      const mergedTodos = this.mergeTodos(localTodos, remoteData.todos);
      const newVersion = (remoteData.version || 0) + 1;

      // 更新远程数据
      await fetch(`https://api.github.com/gists/${gistId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          files: {
            [this.GIST_FILENAME]: {
              content: JSON.stringify({
                todos: mergedTodos,
                lastSync: new Date().toISOString(),
                version: newVersion
              })
            }
          }
        })
      });

      // 更新本地存储
      await chrome.storage.local.set({ 
        todos: mergedTodos,
        syncVersion: newVersion,
        lastSyncTime: new Date().toISOString()
      });

      // 广播更新消息
      chrome.runtime.sendMessage({
        type: 'todosUpdated',
        todos: mergedTodos
      });

      return mergedTodos;
    } catch (error) {
      console.error('同步失败:', error);
      syncError = error;
      throw error;
    } finally {
      this.syncInProgress = false;
      
      // 发送同步状态更新
      chrome.runtime.sendMessage({
        type: 'syncStatus',
        status: {
          success: !syncError,
          error: syncError?.message,
          lastSyncTime: new Date().toISOString()
        }
      });
    }
  }
}; 