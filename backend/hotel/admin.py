from django.contrib import admin
from .models import RoomType, Room, Guest, Booking, Folio, FolioCharge, FolioPayment, Receipt, MaintenanceRequest, HousekeepingRequest


@admin.register(RoomType)
class RoomTypeAdmin(admin.ModelAdmin):
    list_display = ['name', 'base_price_per_night', 'is_active']


@admin.register(Room)
class RoomAdmin(admin.ModelAdmin):
    list_display = ['number', 'room_type', 'status', 'floor']
    list_filter = ['status', 'room_type']


@admin.register(Guest)
class GuestAdmin(admin.ModelAdmin):
    list_display = ['full_name', 'email', 'phone', 'nationality']


@admin.register(Booking)
class BookingAdmin(admin.ModelAdmin):
    list_display = ['id', 'guest', 'room', 'check_in_date', 'check_out_date', 'status', 'source']
    list_filter = ['status', 'source']


@admin.register(Folio)
class FolioAdmin(admin.ModelAdmin):
    list_display = ['id', 'booking', 'status', 'closed_at']


@admin.register(FolioCharge)
class FolioChargeAdmin(admin.ModelAdmin):
    list_display = ['id', 'folio', 'sector', 'description', 'amount_after_tax', 'posted_at']


@admin.register(FolioPayment)
class FolioPaymentAdmin(admin.ModelAdmin):
    list_display = ['id', 'folio', 'amount', 'method', 'confirmed_at', 'receipt_issued']


@admin.register(Receipt)
class ReceiptAdmin(admin.ModelAdmin):
    list_display = ['receipt_number', 'amount', 'issued_at']


@admin.register(MaintenanceRequest)
class MaintenanceRequestAdmin(admin.ModelAdmin):
    list_display = ['room', 'description', 'priority', 'status', 'created_at']


@admin.register(HousekeepingRequest)
class HousekeepingRequestAdmin(admin.ModelAdmin):
    list_display = ['room', 'description', 'status', 'created_at']
