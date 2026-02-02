from rest_framework import serializers
from .models import (
    RoomType, Room, Guest, Booking, Folio, FolioCharge, FolioPayment, Receipt,
    MaintenanceRequest, HousekeepingRequest,
)
from core.serializers import DepartmentSerializer
from core.models import Department


class RoomTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = RoomType
        fields = ['id', 'name', 'base_price_per_night', 'description', 'is_active']


class RoomSerializer(serializers.ModelSerializer):
    room_type_name = serializers.CharField(source='room_type.name', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = Room
        fields = ['id', 'number', 'room_type', 'room_type_name', 'status', 'status_display', 'floor', 'notes']


class GuestSerializer(serializers.ModelSerializer):
    class Meta:
        model = Guest
        fields = ['id', 'full_name', 'email', 'phone', 'id_type', 'id_number', 'nationality', 'address', 'created_at']


class GuestMinSerializer(serializers.ModelSerializer):
    class Meta:
        model = Guest
        fields = ['id', 'full_name', 'email', 'phone']


class FolioChargeSerializer(serializers.ModelSerializer):
    class Meta:
        model = FolioCharge
        fields = [
            'id', 'sector', 'description', 'quantity', 'unit_price',
            'amount_before_tax', 'tax_amount', 'amount_after_tax', 'posted_at', 'room_night_date'
        ]
        read_only_fields = ['amount_before_tax', 'tax_amount', 'amount_after_tax']


class FolioPaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = FolioPayment
        fields = ['id', 'amount', 'method', 'reference', 'confirmed_at', 'receipt_issued']


class FolioSerializer(serializers.ModelSerializer):
    charges = FolioChargeSerializer(many=True, read_only=True)
    payments = FolioPaymentSerializer(many=True, read_only=True)
    total_charges = serializers.SerializerMethodField()
    total_payments = serializers.SerializerMethodField()
    balance = serializers.SerializerMethodField()

    class Meta:
        model = Folio
        fields = [
            'id', 'booking', 'is_primary', 'status', 'closed_at',
            'charges', 'payments', 'total_charges', 'total_payments', 'balance',
            'created_at', 'updated_at'
        ]

    def get_total_charges(self, obj):
        return obj.total_charges

    def get_total_payments(self, obj):
        return obj.total_payments

    def get_balance(self, obj):
        return obj.balance


class BookingSerializer(serializers.ModelSerializer):
    guest_detail = GuestMinSerializer(source='guest', read_only=True)
    room_number = serializers.CharField(source='room.number', read_only=True)
    room_type_name = serializers.CharField(source='room_type.name', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    folio = serializers.SerializerMethodField()

    class Meta:
        model = Booking
        fields = [
            'id', 'guest', 'guest_detail', 'room', 'room_number', 'room_type', 'room_type_name',
            'check_in_date', 'check_out_date', 'source', 'status', 'status_display',
            'special_requests', 'qr_token', 'qr_submitted_at', 'qr_approved_at',
            'folio', 'created_at', 'updated_at'
        ]
        read_only_fields = ['qr_token', 'qr_submitted_at', 'qr_approved_at']

    def get_folio(self, obj):
        folio = obj.folio
        if folio:
            return FolioSerializer(folio).data
        return None


class BookingCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Booking
        fields = [
            'guest', 'room', 'room_type', 'check_in_date', 'check_out_date',
            'source', 'special_requests'
        ]

    def create(self, validated_data):
        booking = Booking.objects.create(**validated_data)
        return booking


class FolioChargePostSerializer(serializers.ModelSerializer):
    """Post charge to folio; taxes applied server-side."""
    class Meta:
        model = FolioCharge
        fields = ['folio', 'sector', 'description', 'quantity', 'unit_price', 'room_night_date']


class FolioPaymentPostSerializer(serializers.ModelSerializer):
    class Meta:
        model = FolioPayment
        fields = ['folio', 'amount', 'method', 'reference']


class ReceiptSerializer(serializers.ModelSerializer):
    class Meta:
        model = Receipt
        fields = ['id', 'receipt_number', 'amount', 'issued_at', 'folio_payment']


class MaintenanceRequestSerializer(serializers.ModelSerializer):
    room_number = serializers.CharField(source='room.number', read_only=True)

    class Meta:
        model = MaintenanceRequest
        fields = ['id', 'room', 'room_number', 'description', 'priority', 'status', 'created_at', 'approved_at']


class HousekeepingRequestSerializer(serializers.ModelSerializer):
    class Meta:
        model = HousekeepingRequest
        fields = ['id', 'room', 'description', 'status', 'created_at']
