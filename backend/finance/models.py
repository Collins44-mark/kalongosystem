"""
Finance: Tax (admin-only), Expense, StaffProfile, Salary.
Tax applied automatically; staff cannot edit per transaction.
"""
from decimal import Decimal
from django.db import models
from django.conf import settings


class Tax(models.Model):
    """Admin-defined tax (VAT, Tourism Levy, Service Charge). Auto-applied to charges."""
    INCLUSIVE = 'inclusive'
    EXCLUSIVE = 'exclusive'
    TYPE_CHOICES = [(INCLUSIVE, 'Inclusive'), (EXCLUSIVE, 'Exclusive')]

    name = models.CharField(max_length=64)
    code = models.CharField(max_length=16, unique=True)
    percentage = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('0'))
    tax_type = models.CharField(max_length=16, choices=TYPE_CHOICES, default=EXCLUSIVE)
    # Sectors this tax applies to (comma or JSON); empty = all
    sectors = models.JSONField(default=list, help_text='List of sector codes, e.g. ["rooms","restaurant"]. Empty = all.')
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'taxes'
        ordering = ['code']

    def __str__(self):
        return f'{self.name} ({self.percentage}%)'


class StaffProfile(models.Model):
    """HR: Staff record (name, role, sector, monthly salary). Linked to User optionally."""
    department = models.ForeignKey(
        'core.Department', on_delete=models.SET_NULL, null=True, related_name='staff_profiles'
    )
    full_name = models.CharField(max_length=128)
    job_title = models.CharField(max_length=128, blank=True)
    monthly_salary = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0'))
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'staff_profiles'
        ordering = ['full_name']

    def __str__(self):
        return f'{self.full_name} ({self.department or "—"})'


class Expense(models.Model):
    """Expense tracking per sector (maintenance, supplies, etc.)."""
    SECTOR_CHOICES = [
        ('rooms', 'Rooms'),
        ('restaurant', 'Restaurant'),
        ('bar', 'Bar'),
        ('housekeeping', 'Housekeeping'),
        ('activities', 'Activities'),
        ('general', 'General'),
    ]
    sector = models.CharField(max_length=32, choices=SECTOR_CHOICES)
    amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0'))
    description = models.CharField(max_length=256)
    category = models.CharField(max_length=64, blank=True)
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='recorded_expenses'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    # Optional link to maintenance/housekeeping request
    source_id = models.CharField(max_length=64, blank=True)
    source_type = models.CharField(max_length=32, blank=True)

    class Meta:
        db_table = 'expenses'
        ordering = ['-created_at']
        indexes = [models.Index(fields=['sector']), models.Index(fields=['created_at'])]

    def __str__(self):
        return f'{self.sector} {self.amount} - {self.description}'


class Salary(models.Model):
    """Monthly salary record (expense)."""
    staff = models.ForeignKey(StaffProfile, on_delete=models.CASCADE, related_name='salaries')
    amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0'))
    month = models.DateField()
    paid_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'salaries'
        ordering = ['-month']
        unique_together = [['staff', 'month']]

    def __str__(self):
        return f'{self.staff.full_name} {self.month} {self.amount}'
