import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Course } from './course.entity';
import { Teacher } from './teacher.entity';
import { Lesson } from './lesson.entity';

/** 班级(固定每周排课模板),如 "素描少儿A班 每周六 10:00-11:30" */
@Entity('classes')
export class ClassEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 100, comment: '班级名称' })
  name: string;

  @Column()
  courseId: number;

  @Column()
  teacherId: number;

  @Column({ length: 50, comment: '教室' })
  room: string;

  @Column({ type: 'tinyint', comment: '每周上课日: 1=周一 ... 7=周日' })
  weekday: number;

  @Column({ type: 'varchar', length: 5, comment: '开始时间 HH:mm' })
  startTime: string;

  @Column({ type: 'varchar', length: 5, comment: '结束时间 HH:mm' })
  endTime: string;

  @Column({ type: 'int', default: 10, comment: '容量(最多学员数)' })
  capacity: number;

  @Column({ type: 'varchar', length: 20, default: 'active', comment: '状态: active/inactive' })
  status: string;

  @ManyToOne(() => Course)
  @JoinColumn({ name: 'courseId' })
  course: Course;

  @ManyToOne(() => Teacher, (t) => t.classes)
  @JoinColumn({ name: 'teacherId' })
  teacher: Teacher;

  @OneToMany(() => Lesson, (l) => l.classEntity)
  lessons: Lesson[];

  @CreateDateColumn()
  createdAt: Date;
}
