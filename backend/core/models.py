"""
Core models: User, Role, Permission, Department (sector), AuditLog.
Dynamic RBAC: permissions = actions; roles = collections of permissions.
"""
from django.db import models
from django.contrib.auth.models import AbstractUser
from django.conf import settings


class Department(models.Model):
    """Sector for data isolation (Rooms, Restaurant, Bar, Housekeeping, Activities)."""
    SECTORS = [
        ('rooms', 'Rooms'),
        ('restaurant', 'Restaurant'),
        ('bar', 'Bar'),
        ('housekeeping', 'Housekeeping'),
        ('activities', 'Activities'),
        ('front_office', 'Front Office'),
        ('back_office', 'Back Office'),
    ]
    code = models.CharField(max_length=32, unique=True, choices=SECTORS)
    name = models.CharField(max_length=128)

    class Meta:
        db_table = 'departments'
        ordering = ['code']

    def __str__(self):
        return self.name


class Permission(models.Model):
    """Action-based permission (e.g. create_booking, post_charge, view_reports)."""
    code = models.CharField(max_length=64, unique=True)
    name = models.CharField(max_length=128)
    description = models.TextField(blank=True)
    # Optional: restrict to certain sectors
    sector_scoped = models.BooleanField(default=False, help_text='If True, user only sees own sector data when granted.')

    class Meta:
        db_table = 'permissions'
        ordering = ['code']

    def __str__(self):
        return f'{self.code} ({self.name})'


class Role(models.Model):
    """Collection of permissions. Manager/Admin can create & edit via UI."""
    name = models.CharField(max_length=128)
    description = models.TextField(blank=True)
    permissions = models.ManyToManyField(Permission, blank=True, related_name='roles', db_table='role_permissions')
    is_system = models.BooleanField(default=False, help_text='System roles cannot be deleted.')

    class Meta:
        db_table = 'roles'
        ordering = ['name']

    def __str__(self):
        return self.name


class User(AbstractUser):
    """Staff user with role and sector. No hard-coded roles; UI adapts to permissions."""
    email = models.EmailField(unique=True)
    role = models.ForeignKey(Role, on_delete=models.SET_NULL, null=True, blank=True, related_name='users')
    department = models.ForeignKey(Department, on_delete=models.SET_NULL, null=True, blank=True, related_name='staff')
    phone = models.CharField(max_length=32, blank=True)
    is_manager = models.BooleanField(default=False, help_text='Manager sees all sectors.')
    # For salary/HR (optional link to finance.StaffProfile)
    staff_profile = models.OneToOneField(
        'finance.StaffProfile', on_delete=models.SET_NULL, null=True, blank=True, related_name='user_account'
    )

    class Meta:
        db_table = 'users'
        ordering = ['username']

    def __str__(self):
        return f'{self.get_full_name() or self.username} ({self.department or "—"})'

    def has_perm_code(self, code: str) -> bool:
        """Check if user has a permission by code (via role)."""
        if not self.role:
            return False
        return self.role.permissions.filter(code=code).exists()

    def get_all_permission_codes(self):
        """Set of permission codes for frontend."""
        if not self.role:
            return set()
        return set(self.role.permissions.values_list('code', flat=True))

    def can_see_sector(self, sector_code: str) -> bool:
        """Manager sees all; otherwise only own department."""
        if self.is_manager:
            return True
        return self.department and self.department.code == sector_code


class AuditLog(models.Model):
    """Who did what, when."""
    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='audit_logs')
    action = models.CharField(max_length=64)
    model_name = models.CharField(max_length=64, blank=True)
    object_id = models.CharField(max_length=64, blank=True)
    details = models.JSONField(default=dict, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'audit_logs'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user']),
            models.Index(fields=['action']),
            models.Index(fields=['created_at']),
        ]

    def __str__(self):
        return f'{self.user} - {self.action} @ {self.created_at}'
