"""
Seed Kalongo Hotel: departments, permissions, roles, admin user, room types, rooms, taxes, sample menu.
"""
from decimal import Decimal
from django.core.management.base import BaseCommand
from django.db import transaction
from django.contrib.auth import get_user_model

User = get_user_model()


class Command(BaseCommand):
    help = 'Seed Kalongo Hotel with departments, permissions, roles, admin, room types, rooms, taxes, menu'

    @transaction.atomic
    def handle(self, *args, **options):
        from core.models import Department, Permission, Role
        from hotel.models import RoomType, Room, Guest
        from finance.models import Tax, StaffProfile
        from pos.models import Menu, MenuItem

        # Departments
        depts = [
            ('rooms', 'Rooms'),
            ('restaurant', 'Restaurant'),
            ('bar', 'Bar'),
            ('housekeeping', 'Housekeeping'),
            ('activities', 'Activities'),
            ('front_office', 'Front Office'),
            ('back_office', 'Back Office'),
        ]
        for code, name in depts:
            Department.objects.get_or_create(code=code, defaults={'name': name})
        self.stdout.write('Departments created.')

        # Permissions
        perms_data = [
            ('create_booking', 'Create Booking', 'Create and manage bookings'),
            ('view_bookings', 'View Bookings', 'View booking list'),
            ('check_out_booking', 'Check Out', 'Check out guest'),
            ('view_folio', 'View Folio', 'View guest folio'),
            ('post_charge', 'Post Charge', 'Post charge to folio'),
            ('post_payment', 'Post Payment', 'Record payment and issue receipt'),
            ('manage_rooms', 'Manage Rooms', 'Manage rooms and room types'),
            ('manage_room_types', 'Manage Room Types', 'Manage room types'),
            ('view_guests', 'View Guests', 'View and edit guests'),
            ('create_pos_order', 'Create POS Order', 'Create restaurant/bar order'),
            ('view_pos_orders', 'View POS Orders', 'View POS orders'),
            ('update_pos_order', 'Update POS Order', 'Update order status (kitchen)'),
            ('view_maintenance', 'View Maintenance', 'View maintenance requests'),
            ('view_housekeeping', 'View Housekeeping', 'View housekeeping requests'),
            ('manage_taxes', 'Manage Taxes', 'Configure taxes (admin)'),
            ('manage_staff', 'Manage Staff', 'Manage staff and users'),
            ('manage_salaries', 'Manage Salaries', 'Manage salaries'),
            ('view_expenses', 'View Expenses', 'View and record expenses'),
            ('view_reports', 'View Reports', 'View dashboard and reports'),
            ('manage_roles', 'Manage Roles', 'Create and edit roles and permissions'),
            ('view_audit_logs', 'View Audit Logs', 'View audit logs'),
        ]
        for code, name, desc in perms_data:
            Permission.objects.get_or_create(code=code, defaults={'name': name, 'description': desc})
        self.stdout.write('Permissions created.')

        # Manager role (all permissions)
        manager_role, _ = Role.objects.get_or_create(name='Manager', defaults={'is_system': True})
        manager_role.permissions.set(Permission.objects.all())
        manager_role.save()

        # Receptionist role
        reception_perms = Permission.objects.filter(code__in=[
            'create_booking', 'view_bookings', 'check_out_booking', 'view_folio', 'post_charge', 'post_payment',
            'view_guests', 'manage_rooms',
        ])
        reception_role, _ = Role.objects.get_or_create(name='Receptionist', defaults={'is_system': True})
        reception_role.permissions.set(reception_perms)

        # Restaurant staff
        rest_perms = Permission.objects.filter(code__in=['create_pos_order', 'view_pos_orders', 'update_pos_order'])
        rest_role, _ = Role.objects.get_or_create(name='Restaurant Staff', defaults={'is_system': True})
        rest_role.permissions.set(rest_perms)

        self.stdout.write('Roles created.')

        # Admin user
        if not User.objects.filter(username='admin').exists():
            admin_user = User.objects.create_superuser('admin', 'admin@kalongohotel.com', 'admin123')
            admin_user.first_name = 'Admin'
            admin_user.last_name = 'Kalongo'
            admin_user.is_manager = True
            admin_user.role = manager_role
            admin_user.department = Department.objects.get(code='back_office')
            admin_user.save()
            self.stdout.write('Admin user created: admin / admin123')
        else:
            self.stdout.write('Admin user already exists.')

        # Room types
        rt_std, _ = RoomType.objects.get_or_create(name='Standard', defaults={'base_price_per_night': Decimal('85000')})
        rt_deluxe, _ = RoomType.objects.get_or_create(name='Deluxe', defaults={'base_price_per_night': Decimal('120000')})
        rt_suite, _ = RoomType.objects.get_or_create(name='Suite', defaults={'base_price_per_night': Decimal('180000')})
        self.stdout.write('Room types created.')

        # Rooms
        for num, rtype in [('101', rt_std), ('102', rt_std), ('201', rt_deluxe), ('202', rt_deluxe), ('301', rt_suite)]:
            Room.objects.get_or_create(number=num, defaults={'room_type': rtype, 'status': 'vacant'})
        self.stdout.write('Rooms created.')

        # Taxes (Tanzania context)
        Tax.objects.get_or_create(code='VAT', defaults={
            'name': 'VAT', 'percentage': Decimal('18'), 'tax_type': 'exclusive', 'sectors': [], 'is_active': True
        })
        Tax.objects.get_or_create(code='TOURISM', defaults={
            'name': 'Tourism Levy', 'percentage': Decimal('1'), 'tax_type': 'exclusive', 'sectors': ['rooms'], 'is_active': True
        })
        self.stdout.write('Taxes created.')

        # Restaurant menu
        menu_r, _ = Menu.objects.get_or_create(name='Restaurant Menu', sector='restaurant', defaults={'is_active': True})
        for name, price in [
            ('Breakfast Set', 15000), ('Lunch Special', 12000), ('Dinner Plate', 18000),
            ('Coffee', 3000), ('Tea', 2000), ('Juice', 4000),
        ]:
            MenuItem.objects.get_or_create(menu=menu_r, name=name, defaults={'price': Decimal(str(price)), 'is_available': True})
        # Bar menu
        menu_b, _ = Menu.objects.get_or_create(name='Bar Menu', sector='bar', defaults={'is_active': True})
        for name, price in [('Soda', 2000), ('Beer', 4000), ('Water', 1500)]:
            MenuItem.objects.get_or_create(menu=menu_b, name=name, defaults={'price': Decimal(str(price)), 'is_available': True})
        self.stdout.write('Menus and items created.')

        # Sample guest for testing bookings
        from hotel.models import Guest
        Guest.objects.get_or_create(
            full_name='Sample Guest',
            defaults={'email': 'guest@example.com', 'phone': '+255700000000'}
        )
        self.stdout.write('Sample guest created.')

        self.stdout.write(self.style.SUCCESS('Seed complete.'))
