import { lazy, Suspense, useEffect } from 'react';
import { createBrowserRouter, Navigate, Outlet, RouterProvider } from 'react-router';
import { AppShell } from '@/components/shell/AppShell';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { FolderPage } from '@/pages/FolderPage';
import { LoginPage, RegisterPage } from '@/pages/AuthPages';
import { loadAppInfo, loadSession, preferredSpaceId, useStore } from '@/store/store';

const ArchivePage = lazy(() => import('@/pages/ArchivePage').then((m) => ({ default: m.ArchivePage })));
const TrashPage = lazy(() => import('@/pages/TrashPage').then((m) => ({ default: m.TrashPage })));

function Splash() {
  return (
    <div className="flex min-h-svh items-center justify-center">
      <img src="/logo.svg" alt="" className="size-10 animate-pulse" />
    </div>
  );
}

// Signed-in pages; everyone else goes to the sign-in page.
function RequireAuth() {
  const status = useStore((state) => state.authStatus);
  if (status === 'loading') return <Splash />;
  if (status === 'signedOut') return <Navigate to="/login" replace />;
  return <Outlet />;
}

function GuestOnly() {
  const status = useStore((state) => state.authStatus);
  if (status === 'loading') return <Splash />;
  if (status === 'signedIn') return <Navigate to="/" replace />;
  return <Outlet />;
}

function Home() {
  const spaceId = useStore((state) => (state.spaces.length ? preferredSpaceId() : null));
  return spaceId ? <Navigate to={`/s/${spaceId}`} replace /> : <Splash />;
}

const router = createBrowserRouter([
  {
    element: <GuestOnly />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/register', element: <RegisterPage /> },
    ],
  },
  {
    element: <RequireAuth />,
    children: [
      { path: '/', element: <Home /> },
      {
        path: '/s/:spaceId',
        element: <AppShell />,
        children: [
          { index: true, element: <FolderPage /> },
          { path: 'f/:folderId', element: <FolderPage /> },
          {
            path: 'archive',
            element: (
              <Suspense>
                <ArchivePage />
              </Suspense>
            ),
          },
          {
            path: 'trash',
            element: (
              <Suspense>
                <TrashPage />
              </Suspense>
            ),
          },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);

export function App() {
  useEffect(() => {
    void loadAppInfo();
    void loadSession();
  }, []);

  return (
    <TooltipProvider delayDuration={400}>
      <RouterProvider router={router} />
      <Toaster position="bottom-center" />
    </TooltipProvider>
  );
}
