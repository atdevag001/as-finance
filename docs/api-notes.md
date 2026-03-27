# AS Finance LMS — API Notes

## Conventions

- Base URL: `/api/v1`
- All responses: `{ data, meta?, error? }` envelope
- Pagination: `?page=1&pageSize=20` (max 100)
- Sorting: `?sortBy=created_at&sortOrder=desc`
- Date filters: `?startDate=2024-01-01&endDate=2024-01-31` (ISO 8601)
- Money: integer paise in request/response
- Dates: ISO 8601 strings
- Idempotency: `X-Idempotency-Key` header for finance writes
- Request ID: `X-Request-Id` auto-generated, returned in responses
- Auth: `Authorization: Bearer <access_token>`

## Error Response

```json
{
  "error": {
    "code": "BUSINESS_INVALID_STATUS_TRANSITION",
    "message": "Cannot transition from draft to approved",
    "details": {
      "currentStatus": "draft",
      "allowedTransitions": ["submitted"]
    },
    "requestId": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

## Key Error Codes

| Code | HTTP | Meaning |
|---|---|---|
| VALIDATION_* | 400 | Input validation failure |
| AUTH_* | 401 | Authentication failure |
| AUTHZ_* | 403 | Authorization failure |
| NOT_FOUND_* | 404 | Entity not found |
| CONFLICT_* | 409 | Idempotency/version conflict |
| BUSINESS_* | 422 | Business rule violation |
| RATE_LIMIT | 429 | Too many requests |

## Idempotency-Required Endpoints

- `POST /disbursements`
- `POST /collections`
- `POST /reversals`
- `POST /foreclosures`
- `POST /groups/:id/collections`
- `POST /penalties/calculate`

## Rate Limits

| Endpoint | Limit |
|---|---|
| Auth endpoints | 10/min per IP |
| API endpoints | 100/min per user |
| File uploads | 20/min per user |
| Report generation | 5/min per user |
