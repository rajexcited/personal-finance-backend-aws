### Error Handling Flow:

The retry and CircuitBreaker flow for DynamoDb operations

```text
┌─────────────────────────────────────────────────────────────┐
│                     DynamoDB Error                          │
└─────────────────────┬───────────────────────────────────────┘
                      │
              ┌───────▼───────────┐
              │ isServiceFailure? │
              └───────┬───────────┘
                      │
        ┌─────────────┼─────────────┐
        ▼             │             ▼
   ✅ YES             │            ❌ NO
 Service Failure      │        User/App Error
        │             │             │
        ▼             │             ▼
Circuit Breaker       │        Log Error
   onFailure()        │       Fail Fast
        │             │        No Circuit
        ▼             │       Breaker Impact
  May Trip Circuit    │             │
                      │             ▼
                      │      Return Error
                      │      to Caller
                      │
              ┌───────▼────────┐
              │  Retry Logic   │
              │ (if retryable) │
              └────────────────┘

```
