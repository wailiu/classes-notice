import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IsIn, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { AdminGuard } from '../auth/guards';
import { PaymentsService } from './payments.service';

class PaymentCreateDto {
  @IsInt()
  studentId: number;

  @IsOptional()
  @IsInt()
  packageId?: number;

  @IsNumber()
  @Min(0)
  amount: number;

  @IsIn(['wechat', 'alipay', 'cash', 'card', 'other'])
  method: string;

  @IsOptional()
  @IsString()
  paidAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string;
}

@UseGuards(AdminGuard)
@Controller('payments')
export class PaymentsController {
  constructor(private readonly service: PaymentsService) {}

  @Get()
  list(
    @Query()
    query: {
      studentId?: number;
      status?: string;
      method?: string;
      from?: string;
      to?: string;
      page?: number;
      pageSize?: number;
    },
  ) {
    return this.service.list(query);
  }

  @Post()
  create(@Body() dto: PaymentCreateDto) {
    return this.service.create(dto);
  }

  @Post(':id/refund')
  refund(@Param('id', ParseIntPipe) id: number) {
    return this.service.refund(id);
  }
}
