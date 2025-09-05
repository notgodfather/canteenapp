import express from "express";
import cors from "cors";
import axios from "axios";
import dotenv from "dotenv";
import crypto from "crypto";

dotenv.config();

const app = express();
app.use(cors({
  origin: process.env.CORS_ORIGIN
}));
app.use(express.json());

const isSandbox = process.env.CASHFREE_ENV !== "production";
const BASE_URL = isSandbox ? "https://sandbox.cashfree.com/pg" : "https://api.cashfree.com/pg";
const API_VERSION = "2025-01-01"; // use the version enabled on your account
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 8080}`;

function authHeaders() {
  return {
    "x-client-id": process.env.CASHFREE_CLIENT_ID,
    "x-client-secret": process.env.CASHFREE_CLIENT_SECRET,
    "x-api-version": API_VERSION,
  };
}

// Simple server-side amount calc
function computeAmountFromCart(cart) {
  if (!Array.isArray(cart)) return 0;
  let total = 0;
  for (const item of cart) {
    const price = Number(item.price || 0);
    const qty = Number(item.quantity || 0);
    if (price < 0 || qty < 0) throw new Error("Invalid price/qty");
    total += price * qty;
  }
  return Number(total.toFixed(2));
}

// Unique order_id
function makeOrderId() {
  return "order_" + crypto.randomBytes(12).toString("hex");
}

// Create Cashfree Order -> payment_session_id
app.post("/api/create-order", async (req, res) => {
  console.log("--- CREATE ORDER REQUEST RECEIVED ---");
  try {
    const { cart, user } = req.body || {};
    if (!user?.uid) return res.status(400).json({ error: "Missing user" });
    if (!Array.isArray(cart) || cart.length === 0) {
      return res.status(400).json({ error: "Cart is empty" });
    }

    const orderAmount = computeAmountFromCart(cart);
    if (orderAmount <= 0) return res.status(400).json({ error: "Invalid amount" });

    const orderId = makeOrderId();

    const payload = {
      order_id: orderId,
      order_amount: orderAmount,
      order_currency: "INR",
      customer_details: {
        customer_id: user.uid,
        customer_name: user.displayName || "Guest",
        customer_email: user.email || "noemail@example.com",
        customer_phone: user.phoneNumber || "9999999999",
      },
      order_note: "College canteen order",
      order_meta: {
        // Cashfree will replace {order_id} with the actual id
        return_url: `${PUBLIC_BASE_URL}/pg/return?order_id={order_id}`,
        // Webhook to receive final events; https required in production
        notify_url: `${PUBLIC_BASE_URL}/api/cashfree/webhook`,
      },
    };

    const resp = await axios.post(`${BASE_URL}/orders`, payload, { headers: authHeaders() });
    const { payment_session_id, cf_order_id } = resp.data || {};

    if (!payment_session_id) {
      return res.status(500).json({ error: "No payment_session_id from Cashfree", raw: resp.data });
    }

    return res.json({
      orderId,
      cfOrderId: cf_order_id,
      paymentSessionId: payment_session_id,
      amount: orderAmount,
      currency: "INR",
    });
  } catch (e) {
    console.error("Create order error:", e?.response?.data || e.message);
    return res.status(500).json({ error: "Create order failed", details: e?.response?.data || e.message });
  }
});

// Verify order status after checkout or on return_url landing
app.post("/api/verify-order", async (req, res) => {
  try {
    const { orderId } = req.body || {};
    if (!orderId) return res.status(400).json({ error: "Missing orderId" });

    const resp = await axios.get(`${BASE_URL}/orders/${orderId}`, { headers: authHeaders() });
    const data = resp.data || {};
    // Cashfree: consider order_status === "PAID" (or "SUCCESS" where applicable) as successful
    const status = data.order_status || "UNKNOWN"; // PAID | ACTIVE | EXPIRED | CANCELLED ...
    return res.json({ status });
  } catch (e) {
    console.error("Verify order error:", e?.response?.data || e.message);
    return res.status(500).json({ error: "Verify failed", details: e?.response?.data || e.message });
  }
});

// Optional: webhook to handle terminal events server-side (recommended)
app.post("/api/cashfree/webhook", express.json({ type: "*/*" }), async (req, res) => {
  try {
    const evt = req.body;
    // TODO: verify signature if you enable it in dashboard
    const orderId = evt?.data?.order?.order_id;
    const paymentStatus = evt?.data?.payment?.payment_status; // SUCCESS, FAILED, etc.
    if (orderId && paymentStatus === "SUCCESS") {
      // Mark order paid in your DB idempotently
      // If you maintain an orders table, update it here
    }
    res.sendStatus(200);
  } catch (err) {
    console.error("Webhook error:", err?.message);
    res.sendStatus(500);
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server running on ${PUBLIC_BASE_URL}`));
