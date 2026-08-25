const api = require('../../../utils/request');

/**
 * 预约课程入口页:按课种展示(服务端已按"已购置顶"排序,前端再兜底排一次)。
 * 点击已购且可约的课种 → 进入选时段页;未购/课时不足的课种不可进入,提示原因。
 */
Page({
  data: {
    studentId: null,
    studentName: '',
    courses: [],
    loading: true,
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
      const courses = await api.get('/mini/parent/courses', {
        studentId: this.data.studentId,
      });
      // 服务端已排序;前端兜底:可约 → 已购不可约 → 未购
      const rank = (c) => (c.bookable ? 0 : c.purchased ? 1 : 2);
      courses.sort((a, b) => rank(a) - rank(b) || b.remaining - a.remaining);
      this.setData({ courses });
    } finally {
      this.setData({ loading: false });
    }
  },

  enterCourse(e) {
    const courseId = Number(e.currentTarget.dataset.id);
    const course = this.data.courses.find((c) => c.courseId === courseId);
    if (!course) return;
    if (!course.bookable) {
      wx.showToast({ title: course.reason, icon: 'none', duration: 2500 });
      return;
    }
    wx.navigateTo({
      url:
        `/pages/parent/slots/slots?studentId=${this.data.studentId}` +
        `&courseId=${course.courseId}` +
        `&courseName=${encodeURIComponent(course.courseName)}` +
        `&name=${encodeURIComponent(this.data.studentName)}`,
    });
  },
});
