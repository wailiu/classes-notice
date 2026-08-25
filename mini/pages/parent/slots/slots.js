const api = require('../../../utils/request');

function fmt(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(base, days) {
  const d = new Date(base.getTime());
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * 选时段预约页:
 * 1. 先选时段(该课种下的班级模板:周几 + 上/下午 + 时间 + 老师 + 教室)
 * 2. 单次预约:勾选该时段未来若干次课(可多选)后提交
 * 3. 长期预约:选日期范围(未来两周/一个月)一键预约该时段范围内全部课次
 * 提交走服务端批量接口,返回成功/失败清单与实际扣课时数。
 */
Page({
  data: {
    studentId: null,
    studentName: '',
    courseId: null,
    courseName: '',
    loading: true,
    submitting: false,
    remaining: 0,
    slots: [],
    slotIndex: 0,
    mode: 'single', // single=单次(勾选) longterm=长期(按范围)
    lessons: [], // 当前时段课次(带 checked)
    selectedCount: 0,
    rangeDays: 30,
    rangeOptions: [
      { days: 14, label: '未来两周' },
      { days: 30, label: '未来一个月' },
    ],
    preview: { total: 0, bookable: 0, blocked: [] },
    result: null, // 提交结果面板
  },

  onLoad(options) {
    this.setData({
      studentId: Number(options.studentId),
      courseId: Number(options.courseId),
      courseName: decodeURIComponent(options.courseName || ''),
      studentName: decodeURIComponent(options.name || ''),
    });
    wx.setNavigationBarTitle({
      title: `${decodeURIComponent(options.courseName || '')} · 选时段预约`,
    });
    this.load();
  },

  async load() {
    this.setData({ loading: true });
    try {
      const data = await api.get(`/mini/parent/courses/${this.data.courseId}/slots`, {
        studentId: this.data.studentId,
        days: 35,
      });
      const slotIndex = Math.min(this.data.slotIndex, Math.max(0, data.slots.length - 1));
      this.setData({
        remaining: data.remaining,
        slots: data.slots,
        slotIndex,
      });
      this.refreshSlotViews();
    } finally {
      this.setData({ loading: false });
    }
  },

  /** 切换时段后重建课次勾选列表与长期预约预览 */
  refreshSlotViews() {
    const slot = this.data.slots[this.data.slotIndex];
    const lessons = ((slot && slot.lessons) || []).map((l) => ({ ...l, checked: false }));
    this.setData({ lessons, selectedCount: 0 });
    this.computePreview();
  },

  selectSlot(e) {
    const index = Number(e.currentTarget.dataset.index);
    if (index === this.data.slotIndex) return;
    this.setData({ slotIndex: index });
    this.refreshSlotViews();
  },

  switchMode(e) {
    this.setData({ mode: e.currentTarget.dataset.mode });
  },

  toggleLesson(e) {
    const id = Number(e.currentTarget.dataset.id);
    const lessons = this.data.lessons.map((l) => {
      if (l.id !== id) return l;
      if (!l.canBook) {
        wx.showToast({ title: l.reason, icon: 'none' });
        return l;
      }
      return { ...l, checked: !l.checked };
    });
    this.setData({
      lessons,
      selectedCount: lessons.filter((l) => l.checked).length,
    });
  },

  selectAllBookable() {
    const someUnchecked = this.data.lessons.some((l) => l.canBook && !l.checked);
    const lessons = this.data.lessons.map((l) =>
      l.canBook ? { ...l, checked: someUnchecked } : l,
    );
    this.setData({
      lessons,
      selectedCount: lessons.filter((l) => l.checked).length,
    });
  },

  setRange(e) {
    this.setData({ rangeDays: Number(e.currentTarget.dataset.days) });
    this.computePreview();
  },

  /** 长期预约预览:当前时段、日期范围内共几节、可约几节、不可约原因 */
  computePreview() {
    const slot = this.data.slots[this.data.slotIndex];
    if (!slot) {
      this.setData({ preview: { total: 0, bookable: 0, blocked: [] } });
      return;
    }
    const to = fmt(addDays(new Date(), this.data.rangeDays));
    const inRange = slot.lessons.filter((l) => l.date <= to);
    const blocked = inRange
      .filter((l) => !l.canBook)
      .map((l) => ({ date: l.date, weekdayText: l.weekdayText, reason: l.reason }));
    this.setData({
      preview: {
        total: inRange.length,
        bookable: inRange.filter((l) => l.canBook).length,
        blocked,
      },
    });
  },

  async submitSingle() {
    const selected = this.data.lessons.filter((l) => l.checked);
    if (!selected.length) {
      wx.showToast({ title: '请先勾选课次', icon: 'none' });
      return;
    }
    if (selected.length > this.data.remaining) {
      wx.showToast({ title: `剩余课时不足:已选 ${selected.length} 节,仅剩 ${this.data.remaining} 课时`, icon: 'none' });
      return;
    }
    const ok = await this.confirm(
      `将预约 ${selected.length} 节课,扣 ${selected.length} 课时。\n` +
        `当前剩余 ${this.data.remaining} 课时,预约后剩 ${this.data.remaining - selected.length} 课时。\n` +
        '开课前 2 小时内不可取消。',
    );
    if (!ok) return;
    await this.submitBatch({ lessonIds: selected.map((l) => l.id) });
  },

  async submitLongterm() {
    const slot = this.data.slots[this.data.slotIndex];
    const { preview, rangeDays, remaining } = this.data;
    if (!slot || !preview.bookable) {
      wx.showToast({ title: '该范围内没有可预约的课次', icon: 'none' });
      return;
    }
    if (preview.bookable > remaining) {
      wx.showToast({ title: `剩余课时不足:需 ${preview.bookable} 课时,仅剩 ${remaining} 课时`, icon: 'none' });
      return;
    }
    const rangeLabel = this.data.rangeOptions.find((o) => o.days === rangeDays).label;
    const skipText = preview.blocked.length ? `,${preview.blocked.length} 节不可约将自动跳过` : '';
    const ok = await this.confirm(
      `长期预约:${rangeLabel}每${slot.weekdayText}${slot.period} ${slot.startTime}-${slot.endTime}。\n` +
        `共 ${preview.total} 节,将预约 ${preview.bookable} 节、扣 ${preview.bookable} 课时${skipText}。\n` +
        `当前剩余 ${remaining} 课时,预约后剩 ${remaining - preview.bookable} 课时。`,
    );
    if (!ok) return;
    await this.submitBatch({
      classId: slot.classId,
      from: fmt(new Date()),
      to: fmt(addDays(new Date(), rangeDays)),
    });
  },

  confirm(content) {
    return new Promise((resolve) =>
      wx.showModal({
        title: '确认预约',
        content,
        confirmText: '确认预约',
        success: (res) => resolve(res.confirm),
      }),
    );
  },

  async submitBatch(payload) {
    if (this.data.submitting) return;
    this.setData({ submitting: true });
    try {
      const result = await api.post('/mini/parent/bookings/batch', {
        studentId: this.data.studentId,
        ...payload,
      });
      this.setData({ result });
    } catch (e) {
      // 整批被拒(课时不足/未购课种等):request 已 toast 服务端原因
    } finally {
      this.setData({ submitting: false });
    }
  },

  closeResult() {
    this.setData({ result: null });
    this.load();
  },

  noop() {},
});
