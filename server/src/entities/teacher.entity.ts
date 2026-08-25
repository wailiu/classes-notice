import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ClassEntity } from './class.entity';

/** 老师 */
@Entity('teachers')
export class Teacher {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 50, comment: '姓名' })
  name: string;

  @Column({ length: 20, unique: true, comment: '手机号' })
  phone: string;

  @Column({ type: 'varchar', length: 64, nullable: true, unique: true, comment: '微信 openid,绑定后小程序免登' })
  wxOpenid: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true, comment: '擅长科目,逗号分隔,如: 素描,创意美术' })
  subjects: string | null;

  @Column({ type: 'varchar', length: 20, default: 'active', comment: '状态: active/inactive' })
  status: string;

  @OneToMany(() => ClassEntity, (c) => c.teacher)
  classes: ClassEntity[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
