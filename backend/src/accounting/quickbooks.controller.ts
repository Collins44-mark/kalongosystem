import { Controller, Get, Post, Query, Res, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingService } from './accounting.service';

function requiredEnv(name: string) {
  const v = String(process.env[name] ?? '').trim();
  if (!v) throw new Error(`Missing environment variable: ${name}`);
  return v;
}

function hmacState(payload: string) {
  const secret = String(process.env.JWT_SECRET ?? '').trim();
  const key = secret || 'hms';
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const crypto = require('crypto');
  return crypto.createHmac('sha256', key).update(payload, 'utf8').digest('hex');
}

function encodeState(obj: any) {
  const payload = Buffer.from(JSON.stringify(obj), 'utf8').toString('base64url');
  const sig = hmacState(payload);
  return `${payload}.${sig}`;
}

function decodeState(state: string) {
  const raw = String(state ?? '').trim();
  const [payload, sig] = raw.split('.');
  if (!payload || !sig) return null;
  if (hmacState(payload) !== sig) return null;
  try {
    const json = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return json;
  } catch {
    return null;
  }
}

function frontendSettingsUrl(q: 'connected' | 'error') {
  const base =
    String(process.env.FRONTEND_URL ?? '').trim() ||
    'https://kalongosystem.onrender.com';
  const safeBase = base.replace(/\/$/, '');
  return `${safeBase}/settings?quickbooks=${q}`;
}

@Controller('api/quickbooks')
export class QuickBooksController {
  constructor(
    private prisma: PrismaService,
    private accounting: AccountingService,
  ) {}

  // Used by Settings UI to start OAuth (frontend redirects to returned URL)
  @Get('connect')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MANAGER', 'ADMIN', 'OWNER')
  async connect(@CurrentUser() user: any) {
    const clientId = requiredEnv('QUICKBOOKS_CLIENT_ID');
    const redirectUri = requiredEnv('QUICKBOOKS_REDIRECT_URI');

    const state = encodeState({
      companyId: user.businessId,
      ts: Date.now(),
      v: 1,
    });

    const qs = new URLSearchParams();
    qs.set('client_id', clientId);
    qs.set('scope', 'com.intuit.quickbooks.accounting');
    qs.set('redirect_uri', redirectUri);
    qs.set('response_type', 'code');
    qs.set('state', state);

    const url = `https://appcenter.intuit.com/connect/oauth2?${qs.toString()}`;
    return { url };
  }

  // Intuit redirects here: must be public; uses signed state to map to company
  @Get('callback')
  async callback(
    @Res() res: any,
    @Query('code') code?: string,
    @Query('realmId') realmId?: string,
    @Query('state') state?: string,
    @Query('error') err?: string,
    @Query('error_description') errDesc?: string,
  ) {
    const error = String(err ?? '').trim();
    const errorDescription = String(errDesc ?? '').trim();
    if (error) {
      console.error('QuickBooks OAuth error:', { error, errorDescription });
      return res.redirect(frontendSettingsUrl('error'));
    }

    const st = decodeState(String(state ?? ''));
    const companyId = String(st?.companyId ?? '').trim();
    const ts = Number(st?.ts ?? 0);
    if (!companyId || !Number.isFinite(ts) || Date.now() - ts > 15 * 60_000) {
      return res.redirect(frontendSettingsUrl('error'));
    }

    const authCode = String(code ?? '').trim();
    const realm = String(realmId ?? '').trim();
    if (!authCode) {
      return res.redirect(frontendSettingsUrl('error'));
    }
    if (!realm) {
      return res.redirect(frontendSettingsUrl('error'));
    }

    try {
      const clientId = requiredEnv('QUICKBOOKS_CLIENT_ID');
      const clientSecret = requiredEnv('QUICKBOOKS_CLIENT_SECRET');
      const redirectUri = requiredEnv('QUICKBOOKS_REDIRECT_URI');

      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const axios = require('axios');

      const body = new URLSearchParams();
      body.set('grant_type', 'authorization_code');
      body.set('code', authCode);
      body.set('redirect_uri', redirectUri);

      const auth = Buffer.from(`${clientId}:${clientSecret}`, 'utf8').toString('base64');
      const tokenRes = await axios.post(
        'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
        body.toString(),
        {
          headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
          },
          timeout: 20000,
        },
      );

      const t = tokenRes?.data ?? {};
      const accessToken = String(t.access_token ?? '').trim();
      const refreshToken = String(t.refresh_token ?? '').trim();
      const expiresInSec = Math.max(1, Number(t.expires_in ?? 3600) || 3600);
      const expiresAt = new Date(Date.now() + expiresInSec * 1000);

      if (!accessToken || !refreshToken) {
        return { success: false, message: 'QuickBooks token exchange failed.' };
      }

      await this.prisma.$transaction(async (tx) => {
        await tx.quickbooksToken.upsert({
          where: { companyId },
          create: { companyId, accessToken, refreshToken, expiresAt },
          update: { accessToken, refreshToken, expiresAt },
        });
        await tx.business.update({
          where: { id: companyId },
          data: { quickbooksConnected: true, quickbooksRealmId: realm },
        });
      });

      // No token console logging (security rule)
      return res.redirect(frontendSettingsUrl('connected'));
    } catch (e: any) {
      const status = e?.response?.status;
      const data = e?.response?.data;
      // Avoid tokens in logs; OK to log high-level failure
      console.error('QuickBooks OAuth callback failed:', status || e?.message || e);
      if (data?.error) {
        console.error('QuickBooks OAuth error:', { error: data?.error, error_description: data?.error_description });
      }
      return res.redirect(frontendSettingsUrl('error'));
    }
  }

  @Get('status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MANAGER', 'ADMIN', 'OWNER')
  async status(@CurrentUser('businessId') companyId: string) {
    return this.accounting.getQuickBooksStatus(companyId);
  }

  @Post('disconnect')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MANAGER', 'ADMIN', 'OWNER')
  async disconnect(@CurrentUser('businessId') companyId: string) {
    return this.accounting.disconnectQuickBooks(companyId);
  }
}

