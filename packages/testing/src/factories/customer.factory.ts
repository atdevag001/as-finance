import { CustomerStatus } from '@as-finance/shared';
import {
  buildEntity,
  randomAadhaar,
  randomMobile,
  randomPan,
  randomPincode,
  randomUUID,
} from './helpers.js';

export interface TestCustomer {
  id: string;
  fullName: string;
  fatherOrHusbandName: string | null;
  mobile: string;
  alternateMobile: string | null;
  aadhaarNumberEncrypted: string;
  aadhaarLastFour: string;
  panNumberEncrypted: string | null;
  panLastFour: string | null;
  dob: Date | null;
  age: number | null;
  gender: string;
  occupation: string | null;
  monthlyIncomePaise: number | null;
  workOrBusinessDetails: string | null;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  district: string;
  state: string;
  pincode: string;
  riskLevel: string;
  status: CustomerStatus;
  blacklistReason: string | null;
  blacklistedAt: Date | null;
  blacklistedBy: string | null;
  assignedOfficerId: string | null;
  photoFileId: string | null;
  notes: string | null;
  version: number;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export function createCustomer(overrides?: Partial<TestCustomer>): TestCustomer {
  const now = new Date();
  const aadhaar = randomAadhaar();
  const pan = randomPan();
  return buildEntity<TestCustomer>(
    {
      id: randomUUID(),
      fullName: 'Test Customer',
      fatherOrHusbandName: 'Test Father',
      mobile: randomMobile(),
      alternateMobile: null,
      aadhaarNumberEncrypted: `encrypted_${aadhaar}`,
      aadhaarLastFour: aadhaar.slice(-4),
      panNumberEncrypted: `encrypted_${pan}`,
      panLastFour: pan.slice(-4),
      dob: new Date('1990-01-15'),
      age: null,
      gender: 'male',
      occupation: 'Business',
      monthlyIncomePaise: 5000000, // ₹50,000
      workOrBusinessDetails: null,
      addressLine1: '123 Main Street',
      addressLine2: null,
      city: 'Jaipur',
      district: 'Jaipur',
      state: 'Rajasthan',
      pincode: randomPincode(),
      riskLevel: 'medium',
      status: CustomerStatus.ACTIVE,
      blacklistReason: null,
      blacklistedAt: null,
      blacklistedBy: null,
      assignedOfficerId: null,
      photoFileId: null,
      notes: null,
      version: 1,
      createdBy: randomUUID(),
      createdAt: now,
      updatedAt: now,
    },
    overrides,
  );
}
