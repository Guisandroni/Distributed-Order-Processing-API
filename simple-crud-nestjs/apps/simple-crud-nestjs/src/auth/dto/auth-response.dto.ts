import { ApiProperty } from '@nestjs/swagger';
import { UserResponse } from '../../users/types/user-response.type';

export class LoginResponseDto {
  @ApiProperty({
    description: 'Token JWT usado no esquema Bearer',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  acessToken!: string;
}

export class RegisterResponseDto extends LoginResponseDto {
  @ApiProperty({ type: () => UserResponse })
  user!: UserResponse;
}
