// example.js
const {
  EmailService,
  MockEmailProvider,
  EmailStatus,
} = require("./email-service");

async function runExample() {
  console.log("=== Email Service Example ===\n");

  // Create email service with custom configuration
  const emailService = new EmailService({
    providers: [
      new MockEmailProvider("SendGrid", 0.3, 100), // 30% failure rate
      new MockEmailProvider("Mailgun", 0.2, 150), // 20% failure rate
    ],
    maxRetries: 3,
    baseDelay: 500,
    rateLimit: {
      maxRequests: 5,
      windowMs: 10000, // 5 requests per 10 seconds
    },
  });

  // Set up event listeners
  emailService.on("sent", (event) => {
    console.log(`✓ Email sent successfully via ${event.result.provider}`);
  });

  emailService.on("failed", (event) => {
    console.log(`✗ Email failed: ${event.error.message}`);
  });

  emailService.on("queued", (event) => {
    console.log(`⏳ Email queued due to rate limiting`);
  });

  // Example emails
  const emails = [
    {
      to: "user1@example.com",
      from: "noreply@myapp.com",
      subject: "Welcome to our service!",
      body: "Thank you for signing up!",
    },
    {
      to: "user2@example.com",
      from: "noreply@myapp.com",
      subject: "Password reset",
      body: "Click here to reset your password",
    },
    {
      to: "user3@example.com",
      from: "noreply@myapp.com",
      subject: "Order confirmation",
      body: "Your order has been confirmed",
    },
    {
      to: "user4@example.com",
      from: "noreply@myapp.com",
      subject: "Newsletter",
      body: "This month in our newsletter...",
    },
    {
      to: "user5@example.com",
      from: "noreply@myapp.com",
      subject: "Account verification",
      body: "Please verify your email address",
    },
    {
      to: "user6@example.com",
      from: "noreply@myapp.com",
      subject: "Special offer",
      body: "Limited time offer just for you!",
    },
  ];

  console.log("Sending emails...\n");

  // Send emails
  const results = [];
  for (const email of emails) {
    try {
      const result = await emailService.sendEmail(email);
      results.push(result);
      console.log(`Email to ${email.to}: ${result.status}`);

      // Check status
      const status = emailService.getEmailStatus(result.id);
      if (status) {
        console.log(`  Status: ${status.status}, Attempts: ${status.attempts}`);
      }
    } catch (error) {
      console.log(`Email to ${email.to}: Error - ${error.message}`);
    }
  }

  // Test idempotency
  console.log("\n=== Testing Idempotency ===");
  const duplicateEmail = emails[0];
  const result1 = await emailService.sendEmail(duplicateEmail);
  const result2 = await emailService.sendEmail(duplicateEmail);

  console.log(`First send: ${result1.id} (${result1.status})`);
  console.log(`Second send: ${result2.id} (${result2.status})`);
  console.log(`Are IDs the same? ${result1.id === result2.id}`);

  // Wait a bit for queued emails to process
  console.log("\n=== Waiting for queued emails to process ===");
  await new Promise((resolve) => setTimeout(resolve, 5000));

  // Display statistics
  console.log("\n=== Service Statistics ===");
  const stats = emailService.getStats();
  console.log(`Total emails: ${stats.totalEmails}`);
  console.log(`Sent: ${stats.sentEmails}`);
  console.log(`Failed: ${stats.failedEmails}`);
  console.log(`Queued: ${stats.queuedEmails}`);
  console.log(`Success rate: ${stats.successRate}`);

  console.log("\n=== Provider Statistics ===");
  stats.providers.forEach((provider) => {
    console.log(
      `${provider.name}: ${provider.circuitBreakerState} (failures: ${provider.failureCount})`
    );
  });

  // Show some email statuses
  console.log("\n=== Email Status Examples ===");
  results.slice(0, 3).forEach((result) => {
    const status = emailService.getEmailStatus(result.id);
    if (status) {
      console.log(`Email ${result.id.substring(0, 8)}...:`);
      console.log(`  Status: ${status.status}`);
      console.log(`  Attempts: ${status.attempts}`);
      console.log(
        `  Provider: ${status.currentProvider || status.provider || "N/A"}`
      );
      console.log(`  Timestamp: ${status.timestamp}`);
    }
  });
}

// Run the example
if (require.main === module) {
  runExample().catch(console.error);
}

module.exports = { runExample };
