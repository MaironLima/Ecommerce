import { createBrowserRouter, redirect } from "react-router-dom";
import { useStore } from "../stores/store";
import App from "../App";
import ErrorPage from "../pages/ErrorPage";
import LoginPage from "../pages/LoginPage";
import RegisterPage from "../pages/RegisterPage";
import RecoverPage from "../pages/RecoverPage";
import MainPage from "../pages/MainPage";
import ProductPage from "../pages/ProductPage";
import CartPage from "../pages/CartPage";
import CheckoutPage from "../pages/CheckoutPage";
import OrdersPage from "../pages/OrdersPage";
import ProfilePage from "../pages/ProfilePage";

// Admin area (and Recharts) is code-split: customers never download it.
const admin = (pick: (m: typeof import("../pages/admin/AdminTables")) => React.ComponentType) => async () => ({
  Component: pick(await import("../pages/admin/AdminTables")),
});

const router = createBrowserRouter([
  { path: "/", element: <App />, errorElement: <ErrorPage />,
    children: [
      { path: "", element: <MainPage /> },
      { path: "cart", element: <CartPage /> },
      { path: "checkout", element: <CheckoutPage /> },
      { path: "orders", element: <OrdersPage /> },
      { path: "profile", element: <ProfilePage /> },
      // Guard runs only when entering /admin (a <Navigate> in the layout would also fire on logout).
      { path: "admin", loader: ({ request }) =>
          useStore.getState().accessToken ? null : redirect(`/auth/login?from=${encodeURIComponent(new URL(request.url).pathname)}`),
        lazy: async () => ({ Component: (await import("../pages/admin/AdminLayout")).default }),
        children: [
          { index: true, lazy: async () => ({ Component: (await import("../pages/admin/AdminDashboard")).default }) },
          { path: "products", lazy: async () => ({ Component: (await import("../pages/admin/AdminProducts")).default }) },
          { path: "orders", lazy: admin((m) => m.AdminOrders) },
          { path: "users", lazy: admin((m) => m.AdminUsers) },
          { path: "reviews", lazy: admin((m) => m.AdminReviews) },
          { path: "audit", lazy: admin((m) => m.AdminAudit) },
          { path: "logs", lazy: async () => ({ Component: (await import("../pages/admin/AdminLogs")).default }) },
        ] },
    ] },
  { path: "/auth", errorElement: <ErrorPage />,
    children: [
      { path: "login",    element: <LoginPage /> },
      { path: "register", element: <RegisterPage /> },
      { path: "recover", element: <RecoverPage /> },
    ] },
  { path: "/product", errorElement: <ErrorPage />,
    children: [ { path: ":id", element: <ProductPage /> } ] },
]);

export default router;
