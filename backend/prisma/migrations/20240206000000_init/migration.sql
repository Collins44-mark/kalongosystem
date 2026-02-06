-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_users" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "branchId" TEXT DEFAULT 'main',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "businesses" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "businessType" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "businesses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'TRIAL',
    "trialEndsAt" TIMESTAMP(3) NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_categories" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL DEFAULT 'main',
    "name" TEXT NOT NULL,
    "pricePerNight" DECIMAL(12,2) NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "room_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rooms" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL DEFAULT 'main',
    "categoryId" TEXT NOT NULL,
    "roomNumber" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'VACANT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL DEFAULT 'main',
    "roomId" TEXT NOT NULL,
    "guestName" TEXT NOT NULL,
    "guestPhone" TEXT,
    "checkIn" TIMESTAMP(3) NOT NULL,
    "checkOut" TIMESTAMP(3) NOT NULL,
    "nights" INTEGER NOT NULL,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
    "folioNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bar_items" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL DEFAULT 'main',
    "name" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "inventoryItemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bar_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bar_orders" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL DEFAULT 'main',
    "orderNumber" TEXT NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bar_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bar_order_items" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "barItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "totalPrice" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bar_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "restaurant_items" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL DEFAULT 'main',
    "name" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "inventoryItemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "restaurant_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "restaurant_orders" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL DEFAULT 'main',
    "orderNumber" TEXT NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "restaurant_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "restaurant_order_items" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "restaurantItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "totalPrice" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "restaurant_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_items" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL DEFAULT 'main',
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "minQuantity" INTEGER NOT NULL DEFAULT 5,
    "unitPrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_restocks" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL DEFAULT 'main',
    "inventoryItemId" TEXT NOT NULL,
    "quantityAdded" INTEGER NOT NULL,
    "oldQuantity" INTEGER NOT NULL,
    "newQuantity" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "inventory_restocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_requests" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL DEFAULT 'main',
    "roomId" TEXT,
    "description" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "amount" DECIMAL(12,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "maintenance_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL DEFAULT 'main',
    "category" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "description" TEXT,
    "expenseDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workers" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL DEFAULT 'main',
    "name" TEXT NOT NULL,
    "sector" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "monthlySalary" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_records" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL DEFAULT 'main',
    "workerId" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "payroll_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "business_users_userId_businessId_key" ON "business_users"("userId", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "businesses_businessId_key" ON "businesses"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_businessId_key" ON "subscriptions"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "rooms_businessId_branchId_roomNumber_key" ON "rooms"("businessId", "branchId", "roomNumber");

-- AddForeignKey
ALTER TABLE "business_users" ADD CONSTRAINT "business_users_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_users" ADD CONSTRAINT "business_users_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_categories" ADD CONSTRAINT "room_categories_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "room_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bar_items" ADD CONSTRAINT "bar_items_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bar_orders" ADD CONSTRAINT "bar_orders_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bar_order_items" ADD CONSTRAINT "bar_order_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "bar_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bar_order_items" ADD CONSTRAINT "bar_order_items_barItemId_fkey" FOREIGN KEY ("barItemId") REFERENCES "bar_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_items" ADD CONSTRAINT "restaurant_items_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_orders" ADD CONSTRAINT "restaurant_orders_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_order_items" ADD CONSTRAINT "restaurant_order_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "restaurant_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_order_items" ADD CONSTRAINT "restaurant_order_items_restaurantItemId_fkey" FOREIGN KEY ("restaurantItemId") REFERENCES "restaurant_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_restocks" ADD CONSTRAINT "inventory_restocks_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_restocks" ADD CONSTRAINT "inventory_restocks_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workers" ADD CONSTRAINT "workers_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_records" ADD CONSTRAINT "payroll_records_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_records" ADD CONSTRAINT "payroll_records_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "workers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

