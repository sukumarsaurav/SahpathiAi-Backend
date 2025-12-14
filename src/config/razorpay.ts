import Razorpay from 'razorpay';
import crypto from 'crypto';

// Initialize Razorpay instance
export const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID!,
    key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

// Verify Razorpay payment signature
export function verifyPaymentSignature(
    orderId: string,
    paymentId: string,
    signature: string
): boolean {
    const body = orderId + '|' + paymentId;
    const expectedSignature = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!)
        .update(body)
        .digest('hex');

    return expectedSignature === signature;
}
