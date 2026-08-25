const api = require('../../../utils/request');

Page({
  data: {
    profile: {},
    grouped: [],
    loading: true,
  },

  onShow() {
    this.setData({ profile: wx.getStorageSync('profile') || {} });
    this.load();
  },

  async load() {
    this.setData({ loading: true });
    try {
      const lessons = await api.get('/mini/teacher/lessons', { days: 14 });
      const map = {};
      lessons.forEach((l) => {
        if (!map[l.date]) map[l.date] = [];
        map[l.date].push(l);
      });
      const grouped = Object.keys(map)
        .sort()
        .map((date) => ({ date, weekday: this.weekdayText(date), list: map[date] }));
      this.setData({ grouped });
    } finally {
      this.setData({ loading: false });
    }
  },

  weekdayText(dateStr) {
    const names = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    return names[new Date(dateStr.replace(/-/g, '/')).getDay()];
  },

  goRoster(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/teacher/roster/roster?lessonId=${id}` });
  },

  logout() {
    wx.clearStorageSync();
    wx.reLaunch({ url: '/pages/login/login' });
  },
});
