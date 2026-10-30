import { lazy, Suspense, useEffect } from 'react';
import { createBrowserRouter, Navigate, Outlet, RouterProvider, useLocation } from 'react-router';
import { AppShell } from '@/components/shell/AppShell';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { FolderPage } from '@/pages/FolderPage';
import { LoginPage, RegisterPage } from '@/pages/AuthPages';
import { loadAppInfo, loadSession, preferredSpaceId, useStore } from '@/store/store';

const ArchivePage = lazy(() => import('@/pages/ArchivePage').then((m) => ({ default: m.ArchivePage })));
const ItemPage = lazy(() => import('@/pages/ItemPage').then((m) => ({ default: m.ItemPage })));
const ConnectExtensionPage = lazy(() =>
  import('@/pages/ConnectExtensionPage').then((m) => ({ default: m.ConnectExtensionPage }))
);
const PresentPage = lazy(() => import('@/pages/PresentPage').then((m) => ({ default: m.PresentPage })));
const PublicPage = lazy(() => import('@/pages/PublicPage').then((m) => ({ default: m.PublicPage })));
const StyleguidePage = lazy(() => import('@/pages/StyleguidePage').then((m) => ({ default: m.StyleguidePage })));
const TrashPage = lazy(() => import('@/pages/TrashPage').then((m) => ({ default: m.TrashPage })));

function Splash() {
  return (
    <div className="flex min-h-svh items-center justify-center">
      <img src="/logo.svg" alt="" className="size-10 animate-pulse" />
    </div>
  );
}

// Where to go after signing in, when a signed-out visit was sent to the sign-in page.
const NEXT_KEY = 'linkr-next';

// Signed-in pages; everyone else goes to the sign-in page, and comes back here afterwards.
function RequireAuth() {
  const status = useStore((state) => state.authStatus);
  const location = useLocation();
  if (status === 'loading') return <Splash />;
  if (status === 'signedOut') {
    if (location.pathname !== '/') {
      try {
        sessionStorage.setItem(NEXT_KEY, location.pathname + location.search);
      } catch {
        // storage blocked: land on the home page instead
      }
    }
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
}

function GuestOnly() {
  const status = useStore((state) => state.authStatus);
  if (status === 'loading') return <Splash />;
  if (status === 'signedIn') {
    let next = '/';
    try {
      next = sessionStorage.getItem(NEXT_KEY) ?? '/';
      sessionStorage.removeItem(NEXT_KEY);
    } catch {
      // storage blocked
    }
    return <Navigate to={next.startsWith('/') && !next.startsWith('//') ? next : '/'} replace />;
  }
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
        path: '/connect-extension',
        element: (
          <Suspense>
            <ConnectExtensionPage />
          </Suspense>
        ),
      },
      {
        path: '/s/:spaceId',
        element: <AppShell />,
        children: [
          { index: true, element: <FolderPage /> },
          { path: 'f/:folderId', element: <FolderPage /> },
          {
            path: 'i/:itemId',
            element: (
              <Suspense>
                <ItemPage />
              </Suspense>
            ),
          },
          {
            path: 'present/:folderId',
            element: (
              <Suspense>
                <PresentPage />
              </Suspense>
            ),
          },
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
  // The design system, live (design/README.md is the written guide). No sign-in, no data.
  {
    path: '/styleguide',
    element: (
      <Suspense>
        <StyleguidePage />
      </Suspense>
    ),
  },
  // Folders shared with a link: no sign-in.
  {
    path: '/p/:token',
    element: (
      <Suspense>
        <PublicPage />
      </Suspense>
    ),
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
