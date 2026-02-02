"""
Kalongo Hotel - API URLs
"""
from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from rest_framework_simplejwt.views import TokenRefreshView

from core.views import (
    CustomTokenObtainPairView, me,
    PermissionList, RoleListCreate, RoleDetail, DepartmentList,
    UserList, UserDetail, AuditLogList,
)
from hotel import views as hotel_views
from pos import views as pos_views
from finance import views as finance_views
from reports import views as reports_views

urlpatterns = [
    path('admin/', admin.site.urls),
    # Auth
    path('api/auth/login/', CustomTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/auth/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('api/auth/me/', me, name='me'),
    # RBAC
    path('api/permissions/', PermissionList.as_view(), name='permission-list'),
    path('api/roles/', RoleListCreate.as_view(), name='role-list'),
    path('api/roles/<int:pk>/', RoleDetail.as_view(), name='role-detail'),
    path('api/departments/', DepartmentList.as_view(), name='department-list'),
    path('api/users/', UserList.as_view(), name='user-list'),
    path('api/users/<int:pk>/', UserDetail.as_view(), name='user-detail'),
    path('api/audit-logs/', AuditLogList.as_view(), name='audit-log-list'),
    # Hotel
    path('api/room-types/', hotel_views.RoomTypeListCreate.as_view(), name='room-type-list'),
    path('api/room-types/<int:pk>/', hotel_views.RoomTypeDetail.as_view(), name='room-type-detail'),
    path('api/rooms/', hotel_views.RoomListCreate.as_view(), name='room-list'),
    path('api/rooms/<int:pk>/', hotel_views.RoomDetail.as_view(), name='room-detail'),
    path('api/guests/', hotel_views.GuestListCreate.as_view(), name='guest-list'),
    path('api/guests/<int:pk>/', hotel_views.GuestDetail.as_view(), name='guest-detail'),
    path('api/bookings/', hotel_views.BookingList.as_view(), name='booking-list'),
    path('api/bookings/create/', hotel_views.BookingCreate.as_view(), name='booking-create'),
    path('api/bookings/<int:pk>/', hotel_views.BookingDetail.as_view(), name='booking-detail'),
    path('api/bookings/<int:pk>/check-in/', hotel_views.check_in, name='booking-check-in'),
    path('api/bookings/<int:pk>/check-out/', hotel_views.check_out, name='booking-check-out'),
    path('api/bookings/<int:pk>/qr-approve/', hotel_views.qr_approve, name='booking-qr-approve'),
    path('api/bookings/<int:pk>/qr-image/', hotel_views.qr_image, name='booking-qr-image'),
    path('api/folio/<int:pk>/', hotel_views.FolioDetail.as_view(), name='folio-detail'),
    path('api/folio/charges/', hotel_views.post_charge, name='folio-post-charge'),
    path('api/folio/payments/', hotel_views.post_payment, name='folio-post-payment'),
    path('api/qr/<str:token>/', hotel_views.booking_qr, name='qr-booking'),
    path('api/qr/<str:token>/submit/', hotel_views.qr_submit, name='qr-submit'),
    path('api/maintenance/', hotel_views.MaintenanceRequestListCreate.as_view(), name='maintenance-list'),
    path('api/housekeeping/', hotel_views.HousekeepingRequestListCreate.as_view(), name='housekeeping-list'),
    # POS
    path('api/menus/', pos_views.MenuList.as_view(), name='menu-list'),
    path('api/menu-items/', pos_views.MenuItemList.as_view(), name='menu-item-list'),
    path('api/orders/', pos_views.OrderListCreate.as_view(), name='order-list'),
    path('api/orders/<int:pk>/', pos_views.OrderDetail.as_view(), name='order-detail'),
    path('api/orders/<int:pk>/status/', pos_views.order_status, name='order-status'),
    path('api/kitchen/orders/', pos_views.KitchenOrderList.as_view(), name='kitchen-orders'),
    # Finance
    path('api/taxes/', finance_views.TaxListCreate.as_view(), name='tax-list'),
    path('api/taxes/<int:pk>/', finance_views.TaxDetail.as_view(), name='tax-detail'),
    path('api/staff-profiles/', finance_views.StaffProfileListCreate.as_view(), name='staff-profile-list'),
    path('api/staff-profiles/<int:pk>/', finance_views.StaffProfileDetail.as_view(), name='staff-profile-detail'),
    path('api/expenses/', finance_views.ExpenseListCreate.as_view(), name='expense-list'),
    path('api/salaries/', finance_views.SalaryListCreate.as_view(), name='salary-list'),
    path('api/salaries/<int:pk>/', finance_views.SalaryDetail.as_view(), name='salary-detail'),
    # Reports
    path('api/reports/dashboard/', reports_views.dashboard, name='reports-dashboard'),
    path('api/reports/graph-sales-daily/', reports_views.graph_sales_daily, name='reports-graph-sales'),
    path('api/reports/export/excel/', reports_views.export_excel, name='reports-export-excel'),
    path('api/reports/export/csv/', reports_views.export_csv, name='reports-export-csv'),
    path('api/reports/tax/', reports_views.tax_report, name='reports-tax'),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
