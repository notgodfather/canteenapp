import { useEffect, useState } from "react";
import { db } from "./firebase";
import { collection, query, where, orderBy, getDocs } from "firebase/firestore";

export default function MyOrders({ user }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setOrders([]);
      setLoading(false);
      return;
    }

    async function fetchOrders() {
      setLoading(true);
      const ordersRef = collection(db, "orders");
      const q = query(
        ordersRef,
        where("userId", "==", user.uid),
        orderBy("createdAt", "desc")
      );
      const snapshot = await getDocs(q);
      const list = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setOrders(list);
      setLoading(false);
    }

    fetchOrders();
  }, [user]);

  if (loading) return <p>Loading your orders...</p>;
  if (orders.length === 0) return <p>You have no orders yet.</p>;

  return (
    <div>
      <h2>My Orders</h2>
      {orders.map((order) => (
        <div
          key={order.id}
          style={{
            border: "1px solid #ccc",
            margin: "10px 0",
            padding: "10px",
            borderRadius: "6px",
          }}
        >
          <p>
            <strong>Order ID:</strong> {order.orderId}
          </p>
          <p>
            <strong>Date:</strong>{" "}
            {order.createdAt?.toDate().toLocaleString() || "N/A"}
          </p>
          <p>
            <strong>Status:</strong> {order.status}
          </p>
          <p>
            <strong>Amount:</strong> Rs {order.amount} {order.currency}
          </p>
          <p>
            <strong>Items:</strong>
          </p>
          <ul>
            {order.items.map((item, idx) => (
              <li key={idx}>
                {item.name} x {item.quantity} (Rs {item.price * item.quantity})
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
