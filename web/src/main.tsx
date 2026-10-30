import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import { Layout } from "@/components/layout";
import { AccuracyPage } from "@/pages/accuracy";
import { BonusIndexPage, BonusPage } from "@/pages/bonus";
import { CarrierPage } from "@/pages/carrier";
import { CommissionsPage } from "@/pages/commissions";
import { HomePage } from "@/pages/home";
import "./index.css";

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: "/", element: <HomePage /> },
      { path: "/periods/:period", element: <CommissionsPage /> },
      { path: "/periods/:period/carriers/:carrierId", element: <CarrierPage /> },
      { path: "/bonus", element: <BonusIndexPage /> },
      { path: "/bonus/:programId", element: <BonusPage /> },
      { path: "/accuracy", element: <AccuracyPage /> }
    ]
  }
]);

const queryClient = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false } } });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>
);
