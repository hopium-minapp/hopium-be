import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { User } from '@telegram-apps/init-data-node';

export const UserAuth = createParamDecorator(
  (data: any, ctx: ExecutionContext): User => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
