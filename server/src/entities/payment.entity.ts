import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Student } from './student.entity';
import { CoursePackage } from './course-package.entity';

export type PaymentMethod = 'wechat' | 'alipay' | 'cash' | 'card' | 'other';
export type PaymentStatus = 'paid' | 'refunded';

/** 缴费流水 */
@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 32, unique: true, comment: '流水号' })
  serialNo: string;

  @Column()
  studentId: number;

  @Column({ type: 'int', nullable: true, comment: '对应课时包' })
  packageId: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, comment: '金额(元)' })
  amount: string;

  @Column({ type: 'varchar', length: 20, comment: '方式: wechat/alipay/cash/card/other' })
  method: PaymentMethod;

  @Column({ type: 'varchar', length: 20, default: 'paid', comment: '状态: paid/refunded' })
  status: PaymentStatus;

  @Column({ type: 'datetime', comment: '缴费时间' })
  paidAt: Date;

  @Column({ type: 'varchar', length: 500, nullable: true, comment: '备注' })
  remark: string | null;

  @ManyToOne(() => Student)
  @JoinColumn({ name: 'studentId' })
  student: Student;

  @ManyToOne(() => CoursePackage, { nullable: true })
  @JoinColumn({ name: 'packageId' })
  coursePackage: CoursePackage | null;

  @CreateDateColumn()
  createdAt: Date;
}
