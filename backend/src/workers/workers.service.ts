import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class WorkersService {
  constructor(private prisma: PrismaService) {}

  async getWorkers(businessId: string, branchId: string) {
    return this.prisma.worker.findMany({
      where: { businessId, branchId },
      orderBy: { name: 'asc' },
    });
  }

  async createWorker(
    businessId: string,
    branchId: string,
    data: {
      name: string;
      sector: string;
      role: string;
      monthlySalary: number;
    },
    createdBy: string,
  ) {
    return this.prisma.worker.create({
      data: {
        businessId,
        branchId,
        name: data.name,
        sector: data.sector,
        role: data.role,
        monthlySalary: new Decimal(data.monthlySalary),
        createdBy,
      },
    });
  }

  async getPayroll(businessId: string, month: number, year: number) {
    const workers = await this.prisma.worker.findMany({
      where: { businessId },
    });

    const records = await this.prisma.payrollRecord.findMany({
      where: { businessId, month, year },
    });

    const payrollList = workers.map((w) => {
      const existing = records.find((r) => r.workerId === w.id);
      return {
        workerId: w.id,
        workerName: w.name,
        sector: w.sector,
        amount: Number(w.monthlySalary),
        status: existing?.status ?? 'PENDING',
        recordId: existing?.id,
      };
    });

    const total = payrollList.reduce((s, p) => s + p.amount, 0);
    return { payroll: payrollList, total };
  }

  async markPaid(businessId: string, workerId: string, month: number, year: number, createdBy: string) {
    const worker = await this.prisma.worker.findFirst({
      where: { id: workerId, businessId },
    });
    if (!worker) throw new NotFoundException('Worker not found');

    const existing = await this.prisma.payrollRecord.findFirst({
      where: { businessId, workerId, month, year },
    });

    if (existing) {
      return this.prisma.payrollRecord.update({
        where: { id: existing.id },
        data: { status: 'PAID', paidAt: new Date(), createdBy },
      });
    }

    return this.prisma.payrollRecord.create({
      data: {
        businessId,
        branchId: 'main',
        workerId,
        month,
        year,
        amount: worker.monthlySalary,
        status: 'PAID',
        paidAt: new Date(),
        createdBy,
      },
    });
  }
}
