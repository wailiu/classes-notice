import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { Parent } from './parent.entity';
import { Student } from './student.entity';

/** 家长-孩子关联(含称谓) */
@Entity('parent_students')
@Unique(['parentId', 'studentId'])
export class ParentStudent {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  parentId: number;

  @Column()
  studentId: number;

  @Column({ length: 20, default: '家长', comment: '关系: 爸爸/妈妈/爷爷/奶奶等' })
  relation: string;

  @ManyToOne(() => Parent, (p) => p.studentLinks, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'parentId' })
  parent: Parent;

  @ManyToOne(() => Student, (s) => s.parentLinks, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'studentId' })
  student: Student;
}
