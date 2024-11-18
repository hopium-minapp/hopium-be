import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { GameService } from './game.service';
import { User } from '@telegram-apps/init-data-node';
import { UserAuth } from 'src/commons/decorators/user.decorator';
import { PlayGameDto, PvPPositionDto } from './dto/play-game.dto';
import { AuthGuard } from 'src/auth/auth.guard';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { State } from './type/turn.type';
import { ParseObjectIdPipe } from 'src/commons/pipes/parse-object-id.pipe';
import { TurnListQueryDto } from './dto/turns-query.dto';
import { UserCacheInterceptor } from 'src/commons/interceptors/user-cache.interceptor';
import { CacheTTL } from '@nestjs/cache-manager';
import { OpenPvPRoomQueryDto, PvPHistoryQueryDto } from './dto/pvp-query.dto';
import { Throttle } from '@nestjs/throttler';
import { ThrottlerUserGuard } from 'src/commons/guards/throttler-user.guard';

@ApiBearerAuth()
@Controller('game')
@ApiTags('Game')
@UseGuards(AuthGuard, ThrottlerUserGuard)
export class GameController {
  constructor(private readonly gameService: GameService) {}

  @Post('play')
  play(@UserAuth() userData: User, @Body() body: PlayGameDto) {
    return this.gameService.play(userData.id, body);
  }

  @Get('turns')
  @UseInterceptors(UserCacheInterceptor)
  @CacheTTL(60000)
  async getTurns(@UserAuth() userData: User, @Query() query: TurnListQueryDto) {
    return this.gameService.getTurns(userData.id, query);
  }

  @Get('turns/:turnId')
  async getTurn(
    @UserAuth() userData: User,
    @Param('turnId', ParseObjectIdPipe) turnId: string,
  ) {
    const turn = await this.gameService.getTurnDetail(userData.id, turnId);
    if (turn.state === State.OPEN && this.gameService.isTurnExpired(turn)) {
      return this.gameService.closeTurn(turnId);
    }
    return turn;
  }

  @Get('stats')
  @UseInterceptors(UserCacheInterceptor)
  @CacheTTL(5 * 60000)
  async getStats(@UserAuth() userData: User) {
    return this.gameService.getStats(userData.id);
  }

  @Get('history/pvp')
  @UseInterceptors(UserCacheInterceptor)
  @CacheTTL(60000)
  async getPvPHistory(
    @UserAuth() userData: User,
    @Query() query: PvPHistoryQueryDto,
  ) {
    return this.gameService.getPvPHistory(userData.id, query);
  }

  @Get('stats/pvp')
  @UseInterceptors(UserCacheInterceptor)
  @CacheTTL(5 * 60000)
  async getPvPStats(@UserAuth() userData: User) {
    return this.gameService.getPvPStats(userData.id);
  }

  @Get('pvps')
  async getPvPPositions(
    @UserAuth() userData: User,
    @Query() query: OpenPvPRoomQueryDto,
  ) {
    return this.gameService.getOpenPvPRooms(userData.id, query);
  }

  @Post('pvp/create')
  @Throttle({ default: { limit: 1, ttl: 300 } })
  async createPvPRoom(
    @UserAuth() userData: User,
    @Body() body: PvPPositionDto,
  ) {
    return this.gameService.createPvPPosition(userData.id, body);
  }

  @Put('pvp/accept/:pvpKey')
  @Throttle({ default: { limit: 1, ttl: 300 } })
  async acceptPvPPosition(
    @UserAuth() userData: User,
    @Param('pvpKey') pvpKey: string,
  ) {
    return this.gameService.acceptPvPPosition(userData.id, pvpKey);
  }

  @Get('pvp/:pvpRoomId')
  async getPvPResult(
    @UserAuth() userData: User,
    @Param('pvpRoomId', ParseObjectIdPipe) pvpRoomId: string,
  ) {
    return this.gameService.getPvPResult(pvpRoomId);
  }
}
