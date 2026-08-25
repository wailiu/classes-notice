const api = require('../../../utils/request');

const STATUS_TEXT = {
  booked: '已预约',
  checked_in: '已签到',
  no_show: '缺勤',
};
const STATUS_TAG = {
  booked: 'tag-blue',
  checked_in: 'tag-green',
  no_show: 'tag-red',
};

Page({
  data: {
    lessonId: null,
    lesson: null,
    students: [],
    loading: true,
  },

  onLoad(options) {
    this.setData({ lessonId: Number(options.lessonId) });
  },

  onShow() {
    this.load();
  },

  async load() {
    this.setData({ loading: true });
    try {
      const res = await api.get(`/mini/teacher/lessons/${this.data.lessonId}/roster`);
      res.students.forEach((s) => {
        s.statusText = STATUS_TEXT[s.status] || s.status;
        s.statusTag = STATUS_TAG[s.status] || 'tag-gray';
      });
      this.setData({ lesson: res.lesson, students: res.students });
      wx.setNavigationBarTitle({ title: res.lesson.className });
    } finally {
      this.setData({ loading: false });
    }
  },

  async checkin(e) {
    const id = Number(e.currentTarget.dataset.id);
    try {
      await api.post(`/mini/teacher/bookings/${id}/checkin`);
      wx.showToast({ title: '已签到', icon: 'success' });
      this.load();
    } catch (err) {
      // 已提示
    }
  },

  call(e) {
    const phone = e.currentTarget.dataset.phone;
    if (phone) wx.makePhoneCall({ phoneNumber: phone });
  },
});
