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
      
      showStatus('正在获取授权...', 'info');
      const token = await getGitHubToken(clientId, clientSecret);
      
      showStatus('正在验证访问令牌...', 'info');
      const response = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`API 访问失败: ${errorData.message}`);
      }

      const user = await response.json();
      showStatus(`连接成功！已验证用户: ${user.login}`, 'success');
      
      // 保存访问令牌
      await chrome.storage.local.set({ githubAccessToken: token });
    } catch (error) {
      console.error('测试连接失败:', error);
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
        `&redirect_uri=${encodeURIComponent(`https://${chrome.runtime.id}.chromiumapp.org/oauth2`)}` +
        `&scope=${encodeURIComponent('gist read:user')}` +
        `&state=${Math.random().toString(36).substring(7)}` +
        `&allow_signup=true`;

      console.log('Auth URL:', authUrl);

      // 获取授权码
      const redirectUrl = await chrome.identity.launchWebAuthFlow({
        url: authUrl,
        interactive: true
      });

      console.log('Redirect URL:', redirectUrl);

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
          client_id: clientId,
          client_secret: clientSecret,
          code: code,
          redirect_uri: `https://${chrome.runtime.id}.chromiumapp.org/oauth2`
        })
      });

      const tokenData = await tokenResponse.json();
      console.log('Token response:', tokenData);

      if (tokenData.error) {
        throw new Error(`GitHub API 错误: ${tokenData.error_description}`);
      }

      if (!tokenData.access_token) {
        throw new Error('未能获取访问令牌');
      }

      return tokenData.access_token;
    } catch (error) {
      console.error('认证错误:', error);
      throw new Error('获取访问令牌失败: ' + error.message);
    }
  }
}); 