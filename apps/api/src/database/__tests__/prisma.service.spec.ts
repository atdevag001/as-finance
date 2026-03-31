import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PrismaService } from '../prisma.service';
import { PrismaClient } from '@prisma/client';

describe('PrismaService', () => {
  let service: PrismaService;

  beforeEach(() => {
    service = new PrismaService();
  });

  // --- Requirement 60.4: Extends PrismaClient, implements OnModuleInit & OnModuleDestroy ---
  it('should be an instance of PrismaClient', () => {
    expect(service).toBeInstanceOf(PrismaClient);
  });

  it('should implement OnModuleInit (has onModuleInit method)', () => {
    expect(typeof service.onModuleInit).toBe('function');
  });

  it('should implement OnModuleDestroy (has onModuleDestroy method)', () => {
    expect(typeof service.onModuleDestroy).toBe('function');
  });

  it('should expose PrismaClient methods ($connect, $disconnect, $transaction)', () => {
    expect(typeof service.$connect).toBe('function');
    expect(typeof service.$disconnect).toBe('function');
    expect(typeof service.$transaction).toBe('function');
  });

  // --- Requirement 60.1: onModuleInit calls $connect ---
  describe('onModuleInit()', () => {
    it('should call $connect()', async () => {
      const connectSpy = vi.spyOn(service, '$connect').mockResolvedValue();

      await service.onModuleInit();

      expect(connectSpy).toHaveBeenCalledOnce();
    });
  });

  // --- Requirement 60.2: onModuleDestroy calls $disconnect ---
  describe('onModuleDestroy()', () => {
    it('should call $disconnect()', async () => {
      const disconnectSpy = vi.spyOn(service, '$disconnect').mockResolvedValue();

      await service.onModuleDestroy();

      expect(disconnectSpy).toHaveBeenCalledOnce();
    });
  });

  // --- Requirement 60.3: $connect failure propagates ---
  describe('error propagation', () => {
    it('should propagate $connect() errors to the caller (NestJS bootstrap)', async () => {
      const connectError = new Error('Connection refused');
      vi.spyOn(service, '$connect').mockRejectedValue(connectError);

      await expect(service.onModuleInit()).rejects.toThrow('Connection refused');
    });
  });
});
