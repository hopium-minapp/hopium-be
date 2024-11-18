export const PVP_QUEUE_NAME = 'pvp_send_message';
export const TIME_SEND_MESSAGE_LIMIT = 5000;

export const PVP_QUEUE_EVENT_NAME = {
  PVP_ACCEPT_ROOM: 'pvp_accept_room',
  PVP_SEND_MESSAGE: 'pvp_send_message',
};

export interface PvPSendMessageData {
  chatId: number;
  text: string;
  options?: any;
}

export interface PvPAcceptRoomData {
  acceptorId: number;
  pvpKey: string;
  acceptorUserName: string;
  messageId: number;
  userName: string;
  target: string;
  amount: number;
  chatId: number;
}
