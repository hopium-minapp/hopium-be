import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { Target, Type } from '../type/pvp.type';

export class CreatePvPDto {
  @IsNumber()
  userId: number;

  @IsEnum(Target)
  target: Target;

  @IsNumber()
  amount: number;

  @IsNumber()
  chatId: number;

  @IsNumber()
  messageId: number;

  @IsString()
  userName: string;

  @IsString()
  firstName?: string;

  @IsString()
  lastName?: string;

  @IsString()
  pvpKey: string;

  @IsNumber()
  createdAt: number;

  @IsEnum(Type)
  type: Type;
}

export class AcceptPvPDto {
  @IsNumber()
  @IsOptional()
  creatorId?: number;

  @IsNumber()
  acceptorId: number;

  @IsString()
  acceptorUserName: string;

  @IsString()
  pvpKey: string;

  @IsNumber()
  messageId: number;
}

export class PlayPvPDto {
  @IsNumber()
  creatorId: number;

  @IsNumber()
  acceptorId: number;

  @IsEnum(Target)
  target: Target;

  @IsNumber()
  openPrice: number;

  @IsNumber()
  amount: number;

  @IsString()
  userName: string;

  @IsNumber()
  chatId: number;

  @IsString()
  acceptorUserName: string;

  @IsNumber()
  messageId: number;

  @IsEnum(Type)
  type: Type;

  @IsString()
  pvpId: string;

  @IsString()
  pvpRoomId: string;
}

export class PvPResultDto {
  @IsString()
  pvpId: string;

  @IsNumber()
  winnerId: number;

  @IsNumber()
  loserId: number;
}
