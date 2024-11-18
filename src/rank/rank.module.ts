import { Module } from '@nestjs/common';
import { RankService } from './rank.service';
import { RankController } from './rank.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Wallet, WalletSchema } from 'src/wallets/schemas/wallet.schema';
import { User, UserSchema } from 'src/users/schemas/user.schema';
import { Point, PointSchema } from 'src/wallets/schemas/point.schema';
import { PvPRoom, PvPRoomSchema } from 'src/game/schemas/pvp-room.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Wallet.name, schema: WalletSchema }]),
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
    MongooseModule.forFeature([{ name: Point.name, schema: PointSchema }]),
    MongooseModule.forFeature([{ name: PvPRoom.name, schema: PvPRoomSchema }]),
  ],
  controllers: [RankController],
  providers: [RankService],
  exports: [RankService],
})
export class RankModule {}
