import { ApiProperty } from '@nestjs/swagger';
import {
    IsInt,
    IsNumber,
    Min,
} from 'class-validator';

export class AddReferralDto {
    @ApiProperty()
    @IsNumber()
    @IsInt()
    @Min(1)
    parentId: number;
}
