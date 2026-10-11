import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import bcrypt from 'bcryptjs';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserResponse } from './types/user-response.type';
import { PrismaService } from '@lib/prisma';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createUserDto: CreateUserDto): Promise<UserResponse> {
    await this.findEmailEquals(createUserDto.email);

    const passwordHash = await bcrypt.hash(createUserDto.password, 8);

    return this.prisma.user.create({
      data: {
        name: createUserDto.name,
        email: createUserDto.email,
        password: passwordHash,
        dateOfBirth: new Date(createUserDto.dateOfBirth),
      },
      select: {
        id: true,
        name: true,
        email: true,
        dateOfBirth: true,
        createdAt: true,
        updateAt: true,
      },
    });
  }

  findAll() {
    return this.prisma.user.findMany();
  }

  findOne(id: number) {
    return this.prisma.user.findUnique({
      where: {
        id,
      },
    });
  }

  async findEmailEquals(email: string) {
    const userEqualEmail = await this.prisma.user.findUnique({
      where: {
        email,
      },
    });

    if (userEqualEmail) {
      throw new ConflictException('Usuario com o mesmo email nao pode existir');
    }
  }

  remove(id: number) {
    return `This action removes a #${id} user`;
  }

  async update(id: number, updateUserDto: UpdateUserDto) {
    const user = await this.prisma.user.findUnique({
      where: {
        id,
      },
    });

    if (!user) {
      throw new NotFoundException('Usuario nao encontrado');
    }

    if (updateUserDto.email && updateUserDto.email !== user.email) {
      const userWithSameEmail = await this.prisma.user.findUnique({
        where: {
          email: updateUserDto.email,
        },
      });
      if (userWithSameEmail) {
        throw new ConflictException('Usuario com o mesmo email ja existe');
      }
    }
    let passwordHash: string | undefined;

    if (updateUserDto.password) {
      passwordHash = await bcrypt.hash(updateUserDto.password, 8);
    }

    return this.prisma.user.update({
      where: {
        id,
      },

      data: {
        ...(updateUserDto.name !== undefined && {
          name: updateUserDto.name,
        }),

        ...(updateUserDto.email !== undefined && {
          email: updateUserDto.email,
        }),

        ...(passwordHash !== undefined && {
          password: passwordHash,
        }),

        ...(updateUserDto.dateOfBirth !== undefined && {
          dateOfBirth: new Date(updateUserDto.dateOfBirth),
        }),
      },
      select: {
        id: true,
        name: true,
        email: true,
        dateOfBirth: true,
        createdAt: true,
        updateAt: true,
      },
    });
  }

  findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: {
        email,
      },
    });
  }
}
