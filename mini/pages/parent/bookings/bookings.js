const api = require('../../../utils/request');

const STATUS_TEXT = {
  booked: '已预约',
  checked_in: '已签到',
  cancelled: '已取消',
  no_show: '缺勤',
};
const STATUS_TAG = {
  booked: 'tag-blue',
  checked_in: 'tag-green',
  cancelled: 'tag-gray',
  no_show: 'tag-red',
};

Page({
  data: {
    studentId: null,
    items: [],
    loading: true,
  },

  onLoad(options) {
    this.setData({ studentId: Number(options.studentId) });
    wx.setNavigationBarTitle({ title: `${options.name || ''} · 预约记录` });
  },

  onShow() {
    this.load();
  },

  async load() {
    this.setData({ loading: true });
    try {
      const items = await api.get('/mini/parent/bookings', { studentId: this.data.studentId });
      items.forEach((b) => {
        b.statusText = STATUS_TEXT[b.status] || b.status;
        b.statusTag = STATUS_TAG[b.status] || 'tag-gray';
        b.canCancel = b.status === 'booked' && b.lessonStatus === 'scheduled';
      });
      this.setData({ items });
    } finally {
      this.setData({ loading: false });
    }
  },

  async cancel(e) {
    const id = Number(e.currentTarget.dataset.id);
    const confirmed = await new Promise((resolve) =>
      wx.showModal({
        title: '取消预约',
        content: '取消后课时将退回。开课前 2 小时内不可取消。',
        success: (res) => resolve(res.confirm),
      }),
    );
    if (!confirmed) return;
    try {
      await api.post(`/mini/parent/bookings/${id}/cancel`);
      wx.showToast({ title: '已取消,课时退回', icon: 'success' });
      this.load();
    } catch (e) {
      // 已提示
    }
  },
});
