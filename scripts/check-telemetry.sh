#!/bin/bash
# Check plannotator install telemetry from CloudWatch

hours=${1:-24}

echo "Fetching telemetry from last ${hours}h..."
echo ""

aws logs tail /aws/lambda/plannotator-telemetry \
  --since "${hours}h" \
  --format short 2>/dev/null | grep '\[INFO\]' | grep -o '{.*}' | while read -r line; do
    echo "$line" | python3 -m json.tool 2>/dev/null || echo "$line"
  done
