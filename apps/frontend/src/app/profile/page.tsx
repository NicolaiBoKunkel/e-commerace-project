"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface ProductInOrder {
  _id: string;
  name: string;
  price: number;
  quantity: number;
}

interface Order {
  id: number;
  status: string;
  totalAmount: number;
  createdAt: string;
  user?: {
    id: number;
    username: string;
    email: string;
    role: string;
  };
  products: ProductInOrder[];
}

interface UserData {
  message: string;
  user: {
    id: number;
    username: string;
    email: string;
    role: string;
  };
  orders: Order[];
}

export default function ProfilePage() {
  const [data, setData] = useState<UserData | null>(null);
  const [error, setError] = useState("");
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
      return;
    }

    fetch("http://localhost:4000/user/profile", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
      .then(async (res) => {
        if (!res.ok) {
          const error = await res.json();
          throw new Error(error.message || "Failed to load profile");
        }
        return res.json();
      })
      .then(setData)
      .catch((err) => setError(err.message));
  }, [router]);

  if (error) return <p className="text-red-600 p-4">{error}</p>;
  if (!data) return <p className="p-4">Loading profile...</p>;

  return (
    <div className="max-w-3xl mx-auto mt-10 space-y-6">
      <h1 className="text-3xl font-bold">Welcome, {data.user.username}!</h1>
      <p>Email: {data.user.email}</p>
      <p>Role: {data.user.role}</p>

      <h2 className="text-2xl mt-8 mb-2 font-semibold">
        {data.user.role === "admin" ? "All Orders:" : "Your Orders:"}
      </h2>

      {data.orders.length === 0 ? (
        <p>No orders yet.</p>
      ) : (
        <ul className="space-y-4">
          {data.orders.map((order) => (
            <li
              key={order.id}
              className="border p-4 rounded shadow-sm bg-black space-y-2"
            >
              {data.user.role === "admin" && order.user && (
                <p>
                  <strong>User:</strong> {order.user.username} ({order.user.email})
                </p>
              )}

              <p>
                <strong>ID:</strong> {order.id}
              </p>

              <p>
                <strong>Status:</strong> {order.status}
              </p>
              <p>
                <strong>Total:</strong> ${order.totalAmount.toFixed(2)}
              </p>
              <p>
                <strong>Ordered:</strong>{" "}
                {new Date(order.createdAt).toLocaleString()}
              </p>

              <div>
                <strong>Products:</strong>
                <ul className="list-disc pl-6 mt-1">
                  {order.products.map((product) => (
                    <li key={product._id}>
                      {product.name} — ${product.price.toFixed(2)} × {product.quantity}
                    </li>
                  ))}
                </ul>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
