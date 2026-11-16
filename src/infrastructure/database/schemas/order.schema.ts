import { EntitySchema } from 'typeorm';
import { Order } from '../../../modules/orders/domain/entities/order.entity';
import { OrderChannel } from '../../../modules/orders/domain/enums/order-channel.enum';
import { OrderServiceType } from '../../../modules/orders/domain/enums/order-service-type.enum';
import { OrderStatus } from '../../../modules/orders/domain/enums/order-status.enum';

const numeric = {
  to: (value: number) => value,
  from: (value: string) => Number(value),
};

export const OrderSchema = new EntitySchema<Order>({
  name: 'Order',
  target: Order,
  tableName: 'orders',
  columns: {
    id: { type: 'uuid', primary: true, generated: 'uuid' },
    orderDate: { name: 'order_date', type: 'date' },
    orderNumber: { name: 'order_number', type: 'int' },
    channel: { type: 'enum', enum: OrderChannel, enumName: 'order_channel' },
    serviceType: {
      name: 'service_type',
      type: 'enum',
      enum: OrderServiceType,
      enumName: 'order_service_type',
    },
    customerId: { name: 'customer_id', type: 'uuid', nullable: true },
    takenBy: { name: 'taken_by', type: 'uuid', nullable: true },
    tableId: { name: 'table_id', type: 'uuid', nullable: true },
    addressId: { name: 'address_id', type: 'uuid', nullable: true },
    deliveryAddress: {
      name: 'delivery_address',
      type: 'text',
      nullable: true,
    },
    status: {
      type: 'enum',
      enum: OrderStatus,
      enumName: 'order_status',
      default: OrderStatus.PENDING,
    },
    subtotal: {
      type: 'numeric',
      precision: 10,
      scale: 2,
      transformer: numeric,
    },
    deliveryFee: {
      name: 'delivery_fee',
      type: 'numeric',
      precision: 10,
      scale: 2,
      transformer: numeric,
      default: 0,
    },
    discount: {
      type: 'numeric',
      precision: 10,
      scale: 2,
      transformer: numeric,
      default: 0,
    },
    total: {
      type: 'numeric',
      precision: 10,
      scale: 2,
      transformer: numeric,
    },
    notes: { type: 'text', nullable: true },
    cancelReason: { name: 'cancel_reason', type: 'text', nullable: true },
    contactPhone: {
      name: 'contact_phone',
      type: 'varchar',
      length: 20,
      nullable: true,
    },
    deliveryLocationLink: {
      name: 'delivery_location_link',
      type: 'text',
      nullable: true,
    },
    clientRequestId: {
      name: 'client_request_id',
      type: 'uuid',
      nullable: true,
    },
    dayCloseId: { name: 'day_close_id', type: 'uuid', nullable: true },
    // Cuándo entró al estado actual — la cola del kanban ordena cada
    // carril por este campo, no por created_at (§037.A).
    statusChangedAt: { name: 'status_changed_at', type: 'timestamptz' },
    createdAt: { name: 'created_at', type: 'timestamptz', createDate: true },
    updatedAt: { name: 'updated_at', type: 'timestamptz', updateDate: true },
  },
  relations: {
    // FKs declaradas como columna arriba; la relación existe para el
    // join anti-N+1 de la vista admin (dirección del domicilio) y el
    // cierre que archivó la orden.
    address: {
      type: 'many-to-one',
      target: 'Address',
      joinColumn: { name: 'address_id' },
    },
    dayClose: {
      type: 'many-to-one',
      target: 'DayClose',
      joinColumn: { name: 'day_close_id' },
    },
  },
});
