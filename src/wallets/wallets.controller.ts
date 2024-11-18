import { Controller, Get, UseGuards } from '@nestjs/common';
import { WalletsService } from './wallets.service';
import { AuthGuard } from 'src/auth/auth.guard';
import { UserAuth } from 'src/commons/decorators/user.decorator';
import { User } from '@telegram-apps/init-data-node';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Asset } from './constants/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { WALLET_EVENTS } from './constants/events';
import { Wallet } from './interfaces/wallet.interface';
import { EventEmitter2 } from '@nestjs/event-emitter';

@ApiBearerAuth()
@ApiTags('Wallets')
@Controller('wallets')
export class WalletsController {
  constructor(
    private readonly walletsService: WalletsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @Get('balance')
  @UseGuards(AuthGuard, ThrottlerGuard)
  async getBalance(@UserAuth() userData: User) {
    return this.walletsService.getBalance({
      assetId: Asset.HOPIUM,
      userId: userData.id,
    });
  }

  @Get('all-balance')
  @UseGuards(AuthGuard, ThrottlerGuard)
  async getAllBalance(@UserAuth() userData: User) {
    return this.walletsService.getAllBalance(userData.id);
  }

  @MessagePattern(WALLET_EVENTS.UPDATED)
  async onUpdatedWallet(@Payload() wallet: Wallet) {
    this.eventEmitter.emit(WALLET_EVENTS.UPDATED, wallet);
  }
}
