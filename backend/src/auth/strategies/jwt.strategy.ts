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
    if (payload.businessId) {
      const user = await this.auth.validateUser(payload);
      if (!user) throw new UnauthorizedException();
      return user;
    }
    return { sub: payload.sub, email: payload.email, businessId: null };
  }
}
