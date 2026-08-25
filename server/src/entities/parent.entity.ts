import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ParentStudent } from './parent-student.entity';

/** 家长,一个家长可关联多个孩子 */
@Entity('parents')
export class Parent {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 50, comment: '姓名' })
  name: string;

  @Column({ length: 20, unique: true, comment: '手机号' })
  phone: string;

  @Column({ type: 'varchar', length: 64, nullable: true, unique: true, comment: '微信 openid,绑定后小程序免登' })
  wxOpenid: string | null;

  @OneToMany(() => ParentStudent, (ps) => ps.parent)
  studentLinks: ParentStudent[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
