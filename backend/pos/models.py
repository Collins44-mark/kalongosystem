"""
POS: Menu (fixed prices), Orders, OrderItems.
Restaurant & Bar sectors. Pay Now -> receipt; Post to Room -> folio charge.
"""
from decimal import Decimal
from django.db import models
from django.conf import settings


class Menu(models.Model):
    """Menu (e.g. Restaurant Menu, Bar Menu)."""
    SECTOR_RESTAURANT = 'restaurant'
    SECTOR_BAR = 'bar'
    SECTOR_CHOICES = [(SECTOR_RESTAURANT, 'Restaurant'), (SECTOR_BAR, 'Bar')]
    name = models.CharField(max_length=128)
    sector = models.CharField(max_length=32, choices=SECTOR_CHOICES)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'pos_menus'
        ordering = ['sector', 'name']

    def __str__(self):
        return f'{self.name} ({self.get_sector_display()})'


class MenuItem(models.Model):
    """Fixed price only; no manual entry."""
    menu = models.ForeignKey(Menu, on_delete=models.CASCADE, related_name='items')
    name = models.CharField(max_length=128)
    price = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0'))
    description = models.TextField(blank=True)
    is_available = models.BooleanField(default=True)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = 'pos_menu_items'
        ordering = ['menu', 'sort_order', 'name']

    def __str__(self):
        return f'{self.name} - {self.price}'


class Order(models.Model):
    """POS Order. Pay Now -> receipt; Post to Room -> folio charge."""
    STATUS_NEW = 'new'
    STATUS_PREPARING = 'preparing'
    STATUS_READY = 'ready'
    STATUS_SERVED = 'served'
    STATUS_CANCELLED = 'cancelled'
    STATUS_CHOICES = [
        (STATUS_NEW, 'New'),
        (STATUS_PREPARING, 'Preparing'),
        (STATUS_READY, 'Ready'),
        (STATUS_SERVED, 'Served'),
        (STATUS_CANCELLED, 'Cancelled'),
    ]
    SECTOR_RESTAURANT = 'restaurant'
    SECTOR_BAR = 'bar'
    SECTOR_CHOICES = [(SECTOR_RESTAURANT, 'Restaurant'), (SECTOR_BAR, 'Bar')]
    PAYMENT_PAY_NOW = 'pay_now'
    PAYMENT_POST_TO_ROOM = 'post_to_room'
    PAYMENT_CHOICES = [(PAYMENT_PAY_NOW, 'Pay Now'), (PAYMENT_POST_TO_ROOM, 'Post to Room')]

    sector = models.CharField(max_length=32, choices=SECTOR_CHOICES)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_NEW)
    payment_intent = models.CharField(max_length=20, choices=PAYMENT_CHOICES, default=PAYMENT_PAY_NOW)
    # If post_to_room: link to folio
    folio = models.ForeignKey(
        'hotel.Folio', on_delete=models.SET_NULL, null=True, blank=True, related_name='pos_orders'
    )
    table_or_room = models.CharField(max_length=32, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='pos_orders_created'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    # When paid (pay_now) or posted to folio
    completed_at = models.DateTimeField(null=True, blank=True)
    total_before_tax = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0'))
    total_tax = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0'))
    total_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0'))

    class Meta:
        db_table = 'pos_orders'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['sector']),
            models.Index(fields=['status']),
            models.Index(fields=['created_at']),
        ]

    def __str__(self):
        return f'Order #{self.id} {self.sector} ({self.status})'


class OrderItem(models.Model):
    """Line item in POS order. Fixed price from menu."""
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='items')
    menu_item = models.ForeignKey(MenuItem, on_delete=models.PROTECT, related_name='order_items')
    quantity = models.PositiveIntegerField(default=1)
    unit_price = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0'))
    line_total = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0'))
    notes = models.CharField(max_length=256, blank=True)

    class Meta:
        db_table = 'pos_order_items'
        ordering = ['order', 'id']
