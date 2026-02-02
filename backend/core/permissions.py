"""
Dynamic RBAC: check permission by code on every API endpoint.
Sector-based isolation: staff only sees their sector unless manager.
"""
from rest_framework import permissions


class HasPermission(permissions.BasePermission):
    """Require specific permission code (e.g. create_booking, post_charge)."""
    permission_code = None  # Override in view

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_superuser:
            return True
        code = getattr(view, 'permission_code', None) or self.permission_code
        if not code:
            return True
        return request.user.has_perm_code(code)


class HasPermissionOrReadOnly(HasPermission):
    """Allow GET/HEAD/OPTIONS without permission; others require permission_code."""
    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return request.user and request.user.is_authenticated
        return super().has_permission(request, view)


def require_perm(perm_code: str):
    """Class-level: set permission_code on view."""
    def decorator(cls):
        cls.permission_code = perm_code
        return cls
    return decorator
