import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { BusinessService } from './business.service';
import { AuthService } from '../auth/auth.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { FileInterceptor } from '@nestjs/platform-express';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { join } from 'path';
import * as crypto from 'crypto';
import { stat } from 'fs/promises';

async function sanitizeLocalLogoUrl(
  businessId: string,
  logoUrl: string | null,
  updateLogoUrl: (id: string, url: string | null) => Promise<any>,
): Promise<string | null> {
  const url = String(logoUrl ?? '').trim();
  if (!url) return null;
  if (!url.startsWith('/uploads/business-logos/')) return url;

  const dir = join(process.cwd(), 'uploads', 'business-logos');
  const name = url.replace('/uploads/business-logos/', '').trim();
  if (!name) return null;

  try {
    const p = join(dir, name);
    await stat(p);
    return url;
  } catch {
    // File is missing: clear DB best-effort so UI stops requesting dead URLs
    try { await updateLogoUrl(businessId, null); } catch {}
    return null;
  }
}

class RegisterBusinessDto {
  @IsString()
  @IsIn(['HOTEL', 'LODGE', 'BAR', 'RESTAURANT'])
  businessType: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  location?: string;

  @IsString()
  @IsOptional()
  phone?: string;
}

@Controller('business')
export class BusinessController {
  constructor(
    private business: BusinessService,
    private auth: AuthService,
  ) {}

  @Post('register')
  @UseGuards(JwtAuthGuard)
  async register(
    @CurrentUser('sub') userId: string,
    @Body() dto: RegisterBusinessDto,
  ) {
    const result = await this.business.create({
      userId,
      businessType: dto.businessType,
      name: dto.name,
      location: dto.location,
      phone: dto.phone,
    });

    const bu = result.businessUser!;
    const token = this.auth.createTokenForBusinessUser(
      { userId: bu.userId, businessId: bu.businessId, role: bu.role, branchId: bu.branchId },
      { email: bu.user.email },
      result.business.businessId,
    );

    return {
      ...result,
      accessToken: token,
      user: {
        id: bu.userId,
        email: bu.user.email,
        businessId: result.business.businessId,
        role: bu.role,
      },
    };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getCurrentBusiness(@CurrentUser('businessId') businessId: string) {
    return this.business.getById(businessId);
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  async profile(@CurrentUser('businessId') businessId: string) {
    const b: any = await this.business.getById(businessId);
    const safeLogo = await sanitizeLocalLogoUrl(businessId, b.logoUrl ?? null, (id, url) => this.business.updateLogoUrl(id, url));
    return {
      ...b,
      logo_url: safeLogo,
    };
  }

  @Post('upload-logo')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MANAGER', 'ADMIN')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 2 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const ok = ['image/png', 'image/jpeg', 'image/jpg'].includes(String(file?.mimetype || '').toLowerCase());
        if (!ok) return cb(new BadRequestException('Only PNG/JPG/JPEG images are allowed') as any, false);
        cb(null, true);
      },
    }),
  )
  async uploadLogo(
    @CurrentUser('businessId') businessId: string,
    @UploadedFile() file: any,
    @Req() req: any,
  ) {
    if (!file) throw new BadRequestException('Logo file is required');
    const mime = String(file.mimetype || '').toLowerCase();
    if (!['image/png', 'image/jpeg', 'image/jpg'].includes(mime)) {
      throw new BadRequestException('Only PNG/JPG/JPEG images are allowed');
    }

    // Load current logo to replace it after saving new one
    const current: any = await this.business.getById(businessId);
    const currentUrl = String(current?.logoUrl ?? '').trim();

    // Resize & compress (max width 300px)
    let ext: 'png' | 'jpg' = mime === 'image/png' ? 'png' : 'jpg';
    let out: Buffer;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const sharp = require('sharp');
      const pipeline = sharp(file.buffer).rotate().resize({ width: 300, withoutEnlargement: true });
      out =
        ext === 'png'
          ? await pipeline.png({ compressionLevel: 9 }).toBuffer()
          : await pipeline.jpeg({ quality: 80, mozjpeg: true }).toBuffer();
    } catch {
      throw new BadRequestException('Invalid image file');
    }

    const dir = join(process.cwd(), 'uploads', 'business-logos');
    await mkdir(dir, { recursive: true });

    const filename = `${businessId}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
    const absPath = join(dir, filename);
    await writeFile(absPath, out);

    const publicUrl = `/uploads/business-logos/${filename}`;
    await this.business.updateLogoUrl(businessId, publicUrl);

    // Delete old file (best-effort) if it was stored locally
    if (currentUrl.startsWith('/uploads/business-logos/')) {
      const oldName = currentUrl.replace('/uploads/business-logos/', '').trim();
      if (oldName && oldName !== filename) {
        const oldPath = join(dir, oldName);
        await unlink(oldPath).catch(() => {});
      }
    }

    // Avoid caching issues for immediate preview refresh
    try {
      (req.res as any)?.setHeader?.('Cache-Control', 'no-store');
    } catch {}

    return { logoUrl: publicUrl, logo_url: publicUrl };
  }

  @Post('remove-logo')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MANAGER', 'ADMIN')
  async removeLogo(
    @CurrentUser('businessId') businessId: string,
    @Req() req: any,
  ) {
    const current: any = await this.business.getById(businessId);
    const currentUrl = String(current?.logoUrl ?? '').trim();

    if (currentUrl.startsWith('/uploads/business-logos/')) {
      const dir = join(process.cwd(), 'uploads', 'business-logos');
      const oldName = currentUrl.replace('/uploads/business-logos/', '').trim();
      if (oldName) {
        const oldPath = join(dir, oldName);
        await unlink(oldPath).catch(() => {});
      }
    }

    await this.business.updateLogoUrl(businessId, null);

    try {
      (req.res as any)?.setHeader?.('Cache-Control', 'no-store');
    } catch {}

    return { success: true, logoUrl: null, logo_url: null };
  }

  @Get('check/:businessId')
  async checkBusiness(@Param('businessId') businessId: string) {
    return this.business.getByCode(businessId);
  }
}

// Alias routes under /api for deployments that proxy only /api/*
@Controller('api/business')
export class BusinessApiController {
  constructor(private business: BusinessService) {}

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  async profile(@CurrentUser('businessId') businessId: string) {
    const b: any = await this.business.getById(businessId);
    const safeLogo = await sanitizeLocalLogoUrl(businessId, b.logoUrl ?? null, (id, url) => this.business.updateLogoUrl(id, url));
    return {
      ...b,
      logo_url: safeLogo,
    };
  }

  @Post('upload-logo')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MANAGER', 'ADMIN')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 2 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const ok = ['image/png', 'image/jpeg', 'image/jpg'].includes(String(file?.mimetype || '').toLowerCase());
        if (!ok) return cb(new BadRequestException('Only PNG/JPG/JPEG images are allowed') as any, false);
        cb(null, true);
      },
    }),
  )
  async uploadLogo(
    @CurrentUser('businessId') businessId: string,
    @UploadedFile() file: any,
    @Req() req: any,
  ) {
    if (!file) throw new BadRequestException('Logo file is required');
    const mime = String(file.mimetype || '').toLowerCase();
    if (!['image/png', 'image/jpeg', 'image/jpg'].includes(mime)) {
      throw new BadRequestException('Only PNG/JPG/JPEG images are allowed');
    }

    const current: any = await this.business.getById(businessId);
    const currentUrl = String(current?.logoUrl ?? '').trim();

    let ext: 'png' | 'jpg' = mime === 'image/png' ? 'png' : 'jpg';
    let out: Buffer;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const sharp = require('sharp');
      const pipeline = sharp(file.buffer).rotate().resize({ width: 300, withoutEnlargement: true });
      out =
        ext === 'png'
          ? await pipeline.png({ compressionLevel: 9 }).toBuffer()
          : await pipeline.jpeg({ quality: 80, mozjpeg: true }).toBuffer();
    } catch {
      throw new BadRequestException('Invalid image file');
    }

    const dir = join(process.cwd(), 'uploads', 'business-logos');
    await mkdir(dir, { recursive: true });

    const filename = `${businessId}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
    const absPath = join(dir, filename);
    await writeFile(absPath, out);

    const publicUrl = `/uploads/business-logos/${filename}`;
    await this.business.updateLogoUrl(businessId, publicUrl);

    if (currentUrl.startsWith('/uploads/business-logos/')) {
      const oldName = currentUrl.replace('/uploads/business-logos/', '').trim();
      if (oldName && oldName !== filename) {
        const oldPath = join(dir, oldName);
        await unlink(oldPath).catch(() => {});
      }
    }

    try {
      (req.res as any)?.setHeader?.('Cache-Control', 'no-store');
    } catch {}

    return { logoUrl: publicUrl, logo_url: publicUrl };
  }

  @Post('remove-logo')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MANAGER', 'ADMIN')
  async removeLogo(
    @CurrentUser('businessId') businessId: string,
    @Req() req: any,
  ) {
    const current: any = await this.business.getById(businessId);
    const currentUrl = String(current?.logoUrl ?? '').trim();

    if (currentUrl.startsWith('/uploads/business-logos/')) {
      const dir = join(process.cwd(), 'uploads', 'business-logos');
      const oldName = currentUrl.replace('/uploads/business-logos/', '').trim();
      if (oldName) {
        const oldPath = join(dir, oldName);
        await unlink(oldPath).catch(() => {});
      }
    }

    await this.business.updateLogoUrl(businessId, null);

    try {
      (req.res as any)?.setHeader?.('Cache-Control', 'no-store');
    } catch {}

    return { success: true, logoUrl: null, logo_url: null };
  }
}
