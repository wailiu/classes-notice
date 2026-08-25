import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** 课程科目(素描、创意美术、书法、声乐、钢琴、古筝、架子鼓、拉丁舞等) */
@Entity('courses')
export class Course {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 50, unique: true, comment: '科目名称' })
  name: string;

  @Column({ type: 'varchar', length: 500, nullable: true, comment: '简介' })
  description: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0, comment: '单课时参考价(元)' })
  unitPrice: string;

  @Column({ type: 'varchar', length: 20, default: 'active', comment: '状态: active/inactive' })
  status: string;

  @CreateDateColumn()
  createdAt: Date;
}
