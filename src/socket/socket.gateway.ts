import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
// import { AuthService } from 'src/auth/auth.service';
import { Logger } from '@nestjs/common';
import { AuthService } from 'src/auth/auth.service';
import { OnEvent } from '@nestjs/event-emitter';
import { PVP_EVENTS, TURN_EVENTS } from 'src/game/constants/events';
import { Turn } from 'src/game/schemas/turn.schema';
import { WALLET_EVENTS } from 'src/wallets/constants/events';
import { Wallet } from 'src/wallets/schemas/wallet.schema';
import { PRICE_EVENTS } from 'src/price/constants/price';
import { AcceptPvPDto, PvPResultDto } from 'src/game/dto/pvp.dto';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class SocketGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(SocketGateway.name);
  @WebSocketServer() server: Server;

  constructor(private readonly authService: AuthService) {}

  afterInit() {
    this.logger.log('Socket initialized');
  }

  @SubscribeMessage('ping')
  handlePing() {
    return { event: 'pong' };
  }

  @SubscribeMessage('subscribe.price')
  handleSubscribePrice(client: Socket) {
    this.logger.log('Client subscribed to price');
    client.join('price');
  }

  @OnEvent(PRICE_EVENTS.UPDATED)
  onPriceUpdated(price: number) {
    this.server.to('price').emit(PRICE_EVENTS.UPDATED, price);
  }

  private getUserRoom(userId: number) {
    return `user_${userId}`;
  }

  handleConnection(client: Socket) {
    const authHeader = client.handshake.headers['x-auth-user'];
    if (!!authHeader) {
      try {
        const user = this.authService.parseUserFromHeader(authHeader as string);
        client.data.user = user;
        if (user.id) {
          client.join(this.getUserRoom(user.id));
          client.emit('connected', { user });
        }
      } catch (error) {
        console.error('Unauthorized user Error', error.message);
      }
    }
  }

  handleDisconnect(client: Socket) {
    if (client.data.user?.id) {
      client.leave(this.getUserRoom(client.data.user.id));
    }
  }

  @OnEvent(TURN_EVENTS.OPENED)
  handleTurnOpened(data: Turn) {
    this.server
      .to(this.getUserRoom(data.userId))
      .emit(TURN_EVENTS.OPENED, data);
  }

  @OnEvent(TURN_EVENTS.CLOSED)
  handleTurnClosed(data: Turn) {
    this.server
      .to(this.getUserRoom(data.userId))
      .emit(TURN_EVENTS.CLOSED, data);
  }

  @OnEvent(WALLET_EVENTS.UPDATED)
  handleWalletUpdated(data: Wallet) {
    this.server.to(this.getUserRoom(data.userId)).emit(WALLET_EVENTS.UPDATED, data);
  }

  @OnEvent(PVP_EVENTS.ENDED)
  handlePvPResult(data: PvPResultDto) {
    const { pvpId, winnerId, loserId } = data;

    this.server.to(this.getUserRoom(winnerId)).emit(PVP_EVENTS.ENDED, {
      pvpId,
      winnerId,
      loserId,
    });

    this.server.to(this.getUserRoom(loserId)).emit(PVP_EVENTS.ENDED, {
      pvpId,
      winnerId,
      loserId,
    });
  }

  @OnEvent(PVP_EVENTS.ACCEPTED)
  handlePvPAccepted(data: AcceptPvPDto) {
    const { pvpKey, acceptorId, creatorId } = data;
    this.server.to(this.getUserRoom(creatorId)).emit(PVP_EVENTS.ACCEPTED, {
      pvpKey,
      acceptorId: acceptorId,
    });
  }
}
