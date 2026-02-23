import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AccountingService } from './accounting.service';
import { QuickBooksController } from './quickbooks.controller';

@Module({
  imports: [PrismaModule],
  controllers: [QuickBooksController],
  providers: [AccountingService],
  exports: [AccountingService],
})
export class AccountingModule {}

