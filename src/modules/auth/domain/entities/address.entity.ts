export class Address {
  id!: string;
  userId!: string;
  label!: string;
  addressLine!: string;
  reference: string | null = null;
  latitude: number | null = null;
  longitude: number | null = null;
  isDefault = false;
  createdAt!: Date;
  updatedAt!: Date;
}
