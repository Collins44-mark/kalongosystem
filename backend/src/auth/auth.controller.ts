import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

class SignupDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsString()
  @IsNotEmpty()
  business_name: string;
}

class LoginDto {
  @IsString()
  @IsNotEmpty()
  businessId: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;
}

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post('signup')
  async signup(@Body() dto: SignupDto) {
    return this.auth.signup(dto.email, dto.password, dto.business_name);
  }

  @Post('login')
  async login(@Body() dto: LoginDto) {
    return this.auth.login(dto.businessId, dto.email, dto.password);
  }
}
