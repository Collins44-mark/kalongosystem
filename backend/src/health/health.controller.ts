import { Controller, Get, Head } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Controller()
export class RootController {
  @Get()
  ok() {
    return { status: 'ok' };
  }

  @Head()
  headOk() {
    return;
  }
}

@Controller('health')
export class HealthController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async check() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', db: 'connected' };
    } catch (e) {
      return {
        status: 'error',
        db: 'disconnected',
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }
}
