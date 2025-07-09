# Resilient Email Service

A robust, production-ready email sending service built in JavaScript with comprehensive error handling, retry logic, fallback mechanisms, and monitoring capabilities.

## Features

### Core Features

- ✅ **Retry Logic with Exponential Backoff**: Automatically retries failed sends with intelligent backoff
- ✅ **Provider Fallback**: Seamlessly switches between email providers on failure
- ✅ **Idempotency**: Prevents duplicate email sends using content-based or custom keys
- ✅ **Rate Limiting**: Configurable rate limiting with automatic queuing
- ✅ **Status Tracking**: Comprehensive tracking of all email sending attempts
- ✅ **Event-Driven Architecture**: Emits events for monitoring and integration

### Advanced Features

- ✅ **Circuit Breaker Pattern**: Prevents cascading failures by temporarily disabling failing providers
- ✅ **Queue System**: Automatic queuing and processing of rate-limited emails
- ✅ **Comprehensive Logging**: Structured logging for debugging and monitoring
- ✅ **Statistics & Monitoring**: Detailed metrics on service performance
- ✅ **Mock Providers**: Built-in mock email providers for testing and development

## Installation

```bash
# Clone or download the files
npm init -y  # If you need a package.json
```

## Quick Start

```javascript
const { EmailService, MockEmailProvider } = require("./email-service");

// Create service with default configuration
const emailService = new EmailService();

// Send an email
const result = await emailService.sendEmail({
  to: "recipient@example.com",
  from: "sender@example.com",
  subject: "Hello World",
  body: "This is a test email",
});

console.log("Email sent:", result);
```

## Configuration

### Basic Configuration

```javascript
const emailService = new EmailService({
  providers: [
    new MockEmailProvider("Provider1", 0.1, 100), // 10% failure rate, 100ms latency
    new MockEmailProvider("Provider2", 0.2, 150), // 20% failure rate, 150ms latency
  ],
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 30000,
  rateLimit: {
    maxRequests: 100,
    windowMs: 60000, // 100 requests per minute
  },
});
```

### Configuration Options

| Option                  | Type   | Default            | Description                                        |
| ----------------------- | ------ | ------------------ | -------------------------------------------------- |
| `providers`             | Array  | Two mock providers | Array of email provider instances                  |
| `maxRetries`            | Number | 3                  | Maximum number of retry attempts                   |
| `baseDelay`             | Number | 1000               | Base delay in milliseconds for exponential backoff |
| `maxDelay`              | Number | 30000              | Maximum delay in milliseconds                      |
| `rateLimit.maxRequests` | Number | 100                | Maximum requests per window                        |
| `rateLimit.windowMs`    | Number | 60000              | Rate limiting window in milliseconds               |

## API Reference

### EmailService

#### Methods

##### `sendEmail(email)`

Sends an email with retry logic and fallback.

**Parameters:**

- `email` (Object): Email object containing `to`, `from`, `subject`, `body`, and optional `idempotencyKey`

**Returns:** Promise resolving to result object with `id`, `status`, `provider`, `timestamp`, and `attempts`

##### `getEmailStatus(idempotencyKey)`

Retrieves the current status of an email.

**Parameters:**

- `idempotencyKey` (String): The idempotency key for the email

**Returns:** Status object or null if not found

##### `getStats()`

Gets comprehensive service statistics.

**Returns:** Object with service metrics including success rate, provider stats, etc.

##### `getProviderStats()`

Gets statistics for all configured providers.

**Returns:** Array of provider statistics

#### Events

- `sent`: Emitted when an email is successfully sent
- `failed`: Emitted when an email fails after all retries
- `queued`: Emitted when an email is queued due to rate limiting

### MockEmailProvider

#### Constructor

```javascript
new MockEmailProvider(name, failureRate, latency);
```

**Parameters:**

- `name` (String): Provider name
- `failureRate` (Number): Failure rate between 0 and 1
- `latency` (Number): Simulated network latency in milliseconds

## Usage Examples

### Basic Usage

```javascript
const { EmailService } = require("./email-service");

const service = new EmailService();

// Send a simple email
const result = await service.sendEmail({
  to: "user@example.com",
  from: "app@example.com",
  subject: "Welcome!",
  body: "Thanks for joining our service!",
});
```

### With Event Listeners

```javascript
const service = new EmailService();

service.on("sent", (event) => {
  console.log(`Email sent via ${event.result.provider}`);
});

service.on("failed", (event) => {
  console.error(`Email failed: ${event.error.message}`);
});

service.on("queued", (event) => {
  console.log("Email queued due to rate limiting");
});
```

### Custom Idempotency

```javascript
const result = await service.sendEmail({
  to: "user@example.com",
  from: "app@example.com",
  subject: "Order Confirmation",
  body: "Your order #12345 has been confirmed",
  idempotencyKey: "order-12345-confirmation",
});
```

### Monitoring and Statistics

```javascript
// Get service statistics
const stats = service.getStats();
console.log(`Success rate: ${stats.successRate}`);
console.log(`Total emails: ${stats.totalEmails}`);

// Get provider statistics
const providerStats = service.getProviderStats();
providerStats.forEach((provider) => {
  console.log(`${provider.name}: ${provider.circuitBreakerState}`);
});

// Track individual email status
const emailId = result.id;
const status = service.getEmailStatus(emailId);
console.log(`Email status: ${status.status}`);
```

## Error Handling

The service handles various types of errors:

### Provider Errors

- Network timeouts
- API rate limiting
- Authentication failures
- Service unavailability

### Service Errors

- Rate limiting (emails are queued)
- Circuit breaker activation
- All providers failing

### Example Error Handling

```javascript
try {
  const result = await service.sendEmail(email);

  if (result.status === "failed") {
    console.error("Email failed:", result.error);
  } else if (result.status === "queued") {
    console.log("Email queued, will be processed later");
  }
} catch (error) {
  console.error("Unexpected error:", error);
}
```

## Testing

### Running Tests

```bash
node email-service.test.js
```

### Test Coverage

The test suite covers:

- Basic email sending functionality
- Retry logic and exponential backoff
- Provider fallback mechanisms
- Idempotency guarantees
- Rate limiting and queuing
- Circuit breaker pattern
- Event emission
- Statistics and monitoring
- Error handling edge cases

### Writing Custom Tests

```javascript
const { EmailService, MockEmailProvider } = require("./email-service");

// Create service with failing provider for testing
const service = new EmailService({
  providers: [new MockEmailProvider("TestProvider", 1, 10)], // 100% failure rate
  maxRetries: 2,
});

const result = await service.sendEmail({
  to: "test@example.com",
  from: "app@example.com",
  subject: "Test",
  body: "Test body",
});

// Should fail after retries
console.log(result.status); // 'failed'
```

## Architecture

### Core Components

1. **EmailService**: Main orchestrator handling all email operations
2. **MockEmailProvider**: Simulated email providers for testing
3. **CircuitBreaker**: Prevents cascading failures
4. **RateLimiter**: Controls request rate
5. **EmailQueue**: Manages queued emails
6. **Logger**: Structured logging system

### Design Patterns

- **Strategy Pattern**: Pluggable email providers
- **Circuit Breaker**: Fault tolerance
- **Observer Pattern**: Event-driven architecture
- **Command Pattern**: Queued email processing
- **Decorator Pattern**: Retry and fallback logic

### Data Flow

1. Email received → Idempotency check
2. Rate limiting check → Queue if needed
3. Provider selection → Circuit breaker check
4. Send attempt → Retry on failure
5. Provider fallback → Status tracking
6. Event emission → Result return

## Production Considerations

### Performance

- Use connection pooling for HTTP requests
- Implement batch sending for high volume
- Consider database persistence for queue
- Add metrics collection (Prometheus, etc.)

### Security

- Validate email addresses
- Sanitize email content
- Implement authentication for providers
- Use secure credential storage

### Monitoring

- Set up alerts for high failure rates
- Monitor circuit breaker state changes
- Track queue depth and processing times
- Log all email attempts for audit trails

### Scaling

- Consider Redis for distributed rate limiting
- Use message queues (RabbitMQ, SQS) for high volume
- Implement horizontal scaling with load balancers
- Add database persistence for email history

## Assumptions and Limitations

### Assumptions

- Email providers follow standard HTTP API patterns
- Network failures are transient and worth retrying
- Rate limiting is applied per service instance
- Email content is already validated and sanitized

### Limitations

- In-memory storage (not persistent across restarts)
- No email content validation
- Mock providers only (no real email sending)
- Single-threaded processing
- No encryption for stored email data

### Future Enhancements

- Database persistence
- Real email provider integrations
- Email templating system
- Advanced analytics and reporting
- Distributed rate limiting
- Email content validation
- Webhook support for delivery status

## Contributing

1. Follow the existing code style
2. Write tests for new features
3. Update documentation
4. Follow SOLID principles
5. Add proper error handling

## License

MIT License - feel free to use this code in your projects.
