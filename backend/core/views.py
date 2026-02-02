"""
Auth: JWT login/refresh. RBAC: roles, permissions, users, departments.
Permission check on every endpoint via HasPermission + permission_code.
"""
from rest_framework import generics, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from django.contrib.auth import get_user_model

from .models import User, Role, Permission, Department, AuditLog
from .serializers import (
    UserSerializer, UserCreateSerializer, RoleSerializer, PermissionSerializer,
    DepartmentSerializer, AuditLogSerializer,
)
from .permissions import HasPermission

User = get_user_model()


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        data = super().validate(attrs)
        data['user'] = UserSerializer(self.user).data
        return data


class CustomTokenObtainPairView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def me(request):
    """Current user + permissions (for frontend RoleGuard)."""
    return Response(UserSerializer(request.user).data)


# ---------- RBAC (Manager/Admin) ----------
class PermissionList(generics.ListAPIView):
    queryset = Permission.objects.all()
    serializer_class = PermissionSerializer
    permission_classes = [IsAuthenticated, HasPermission]
    permission_code = 'manage_roles'


class RoleListCreate(generics.ListCreateAPIView):
    queryset = Role.objects.all()
    serializer_class = RoleSerializer
    permission_classes = [IsAuthenticated, HasPermission]
    permission_code = 'manage_roles'


class RoleDetail(generics.RetrieveUpdateDestroyAPIView):
    queryset = Role.objects.all()
    serializer_class = RoleSerializer
    permission_classes = [IsAuthenticated, HasPermission]
    permission_code = 'manage_roles'


class DepartmentList(generics.ListAPIView):
    queryset = Department.objects.all()
    serializer_class = DepartmentSerializer
    permission_classes = [IsAuthenticated]


class UserList(generics.ListCreateAPIView):
    queryset = User.objects.all()
    permission_classes = [IsAuthenticated, HasPermission]
    permission_code = 'manage_staff'

    def get_serializer_class(self):
        return UserCreateSerializer if self.request.method == 'POST' else UserSerializer

    def get_serializer(self, *args, **kwargs):
        if self.request.method == 'POST':
            return UserCreateSerializer(*args, **kwargs)
        return UserSerializer(*args, **kwargs)


class UserDetail(generics.RetrieveUpdateDestroyAPIView):
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated, HasPermission]
    permission_code = 'manage_staff'


class AuditLogList(generics.ListAPIView):
    queryset = AuditLog.objects.all()[:500]
    serializer_class = AuditLogSerializer
    permission_classes = [IsAuthenticated, HasPermission]
    permission_code = 'view_audit_logs'
