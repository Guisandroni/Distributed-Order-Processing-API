import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { LoginDto } from './dto/login.dto';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import {
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { LoginResponseDto, RegisterResponseDto } from './dto/auth-response.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @ApiOperation({ summary: 'Autenticar usuário' })
  @ApiOkResponse({
    description: 'Usuário autenticado com sucesso',
    type: LoginResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'E-mail ou senha inválidos' })
  @HttpCode(HttpStatus.OK)
  @Post('login')
  login(@Body() LoginDto: LoginDto) {
    return this.authService.login(LoginDto);
  }

  @ApiOperation({ summary: 'Criar uma conta' })
  @ApiAcceptedResponse({
    description: 'Conta criada e autenticada com sucesso',
    type: RegisterResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Dados de cadastro inválidos' })
  @ApiConflictResponse({ description: 'E-mail já cadastrado' })
  @HttpCode(HttpStatus.ACCEPTED)
  @Post('register')
  register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }
}
