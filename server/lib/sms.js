/**
 * Mockable SMS Service
 * Behind a simple interface so it can be integrated with Twilio/MSG91 later.
 */
function sendSMS(to, message) {
  console.log('\n=========================================');
  console.log(`[SMS OUTBOX] To: ${to}`);
  console.log(`[SMS OUTBOX] Message: ${message}`);
  console.log('=========================================\n');
  return Promise.resolve({ success: true, messageId: 'mock-id-' + Math.random().toString(36).substr(2, 9) });
}

module.exports = {
  sendSMS
};
