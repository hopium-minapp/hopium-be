export class IncreasePointDto {
  userId: number;
  point: number = 0;
  pointPvP: number = 0;
}

export class TipPointDto {
  senderId: number;
  receiverId: number;
  amount: number = 0;
}
