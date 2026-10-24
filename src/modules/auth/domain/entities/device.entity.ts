export class Device {
  id!: string;
  userId!: string;
  fingerprint!: string;
  platform: string | null = null;
  pushToken: string | null = null;
  notificationsEnabled = true;
  createdAt!: Date;
  lastSeenAt!: Date;
}
