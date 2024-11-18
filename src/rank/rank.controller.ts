import {
  Controller,
  Get,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { RankService } from './rank.service';
import { AuthGuard } from 'src/auth/auth.guard';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserAuth } from 'src/commons/decorators/user.decorator';
import { User } from '@telegram-apps/init-data-node';
import { FriendQueryDto } from './dto/friend-query.dto';
import { CacheInterceptor, CacheTTL } from '@nestjs/cache-manager';
import { UserCacheInterceptor } from 'src/commons/interceptors/user-cache.interceptor';
import { RankQueryDto } from './dto/pvp-query.dto';
import { ThrottlerGuard } from '@nestjs/throttler';

@ApiBearerAuth()
@ApiTags('Rank')
@Controller('rank')
@UseGuards(AuthGuard, ThrottlerGuard)
export class RankController {
  constructor(private readonly rankService: RankService) {}

  @Get('/friends')
  @CacheTTL(5 * 60000)
  @UseInterceptors(UserCacheInterceptor)
  async getFriendRanking(
    @UserAuth() userData: User,
    @Query() query: FriendQueryDto,
  ) {
    return this.rankService.getFriendRanking(userData.id, query);
  }

  @Get('')
  @CacheTTL(5 * 60000)
  @UseInterceptors(CacheInterceptor)
  async getRanking(@Query() query: FriendQueryDto) {
    return this.rankService.getRanking(query);
  }

  @Get('pvp')
  @CacheTTL(5 * 60000)
  @UseInterceptors(CacheInterceptor)
  async getPvPRanking(@Query() query: RankQueryDto) {
    return this.rankService.getPvPRanking(query);
  }

  @Get('pvp/stats')
  @CacheTTL(5 * 60000)
  @UseInterceptors(UserCacheInterceptor)
  async getPvpStats(@UserAuth() userData: User) {
    return this.rankService.getPvpStats(userData.id);
  }
}
