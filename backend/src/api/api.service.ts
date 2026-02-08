import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StaffWorkersService } from '../staff-workers/staff-workers.service';

@Injectable()
export class ApiService {
  constructor(
    private prisma: PrismaService,
    private staffWorkers: StaffWorkersService,
  ) {}

  async getMe(user: { sub: string; email: string; businessId: string; role: string; businessCode?: string; workerId?: string | null; workerName?: string | null }) {
    if (!user.businessId) throw new UnauthorizedException('No business context');

    const [business, dbUser] = await Promise.all([
      this.prisma.business.findUnique({ where: { id: user.businessId } }),
      this.prisma.user.findUnique({
        where: { id: user.sub },
        select: { language: true },
      }),
    ]);
    if (!business) throw new UnauthorizedException('Business not found');

    const role = ['ADMIN', 'OWNER'].includes(user.role || '') ? 'MANAGER' : user.role;

    const activeWorkerId = user.workerId ?? null;
    const activeWorkerName = user.workerName ?? null;
    let needsWorkerSelection = false;
    let workers: { id: string; fullName: string }[] = [];

    if (!activeWorkerId) {
      const roleWorkers = await this.staffWorkers.getActiveByRole(user.businessId, role);
      if (roleWorkers.length > 0) {
        needsWorkerSelection = true;
        workers = roleWorkers.map((w) => ({ id: w.id, fullName: w.fullName }));
      }
    }

    return {
      email: user.email,
      role,
      language: dbUser?.language ?? 'en',
      business: {
        id: business.id,
        name: business.name,
        code: business.businessId,
      },
      activeWorkerId,
      activeWorkerName,
      needsWorkerSelection,
      workers,
    };
  }

  async updateLanguage(userId: string, language: string) {
    const valid = ['en', 'sw'];
    if (!valid.includes(language)) throw new BadRequestException('Invalid language');
    await this.prisma.user.update({
      where: { id: userId },
      data: { language },
    });
    return { language };
  }

  /** Get business settings (e.g. enableDragDropBooking) */
  async getSettings(businessId: string) {
    const settings = await this.prisma.businessSetting.findMany({
      where: { businessId },
    });
    const map: Record<string, unknown> = {};
    for (const s of settings) {
      try {
        map[s.key] = s.value === 'true' ? true : s.value === 'false' ? false : JSON.parse(s.value);
      } catch {
        map[s.key] = s.value;
      }
    }
    return { enableDragDropBooking: map['enableDragDropBooking'] === true };
  }

  /** Update business setting (MANAGER only) */
  async updateSetting(businessId: string, key: string, value: unknown) {
    const str = typeof value === 'boolean' ? String(value) : JSON.stringify(value);
    const existing = await this.prisma.businessSetting.findFirst({
      where: { businessId, key },
    });
    if (existing) {
      await this.prisma.businessSetting.update({
        where: { id: existing.id },
        data: { value: str },
      });
    } else {
      await this.prisma.businessSetting.create({
        data: { businessId, key, value: str },
      });
    }
    return { [key]: value };
  }
}
