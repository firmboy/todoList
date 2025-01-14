document.addEventListener('DOMContentLoaded', () => {
  const clientIdInput = document.getElementById('clientId');
  const clientSecretInput = document.getElementById('clientSecret');
  const saveBtn = document.getElementById('saveBtn');
  const testBtn = document.getElementById('testBtn');
  const statusDiv = document.getElementById('status');

  // 加载保存的设置
  chrome.storage.local.get(['githubClientId', 'githubClientSecret'], (result) => {
    if (result.githubClientId) {
      clientIdInput.value = result.githubClientId;
    }
    if (result.githubClientSecret) {
      clientSecretInput.value = result.githubClientSecret;
    }
  });

  // 保存设置
  saveBtn.addEventListener('click', async () => {
    const clientId = clientIdInput.value.trim();
    const clientSecret = clientSecretInput.value.trim();

    if (!clientId || !clientSecret) {
      showStatus('请填写所有必填字段', 'error');
      return;
    }

    try {
      await chrome.storage.local.set({
        githubClientId: clientId,
        githubClientSecret: clientSecret
      });

      showStatus('设置已保存', 'success');
    } catch (error) {
      showStatus('保存设置失败: ' + error.message, 'error');
    }
  });

  // 测试连接
  testBtn.addEventListener('click', async () => {
    const clientId = clientIdInput.value.trim();
    const clientSecret = clientSecretInput.value.trim();

    if (!clientId || !clientSecret) {
      showStatus('请先填写并保存设置', 'error');
      return;
    }

    try {
      showStatus('正在测试连接...', 'info');
      
      // 尝试获取访问令牌
      const token = await getGitHubToken(clientId, clientSecret);
      
      // 测试API访问
      const response = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      if (!response.ok) {
        throw new Error('API 访问失败');
      }

      const user = await response.json();
      showStatus(`连接成功！已验证用户: ${user.login}`, 'success');
    } catch (error) {
      showStatus('连接测试失败: ' + error.message, 'error');
    }
  });

  // 显示状态信息
  function showStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`;
  }

  // 获取GitHub访问令牌
  async function getGitHubToken(clientId, clientSecret) {
    try {
      // 构建认证 URL
      const authUrl = `https://github.com/login/oauth/authorize?` +
        `client_id=${clientId}` +
        `&scope=gist read:user` +
        `&redirect_uri=${encodeURIComponent(`https://${chrome.runtime.id}.chromiumapp.org/`)}`;

      const token = await chrome.identity.launchWebAuthFlow({
        url: authUrl,
        interactive: true
      });

      // 从重定向 URL 中提取访问令牌
      const match = token.match(/[#?]access_token=([^&]*)/);
      if (!match) {
        throw new Error('未能获取访问令牌');
      }

      return match[1];
    } catch (error) {
      console.error('认证错误:', error);
      throw new Error('获取访问令牌失败: ' + error.message);
    }
  }
}); 