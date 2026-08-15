import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePostDto } from './dto/create-post.dto';
import type { Post } from '../../generated/prisma/client';
@Injectable()
export class PostsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createPostDto: CreatePostDto, userId: number): Promise<Post> {
    await this.findSameTitle(createPostDto.title);

    return await this.prisma.post.create({
      data: {
        title: createPostDto.title,
        content: createPostDto.content,
        slug: createPostDto.slug,

        author: {
          connect: {
            id: userId,
          },
        },
      },
    });
  }

  async findSameTitle(slug: string) {
    const postSameSlug = await this.prisma.post.findUnique({
      where: {
        slug,
      },
    });

    if (postSameSlug) {
      throw new ConflictException('Este post ja existe, altere o titulo');
    }
  }
}
