// email-service.js
const crypto = require("crypto");
const EventEmitter = require("events");

/**
 * Email status enumeration
 */
const EmailStatus = {
  PENDING: "pending",
  SENT: "sent",
  FAILED: "failed",
  RETRYING: "retrying",
  QUEUED: "queued",
};

/**
 * Circuit breaker states
 */
const CircuitState = {
  CLOSED: "closed",
  OPEN: "open",
  HALF_OPEN: "half_open",
};

/**
 * Simple logger implementation
 */
class Logger {
  static log(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${level.toUpperCase()}: ${message}`, meta);
  }

  static info(message, meta) {
    this.log("info", message, meta);
  }

  static error(message, meta) {
    this.log("error", message, meta);
  }

  static warn(message, meta) {
    this.log("warn", message, meta);
  }
}

/**
 * Mock email provider interface
 */
class MockEmailProvider {
  constructor(name, failureRate = 0.1, latency = 100) {
    this.name = name;
    this.failureRate = failureRate;
    this.latency = latency;
  }

  async sendEmail(email) {
    // Simulate network latency
    await new Promise((resolve) => setTimeout(resolve, this.latency));

    // Simulate random failures
    if (Math.random() < this.failureRate) {
      throw new Error(`${this.name} provider failed to send email`);
    }

    return {
      id: crypto.randomUUID(),
      status: "sent",
      timestamp: new Date().toISOString(),
      provider: this.name,
    };
  }
}

/**
 * Circuit breaker implementation
 */
class CircuitBreaker {
  constructor(threshold = 5, timeout = 60000) {
    this.threshold = threshold;
    this.timeout = timeout;
    this.failureCount = 0;
    this.state = CircuitState.CLOSED;
    this.nextAttempt = Date.now();
  }

  async call(fn) {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() < this.nextAttempt) {
        throw new Error("Circuit breaker is OPEN");
      }
      this.state = CircuitState.HALF_OPEN;
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  onSuccess() {
    this.failureCount = 0;
    this.state = CircuitState.CLOSED;
  }

  onFailure() {
    this.failureCount++;
    if (this.failureCount >= this.threshold) {
      this.state = CircuitState.OPEN;
      this.nextAttempt = Date.now() + this.timeout;
    }
  }
}

/**
 * Rate limiter implementation
 */
class RateLimiter {
  constructor(maxRequests = 100, windowMs = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.requests = [];
  }

  async isAllowed() {
    const now = Date.now();
    this.requests = this.requests.filter((time) => now - time < this.windowMs);

    if (this.requests.length >= this.maxRequests) {
      return false;
    }

    this.requests.push(now);
    return true;
  }

  getWaitTime() {
    if (this.requests.length === 0) return 0;
    const oldestRequest = Math.min(...this.requests);
    return Math.max(0, this.windowMs - (Date.now() - oldestRequest));
  }
}

/**
 * Email queue implementation
 */
class EmailQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
  }

  enqueue(email) {
    this.queue.push(email);
  }

  dequeue() {
    return this.queue.shift();
  }

  size() {
    return this.queue.length;
  }

  isEmpty() {
    return this.queue.length === 0;
  }
}

/**
 * Main EmailService class
 */

class EmailService extends EventEmitter {
  constructor(options = {}) {
    super();

    this.providers = options.providers || [
      new MockEmailProvider("Provider1", 0.2, 100),
      new MockEmailProvider("Provider2", 0.15, 150),
    ];

    this.maxRetries = options.maxRetries || 3;
    this.baseDelay = options.baseDelay || 1000;
    this.maxDelay = options.maxDelay || 30000;

    this.rateLimiter = new RateLimiter(
      options.rateLimit?.maxRequests || 100,
      options.rateLimit?.windowMs || 60000
    );

    this.circuitBreakers = new Map();
    this.providers.forEach((provider) => {
      this.circuitBreakers.set(provider.name, new CircuitBreaker());
    });

    this.sentEmails = new Map(); // For idempotency
    this.emailStatuses = new Map(); // For status tracking
    this.queue = new EmailQueue();

    this.processQueue();
  }

  /**
   * Generate idempotency key for email
   */
  generateIdempotencyKey(email) {
    if (email.idempotencyKey) {
      return email.idempotencyKey;
    }

    const content = JSON.stringify({
      to: email.to,
      subject: email.subject,
      body: email.body,
      from: email.from,
    });

    return crypto.createHash("sha256").update(content).digest("hex");
  }

  /**
   * Calculate exponential backoff delay
   */
  calculateBackoffDelay(attempt) {
    const delay = this.baseDelay * Math.pow(2, attempt);
    const jitter = Math.random() * 0.1 * delay;
    return Math.min(delay + jitter, this.maxDelay);
  }

  /**
   * Send email with retry logic and fallback
   */
  async sendEmail(email) {
    const idempotencyKey = this.generateIdempotencyKey(email);

    // Check for duplicate sends
    if (this.sentEmails.has(idempotencyKey)) {
      Logger.info("Duplicate email detected, returning cached result", {
        idempotencyKey,
      });
      return this.sentEmails.get(idempotencyKey);
    }

    // Check rate limiting
    if (!(await this.rateLimiter.isAllowed())) {
      const waitTime = this.rateLimiter.getWaitTime();
      Logger.warn("Rate limit exceeded, queuing email", { waitTime });

      this.emailStatuses.set(idempotencyKey, {
        status: EmailStatus.QUEUED,
        timestamp: new Date().toISOString(),
        attempts: 0,
      });

      this.queue.enqueue({ ...email, idempotencyKey });
      this.emit("queued", { idempotencyKey, email });

      return {
        id: idempotencyKey,
        status: EmailStatus.QUEUED,
        message: "Email queued due to rate limiting",
      };
    }

    return this.attemptSend(email, idempotencyKey);
  }

  /**
   * Attempt to send email with retry and fallback logic
   */
  async attemptSend(email, idempotencyKey) {
    let lastError;

    this.emailStatuses.set(idempotencyKey, {
      status: EmailStatus.PENDING,
      timestamp: new Date().toISOString(),
      attempts: 0,
    });

    for (
      let providerIndex = 0;
      providerIndex < this.providers.length;
      providerIndex++
    ) {
      const provider = this.providers[providerIndex];
      const circuitBreaker = this.circuitBreakers.get(provider.name);

      for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
        try {
          // Update status
          this.emailStatuses.set(idempotencyKey, {
            status: attempt === 0 ? EmailStatus.PENDING : EmailStatus.RETRYING,
            timestamp: new Date().toISOString(),
            attempts: attempt + 1,
            currentProvider: provider.name,
          });

          Logger.info("Attempting to send email", {
            provider: provider.name,
            attempt: attempt + 1,
            idempotencyKey,
          });

          const result = await circuitBreaker.call(() =>
            provider.sendEmail(email)
          );

          // Success - cache result and update status
          const successResult = {
            id: result.id,
            status: EmailStatus.SENT,
            provider: provider.name,
            timestamp: result.timestamp,
            attempts: attempt + 1,
          };

          this.sentEmails.set(idempotencyKey, successResult);
          this.emailStatuses.set(idempotencyKey, successResult);

          Logger.info("Email sent successfully", {
            provider: provider.name,
            attempt: attempt + 1,
            idempotencyKey,
          });

          this.emit("sent", { idempotencyKey, email, result: successResult });
          return successResult;
        } catch (error) {
          lastError = error;

          Logger.error("Email send attempt failed", {
            provider: provider.name,
            attempt: attempt + 1,
            error: error.message,
            idempotencyKey,
          });

          // If circuit breaker is open, try next provider
          if (error.message.includes("Circuit breaker is OPEN")) {
            Logger.warn("Circuit breaker is open, trying next provider", {
              provider: provider.name,
            });
            break;
          }

          // If not the last attempt, wait before retry
          if (attempt < this.maxRetries) {
            const delay = this.calculateBackoffDelay(attempt);
            Logger.info("Retrying after delay", {
              delay,
              attempt: attempt + 1,
            });
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        }
      }
    }

    // All providers and retries failed
    const failureResult = {
      id: idempotencyKey,
      status: EmailStatus.FAILED,
      error: lastError.message,
      timestamp: new Date().toISOString(),
      attempts: this.maxRetries + 1,
    };

    this.emailStatuses.set(idempotencyKey, failureResult);

    Logger.error("Email send failed after all retries", {
      error: lastError.message,
      idempotencyKey,
    });

    this.emit("failed", { idempotencyKey, email, error: lastError });
    return failureResult;
  }

  /**
   * Process queued emails
   */
  async processQueue() {
    if (this.processing || this.queue.isEmpty()) {
      setTimeout(() => this.processQueue(), 1000);
      return;
    }

    this.processing = true;

    try {
      while (!this.queue.isEmpty()) {
        if (await this.rateLimiter.isAllowed()) {
          const queuedEmail = this.queue.dequeue();
          Logger.info("Processing queued email", {
            idempotencyKey: queuedEmail.idempotencyKey,
          });

          // Process email without rate limiting check since we already checked
          this.attemptSend(queuedEmail, queuedEmail.idempotencyKey);
        } else {
          break; // Wait for rate limit to reset
        }
      }
    } finally {
      this.processing = false;
      setTimeout(() => this.processQueue(), 1000);
    }
  }

  /**
   * Get email status
   */
  getEmailStatus(idempotencyKey) {
    return this.emailStatuses.get(idempotencyKey) || null;
  }

  /**
   * Get provider statistics
   */
  getProviderStats() {
    return this.providers.map((provider) => ({
      name: provider.name,
      circuitBreakerState: this.circuitBreakers.get(provider.name).state,
      failureCount: this.circuitBreakers.get(provider.name).failureCount,
    }));
  }

  /**
   * Get service statistics
   */
  getStats() {
    const totalEmails = this.emailStatuses.size;
    const sentEmails = Array.from(this.emailStatuses.values()).filter(
      (status) => status.status === EmailStatus.SENT
    ).length;
    const failedEmails = Array.from(this.emailStatuses.values()).filter(
      (status) => status.status === EmailStatus.FAILED
    ).length;
    const queuedEmails = this.queue.size();

    return {
      totalEmails,
      sentEmails,
      failedEmails,
      queuedEmails,
      successRate:
        totalEmails > 0
          ? ((sentEmails / totalEmails) * 100).toFixed(2) + "%"
          : "0%",
      providers: this.getProviderStats(),
    };
  }
}

module.exports = {
  EmailService,
  EmailStatus,
  CircuitState,
  MockEmailProvider,
  Logger,
};
