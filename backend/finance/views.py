"""
Finance: Tax (admin only), StaffProfile, Expense, Salary.
Tax auto-applied; staff cannot edit per transaction.
"""
from rest_framework import generics
from rest_framework.permissions import IsAuthenticated
from django.db.models import Sum
from django.utils import timezone
from datetime import timedelta

from core.permissions import HasPermission
from .models import Tax, StaffProfile, Expense, Salary
from .serializers import TaxSerializer, StaffProfileSerializer, ExpenseSerializer, SalarySerializer


# ---------- Tax (Admin only) ----------
class TaxListCreate(generics.ListCreateAPIView):
    queryset = Tax.objects.all()
    serializer_class = TaxSerializer
    permission_classes = [IsAuthenticated, HasPermission]
    permission_code = 'manage_taxes'


class TaxDetail(generics.RetrieveUpdateDestroyAPIView):
    queryset = Tax.objects.all()
    serializer_class = TaxSerializer
    permission_classes = [IsAuthenticated, HasPermission]
    permission_code = 'manage_taxes'


# ---------- Staff ----------
class StaffProfileListCreate(generics.ListCreateAPIView):
    queryset = StaffProfile.objects.filter(is_active=True)
    serializer_class = StaffProfileSerializer
    permission_classes = [IsAuthenticated, HasPermission]
    permission_code = 'manage_staff'


class StaffProfileDetail(generics.RetrieveUpdateDestroyAPIView):
    queryset = StaffProfile.objects.all()
    serializer_class = StaffProfileSerializer
    permission_classes = [IsAuthenticated, HasPermission]
    permission_code = 'manage_staff'


# ---------- Expense ----------
class ExpenseListCreate(generics.ListCreateAPIView):
    queryset = Expense.objects.all().order_by('-created_at')
    serializer_class = ExpenseSerializer
    permission_classes = [IsAuthenticated, HasPermission]
    permission_code = 'view_expenses'

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if not user.is_manager and user.department:
            qs = qs.filter(sector=user.department.code)
        return qs

    def perform_create(self, serializer):
        serializer.save(recorded_by=self.request.user)


# ---------- Salary ----------
class SalaryListCreate(generics.ListCreateAPIView):
    queryset = Salary.objects.all().order_by('-month')
    serializer_class = SalarySerializer
    permission_classes = [IsAuthenticated, HasPermission]
    permission_code = 'manage_salaries'


class SalaryDetail(generics.RetrieveUpdateDestroyAPIView):
    queryset = Salary.objects.all()
    serializer_class = SalarySerializer
    permission_classes = [IsAuthenticated, HasPermission]
    permission_code = 'manage_salaries'
