import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, Navigate, RouterProvider } from "react-router";
import { usePeriods } from "@/api/client";
import { Layout } from "@/components/layout";
import { Loading } from "@/components/states";
import { ApprovalsPage } from "@/pages/approvals";
import { BonusIndexPage, BonusPage } from "@/pages/bonus";
import { CarrierPage } from "@/pages/carrier";
import { HealthPage } from "@/pages/health";
import { OverviewPage } from "@/pages/overview";
import "./index.css";

/** The home page is the latest period that has been run, or the latest one in the inbox. */
function LatestPeriod() {
  const { data: periods, isLoading } = usePeriods();
  if (isLoading) return <Loading />;
  const latest = periods?.find(entry => entry.hasRun) ?? periods?.[0];
  return latest ? <Navigate to={`/periods/${latest.period}`} replace /> : <p>No periods in the inbox.</p>;
}

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: "/", element: <LatestPeriod /> },
      { path: "/periods/:period", element: <OverviewPage /> },
      { path: "/periods/:period/carriers/:carrierId", element: <CarrierPage /> },
      { path: "/bonus", element: <BonusIndexPage /> },
      { path: "/bonus/:programId", element: <BonusPage /> },
      { path: "/approvals", element: <ApprovalsPage /> },
      { path: "/health", element: <HealthPage /> }
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
