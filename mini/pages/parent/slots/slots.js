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
 * 课种预约页:
 * 1. 单次预约:该课种全部每周时段的课次同屏展示(如素描周六上午/周六下午/周日上午/周日下午
 *    全部列出),可跨时段任意勾选,时段筛选项仅辅助浏览,不限制勾选范围。
 * 2. 长期预约:先勾选要每周重复的课程(默认全选),再选日期范围,页面列出范围内全部对应
 *    课次;可约课次默认勾选、可单节取消,不可约课次展示原因。
 * 两种方式都按最终勾选的课次(lessonIds)提交服务端批量接口,页面所见即所约;
 * 返回成功/失败清单与实际扣课时数。
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
    allLessons: [], // 该课种全部时段的课次,拉平后按日期+时间排序
    mode: 'single', // single=单次(跨时段勾选) longterm=长期(按周课程×范围)
    // ---- 单次预约 ----
    filterClassId: 0, // 0=全部时段,仅用于浏览过滤,勾选跨筛选保留
    filterOptions: [],
    lessons: [], // 当前筛选下可见课次
    selectedCount: 0,
    // ---- 长期预约 ----
    patterns: [], // 每周课程(班级模板)勾选列表
    rangeDays: 30,
    rangeOptions: [
      { days: 14, label: '未来两周' },
      { days: 30, label: '未来一个月' },
    ],
    ltLessons: [], // 范围内对应课次(可约默认勾选)
    ltSelectedCount: 0,
    ltBlockedCount: 0,
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
      title: `${decodeURIComponent(options.courseName || '')} · 预约`,
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
      const allLessons = [];
      for (const slot of data.slots) {
        for (const l of slot.lessons) {
          allLessons.push({
            ...l,
            classId: slot.classId,
            period: slot.period,
            slotLabel: `${slot.weekdayText}${slot.period}`,
            teacherName: slot.teacherName,
            room: slot.room,
            checked: false,
          });
        }
      }
      allLessons.sort((a, b) => {
        const ka = `${a.date} ${a.startTime}`;
        const kb = `${b.date} ${b.startTime}`;
        return ka < kb ? -1 : ka > kb ? 1 : 0;
      });
      this.setData({
        remaining: data.remaining,
        slots: data.slots,
        allLessons,
        filterClassId: 0,
        filterOptions: [
          { classId: 0, label: '全部时段' },
          ...data.slots.map((s) => ({
            classId: s.classId,
            label: `${s.weekdayText}${s.period}`,
          })),
        ],
        // 默认全选每周课程:切到长期预约立即能看到范围内全部课次
        patterns: data.slots.map((s) => ({
          classId: s.classId,
          label: `${s.weekdayText}${s.period}`,
          startTime: s.startTime,
          endTime: s.endTime,
          teacherName: s.teacherName,
          room: s.room,
          checked: true,
        })),
      });
      this.refreshSingleList();
      this.rebuildLongterm();
    } finally {
      this.setData({ loading: false });
    }
  },

  switchMode(e) {
    this.setData({ mode: e.currentTarget.dataset.mode });
  },

  // ---------- 单次预约:全部课次同屏 + 跨时段多选 ----------

  /** 按筛选重建可见列表;已选节数按全量统计,切换筛选不丢勾选 */
  refreshSingleList() {
    const { allLessons, filterClassId } = this.data;
    const lessons = filterClassId
      ? allLessons.filter((l) => l.classId === filterClassId)
      : allLessons;
    this.setData({
      lessons,
      selectedCount: allLessons.filter((l) => l.checked).length,
    });
  },

  setFilter(e) {
    const classId = Number(e.currentTarget.dataset.classId);
    if (classId === this.data.filterClassId) return;
    this.setData({ filterClassId: classId });
    this.refreshSingleList();
  },

  toggleLesson(e) {
    const id = Number(e.currentTarget.dataset.id);
    const target = this.data.allLessons.find((l) => l.id === id);
    if (!target) return;
    if (!target.canBook) {
      wx.showToast({ title: target.reason, icon: 'none' });
      return;
    }
    this.setData({
      allLessons: this.data.allLessons.map((l) =>
        l.id === id ? { ...l, checked: !l.checked } : l,
      ),
    });
    this.refreshSingleList();
  },

  /** 全选/取消全选当前筛选下的可约课次 */
  selectAllBookable() {
    const visibleIds = new Set(this.data.lessons.map((l) => l.id));
    const someUnchecked = this.data.lessons.some((l) => l.canBook && !l.checked);
    this.setData({
      allLessons: this.data.allLessons.map((l) =>
        visibleIds.has(l.id) && l.canBook ? { ...l, checked: someUnchecked } : l,
      ),
    });
    this.refreshSingleList();
  },

  // ---------- 长期预约:勾选每周课程 × 日期范围 → 课次列表 ----------

  togglePattern(e) {
    const classId = Number(e.currentTarget.dataset.classId);
    this.setData({
      patterns: this.data.patterns.map((p) =>
        p.classId === classId ? { ...p, checked: !p.checked } : p,
      ),
    });
    this.rebuildLongterm();
  },

  setRange(e) {
    const days = Number(e.currentTarget.dataset.days);
    if (days === this.data.rangeDays) return;
    this.setData({ rangeDays: days });
    this.rebuildLongterm();
  },

  /** 重建长期预约课次列表:勾选的每周课程在范围内的全部课次,可约的默认勾选 */
  rebuildLongterm() {
    const checkedClassIds = new Set(
      this.data.patterns.filter((p) => p.checked).map((p) => p.classId),
    );
    const to = fmt(addDays(new Date(), this.data.rangeDays));
    const ltLessons = this.data.allLessons
      .filter((l) => checkedClassIds.has(l.classId) && l.date <= to)
      .map((l) => ({ ...l, ltChecked: l.canBook }));
    this.setData({
      ltLessons,
      ltSelectedCount: ltLessons.filter((l) => l.ltChecked).length,
      ltBlockedCount: ltLessons.filter((l) => !l.canBook).length,
    });
  },

  toggleLtLesson(e) {
    const id = Number(e.currentTarget.dataset.id);
    const target = this.data.ltLessons.find((l) => l.id === id);
    if (!target) return;
    if (!target.canBook) {
      wx.showToast({ title: target.reason, icon: 'none' });
      return;
    }
    const ltLessons = this.data.ltLessons.map((l) =>
      l.id === id ? { ...l, ltChecked: !l.ltChecked } : l,
    );
    this.setData({
      ltLessons,
      ltSelectedCount: ltLessons.filter((l) => l.ltChecked && l.canBook).length,
    });
  },

  // ---------- 提交 ----------

  async submitSingle() {
    const selected = this.data.allLessons.filter((l) => l.checked);
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
    const selected = this.data.ltLessons.filter((l) => l.ltChecked && l.canBook);
    const { remaining, ltBlockedCount } = this.data;
    if (!selected.length) {
      wx.showToast({ title: '请先勾选每周课程与课次', icon: 'none' });
      return;
    }
    if (selected.length > remaining) {
      wx.showToast({ title: `剩余课时不足:需 ${selected.length} 课时,仅剩 ${remaining} 课时`, icon: 'none' });
      return;
    }
    const rangeLabel = this.data.rangeOptions.find((o) => o.days === this.data.rangeDays).label;
    const patternText = this.data.patterns
      .filter((p) => p.checked)
      .map((p) => p.label)
      .join('、');
    const skipText = ltBlockedCount ? `,${ltBlockedCount} 节不可约已跳过` : '';
    const ok = await this.confirm(
      `长期预约:${rangeLabel}每周 ${patternText}。\n` +
        `将预约 ${selected.length} 节、扣 ${selected.length} 课时${skipText}。\n` +
        `当前剩余 ${remaining} 课时,预约后剩 ${remaining - selected.length} 课时。`,
    );
    if (!ok) return;
    await this.submitBatch({ lessonIds: selected.map((l) => l.id) });
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
