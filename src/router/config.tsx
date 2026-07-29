import type { RouteObject } from "react-router-dom";
import NotFound from "../pages/NotFound";
import Home from "../pages/home/page";
import StaffLayout from "../components/feature/StaffLayout";
import AuthGuard from "../components/feature/AuthGuard";
import StaffDashboard from "../pages/staff/dashboard/page";
import UatAgentPage from "../pages/staff/uat-agent/page";
import LocalSetupPage from "../pages/staff/uat-agent/local-setup/page";
import ReleaseReviewPage from "../pages/staff/uat-agent/releases/page";

const routes: RouteObject[] = [
  {
    path: "/",
    element: <Home />,
  },
  {
    path: "/staff",
    element: (
      <AuthGuard>
        <StaffLayout />
      </AuthGuard>
    ),
    children: [
      {
        index: true,
        element: <StaffDashboard />,
      },
      {
        path: "uat-agent",
        element: <UatAgentPage />,
      },
      {
        path: "uat-agent/local-setup",
        element: <LocalSetupPage />,
      },
      {
        path: "uat-agent/releases/:releaseId",
        element: <ReleaseReviewPage />,
      },
    ],
  },
  {
    path: "*",
    element: <NotFound />,
  },
];

export default routes;