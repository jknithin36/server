#!/usr/bin/env bash
set -euo pipefail
PORT=${PORT:-3001}
base="http://localhost:$PORT"

pass() { echo "✅ $1"; }
fail() { echo "❌ $1"; exit 1; }

jq -V >/dev/null 2>&1 || fail "jq not installed"

curl -sf "$base/health" >/dev/null && pass "health"
curl -sf "$base/ready"  >/dev/null && pass "ready"

diag=$(curl -sf "$base/v1/diagram.mmd" | head -n1 || true)
[[ "$diag" =~ flowchart ]] && pass "diagram.mmd" || fail "diagram.mmd"

c1=$(curl -sf "$base/v1/rules" | jq -r '.count')
[[ "$c1" =~ ^[0-9]+$ && "$c1" -gt 0 ]] && pass "rules catalog ($c1 items)" || fail "rules catalog empty"

b1=$(curl -sf -X POST "$base/v1/check" -H "Content-Type: application/json" \
  -d '{"businessName":"Bottle Shop","industry":"Retail","state":"CA","city":"Los Angeles","employeesTotal":3,"sellsAlcohol":true,"alcoholSalesContext":"off-premise"}' \
  | jq -r '.count')
[[ "$b1" =~ ^[0-9]+$ && "$b1" -gt 0 ]] && pass "matcher (LA bottle shop: $b1 rules)" || fail "matcher (LA) failed"

b2=$(curl -sf -X POST "$base/v1/check" -H "Content-Type: application/json" \
  -d '{"businessName":"Cross-State Retailer","industry":"Retail","state":"NY","city":"New York City","employeesTotal":10,"sellsTaxable":true,"salesStates":["CA","NY"],"collectsFromCA":true}' \
  | jq '.grouped.state | map(.id) | map(select(startswith("ca-"))) | length')
[[ "$b2" -ge 1 ]] && pass "multi-state matching (found $b2 CA rules)" || fail "multi-state matching failed"

code=$(curl -s -o /dev/null -w "%{http_code}\n" -X POST "$base/v1/check" -H "Content-Type: application/json" -d '{"industry":"Restaurant"}')
[[ "$code" == "400" ]] && pass "validation (400 on bad payload)" || fail "validation not enforced"

hdr=$(curl -s -D - "$base/health" -o /dev/null | tr -d '\r' | grep -i '^X-Request-Id: ' | wc -l | tr -d ' ')
[[ "$hdr" == "1" ]] && pass "X-Request-Id header" || fail "missing X-Request-Id"

echo "🎉 All checks passed."
