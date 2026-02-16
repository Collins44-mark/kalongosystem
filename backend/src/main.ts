import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { SuperAdminService } from './super-admin/super-admin.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalFilters(new AllExceptionsFilter());

  try {
    const superAdmin = app.get(SuperAdminService);
    await superAdmin.ensureSuperAdminExists();
  } catch (e) {
    console.warn('Could not ensure super-admin user (DB may be unavailable):', (e as Error).message);
  }

  // Enable CORS for frontend (Vercel, localhost)
  const allowedOrigins = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    process.env.FRONTEND_URL,
  ].filter(Boolean) as string[];
  app.enableCors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      const isAllowed =
        allowedOrigins.includes(origin) ||
        allowedOrigins.some((o) => origin?.startsWith(o.replace(/\/$/, ''))) ||
        origin.endsWith('.vercel.app'); // Vercel preview URLs
      cb(null, isAllowed ? origin : allowedOrigins[0]);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  const port = process.env.PORT || 4000;
  await app.listen(port);
  console.log(`HMS Backend running on port ${port}`);
}

bootstrap();
