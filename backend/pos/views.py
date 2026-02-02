"""
POS: Menu, Orders. Pay Now -> receipt; Post to Room -> folio charge.
Kitchen flow: New -> Preparing -> Ready -> Served.
"""
from decimal import Decimal
from django.db import transaction
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from core.permissions import HasPermission
from .models import Menu, MenuItem, Order, OrderItem
from .serializers import MenuSerializer, MenuItemSerializer, OrderSerializer, OrderCreateSerializer, OrderStatusUpdateSerializer
from hotel.models import Folio, FolioCharge
from finance.models import Tax


def _apply_taxes(amount: Decimal, sector: str) -> Decimal:
    tax_total = Decimal('0')
    for t in Tax.objects.filter(is_active=True):
        if t.sectors and sector not in t.sectors:
            continue
        if t.tax_type == 'exclusive':
            tax_total += amount * (t.percentage / 100)
    return tax_total


# ---------- Menus ----------
class MenuList(generics.ListAPIView):
    queryset = Menu.objects.filter(is_active=True).prefetch_related('items')
    serializer_class = MenuSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        sector = self.request.query_params.get('sector')
        if sector:
            qs = qs.filter(sector=sector)
        return qs


class MenuItemList(generics.ListAPIView):
    queryset = MenuItem.objects.filter(is_available=True)
    serializer_class = MenuItemSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['menu', 'menu__sector']


# ---------- Orders ----------
class OrderListCreate(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated, HasPermission]
    permission_code = 'create_pos_order'

    def get_queryset(self):
        qs = Order.objects.prefetch_related('items', 'items__menu_item').order_by('-created_at')
        user = self.request.user
        if not user.is_manager and user.department:
            qs = qs.filter(sector=user.department.code)
        return qs

    def get_serializer_class(self):
        return OrderCreateSerializer if self.request.method == 'POST' else OrderSerializer

    def create(self, request, *args, **kwargs):
        ser = OrderCreateSerializer(data=request.data, context={'request': request})
        ser.is_valid(raise_exception=True)
        with transaction.atomic():
            order = ser.save()
            if order.payment_intent == Order.PAYMENT_POST_TO_ROOM and order.folio:
                # Post charge to folio
                FolioCharge.objects.create(
                    folio=order.folio,
                    sector=order.sector,
                    description=f"POS Order #{order.id} ({order.get_sector_display()})",
                    quantity=1,
                    unit_price=order.total_amount,
                    amount_before_tax=order.total_before_tax,
                    tax_amount=order.total_tax,
                    amount_after_tax=order.total_amount,
                    posted_by=request.user,
                    pos_order_id=order.id,
                )
            order.completed_at = timezone.now()
            order.save(update_fields=['completed_at'])
        return Response(OrderSerializer(order).data, status=status.HTTP_201_CREATED)


class OrderDetail(generics.RetrieveAPIView):
    queryset = Order.objects.prefetch_related('items', 'items__menu_item')
    serializer_class = OrderSerializer
    permission_classes = [IsAuthenticated, HasPermission]
    permission_code = 'view_pos_orders'


@api_view(['PATCH'])
@permission_classes([IsAuthenticated, HasPermission])
def order_status(request, pk):
    """Kitchen: update order status (New -> Preparing -> Ready -> Served)."""
    if not request.user.has_perm_code('update_pos_order') and not request.user.is_superuser:
        return Response({'detail': 'Permission denied'}, status=403)
    try:
        order = Order.objects.get(pk=pk)
    except Order.DoesNotExist:
        return Response({'detail': 'Not found'}, status=404)
    ser = OrderStatusUpdateSerializer(data=request.data, partial=True)
    ser.is_valid(raise_exception=True)
    order.status = ser.validated_data['status']
    order.save(update_fields=['status'])
    return Response(OrderSerializer(order).data)


# Kitchen display: orders not yet served
class KitchenOrderList(generics.ListAPIView):
    serializer_class = OrderSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Order.objects.prefetch_related('items', 'items__menu_item').filter(
            status__in=[Order.STATUS_NEW, Order.STATUS_PREPARING, Order.STATUS_READY]
        ).order_by('created_at')
