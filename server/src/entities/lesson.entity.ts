import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { ClassEntity } from './class.entity';
import { Booking } from './booking.entity';

export type LessonStatus = 'scheduled' | 'finished' | 'cancelled';

/** 课次(具体某一天的一节课),由班级排课模板生成 */
@Entity('lessons')
@Unique(['classId', 'date'])
export class Lesson {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  classId: number;

  @Index()
  @Column({ type: 'date', comment: '上课日期 YYYY-MM-DD' })
  date: string;

  @Column({ type: 'varchar', length: 5, comment: '开始时间 HH:mm' })
  startTime: string;

  @Column({ type: 'varchar', length: 5, comment: '结束时间 HH:mm' })
  endTime: string;

  @Column({ type: 'varchar', length: 20, default: 'scheduled', comment: '状态: scheduled/finished/cancelled' })
  status: LessonStatus;

  @ManyToOne(() => ClassEntity, (c) => c.lessons, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'classId' })
  classEntity: ClassEntity;

  @OneToMany(() => Booking, (b) => b.lesson)
  bookings: Booking[];

  @CreateDateColumn()
  createdAt: Date;
}
