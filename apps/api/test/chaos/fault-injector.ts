/**
 * Chaos Test Fault Injector
 *
 * Provides helper functions to simulate infrastructure failures during
 * integration tests. Each inject function returns a restore/cleanup function
 * that MUST be called in afterEach to prevent test pollution.
 *
 * Fault injection strategies:
 * - DB connection drop: Prisma $use middleware that throws on every query
 * - DB timeout: Prisma $use middleware that delays then throws
 * - S3 outage: Replaces S3StorageService with a throwing mock via NestJS DI
 * - SMS failure: Replaces SMS_PROVIDER with a throwing mock via NestJS DI
 */

import { PrismaClient } from '@prisma/client';
import { INestApplication } from '@nestjs/common';
import { S3StorageService } from '../../src/modules/document/storage.service';
import { SMS_PROVIDER } from '../../src/modules/notification/sms-provider';
import type { SmsProvider, SmsResult } from '../../src/modules/notification/sms-provider';
import type { StorageService, StorageUploadParams } from '../../src/modules/document/storage.service';

// ─── Types ───────────────────────────────────────────────────────────────────

/** Cleanup function returned by each fault injector. */
export type RestoreFn = () => void;

// ─── Internal State Tracking ─────────────────────────────────────────────────

/**
 * We track active middleware injections via a WeakMap keyed by PrismaClient.
 * When a fault is injected, we store a flag that the middleware checks.
 * Calling the restore function clears the flag, effectively disabling the fault.
 */
const activeDbFaults = new WeakMap<PrismaClient, { enabled: boolean; type: 'drop' | 'timeout'; delayMs?: number }>();

// ─── Database Fault Injection ────────────────────────────────────────────────

/**
 * Simulate a database connection drop by making Prisma throw on every query.
 *
 * Uses Prisma's $use middleware to intercept all operations and throw a
 * connection error. The middleware is registered once and controlled via
 * an enabled flag — the restore function disables it.
 *
 * @param prisma - The PrismaClient instance to inject the fault into
 * @returns A restore function that disables the fault
 */
export function injectDbConnectionDrop(prisma: PrismaClient): RestoreFn {
  const fault = { enabled: true, type: 'drop' as const };
  activeDbFaults.set(prisma, fault);

  // Register middleware that checks the fault flag
  prisma.$use(async (params, next) => {
    const currentFault = activeDbFaults.get(prisma);
    if (currentFault?.enabled && currentFault.type === 'drop') {
      throw new Error(
        'Chaos: Database connection dropped (simulated). ' +
        `Operation: ${params.model}.${params.action}`,
      );
    }
    return next(params);
  });

  return () => {
    fault.enabled = false;
  };
}

/**
 * Simulate a database query timeout by adding artificial delay then throwing.
 *
 * Uses Prisma's $use middleware to intercept all operations, wait for the
 * specified delay, then throw a timeout error.
 *
 * @param prisma - The PrismaClient instance to inject the fault into
 * @param delayMs - Milliseconds to delay before throwing (simulates slow query)
 * @returns A restore function that disables the fault
 */
export function injectDbTimeout(prisma: PrismaClient, delayMs: number): RestoreFn {
  const fault = { enabled: true, type: 'timeout' as const, delayMs };
  activeDbFaults.set(prisma, fault);

  prisma.$use(async (params, next) => {
    const currentFault = activeDbFaults.get(prisma);
    if (currentFault?.enabled && currentFault.type === 'timeout') {
      await new Promise((resolve) => setTimeout(resolve, currentFault.delayMs ?? delayMs));
      throw new Error(
        'Chaos: Database query timeout (simulated). ' +
        `Operation: ${params.model}.${params.action}, delay: ${currentFault.delayMs ?? delayMs}ms`,
      );
    }
    return next(params);
  });

  return () => {
    fault.enabled = false;
  };
}

// ─── S3 Storage Fault Injection ──────────────────────────────────────────────

/**
 * Simulate S3 storage outage by replacing the S3StorageService with a
 * throwing mock in the NestJS application's dependency injection container.
 *
 * All calls to upload, getSignedUrl, and delete will throw an error
 * simulating S3 unavailability.
 *
 * @param app - The NestJS application instance
 * @returns A restore function that reinstates the original storage service
 */
export function injectS3Outage(app: INestApplication): RestoreFn {
  const originalService = app.get(S3StorageService);

  const throwingStorage: StorageService = {
    async upload(_params: StorageUploadParams): Promise<void> {
      throw new Error('Chaos: S3 storage unavailable (simulated outage)');
    },
    async getSignedUrl(_bucket: string, _key: string, _expiresInSeconds: number): Promise<string> {
      throw new Error('Chaos: S3 storage unavailable (simulated outage)');
    },
    async delete(_bucket: string, _key: string): Promise<void> {
      throw new Error('Chaos: S3 storage unavailable (simulated outage)');
    },
  };

  // Replace methods on the existing instance to avoid DI container issues
  const originalUpload = originalService.upload.bind(originalService);
  const originalGetSignedUrl = originalService.getSignedUrl.bind(originalService);
  const originalDelete = originalService.delete.bind(originalService);

  originalService.upload = throwingStorage.upload;
  originalService.getSignedUrl = throwingStorage.getSignedUrl;
  originalService.delete = throwingStorage.delete;

  return () => {
    originalService.upload = originalUpload;
    originalService.getSignedUrl = originalGetSignedUrl;
    originalService.delete = originalDelete;
  };
}

// ─── SMS Provider Fault Injection ────────────────────────────────────────────

/**
 * Simulate SMS provider failure by replacing the SMS_PROVIDER with a
 * throwing mock in the NestJS application's dependency injection container.
 *
 * All calls to send will throw an error simulating SMS provider unavailability.
 *
 * @param app - The NestJS application instance
 * @returns A restore function that reinstates the original SMS provider
 */
export function injectSmsFailure(app: INestApplication): RestoreFn {
  const originalProvider = app.get<SmsProvider>(SMS_PROVIDER);

  const originalSend = originalProvider.send.bind(originalProvider);

  originalProvider.send = async (_to: string, _message: string): Promise<SmsResult> => {
    throw new Error('Chaos: SMS provider unreachable (simulated failure)');
  };

  return () => {
    originalProvider.send = originalSend;
  };
}
