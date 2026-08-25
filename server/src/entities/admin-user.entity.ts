import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type AdminRole = 'super' | 'staff';

/** 后台管理员(超管 / 前台教务) */
@Entity('admin_users')
export class AdminUser {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 50, unique: true, comment: '登录名' })
  username: string;

  @Column({ length: 100, comment: '密码哈希' })
  passwordHash: string;

  @Column({ length: 50, comment: '姓名' })
  name: string;

  @Column({ type: 'varchar', length: 20, default: 'staff', comment: '角色: super=超管, staff=前台教务' })
  role: AdminRole;

  @CreateDateColumn()
  createdAt: Date;
}
