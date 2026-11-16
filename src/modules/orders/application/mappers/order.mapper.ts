import { Injectable } from '@nestjs/common';
import { Payment } from '../../../payments/domain/entities/payment.entity';
import { Order } from '../../domain/entities/order.entity';
import { OrderItem } from '../../domain/entities/order-item.entity';
import { OrderItemModifier } from '../../domain/entities/order-item-modifier.entity';
import { OrderListPage } from '../../domain/repositories/order.repository.interface';
import {
  AdminOrderListResponseDto,
  AdminOrderResponseDto,
} from '../dtos/admin-order-response.dto';
import {
  DayClosePreviewResponseDto,
  DayCloseResponseDto,
} from '../dtos/day-close.response.dto';
import {
  AdminOrderListResult,
  AdminOrderResult,
} from '../use-cases/admin-order-results';
import { CloseDayResult } from '../use-cases/close-day.use-case';
import { DayCloseSummary } from '../use-cases/preview-day-close.use-case';
import {
  OrderItemModifierResponseDto,
  OrderItemResponseDto,
  OrderListResponseDto,
  OrderPaymentResponseDto,
  OrderResponseDto,
} from '../dtos/order-response.dto';

@Injectable()
export class OrderMapper {
  toResponse(order: Order): OrderResponseDto {
    const dto = new OrderResponseDto();
    dto.id = order.id;
    dto.orderNumber = order.orderNumber;
    dto.orderDate = order.orderDate;
    dto.status = order.status;
    dto.serviceType = order.serviceType;
    dto.contactPhone = order.contactPhone;
    dto.deliveryAddress = order.deliveryAddress;
    dto.deliveryLocationLink = order.deliveryLocationLink;
    dto.subtotal = order.subtotal;
    dto.deliveryFee = order.deliveryFee;
    dto.discount = order.discount;
    dto.total = order.total;
    dto.notes = order.notes;
    dto.cancelReason = order.cancelReason;
    dto.statusChangedAt = order.statusChangedAt;
    dto.createdAt = order.createdAt;
    dto.items = order.items.map((i) => this.toItemResponse(i));
    dto.payment = order.payment ? this.toPaymentResponse(order.payment) : null;
    return dto;
  }

  toListResponse(
    page: OrderListPage,
    pageNum: number,
    limit: number,
  ): OrderListResponseDto {
    const dto = new OrderListResponseDto();
    dto.items = page.items.map((o) => this.toResponse(o));
    dto.total = page.total;
    dto.page = pageNum;
    dto.limit = limit;
    return dto;
  }

  // El admin ve el pedido completo + contexto operativo — se pasa por
  // parámetro porque el mapper no consulta (responsabilidad del
  // use-case llenar tableLabel/customerName).
  toAdminResponse(result: AdminOrderResult): AdminOrderResponseDto {
    const dto = new AdminOrderResponseDto();
    Object.assign(dto, this.toResponse(result.order));
    dto.channel = result.order.channel;
    dto.tableLabel = result.tableLabel;
    dto.customerName = result.customerName;
    // §037.B — desglose del domicilio desde la ficha addresses (join
    // anti-N+1 del repositorio); null en pickup/dine_in o pedidos
    // tomados por teléfono sin ficha (deliveryAddress es el fallback).
    dto.deliveryAddressLabel = result.order.address?.label ?? null;
    dto.deliveryLandmark = result.order.address?.landmark ?? null;
    dto.deliveryNeighborhood = result.order.address?.neighborhood ?? null;
    return dto;
  }

  // El preview y el cierre comparten cuerpo; el cierre agrega
  // id/closedAt/note del registro persistido.
  toDayClosePreviewResponse(
    summary: DayCloseSummary,
  ): DayClosePreviewResponseDto {
    const dto = new DayClosePreviewResponseDto();
    dto.orderCount = summary.orderCount;
    dto.totalAmount = summary.totalAmount;
    dto.byMethod = summary.byMethod.map((m) => ({ ...m }));
    dto.cancelledCount = summary.cancelledCount;
    dto.cancelledAmount = summary.cancelledAmount;
    dto.orders = summary.orders.map((o) => ({ ...o }));
    return dto;
  }

  toDayCloseResponse(result: CloseDayResult): DayCloseResponseDto {
    const dto = new DayCloseResponseDto();
    Object.assign(dto, this.toDayClosePreviewResponse(result));
    dto.id = result.id;
    dto.closedAt = result.closedAt.toISOString();
    dto.note = result.note;
    return dto;
  }

  toAdminListResponse(
    result: AdminOrderListResult,
    page: number,
    limit: number,
  ): AdminOrderListResponseDto {
    const dto = new AdminOrderListResponseDto();
    dto.items = result.items.map((r) => this.toAdminResponse(r));
    dto.total = result.total;
    dto.page = page;
    dto.limit = limit;
    return dto;
  }

  private toItemResponse(i: OrderItem): OrderItemResponseDto {
    const dto = new OrderItemResponseDto();
    dto.id = i.id;
    dto.productId = i.productId;
    dto.productName = i.productName;
    dto.productSlug = i.productSlug;
    dto.unitPrice = i.unitPrice;
    dto.quantity = i.quantity;
    dto.lineTotal = i.lineTotal;
    dto.notes = i.notes;
    dto.includedNames = i.includedNames;
    dto.modifiers = i.modifiers.map((m) => this.toModifierResponse(m));
    return dto;
  }

  private toModifierResponse(
    m: OrderItemModifier,
  ): OrderItemModifierResponseDto {
    const dto = new OrderItemModifierResponseDto();
    dto.id = m.id;
    dto.optionId = m.optionId;
    dto.optionName = m.optionName;
    dto.action = m.action;
    dto.priceDelta = m.priceDelta;
    dto.modifierGroup = m.modifierGroup;
    dto.replacesOptionId = m.replacesOptionId;
    return dto;
  }

  private toPaymentResponse(p: Payment): OrderPaymentResponseDto {
    const dto = new OrderPaymentResponseDto();
    dto.id = p.id;
    dto.method = p.method;
    dto.status = p.status;
    dto.amount = p.amount;
    dto.payerPhone = p.payerPhone;
    dto.provider = p.provider;
    dto.providerReference = p.providerReference;
    return dto;
  }
}
