from rest_framework import serializers
from django.contrib.auth.password_validation import validate_password
from .models import User, Role, Permission, Department, AuditLog


class PermissionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Permission
        fields = ['id', 'code', 'name', 'description', 'sector_scoped']


class RoleSerializer(serializers.ModelSerializer):
    permissions = PermissionSerializer(many=True, read_only=True)
    permission_ids = serializers.PrimaryKeyRelatedField(
        queryset=Permission.objects.all(), many=True, write_only=True, required=False
    )

    class Meta:
        model = Role
        fields = ['id', 'name', 'description', 'permissions', 'permission_ids', 'is_system']

    def create(self, validated_data):
        perm_ids = validated_data.pop('permission_ids', [])
        role = Role.objects.create(**validated_data)
        if perm_ids:
            role.permissions.set(perm_ids)
        return role

    def update(self, instance, validated_data):
        perm_ids = validated_data.pop('permission_ids', None)
        for k, v in validated_data.items():
            setattr(instance, k, v)
        instance.save()
        if perm_ids is not None:
            instance.permissions.set(perm_ids)
        return instance


class DepartmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Department
        fields = ['id', 'code', 'name']


class UserSerializer(serializers.ModelSerializer):
    role_name = serializers.CharField(source='role.name', read_only=True)
    department_code = serializers.CharField(source='department.code', read_only=True)
    permission_codes = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            'id', 'username', 'email', 'first_name', 'last_name', 'phone',
            'role', 'role_name', 'department', 'department_code', 'is_manager',
            'permission_codes', 'is_active', 'is_staff',
        ]
        read_only_fields = ['id']
        extra_kwargs = {'password': {'write_only': True, 'required': False}}

    def get_permission_codes(self, obj):
        return list(obj.get_all_permission_codes())

    def create(self, validated_data):
        password = validated_data.pop('password', None)
        user = User.objects.create(**validated_data)
        if password:
            user.set_password(password)
            user.save()
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop('password', None)
        for k, v in validated_data.items():
            setattr(instance, k, v)
        if password:
            instance.set_password(password)
        instance.save()
        return instance


class UserCreateSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, validators=[validate_password])

    class Meta:
        model = User
        fields = ['username', 'email', 'password', 'first_name', 'last_name', 'phone', 'role', 'department', 'is_manager']


class AuditLogSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source='user.get_full_name', read_only=True)

    class Meta:
        model = AuditLog
        fields = ['id', 'user', 'user_name', 'action', 'model_name', 'object_id', 'details', 'ip_address', 'created_at']
