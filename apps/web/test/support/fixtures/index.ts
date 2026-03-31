import { mergeTests } from '@playwright/test';
import { test as authTest } from './auth-fixture';
import { test as apiTest } from './api-fixture';

export const test = mergeTests(authTest, apiTest);
export { expect } from '@playwright/test';
