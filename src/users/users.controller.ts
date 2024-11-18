import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from 'src/auth/auth.guard';
import { UserAuth } from 'src/commons/decorators/user.decorator';
import { User } from '@telegram-apps/init-data-node';
import { AddReferralDto } from './dto/add-referral.dto';
import { ThrottlerGuard } from '@nestjs/throttler';

@ApiBearerAuth()
@Controller('users')
@UseGuards(AuthGuard, ThrottlerGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}
  @Post('add-referral')
  async addReferral(@UserAuth() userData: User, @Body() data: AddReferralDto) {
    try {
      const user = await this.usersService.addReferral(
        userData.id,
        data.parentId,
      );
      return user.acknowledged;
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }
}
