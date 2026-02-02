from django.contrib import admin
from .models import Menu, MenuItem, Order, OrderItem


class OrderItemInline(admin.TabularInline):
    model = OrderItem
    extra = 0


@admin.register(Menu)
class MenuAdmin(admin.ModelAdmin):
    list_display = ['name', 'sector', 'is_active']


@admin.register(MenuItem)
class MenuItemAdmin(admin.ModelAdmin):
    list_display = ['name', 'menu', 'price', 'is_available']


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = ['id', 'sector', 'status', 'payment_intent', 'total_amount', 'created_at']
    list_filter = ['sector', 'status']
    inlines = [OrderItemInline]


@admin.register(OrderItem)
class OrderItemAdmin(admin.ModelAdmin):
    list_display = ['order', 'menu_item', 'quantity', 'unit_price', 'line_total']
