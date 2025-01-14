class TodoSync {
  constructor() {
    this.GIST_DESCRIPTION = 'Chrome Todo List Backup';
    this.GIST_FILENAME = 'todos.json';
    this.AUTO_SYNC_INTERVAL = 5 * 60 * 1000; // 5分钟自动同步一次
    this.syncTimer = null;
    this.lastSyncTime = null;
    this.syncInProgress = false;
    this.syncQueue = [];
    this.conflictResolver = new ConflictResolver();
  }

  // 初始化同步服务
  async initialize() {
    try {
      // 读取上次同步时间
      const { lastSyncTime } = await chrome.storage.local.get(['lastSyncTime']);
      this.lastSyncTime = lastSyncTime;

      // 启动自动同步
      this.startAutoSync();

      // 监听存储变化
      chrome.storage.onChanged.addListener(this.handleStorageChange.bind(this));

      console.log('Sync service initialized');
    } catch (error) {
      console.error('Failed to initialize sync service:', error);
    }
  }

  // 处理存储变化
  async handleStorageChange(changes, areaName) {
    if (areaName === 'local' && changes.todos) {
      // 如果变化是由同步操作引起的，则跳过
      if (this.syncInProgress) return;

      // 将变化加入同步队列
      this.queueSync();
    }
  }

  // 将同步任务加入队列
  queueSync() {
    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
    }

    // 延迟2秒后执行同步，避免频繁同步
    this.syncTimer = setTimeout(() => {
      this.sync().catch(console.error);
    }, 2000);
  }

  // 启动自动同步
  startAutoSync() {
    setInterval(() => {
      this.sync().catch(console.error);
    }, this.AUTO_SYNC_INTERVAL);
  }

  // 获取 GitHub 访问令牌
  async getAccessToken() {
    try {
      // 先尝试从存储中获取已保存的令牌
      const { githubAccessToken } = await chrome.storage.local.get(['githubAccessToken']);
      if (githubAccessToken) {
        // 验证令牌是否有效
        const response = await fetch('https://api.github.com/user', {
          headers: {
            'Authorization': `Bearer ${githubAccessToken}`,
            'Accept': 'application/vnd.github.v3+json'
          }
        });
        
        if (response.ok) {
          return githubAccessToken;
        }
      }

      // 如果没有令牌或令牌无效，则重新获取
      const { githubClientId, githubClientSecret } = await chrome.storage.local.get([
        'githubClientId',
        'githubClientSecret'
      ]);

      if (!githubClientId || !githubClientSecret) {
        throw new Error('请先在设置中配置 GitHub 认证信息');
      }

      // 构建认证 URL
      const authUrl = `https://github.com/login/oauth/authorize?` +
        `client_id=${githubClientId}` +
        `&redirect_uri=${encodeURIComponent(`https://${chrome.runtime.id}.chromiumapp.org/oauth2`)}` +
        `&scope=${encodeURIComponent('gist read:user')}` +
        `&state=${Math.random().toString(36).substring(7)}` +
        `&allow_signup=true`;

      // 获取授权码
      const redirectUrl = await chrome.identity.launchWebAuthFlow({
        url: authUrl,
        interactive: true
      });

      // 从重定向 URL 中提取授权码
      const code = new URL(redirectUrl).searchParams.get('code');
      if (!code) {
        throw new Error('未获取到授权码');
      }

      // 使用授权码获取访问令牌
      const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          client_id: githubClientId,
          client_secret: githubClientSecret,
          code: code,
          redirect_uri: `https://${chrome.runtime.id}.chromiumapp.org/oauth2`
        })
      });

      const tokenData = await tokenResponse.json();
      
      if (tokenData.error) {
        throw new Error(`GitHub API 错误: ${tokenData.error_description}`);
      }

      if (!tokenData.access_token) {
        throw new Error('未能获取访问令牌');
      }

      // 保存新的访问令牌
      await chrome.storage.local.set({ githubAccessToken: tokenData.access_token });

      return tokenData.access_token;
    } catch (error) {
      console.error('获取访问令牌失败:', error);
      throw new Error('认证失败: ' + error.message);
    }
  }

  // 获取或创建用于存储的 Gist
  async getOrCreateGist(token) {
    try {
      const gists = await fetch('https://api.github.com/gists', {
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      }).then(res => {
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        return res.json();
      });

      const todoGist = gists.find(gist => 
        gist.description === this.GIST_DESCRIPTION &&
        gist.files[this.GIST_FILENAME]
      );

      if (todoGist) return todoGist.id;

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
      }).then(res => {
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        return res.json();
      });

      return newGist.id;
    } catch (error) {
      console.error('Failed to get or create Gist:', error);
      throw new Error('无法访问或创建 Gist，请检查网络连接');
    }
  }

  // 上传数据到 Gist
  async uploadToGist(token, gistId, todos, version) {
    try {
      const response = await fetch(`https://api.github.com/gists/${gistId}`, {
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
                todos,
                lastSync: new Date().toISOString(),
                version: version + 1
              })
            }
          }
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
    } catch (error) {
      console.error('Failed to upload to Gist:', error);
      throw new Error('上传数据失败，请重试');
    }
  }

  // 从 Gist 下载数据
  async downloadFromGist(token, gistId) {
    try {
      const response = await fetch(`https://api.github.com/gists/${gistId}`, {
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      }).then(res => {
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        return res.json();
      });

      const content = response.files[this.GIST_FILENAME].content;
      return JSON.parse(content);
    } catch (error) {
      console.error('Failed to download from Gist:', error);
      throw new Error('下载数据失败，请重试');
    }
  }

  // 同步数据
  async sync() {
    if (this.syncInProgress) {
      console.log('Sync already in progress, skipping...');
      return;
    }

    this.syncInProgress = true;
    let syncError = null;

    try {
      const token = await this.getAccessToken();
      const gistId = await this.getOrCreateGist(token);

      // 获取本地数据
      const { todos: localTodos, lastSyncVersion } = await chrome.storage.local.get(['todos', 'lastSyncVersion']);
      
      // 获取远程数据
      const { todos: remoteTodos, version: remoteVersion } = await this.downloadFromGist(token, gistId);

      // 检查版本冲突
      if (lastSyncVersion && remoteVersion > lastSyncVersion) {
        // 存在冲突，需要解决
        const mergedTodos = await this.conflictResolver.resolve(localTodos, remoteTodos);
        
        // 更新本地存储
        await chrome.storage.local.set({ 
          todos: mergedTodos,
          lastSyncVersion: remoteVersion,
          lastSyncTime: new Date().toISOString()
        });

        // 更新远程存储
        await this.uploadToGist(token, gistId, mergedTodos, remoteVersion);

        return mergedTodos;
      } else {
        // 无冲突，直接合并
        const mergedTodos = this.mergeTodos(localTodos || [], remoteTodos || []);
        
        // 更新本地存储
        await chrome.storage.local.set({ 
          todos: mergedTodos,
          lastSyncVersion: remoteVersion,
          lastSyncTime: new Date().toISOString()
        });

        // 更新远程存储
        await this.uploadToGist(token, gistId, mergedTodos, remoteVersion || 0);

        return mergedTodos;
      }
    } catch (error) {
      console.error('Sync failed:', error);
      syncError = error;
      throw error;
    } finally {
      this.syncInProgress = false;
      this.lastSyncTime = new Date().toISOString();
      
      // 触发同步状态更新事件
      this.dispatchSyncEvent({
        success: !syncError,
        error: syncError?.message,
        lastSyncTime: this.lastSyncTime
      });
    }
  }

  // 合并本地和远程数据
  mergeTodos(localTodos, remoteTodos) {
    const todosMap = new Map();

    // 添加所有本地待办事项
    localTodos.forEach(todo => {
      todosMap.set(todo.id, { ...todo, _source: 'local' });
    });

    // 合并远程待办事项
    remoteTodos.forEach(todo => {
      const localTodo = todosMap.get(todo.id);
      if (!localTodo || todo.timestamp > localTodo.timestamp) {
        todosMap.set(todo.id, { ...todo, _source: 'remote' });
      }
    });

    return Array.from(todosMap.values())
      .map(todo => {
        const { _source, ...cleanTodo } = todo;
        return cleanTodo;
      })
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  // 触发同步状态更新事件
  dispatchSyncEvent(status) {
    chrome.runtime.sendMessage({
      type: 'syncStatus',
      status
    });
  }
}

// 冲突解决器类
class ConflictResolver {
  async resolve(localTodos, remoteTodos) {
    const conflicts = this.findConflicts(localTodos, remoteTodos);
    
    if (conflicts.length === 0) {
      return this.mergeTodos(localTodos, remoteTodos);
    }

    // 自动解决冲突
    return this.autoResolveConflicts(conflicts, localTodos, remoteTodos);
  }

  findConflicts(localTodos, remoteTodos) {
    const conflicts = [];
    const localMap = new Map(localTodos.map(todo => [todo.id, todo]));
    const remoteMap = new Map(remoteTodos.map(todo => [todo.id, todo]));

    // 检查所有本地和远程的待办事项
    for (const [id, localTodo] of localMap) {
      const remoteTodo = remoteMap.get(id);
      if (remoteTodo && this.hasConflict(localTodo, remoteTodo)) {
        conflicts.push({
          id,
          local: localTodo,
          remote: remoteTodo
        });
      }
    }

    return conflicts;
  }

  hasConflict(localTodo, remoteTodo) {
    // 检查是否有实际的内容差异
    return (
      localTodo.text !== remoteTodo.text ||
      localTodo.reminder !== remoteTodo.reminder ||
      localTodo.date !== remoteTodo.date ||
      localTodo.completed !== remoteTodo.completed
    );
  }

  mergeTodos(localTodos, remoteTodos) {
    const mergedMap = new Map();
    
    // 添加所有本地待办事项
    localTodos.forEach(todo => {
      mergedMap.set(todo.id, todo);
    });

    // 添加或更新远程待办事项
    remoteTodos.forEach(todo => {
      if (!mergedMap.has(todo.id)) {
        // 如果本地没有，直接添加
        mergedMap.set(todo.id, todo);
      }
    });

    return Array.from(mergedMap.values())
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  autoResolveConflicts(conflicts, localTodos, remoteTodos) {
    const resolvedMap = new Map();

    // 首先添加所有非冲突的待办事项
    [...localTodos, ...remoteTodos].forEach(todo => {
      if (!conflicts.find(c => c.id === todo.id)) {
        resolvedMap.set(todo.id, todo);
      }
    });

    // 解决冲突
    conflicts.forEach(conflict => {
      // 使用较新的版本
      const resolved = conflict.local.timestamp > conflict.remote.timestamp
        ? conflict.local
        : conflict.remote;
      
      resolvedMap.set(conflict.id, resolved);
    });

    return Array.from(resolvedMap.values())
      .sort((a, b) => b.timestamp - a.timestamp);
  }
}

// 导出同步服务实例
export const todoSync = new TodoSync();

// 初始化同步服务
todoSync.initialize().catch(console.error); 