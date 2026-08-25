Page({
  data: {},

  backToLogin() {
    wx.clearStorageSync();
    wx.reLaunch({ url: '/pages/login/login' });
  },

  call() {
    // 演示用前台电话,可在此替换为真实号码
    wx.makePhoneCall({ phoneNumber: '13800000000', fail: () => {} });
  },
});
