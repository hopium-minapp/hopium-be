import { IsInt, IsNumber } from 'class-validator';

export class GetBalanceDto {
  @IsNumber()
  @IsInt()
  userId: number;

  @IsNumber()
  @IsInt()
  assetId: number;
}
