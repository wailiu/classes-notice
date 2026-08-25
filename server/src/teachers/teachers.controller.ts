import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IsIn, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { AdminGuard } from '../auth/guards';
import { TeachersService } from './teachers.service';

class TeacherDto {
  @IsString()
  @IsNotEmpty({ message: '姓名不能为空' })
  @MaxLength(50)
  name: string;

  @IsString()
  @Matches(/^1\d{10}$/, { message: '手机号格式不正确' })
  phone: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  wxOpenid?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  subjects?: string;

  @IsOptional()
  @IsIn(['active', 'inactive'])
  status?: string;
}

@UseGuards(AdminGuard)
@Controller('teachers')
export class TeachersController {
  constructor(private readonly service: TeachersService) {}

  @Get()
  list(@Query() query: { keyword?: string; page?: number; pageSize?: number }) {
    return this.service.list(query);
  }

  @Post()
  create(@Body() dto: TeacherDto) {
    return this.service.create(dto);
  }

  @Put(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: TeacherDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
