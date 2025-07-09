// email-service.test.js
const {
  EmailService,
  EmailStatus,
  MockEmailProvider,
} = require("./email-service");

// Simple test framework
class TestFramework {
  constructor() {
    this.tests = [];
    this.passed = 0;
    this.failed = 0;
  }

  describe(description, fn) {
    console.log(`\n=== ${description} ===`);
    fn();
  }

  it(description, fn) {
    this.tests.push({ description, fn });
  }

  async run() {
    console.log("Running tests...\n");

    for (const test of this.tests) {
      try {
        await test.fn();
        console.log(`✓ ${test.description}`);
        this.passed++;
      } catch (error) {
        console.log(`✗ ${test.description}`);
        console.log(`  Error: ${error.message}`);
        this.failed++;
      }
    }

    console.log(`\n=== Test Results ===`);
    console.log(`Passed: ${this.passed}`);
    console.log(`Failed: ${this.failed}`);
    console.log(`Total: ${this.tests.length}`);
  }

  expect(actual) {
    return {
      toBe: (expected) => {
        if (actual !== expected) {
          throw new Error(`Expected ${expected}, but got ${actual}`);
        }
      },
      toEqual: (expected) => {
        if (JSON.stringify(actual) !== JSON.stringify(expected)) {
          throw new Error(
            `Expected ${JSON.stringify(expected)}, but got ${JSON.stringify(
              actual
            )}`
          );
        }
      },
      toBeNull: () => {
        if (actual !== null) {
          throw new Error(`Expected null, but got ${actual}`);
        }
      },
      toBeUndefined: () => {
        if (actual !== undefined) {
          throw new Error(`Expected undefined, but got ${actual}`);
        }
      },
      toContain: (expected) => {
        if (!actual.includes(expected)) {
          throw new Error(`Expected "${actual}" to contain "${expected}"`);
        }
      },
      toBeGreaterThan: (expected) => {
        if (actual <= expected) {
          throw new Error(`Expected ${actual} to be greater than ${expected}`);
        }
      },
      toBeLessThan: (expected) => {
        if (actual >= expected) {
          throw new Error(`Expected ${actual} to be less than ${expected}`);
        }
      },
    };
  }
}

// Test utilities
function createMockEmail(overrides = {}) {
  return {
    to: "test@example.com",
    from: "sender@example.com",
    subject: "Test Subject",
    body: "Test Body",
    ...overrides,
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Run tests
async function runTests() {
  const test = new TestFramework();

  test.describe("MockEmailProvider", () => {
    test.it("should send email successfully", async () => {
      const provider = new MockEmailProvider("TestProvider", 0, 10);
      const email = createMockEmail();

      const result = await provider.sendEmail(email);

      test.expect(result.status).toBe("sent");
      test.expect(result.provider).toBe("TestProvider");
      test.expect(result.id).toBeDefined();
    });

    test.it("should fail based on failure rate", async () => {
      const provider = new MockEmailProvider("FailingProvider", 1, 10);
      const email = createMockEmail();

      let failed = false;
      try {
        await provider.sendEmail(email);
      } catch (error) {
        failed = true;
        test.expect(error.message).toContain("FailingProvider provider failed");
      }

      test.expect(failed).toBe(true);
    });
  });

  test.describe("EmailService - Basic Functionality", () => {
    test.it("should send email successfully", async () => {
      const service = new EmailService({
        providers: [new MockEmailProvider("Provider1", 0, 10)],
      });
      const email = createMockEmail();

      const result = await service.sendEmail(email);

      test.expect(result.status).toBe(EmailStatus.SENT);
      test.expect(result.provider).toBe("Provider1");
    });

    test.it("should generate idempotency key", () => {
      const service = new EmailService();
      const email = createMockEmail();

      const key1 = service.generateIdempotencyKey(email);
      const key2 = service.generateIdempotencyKey(email);

      test.expect(key1).toBe(key2);
    });

    test.it("should use provided idempotency key", () => {
      const service = new EmailService();
      const email = createMockEmail({ idempotencyKey: "custom-key" });

      const key = service.generateIdempotencyKey(email);

      test.expect(key).toBe("custom-key");
    });
  });

  test.describe("EmailService - Idempotency", () => {
    test.it("should prevent duplicate sends", async () => {
      const service = new EmailService({
        providers: [new MockEmailProvider("Provider1", 0, 10)],
      });
      const email = createMockEmail();

      const result1 = await service.sendEmail(email);
      const result2 = await service.sendEmail(email);

      test.expect(result1.id).toBe(result2.id);
      test.expect(result1.status).toBe(EmailStatus.SENT);
      test.expect(result2.status).toBe(EmailStatus.SENT);
    });
  });

  test.describe("EmailService - Retry Logic", () => {
    test.it("should retry on failure", async () => {
      const service = new EmailService({
        providers: [new MockEmailProvider("FailingProvider", 0.7, 10)],
        maxRetries: 2,
        baseDelay: 10,
      });
      const email = createMockEmail();

      const result = await service.sendEmail(email);

      // Should eventually succeed or fail after retries
      test
        .expect([EmailStatus.SENT, EmailStatus.FAILED])
        .toContain(result.status);
    });

    test.it("should calculate exponential backoff", () => {
      const service = new EmailService({ baseDelay: 100 });

      const delay1 = service.calculateBackoffDelay(0);
      const delay2 = service.calculateBackoffDelay(1);
      const delay3 = service.calculateBackoffDelay(2);

      test.expect(delay1).toBeGreaterThan(90);
      test.expect(delay2).toBeGreaterThan(180);
      test.expect(delay3).toBeGreaterThan(360);
    });
  });

  test.describe("EmailService - Fallback", () => {
    test.it("should fallback to second provider", async () => {
      const providers = [
        new MockEmailProvider("FailingProvider", 1, 10),
        new MockEmailProvider("WorkingProvider", 0, 10),
      ];
      const service = new EmailService({ providers, maxRetries: 1 });
      const email = createMockEmail();

      const result = await service.sendEmail(email);

      test.expect(result.status).toBe(EmailStatus.SENT);
      test.expect(result.provider).toBe("WorkingProvider");
    });
  });

  test.describe("EmailService - Rate Limiting", () => {
    test.it("should queue emails when rate limited", async () => {
      const service = new EmailService({
        providers: [new MockEmailProvider("Provider1", 0, 10)],
        rateLimit: { maxRequests: 1, windowMs: 1000 },
      });

      const email1 = createMockEmail({ subject: "Email 1" });
      const email2 = createMockEmail({ subject: "Email 2" });

      const result1 = await service.sendEmail(email1);
      const result2 = await service.sendEmail(email2);

      test.expect(result1.status).toBe(EmailStatus.SENT);
      test.expect(result2.status).toBe(EmailStatus.QUEUED);
    });
  });

  test.describe("EmailService - Status Tracking", () => {
    test.it("should track email status", async () => {
      const service = new EmailService({
        providers: [new MockEmailProvider("Provider1", 0, 10)],
      });
      const email = createMockEmail();

      const result = await service.sendEmail(email);
      const status = service.getEmailStatus(result.id);

      test.expect(status.status).toBe(EmailStatus.SENT);
      test.expect(status.attempts).toBe(1);
    });

    test.it("should return null for unknown email", () => {
      const service = new EmailService();
      const status = service.getEmailStatus("unknown-key");

      test.expect(status).toBeNull();
    });
  });

  test.describe("EmailService - Statistics", () => {
    test.it("should provide service statistics", async () => {
      const service = new EmailService({
        providers: [new MockEmailProvider("Provider1", 0, 10)],
      });
      const email = createMockEmail();

      await service.sendEmail(email);
      const stats = service.getStats();

      test.expect(stats.totalEmails).toBe(1);
      test.expect(stats.sentEmails).toBe(1);
      test.expect(stats.failedEmails).toBe(0);
      test.expect(stats.successRate).toBe("100.00%");
    });

    test.it("should provide provider statistics", () => {
      const service = new EmailService({
        providers: [
          new MockEmailProvider("Provider1", 0, 10),
          new MockEmailProvider("Provider2", 0, 10),
        ],
      });

      const stats = service.getProviderStats();

      test.expect(stats.length).toBe(2);
      test.expect(stats[0].name).toBe("Provider1");
      test.expect(stats[1].name).toBe("Provider2");
    });
  });

  test.describe("EmailService - Events", () => {
    test.it("should emit sent event", (done) => {
      const service = new EmailService({
        providers: [new MockEmailProvider("Provider1", 0, 10)],
      });
      const email = createMockEmail();

      service.on("sent", (event) => {
        test.expect(event.result.status).toBe(EmailStatus.SENT);
        done();
      });

      service.sendEmail(email);
    });

    test.it("should emit failed event", (done) => {
      const service = new EmailService({
        providers: [new MockEmailProvider("FailingProvider", 1, 10)],
        maxRetries: 0,
      });
      const email = createMockEmail();

      service.on("failed", (event) => {
        test.expect(event.error).toBeDefined();
        done();
      });

      service.sendEmail(email);
    });
  });

  await test.run();
}

// Run tests if this file is executed directly
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = { runTests };
