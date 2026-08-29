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
    // 临时到课(手动扣课时)
    walkinOpen: false,
    walkinLoaded: false,
    walkinLoading: false,
    candidates: [],
    candidateLabels: [],
    pickedIndex: -1,
    remainingSeats: 0,
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
        s.sourceText = s.source === 'teacher' ? '老师登记' : '';
      });
      this.setData({ lesson: res.lesson, students: res.students });
      wx.setNavigationBarTitle({ title: res.lesson.className });
      // 名单变了,临时到课的候选也要刷新(排除已在名单中的学员)
      if (this.data.walkinOpen) await this.loadCandidates();
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

  // ---------- 临时到课 ----------

  toggleWalkin() {
    const open = !this.data.walkinOpen;
    this.setData({ walkinOpen: open });
    if (open) this.loadCandidates();
  },

  async loadCandidates() {
    this.setData({ walkinLoading: true });
    try {
      const res = await api.get(`/mini/teacher/lessons/${this.data.lessonId}/walkin-candidates`);
      this.setData({
        candidates: res.students,
        candidateLabels: res.students.map((s) => `${s.name}(剩 ${s.remaining} 课时)`),
        remainingSeats: res.remainingSeats,
        pickedIndex: -1,
        walkinLoaded: true,
      });
    } finally {
      this.setData({ walkinLoading: false });
    }
  },

  onPickStudent(e) {
    this.setData({ pickedIndex: Number(e.detail.value) });
  },

  async addWalkin() {
    const student = this.data.candidates[this.data.pickedIndex];
    if (!student) {
      wx.showToast({ title: '请先选择学员', icon: 'none' });
      return;
    }
    try {
      const res = await api.post(`/mini/teacher/lessons/${this.data.lessonId}/walkin`, {
        studentId: student.studentId,
      });
      await this.load();
      wx.showToast({
        title:
          res && res.remainingAfter !== undefined
            ? `已扣 1 课时,该课种剩 ${res.remainingAfter} 课时`
            : `已为 ${student.name} 扣 1 课时`,
        icon: 'none',
      });
    } catch (err) {
      // 已提示
    }
  },
});
