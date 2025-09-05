import { useEffect, useState } from "react";
import { signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import { auth, provider } from "./firebase";
import { db } from "./firebase";
import { collection, getDocs, addDoc, serverTimestamp } from "firebase/firestore";
import MyOrders from "./MyOrders";
function App() {
  const[showOrders,setShowOrders]=useState(false);
  const [menu, setMenu] = useState([]);
  const [cart, setCart] = useState([]);
  const [total, setTotal] = useState(0);
  const [user, setUser] = useState(null);
  const [placing, setPlacing] = useState(false);
  const [message, setMessage] = useState("");

  // Fetch menu from Firestore
  useEffect(() => {
    async function fetchMenu() {
      const menuCollection = collection(db, "menu");
      const menuSnapshot = await getDocs(menuCollection);
      const menuList = menuSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setMenu(menuList);
    }
    fetchMenu();
  }, []);

  // Firebase auth listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  // Login & Logout
  function Login() {
    signInWithPopup(auth, provider)
      .then((result) => setUser(result.user))
      .catch((error) => console.error("Login Error:", error));
  }
  function Logout() {
    signOut(auth)
      .then(() => setUser(null))
      .catch((error) => console.error("Logout Error:", error));
  }

  // Cart functions
  function addToCart(item) {
    const existingItem = cart.find((cartItem) => cartItem.id === item.id);
    if (existingItem) {
      setCart(
        cart.map((cartItem) =>
          cartItem.id === item.id
            ? { ...cartItem, quantity: cartItem.quantity + 1 }
            : cartItem
        )
      );
    } else {
      setCart([...cart, { ...item, quantity: 1 }]);
    }
    setTotal((prev) => prev + item.price);
  }
  function removeFromCart(item) {
    if (item.quantity === 1) {
      setCart(cart.filter((cartItem) => cartItem.id !== item.id));
      setTotal((prev) => prev - item.price);
    } else {
      setCart(
        cart.map((cartItem) =>
          cartItem.id === item.id
            ? { ...cartItem, quantity: cartItem.quantity - 1 }
            : cartItem
        )
      );
      setTotal((prev) => prev - item.price);
    }
  }

  // Place Order -> Create order on backend -> Open Cashfree -> Verify -> Save to Firestore
  async function placeOrder() {
    if (!user) {
      setMessage("Please login first");
      return;
    }
    if (cart.length === 0) {
      setMessage("Cart is empty");
      return;
    }

    try {
      setPlacing(true);
      setMessage("Creating order...");

      // 1) Ask backend to create order and get payment_session_id
      const resp = await fetch(`${import.meta.env.VITE_API_URL}/api/create-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cart: cart.map(({ id, name, price, quantity }) => ({ id, name, price, quantity })),
          user: {
            uid: user.uid,
            email: user.email,
            displayName: user.displayName,
            phoneNumber: user.phoneNumber,
          },
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Create order failed");

      const { orderId, paymentSessionId, amount, currency,envMode } = data;
      setMessage("Opening payment...");

      // 2) Open Cashfree Web Checkout (popup)
      if (!window.Cashfree) {
        throw new Error("Cashfree SDK not loaded");
      }
      // Use correct mode for your environment
      const mode = import.meta.env.PROD ? "production" : "sandbox";
      const cashfree = window.Cashfree({ mode: envMode });

      await cashfree.checkout({
        paymentSessionId,
        redirectTarget: "_modal", // popup; use "_self" if you want a full window takeover
      });

      setMessage("Verifying payment...");

      // 3) Verify order after checkout closes
      const vresp = await fetch(`${import.meta.env.VITE_API_URL}/api/verify-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      });
      const vdata = await vresp.json();
      if (!vresp.ok) throw new Error(vdata.error || "Verify failed");

      // Accept both PAID and SUCCESS as successful payment  
      if (vdata.status === "PAID" || vdata.status === "SUCCESS") {
        await addDoc(collection(db, "orders"), {
          userId: user.uid,
          orderId,
          items: cart.map(({ id, name, price, quantity }) => ({ id, name, price, quantity })),
          amount,
          currency: currency || "INR",
          status: "paid",
          createdAt: serverTimestamp(),
        });

        setMessage("Order placed! Thank you.");
        setCart([]);
        setTotal(0);
      } else {
        setMessage(`Payment status: ${vdata.status}. Order not placed.`);
      }
    } catch (e) {
      console.error(e);
      setMessage(e.message || "Something went wrong");
    } finally {
      setPlacing(false);
    }
  }
return (
  <div>
    {!user ? (
      <button onClick={Login}>Login With Google</button>
    ) : (
      <div>
        <p>Welcome, {user.displayName}</p>
        <button onClick={Logout}>Logout</button>
        <button onClick={()=> setShowOrders(false)}>Menu</button>
        <button onClick={()=>setShowOrders(true)}>My Orders</button>
        {showOrders ? (
          <MyOrders user={user} />
        ) : (
          <>
            <h1>College Canteen Menu</h1>
            {menu.map((item) => (
              <p key={item.id}>
                {item.name} - Rs {item.price}{" "}
                <button onClick={() => addToCart(item)}>Add to Cart</button>
              </p>
            ))}

            <h3>Cart</h3>
            {cart.map((item, index) => (
              <p key={item.id + "-" + index}>
                {item.name} (X{item.quantity}) - Rs {item.price * item.quantity}{" "}
                <button onClick={() => removeFromCart(item)}>Remove from Cart</button>
              </p>
            ))}

            <h3>Total: Rs {total}</h3>
            <button onClick={placeOrder} disabled={placing || cart.length === 0}>
              {placing ? "Processing..." : "Place Order"}
            </button>
            {message && <p>{message}</p>}
          </>
        )}
      </div>
    )}
  </div>
);
}

export default App;

