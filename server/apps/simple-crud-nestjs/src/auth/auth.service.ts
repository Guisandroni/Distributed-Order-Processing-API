import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { LoginDto } from './dto/login.dto';
import bcrypt from 'bcryptjs';
import { RegisterDto } from './dto/register.dto';
import { JwtPayload } from './types/jwt-payload.type';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async login(loginDto: LoginDto) {
    const user = await this.usersService.findByEmail(loginDto.email);

    if (!user) {
      throw new UnauthorizedException('Email ou senha invalidos');
    }

    const passwordMatch = await bcrypt.compare(
      loginDto.password,
      user.password,
    );

    if (!passwordMatch) {
      throw new UnauthorizedException('Email ou senha invalidos');
    }

    const payload = {
      sub: user.id,
      email: user.email,
    };

    const acessToken = await this.jwtService.signAsync(payload);

    return {
      acessToken,
    };
  }

  async register(registerDto: RegisterDto) {
    const user = await this.usersService.create(registerDto);

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
    };

    const acessToken = await this.jwtService.signAsync(payload);

    return {
      user,
      acessToken,
    };
  }
}
