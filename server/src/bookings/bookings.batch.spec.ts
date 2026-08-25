import { BadRequestException } from '@nestjs/common';
import dayjs from 'dayjs';
import { BookingsService } from './bookings.service';
import { Booking, CoursePackage, Lesson, Student } from '../entities';

/**
 * 批量/长期预约单元测试(内存 mock,不依赖 MySQL):
 * - 长期预约:classId + from/to 一次约多周,课时按节数扣除
 * - 课时不足:拒绝整批,不扣任何课时(绝不超扣)
 * - 部分课次已满/已约:部分成功 + 失败原因清单
 * - 未购课种:整批拒绝
 * - lessonIds 多选、混课种拒绝、批内时间冲突
 */
describe('BookingsService.bookBatch 批量/长期预约', () => {
  const NOW = new Date('2026-08-25T10:00:00');

  // 素描·周六上午班(classId=1,课种 10),未来 4 个周六
  const SAT_DATES = ['2026-08-29', '2026-09-05', '2026-09-12', '2026-09-19'];

  let lessons: any[];
  let students: any[];
  let packages: any[];
  let bookings: any[];
  let service: BookingsService;

  const isOp = (v: any, type: string) => v && typeof v === 'object' && v.type === type;

  const makeEm = () => ({
    findOne: jest.fn(async (entity: any, opts: any) => {
      const id = opts?.where?.id;
      if (entity === Student) return students.find((s) => s.id === id) ?? null;
      if (entity === Lesson) return lessons.find((l) => l.id === id) ?? null;
      if (entity === CoursePackage) return packages.find((p) => p.id === id) ?? null;
      return null;
    }),
    find: jest.fn(async (entity: any, opts: any) => {
      const w = opts?.where ?? {};
      if (entity === Lesson) {
        if (isOp(w.id, 'in')) return lessons.filter((l) => w.id.value.includes(l.id));
        if (w.classId !== undefined && isOp(w.date, 'between')) {
          const [from, to] = w.date.value;
          return lessons.filter((l) => l.classId === w.classId && l.date >= from && l.date <= to);
        }
        return [];
      }
      if (entity === CoursePackage) {
        return packages.filter(
          (p) =>
            p.studentId === w.studentId && (w.courseId === undefined || p.courseId === w.courseId),
        );
      }
      if (entity === Booking) {
        return bookings
          .filter(
            (b) =>
              b.studentId === w.studentId && ['booked', 'checked_in'].includes(b.status),
          )
          .map((b) => ({ ...b, lesson: lessons.find((l) => l.id === b.lessonId) }));
      }
      return [];
    }),
    count: jest.fn(async (_entity: any, opts: any) => {
      const w = opts?.where ?? {};
      return bookings.filter(
        (b) => b.lessonId === w.lessonId && ['booked', 'checked_in'].includes(b.status),
      ).length;
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
        obj.id = 1000 + bookings.length + 1;
        bookings.push(obj);
      }
      return obj;
    }),
    create: jest.fn((_entity: any, data: any) => ({ ...data })),
  });

  beforeEach(() => {
    const satMorning = { id: 1, capacity: 8, courseId: 10 };
    lessons = SAT_DATES.map((date, i) => ({
      id: 200 + i,
      classId: 1,
      date,
      startTime: '10:00',
      endTime: '11:30',
      status: 'scheduled',
      classEntity: satMorning,
    }));
    // 一节钢琴课(课种 20),用于混课种校验
    lessons.push({
      id: 300,
      classId: 3,
      date: '2026-08-29',
      startTime: '15:00',
      endTime: '16:00',
      status: 'scheduled',
      classEntity: { id: 3, capacity: 4, courseId: 20 },
    });
    // 与周六上午重叠的另一节素描课(同日 11:00-12:00),用于批内冲突校验
    lessons.push({
      id: 301,
      classId: 4,
      date: '2026-08-29',
      startTime: '11:00',
      endTime: '12:00',
      status: 'scheduled',
      classEntity: { id: 4, capacity: 8, courseId: 10 },
    });
    students = [
      { id: 1, name: '张小明', status: 'active' },
      { id: 2, name: '课时紧张', status: 'active' },
      { id: 3, name: '未购课种', status: 'active' },
    ];
    packages = [
      { id: 500, studentId: 1, courseId: 10, remainingLessons: 10, status: 'active', validUntil: null },
      { id: 501, studentId: 2, courseId: 10, remainingLessons: 2, status: 'active', validUntil: null },
      { id: 502, studentId: 3, courseId: 99, remainingLessons: 8, status: 'active', validUntil: null },
    ];
    bookings = [];

    const em = makeEm();
    const dataSource = { transaction: (fn: any) => fn(em) } as any;
    const repoStub = {} as any;
    service = new BookingsService(repoStub, repoStub, repoStub, repoStub, dataSource);
  });

  it('长期预约:一次约未来一个月每周六上午,全部成功并按节数扣课时', async () => {
    const result = await service.bookBatch({
      studentId: 1,
      classId: 1,
      from: '2026-08-25',
      to: '2026-09-25',
      now: NOW,
    });
    expect(result.booked).toHaveLength(4);
    expect(result.failed).toHaveLength(0);
    expect(result.deducted).toBe(4);
    expect(result.remainingAfter).toBe(6);
    expect(packages.find((p) => p.id === 500)!.remainingLessons).toBe(6);
    expect(result.booked.map((b) => b.date)).toEqual(SAT_DATES);
    expect(bookings.every((b) => b.status === 'booked' && b.source === 'parent')).toBe(true);
  });

  it('长期预约课时不足:拒绝整批且不扣任何课时(不超扣)', async () => {
    // 学员 2 只剩 2 课时,却要约 4 节
    await expect(
      service.bookBatch({ studentId: 2, classId: 1, from: '2026-08-25', to: '2026-09-25', now: NOW }),
    ).rejects.toThrow('剩余课时不足');
    expect(packages.find((p) => p.id === 501)!.remainingLessons).toBe(2);
    expect(bookings).toHaveLength(0);
  });

  it('部分课次已满/已约:部分成功,失败原因清单明确', async () => {
    // 第 1 个周六:学员 1 已预约;第 2 个周六:名额占满
    bookings.push({ id: 1, studentId: 1, lessonId: 200, status: 'booked' });
    for (let i = 0; i < 8; i++) {
      bookings.push({ id: 10 + i, studentId: 90 + i, lessonId: 201, status: 'booked' });
    }
    const result = await service.bookBatch({
      studentId: 1,
      classId: 1,
      from: '2026-08-25',
      to: '2026-09-25',
      now: NOW,
    });
    expect(result.booked.map((b) => b.date)).toEqual(['2026-09-12', '2026-09-19']);
    expect(result.deducted).toBe(2);
    expect(result.failed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ lessonId: 200, reason: '已预约本课次' }),
        expect.objectContaining({ lessonId: 201, reason: '名额已满' }),
      ]),
    );
    expect(packages.find((p) => p.id === 500)!.remainingLessons).toBe(8);
  });

  it('未购课种:批量预约整批被拒绝', async () => {
    await expect(
      service.bookBatch({ studentId: 3, classId: 1, from: '2026-08-25', to: '2026-09-25', now: NOW }),
    ).rejects.toThrow('未购买该课种课时,无法预约');
    expect(bookings).toHaveLength(0);
  });

  it('lessonIds 多选:勾选 2 节成功,不存在的课次记为失败', async () => {
    const result = await service.bookBatch({
      studentId: 1,
      lessonIds: [200, 202, 99999],
      now: NOW,
    });
    expect(result.booked.map((b) => b.lessonId)).toEqual([200, 202]);
    expect(result.failed).toEqual([
      expect.objectContaining({ lessonId: 99999, reason: '课次不存在' }),
    ]);
    expect(result.deducted).toBe(2);
    expect(packages.find((p) => p.id === 500)!.remainingLessons).toBe(8);
  });

  it('混课种 lessonIds 被拒绝(课时严格按课种消耗)', async () => {
    await expect(
      service.bookBatch({ studentId: 1, lessonIds: [200, 300], now: NOW }),
    ).rejects.toThrow('仅支持同一课种');
    expect(bookings).toHaveLength(0);
  });

  it('批内时间冲突:同日重叠课次只成功一节,另一节标记时间冲突', async () => {
    const result = await service.bookBatch({
      studentId: 1,
      lessonIds: [200, 301],
      now: NOW,
    });
    expect(result.booked.map((b) => b.lessonId)).toEqual([200]);
    expect(result.failed).toEqual([
      expect.objectContaining({ lessonId: 301, reason: '同一时间段已有其他预约,时间冲突' }),
    ]);
    expect(result.deducted).toBe(1);
  });

  it('全部课次都不可约时:返回空成功列表且不扣课时,不抛错', async () => {
    bookings.push({ id: 1, studentId: 1, lessonId: 200, status: 'booked' });
    const result = await service.bookBatch({ studentId: 1, lessonIds: [200], now: NOW });
    expect(result.booked).toHaveLength(0);
    expect(result.deducted).toBe(0);
    expect(result.failed[0]).toEqual(expect.objectContaining({ lessonId: 200, reason: '已预约本课次' }));
    expect(packages.find((p) => p.id === 500)!.remainingLessons).toBe(10);
  });

  it('既有单次预约仍正常工作(回归)', async () => {
    const booking = await service.book({ studentId: 1, lessonId: 200, now: NOW });
    expect(booking.status).toBe('booked');
    expect(packages.find((p) => p.id === 500)!.remainingLessons).toBe(9);
  });
});
