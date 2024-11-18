import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { MAX_WIN_STREAK } from 'src/game/constants/game';

export type UserDocument = HydratedDocument<User>;

@Schema({
  timestamps: true,
  collection: 'users',
})
export class User {
  @Prop({
    type: Number,
    required: true,
  })
  _id: number; // Telegram user ID

  @Prop({
    type: Number,
    required: false,
    index: true,
  })
  parentId?: number;

  @Prop({
    type: String,
    required: false,
  })
  tonAddress?: string;

  /**
   * Username of the user or bot.
   */
  @Prop({
    type: String,
  })
  username?: string;

  @Prop({
    type: String,
    required: true,
  })
  firstName: string;

  @Prop({
    type: String,
    required: false,
  })
  lastName?: string;

  /**
   * True, if this user allowed the bot to message them.
   */
  @Prop({
    type: Boolean,
    required: false,
    default: false,
  })
  allowsWriteToPm?: boolean;

  /**
   * True, if this user added the bot to the attachment menu.
   */
  @Prop({
    type: Boolean,
    required: false,
    default: false,
  })
  addedToAttachmentMenu?: boolean;

  @Prop({
    type: String,
    required: false,
  })
  languageCode?: string;

  /**
   * URL of the user’s profile photo. The photo can be in .jpeg or .svg
   * formats. Only returned for Mini Apps launched from the attachment menu.
   */
  @Prop({
    type: String,
    required: false,
  })
  photoUrl?: string;

  /**
   * True, if this user is a Telegram Premium user.
   */
  @Prop({
    type: Boolean,
    required: false,
    default: false,
  })
  isPremium?: boolean;

  @Prop({
    type: Number,
    required: false,
    default: 0,
    min: 0,
    max: MAX_WIN_STREAK,
  })
  winStreak?: number;

  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);
