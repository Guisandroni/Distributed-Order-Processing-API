import {
  IsDateString,
  IsEmail,
  IsNotEmpty,
  IsString,
  IsStrongPassword,
} from 'class-validator';

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  name!: string;
  @IsEmail()
  email!: string;
  @IsStrongPassword()
  password!: string;
  @IsDateString()
  dateOfBirth!: string;
}
id        Int      @id @default(autoincrement())
name      String
email     String   @unique
password  String
cpf       String   @unique
birthDate DateTime
role      Role     @default(USER)

createdAt DateTime @default(now())
updateAt  DateTime @updatedAt

accounts  Account[]
addresses Address[]
