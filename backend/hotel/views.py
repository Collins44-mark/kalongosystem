"""
Hotel: RoomType, Room, Guest, Booking, Folio, Charges, Payments, Receipts.
QR check-in. Maintenance & Housekeeping.
"""
from decimal import Decimal
from django.db import transaction
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
import qrcode
import io
import base64
import secrets

from core.permissions import HasPermission
from .models import (
    RoomType, Room, Guest, Booking, Folio, FolioCharge, FolioPayment, Receipt,
    MaintenanceRequest, HousekeepingRequest,
)
from .serializers import (
    RoomTypeSerializer, RoomSerializer, GuestSerializer, GuestMinSerializer,
    BookingSerializer, BookingCreateSerializer, FolioSerializer,
    FolioChargeSerializer, FolioChargePostSerializer,
    FolioPaymentSerializer, FolioPaymentPostSerializer,
    ReceiptSerializer, MaintenanceRequestSerializer, HousekeepingRequestSerializer,
)
from finance.models import Tax


def apply_taxes(amount_before_tax: Decimal, sector: str) -> tuple:
    """Apply active taxes for sector. Returns (tax_amount, amount_after_tax)."""
    taxes = Tax.objects.filter(is_active=True)
    # Filter by sector if tax has sectors list
    tax_amount = Decimal('0')
    for t in taxes:
        if t.sectors and sector not in t.sectors:
            continue
        if t.tax_type == 'exclusive':
            tax_amount += amount_before_tax * (t.percentage / 100)
        # inclusive: amount already includes tax; we still record
    amount_after_tax = amount_before_tax + tax_amount
    return tax_amount, amount_after_tax


# ---------- Room Types ----------
class RoomTypeListCreate(generics.ListCreateAPIView):
    queryset = RoomType.objects.filter(is_active=True)
    serializer_class = RoomTypeSerializer
    permission_classes = [IsAuthenticated, HasPermission]
    permission_code = 'manage_room_types'


class RoomTypeDetail(generics.RetrieveUpdateDestroyAPIView):
    queryset = RoomType.objects.all()
    serializer_class = RoomTypeSerializer
    permission_classes = [IsAuthenticated, HasPermission]
    permission_code = 'manage_room_types'


# ---------- Rooms ----------
class RoomListCreate(generics.ListCreateAPIView):
    queryset = Room.objects.all()
    serializer_class = RoomSerializer
    permission_classes = [IsAuthenticated, HasPermission]
    permission_code = 'manage_rooms'


class RoomDetail(generics.RetrieveUpdateDestroyAPIView):
    queryset = Room.objects.all()
    serializer_class = RoomSerializer
    permission_classes = [IsAuthenticated, HasPermission]
    permission_code = 'manage_rooms'


# ---------- Guests ----------
class GuestListCreate(generics.ListCreateAPIView):
    queryset = Guest.objects.all()
    serializer_class = GuestSerializer
    permission_classes = [IsAuthenticated, HasPermission]
    permission_code = 'view_guests'


class GuestDetail(generics.RetrieveUpdateAPIView):
    queryset = Guest.objects.all()
    serializer_class = GuestSerializer
    permission_classes = [IsAuthenticated, HasPermission]
    permission_code = 'view_guests'


# ---------- Bookings ----------
class BookingList(generics.ListAPIView):
    serializer_class = BookingSerializer
    permission_classes = [IsAuthenticated, HasPermission]
    permission_code = 'view_bookings'

    def get_queryset(self):
        qs = Booking.objects.select_related('guest', 'room', 'room_type').prefetch_related('folios').order_by('-created_at')
        user = self.request.user
        if not user.is_manager and user.department and user.department.code not in ('rooms', 'front_office'):
            return qs.none()
        return qs


class BookingCreate(generics.CreateAPIView):
    queryset = Booking.objects.all()
    serializer_class = BookingCreateSerializer
    permission_classes = [IsAuthenticated, HasPermission]
    permission_code = 'create_booking'

    def perform_create(self, serializer):
        with transaction.atomic():
            booking = serializer.save(created_by=self.request.user)
            booking.qr_token = secrets.token_urlsafe(32)
            booking.save()
            # Folio created at check-in, not at booking


class BookingDetail(generics.RetrieveUpdateAPIView):
    queryset = Booking.objects.select_related('guest', 'room', 'room_type').prefetch_related('folios')
    serializer_class = BookingSerializer
    permission_classes = [IsAuthenticated, HasPermission]
    permission_code = 'view_bookings'


@api_view(['POST'])
@permission_classes([IsAuthenticated, HasPermission])
def check_in(request, pk):
    """Check-in: create primary folio, set room occupied, booking checked_in."""
    permission_code = 'create_booking'
    if not request.user.has_perm_code(permission_code) and not request.user.is_superuser:
        return Response({'detail': 'Permission denied'}, status=403)
    try:
        booking = Booking.objects.get(pk=pk)
    except Booking.DoesNotExist:
        return Response({'detail': 'Not found'}, status=404)
    if booking.status != Booking.STATUS_CONFIRMED and booking.status != Booking.STATUS_PENDING:
        return Response({'detail': 'Booking not in confirmable state'}, status=400)
    with transaction.atomic():
        folio = Folio.objects.create(booking=booking, is_primary=True, status='open')
        booking.status = Booking.STATUS_CHECKED_IN
        booking.room.status = Room.STATUS_OCCUPIED
        booking.room.save(update_fields=['status'])
        booking.save(update_fields=['status'])
    return Response(FolioSerializer(folio).data)


@api_view(['POST'])
@permission_classes([IsAuthenticated, HasPermission])
def check_out(request, pk):
    """Check-out: close folio, room vacant, booking checked_out. Generate final invoice data."""
    if not request.user.has_perm_code('check_out_booking') and not request.user.is_superuser:
        return Response({'detail': 'Permission denied'}, status=403)
    try:
        booking = Booking.objects.get(pk=pk)
    except Booking.DoesNotExist:
        return Response({'detail': 'Not found'}, status=404)
    folio = booking.folio
    if not folio:
        return Response({'detail': 'No folio'}, status=400)
    if folio.status == 'closed':
        return Response({'detail': 'Folio already closed'}, status=400)
    with transaction.atomic():
        folio.status = 'closed'
        folio.closed_at = timezone.now()
        folio.save(update_fields=['status', 'closed_at'])
        booking.status = Booking.STATUS_CHECKED_OUT
        booking.room.status = Room.STATUS_VACANT
        booking.room.save(update_fields=['status'])
        booking.save(update_fields=['status'])
    return Response({
        'folio': FolioSerializer(folio).data,
        'invoice': {
            'total_charges': float(folio.total_charges),
            'total_payments': float(folio.total_payments),
            'balance': float(folio.balance),
        }
    })


# ---------- Folio ----------
class FolioDetail(generics.RetrieveAPIView):
    queryset = Folio.objects.prefetch_related('charges', 'payments')
    serializer_class = FolioSerializer
    permission_classes = [IsAuthenticated, HasPermission]
    permission_code = 'view_folio'


@api_view(['POST'])
@permission_classes([IsAuthenticated, HasPermission])
def post_charge(request):
    """Post charge to open folio. Taxes applied automatically."""
    if not request.user.has_perm_code('post_charge') and not request.user.is_superuser:
        return Response({'detail': 'Permission denied'}, status=403)
    ser = FolioChargePostSerializer(data=request.data)
    if not ser.is_valid():
        return Response(ser.errors, status=400)
    folio = ser.validated_data['folio']
    if not folio.can_post_charges():
        return Response({'detail': 'Cannot post to closed folio'}, status=400)
    amount_before = ser.validated_data['quantity'] * ser.validated_data['unit_price']
    tax_amount, amount_after = apply_taxes(amount_before, ser.validated_data['sector'])
    charge = FolioCharge.objects.create(
        folio=folio,
        sector=ser.validated_data['sector'],
        description=ser.validated_data['description'],
        quantity=ser.validated_data['quantity'],
        unit_price=ser.validated_data['unit_price'],
        amount_before_tax=amount_before,
        tax_amount=tax_amount,
        amount_after_tax=amount_after,
        posted_by=request.user,
        room_night_date=ser.validated_data.get('room_night_date'),
    )
    return Response(FolioChargeSerializer(charge).data, status=201)


@api_view(['POST'])
@permission_classes([IsAuthenticated, HasPermission])
def post_payment(request):
    """Record payment on folio. Optionally issue receipt."""
    if not request.user.has_perm_code('post_payment') and not request.user.is_superuser:
        return Response({'detail': 'Permission denied'}, status=403)
    ser = FolioPaymentPostSerializer(data=request.data)
    if not ser.is_valid():
        return Response(ser.errors, status=400)
    payment = FolioPayment.objects.create(
        folio=ser.validated_data['folio'],
        amount=ser.validated_data['amount'],
        method=ser.validated_data['method'],
        reference=ser.validated_data.get('reference', ''),
        confirmed_by=request.user,
    )
    # Issue receipt when payment confirmed
    issue_receipt = request.data.get('issue_receipt', True)
    if issue_receipt:
        from django.conf import settings
        receipt_number = f"RCP-{payment.id}-{timezone.now().strftime('%Y%m%d')}"
        Receipt.objects.create(
            folio_payment=payment,
            receipt_number=receipt_number,
            amount=payment.amount,
            issued_by=request.user,
        )
        payment.receipt_issued = True
        payment.save(update_fields=['receipt_issued'])
    return Response(FolioPaymentSerializer(payment).data, status=201)


# ---------- QR Check-in ----------
@api_view(['GET'])
@permission_classes([AllowAny])
def booking_qr(request, token):
    """Get booking by QR token (for guest self check-in page)."""
    try:
        booking = Booking.objects.select_related('guest', 'room', 'room_type').get(qr_token=token)
    except Booking.DoesNotExist:
        return Response({'detail': 'Invalid or expired link'}, status=404)
    if booking.qr_approved_at:
        return Response({'detail': 'Already checked in', 'booking': BookingSerializer(booking).data})
    return Response(BookingSerializer(booking).data)


@api_view(['POST'])
def qr_submit(request, token):
    """Guest submits check-in form (public; no auth)."""
    try:
        booking = Booking.objects.get(qr_token=token)
    except Booking.DoesNotExist:
        return Response({'detail': 'Invalid or expired link'}, status=404)
    if booking.qr_submitted_at:
        return Response({'detail': 'Already submitted'}, status=400)
    # Update guest info from form
    guest = booking.guest
    for field in ['full_name', 'email', 'phone', 'id_type', 'id_number', 'nationality']:
        if field in request.data:
            setattr(guest, field, request.data[field])
    guest.save()
    booking.qr_submitted_at = timezone.now()
    booking.save(update_fields=['qr_submitted_at'])
    return Response({'status': 'submitted', 'message': 'Waiting for reception approval'})


@api_view(['POST'])
@permission_classes([IsAuthenticated, HasPermission])
def qr_approve(request, pk):
    """Reception approves QR check-in; then check_in can be done."""
    if not request.user.has_perm_code('create_booking') and not request.user.is_superuser:
        return Response({'detail': 'Permission denied'}, status=403)
    try:
        booking = Booking.objects.get(pk=pk)
    except Booking.DoesNotExist:
        return Response({'detail': 'Not found'}, status=404)
    booking.qr_approved_at = timezone.now()
    booking.save(update_fields=['qr_approved_at'])
    return Response({'status': 'approved'})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def qr_image(request, pk):
    """Generate QR code image for booking (URL to self check-in)."""
    try:
        booking = Booking.objects.get(pk=pk)
    except Booking.DoesNotExist:
        return Response({'detail': 'Not found'}, status=404)
    if not booking.qr_token:
        booking.qr_token = secrets.token_urlsafe(32)
        booking.save(update_fields=['qr_token'])
    # Frontend base URL from request or env
    base_url = request.build_absolute_uri('/').rstrip('/')
    if base_url.count('/') >= 3:
        # API base; replace with frontend
        base_url = request.META.get('HTTP_ORIGIN', base_url)
    url = f"{base_url}/check-in/qr/{booking.qr_token}"
    qr = qrcode.QRCode(version=1, box_size=6, border=2)
    qr.add_data(url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    buf.seek(0)
    import base64
    b64 = base64.b64encode(buf.read()).decode()
    return Response({'qr_data_url': f'data:image/png;base64,{b64}', 'url': url})


# ---------- Maintenance & Housekeeping ----------
class MaintenanceRequestListCreate(generics.ListCreateAPIView):
    queryset = MaintenanceRequest.objects.select_related('room')
    serializer_class = MaintenanceRequestSerializer
    permission_classes = [IsAuthenticated, HasPermission]
    permission_code = 'view_maintenance'

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


class HousekeepingRequestListCreate(generics.ListCreateAPIView):
    queryset = HousekeepingRequest.objects.all()
    serializer_class = HousekeepingRequestSerializer
    permission_classes = [IsAuthenticated, HasPermission]
    permission_code = 'view_housekeeping'

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)
