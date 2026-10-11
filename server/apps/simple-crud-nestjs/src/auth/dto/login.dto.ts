import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    description: 'E-mail cadastrado do usuário',
    example: 'ana@example.com',
    format: 'email',
  })
  @IsEmail()
  email!: string;

  @ApiProperty({
    description: 'Senha do usuário',
    example: 'StrongPass@123',
    writeOnly: true,
  })
  @IsString()
  @IsNotEmpty()
  password!: string;
}
