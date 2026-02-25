import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type PeriodFilter = 'today' | 'week' | 'month' | 'bydate';
type TaskType = 'ANNOUNCEMENT' | 'ASSIGNED';
type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH';
type TaskStatus = 'PENDING' | 'COMPLETED' | 'OVERDUE';

function normalizeRole(role: string | null | undefined) {
  const r = String(role || '').trim().toUpperCase();
  if (r === 'ADMIN' || r === 'OWNER') return 'MANAGER';
  return r || 'MANAGER';
}

@Injectable()
export class TasksService {
  constructor(private prisma: PrismaService) {}

  private getRange(period: PeriodFilter, from?: string, to?: string): { from: Date; to: Date } {
    const now = new Date();
    const endOfDay = (d: Date) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };
    const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
    if (period === 'bydate' && from && to) return { from: startOfDay(new Date(from)), to: endOfDay(new Date(to)) };
    if (period === 'month') return { from: startOfDay(new Date(now.getFullYear(), now.getMonth(), 1)), to: endOfDay(now) };
    if (period === 'week') { const s = new Date(now); s.setDate(s.getDate() - 7); return { from: startOfDay(s), to: endOfDay(now) }; }
    return { from: startOfDay(now), to: endOfDay(now) };
  }

  private statusOf(t: { type: string; dueDate: Date | null; completedAt: Date | null }): TaskStatus {
    if (t.completedAt) return 'COMPLETED';
    const type = String(t.type || '').toUpperCase();
    if (type === 'ASSIGNED' && t.dueDate && t.dueDate.getTime() < Date.now()) return 'OVERDUE';
    return 'PENDING';
  }

  private requireWorker(user: { workerId?: string | null }) {
    const workerId = String(user.workerId ?? '').trim();
    if (!workerId) throw new BadRequestException('Select worker profile first');
    return workerId;
  }

  async createAnnouncementTask(
    businessId: string,
    branchId: string,
    createdByUserId: string,
    createdByRole: string,
    data: {
      title: string;
      description: string;
      sendTo: 'ALL' | 'ROLE' | 'WORKER';
      targetRole?: string;
      targetWorkerId?: string;
    },
  ) {
    const title = String(data.title ?? '').trim();
    const description = String(data.description ?? '').trim();
    if (!title || !description) throw new BadRequestException('Title and description are required');

    const sendTo = String(data.sendTo || '').toUpperCase();
    const isAllStaff = sendTo === 'ALL';
    const targetRole = sendTo === 'ROLE' ? String(data.targetRole ?? '').trim().toUpperCase() : null;
    const targetWorkerId = sendTo === 'WORKER' ? String(data.targetWorkerId ?? '').trim() : null;

    if (!isAllStaff && !targetRole && !targetWorkerId) throw new BadRequestException('Recipient is required');
    if (targetWorkerId) {
      const w = await this.prisma.staffWorker.findFirst({ where: { id: targetWorkerId, businessId }, select: { id: true } });
      if (!w) throw new BadRequestException('Invalid staff member');
    }

    const created = await this.prisma.task.create({
      data: {
        businessId,
        branchId,
        type: 'ANNOUNCEMENT',
        title,
        description,
        isAllStaff,
        targetRole,
        targetWorkerId,
        createdByUserId,
        createdByRole: normalizeRole(createdByRole),
      },
    });

    await this.logAudit(createdByUserId, normalizeRole(createdByRole), businessId, 'task_created', 'task', created.id, {
      taskType: 'ANNOUNCEMENT',
      title,
      isAllStaff,
      targetRole,
      targetWorkerId,
    });

    return { id: created.id };
  }

  async createAssignedTask(
    businessId: string,
    branchId: string,
    createdByUserId: string,
    createdByRole: string,
    data: {
      workerId: string;
      title: string;
      description: string;
      priority: TaskPriority;
      dueDate?: Date | null;
    },
  ) {
    const workerId = String(data.workerId ?? '').trim();
    const title = String(data.title ?? '').trim();
    const description = String(data.description ?? '').trim();
    const priority = String(data.priority ?? '').trim().toUpperCase() as TaskPriority;
    if (!workerId || !title || !description) throw new BadRequestException('Fill all details');
    if (!['LOW', 'MEDIUM', 'HIGH'].includes(priority)) throw new BadRequestException('Invalid priority');

    const w = await this.prisma.staffWorker.findFirst({ where: { id: workerId, businessId, status: 'ACTIVE' }, select: { id: true } });
    if (!w) throw new BadRequestException('Invalid staff member');

    const dueDate = data.dueDate instanceof Date && Number.isFinite(data.dueDate.getTime()) ? data.dueDate : null;

    const targetWorker = await this.prisma.staffWorker.findUnique({ where: { id: workerId }, select: { fullName: true } });
    const created = await this.prisma.task.create({
      data: {
        businessId,
        branchId,
        type: 'ASSIGNED',
        title,
        description,
        priority,
        dueDate,
        targetWorkerId: workerId,
        createdByUserId,
        createdByRole: normalizeRole(createdByRole),
      },
    });

    await this.logAudit(createdByUserId, normalizeRole(createdByRole), businessId, 'task_created', 'task', created.id, {
      taskType: 'ASSIGNED',
      title,
      targetWorkerId: workerId,
      targetWorkerName: targetWorker?.fullName ?? null,
      priority,
      dueDate: dueDate?.toISOString() ?? null,
    });

    return { id: created.id };
  }

  async listTasksForUser(
    user: { sub: string; businessId: string; branchId?: string | null; role: string; workerId?: string | null },
    opts: {
      period?: PeriodFilter;
      from?: string;
      to?: string;
      status?: 'pending' | 'completed' | 'overdue';
      type?: 'announcement' | 'assigned' | 'all';
      role?: string; // manager filter
      workerId?: string; // manager filter
    },
  ) {
    const role = normalizeRole(user.role);
    const branchId = String(user.branchId || 'main');
    const period = (opts.period || 'today') as PeriodFilter;
    const { from, to } = this.getRange(period, opts.from, opts.to);
    const now = new Date();

    const type = String(opts.type || 'all').toLowerCase();
    const status = String(opts.status || '').toLowerCase();

    const where: any = {
      businessId: user.businessId,
      branchId,
      createdAt: { gte: from, lte: to },
    };

    if (type === 'announcement') where.type = 'ANNOUNCEMENT';
    if (type === 'assigned') where.type = 'ASSIGNED';

    // Status filter
    if (status === 'completed') where.completedAt = { not: null };
    if (status === 'pending') {
      where.completedAt = null;
      // Exclude overdue: pending = not completed and (not assigned, or no due date, or due date in future)
      where.AND = [
        { OR: [{ type: { not: 'ASSIGNED' } }, { dueDate: null }, { dueDate: { gte: now } }] },
      ];
    }
    if (status === 'overdue') where.AND = [{ completedAt: null }, { dueDate: { not: null, lt: now } }, { type: 'ASSIGNED' }];

    // Manager view: can see all tasks and filter by role/worker
    if (role === 'MANAGER') {
      const filterRole = String(opts.role ?? '').trim().toUpperCase();
      const filterWorker = String(opts.workerId ?? '').trim();
      if (filterRole) where.targetRole = filterRole;
      if (filterWorker) where.targetWorkerId = filterWorker;
    } else {
      const workerId = String(user.workerId ?? '').trim();
      where.OR = [
        { isAllStaff: true },
        { targetRole: role },
        ...(workerId ? [{ targetWorkerId: workerId }] : []),
      ];
    }

    const include: any = {
      targetWorker: { select: { id: true, fullName: true, role: true } },
      completedByWorker: { select: { id: true, fullName: true } },
    };
    const myWorkerId = String(user.workerId ?? '').trim();
    if (role !== 'MANAGER' && myWorkerId) {
      include.reads = { where: { workerId: myWorkerId }, select: { readAt: true }, take: 1 };
    }

    const rows = await this.prisma.task.findMany({
      where,
      orderBy: [{ completedAt: 'asc' }, { createdAt: 'desc' }],
      take: 300,
      include,
    });

    return rows.map((t) => {
      const readAt = Array.isArray((t as any).reads) && (t as any).reads.length ? (t as any).reads[0].readAt : null;
      const s = this.statusOf({ type: t.type, dueDate: t.dueDate, completedAt: t.completedAt });
      const targetWorker = (t as any).targetWorker as { fullName?: string; role?: string } | null | undefined;
      const completedByWorker = (t as any).completedByWorker as { fullName?: string } | null | undefined;
      return {
        id: t.id,
        type: t.type as TaskType,
        title: t.title,
        description: t.description ?? '',
        priority: (t.priority ?? null) as TaskPriority | null,
        dueDate: t.dueDate ? t.dueDate.toISOString() : null,
        status: s,
        isRead: Boolean(readAt),
        readAt: readAt ? readAt.toISOString() : null,
        targetRole: t.targetRole,
        targetWorkerId: t.targetWorkerId,
        targetWorkerName: targetWorker?.fullName ?? null,
        targetWorkerRole: targetWorker?.role ?? null,
        isAllStaff: t.isAllStaff,
        createdByUserId: t.createdByUserId,
        createdByRole: t.createdByRole,
        createdAt: t.createdAt.toISOString(),
        completedAt: t.completedAt ? t.completedAt.toISOString() : null,
        completedByWorkerName: completedByWorker?.fullName ?? null,
        completionNote: t.completionNote ?? null,
      };
    });
  }

  async unreadCountForUser(user: { sub: string; businessId: string; branchId?: string | null; role: string; workerId?: string | null }) {
    const role = normalizeRole(user.role);
    if (role === 'MANAGER') return { unread: 0 };
    const workerId = String(user.workerId ?? '').trim();
    if (!workerId) return { unread: 0 };
    const branchId = String(user.branchId || 'main');
    const where: any = {
      businessId: user.businessId,
      branchId,
      completedAt: null,
      OR: [
        { isAllStaff: true },
        { targetRole: role },
        { targetWorkerId: workerId },
      ],
      reads: { none: { workerId } },
    };
    const unread = await this.prisma.task.count({ where });
    return { unread };
  }

  async markRead(user: { sub: string; businessId: string; branchId?: string | null; role: string; workerId?: string | null }, taskId: string) {
    const role = normalizeRole(user.role);
    if (role === 'MANAGER') return { success: true };
    const workerId = this.requireWorker(user);

    const task = await this.prisma.task.findFirst({
      where: { id: taskId, businessId: user.businessId, branchId: String(user.branchId || 'main') },
      select: { id: true, isAllStaff: true, targetRole: true, targetWorkerId: true },
    });
    if (!task) throw new NotFoundException('Task not found');

    const visible =
      task.isAllStaff ||
      (task.targetRole && String(task.targetRole).toUpperCase() === role) ||
      (task.targetWorkerId && task.targetWorkerId === workerId);
    if (!visible) throw new ForbiddenException('Not allowed');

    await this.prisma.taskRead.upsert({
      where: { taskId_workerId: { taskId: task.id, workerId } },
      create: {
        businessId: user.businessId,
        taskId: task.id,
        workerId,
        userId: user.sub,
      },
      update: {},
    });
    return { success: true };
  }

  async completeAssignedTask(
    user: { sub: string; businessId: string; branchId?: string | null; role: string; workerId?: string | null },
    taskId: string,
    note?: string,
  ) {
    const role = normalizeRole(user.role);
    if (role === 'MANAGER') throw new ForbiddenException('Managers do not complete tasks');
    const workerId = this.requireWorker(user);

    const task = await this.prisma.task.findFirst({
      where: { id: taskId, businessId: user.businessId, branchId: String(user.branchId || 'main') },
      select: { id: true, type: true, targetWorkerId: true, completedAt: true },
    });
    if (!task) throw new NotFoundException('Task not found');
    if (String(task.type || '').toUpperCase() !== 'ASSIGNED') throw new BadRequestException('Only assigned tasks can be completed');
    if (task.targetWorkerId !== workerId) throw new ForbiddenException('Not allowed');
    if (task.completedAt) return { success: true };

    const completionNote = String(note ?? '').trim() || null;
    const worker = await this.prisma.staffWorker.findUnique({ where: { id: workerId }, select: { fullName: true } });
    await this.prisma.$transaction(async (tx) => {
      await tx.task.update({
        where: { id: task.id },
        data: {
          completedAt: new Date(),
          completedByUserId: user.sub,
          completedByWorkerId: workerId,
          completionNote,
        },
      });
      await tx.taskRead.upsert({
        where: { taskId_workerId: { taskId: task.id, workerId } },
        create: {
          businessId: user.businessId,
          taskId: task.id,
          workerId,
          userId: user.sub,
        },
        update: {},
      });
    });

    await this.logAudit(
      user.sub,
      normalizeRole(user.role),
      user.businessId,
      'task_completed',
      'task',
      task.id,
      { completionNote },
      { workerId, workerName: worker?.fullName ?? '' },
    );

    return { success: true };
  }

  private async logAudit(
    userId: string,
    role: string,
    businessId: string,
    actionType: string,
    entityType: string,
    entityId: string,
    metadata?: object,
    worker?: { workerId: string; workerName: string },
  ) {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId,
          role,
          businessId,
          workerId: worker?.workerId ?? null,
          workerName: worker?.workerName ?? null,
          actionType,
          entityType,
          entityId,
          metadata: metadata ? JSON.stringify(metadata) : null,
        },
      });
    } catch {
      /* non-fatal */
    }
  }
}

