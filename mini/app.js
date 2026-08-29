const ROLE_HOME = {
  parent: '/pages/parent/home/home',
  teacher: '/pages/teacher/home/home',
  principal: '/pages/principal/home/home',
};

App({
  onLaunch() {
    const token = wx.getStorageSync('token');
    const role = wx.getStorageSync('role');
    if (token && ROLE_HOME[role]) {
      wx.reLaunch({ url: ROLE_HOME[role] });
    }
    // 其余情况停留在登录页
  },
  globalData: {},
});
