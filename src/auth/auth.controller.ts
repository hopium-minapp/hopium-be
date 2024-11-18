import { Controller, Get, Logger, UseGuards } from '@nestjs/common';
import { AuthGuard } from './auth.guard';
import { ApiBearerAuth } from '@nestjs/swagger';
import { UserAuth } from 'src/commons/decorators/user.decorator';
import { User } from '@telegram-apps/init-data-node';
import { UsersService } from 'src/users/users.service';
import { WalletsService } from 'src/wallets/wallets.service';
import { ThrottlerGuard } from '@nestjs/throttler';

@ApiBearerAuth()
@Controller('auth')
@UseGuards(AuthGuard, ThrottlerGuard)
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly walletsService: WalletsService,
  ) {}

  @Get('profile')
  async getProfile(@UserAuth() userData: User) {
    let user = await this.usersService.getUser(userData.id);

    let isNew = false;
    if (!user) {
      user = await this.usersService.updateOrCreateUser(userData);

      await this.walletsService.getOrCreateWallet({
        userId: userData.id,
        isPremium: userData.isPremium,
      });
      isNew = true;
    }

    return {
      ...user,
      isNew,
    };
  }
}
