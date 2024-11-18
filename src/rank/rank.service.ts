import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { FriendQueryDto } from './dto/friend-query.dto';
import { InjectModel } from '@nestjs/mongoose';
import { User } from 'src/users/schemas/user.schema';
import { Model } from 'mongoose';
import { Point } from 'src/wallets/schemas/point.schema';
import { PvPRoom, PvPRoomDocument } from 'src/game/schemas/pvp-room.schema';
import { RankQueryDto } from './dto/pvp-query.dto';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

@Injectable()
export class RankService {
  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<User>,
    @InjectModel(Point.name)
    private readonly pointModel: Model<Point>,
    @InjectModel(PvPRoom.name)
    private readonly pvpRoomModel: Model<PvPRoomDocument>,
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
  ) {}

  async getFriendRanking(userId: number, query: FriendQueryDto) {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const matchCond = {
      $or: [
        { parentId: userId },
        {
          _id: {
            $in: [user.parentId || 0, userId],
          },
        },
      ],
    };

    const result = await this.userModel.aggregate([
      {
        $match: matchCond,
      },
      {
        $lookup: {
          from: 'points',
          localField: '_id',
          foreignField: '_id',
          as: 'points',
        },
      },
      {
        $unwind: {
          path: '$points',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $sort: {
          'points.point': -1,
        },
      },
      {
        $skip: query.offset,
      },
      {
        $limit: query.limit + 1,
      },
      {
        $project: {
          username: 1,
          firstName: 1,
          lastName: 1,
          point: '$points.point',
        },
      },
    ]);

    const total = await this.userModel.countDocuments(matchCond);

    const data = result.map((user) => {
      return {
        userId: user._id,
        username: user.username,
        point: user.point,
        firstName: user.firstName,
        lastName: user.lastName,
      };
    });

    return {
      data: data.slice(0, query.limit),
      total: total,
      hasMore: data.length > query.limit,
    };
  }

  async getRanking(query: FriendQueryDto) {
    const points = await this.pointModel
      .find()
      .sort({ point: -1 })
      .limit(query.limit + 1)
      .skip(query.offset);

    const userIds = points.map((wallet) => wallet._id);

    const users = await this.userModel.find({
      _id: { $in: userIds },
    });

    const usersMap = users.reduce((acc, user) => {
      acc[user._id] = user;
      return acc;
    }, {});

    const data = points.map((point) => {
      const user = usersMap[point._id] || {};

      return {
        userId: point._id,
        username: user.username,
        point: point.point,
        firstName: user.firstName,
        lastName: user.lastName,
      };
    });

    const total = await this.userModel.countDocuments();

    return {
      data: data.slice(0, query.limit),
      hasMore: data.length > query.limit,
      total: total,
    };
  }

  async getTopUsersForStats(limit: number) {
    const users = await this.userModel.aggregate([
      {
        $lookup: {
          from: 'wallets',
          localField: '_id',
          foreignField: '_id',
          as: 'wallet',
        },
      },
      {
        $unwind: '$wallet',
      },
      {
        $sort: { 'wallet.point': -1 },
      },
      {
        $limit: limit,
      },
      {
        $lookup: {
          from: 'turns',
          localField: '_id',
          foreignField: 'userId',
          as: 'turns',
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: 'parentId',
          as: 'friends',
        },
      },
      {
        $project: {
          username: 1,
          point: '$wallet.point',
          friends: { $size: { $ifNull: ['$friends', []] } },
          predictions: { $size: { $ifNull: ['$turns', []] } },
        },
      },
    ]);

    return users;
  }

  async getPvPRanking(query: RankQueryDto) {
    const points = await this.pointModel
      .find()
      .sort({ pointPvP: -1 })
      .limit(query.limit + 1)
      .skip(query.offset);

    const userIds = points.map((p) => p._id);
    const users = await this.userModel.find({
      _id: { $in: userIds },
    });

    const usersMap = users.reduce((acc, user) => {
      acc[user._id] = user;
      return acc;
    }, {});

    const data = points.map((point) => {
      const user = usersMap[point._id] || {};
      return {
        userId: point._id,
        username: user.username,
        totalVolume: point.pointPvP,
        firstName: user.firstName,
        lastName: user.lastName,
      };
    });

    const total = await this.userModel.countDocuments();

    return {
      data: data.slice(0, query.limit),
      hasMore: data.length > query.limit,
      total,
    };
  }

  async getPvpStats(userId: number) {
    const point = await this.pointModel.findById(userId);

    if (point.pointPvP !== 0) {
      return {
        totalVolume: point.pointPvP,
      };
    }

    const result = await this.pvpRoomModel.aggregate([
      {
        $match: {
          winnerId: userId,
        },
      },
      {
        $group: {
          _id: '$winnerId',
          totalVolume: { $sum: '$volumeWinning' },
        },
      },
    ]);

    return {
      totalVolume: result[0]?.totalVolume || 0,
    };
  }
}
