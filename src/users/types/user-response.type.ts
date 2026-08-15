import { Prisma } from '../../../generated/prisma/client';

export type UserResponse = Prisma.UserGetPayload<{
  select: {
    id: true;
    name: true;
    email: true;
    dateOfBirth: true;
    createdAt: true;
    updateAt: true;
  };
}>;
