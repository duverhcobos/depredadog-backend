import { Device } from '../entities/device.entity';

export interface IDeviceRepository {
  findByUserAndFingerprint(
    userId: string,
    fingerprint: string,
  ): Promise<Device | null>;
  touch(
    userId: string,
    fingerprint: string,
    platform: string | null,
  ): Promise<Device>;
}

export const DEVICE_REPOSITORY = Symbol('IDeviceRepository');
