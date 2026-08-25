import dayjs from 'dayjs';
import { MiniService } from './mini.service';

/**
 * 小程序可约课表标记规则单测(内存 mock,不依赖 MySQL):
 * 课表展示全部课种,但每个课次带 canBook + reason,
 * 未购买课种 / 该课种课时不足 / 已满 / 已约 都必须 canBook=false。
 */
describe('MiniService.availableLessons 课种可约标记', () => {
  const D1 = dayjs().add(1, 'day').format('YYYY-MM-DD');

  const makeLesson = (
    id: number,
    courseId: number,
    courseName: string,
    opts: { capacity?: number; bookedCount?: number } = {},
  ) => ({
    id,
    date: D1,
    startTime: '10:00',
    endTime: '11:00',
    status: 'scheduled',
    bookedCount: opts.bookedCount ?? 0,
    classEntity: {
      id,
      name: `${courseName}班`,
      room: '101',
      capacity: opts.capacity ?? 8,
      courseId,
      course: { id: courseId, name: courseName },
      teacher: { name: '王老师' },
    },
  });

  // 课种:10 素描(有余课时)、20 钢琴(未购买)、30 书法(买过但用完)
  let lessons: any[];
  let myBookings: any[];
  let studentPackages: any[];
  let service: MiniService;

  beforeEach(() => {
    lessons = [
      makeLesson(1, 10, '素描'),
      makeLesson(2, 20, '钢琴'),
      makeLesson(3, 30, '书法'),
      makeLesson(4, 10, '素描', { capacity: 2, bookedCount: 2 }),
      makeLesson(5, 10, '素描'),
    ];
    myBookings = [{ lessonId: 5 }];
    studentPackages = [
      { id: 1, studentId: 7, courseId: 10, remainingLessons: 5, status: 'active', validUntil: null },
      { id: 2, studentId: 7, courseId: 30, remainingLessons: 0, status: 'finished', validUntil: null },
      // 历史通用包:未绑定课种,不应让任何课种变为可约
      { id: 3, studentId: 7, courseId: null, remainingLessons: 9, status: 'active', validUntil: null },
    ];

    const qb: any = {
      leftJoinAndSelect: () => qb,
      loadRelationCountAndMap: () => qb,
      where: () => qb,
      andWhere: () => qb,
      orderBy: () => qb,
      addOrderBy: () => qb,
      getMany: async () => lessons,
    };
    const linkRepo: any = { findOne: async () => ({ parentId: 1, studentId: 7 }) };
    const lessonRepo: any = { createQueryBuilder: () => qb };
    const bookingRepo: any = { find: async () => myBookings };
    const pkgRepo: any = { find: async () => studentPackages };
    service = new MiniService(
      {} as any,
      linkRepo,
      {} as any,
      lessonRepo,
      pkgRepo,
      bookingRepo,
      {} as any,
      {} as any,
      {} as any,
    );
  });

  it('已购课种且有余课时:canBook=true', async () => {
    const list = await service.availableLessons(1, 7);
    const sketch = list.find((l) => l.id === 1)!;
    expect(sketch.canBook).toBe(true);
    expect(sketch.reason).toBe('可预约');
    expect(sketch.courseRemaining).toBe(5);
  });

  it('未购买该课种:canBook=false,原因"未购买该课种"', async () => {
    const list = await service.availableLessons(1, 7);
    const piano = list.find((l) => l.id === 2)!;
    expect(piano.canBook).toBe(false);
    expect(piano.reason).toBe('未购买该课种');
  });

  it('买过该课种但课时用完:canBook=false,原因"该课种课时不足"', async () => {
    const list = await service.availableLessons(1, 7);
    const calligraphy = list.find((l) => l.id === 3)!;
    expect(calligraphy.canBook).toBe(false);
    expect(calligraphy.reason).toBe('该课种课时不足');
  });

  it('名额已满优先于课时判断:canBook=false,原因"名额已满"', async () => {
    const list = await service.availableLessons(1, 7);
    const full = list.find((l) => l.id === 4)!;
    expect(full.canBook).toBe(false);
    expect(full.reason).toBe('名额已满');
  });

  it('已预约的课次:canBook=false,原因"已预约"', async () => {
    const list = await service.availableLessons(1, 7);
    const booked = list.find((l) => l.id === 5)!;
    expect(booked.canBook).toBe(false);
    expect(booked.reason).toBe('已预约');
  });

  it('通用包(未绑定课种)不改变任何课种的可约性', async () => {
    // 即使通用包剩余 9 课时,钢琴仍是"未购买该课种"
    const list = await service.availableLessons(1, 7);
    expect(list.find((l) => l.id === 2)!.canBook).toBe(false);
  });

  it('课表仍返回全部课种(未购课种也展示,只是不可约)', async () => {
    const list = await service.availableLessons(1, 7);
    expect(list).toHaveLength(5);
    expect(new Set(list.map((l) => l.courseName))).toEqual(new Set(['素描', '钢琴', '书法']));
  });
});

/**
 * 预约入口页(按课种聚合)排序规则单测:
 * 已购且有剩余课时的课种置顶 → 已购但课时用完 → 未购买,排序在服务端完成。
 */
describe('MiniService.parentCourses 课种列表已购置顶', () => {
  // 课种:10 素描(已购剩 5)、20 钢琴(未购)、30 书法(已购剩 0)、40 声乐(未购)
  const courses = [
    { id: 10, name: '素描', description: null, status: 'active' },
    { id: 20, name: '钢琴', description: null, status: 'active' },
    { id: 30, name: '书法', description: null, status: 'active' },
    { id: 40, name: '声乐', description: null, status: 'active' },
  ];
  const classes = [
    { id: 1, courseId: 10, name: '素描·周六上午班', weekday: 6, startTime: '10:00', endTime: '11:30', room: '101', capacity: 8, status: 'active', teacher: { name: '王雪' } },
    { id: 2, courseId: 10, name: '素描·周六下午班', weekday: 6, startTime: '14:00', endTime: '15:30', room: '101', capacity: 8, status: 'active', teacher: { name: '王雪' } },
    { id: 3, courseId: 10, name: '素描·周日上午班', weekday: 7, startTime: '10:00', endTime: '11:30', room: '101', capacity: 8, status: 'active', teacher: { name: '王雪' } },
    { id: 4, courseId: 20, name: '钢琴考级小组班', weekday: 7, startTime: '15:00', endTime: '16:00', room: '302', capacity: 4, status: 'active', teacher: { name: '陈韵' } },
    { id: 5, courseId: 30, name: '书法硬笔班', weekday: 3, startTime: '18:30', endTime: '19:30', room: '201', capacity: 12, status: 'active', teacher: { name: '李墨' } },
    { id: 6, courseId: 40, name: '声乐启蒙班', weekday: 6, startTime: '14:00', endTime: '15:00', room: '301', capacity: 6, status: 'active', teacher: { name: '陈韵' } },
  ];
  const studentPackages = [
    { id: 1, studentId: 7, courseId: 10, remainingLessons: 5, status: 'active', validUntil: null },
    { id: 2, studentId: 7, courseId: 30, remainingLessons: 0, status: 'finished', validUntil: null },
  ];

  let service: MiniService;

  beforeEach(() => {
    const linkRepo: any = { findOne: async () => ({ parentId: 1, studentId: 7 }) };
    const courseRepo: any = { find: async () => courses };
    const classRepo: any = { find: async () => classes };
    const pkgRepo: any = { find: async () => studentPackages };
    service = new MiniService(
      {} as any,
      linkRepo,
      {} as any,
      {} as any,
      pkgRepo,
      {} as any,
      courseRepo,
      classRepo,
      {} as any,
    );
  });

  it('已购且有剩余课时的课种排最前,未购买的排最后', async () => {
    const list = await service.parentCourses(1, 7);
    expect(list.map((c) => c.courseName)).toEqual(['素描', '书法', '钢琴', '声乐']);
    expect(list[0].bookable).toBe(true);
    expect(list[0].remaining).toBe(5);
  });

  it('已购但课时用完:排在可约课种之后、未购课种之前,不可约且原因明确', async () => {
    const list = await service.parentCourses(1, 7);
    const calligraphy = list.find((c) => c.courseName === '书法')!;
    expect(calligraphy.purchased).toBe(true);
    expect(calligraphy.bookable).toBe(false);
    expect(calligraphy.reason).toContain('课时不足');
    expect(list.indexOf(calligraphy)).toBeLessThan(list.findIndex((c) => c.courseName === '钢琴'));
  });

  it('未购课种不可约,原因提示联系前台报名', async () => {
    const list = await service.parentCourses(1, 7);
    const piano = list.find((c) => c.courseName === '钢琴')!;
    expect(piano.purchased).toBe(false);
    expect(piano.bookable).toBe(false);
    expect(piano.reason).toContain('未购买');
  });

  it('时段摘要:按周几+开始时间排序,含上午/下午划分', async () => {
    const list = await service.parentCourses(1, 7);
    const sketch = list.find((c) => c.courseName === '素描')!;
    expect(sketch.slots.map((s) => `${s.weekdayText}${s.period}`)).toEqual([
      '周六上午',
      '周六下午',
      '周日上午',
    ]);
    expect(sketch.slots[0]).toEqual(
      expect.objectContaining({ classId: 1, startTime: '10:00', endTime: '11:30', teacherName: '王雪' }),
    );
  });
});

/** 选时段页数据:课次按班级(时段)分组,canBook/reason 标记正确 */
describe('MiniService.courseSlots 课种时段与课次', () => {
  const D_SAT = dayjs().add(3, 'day').format('YYYY-MM-DD');
  const D_SAT2 = dayjs().add(10, 'day').format('YYYY-MM-DD');

  const makeLesson = (id: number, date: string, cls: any, bookedCount = 0) => ({
    id,
    date,
    startTime: cls.startTime,
    endTime: cls.endTime,
    status: 'scheduled',
    bookedCount,
    classEntity: cls,
  });

  let service: MiniService;

  beforeEach(() => {
    const satAm = { id: 1, courseId: 10, name: '素描·周六上午班', weekday: 6, startTime: '10:00', endTime: '11:30', room: '101', capacity: 2, status: 'active', teacher: { name: '王雪' } };
    const satPm = { id: 2, courseId: 10, name: '素描·周六下午班', weekday: 6, startTime: '14:00', endTime: '15:30', room: '101', capacity: 8, status: 'active', teacher: { name: '王雪' } };
    const lessons = [
      makeLesson(11, D_SAT, satAm),
      makeLesson(12, D_SAT2, satAm, 2), // 满员
      makeLesson(21, D_SAT, satPm),
    ];
    const qb: any = {
      leftJoinAndSelect: () => qb,
      loadRelationCountAndMap: () => qb,
      where: () => qb,
      andWhere: () => qb,
      orderBy: () => qb,
      addOrderBy: () => qb,
      getMany: async () => lessons,
    };
    const linkRepo: any = { findOne: async () => ({ parentId: 1, studentId: 7 }) };
    const courseRepo: any = { findOne: async () => ({ id: 10, name: '素描', description: null }) };
    const lessonRepo: any = { createQueryBuilder: () => qb };
    const pkgRepo: any = {
      find: async () => [
        { id: 1, studentId: 7, courseId: 10, remainingLessons: 5, status: 'active', validUntil: null },
      ],
    };
    const bookingRepo: any = {
      find: async () => [
        { lessonId: 21, status: 'booked', lesson: { date: D_SAT, startTime: '14:00', endTime: '15:30' } },
      ],
    };
    service = new MiniService(
      {} as any,
      linkRepo,
      {} as any,
      lessonRepo,
      pkgRepo,
      bookingRepo,
      courseRepo,
      {} as any,
      {} as any,
    );
  });

  it('课次按时段(班级)分组,时段带周几/上下午/老师', async () => {
    const result = await service.courseSlots(1, 7, 10);
    expect(result.purchased).toBe(true);
    expect(result.remaining).toBe(5);
    expect(result.slots).toHaveLength(2);
    expect(result.slots[0]).toEqual(
      expect.objectContaining({ classId: 1, weekdayText: '周六', period: '上午' }),
    );
    expect(result.slots[1]).toEqual(
      expect.objectContaining({ classId: 2, weekdayText: '周六', period: '下午' }),
    );
  });

  it('满员课次 canBook=false,已预约课次标记"已预约",正常课次可约', async () => {
    const result = await service.courseSlots(1, 7, 10);
    const amLessons = result.slots[0].lessons as any[];
    expect(amLessons.find((l) => l.id === 11).canBook).toBe(true);
    expect(amLessons.find((l) => l.id === 12).reason).toBe('名额已满');
    const pmLessons = result.slots[1].lessons as any[];
    expect(pmLessons.find((l) => l.id === 21).reason).toBe('已预约');
  });
});
