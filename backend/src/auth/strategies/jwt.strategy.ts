import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthService } from '../auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private auth: AuthService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'hms-secret-change-in-production',
    });
  }

  async validate(payload: any) {
    if (!payload?.sub) throw new UnauthorizedException('Invalid token payload');
    if (payload.businessId || payload?.isSuperAdmin === true || payload?.role === 'SUPER_ADMIN') {
      const user = await this.auth.validateUser(payload);
      if (!user) throw new UnauthorizedException('Invalid or expired token. Please log in again.');
      return user;
    }
    return { sub: payload.sub, email: payload.email, businessId: null };
  }
}
