const api = require('../../../utils/request');

Page({
  data: {
    profile: {},
    children: [],
    currentIndex: 0,
    loading: true,
  },

  onShow() {
    this.setData({ profile: wx.getStorageSync('profile') || {} });
    this.loadChildren();
  },

  async loadChildren() {
    this.setData({ loading: true });
    try {
      const children = await api.get('/mini/parent/children');
      const currentIndex = Math.min(this.data.currentIndex, Math.max(0, children.length - 1));
      this.setData({ children, currentIndex });
    } finally {
      this.setData({ loading: false });
    }
  },

  switchChild(e) {
    this.setData({ currentIndex: Number(e.currentTarget.dataset.index) });
  },

  goSchedule() {
    const child = this.data.children[this.data.currentIndex];
    if (!child) return;
    wx.navigateTo({
      url: `/pages/parent/schedule/schedule?studentId=${child.studentId}&name=${child.name}`,
    });
  },

  goBookings() {
    const child = this.data.children[this.data.currentIndex];
    if (!child) return;
    wx.navigateTo({
      url: `/pages/parent/bookings/bookings?studentId=${child.studentId}&name=${child.name}`,
    });
  },

  logout() {
    wx.clearStorageSync();
    wx.reLaunch({ url: '/pages/login/login' });
  },
});
