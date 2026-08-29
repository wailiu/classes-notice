const api = require('../../../utils/request');

const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function dateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function money(n) {
  return Number(n || 0).toFixed(2);
}

Page({
  data: {
    profile: {},
    overview: null,
    lessonGroups: [],
    payments: [],
    loading: true,
  },

  onShow() {
    this.setData({ profile: wx.getStorageSync('profile') || {} });
    this.loadAll();
  },

  onPullDownRefresh() {
    this.loadAll().finally(() => wx.stopPullDownRefresh());
  },

  async loadAll() {
    this.setData({ loading: true });
    try {
      const [overview, lessons, payments] = await Promise.all([
        api.get('/mini/principal/overview'),
        api.get('/mini/principal/lessons', { days: 7 }),
        api.get('/mini/principal/payments', { limit: 20 }),
      ]);
      this.setData({
        overview: this.formatOverview(overview),
        lessonGroups: this.groupLessons(lessons || []),
        payments: this.formatPayments(payments || []),
      });
    } finally {
      this.setData({ loading: false });
    }
  },

  formatOverview(o) {
    if (!o) return null;
    const maxRemaining = Math.max(1, ...(o.courses || []).map((c) => c.remainingLessons));
    return {
      ...o,
      todayIncomeText: money(o.todayIncome),
      monthIncomeText: money(o.monthIncome),
      totalIncomeText: money(o.totalIncome),
      monthRefundText: money(o.monthRefund),
      courses: (o.courses || []).map((c) => ({
        ...c,
        monthIncomeText: money(c.monthIncome),
        // 剩余课时条:以最大剩余课时的课种为 100%
        barWidth: Math.max(6, Math.round((c.remainingLessons / maxRemaining) * 100)),
      })),
    };
  },

  groupLessons(lessons) {
    const today = dateStr(new Date());
    const tomorrow = dateStr(new Date(Date.now() + 86400000));
    const groups = [];
    const byDate = new Map();
    for (const l of lessons) {
      if (!byDate.has(l.date)) {
        let label;
        if (l.date === today) label = '今天';
        else if (l.date === tomorrow) label = '明天';
        else label = WEEK[new Date(`${l.date}T00:00:00`).getDay()];
        const g = { date: l.date, label, items: [] };
        byDate.set(l.date, g);
        groups.push(g);
      }
      byDate.get(l.date).items.push(l);
    }
    return groups;
  },

  formatPayments(payments) {
    return payments.map((p) => ({
      ...p,
      amountText: money(p.amount),
      // 收入绿色带 +,退费橙色带 −
      income: p.status === 'paid',
    }));
  },

  logout() {
    wx.clearStorageSync();
    wx.reLaunch({ url: '/pages/login/login' });
  },
});
