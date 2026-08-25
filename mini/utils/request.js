const { baseUrl } = require('./config');

/** 封装 wx.request:自动带 token、统一错误提示 */
function request(method, url, data) {
  return new Promise((resolve, reject) => {
    const token = wx.getStorageSync('token');
    wx.request({
      url: `${baseUrl}${url}`,
      method,
      data,
      header: token ? { Authorization: `Bearer ${token}` } : {},
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
          return;
        }
        if (res.statusCode === 401) {
          wx.removeStorageSync('token');
          wx.removeStorageSync('role');
          wx.reLaunch({ url: '/pages/login/login' });
        }
        const msg =
          (res.data && (Array.isArray(res.data.message) ? res.data.message.join(';') : res.data.message)) ||
          '请求失败';
        wx.showToast({ title: msg, icon: 'none', duration: 2500 });
        reject(new Error(msg));
      },
      fail(err) {
        wx.showToast({ title: '网络异常,请确认后端已启动', icon: 'none', duration: 2500 });
        reject(err);
      },
    });
  });
}

module.exports = {
  get: (url, data) => request('GET', url, data),
  post: (url, data) => request('POST', url, data),
};
