const api = require('../../utils/request');
const { devMock } = require('../../utils/config');

Page({
  data: {
    devMock,
    loading: false,
  },

  onLoad() {},

  /** 正式微信登录:wx.login 取 code,交给后端 code2session */
  async wxLogin() {
    this.setData({ loading: true });
    try {
      const { code } = await new Promise((resolve, reject) =>
        wx.login({ success: resolve, fail: reject }),
      );
      await this.doLogin(code);
    } catch (e) {
      // 错误已在 request 内提示
    } finally {
      this.setData({ loading: false });
    }
  },

  /** 开发模式:直接把 mock openid 当 code(后端 WX_MOCK=true 时生效) */
  async mockLogin(e) {
    const code = e.currentTarget.dataset.code;
    this.setData({ loading: true });
    try {
      await this.doLogin(code);
    } finally {
      this.setData({ loading: false });
    }
  },

  async doLogin(code) {
    const res = await api.post('/auth/mini-login', { code });
    wx.setStorageSync('token', res.token);
    wx.setStorageSync('role', res.role);
    wx.setStorageSync('profile', res.profile || {});
    const homeByRole = {
      parent: '/pages/parent/home/home',
      teacher: '/pages/teacher/home/home',
      principal: '/pages/principal/home/home',
    };
    wx.reLaunch({ url: homeByRole[res.role] || '/pages/unbound/unbound' });
  },
});
