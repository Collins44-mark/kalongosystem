import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';

type SyncEntityType = 'BOOKING' | 'PAYMENT' | 'BAR_SALE' | 'EXPENSE' | 'OTHER_REVENUE';
type SyncStatus = 'SUCCESS' | 'FAILED';

@Injectable()
export class AccountingService {
  constructor(private prisma: PrismaService) {}

  private qbEnv(): 'sandbox' | 'production' {
    const raw = String(process.env.QUICKBOOKS_ENV ?? '').trim().toLowerCase();
    return raw === 'production' ? 'production' : 'sandbox';
  }

  private qbApiBase(): string {
    return this.qbEnv() === 'production'
      ? 'https://quickbooks.api.intuit.com'
      : 'https://sandbox-quickbooks.api.intuit.com';
  }

  private async logSync(companyId: string, entityType: SyncEntityType, entityId: string, status: SyncStatus, errorMessage?: string | null) {
    try {
      await this.prisma.syncLog.create({
        data: {
          companyId,
          entityType,
          entityId,
          status,
          errorMessage: errorMessage ? String(errorMessage).slice(0, 4000) : null,
        },
      });
    } catch {
      // Never break HMS
    }
  }

  private async qbGet(companyId: string, path: string) {
    const ctx = await this.getConnectedContext(companyId);
    if (!ctx) return null;
    const url = `${this.qbApiBase()}${path}`;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const axios = require('axios');
    return await axios.get(url, {
      headers: {
        Authorization: `Bearer ${ctx.accessToken}`,
        Accept: 'application/json',
      },
      timeout: 20000,
    });
  }

  async getQuickBooksStatus(companyId: string) {
    const b = await this.prisma.business.findUnique({
      where: { id: companyId },
      select: { quickbooksConnected: true, quickbooksRealmId: true },
    });
    const last = await this.prisma.syncLog.findFirst({
      where: { companyId, status: 'SUCCESS' },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    let companyName: string | null = null;
    try {
      if (b?.quickbooksConnected === true && b.quickbooksRealmId) {
        const realmId = String(b.quickbooksRealmId ?? '').trim();
        if (realmId) {
          const res = await this.qbGet(companyId, `/v3/company/${encodeURIComponent(realmId)}/companyinfo/${encodeURIComponent(realmId)}?minorversion=65`);
          const name = String(res?.data?.CompanyInfo?.CompanyName ?? '').trim();
          companyName = name || null;
        }
      }
    } catch {
      companyName = null;
    }
    return {
      connected: b?.quickbooksConnected === true,
      realmId: b?.quickbooksRealmId ?? null,
      companyName,
      lastSyncAt: last?.createdAt ?? null,
    };
  }

  async disconnectQuickBooks(companyId: string) {
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.business.update({
          where: { id: companyId },
          data: { quickbooksConnected: false, quickbooksRealmId: null },
        });
        await tx.quickbooksToken.deleteMany({ where: { companyId } });
      });
    } catch {
      // Non-fatal
    }
    return { success: true };
  }

  private async getConnectedContext(companyId: string): Promise<{ realmId: string; accessToken: string } | null> {
    try {
      const b = await this.prisma.business.findUnique({
        where: { id: companyId },
        select: { quickbooksConnected: true, quickbooksRealmId: true },
      });
      if (!b?.quickbooksConnected) return null;
      const realmId = String(b.quickbooksRealmId ?? '').trim();
      if (!realmId) return null;

      let t = await this.prisma.quickbooksToken.findUnique({
        where: { companyId },
        select: { accessToken: true, refreshToken: true, expiresAt: true },
      });
      if (!t) return null;

      const expiresAt = new Date(t.expiresAt);
      const now = Date.now();
      if (expiresAt.getTime() - now < 60_000) {
        // refresh
        const refreshed = await this.refreshToken(companyId, t.refreshToken);
        t = refreshed ?? t;
      }

      const accessToken = String(t.accessToken ?? '').trim();
      if (!accessToken) return null;
      return { realmId, accessToken };
    } catch {
      return null;
    }
  }

  private async refreshToken(companyId: string, refreshToken: string) {
    try {
      const clientId = String(process.env.QUICKBOOKS_CLIENT_ID ?? '').trim();
      const clientSecret = String(process.env.QUICKBOOKS_CLIENT_SECRET ?? '').trim();
      if (!clientId || !clientSecret) return null;

      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const axios = require('axios');

      const body = new URLSearchParams();
      body.set('grant_type', 'refresh_token');
      body.set('refresh_token', String(refreshToken ?? '').trim());

      const auth = Buffer.from(`${clientId}:${clientSecret}`, 'utf8').toString('base64');
      const res = await axios.post('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', body.toString(), {
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        timeout: 20000,
      });

      const data = res?.data ?? {};
      const access = String(data.access_token ?? '').trim();
      const refresh = String(data.refresh_token ?? '').trim() || String(refreshToken ?? '').trim();
      const expiresInSec = Math.max(1, Number(data.expires_in ?? 3600) || 3600);
      const expiresAt = new Date(Date.now() + expiresInSec * 1000);

      if (!access) return null;

      const saved = await this.prisma.quickbooksToken.upsert({
        where: { companyId },
        create: {
          companyId,
          accessToken: access,
          refreshToken: refresh,
          expiresAt,
        },
        update: {
          accessToken: access,
          refreshToken: refresh,
          expiresAt,
        },
        select: { accessToken: true, refreshToken: true, expiresAt: true },
      });
      return saved;
    } catch {
      return null;
    }
  }

  private async qbPost(companyId: string, path: string, body: any) {
    const ctx = await this.getConnectedContext(companyId);
    if (!ctx) return null;

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const axios = require('axios');
    const url = `${this.qbApiBase()}${path}`;
    const res = await axios.post(url, body, {
      headers: {
        Authorization: `Bearer ${ctx.accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 20000,
    });
    return { realmId: ctx.realmId, data: res?.data };
  }

  private async qbQuery(companyId: string, query: string) {
    const ctx = await this.getConnectedContext(companyId);
    if (!ctx) return null;

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const axios = require('axios');
    const qs = new URLSearchParams();
    qs.set('query', query);
    qs.set('minorversion', '65');
    const url = `${this.qbApiBase()}/v3/company/${encodeURIComponent(ctx.realmId)}/query?${qs.toString()}`;
    const res = await axios.get(url, {
      headers: { Authorization: `Bearer ${ctx.accessToken}`, Accept: 'application/json' },
      timeout: 20000,
    });
    return { realmId: ctx.realmId, data: res?.data };
  }

  private async ensureCustomer(companyId: string, displayName: string): Promise<string | null> {
    const name = String(displayName ?? '').trim();
    if (!name) return null;
    try {
      const q = await this.qbQuery(companyId, `select Id, DisplayName from Customer where DisplayName = '${name.replace(/'/g, "\\'")}' maxresults 1`);
      const existing = q?.data?.QueryResponse?.Customer?.[0];
      if (existing?.Id) return String(existing.Id);

      const created = await this.qbPost(companyId, `/v3/company/${(await this.getConnectedContext(companyId))?.realmId}/customer?minorversion=65`, {
        DisplayName: name,
      });
      const id = created?.data?.Customer?.Id;
      return id ? String(id) : null;
    } catch {
      return null;
    }
  }

  private async ensureVendor(companyId: string, displayName: string): Promise<string | null> {
    const name = String(displayName ?? '').trim();
    if (!name) return null;
    try {
      const q = await this.qbQuery(companyId, `select Id, DisplayName from Vendor where DisplayName = '${name.replace(/'/g, "\\'")}' maxresults 1`);
      const existing = q?.data?.QueryResponse?.Vendor?.[0];
      if (existing?.Id) return String(existing.Id);

      const created = await this.qbPost(companyId, `/v3/company/${(await this.getConnectedContext(companyId))?.realmId}/vendor?minorversion=65`, {
        DisplayName: name,
      });
      const id = created?.data?.Vendor?.Id;
      return id ? String(id) : null;
    } catch {
      return null;
    }
  }

  private async pickAccountId(companyId: string, accountType: string, preferredNames: string[]): Promise<string | null> {
    try {
      const q = await this.qbQuery(companyId, `select Id, Name, AccountType from Account where AccountType = '${accountType}' maxresults 50`);
      const accounts: any[] = q?.data?.QueryResponse?.Account ?? [];
      const byName = new Map(accounts.map((a) => [String(a?.Name ?? '').toLowerCase(), a]));
      for (const n of preferredNames) {
        const a = byName.get(String(n).toLowerCase());
        if (a?.Id) return String(a.Id);
      }
      const first = accounts.find((a) => a?.Id);
      return first?.Id ? String(first.Id) : null;
    } catch {
      return null;
    }
  }

  private async ensureSalesItem(companyId: string): Promise<string | null> {
    try {
      const q = await this.qbQuery(companyId, `select Id, Name from Item where Name = 'HMS Sales' maxresults 1`);
      const existing = q?.data?.QueryResponse?.Item?.[0];
      if (existing?.Id) return String(existing.Id);

      const incomeAccountId = await this.pickAccountId(companyId, 'Income', ['Sales of Product Income', 'Sales']);
      if (!incomeAccountId) return null;

      const ctx = await this.getConnectedContext(companyId);
      if (!ctx) return null;
      const created = await this.qbPost(companyId, `/v3/company/${ctx.realmId}/item?minorversion=65`, {
        Name: 'HMS Sales',
        Type: 'Service',
        IncomeAccountRef: { value: incomeAccountId },
      });
      const id = created?.data?.Item?.Id;
      return id ? String(id) : null;
    } catch {
      return null;
    }
  }

  private async ensureOtherRevenueItem(
    companyId: string,
    categoryName: string,
    linkedIncomeAccountId?: string | null,
  ): Promise<string | null> {
    const nm = String(categoryName ?? '').trim();
    if (!nm) return this.ensureSalesItem(companyId);
    const itemName = `HMS Other Revenue - ${nm}`.slice(0, 100);
    try {
      const q = await this.qbQuery(companyId, `select Id, Name from Item where Name = '${itemName.replace(/'/g, "\\'")}' maxresults 1`);
      const existing = q?.data?.QueryResponse?.Item?.[0];
      if (existing?.Id) return String(existing.Id);

      const incomeAccountId =
        (String(linkedIncomeAccountId ?? '').trim() || null) ??
        (await this.pickAccountId(companyId, 'Income', ['Sales of Product Income', 'Sales']));
      if (!incomeAccountId) return null;

      const ctx = await this.getConnectedContext(companyId);
      if (!ctx) return null;

      const created = await this.qbPost(companyId, `/v3/company/${ctx.realmId}/item?minorversion=65`, {
        Name: itemName,
        Type: 'Service',
        IncomeAccountRef: { value: incomeAccountId },
      });
      const id = created?.data?.Item?.Id;
      return id ? String(id) : null;
    } catch {
      return null;
    }
  }

  async syncBookingCreated(companyId: string, bookingId: string) {
    try {
      const ctx = await this.getConnectedContext(companyId);
      if (!ctx) return;

      const b = await this.prisma.booking.findFirst({
        where: { id: bookingId, businessId: companyId },
        select: { id: true, guestName: true, totalAmount: true, createdAt: true, quickbooksInvoiceId: true },
      });
      if (!b) return;
      if (b.quickbooksInvoiceId) return;

      const customerId = await this.ensureCustomer(companyId, b.guestName);
      const itemId = await this.ensureSalesItem(companyId);
      if (!customerId || !itemId) {
        await this.logSync(companyId, 'BOOKING', bookingId, 'FAILED', 'Missing QuickBooks customer/item for invoice');
        return;
      }

      const amount = Number(b.totalAmount ?? 0);
      const invoiceRes = await this.qbPost(companyId, `/v3/company/${ctx.realmId}/invoice?minorversion=65`, {
        CustomerRef: { value: customerId },
        TxnDate: new Date(b.createdAt).toISOString().slice(0, 10),
        Line: [
          {
            Amount: Math.max(0, Math.round(amount * 100) / 100),
            DetailType: 'SalesItemLineDetail',
            Description: `HMS Booking ${b.id}`,
            SalesItemLineDetail: {
              ItemRef: { value: itemId },
              Qty: 1,
              UnitPrice: Math.max(0, Math.round(amount * 100) / 100),
            },
          },
        ],
      });
      const invoiceId = invoiceRes?.data?.Invoice?.Id;
      if (!invoiceId) {
        await this.logSync(companyId, 'BOOKING', bookingId, 'FAILED', 'QuickBooks invoice creation failed');
        return;
      }

      await this.prisma.booking.update({
        where: { id: bookingId },
        data: { quickbooksInvoiceId: String(invoiceId) },
      });

      await this.logSync(companyId, 'BOOKING', bookingId, 'SUCCESS', null);
    } catch (e: any) {
      await this.logSync(companyId, 'BOOKING', bookingId, 'FAILED', e?.message || 'Booking sync failed');
    }
  }

  async syncFolioPayment(companyId: string, paymentId: string) {
    try {
      const ctx = await this.getConnectedContext(companyId);
      if (!ctx) return;

      const p = await this.prisma.folioPayment.findFirst({
        where: { id: paymentId },
        select: { id: true, amount: true, bookingId: true, createdAt: true },
      });
      if (!p) return;
      const b = await this.prisma.booking.findFirst({
        where: { id: p.bookingId, businessId: companyId },
        select: { id: true, guestName: true, quickbooksInvoiceId: true, createdAt: true, totalAmount: true },
      });
      if (!b) return;

      if (!b.quickbooksInvoiceId) {
        await this.syncBookingCreated(companyId, b.id);
      }
      const updated = await this.prisma.booking.findUnique({ where: { id: b.id }, select: { quickbooksInvoiceId: true } });
      const invoiceId = String(updated?.quickbooksInvoiceId ?? '').trim();
      if (!invoiceId) {
        await this.logSync(companyId, 'PAYMENT', paymentId, 'FAILED', 'Missing QuickBooks invoice id for payment');
        return;
      }

      const customerId = await this.ensureCustomer(companyId, b.guestName);
      if (!customerId) {
        await this.logSync(companyId, 'PAYMENT', paymentId, 'FAILED', 'Missing QuickBooks customer for payment');
        return;
      }

      const undepositedFundsId =
        (await this.pickAccountId(companyId, 'Other Current Asset', ['Undeposited Funds'])) ||
        (await this.pickAccountId(companyId, 'Bank', ['Cash on hand', 'Cash']));

      const amt = Number(p.amount ?? 0);
      await this.qbPost(companyId, `/v3/company/${ctx.realmId}/payment?minorversion=65`, {
        CustomerRef: { value: customerId },
        TotalAmt: Math.max(0, Math.round(amt * 100) / 100),
        TxnDate: new Date(p.createdAt).toISOString().slice(0, 10),
        DepositToAccountRef: undepositedFundsId ? { value: undepositedFundsId } : undefined,
        Line: [
          {
            Amount: Math.max(0, Math.round(amt * 100) / 100),
            LinkedTxn: [{ TxnId: invoiceId, TxnType: 'Invoice' }],
          },
        ],
      });

      await this.logSync(companyId, 'PAYMENT', paymentId, 'SUCCESS', null);
    } catch (e: any) {
      await this.logSync(companyId, 'PAYMENT', paymentId, 'FAILED', e?.message || 'Payment sync failed');
    }
  }

  async syncBarSale(companyId: string, barOrderId: string) {
    try {
      const ctx = await this.getConnectedContext(companyId);
      if (!ctx) return;

      const o = await this.prisma.barOrder.findFirst({
        where: { id: barOrderId, businessId: companyId },
        select: { id: true, customerName: true, totalAmount: true, createdAt: true },
      });
      if (!o) return;

      const customerName = String(o.customerName ?? '').trim() || 'Bar Walk-in Customer';
      const customerId = await this.ensureCustomer(companyId, customerName);
      const itemId = await this.ensureSalesItem(companyId);
      if (!customerId || !itemId) {
        await this.logSync(companyId, 'BAR_SALE', barOrderId, 'FAILED', 'Missing QuickBooks customer/item for sales receipt');
        return;
      }
      const amount = Number(o.totalAmount ?? 0);
      await this.qbPost(companyId, `/v3/company/${ctx.realmId}/salesreceipt?minorversion=65`, {
        CustomerRef: { value: customerId },
        TxnDate: new Date(o.createdAt).toISOString().slice(0, 10),
        Line: [
          {
            Amount: Math.max(0, Math.round(amount * 100) / 100),
            DetailType: 'SalesItemLineDetail',
            Description: `HMS Bar Sale ${o.id}`,
            SalesItemLineDetail: {
              ItemRef: { value: itemId },
              Qty: 1,
              UnitPrice: Math.max(0, Math.round(amount * 100) / 100),
            },
          },
        ],
      });

      await this.logSync(companyId, 'BAR_SALE', barOrderId, 'SUCCESS', null);
    } catch (e: any) {
      await this.logSync(companyId, 'BAR_SALE', barOrderId, 'FAILED', e?.message || 'Bar sale sync failed');
    }
  }

  async syncExpense(companyId: string, expenseId: string) {
    try {
      const ctx = await this.getConnectedContext(companyId);
      if (!ctx) return;

      const e = await this.prisma.expense.findFirst({
        where: { id: expenseId, businessId: companyId },
        select: { id: true, category: true, description: true, amount: true, expenseDate: true },
      });
      if (!e) return;

      const vendorName = String(e.category ?? '').trim() || 'HMS Vendor';
      const vendorId = await this.ensureVendor(companyId, vendorName);
      const expenseAccountId = await this.pickAccountId(companyId, 'Expense', ['Supplies', 'Utilities', 'Maintenance', 'Other']);
      if (!vendorId || !expenseAccountId) {
        await this.logSync(companyId, 'EXPENSE', expenseId, 'FAILED', 'Missing QuickBooks vendor/expense account for bill');
        return;
      }
      const amount = Number(e.amount ?? 0);
      await this.qbPost(companyId, `/v3/company/${ctx.realmId}/bill?minorversion=65`, {
        VendorRef: { value: vendorId },
        TxnDate: new Date(e.expenseDate).toISOString().slice(0, 10),
        Line: [
          {
            Amount: Math.max(0, Math.round(amount * 100) / 100),
            DetailType: 'AccountBasedExpenseLineDetail',
            Description: String(e.description ?? '') || `HMS Expense ${e.id}`,
            AccountBasedExpenseLineDetail: {
              AccountRef: { value: expenseAccountId },
            },
          },
        ],
      });

      await this.logSync(companyId, 'EXPENSE', expenseId, 'SUCCESS', null);
    } catch (e: any) {
      await this.logSync(companyId, 'EXPENSE', expenseId, 'FAILED', e?.message || 'Expense sync failed');
    }
  }

  async syncOtherRevenue(companyId: string, otherRevenueId: string) {
    try {
      const ctx = await this.getConnectedContext(companyId);
      if (!ctx) return;

      const already = await this.prisma.syncLog.findFirst({
        where: { companyId, entityType: 'OTHER_REVENUE', entityId: otherRevenueId, status: 'SUCCESS' },
        select: { id: true },
      });
      if (already?.id) return;

      const r = await this.prisma.otherRevenue.findFirst({
        where: { id: otherRevenueId, companyId },
        include: { category: true, booking: { select: { id: true, guestName: true } } },
      });
      if (!r) return;

      const categoryName = String(r.category?.name ?? '').trim() || 'Other Revenue';
      const customerName =
        (r.booking?.guestName ? String(r.booking.guestName).trim() : '') ||
        'Other Revenue Customer';

      const customerId = await this.ensureCustomer(companyId, customerName);
      const itemId = await this.ensureOtherRevenueItem(companyId, categoryName, r.category?.linkedQuickBooksAccountId ?? null);
      if (!customerId || !itemId) {
        await this.logSync(companyId, 'OTHER_REVENUE', otherRevenueId, 'FAILED', 'Missing QuickBooks customer/item for sales receipt');
        return;
      }

      const amount = Number(r.amount ?? 0);
      const descParts = [
        `HMS Other Revenue`,
        categoryName ? `(${categoryName})` : '',
        r.bookingId ? `Booking ${r.bookingId}` : '',
      ].filter(Boolean);
      const description = String(r.description ?? '').trim() || descParts.join(' ');

      await this.qbPost(companyId, `/v3/company/${ctx.realmId}/salesreceipt?minorversion=65`, {
        CustomerRef: { value: customerId },
        TxnDate: new Date(r.date).toISOString().slice(0, 10),
        Line: [
          {
            Amount: Math.max(0, Math.round(amount * 100) / 100),
            DetailType: 'SalesItemLineDetail',
            Description: description,
            SalesItemLineDetail: {
              ItemRef: { value: itemId },
              Qty: 1,
              UnitPrice: Math.max(0, Math.round(amount * 100) / 100),
            },
          },
        ],
      });

      await this.logSync(companyId, 'OTHER_REVENUE', otherRevenueId, 'SUCCESS', null);
    } catch (e: any) {
      await this.logSync(companyId, 'OTHER_REVENUE', otherRevenueId, 'FAILED', e?.message || 'Other revenue sync failed');
    }
  }
}

