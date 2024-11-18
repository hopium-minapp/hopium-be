import { IsInt, IsNumber } from 'class-validator';

export class CreateWalletDto {
  @IsNumber()
  @IsInt()
  userId: number;

  @IsNumber()
  @IsInt()
  assetId: number;

  @IsNumber()
  @IsInt()
  balance: number;

  @IsNumber()
  @IsInt()
  locked: number;
}
