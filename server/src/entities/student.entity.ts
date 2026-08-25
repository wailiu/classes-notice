import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ParentStudent } from './parent-student.entity';

export type StudentStatus = 'active' | 'inactive';

/** 学员(孩子)档案 */
@Entity('students')
export class Student {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 50, comment: '姓名' })
  name: string;

  @Column({ type: 'varchar', length: 10, default: 'unknown', comment: '性别: male/female/unknown' })
  gender: string;

  @Column({ type: 'date', nullable: true, comment: '生日' })
  birthday: string | null;

  @Column({ type: 'varchar', length: 20, default: 'active', comment: '在读状态: active=在读, inactive=停课' })
  status: StudentStatus;

  @Column({ type: 'varchar', length: 500, nullable: true, comment: '备注' })
  remark: string | null;

  @OneToMany(() => ParentStudent, (ps) => ps.student)
  parentLinks: ParentStudent[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
