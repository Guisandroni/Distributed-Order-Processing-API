import { ApiProperty } from '@nestjs/swagger';

export class UserResponse {
  @ApiProperty({ description: 'Identificador do usuário', example: 1 })
  id!: number;

  @ApiProperty({ description: 'Nome completo', example: 'Ana Silva' })
  name!: string;

  @ApiProperty({
    description: 'E-mail do usuário',
    example: 'ana@example.com',
    format: 'email',
  })
  email!: string;

  @ApiProperty({
    description: 'Data de nascimento',
    example: '1995-05-20T00:00:00.000Z',
    format: 'date-time',
  })
  dateOfBirth!: Date;

  @ApiProperty({
    description: 'Data de criação',
    example: '2026-08-20T12:00:00.000Z',
    format: 'date-time',
  })
  createdAt!: Date;

  @ApiProperty({
    description: 'Data da última atualização',
    example: '2026-08-20T12:00:00.000Z',
    format: 'date-time',
  })
  updateAt!: Date;
}
