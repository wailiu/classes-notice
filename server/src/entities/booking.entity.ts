import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Student } from './student.entity';
import { Lesson } from './lesson.entity';
import { CoursePackage } from './course-package.entity';

export type BookingStatus = 'booked' | 'checked_in' | 'cancelled' | 'no_show';

/** 预约记录:预约时扣课时,取消退回,签到核销 */
@Entity('bookings')
export class Booking {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column()
  studentId: number;

  @Index()
  @Column()
  lessonId: number;

  @Column({ type: 'int', nullable: true, comment: '扣课时的课时包' })
  packageId: number | null;

  @Column({ type: 'varchar', length: 20, default: 'booked', comment: '状态: booked/checked_in/cancelled/no_show' })
  status: BookingStatus;

  @Column({ type: 'varchar', length: 20, default: 'parent', comment: '预约来源: parent=家长小程序, admin=后台' })
  source: string;

  @Column({ type: 'datetime', nullable: true, comment: '签到时间' })
  checkinAt: Date | null;

  @Column({ type: 'datetime', nullable: true, comment: '取消时间' })
  cancelledAt: Date | null;

  @ManyToOne(() => Student)
  @JoinColumn({ name: 'studentId' })
  student: Student;

  @ManyToOne(() => Lesson, (l) => l.bookings, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lessonId' })
  lesson: Lesson;

  @ManyToOne(() => CoursePackage, { nullable: true })
  @JoinColumn({ name: 'packageId' })
  coursePackage: CoursePackage | null;

  @CreateDateColumn()
  createdAt: Date;
}
