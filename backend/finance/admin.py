from django.contrib import admin
from .models import Tax, StaffProfile, Expense, Salary


@admin.register(Tax)
class TaxAdmin(admin.ModelAdmin):
    list_display = ['name', 'code', 'percentage', 'tax_type', 'is_active']


@admin.register(StaffProfile)
class StaffProfileAdmin(admin.ModelAdmin):
    list_display = ['full_name', 'department', 'job_title', 'monthly_salary', 'is_active']


@admin.register(Expense)
class ExpenseAdmin(admin.ModelAdmin):
    list_display = ['sector', 'amount', 'description', 'recorded_by', 'created_at']


@admin.register(Salary)
class SalaryAdmin(admin.ModelAdmin):
    list_display = ['staff', 'amount', 'month', 'paid_at']
