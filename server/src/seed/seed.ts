/**
 * 种子数据脚本:npm run seed
 * 幂等策略:检测到已有管理员账号则跳过(可用 SEED_FORCE=true 强制清空重灌)。
 */
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import dayjs from 'dayjs';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import {
  ALL_ENTITIES,
  AdminUser,
  Student,
  Parent,
  ParentStudent,
  Teacher,
  Course,
  ClassEntity,
  Lesson,
  CoursePackage,
  Payment,
  Booking,
} from '../entities';

for (const envPath of ['.env', '../.env']) {
  const full = path.resolve(process.cwd(), envPath);
  if (fs.existsSync(full)) dotenv.config({ path: full });
}

const dataSource = new DataSource({
  type: 'mysql',
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  username: process.env.DB_USER || 'art',
  password: process.env.DB_PASSWORD || 'art123456',
  database: process.env.DB_NAME || 'art_school',
  entities: ALL_ENTITIES,
  charset: 'utf8mb4',
  synchronize: true,
  timezone: '+08:00',
  extra: { dateStrings: ['DATE'] },
});

async function main() {
  await dataSource.initialize();
  console.log('数据库连接成功,开始灌入种子数据…');

  const adminRepo = dataSource.getRepository(AdminUser);
  const existing = await adminRepo.count();
  if (existing > 0 && process.env.SEED_FORCE !== 'true') {
    console.log('检测到已有数据,跳过 seed(如需重灌请设置 SEED_FORCE=true)');
    await dataSource.destroy();
    return;
  }
  if (process.env.SEED_FORCE === 'true') {
    console.log('SEED_FORCE=true,清空现有数据…');
    await dataSource.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const table of [
      'bookings',
      'payments',
      'course_packages',
      'lessons',
      'classes',
      'parent_students',
      'parents',
      'teachers',
      'students',
      'courses',
      'admin_users',
    ]) {
      await dataSource.query(`TRUNCATE TABLE \`${table}\``);
    }
    await dataSource.query('SET FOREIGN_KEY_CHECKS = 1');
  }

  // ---------- 管理员 ----------
  await adminRepo.save([
    adminRepo.create({
      username: 'admin',
      passwordHash: await bcrypt.hash('admin123', 10),
      name: '王校长',
      role: 'super',
      // 绑定微信 openid 后可在小程序以「校长」身份进入工作台(开发模式 mock 码: mock-principal-1)
      wxOpenid: 'mock-principal-1',
    }),
    adminRepo.create({
      username: 'reception',
      passwordHash: await bcrypt.hash('reception123', 10),
      name: '前台教务',
      role: 'staff',
    }),
  ]);
  console.log('管理员: admin/admin123(校长), reception/reception123(前台教务)');

  // ---------- 8 门艺术课 ----------
  const courseRepo = dataSource.getRepository(Course);
  const courseDefs: Array<[string, string, number]> = [
    ['素描', '基础排线、静物写生、几何体结构训练', 120],
    ['创意美术', '3-8 岁儿童创意绘画与手工', 100],
    ['书法', '硬笔/软笔书法,楷书入门到进阶', 110],
    ['声乐', '少儿声乐启蒙、气息与音准训练', 150],
    ['钢琴', '一对一/小组钢琴课,考级辅导', 200],
    ['古筝', '古筝入门与考级,指法与乐理', 180],
    ['架子鼓', '节奏训练、基本功与曲目演奏', 160],
    ['拉丁舞', '恰恰、伦巴基础,少儿拉丁考级', 130],
  ];
  const courses = await courseRepo.save(
    courseDefs.map(([name, description, unitPrice]) =>
      courseRepo.create({ name, description, unitPrice: String(unitPrice), status: 'active' }),
    ),
  );
  const courseByName = new Map(courses.map((c) => [c.name, c]));
  console.log(`科目 ${courses.length} 门`);

  // ---------- 老师 ----------
  const teacherRepo = dataSource.getRepository(Teacher);
  const teachers = await teacherRepo.save([
    teacherRepo.create({
      name: '王雪',
      phone: '13800000001',
      wxOpenid: 'mock-teacher-1',
      subjects: '素描,创意美术',
      status: 'active',
    }),
    teacherRepo.create({
      name: '李墨',
      phone: '13800000002',
      wxOpenid: 'mock-teacher-2',
      subjects: '书法',
      status: 'active',
    }),
    teacherRepo.create({
      name: '陈韵',
      phone: '13800000003',
      wxOpenid: null,
      subjects: '声乐,钢琴',
      status: 'active',
    }),
    teacherRepo.create({
      name: '赵筝',
      phone: '13800000004',
      wxOpenid: null,
      subjects: '古筝',
      status: 'active',
    }),
    teacherRepo.create({
      name: '孙鼓',
      phone: '13800000005',
      wxOpenid: null,
      subjects: '架子鼓,拉丁舞',
      status: 'active',
    }),
  ]);
  console.log(`老师 ${teachers.length} 名(王雪已绑定 mock-teacher-1)`);

  // ---------- 学员 ----------
  const studentRepo = dataSource.getRepository(Student);
  const students = await studentRepo.save([
    studentRepo.create({ name: '张小明', gender: 'male', birthday: '2017-05-12', status: 'active', remark: '喜欢画画' }),
    studentRepo.create({ name: '张小圆', gender: 'female', birthday: '2019-09-01', status: 'active', remark: '小明的妹妹' }),
    studentRepo.create({ name: '刘一诺', gender: 'female', birthday: '2016-03-25', status: 'active', remark: '准备钢琴三级考级' }),
    studentRepo.create({ name: '周天佑', gender: 'male', birthday: '2015-11-08', status: 'active', remark: null }),
    studentRepo.create({ name: '吴悠悠', gender: 'female', birthday: '2018-01-30', status: 'active', remark: null }),
    studentRepo.create({ name: '郑星辰', gender: 'male', birthday: '2014-07-19', status: 'inactive', remark: '暂停课中' }),
  ]);
  console.log(`学员 ${students.length} 名`);

  // ---------- 家长 ----------
  const parentRepo = dataSource.getRepository(Parent);
  const parents = await parentRepo.save([
    parentRepo.create({ name: '张爸爸', phone: '13900000001', wxOpenid: 'mock-parent-1' }),
    parentRepo.create({ name: '张妈妈', phone: '13900000002', wxOpenid: null }),
    parentRepo.create({ name: '刘妈妈', phone: '13900000003', wxOpenid: 'mock-parent-2' }),
    parentRepo.create({ name: '周爸爸', phone: '13900000004', wxOpenid: null }),
    parentRepo.create({ name: '吴妈妈', phone: '13900000005', wxOpenid: null }),
  ]);
  const linkRepo = dataSource.getRepository(ParentStudent);
  await linkRepo.save([
    linkRepo.create({ parentId: parents[0].id, studentId: students[0].id, relation: '爸爸' }),
    linkRepo.create({ parentId: parents[0].id, studentId: students[1].id, relation: '爸爸' }),
    linkRepo.create({ parentId: parents[1].id, studentId: students[0].id, relation: '妈妈' }),
    linkRepo.create({ parentId: parents[1].id, studentId: students[1].id, relation: '妈妈' }),
    linkRepo.create({ parentId: parents[2].id, studentId: students[2].id, relation: '妈妈' }),
    linkRepo.create({ parentId: parents[3].id, studentId: students[3].id, relation: '爸爸' }),
    linkRepo.create({ parentId: parents[4].id, studentId: students[4].id, relation: '妈妈' }),
  ]);
  console.log(`家长 ${parents.length} 名(张爸爸已绑定 mock-parent-1,名下两个孩子)`);

  // ---------- 班级(每周固定排课) ----------
  const classRepo = dataSource.getRepository(ClassEntity);
  const classDefs: Array<{
    name: string;
    course: string;
    teacher: Teacher;
    room: string;
    weekday: number;
    startTime: string;
    endTime: string;
    capacity: number;
  }> = [
    // 素描按用户实际课表:每周六、日 上/下午各一节,一个班 = 一个可预约时段
    { name: '素描·周六上午班', course: '素描', teacher: teachers[0], room: '101 画室', weekday: 6, startTime: '10:00', endTime: '11:30', capacity: 8 },
    { name: '素描·周六下午班', course: '素描', teacher: teachers[0], room: '101 画室', weekday: 6, startTime: '14:00', endTime: '15:30', capacity: 8 },
    { name: '素描·周日上午班', course: '素描', teacher: teachers[0], room: '101 画室', weekday: 7, startTime: '10:00', endTime: '11:30', capacity: 8 },
    { name: '素描·周日下午班', course: '素描', teacher: teachers[0], room: '101 画室', weekday: 7, startTime: '14:00', endTime: '15:30', capacity: 8 },
    { name: '创意美术启蒙班', course: '创意美术', teacher: teachers[0], room: '102 画室', weekday: 7, startTime: '16:00', endTime: '17:00', capacity: 10 },
    { name: '书法硬笔班', course: '书法', teacher: teachers[1], room: '201 书法室', weekday: 3, startTime: '18:30', endTime: '19:30', capacity: 12 },
    { name: '声乐启蒙班', course: '声乐', teacher: teachers[2], room: '301 琴房', weekday: 6, startTime: '14:00', endTime: '15:00', capacity: 6 },
    { name: '钢琴考级小组班', course: '钢琴', teacher: teachers[2], room: '302 琴房', weekday: 7, startTime: '15:00', endTime: '16:00', capacity: 4 },
    { name: '古筝入门班', course: '古筝', teacher: teachers[3], room: '303 琴房', weekday: 5, startTime: '19:00', endTime: '20:00', capacity: 6 },
    { name: '架子鼓基础班', course: '架子鼓', teacher: teachers[4], room: '401 鼓房', weekday: 6, startTime: '16:00', endTime: '17:00', capacity: 5 },
    { name: '拉丁舞少儿班', course: '拉丁舞', teacher: teachers[4], room: '501 舞蹈室', weekday: 7, startTime: '10:30', endTime: '11:30', capacity: 15 },
  ];
  const classes = await classRepo.save(
    classDefs.map((def) =>
      classRepo.create({
        name: def.name,
        courseId: courseByName.get(def.course)!.id,
        teacherId: def.teacher.id,
        room: def.room,
        weekday: def.weekday,
        startTime: def.startTime,
        endTime: def.endTime,
        capacity: def.capacity,
        status: 'active',
      }),
    ),
  );
  console.log(`班级 ${classes.length} 个`);

  // ---------- 生成未来 5 周课次(保证"长期预约一个月"能约到足够多节) ----------
  const lessonRepo = dataSource.getRepository(Lesson);
  const lessons: Lesson[] = [];
  const start = dayjs();
  const end = dayjs().add(35, 'day');
  for (const cls of classes) {
    for (let d = start; !d.isAfter(end); d = d.add(1, 'day')) {
      const isoWeekday = d.day() === 0 ? 7 : d.day();
      if (isoWeekday === cls.weekday) {
        lessons.push(
          lessonRepo.create({
            classId: cls.id,
            date: d.format('YYYY-MM-DD'),
            startTime: cls.startTime,
            endTime: cls.endTime,
            status: 'scheduled',
          }),
        );
      }
    }
  }
  const savedLessons = await lessonRepo.save(lessons);
  console.log(`课次 ${savedLessons.length} 节(未来 5 周)`);

  // ---------- 课时包 + 缴费 ----------
  const pkgRepo = dataSource.getRepository(CoursePackage);
  const paymentRepo = dataSource.getRepository(Payment);
  // 注意:课时严格按课种消耗,已取消"通用课时包",每个包必须绑定课种。
  // 演示口径:mock-parent-1(张爸爸)的孩子张小明只买了素描、张小圆只买了创意美术,
  // 小程序课表里钢琴/拉丁舞等未购课种应显示"未购买该课种"且不可预约。
  const pkgDefs: Array<{
    student: Student;
    course: string;
    name: string;
    total: number;
    remaining: number;
    validUntil: string;
    amount: number;
    method: Payment['method'];
  }> = [
    { student: students[0], course: '素描', name: '素描 48 课时包', total: 48, remaining: 36, validUntil: dayjs().add(1, 'year').format('YYYY-MM-DD'), amount: 5280, method: 'wechat' },
    { student: students[1], course: '创意美术', name: '创意美术 24 课时包', total: 24, remaining: 20, validUntil: dayjs().add(1, 'year').format('YYYY-MM-DD'), amount: 2160, method: 'alipay' },
    { student: students[2], course: '钢琴', name: '钢琴 48 课时包', total: 48, remaining: 40, validUntil: dayjs().add(1, 'year').format('YYYY-MM-DD'), amount: 8640, method: 'wechat' },
    { student: students[3], course: '书法', name: '书法 24 课时包', total: 24, remaining: 3, validUntil: dayjs().add(3, 'month').format('YYYY-MM-DD'), amount: 2400, method: 'card' },
    { student: students[4], course: '拉丁舞', name: '拉丁舞 36 课时包', total: 36, remaining: 30, validUntil: dayjs().add(1, 'year').format('YYYY-MM-DD'), amount: 4320, method: 'wechat' },
  ];
  let serial = 0;
  for (const def of pkgDefs) {
    const pkg = await pkgRepo.save(
      pkgRepo.create({
        studentId: def.student.id,
        courseId: courseByName.get(def.course)!.id,
        name: def.name,
        totalLessons: def.total,
        remainingLessons: def.remaining,
        validUntil: def.validUntil,
        status: 'active',
      }),
    );
    serial += 1;
    await paymentRepo.save(
      paymentRepo.create({
        serialNo: `PSEED${dayjs().format('YYYYMMDD')}${String(serial).padStart(4, '0')}`,
        studentId: def.student.id,
        packageId: pkg.id,
        amount: String(def.amount),
        method: def.method,
        status: 'paid',
        paidAt: dayjs().subtract(serial * 3, 'day').toDate(),
        remark: '种子数据',
      }),
    );
  }
  console.log(`课时包 ${pkgDefs.length} 个 + 对应缴费流水`);

  // ---------- 预约示例:给最近的素描课/创意美术课各来几条 ----------
  const bookingRepo = dataSource.getRepository(Booking);
  const classByName = new Map(classes.map((c) => [c.name, c]));
  const findNextLesson = (className: string) => {
    const cls = classByName.get(className);
    if (!cls) return undefined;
    return savedLessons
      .filter((l) => l.classId === cls.id)
      .sort((a, b) => (a.date < b.date ? -1 : 1))[0];
  };
  const sketchLesson = findNextLesson('素描·周六上午班');
  const artLesson = findNextLesson('创意美术启蒙班');
  const pianoLesson = findNextLesson('钢琴考级小组班');
  const pkgs = await pkgRepo.find();
  const pkgOf = (studentId: number, courseName: string) =>
    pkgs.find(
      (p) => p.studentId === studentId && p.courseId === courseByName.get(courseName)?.id,
    );

  const seedBookings: Booking[] = [];
  if (sketchLesson) {
    const pkg = pkgOf(students[0].id, '素描');
    if (pkg) {
      seedBookings.push(
        bookingRepo.create({
          studentId: students[0].id,
          lessonId: sketchLesson.id,
          packageId: pkg.id,
          status: 'booked',
          source: 'parent',
        }),
      );
      pkg.remainingLessons -= 1;
      await pkgRepo.save(pkg);
    }
  }
  if (artLesson) {
    const pkg = pkgOf(students[1].id, '创意美术');
    if (pkg) {
      seedBookings.push(
        bookingRepo.create({
          studentId: students[1].id,
          lessonId: artLesson.id,
          packageId: pkg.id,
          status: 'booked',
          source: 'parent',
        }),
      );
      pkg.remainingLessons -= 1;
      await pkgRepo.save(pkg);
    }
  }
  if (pianoLesson) {
    const pkg = pkgOf(students[2].id, '钢琴');
    if (pkg) {
      seedBookings.push(
        bookingRepo.create({
          studentId: students[2].id,
          lessonId: pianoLesson.id,
          packageId: pkg.id,
          status: 'booked',
          source: 'admin',
        }),
      );
      pkg.remainingLessons -= 1;
      await pkgRepo.save(pkg);
    }
  }
  await bookingRepo.save(seedBookings);
  console.log(`预约示例 ${seedBookings.length} 条`);

  console.log('\n===== 种子数据完成 =====');
  console.log('后台演示账号: admin / admin123 (超管), reception / reception123 (前台)');
  console.log('小程序 mock 登录: mock-parent-1(家长-张爸爸), mock-teacher-1(老师-王雪), 其他任意值=未绑定');
  await dataSource.destroy();
}

main().catch((err) => {
  console.error('Seed 失败:', err);
  process.exit(1);
});
