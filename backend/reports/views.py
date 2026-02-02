"""
Reports: Dashboard APIs, graph-ready endpoints, Excel/PDF/CSV export.
"""
from decimal import Decimal
from django.db.models import Sum, Count
from django.http import HttpResponse
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from datetime import timedelta
import io
import csv

from hotel.models import FolioCharge, FolioPayment, Booking
from pos.models import Order
from finance.models import Expense, Salary, StaffProfile


def _sales_queryset(user, from_date=None, to_date=None, sector=None):
    """Charges (folio) + POS completed. Sector filter for staff."""
    from django.db.models import Q
    q_charges = FolioCharge.objects.all()
    q_orders = Order.objects.filter(completed_at__isnull=False)
    if from_date:
        q_charges = q_charges.filter(posted_at__date__gte=from_date)
        q_orders = q_orders.filter(completed_at__date__gte=from_date)
    if to_date:
        q_charges = q_charges.filter(posted_at__date__lte=to_date)
        q_orders = q_orders.filter(completed_at__date__lte=to_date)
    if sector:
        q_charges = q_charges.filter(sector=sector)
        q_orders = q_orders.filter(sector=sector)
    if not getattr(user, 'is_manager', False) and getattr(user, 'department', None):
        sec = user.department.code
        q_charges = q_charges.filter(sector=sec)
        q_orders = q_orders.filter(sector=sec)
    return q_charges, q_orders


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def dashboard(request):
    """Manager dashboard: total sales, per sector, salaries, expenses, net profit."""
    if not request.user.has_perm_code('view_reports') and not request.user.is_superuser:
        return Response({'detail': 'Permission denied'}, status=403)
    today = timezone.now().date()
    month_start = today.replace(day=1)
    q_charges, q_orders = _sales_queryset(request.user)
    q_charges_today = FolioCharge.objects.filter(posted_at__date=today)
    q_orders_today = Order.objects.filter(completed_at__date=today)
    if not request.user.is_manager and request.user.department:
        sec = request.user.department.code
        q_charges_today = q_charges_today.filter(sector=sec)
        q_orders_today = q_orders_today.filter(sector=sec)
    total_sales = (q_charges.aggregate(s=Sum('amount_after_tax'))['s'] or Decimal('0')) + (q_orders.aggregate(s=Sum('total_amount'))['s'] or Decimal('0'))
    sales_today = (q_charges_today.aggregate(s=Sum('amount_after_tax'))['s'] or Decimal('0')) + (q_orders_today.aggregate(s=Sum('total_amount'))['s'] or Decimal('0'))
    sales_this_month = (FolioCharge.objects.filter(posted_at__date__gte=month_start).aggregate(s=Sum('amount_after_tax'))['s'] or Decimal('0')) + (Order.objects.filter(completed_at__date__gte=month_start).aggregate(s=Sum('total_amount'))['s'] or Decimal('0'))
    total_expenses = Expense.objects.aggregate(s=Sum('amount'))['s'] or Decimal('0')
    total_salaries = Salary.objects.aggregate(s=Sum('amount'))['s'] or Decimal('0')
    expenses_this_month = Expense.objects.filter(created_at__date__gte=month_start).aggregate(s=Sum('amount'))['s'] or Decimal('0')
    salaries_this_month = Salary.objects.filter(month__gte=month_start).aggregate(s=Sum('amount'))['s'] or Decimal('0')
    net_profit = total_sales - total_expenses - total_salaries
    net_profit_month = sales_this_month - expenses_this_month - salaries_this_month
    # Per sector (graph-ready)
    sectors_data = []
    for code, label in [('rooms', 'Rooms'), ('restaurant', 'Restaurant'), ('bar', 'Bar'), ('housekeeping', 'Housekeeping'), ('activities', 'Activities')]:
        if not request.user.is_manager and request.user.department and request.user.department.code != code:
            continue
        c = FolioCharge.objects.filter(sector=code).aggregate(s=Sum('amount_after_tax'))['s'] or Decimal('0')
        o = Order.objects.filter(sector=code).aggregate(s=Sum('total_amount'))['s'] or Decimal('0')
        sectors_data.append({'sector': code, 'label': label, 'total': float(c + o)})
    return Response({
        'total_sales': float(total_sales),
        'sales_today': float(sales_today),
        'sales_this_month': float(sales_this_month),
        'total_expenses': float(total_expenses),
        'total_salaries': float(total_salaries),
        'expenses_this_month': float(expenses_this_month),
        'salaries_this_month': float(salaries_this_month),
        'net_profit': float(net_profit),
        'net_profit_this_month': float(net_profit_month),
        'sales_per_sector': sectors_data,
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def graph_sales_daily(request):
    """Graph-ready: daily sales for last 30 days."""
    if not request.user.has_perm_code('view_reports') and not request.user.is_superuser:
        return Response({'detail': 'Permission denied'}, status=403)
    today = timezone.now().date()
    days = [today - timedelta(days=i) for i in range(30, -1, -1)]
    data = []
    for d in days:
        qc = FolioCharge.objects.filter(posted_at__date=d)
        qo = Order.objects.filter(completed_at__date=d)
        if not request.user.is_manager and request.user.department:
            sec = request.user.department.code
            qc = qc.filter(sector=sec)
            qo = qo.filter(sector=sec)
        c = qc.aggregate(s=Sum('amount_after_tax'))['s'] or Decimal('0')
        o = qo.aggregate(s=Sum('total_amount'))['s'] or Decimal('0')
        data.append({'date': d.isoformat(), 'total': float(c + o)})
    return Response({'data': data})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def export_excel(request):
    """Export sales/expenses report as Excel (primary)."""
    if not request.user.has_perm_code('view_reports') and not request.user.is_superuser:
        return Response({'detail': 'Permission denied'}, status=403)
    try:
        import openpyxl
        from openpyxl.styles import Font, Alignment
    except ImportError:
        return Response({'detail': 'openpyxl not installed'}, status=500)
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = 'Sales Summary'
    ws.append(['Report', 'Kalongo Hotel - Sales & Expenses'])
    ws.append([])
    ws.append(['Charges (Folio)', 'Amount'])
    total_charges = FolioCharge.objects.aggregate(s=Sum('amount_after_tax'))['s'] or Decimal('0')
    ws.append(['Total', float(total_charges)])
    ws.append([])
    ws.append(['POS Orders', 'Amount'])
    total_pos = Order.objects.filter(completed_at__isnull=False).aggregate(s=Sum('total_amount'))['s'] or Decimal('0')
    ws.append(['Total', float(total_pos)])
    ws.append([])
    ws.append(['Expenses', 'Amount'])
    total_exp = Expense.objects.aggregate(s=Sum('amount'))['s'] or Decimal('0')
    ws.append(['Total', float(total_exp)])
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    response = HttpResponse(buf.read(), content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    response['Content-Disposition'] = 'attachment; filename=kalongo_report.xlsx'
    return response


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def export_csv(request):
    """Export charges as CSV."""
    if not request.user.has_perm_code('view_reports') and not request.user.is_superuser:
        return Response({'detail': 'Permission denied'}, status=403)
    qs = FolioCharge.objects.select_related('folio', 'folio__booking').order_by('-posted_at')[:2000]
    if not request.user.is_manager and request.user.department:
        qs = qs.filter(sector=request.user.department.code)
    response = HttpResponse(content_type='text/csv')
    response['Content-Disposition'] = 'attachment; filename=charges.csv'
    w = csv.writer(response)
    w.writerow(['ID', 'Sector', 'Description', 'Amount', 'Posted At', 'Booking ID'])
    for c in qs:
        w.writerow([c.id, c.sector, c.description, c.amount_after_tax, c.posted_at, c.folio.booking_id if c.folio else ''])
    return response


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def tax_report(request):
    """TRA-friendly tax report: charges with tax breakdown."""
    if not request.user.has_perm_code('view_reports') and not request.user.is_superuser:
        return Response({'detail': 'Permission denied'}, status=403)
    from finance.models import Tax
    qc = FolioCharge.objects.aggregate(
        total_before=Sum('amount_before_tax'),
        total_tax=Sum('tax_amount'),
        total_after=Sum('amount_after_tax'),
    )
    qo = Order.objects.filter(completed_at__isnull=False).aggregate(
        total_before=Sum('total_before_tax'),
        total_tax=Sum('total_tax'),
        total_amount=Sum('total_amount'),
    )
    return Response({
        'folio_charges': qc,
        'pos_orders': qo,
    })
