import { Body, Controller, Post } from '@nestjs/common';
import { IsEmail, IsOptional, MinLength } from 'class-validator';
import { AuthService } from './auth.service';

class RegisterDto {
  @IsEmail() email!: string;
  @MinLength(8) password!: string;
  @IsOptional() name?: string;
}

class LoginDto {
  @IsEmail() email!: string;
  @MinLength(8) password!: string;
}

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto.email, dto.password, dto.name);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password);
  }
}
