const api = require('../../../utils/request');

Page({
  data: {
    studentId: null,
    studentName: '',
    days: [],
    lessons: [],
    grouped: [],
    loading: true,
    booking: false,
  },

  onLoad(options) {
    this.setData({
      studentId: Number(options.studentId),
      studentName: options.name || '',
    });
    wx.setNavigationBarTitle({ title: `${options.name || ''} · 预约课程` });
  },

  onShow() {
    this.load();
  },

  async load() {
    this.setData({ loading: true });
    try {
      const lessons = await api.get('/mini/parent/lessons', {
        studentId: this.data.studentId,
        days: 14,
      });
      // 按日期分组展示
      const map = {};
      lessons.forEach((l) => {
        if (!map[l.date]) map[l.date] = [];
        map[l.date].push(l);
      });
      const grouped = Object.keys(map)
        .sort()
        .map((date) => ({ date, weekday: this.weekdayText(date), list: map[date] }));
      this.setData({ lessons, grouped });
    } finally {
      this.setData({ loading: false });
    }
  },

  weekdayText(dateStr) {
    const names = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    return names[new Date(dateStr.replace(/-/g, '/')).getDay()];
  },

  async book(e) {
    const lessonId = Number(e.currentTarget.dataset.id);
    if (this.data.booking) return;
    const confirmed = await new Promise((resolve) =>
      wx.showModal({
        title: '确认预约',
        content: '预约成功将扣减 1 课时,开课前 2 小时内不可取消。',
        success: (res) => resolve(res.confirm),
      }),
    );
    if (!confirmed) return;
    this.setData({ booking: true });
    try {
      await api.post('/mini/parent/bookings', {
        studentId: this.data.studentId,
        lessonId,
      });
      wx.showToast({ title: '预约成功', icon: 'success' });
      this.load();
    } catch (e) {
      // 已提示
    } finally {
      this.setData({ booking: false });
    }
  },
});
