import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { Device } from '../../domain/entities/device.entity';
import { IDeviceRepository } from '../../domain/repositories/device.repository.interface';

@Injectable()
export class DeviceRepository implements IDeviceRepository {
  constructor(
    @InjectRepository(Device) private readonly orm: Repository<Device>,
  ) {}

  findByUserAndFingerprint(
    userId: string,
    fingerprint: string,
  ): Promise<Device | null> {
    return this.orm.findOne({ where: { userId, fingerprint } });
  }

  async touch(
    userId: string,
    fingerprint: string,
    platform: string | null,
  ): Promise<Device> {
    const existing = await this.findByUserAndFingerprint(userId, fingerprint);
    if (existing) {
      existing.lastSeenAt = new Date();
      if (platform) existing.platform = platform;
      return this.orm.save(existing);
    }
    const device = new Device();
    device.userId = userId;
    device.fingerprint = fingerprint;
    device.platform = platform;
    device.lastSeenAt = new Date();
    try {
      return await this.orm.save(device);
    } catch (error) {
      // Carrera en el UNIQUE (user_id, fingerprint): gana quien insertó primero
      if (error instanceof QueryFailedError) {
        const winner = await this.findByUserAndFingerprint(userId, fingerprint);
        if (winner) return winner;
      }
      throw error;
    }
  }
}
