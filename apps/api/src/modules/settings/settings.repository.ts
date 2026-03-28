import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

const SETTINGS_SELECT = {
  id: true,
  key: true,
  value: true,
  description: true,
  updated_by: true,
  updated_at: true,
};

@Injectable()
export class SettingsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma['settings'].findMany({
      select: SETTINGS_SELECT,
      orderBy: { key: 'asc' },
    });
  }

  async findByKey(key: string) {
    return this.prisma['settings'].findUnique({
      where: { key },
      select: SETTINGS_SELECT,
    });
  }

  async upsert(key: string, value: unknown, updatedBy: string, description?: string) {
    return this.prisma['settings'].upsert({
      where: { key },
      update: {
        value: value as never,
        updated_by: updatedBy,
        ...(description !== undefined ? { description } : {}),
      },
      create: {
        key,
        value: value as never,
        description: description ?? null,
        updated_by: updatedBy,
      },
      select: SETTINGS_SELECT,
    });
  }
}
