"""
Hotel: RoomType, Room, Guest, Booking, Folio, FolioCharge, FolioPayment, Receipt.
Folio-centric billing; one folio per booking; room changes allowed without breaking folio.
"""
from decimal import Decimal
from django.db import models
from django.db.models import Sum
from django.conf import settings
from django.utils import timezone


class RoomType(models.Model):
    """Room type with base price per night."""
    name = models.CharField(max_length=64)
    base_price_per_night = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0'))
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'room_types'
        ordering = ['name']

    def __str__(self):
        return f'{self.name} ({self.base_price_per_night})'


class Room(models.Model):
    """Physical room linked to room type. Status: Vacant, Occupied, Reserved, Maintenance."""
    STATUS_VACANT = 'vacant'
    STATUS_OCCUPIED = 'occupied'
    STATUS_RESERVED = 'reserved'
    STATUS_MAINTENANCE = 'maintenance'
    STATUS_CHOICES = [
        (STATUS_VACANT, 'Vacant'),
        (STATUS_OCCUPIED, 'Occupied'),
        (STATUS_RESERVED, 'Reserved'),
        (STATUS_MAINTENANCE, 'Maintenance'),
    ]
    room_type = models.ForeignKey(RoomType, on_delete=models.PROTECT, related_name='rooms')
    number = models.CharField(max_length=16, unique=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_VACANT)
    floor = models.CharField(max_length=8, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        db_table = 'rooms'
        ordering = ['number']

    def __str__(self):
        return f'Room {self.number} ({self.get_status_display()})'


class Guest(models.Model):
    """Guest profile linked to bookings."""
    full_name = models.CharField(max_length=128)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=32, blank=True)
    id_type = models.CharField(max_length=32, blank=True)
    id_number = models.CharField(max_length=64, blank=True)
    nationality = models.CharField(max_length=64, blank=True)
    address = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'guests'
        ordering = ['full_name']

    def __str__(self):
        return self.full_name


class Booking(models.Model):
    """Booking: online or walk-in. One folio per booking; folio created at check-in."""
    SOURCE_ONLINE = 'online'
    SOURCE_WALK_IN = 'walk_in'
    SOURCE_CHOICES = [(SOURCE_ONLINE, 'Online'), (SOURCE_WALK_IN, 'Walk-in')]
    STATUS_PENDING = 'pending'
    STATUS_CONFIRMED = 'confirmed'
    STATUS_CHECKED_IN = 'checked_in'
    STATUS_CHECKED_OUT = 'checked_out'
    STATUS_CANCELLED = 'cancelled'
    STATUS_CHOICES = [
        (STATUS_PENDING, 'Pending'),
        (STATUS_CONFIRMED, 'Confirmed'),
        (STATUS_CHECKED_IN, 'Checked In'),
        (STATUS_CHECKED_OUT, 'Checked Out'),
        (STATUS_CANCELLED, 'Cancelled'),
    ]
    guest = models.ForeignKey(Guest, on_delete=models.PROTECT, related_name='bookings')
    room = models.ForeignKey(Room, on_delete=models.PROTECT, related_name='bookings')
    room_type = models.ForeignKey(RoomType, on_delete=models.PROTECT, related_name='bookings')
    check_in_date = models.DateField()
    check_out_date = models.DateField()
    source = models.CharField(max_length=20, choices=SOURCE_CHOICES, default=SOURCE_WALK_IN)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING)
    special_requests = models.TextField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='created_bookings'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    # QR self check-in
    qr_token = models.CharField(max_length=64, unique=True, blank=True, null=True)
    qr_submitted_at = models.DateTimeField(null=True, blank=True)
    qr_approved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'bookings'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['status']),
            models.Index(fields=['check_in_date', 'check_out_date']),
            models.Index(fields=['qr_token']),
        ]

    def __str__(self):
        return f'Booking #{self.id} - {self.guest} - {self.room}'

    @property
    def folio(self):
        return getattr(self, '_folio', None) or self.folios.filter(is_primary=True).first()


class Folio(models.Model):
    """Guest Account: one per booking. OPEN from check-in until checkout; then read-only."""
    booking = models.ForeignKey(Booking, on_delete=models.CASCADE, related_name='folios')
    is_primary = models.BooleanField(default=True)
    status = models.CharField(
        max_length=20,
        choices=[('open', 'Open'), ('closed', 'Closed')],
        default='open'
    )
    closed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'folios'
        ordering = ['-created_at']
        indexes = [models.Index(fields=['booking']), models.Index(fields=['status'])]

    def __str__(self):
        return f'Folio #{self.id} Booking#{self.booking_id} ({self.status})'

    @property
    def total_charges(self):
        return self.charges.aggregate(total=Sum('amount_after_tax'))['total'] or Decimal('0')

    @property
    def total_payments(self):
        return self.payments.aggregate(total=Sum('amount'))['total'] or Decimal('0')

    @property
    def balance(self):
        return self.total_charges - self.total_payments

    def can_post_charges(self):
        return self.status == 'open'


class FolioCharge(models.Model):
    """Charge on folio: room, restaurant, bar, laundry, activities. Taxes auto-applied."""
    SECTOR_ROOMS = 'rooms'
    SECTOR_RESTAURANT = 'restaurant'
    SECTOR_BAR = 'bar'
    SECTOR_HOUSEKEEPING = 'housekeeping'
    SECTOR_ACTIVITIES = 'activities'
    SECTOR_CHOICES = [
        (SECTOR_ROOMS, 'Rooms'),
        (SECTOR_RESTAURANT, 'Restaurant'),
        (SECTOR_BAR, 'Bar'),
        (SECTOR_HOUSEKEEPING, 'Housekeeping'),
        (SECTOR_ACTIVITIES, 'Activities'),
    ]
    folio = models.ForeignKey(Folio, on_delete=models.CASCADE, related_name='charges')
    sector = models.CharField(max_length=32, choices=SECTOR_CHOICES)
    description = models.CharField(max_length=256)
    quantity = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('1'))
    unit_price = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0'))
    amount_before_tax = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0'))
    tax_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0'))
    amount_after_tax = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0'))
    posted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='posted_charges'
    )
    posted_at = models.DateTimeField(auto_now_add=True)
    # Optional link to POS order
    pos_order_id = models.PositiveIntegerField(null=True, blank=True)
    room_night_date = models.DateField(null=True, blank=True)

    class Meta:
        db_table = 'folio_charges'
        ordering = ['posted_at']
        indexes = [models.Index(fields=['folio']), models.Index(fields=['sector'])]


class FolioPayment(models.Model):
    """Payment on folio. Receipt issued only when payment confirmed. Split payments supported."""
    METHOD_CASH = 'cash'
    METHOD_MPESA = 'mpesa'
    METHOD_AIRTEL = 'airtel_money'
    METHOD_TIGO = 'tigo_pesa'
    METHOD_BANK = 'bank_transfer'
    METHOD_CARD = 'card'
    METHOD_CHOICES = [
        (METHOD_CASH, 'Cash'),
        (METHOD_MPESA, 'M-Pesa'),
        (METHOD_AIRTEL, 'Airtel Money'),
        (METHOD_TIGO, 'Tigo Pesa'),
        (METHOD_BANK, 'Bank Transfer'),
        (METHOD_CARD, 'Card'),
    ]
    folio = models.ForeignKey(Folio, on_delete=models.CASCADE, related_name='payments')
    amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0'))
    method = models.CharField(max_length=32, choices=METHOD_CHOICES)
    reference = models.CharField(max_length=128, blank=True)
    confirmed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='confirmed_payments'
    )
    confirmed_at = models.DateTimeField(auto_now_add=True)
    receipt_issued = models.BooleanField(default=False)

    class Meta:
        db_table = 'folio_payments'
        ordering = ['confirmed_at']


class Receipt(models.Model):
    """Receipt issued only when payment is confirmed."""
    folio_payment = models.OneToOneField(
        FolioPayment, on_delete=models.CASCADE, related_name='receipt', null=True, blank=True
    )
    receipt_number = models.CharField(max_length=32, unique=True)
    amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0'))
    issued_at = models.DateTimeField(auto_now_add=True)
    issued_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='issued_receipts'
    )

    class Meta:
        db_table = 'receipts'
        ordering = ['-issued_at']


class MaintenanceRequest(models.Model):
    """Maintenance request linked to room. Approved = expense recorded."""
    room = models.ForeignKey(Room, on_delete=models.CASCADE, related_name='maintenance_requests')
    description = models.TextField()
    priority = models.CharField(max_length=20, choices=[('low', 'Low'), ('medium', 'Medium'), ('high', 'High')], default='medium')
    status = models.CharField(
        max_length=20,
        choices=[('pending', 'Pending'), ('approved', 'Approved'), ('done', 'Done'), ('cancelled', 'Cancelled')],
        default='pending'
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='maintenance_requests'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    approved_at = models.DateTimeField(null=True, blank=True)
    expense_recorded = models.BooleanField(default=False)

    class Meta:
        db_table = 'maintenance_requests'
        ordering = ['-created_at']


class HousekeepingRequest(models.Model):
    """Housekeeping supply/tool request."""
    room = models.ForeignKey(Room, on_delete=models.CASCADE, related_name='housekeeping_requests', null=True, blank=True)
    description = models.TextField()
    status = models.CharField(
        max_length=20,
        choices=[('pending', 'Pending'), ('fulfilled', 'Fulfilled'), ('cancelled', 'Cancelled')],
        default='pending'
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='housekeeping_requests'
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'housekeeping_requests'
        ordering = ['-created_at']
