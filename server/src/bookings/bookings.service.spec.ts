import { BadRequestException } from '@nestjs/common';
import dayjs from 'dayjs';
import { BookingsService } from './bookings.service';
import { Booking, CoursePackage, Lesson, Student } from '../entities';

/**
 * 预约核心规则单元测试(内存 mock,不依赖 MySQL):
 * - 课时扣减 / 取消退回
 * - 容量已满拦截
 * - 时间冲突拦截
 * - 课时严格按课种消耗:未购课种不可约、跨课种不可抵扣、通用包不可用
 * - 开课前 N 小时取消限制
 */
describe('BookingsService 预约核心规则', () => {
  // 使用不带时区后缀的时间字符串,按运行环境本地时区解析,保证测试与时区无关
  const NOW = new Date('2026-08-25T10:00:00');

  let lessons: any[];
  let students: any[];
  let packages: any[];
  let bookings: any[];
  let service: BookingsService;

  const makeEm = () => ({
    findOne: jest.fn(async (entity: any, opts: any) => {
      const id = opts?.where?.id;
      if (entity === Lesson) return lessons.find((l) => l.id === id) ?? null;
      if (entity === Student) return students.find((s) => s.id === id) ?? null;
      if (entity === CoursePackage) return packages.find((p) => p.id === id) ?? null;
      if (entity === Booking) {
        const w = opts?.where ?? {};
        if (w.id !== undefined) return bookings.find((b) => b.id === w.id) ?? null;
        return (
          bookings.find(
            (b) =>
              b.studentId === w.studentId &&
              b.lessonId === w.lessonId &&
              ['booked', 'checked_in'].includes(b.status),
          ) ?? null
        );
      }
      return null;
    }),
    count: jest.fn(async (_entity: any, opts: any) => {
      const w = opts?.where ?? {};
      return bookings.filter(
        (b) => b.lessonId === w.lessonId && ['booked', 'checked_in'].includes(b.status),
      ).length;
    }),
    find: jest.fn(async (entity: any, opts: any) => {
      if (entity === CoursePackage) {
        const w = opts?.where ?? {};
        return packages.filter(
          (p) =>
            p.studentId === w.studentId &&
            (w.courseId === undefined || p.courseId === w.courseId),
        );
      }
      return [];
    }),
    createQueryBuilder: jest.fn(() => {
      const qb: any = {
        _sid: 0,
        _date: '',
        innerJoinAndSelect: () => qb,
        where: (_q: string, p: any) => ((qb._sid = p.sid), qb),
        andWhere: (_q: string, p?: any) => {
          if (p?.date) qb._date = p.date;
          return qb;
        },
        getMany: async () =>
          bookings
            .filter((b) => b.studentId === qb._sid && ['booked', 'checked_in'].includes(b.status))
            .map((b) => ({ ...b, lesson: lessons.find((l) => l.id === b.lessonId) }))
            .filter((b) => dayjs(b.lesson.date).format('YYYY-MM-DD') === qb._date),
      };
      return qb;
    }),
    save: jest.fn(async (obj: any) => {
      if (obj.remainingLessons !== undefined) {
        const idx = packages.findIndex((p) => p.id === obj.id);
        if (idx >= 0) packages[idx] = obj;
        return obj;
      }
      if (!obj.id) {
        obj.id = bookings.length + 1;
        bookings.push(obj);
      } else {
        const idx = bookings.findIndex((b) => b.id === obj.id);
        if (idx >= 0) bookings[idx] = obj;
      }
      return obj;
    }),
    create: jest.fn((_entity: any, data: any) => ({ ...data })),
  });

  beforeEach(() => {
    // 课种 10 = 素描,课种 20 = 钢琴,课种 99 = 其他课种
    const classA = { id: 1, capacity: 2, courseId: 10 };
    lessons = [
      {
        id: 100,
        classId: 1,
        date: '2026-08-26',
        startTime: '10:00',
        endTime: '11:30',
        status: 'scheduled',
        classEntity: classA,
      },
      {
        id: 101,
        classId: 1,
        date: '2026-08-26',
        startTime: '11:00',
        endTime: '12:00',
        status: 'scheduled',
        classEntity: { id: 2, capacity: 5, courseId: 10 },
      },
      // 钢琴课次(课种 20)
      {
        id: 102,
        classId: 3,
        date: '2026-08-27',
        startTime: '15:00',
        endTime: '16:00',
        status: 'scheduled',
        classEntity: { id: 3, capacity: 5, courseId: 20 },
      },
    ];
    students = [
      { id: 1, name: '张小明', status: 'active' },
      { id: 2, name: '李小红', status: 'active' },
      { id: 3, name: '王小刚', status: 'active' },
      { id: 4, name: '赵通用', status: 'active' },
      { id: 5, name: '钱用完', status: 'active' },
      { id: 6, name: '孙过期', status: 'active' },
    ];
    packages = [
      { id: 500, studentId: 1, courseId: 10, remainingLessons: 5, status: 'active', validUntil: null },
      { id: 501, studentId: 2, courseId: 10, remainingLessons: 1, status: 'active', validUntil: null },
      { id: 502, studentId: 3, courseId: 99, remainingLessons: 8, status: 'active', validUntil: null },
      // 历史遗留"通用包"(未绑定课种):按新规则不可用于任何预约
      { id: 503, studentId: 4, courseId: null, remainingLessons: 10, status: 'active', validUntil: null },
      // 课种 10 的包但剩余 0(状态 finished)
      { id: 504, studentId: 5, courseId: 10, remainingLessons: 0, status: 'finished', validUntil: null },
      // 课种 10 的包但已过期
      { id: 505, studentId: 6, courseId: 10, remainingLessons: 6, status: 'active', validUntil: '2026-01-01' },
    ];
    bookings = [];

    const em = makeEm();
    const dataSource = { transaction: (fn: any) => fn(em) } as any;
    const repoStub = {} as any;
    service = new BookingsService(repoStub, repoStub, repoStub, repoStub, dataSource);
  });

  it('预约成功时扣减 1 课时', async () => {
    const booking = await service.book({ studentId: 1, lessonId: 100, now: NOW });
    expect(booking.status).toBe('booked');
    expect(packages.find((p) => p.id === 500)!.remainingLessons).toBe(4);
  });

  it('课时用完时包状态变为 finished', async () => {
    await service.book({ studentId: 2, lessonId: 100, now: NOW });
    const pkg = packages.find((p) => p.id === 501)!;
    expect(pkg.remainingLessons).toBe(0);
    expect(pkg.status).toBe('finished');
  });

  it('容量已满时拒绝预约', async () => {
    await service.book({ studentId: 1, lessonId: 100, now: NOW });
    await service.book({ studentId: 2, lessonId: 100, now: NOW });
    await expect(service.book({ studentId: 3, lessonId: 100, packageId: 502, now: NOW })).rejects.toThrow(
      '名额已满',
    );
  });

  it('重复预约同一课次被拒绝', async () => {
    await service.book({ studentId: 1, lessonId: 100, now: NOW });
    await expect(service.book({ studentId: 1, lessonId: 100, now: NOW })).rejects.toThrow('重复预约');
  });

  it('同一时间段时间冲突被拒绝', async () => {
    await service.book({ studentId: 1, lessonId: 100, now: NOW });
    // lesson 101 与 100 时间重叠(11:00-12:00 vs 10:00-11:30)
    await expect(service.book({ studentId: 1, lessonId: 101, now: NOW })).rejects.toThrow('时间冲突');
  });

  it('买了课种 A(素描)不能预约课种 B(钢琴):未购买该课种被拒绝', async () => {
    // 学员 1 只有课种 10(素描)的包,预约课种 20(钢琴)课次
    await expect(service.book({ studentId: 1, lessonId: 102, now: NOW })).rejects.toThrow(
      '未购买该课种课时,无法预约',
    );
    // 素描包课时不受影响
    expect(packages.find((p) => p.id === 500)!.remainingLessons).toBe(5);
  });

  it('课种匹配但学员只买过其他课种,同样被拒绝', async () => {
    // 学员 3 只有课种 99 的包,预约课种 10 的课次
    await expect(service.book({ studentId: 3, lessonId: 100, now: NOW })).rejects.toThrow(
      '未购买该课种课时,无法预约',
    );
  });

  it('通用包(未绑定课种)不可用于预约:自动挑包挑不到', async () => {
    // 学员 4 只有 courseId=null 的历史通用包,剩余 10 课时也不能约
    await expect(service.book({ studentId: 4, lessonId: 100, now: NOW })).rejects.toThrow(
      '未购买该课种课时,无法预约',
    );
    expect(packages.find((p) => p.id === 503)!.remainingLessons).toBe(10);
  });

  it('通用包(未绑定课种)不可用于预约:显式指定 packageId 也被拒绝', async () => {
    await expect(
      service.book({ studentId: 4, lessonId: 100, packageId: 503, now: NOW }),
    ).rejects.toThrow('未绑定课种');
  });

  it('显式指定跨课种的课时包被拒绝', async () => {
    // 学员 3 拿课种 99 的包(502)去约课种 10 的课次
    await expect(
      service.book({ studentId: 3, lessonId: 100, packageId: 502, now: NOW }),
    ).rejects.toThrow('不可跨课种抵扣');
  });

  it('该课种的包剩余课时为 0 时,提示课时不足', async () => {
    await expect(service.book({ studentId: 5, lessonId: 100, now: NOW })).rejects.toThrow(
      '该课种剩余课时不足',
    );
  });

  it('该课种的包已过期时,提示已过期', async () => {
    await expect(service.book({ studentId: 6, lessonId: 100, now: NOW })).rejects.toThrow(
      '该课种课时包已过期',
    );
  });

  it('取消预约后课时退回', async () => {
    const booking = await service.book({ studentId: 1, lessonId: 100, now: NOW });
    booking.lesson = lessons[0];
    expect(packages.find((p) => p.id === 500)!.remainingLessons).toBe(4);
    await service.cancel(booking.id, { now: NOW });
    expect(packages.find((p) => p.id === 500)!.remainingLessons).toBe(5);
    expect(bookings.find((b) => b.id === booking.id)!.status).toBe('cancelled');
  });

  it('开课前 2 小时内家长取消被拒绝,后台强制取消可以', async () => {
    const nearNow = new Date('2026-08-26T09:00:00'); // 距 10:00 开课仅 1 小时
    const booking = await service.book({ studentId: 1, lessonId: 100, now: NOW });
    booking.lesson = lessons[0];
    await expect(service.cancel(booking.id, { now: nearNow })).rejects.toThrow('不可取消');
    const cancelled = await service.cancel(booking.id, { now: nearNow, force: true });
    expect(cancelled.status).toBe('cancelled');
    expect(packages.find((p) => p.id === 500)!.remainingLessons).toBe(5);
  });

  it('家长只能取消自己孩子的预约', async () => {
    const booking = await service.book({ studentId: 1, lessonId: 100, now: NOW });
    booking.lesson = lessons[0];
    await expect(
      service.cancel(booking.id, { now: NOW, parentStudentIds: [2, 3] }),
    ).rejects.toThrow('无权操作');
  });

  // ---------- 临时到课(老师手动扣课时) ----------

  // 课次进行中的时间(100 课次 2026-08-26 10:00-11:30)
  const DURING = new Date('2026-08-26T10:30:00');

  it('课次已开始:普通预约被拒,临时到课(allowStarted)可登记', async () => {
    await expect(service.book({ studentId: 1, lessonId: 100, now: DURING })).rejects.toThrow(
      '该课次已开始,无法预约',
    );
    const booking = await service.book({
      studentId: 1,
      lessonId: 100,
      source: 'teacher',
      allowStarted: true,
      checkinNow: true,
      now: DURING,
    });
    expect(booking.status).toBe('checked_in');
    expect(booking.source).toBe('teacher');
    expect(booking.checkinAt).toEqual(DURING);
    expect(packages.find((p) => p.id === 500)!.remainingLessons).toBe(4);
  });

  it('临时到课同样按课种扣课时:未购买该课种被拒绝', async () => {
    // 学员 3 只有课种 99 的包,到素描课次现场登记
    await expect(
      service.book({ studentId: 3, lessonId: 100, source: 'teacher', allowStarted: true, checkinNow: true, now: DURING }),
    ).rejects.toThrow('未购买该课种课时,无法预约');
    expect(packages.find((p) => p.id === 502)!.remainingLessons).toBe(8);
  });

  it('临时到课不能重复登记已在名单中的学员', async () => {
    await service.book({ studentId: 1, lessonId: 100, source: 'teacher', allowStarted: true, checkinNow: true, now: DURING });
    await expect(
      service.book({ studentId: 1, lessonId: 100, source: 'teacher', allowStarted: true, checkinNow: true, now: DURING }),
    ).rejects.toThrow('重复预约');
    expect(packages.find((p) => p.id === 500)!.remainingLessons).toBe(4);
  });

  it('临时到课受容量限制:名额已满被拒绝', async () => {
    // 100 课次容量 2
    await service.book({ studentId: 1, lessonId: 100, source: 'teacher', allowStarted: true, checkinNow: true, now: DURING });
    await service.book({ studentId: 2, lessonId: 100, source: 'teacher', allowStarted: true, checkinNow: true, now: DURING });
    await expect(
      service.book({ studentId: 5, lessonId: 100, source: 'teacher', allowStarted: true, checkinNow: true, now: DURING }),
    ).rejects.toThrow('名额已满');
  });
});
