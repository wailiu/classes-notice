import dayjs from 'dayjs';
import { MiniService } from './mini.service';

/**
 * 校长端总览单测(内存 mock,不依赖 MySQL):
 * 工作台统计数字、按课种的课时/收入归集排序、课次安排与缴费流水的字段映射。
 */
describe('MiniService 校长端总览', () => {
  const D1 = dayjs().add(1, 'day').format('YYYY-MM-DD');

  let service: MiniService;
  let paymentRawOneQueue: any[];

  beforeEach(() => {
    // getRawOne 按调用顺序返回:本月退费 → 今日收入 → 本月收入 → 累计收入
    paymentRawOneQueue = [
      { sum: '120.00' },
      { sum: '300.00' },
      { sum: '12800.50' },
      { sum: '98765.43' },
    ];

    const hourRows = [
      { courseId: 10, courseName: '素描', packageCount: '3', remainingLessons: '21' },
      { courseId: 20, courseName: '钢琴', packageCount: '1', remainingLessons: '8' },
    ];
    const incomeRows = [{ courseId: 20, income: '2400.00' }];
    const lowHours = [
      {
        id: 7,
        student: { name: '张小明' },
        course: { name: '素描' },
        remainingLessons: 1,
        totalLessons: 48,
      },
    ];

    const lessonQb: any = {
      leftJoinAndSelect: () => lessonQb,
      loadRelationCountAndMap: () => lessonQb,
      where: () => lessonQb,
      andWhere: () => lessonQb,
      orderBy: () => lessonQb,
      addOrderBy: () => lessonQb,
      getCount: async () => 23,
      getMany: async () => [
        {
          id: 101,
          date: D1,
          startTime: '10:00',
          endTime: '11:30',
          status: 'scheduled',
          bookedCount: 5,
          classEntity: {
            name: '素描周六上午班',
            room: '101',
            capacity: 8,
            course: { name: '素描' },
            teacher: { name: '王雪' },
          },
        },
      ],
    };
    const pkgQb: any = {
      leftJoin: () => pkgQb,
      leftJoinAndSelect: () => pkgQb,
      select: () => pkgQb,
      addSelect: () => pkgQb,
      where: () => pkgQb,
      andWhere: () => pkgQb,
      groupBy: () => pkgQb,
      addGroupBy: () => pkgQb,
      orderBy: () => pkgQb,
      addOrderBy: () => pkgQb,
      getRawMany: async () => hourRows,
      getMany: async () => lowHours,
    };
    const payQb: any = {
      leftJoin: () => payQb,
      select: () => payQb,
      addSelect: () => payQb,
      where: () => payQb,
      andWhere: () => payQb,
      groupBy: () => payQb,
      getRawOne: async () => paymentRawOneQueue.shift(),
      getRawMany: async () => incomeRows,
    };

    const studentRepo: any = { count: async () => 12 };
    const teacherRepo: any = { count: async () => 5 };
    const lessonRepo: any = { count: async () => 4, createQueryBuilder: () => lessonQb };
    const pkgRepo: any = { count: async () => 9, createQueryBuilder: () => pkgQb };
    const paymentRepo: any = {
      createQueryBuilder: () => payQb,
      find: async () => [
        {
          id: 55,
          serialNo: 'PAY20260828001',
          amount: '2400.00',
          method: 'wechat',
          status: 'paid',
          paidAt: new Date('2026-08-28T10:30:00'),
          remark: null,
          student: { name: '刘一诺' },
          coursePackage: { name: '钢琴48课时包', course: { name: '钢琴' } },
        },
        {
          id: 54,
          serialNo: 'PAY20260827007',
          amount: '600.00',
          method: 'alipay',
          status: 'refunded',
          paidAt: new Date('2026-08-27T18:00:00'),
          remark: '退费',
          student: { name: '张小圆' },
          coursePackage: { name: '创意美术24课时包', course: { name: '创意美术' } },
        },
      ],
    };

    service = new MiniService(
      {} as any,
      {} as any,
      teacherRepo,
      lessonRepo,
      pkgRepo,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      studentRepo,
      paymentRepo,
    );
  });

  it('总览统计数字正确(在读学员/今日与本周课次/生效包/各项收入)', async () => {
    const o = await service.principalOverview();
    expect(o.activeStudents).toBe(12);
    expect(o.activeTeachers).toBe(5);
    expect(o.todayLessons).toBe(4);
    expect(o.weekLessons).toBe(23);
    expect(o.activePackages).toBe(9);
    expect(o.todayIncome).toBe(300);
    expect(o.monthIncome).toBe(12800.5);
    expect(o.totalIncome).toBe(98765.43);
    expect(o.monthRefund).toBe(120);
  });

  it('按课种归集课时与本月收入,收入多的课种置顶,无收入的课种为 0', async () => {
    const o = await service.principalOverview();
    expect(o.courses).toHaveLength(2);
    expect(o.courses[0]).toEqual(
      expect.objectContaining({ courseName: '钢琴', packageCount: 1, remainingLessons: 8, monthIncome: 2400 }),
    );
    expect(o.courses[1]).toEqual(
      expect.objectContaining({ courseName: '素描', remainingLessons: 21, monthIncome: 0 }),
    );
  });

  it('剩余课时预警输出学员/课种/剩余课时', async () => {
    const o = await service.principalOverview();
    expect(o.lowHours).toEqual([
      { id: 7, studentName: '张小明', courseName: '素描', remainingLessons: 1, totalLessons: 48 },
    ]);
  });

  it('未来课次带周几/预约人数/容量', async () => {
    const list = await service.principalLessons(7);
    expect(list).toHaveLength(1);
    const l = list[0];
    expect(l.date).toBe(D1);
    expect(l.weekdayText).toBe(['周一', '周二', '周三', '周四', '周五', '周六', '周日'][
      (dayjs(D1).day() === 0 ? 7 : dayjs(D1).day()) - 1
    ]);
    expect(l).toEqual(
      expect.objectContaining({
        courseName: '素描',
        teacherName: '王雪',
        room: '101',
        capacity: 8,
        bookedCount: 5,
      }),
    );
  });

  it('缴费流水映射学员/课种/金额/方式中文/状态', async () => {
    const list = await service.principalPayments(20);
    expect(list).toHaveLength(2);
    expect(list[0]).toEqual(
      expect.objectContaining({
        studentName: '刘一诺',
        courseName: '钢琴',
        packageName: '钢琴48课时包',
        amount: 2400,
        methodText: '微信',
        status: 'paid',
        paidAt: '2026-08-28 10:30',
      }),
    );
    expect(list[1]).toEqual(
      expect.objectContaining({ studentName: '张小圆', methodText: '支付宝', status: 'refunded' }),
    );
  });
});
