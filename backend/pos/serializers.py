from rest_framework import serializers
from .models import Menu, MenuItem, Order, OrderItem
from hotel.serializers import FolioSerializer


class MenuItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = MenuItem
        fields = ['id', 'name', 'price', 'description', 'is_available', 'sort_order']


class MenuSerializer(serializers.ModelSerializer):
    items = MenuItemSerializer(many=True, read_only=True)

    class Meta:
        model = Menu
        fields = ['id', 'name', 'sector', 'is_active', 'items']


class OrderItemSerializer(serializers.ModelSerializer):
    menu_item_name = serializers.CharField(source='menu_item.name', read_only=True)

    class Meta:
        model = OrderItem
        fields = ['id', 'menu_item', 'menu_item_name', 'quantity', 'unit_price', 'line_total', 'notes']


class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)
    folio_detail = FolioSerializer(source='folio', read_only=True)

    class Meta:
        model = Order
        fields = [
            'id', 'sector', 'status', 'payment_intent', 'folio', 'folio_detail',
            'table_or_room', 'created_by', 'created_at', 'updated_at', 'completed_at',
            'total_before_tax', 'total_tax', 'total_amount', 'items'
        ]


class OrderCreateSerializer(serializers.Serializer):
    sector = serializers.ChoiceField(choices=[Order.SECTOR_RESTAURANT, Order.SECTOR_BAR])
    payment_intent = serializers.ChoiceField(choices=[Order.PAYMENT_PAY_NOW, Order.PAYMENT_POST_TO_ROOM], default=Order.PAYMENT_PAY_NOW)
    folio_id = serializers.IntegerField(required=False, allow_null=True)
    table_or_room = serializers.CharField(required=False, allow_blank=True)
    items = serializers.ListField(
        child=serializers.DictField(),
        help_text='[{"menu_item_id": 1, "quantity": 2, "notes": ""}]'
    )

    def create(self, validated_data):
        from decimal import Decimal
        from .models import MenuItem
        from finance.models import Tax
        items_data = validated_data.pop('items')
        folio_id = validated_data.pop('folio_id', None)
        folio = None
        if folio_id and validated_data['payment_intent'] == Order.PAYMENT_POST_TO_ROOM:
            from hotel.models import Folio
            folio = Folio.objects.filter(pk=folio_id).first()
        order = Order.objects.create(
            sector=validated_data['sector'],
            payment_intent=validated_data['payment_intent'],
            folio=folio,
            table_or_room=validated_data.get('table_or_room', ''),
            created_by=self.context['request'].user,
        )
        total_before = Decimal('0')
        for row in items_data:
            mi = MenuItem.objects.get(pk=row['menu_item_id'])
            qty = int(row.get('quantity', 1))
            unit = mi.price
            line_total = unit * qty
            total_before += line_total
            OrderItem.objects.create(
                order=order,
                menu_item=mi,
                quantity=qty,
                unit_price=unit,
                line_total=line_total,
                notes=row.get('notes', ''),
            )
        # Apply taxes (simplified: one pass)
        taxes = Tax.objects.filter(is_active=True)
        tax_total = Decimal('0')
        for t in taxes:
            if t.sectors and order.sector not in t.sectors:
                continue
            if t.tax_type == 'exclusive':
                tax_total += total_before * (t.percentage / 100)
        order.total_before_tax = total_before
        order.total_tax = tax_total
        order.total_amount = total_before + tax_total
        order.save()
        return order


class OrderStatusUpdateSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=[Order.STATUS_NEW, Order.STATUS_PREPARING, Order.STATUS_READY, Order.STATUS_SERVED, Order.STATUS_CANCELLED])
