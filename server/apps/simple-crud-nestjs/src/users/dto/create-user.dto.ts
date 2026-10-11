import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsEmail,
  IsNotEmpty,
  IsString,
  IsStrongPassword,
} from 'class-validator';

export class CreateUserDto {
  @ApiProperty({
    description: 'Nome completo do usuário',
    example: 'Ana Silva',
  })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({
    description: 'E-mail único do usuário',
    example: 'ana@example.com',
    format: 'email',
  })
  @IsEmail()
  email!: string;

  @ApiProperty({
    description:
      'Senha forte com letras maiúsculas, minúsculas, número e símbolo',
    example: 'StrongPass@123',
    writeOnly: true,
  })
  @IsStrongPassword()
  password!: string;

  @ApiProperty({
    description: 'Data de nascimento no formato ISO 8601',
    example: '1995-05-20',
    format: 'date',
  })
  @IsDateString()
  dateOfBirth!: string;
}
