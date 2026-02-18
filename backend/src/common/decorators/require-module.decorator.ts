import { SetMetadata } from '@nestjs/common';
import type { DashboardModule } from '../../config/business-modules';

export const REQUIRE_MODULE_KEY = 'requireModule';

export const RequireModule = (module: DashboardModule) =>
  SetMetadata(REQUIRE_MODULE_KEY, module);
