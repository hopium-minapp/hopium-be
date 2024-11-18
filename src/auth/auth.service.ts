import { Injectable } from '@nestjs/common';
import { User } from '@telegram-apps/init-data-node';
import { UserHeader } from './type/auth.type';

@Injectable()
export class AuthService {
  constructor() {}

  parseUserFromHeader(authHeader: string) {
    const userHeader: UserHeader = JSON.parse(authHeader as string);

    if (!userHeader.id) throw new Error('User id is required');

    const user: User = {
      id: userHeader.id,
      isPremium: userHeader.is_premium,
      username: userHeader.username,
      firstName: userHeader.first_name,
      lastName: userHeader.last_name,
      languageCode: userHeader.language_code,
      addedToAttachmentMenu: userHeader.added_to_attachment_menu,
      allowsWriteToPm: userHeader.allows_write_to_pm,
      photoUrl: userHeader.photo_url,
    };
    return user;
  }
}
