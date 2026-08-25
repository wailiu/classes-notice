import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Teacher, ClassEntity } from '../entities';
import { TeachersService } from './teachers.service';
import { TeachersController } from './teachers.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Teacher, ClassEntity])],
  controllers: [TeachersController],
  providers: [TeachersService],
})
export class TeachersModule {}
