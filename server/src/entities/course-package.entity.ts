import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Student } from './student.entity';
import { Course } from './course.entity';

export type PackageStatus = 'active' | 'expired' | 'finished' | 'refunded';

/** 课时包(报名记录):购买课时、剩余课时、有效期 */
@Entity('course_packages')
export class CoursePackage {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  studentId: number;

  @Column({ type: 'int', nullable: true, comment: '限定科目,NULL 表示通用课时包' })
  courseId: number | null;

  @Column({ length: 100, comment: '课时包名称,如 "钢琴48课时包"' })
  name: string;

  @Column({ type: 'int', comment: '购买课时数' })
  totalLessons: number;

  @Column({ type: 'int', comment: '剩余课时数' })
  remainingLessons: number;

  @Column({ type: 'date', nullable: true, comment: '有效期至,NULL 表示不限' })
  validUntil: string | null;

  @Column({ type: 'varchar', length: 20, default: 'active', comment: '状态: active/expired/finished/refunded' })
  status: PackageStatus;

  @ManyToOne(() => Student)
  @JoinColumn({ name: 'studentId' })
  student: Student;

  @ManyToOne(() => Course, { nullable: true })
  @JoinColumn({ name: 'courseId' })
  course: Course | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
