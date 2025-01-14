// 每30秒发送一次心跳
setInterval(() => {
  chrome.runtime.sendMessage({ type: 'heartbeat' });
}, 30000);

// 连接到 background
const port = chrome.runtime.connect({ name: 'keepAlive' });
port.onDisconnect.addListener(() => {
  // 重新连接
  chrome.runtime.connect({ name: 'keepAlive' });
}); 