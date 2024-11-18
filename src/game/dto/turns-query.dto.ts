import { PaginationQueryOffsetDto } from 'src/commons/dtos/pagination-query.dto';
import { State } from '../type/turn.type';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';

export class TurnListQueryDto extends PaginationQueryOffsetDto {
  @ApiPropertyOptional({
    enum: State,
  })
  @IsOptional()
  @IsEnum(State)
  state?: State;
}
