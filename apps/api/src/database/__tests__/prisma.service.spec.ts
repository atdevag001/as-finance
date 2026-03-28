import { describe, it, expect, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma.service';

describe('PrismaService', () => {
  let service: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService],
    }).compile();

    service = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should be an instance of PrismaService', () => {
    expect(service).toBeInstanceOf(PrismaService);
  });

  it('should have onModuleInit method', () => {
    expect(typeof service.onModuleInit).toBe('function');
  });

  it('should have onModuleDestroy method', () => {
    expect(typeof service.onModuleDestroy).toBe('function');
  });

  it('should expose PrismaClient methods', () => {
    expect(typeof service.$connect).toBe('function');
    expect(typeof service.$disconnect).toBe('function');
    expect(typeof service.$transaction).toBe('function');
  });
});
