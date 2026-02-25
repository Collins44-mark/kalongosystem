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

    // Managers/admins do not use worker selector.
    if (role === 'MANAGER') {
      return {
        email: user.email,
        role,
        language: dbUser?.language ?? 'en',
        business: {
          id: business.id,
          name: business.name,
          code: business.businessId,
          type: business.businessType,
        },
        activeWorkerId: null,
        activeWorkerName: null,
        needsWorkerSelection: false,
        workers: [],
      };
    }

    const roleWorkers = await this.staffWorkers.getActiveByRole(user.businessId, role);
    const workers: { id: string; fullName: string }[] = roleWorkers.map((w) => ({ id: w.id, fullName: w.fullName }));

    let activeWorkerId = user.workerId ?? null;
    let activeWorkerName = user.workerName ?? null;

    // If workers exist but selected worker is missing/blocked, force reselection.
    const activeStillValid =
      !activeWorkerId ? false : roleWorkers.some((w) => w.id === activeWorkerId);
    if (workers.length > 0 && (!activeWorkerId || !activeStillValid)) {
      activeWorkerId = null;
      activeWorkerName = null;
    }
    const needsWorkerSelection = workers.length > 0 && !activeWorkerId;

    return {
      email: user.email,
      role,
      language: dbUser?.language ?? 'en',
      business: {
        id: business.id,
        name: business.name,
        code: business.businessId,
        type: business.businessType,
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
    // Legacy VAT settings (backward compatible)
    const vatEnabled = map['vat_enabled'] === true;
    const vatNameRaw = map['vat_name'];
    const vatName = typeof vatNameRaw === 'string' && vatNameRaw.trim() ? vatNameRaw.trim() : 'VAT';
    const vatRateRaw = map['vat_rate'];
    const vatRate =
      typeof vatRateRaw === 'number'
        ? vatRateRaw
        : typeof vatRateRaw === 'string'
          ? Number(vatRateRaw)
          : 0;
    const vatTypeRaw = map['vat_type'];
    const vatType = vatTypeRaw === 'inclusive' || vatTypeRaw === 'exclusive' ? vatTypeRaw : 'inclusive';
    const applyRooms = map['vat_apply_rooms'] !== false;
    const applyBar = map['vat_apply_bar'] !== false;
    const applyRestaurant = map['vat_apply_restaurant'] !== false;

    const taxesRaw = map['taxes'];
    const taxes = Array.isArray(taxesRaw) ? taxesRaw : null;

    const restaurantCanAddMenuItems = map['restaurant_canAddMenuItems'] === true;

    return {
      enableDragDropBooking: map['enableDragDropBooking'] === true,
      restaurant_canAddMenuItems: restaurantCanAddMenuItems,
      vat_enabled: vatEnabled,
      vat_name: vatName,
      vat_rate: isFinite(vatRate) ? vatRate : 0,
      vat_type: vatType,
      vat_apply_rooms: applyRooms,
      vat_apply_bar: applyBar,
      vat_apply_restaurant: applyRestaurant,
      taxes: taxes ?? [],
    };
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
