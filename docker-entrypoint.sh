#!/bin/sh
set -e

echo "Starting Robotechy services..."

# Start order service in background (if env vars are set)
if [ -n "$MERCHANT_NSEC" ] && [ -n "$LIGHTNING_ADDRESS" ]; then
  echo "Starting order processing service..."
  cd /app/order-service
  node index.js &
  ORDER_PID=$!
  echo "Order service started (PID: $ORDER_PID)"
  cd /app
else
  echo "Warning: MERCHANT_NSEC or LIGHTNING_ADDRESS not set - order service disabled"
fi

# Start frontend static server
echo "Starting frontend on port 3000..."
exec serve -s dist -l 3000
