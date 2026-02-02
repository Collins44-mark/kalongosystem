from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import User, Role, Permission, Department, AuditLog


@admin.register(Permission)
class PermissionAdmin(admin.ModelAdmin):
    list_display = ['code', 'name', 'sector_scoped']


@admin.register(Role)
class RoleAdmin(admin.ModelAdmin):
    list_display = ['name', 'is_system']
    filter_horizontal = ['permissions']


@admin.register(Department)
class DepartmentAdmin(admin.ModelAdmin):
    list_display = ['code', 'name']


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ['username', 'email', 'first_name', 'role', 'department', 'is_manager', 'is_staff']
    list_filter = ['department', 'role', 'is_manager']
    fieldsets = BaseUserAdmin.fieldsets + (
        ('Kalongo', {'fields': ('role', 'department', 'phone', 'is_manager')}),
    )
    add_fieldsets = BaseUserAdmin.add_fieldsets + (
        ('Kalongo', {'fields': ('email', 'role', 'department', 'phone', 'is_manager')}),
    )


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ['user', 'action', 'model_name', 'object_id', 'created_at']
    list_filter = ['action', 'created_at']
    readonly_fields = ['user', 'action', 'model_name', 'object_id', 'details', 'ip_address', 'created_at']
