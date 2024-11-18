import { IsEnum, IsNumber, IsPositive } from 'class-validator';
import { Side } from '../type/turn.type';
import { ApiProperty } from '@nestjs/swagger';
import { Target } from '../type/pvp.type';

export class PlayGameDto {
  @ApiProperty({
    enum: Side,
    example: Side.PUMP,
  })
  @IsEnum(Side)
  side: Side;
}

export class PvPPositionDto {
  @ApiProperty({
    enum: Target,
    example: Target.PUMP,
  })
  @IsEnum(Target)
  target: Target;

  @ApiProperty({
    example: 1,
  })
  @IsNumber()
  @IsPositive()
  amount: number;
}
