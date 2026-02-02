from rest_framework import serializers
from .models import Tax, StaffProfile, Expense, Salary
from core.serializers import DepartmentSerializer


class TaxSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tax
        fields = ['id', 'name', 'code', 'percentage', 'tax_type', 'sectors', 'is_active']


class StaffProfileSerializer(serializers.ModelSerializer):
    department_name = serializers.CharField(source='department.name', read_only=True)

    class Meta:
        model = StaffProfile
        fields = ['id', 'department', 'department_name', 'full_name', 'job_title', 'monthly_salary', 'is_active', 'created_at']


class ExpenseSerializer(serializers.ModelSerializer):
    recorded_by_name = serializers.SerializerMethodField()

    def get_recorded_by_name(self, obj):
        return obj.recorded_by.get_full_name() if obj.recorded_by else ''

    class Meta:
        model = Expense
        fields = ['id', 'sector', 'amount', 'description', 'category', 'recorded_by', 'recorded_by_name', 'created_at', 'source_id', 'source_type']


class SalarySerializer(serializers.ModelSerializer):
    staff_name = serializers.CharField(source='staff.full_name', read_only=True)

    class Meta:
        model = Salary
        fields = ['id', 'staff', 'staff_name', 'amount', 'month', 'paid_at', 'created_at']
