import { TasksService } from './tasks.service';
import { AuthGuard } from 'src/auth/auth.guard';
import { User } from '@telegram-apps/init-data-node';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  Controller,
  Get,
  Put,
  Param,
  ParseIntPipe,
  UseGuards,
  Query,
} from '@nestjs/common';
import { UserAuth } from 'src/commons/decorators/user.decorator';
import { Throttle } from '@nestjs/throttler';
import { ThrottlerUserGuard } from 'src/commons/guards/throttler-user.guard';
import { TaskQueryDto } from './dto/task-query.dto';

@ApiBearerAuth()
@ApiTags('Tasks')
@Controller('tasks')
@UseGuards(AuthGuard, ThrottlerUserGuard)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  async getTasks(@UserAuth() user: User, @Query() query: TaskQueryDto) {
    return this.tasksService.getUserTasks(user.id, query);
  }

  @Put('click/:taskId')
  @Throttle({ default: { limit: 1, ttl: 1000 } })
  async updateUserTaskStatus(
    @UserAuth() user: User,
    @Param('taskId', ParseIntPipe) taskId: number,
  ) {
    return this.tasksService.updateUserTaskStatus(user.id, taskId);
  }

  @Put('claim/:taskId')
  @Throttle({ default: { limit: 1, ttl: 1000 } })
  async claimTask(
    @UserAuth() user: User,
    @Param('taskId', ParseIntPipe) taskId: number,
  ) {
    return this.tasksService.claimTask(user.id, taskId);
  }
}
