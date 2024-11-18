import { Side, SortBy } from '../type/turn.type';
import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationQueryOffsetDto } from 'src/commons/dtos/pagination-query.dto';
import { Type } from 'class-transformer';

export class PvPHistoryQueryDto extends PaginationQueryOffsetDto {
  @ApiPropertyOptional({
    enum: Side,
  })
  @IsOptional()
  @IsEnum(Side)
  target?: Side;
}

export class OpenPvPRoomQueryDto {
  @ApiPropertyOptional()
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  userId?: number;

  @ApiPropertyOptional({
    enum: SortBy,
  })
  @IsOptional()
  @IsEnum(SortBy)
  sort?: SortBy;
}
