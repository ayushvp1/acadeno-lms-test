#!/bin/bash
# ==========================================================================
# ACADENO LMS — Auth Routes Verification Script
# ==========================================================================
# A quick cURL test script to confirm all API endpoints are mounted and accessible.
# Will return details on generic errors (e.g. 400 Bad Request) which proves the route is active.
# ==========================================================================

URL="http://localhost:3001/api/auth"

echo "----------------------------------------------------"
echo "  Testing /health"
echo "----------------------------------------------------"
curl -s -w "\nHTTP Status: %{http_code}\n\n" http://localhost:3001/health

echo "----------------------------------------------------"
echo "  Testing POST /api/auth/login"
echo "----------------------------------------------------"
curl -s -w "\nHTTP Status: %{http_code}\n\n" -X POST $URL/login -H "Content-Type: application/json" -d '{}'

echo "----------------------------------------------------"
echo "  Testing POST /api/auth/refresh"
echo "----------------------------------------------------"
curl -s -w "\nHTTP Status: %{http_code}\n\n" -X POST $URL/refresh

echo "----------------------------------------------------"
echo "  Testing POST /api/auth/logout"
echo "----------------------------------------------------"
curl -s -w "\nHTTP Status: %{http_code}\n\n" -X POST $URL/logout

echo "----------------------------------------------------"
echo "  Testing GET /api/auth/me (No Token -> 401 Expected)"
echo "----------------------------------------------------"
curl -s -w "\nHTTP Status: %{http_code}\n\n" -X GET $URL/me

echo "----------------------------------------------------"
echo "  Testing POST /api/auth/forgot-password"
echo "----------------------------------------------------"
curl -s -w "\nHTTP Status: %{http_code}\n\n" -X POST $URL/forgot-password -H "Content-Type: application/json" -d '{}'

echo "----------------------------------------------------"
echo "  Testing POST /api/auth/reset-password"
echo "----------------------------------------------------"
curl -s -w "\nHTTP Status: %{http_code}\n\n" -X POST $URL/reset-password -H "Content-Type: application/json" -d '{}'

echo "----------------------------------------------------"
echo "  Testing POST /api/auth/verify-mfa"
echo "----------------------------------------------------"
curl -s -w "\nHTTP Status: %{http_code}\n\n" -X POST $URL/verify-mfa -H "Content-Type: application/json" -d '{}'

echo "===================================================="
echo "If routes are properly mounted, all POST tests above"
echo "should return 400 Validation Error or 401 Unauthorized."
echo "If they return 404 Not Found, something isn't mounted check!"
echo "===================================================="
