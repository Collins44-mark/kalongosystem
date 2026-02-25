import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { IsDateString, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { BusinessModuleGuard } from '../common/guards/business-module.guard';
import { RequireModule } from '../common/decorators/require-module.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { TasksService } from './tasks.service';

class CreateAnnouncementTaskDto {
  @IsString()
  @MaxLength(120)
  title: string;

  @IsString()
  @MaxLength(2000)
  description: string;

  @IsString()
  @IsIn(['ALL', 'ROLE', 'WORKER'])
  sendTo: 'ALL' | 'ROLE' | 'WORKER';

  @IsOptional()
  @IsString()
  targetRole?: string;

  @IsOptional()
  @IsString()
  targetWorkerId?: string;
}

class CreateAssignedTaskDto {
  @IsString()
  workerId: string;

  @IsString()
  @MaxLength(120)
  title: string;

  @IsString()
  @MaxLength(3000)
  description: string;

  @IsString()
  @IsIn(['LOW', 'MEDIUM', 'HIGH'])
  priority: 'LOW' | 'MEDIUM' | 'HIGH';

  @IsOptional()
  @IsDateString()
  dueDate?: string;
}

class CompleteTaskDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

@Controller('tasks')
@UseGuards(JwtAuthGuard, SubscriptionGuard, BusinessModuleGuard)
@RequireModule('tasks')
export class TasksController {
  constructor(private tasks: TasksService) {}

  @Get()
  async list(
    @CurrentUser() user: any,
    @Query('period') period?: 'today' | 'week' | 'month' | 'bydate',
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('status') status?: 'pending' | 'completed' | 'overdue',
    @Query('type') type?: 'all' | 'announcement' | 'assigned',
    @Query('role') role?: string,
    @Query('workerId') workerId?: string,
  ) {
    const p = period && ['today', 'week', 'month', 'bydate'].includes(period) ? period : 'today';
    const st = status && ['pending', 'completed', 'overdue'].includes(status) ? status : undefined;
    const tp = type && ['all', 'announcement', 'assigned'].includes(type) ? type : 'all';
    return this.tasks.listTasksForUser(user, { period: p, from, to, status: st, type: tp, role, workerId });
  }

  @Get('unread-count')
  async unreadCount(@CurrentUser() user: any) {
    return this.tasks.unreadCountForUser(user);
  }

  @Post('announcement')
  @UseGuards(RolesGuard)
  @Roles('MANAGER', 'ADMIN', 'OWNER')
  async createAnnouncement(@CurrentUser() user: any, @Body() dto: CreateAnnouncementTaskDto) {
    return this.tasks.createAnnouncementTask(
      user.businessId,
      user.branchId || 'main',
      user.sub,
      user.role || 'MANAGER',
      {
        title: dto.title,
        description: dto.description,
        sendTo: dto.sendTo,
        targetRole: dto.targetRole,
        targetWorkerId: dto.targetWorkerId,
      },
    );
  }

  @Post('assigned')
  @UseGuards(RolesGuard)
  @Roles('MANAGER', 'ADMIN', 'OWNER')
  async createAssigned(@CurrentUser() user: any, @Body() dto: CreateAssignedTaskDto) {
    return this.tasks.createAssignedTask(
      user.businessId,
      user.branchId || 'main',
      user.sub,
      user.role || 'MANAGER',
      {
        workerId: dto.workerId,
        title: dto.title,
        description: dto.description,
        priority: dto.priority,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
      },
    );
  }

  @Post(':id/read')
  async markRead(@CurrentUser() user: any, @Param('id') id: string) {
    return this.tasks.markRead(user, id);
  }

  @Post(':id/complete')
  async complete(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: CompleteTaskDto) {
    return this.tasks.completeAssignedTask(user, id, dto.note);
  }
}

