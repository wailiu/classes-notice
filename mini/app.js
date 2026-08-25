App({
  onLaunch() {
    const token = wx.getStorageSync('token');
    const role = wx.getStorageSync('role');
    if (token && role === 'parent') {
      wx.reLaunch({ url: '/pages/parent/home/home' });
    } else if (token && role === 'teacher') {
      wx.reLaunch({ url: '/pages/teacher/home/home' });
    }
    // 其余情况停留在登录页
  },
  globalData: {},
});
